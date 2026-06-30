import { initializeApp } from "firebase-admin/app";
import {
  FieldValue,
  Timestamp,
  getFirestore,
  type DocumentData,
} from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/https";
import {
  BOX_ROWS,
  BOX_COLS,
  TURN_DURATION_SECONDS,
  assertValidLine,
  createInitialBoxes,
  createInitialLines,
  getCompletedBoxes,
  getNextActivePlayer,
  lineId,
  type LineOrientation,
  type ServerBox,
  type ServerLine,
  type ServerPlayer,
} from "./gameRules";

initializeApp();

type AuthType = "anonymous" | "signed";
type PlayerCount = 2 | 3 | 4;
type QueueName =
  | "anon_2p"
  | "anon_3p"
  | "anon_4p"
  | "signed_2p"
  | "signed_3p"
  | "signed_4p";

type JoinQueueInput = {
  authType: AuthType;
  requestedPlayerCount: PlayerCount;
  displayName: string;
};

type CancelQueueInput = {
  queueId: string;
};

type CreateMatchInput = {
  authType: AuthType;
  requestedPlayerCount: PlayerCount;
};

type SubmitMoveInput = {
  gameId: string;
  orientation: LineOrientation;
  row: number;
  col: number;
};

const db = getFirestore();
const playerColors = ["#C5B0F4", "#DCEEB1", "#F4ECD6", "#EFD4D4"];

export const joinQueue = onCall<JoinQueueInput>(async (request) => {
  const input = request.data;
  validateJoinQueueInput(input);
  const uid = requireUid(request.auth?.uid);
  const isAnonymous = isAnonymousAuth(request.auth?.token.firebase?.sign_in_provider);
  assertQueueAuth(input.authType, isAnonymous);

  const queueName = toQueueName(input.authType, input.requestedPlayerCount);
  const queueRef = db.collection("matchmakingQueue").doc();

  await queueRef.set({
    queueEntryId: queueRef.id,
    queueName,
    authType: input.authType,
    requestedPlayerCount: input.requestedPlayerCount,
    userId: input.authType === "signed" ? uid : null,
    guestId: input.authType === "anonymous" ? uid : null,
    displayName: input.displayName,
    status: "queued",
    joinedAt: FieldValue.serverTimestamp(),
  });

  return {
    queueId: queueRef.id,
    queueName,
    status: "queued" as const,
  };
});

export const cancelQueue = onCall<CancelQueueInput>(async (request) => {
  const { queueId } = request.data;
  if (!queueId) throw new HttpsError("invalid-argument", "queueId is required.");
  const uid = requireUid(request.auth?.uid);

  const queueRef = db.collection("matchmakingQueue").doc(queueId);
  const snapshot = await queueRef.get();
  if (!snapshot.exists) return { status: "cancelled" as const };

  const queue = snapshot.data();
  if (queue?.userId !== uid && queue?.guestId !== uid) {
    throw new HttpsError("permission-denied", "Queue entry does not belong to this user.");
  }
  if (queue?.status === "matched") {
    throw new HttpsError("failed-precondition", "Matched queue entries cannot be cancelled.");
  }

  await queueRef.update({
    status: "cancelled",
    cancelledAt: FieldValue.serverTimestamp(),
  });

  return { status: "cancelled" as const };
});

export const createMatchIfReady = onCall<CreateMatchInput>(async (request) => {
  const input = request.data;
  validateJoinQueueInput({
    authType: input.authType,
    requestedPlayerCount: input.requestedPlayerCount,
    displayName: "matchmaker",
  });
  requireUid(request.auth?.uid);
  const queueName = toQueueName(input.authType, input.requestedPlayerCount);

  const waitingSnapshot = await db
    .collection("matchmakingQueue")
    .where("queueName", "==", queueName)
    .where("status", "==", "queued")
    .orderBy("joinedAt", "asc")
    .limit(input.requestedPlayerCount)
    .get();

  if (waitingSnapshot.size < input.requestedPlayerCount) {
    return { status: "queued" as const, queueName };
  }

  const selectedQueueDocs = waitingSnapshot.docs;
  const gameRef = db.collection("games").doc();
  const startedAt = Timestamp.now();
  const turnDeadlineAt = Timestamp.fromMillis(
    startedAt.toMillis() + TURN_DURATION_SECONDS * 1000,
  );
  const selectedPlayers = selectedQueueDocs.map((doc, index) =>
    queueDocToPlayer(doc.id, doc.data(), index),
  );
  const firstPlayer = selectedPlayers[0];

  const batch = db.batch();
  batch.set(gameRef, {
    gameId: gameRef.id,
    status: "active",
    playerType: input.authType,
    playerCount: input.requestedPlayerCount,
    currentTurnPlayerId: firstPlayer.playerId,
    turnIndex: 0,
    turnStartedAt: startedAt,
    turnDeadlineAt,
    winnerPlayerIds: [],
    createdAt: FieldValue.serverTimestamp(),
    startedAt,
    completedAt: null,
  });

  for (const player of selectedPlayers) {
    batch.set(gameRef.collection("players").doc(player.playerId), player);
  }
  for (const line of createInitialLines()) {
    batch.set(gameRef.collection("lines").doc(line.lineId), line);
  }
  for (const box of createInitialBoxes()) {
    batch.set(gameRef.collection("boxes").doc(box.boxId), box);
  }
  for (const queueDoc of selectedQueueDocs) {
    batch.update(queueDoc.ref, {
      status: "matched",
      gameId: gameRef.id,
      matchedAt: FieldValue.serverTimestamp(),
    });
  }

  await batch.commit();
  return { status: "matched" as const, gameId: gameRef.id, queueName };
});

export const submitMove = onCall<SubmitMoveInput>(async (request) => {
  const input = request.data;
  const uid = requireUid(request.auth?.uid);

  if (!input.gameId) throw new HttpsError("invalid-argument", "gameId is required.");
  if (!assertValidLine(input.orientation, input.row, input.col)) {
    throw new HttpsError("invalid-argument", "Line coordinates are outside the board.");
  }

  const gameRef = db.collection("games").doc(input.gameId);
  const result = await db.runTransaction(async (transaction) => {
    const gameSnapshot = await transaction.get(gameRef);
    if (!gameSnapshot.exists) throw new HttpsError("not-found", "Game not found.");
    const game = gameSnapshot.data()!;
    if (game.status !== "active") {
      throw new HttpsError("failed-precondition", "Game is not active.");
    }

    const playerSnapshots = await transaction.get(gameRef.collection("players"));
    const players = playerSnapshots.docs.map((doc) => doc.data() as ServerPlayer & DocumentData);
    const currentPlayer = players.find((player) => player.playerId === game.currentTurnPlayerId);
    if (!currentPlayer) throw new HttpsError("failed-precondition", "Current player missing.");

    if (!playerBelongsToUid(currentPlayer, uid)) {
      throw new HttpsError("permission-denied", "It is not your turn.");
    }
    if (Date.now() > game.turnDeadlineAt.toMillis()) {
      throw new HttpsError("deadline-exceeded", "Turn timer has expired.");
    }

    const targetLineId = lineId(input.orientation, input.row, input.col);
    const lineRef = gameRef.collection("lines").doc(targetLineId);
    const lineSnapshot = await transaction.get(lineRef);
    if (!lineSnapshot.exists) throw new HttpsError("not-found", "Line not found.");
    const line = lineSnapshot.data() as ServerLine;
    if (line.ownerPlayerId) {
      throw new HttpsError("already-exists", "Line has already been drawn.");
    }

    const lineSnapshots = await transaction.get(gameRef.collection("lines"));
    const boxSnapshots = await transaction.get(gameRef.collection("boxes"));
    const lines = new Map(
      lineSnapshots.docs.map((doc) => [doc.id, doc.data() as ServerLine]),
    );
    const boxes = new Map(
      boxSnapshots.docs.map((doc) => [doc.id, doc.data() as ServerBox]),
    );
    lines.set(targetLineId, { ...line, ownerPlayerId: currentPlayer.playerId });

    const completedBoxIds = getCompletedBoxes(
      input.orientation,
      input.row,
      input.col,
      lines,
      boxes,
    );
    const nextTurnPlayerId =
      completedBoxIds.length > 0
        ? currentPlayer.playerId
        : getNextActivePlayer(players, currentPlayer.playerId);
    const now = Timestamp.now();
    const turnDeadlineAt = Timestamp.fromMillis(
      now.toMillis() + TURN_DURATION_SECONDS * 1000,
    );
    const moveRef = gameRef.collection("moves").doc();

    transaction.update(lineRef, {
      ownerPlayerId: currentPlayer.playerId,
      drawnAt: now,
    });
    for (const completedBoxId of completedBoxIds) {
      transaction.update(gameRef.collection("boxes").doc(completedBoxId), {
        ownerPlayerId: currentPlayer.playerId,
        completedAt: now,
      });
    }
    transaction.update(gameRef.collection("players").doc(currentPlayer.playerId), {
      score: FieldValue.increment(completedBoxIds.length),
      consecutiveSkips: 0,
      connectionStatus: "connected",
    });
    transaction.set(moveRef, {
      moveId: moveRef.id,
      gameId: input.gameId,
      playerId: currentPlayer.playerId,
      orientation: input.orientation,
      row: input.row,
      col: input.col,
      completedBoxIds,
      createdAt: now,
    });

    const capturedBoxCount =
      boxSnapshots.docs.filter((doc) => doc.data().ownerPlayerId).length +
      completedBoxIds.length;
    const gameComplete = capturedBoxCount >= BOX_ROWS * BOX_COLS;
    transaction.update(gameRef, {
      currentTurnPlayerId: nextTurnPlayerId,
      turnIndex: FieldValue.increment(1),
      turnStartedAt: now,
      turnDeadlineAt,
      ...(gameComplete
        ? {
            status: "completed",
            completedAt: now,
            winnerPlayerIds: calculateWinnerIds(players, currentPlayer.playerId, completedBoxIds.length),
          }
        : {}),
    });

    return { completedBoxIds, status: gameComplete ? "completed" : "active" };
  });

  return result;
});

function validateJoinQueueInput(input: JoinQueueInput) {
  if (input.authType !== "anonymous" && input.authType !== "signed") {
    throw new HttpsError("invalid-argument", "Invalid authType.");
  }
  if (![2, 3, 4].includes(input.requestedPlayerCount)) {
    throw new HttpsError("invalid-argument", "Invalid requestedPlayerCount.");
  }
  if (!input.displayName || input.displayName.length > 80) {
    throw new HttpsError("invalid-argument", "Invalid displayName.");
  }
}

function requireUid(uid: string | undefined) {
  if (!uid) throw new HttpsError("unauthenticated", "You must be signed in.");
  return uid;
}

function isAnonymousAuth(provider: unknown) {
  return provider === "anonymous";
}

function assertQueueAuth(authType: AuthType, isAnonymous: boolean) {
  if (authType === "anonymous" && !isAnonymous) {
    throw new HttpsError("failed-precondition", "Signed users cannot join anonymous queues.");
  }
  if (authType === "signed" && isAnonymous) {
    throw new HttpsError("failed-precondition", "Anonymous users cannot join signed queues.");
  }
}

function toQueueName(authType: AuthType, playerCount: PlayerCount): QueueName {
  const prefix = authType === "signed" ? "signed" : "anon";
  return `${prefix}_${playerCount}p` as QueueName;
}

function queueDocToPlayer(
  queueEntryId: string,
  queue: DocumentData,
  index: number,
) {
  return {
    playerId: queue.userId ?? queue.guestId,
    userId: queue.userId ?? null,
    guestId: queue.guestId ?? null,
    displayName: queue.displayName,
    avatarUrl: null,
    color: playerColors[index],
    score: 0,
    isAnonymous: queue.authType === "anonymous",
    connectionStatus: "connected",
    consecutiveSkips: 0,
    turnOrder: index,
    queueEntryId,
  };
}

function playerBelongsToUid(player: DocumentData, uid: string) {
  return player.userId === uid || player.guestId === uid || player.playerId === uid;
}

function calculateWinnerIds(
  players: (ServerPlayer & DocumentData)[],
  scoringPlayerId: string,
  gainedBoxes: number,
) {
  const scores = players.map((player) => ({
    playerId: player.playerId,
    score: player.score + (player.playerId === scoringPlayerId ? gainedBoxes : 0),
  }));
  const highScore = Math.max(...scores.map((score) => score.score));
  return scores
    .filter((score) => score.score === highScore)
    .map((score) => score.playerId);
}
