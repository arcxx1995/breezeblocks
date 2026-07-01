import { initializeApp } from "firebase-admin/app";
import {
  FieldValue,
  Timestamp,
  getFirestore,
  type DocumentReference,
  type DocumentData,
  type QueryDocumentSnapshot,
  type DocumentSnapshot,
  type Transaction,
} from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/https";
import {
  BOX_ROWS,
  BOX_COLS,
  TURN_DURATION_SECONDS,
  assertValidLine,
  createInitialBoxOwners,
  createInitialLineOwners,
  getAdjacentBoxIds,
  getNextActivePlayer,
  isBoxComplete,
  lineId,
  type BoxOwners,
  type LineOwners,
  type LineOrientation,
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
  allowBots?: boolean;
  rematchWithUid?: string;
};

type CancelQueueInput = {
  queueId: string;
};

type SubmitMoveInput = {
  gameId: string;
  orientation: LineOrientation;
  row: number;
  col: number;
};

type ClaimTimeoutSkipInput = {
  gameId: string;
};

type ClaimBotMoveInput = {
  gameId: string;
};

type EnsureProfileInput = {
  displayName: string;
  avatarUrl?: string | null;
};

type ClaimDailyLoginInput = Record<string, never>;

type UnlockThemeInput = {
  themeId: string;
};

type SelectThemeInput = {
  themeId: string;
};

type SignedServerPlayer = ServerPlayer & DocumentData & {
  userId: string;
};

const db = getFirestore();
const playerColors = ["#C5B0F4", "#DCEEB1", "#F4ECD6", "#EFD4D4"];
const staleQueueAgeMillis = 2 * 60 * 1000;
const matchedQueueReconnectMillis = 2 * 60 * 1000;
const matchmakingQueryLimit = 12;
const profileLastSeenUpdateIntervalMillis = 60 * 60 * 1000;
const queueTtlMillis = 24 * 60 * 60 * 1000;
const anonymousGameTtlMillis = 7 * 24 * 60 * 60 * 1000;
const signedGameTtlMillis = 90 * 24 * 60 * 60 * 1000;
const botMoveDelayMillis = 700;
const dailyLoginRewards = [10, 15, 20, 25, 30, 40, 50];
const minClaimGapMillis = 20 * 60 * 60 * 1000;
const streakResetGapMillis = 48 * 60 * 60 * 1000;
const completionBaseSparks = 5;
const winBonusSparks = 10;
const sparksPerBoxWon = 1;
const defaultThemeId = "classic";
const themeCatalog: Record<string, { priceSparks: number }> = {
  classic: { priceSparks: 0 },
  "lilac-bloom": { priceSparks: 50 },
  "citrus-lime": { priceSparks: 50 },
  "cream-soda": { priceSparks: 75 },
  "blush-coral": { priceSparks: 75 },
  sherbet: { priceSparks: 100 },
};
const allQueueNames: QueueName[] = [
  "anon_2p",
  "anon_3p",
  "anon_4p",
  "signed_2p",
  "signed_3p",
  "signed_4p",
];
const callableOptions = {
  region: "us-central1",
  memory: "256MiB" as const,
  timeoutSeconds: 30,
  maxInstances: 5,
};

export const joinQueue = onCall<JoinQueueInput>(callableOptions, async (request) => {
  const input = request.data;
  validateJoinQueueInput(input);
  const uid = requireUid(request.auth?.uid);
  const isAnonymous = isAnonymousAuth(request.auth?.token.firebase?.sign_in_provider);
  assertQueueAuth(input.authType, isAnonymous);

  const queueName = toQueueName(input.authType, input.requestedPlayerCount);
  const queueRef = db.collection("matchmakingQueue").doc(`${queueName}_${uid}`);

  const result = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(queueRef);
    const waitingSnapshot = await transaction.get(
      db
        .collection("matchmakingQueue")
        .where("queueName", "==", queueName)
        .where("status", "==", "queued")
        .orderBy("joinedAt", "asc")
        .limit(matchmakingQueryLimit),
    );
    const now = Timestamp.now();
    await assertNoConflictingQueue(transaction, uid, queueName);
    if (snapshot.exists) {
      const queue = snapshot.data();
      const isFreshQueue =
        queue?.status === "queued" &&
        now.toMillis() - toMillis(queue.joinedAt) < staleQueueAgeMillis;
      if (queue?.status === "matched") {
        const gameId = typeof queue.gameId === "string" ? queue.gameId : null;
        const matchedAtMillis = toMillis(queue.matchedAt);
        const isRecentMatch =
          Boolean(gameId) &&
          matchedAtMillis > 0 &&
          now.toMillis() - matchedAtMillis < matchedQueueReconnectMillis;

        if (gameId && isRecentMatch) {
          const gameSnapshot = await transaction.get(db.collection("games").doc(gameId));
          const game = gameSnapshot.data();
          const playerIds = Array.isArray(game?.playerIds) ? game.playerIds : [];
          if (
            gameSnapshot.exists &&
            game?.status === "active" &&
            playerIds.includes(uid)
          ) {
            return {
              queueId: queueRef.id,
              queueName,
              status: queue.status as "queued" | "matched",
              gameId,
            };
          }
        }
      }
      if (isFreshQueue) {
        return attemptCreateMatchInTransaction({
          transaction,
          waitingDocs: waitingSnapshot.docs,
          queueName,
          requestedPlayerCount: input.requestedPlayerCount,
          now,
          requesterQueueRef: queueRef,
          requesterQueueData: {
            ...queue,
            restrictedToUid: input.rematchWithUid ?? null,
            updatedAt: now,
          },
          allowBots: input.allowBots === true,
        });
      }
    }

    const queueData = {
      queueEntryId: queueRef.id,
      queueName,
      authType: input.authType,
      requestedPlayerCount: input.requestedPlayerCount,
      userId: input.authType === "signed" ? uid : null,
      guestId: input.authType === "anonymous" ? uid : null,
      displayName: input.displayName,
      status: "queued",
      joinedAt: now,
      updatedAt: now,
      restrictedToUid: input.rematchWithUid ?? null,
      expireAt: Timestamp.fromMillis(now.toMillis() + queueTtlMillis),
    };

    return attemptCreateMatchInTransaction({
      transaction,
      waitingDocs: waitingSnapshot.docs,
      queueName,
      requestedPlayerCount: input.requestedPlayerCount,
      now,
      requesterQueueRef: queueRef,
      requesterQueueData: queueData,
      allowBots: input.allowBots === true,
    });
  });

  return result;
});

export const cancelQueue = onCall<CancelQueueInput>(callableOptions, async (request) => {
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
    expireAt: Timestamp.fromMillis(Date.now() + queueTtlMillis),
  });

  return { status: "cancelled" as const };
});

export const submitMove = onCall<SubmitMoveInput>(callableOptions, async (request) => {
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

    const players = normalizeGamePlayers(game.players);
    const currentPlayerIndex = players.findIndex(
      (player) => player.playerId === game.currentTurnPlayerId,
    );
    const currentPlayer = players[currentPlayerIndex];
    if (!currentPlayer) throw new HttpsError("failed-precondition", "Current player missing.");

    if (!playerBelongsToUid(currentPlayer, uid)) {
      throw new HttpsError("permission-denied", "It is not your turn.");
    }
    if (Date.now() > toMillis(game.turnDeadlineAt)) {
      throw new HttpsError("deadline-exceeded", "Turn timer has expired.");
    }

    const targetLineId = lineId(input.orientation, input.row, input.col);
    const lineOwners = normalizeLineOwners(game.lineOwners);
    const boxOwners = normalizeBoxOwners(game.boxOwners);
    if (!(targetLineId in lineOwners)) {
      throw new HttpsError("not-found", "Line not found.");
    }
    if (lineOwners[targetLineId] != null) {
      throw new HttpsError("already-exists", "Line has already been drawn.");
    }

    return applyMoveInTransaction({
      transaction,
      gameRef,
      game,
      players,
      currentPlayer,
      currentPlayerIndex,
      lineOwners,
      boxOwners,
      orientation: input.orientation,
      row: input.row,
      col: input.col,
      movedAt: Timestamp.now(),
    });
  });

  return result;
});

export const claimTimeoutSkip = onCall<ClaimTimeoutSkipInput>(callableOptions, async (request) => {
  const { gameId } = request.data;
  const uid = requireUid(request.auth?.uid);
  if (!gameId) throw new HttpsError("invalid-argument", "gameId is required.");

  const gameRef = db.collection("games").doc(gameId);
  const result = await db.runTransaction(async (transaction) => {
    const gameSnapshot = await transaction.get(gameRef);
    if (!gameSnapshot.exists) throw new HttpsError("not-found", "Game not found.");
    const game = gameSnapshot.data()!;
    if (game.status !== "active") {
      throw new HttpsError("failed-precondition", "Game is not active.");
    }
    if (Date.now() <= toMillis(game.turnDeadlineAt)) {
      throw new HttpsError("failed-precondition", "Turn timer has not expired.");
    }

    const players = normalizeGamePlayers(game.players);
    const requester = players.find((player) => playerBelongsToUid(player, uid));
    if (!requester) {
      throw new HttpsError("permission-denied", "You are not a player in this game.");
    }

    const skippedPlayer = players.find(
      (player) => player.playerId === game.currentTurnPlayerId,
    );
    if (!skippedPlayer) {
      throw new HttpsError("failed-precondition", "Current player missing.");
    }
    if (requester.playerId === skippedPlayer.playerId) {
      throw new HttpsError("failed-precondition", "The timed-out player cannot claim their own skip.");
    }

    const now = Timestamp.now();
    const nextSkipCount = Number(skippedPlayer.consecutiveSkips ?? 0) + 1;
    const nextConnectionStatus =
      nextSkipCount >= 3 ? "inactive" : skippedPlayer.connectionStatus;
    const playersAfterSkip = players.map((player) =>
      player.playerId === skippedPlayer.playerId
        ? {
            ...player,
            consecutiveSkips: nextSkipCount,
            connectionStatus: nextConnectionStatus,
          }
        : player,
    );
    const nextPlayerId = getNextActivePlayer(playersAfterSkip, skippedPlayer.playerId);

    if (nextPlayerId === null) {
      const winnerPlayerIds = calculateWinnerIds(playersAfterSkip);
      const signedPlayers = playersAfterSkip.filter(isSignedServerPlayer);
      const signedUserSnapshots = await Promise.all(
        signedPlayers.map((player) => transaction.get(db.collection("users").doc(player.userId))),
      );
      transaction.update(gameRef, {
        players: playersAfterSkip,
        status: "completed",
        completedAt: now,
        winnerPlayerIds,
        expireAt: Timestamp.fromMillis(
          now.toMillis() +
            (game.playerType === "anonymous" ? anonymousGameTtlMillis : signedGameTtlMillis),
        ),
      });
      writeSignedPlayerCompletionStats(
        transaction,
        gameRef.id,
        playersAfterSkip,
        signedPlayers,
        signedUserSnapshots,
        winnerPlayerIds,
        now,
      );
      return {
        status: "completed" as const,
        skippedPlayerId: skippedPlayer.playerId,
        nextPlayerId: null,
      };
    }

    const turnDeadlineAt = Timestamp.fromMillis(
      now.toMillis() + TURN_DURATION_SECONDS * 1000,
    );
    transaction.update(gameRef, {
      players: playersAfterSkip,
      currentTurnPlayerId: nextPlayerId,
      turnIndex: FieldValue.increment(1),
      turnStartedAt: now,
      turnDeadlineAt,
    });

    return {
      status: "skipped" as const,
      skippedPlayerId: skippedPlayer.playerId,
      nextPlayerId,
    };
  });

  return result;
});

export const claimBotMove = onCall<ClaimBotMoveInput>(callableOptions, async (request) => {
  const { gameId } = request.data;
  const uid = requireUid(request.auth?.uid);
  if (!gameId) throw new HttpsError("invalid-argument", "gameId is required.");

  const gameRef = db.collection("games").doc(gameId);
  const result = await db.runTransaction(async (transaction) => {
    const gameSnapshot = await transaction.get(gameRef);
    if (!gameSnapshot.exists) throw new HttpsError("not-found", "Game not found.");
    const game = gameSnapshot.data()!;
    if (game.status !== "active") {
      throw new HttpsError("failed-precondition", "Game is not active.");
    }
    if (Date.now() - toMillis(game.turnStartedAt) < botMoveDelayMillis) {
      throw new HttpsError("failed-precondition", "Bot is still thinking.");
    }

    const players = normalizeGamePlayers(game.players);
    const requester = players.find((player) => playerBelongsToUid(player, uid));
    if (!requester || requester.isBot) {
      throw new HttpsError("permission-denied", "Only a human player in this game can move the bot.");
    }

    const currentPlayerIndex = players.findIndex(
      (player) => player.playerId === game.currentTurnPlayerId,
    );
    const currentPlayer = players[currentPlayerIndex];
    if (!currentPlayer?.isBot) {
      throw new HttpsError("failed-precondition", "It is not a bot turn.");
    }

    const lineOwners = normalizeLineOwners(game.lineOwners);
    const boxOwners = normalizeBoxOwners(game.boxOwners);
    const botLine = chooseBotLine(lineOwners, boxOwners);
    if (!botLine) {
      throw new HttpsError("failed-precondition", "No bot moves are available.");
    }

    return applyMoveInTransaction({
      transaction,
      gameRef,
      game,
      players,
      currentPlayer,
      currentPlayerIndex,
      lineOwners,
      boxOwners,
      orientation: botLine.orientation,
      row: botLine.row,
      col: botLine.col,
      movedAt: Timestamp.now(),
    });
  });

  return result;
});

function createBotPlayer(index: number) {
  return {
    playerId: `bot_${index + 1}`,
    userId: null,
    guestId: null,
    displayName: ["Breeze Bot", "Dot Bot", "Line Bot"][index - 1] ?? "Box Bot",
    avatarUrl: null,
    color: playerColors[index],
    score: 0,
    isAnonymous: true,
    isBot: true,
    connectionStatus: "connected",
    consecutiveSkips: 0,
    turnOrder: index,
    queueEntryId: `bot_${index + 1}`,
  };
}

export const ensureSignedProfile = onCall<EnsureProfileInput>(callableOptions, async (request) => {
  const uid = requireUid(request.auth?.uid);
  const isAnonymous = isAnonymousAuth(request.auth?.token.firebase?.sign_in_provider);
  if (isAnonymous) {
    throw new HttpsError("failed-precondition", "Anonymous players do not get permanent profiles.");
  }

  const displayName = request.data.displayName || "Breezeblocks Player";
  if (displayName.length > 80) {
    throw new HttpsError("invalid-argument", "Invalid displayName.");
  }

  const userRef = db.collection("users").doc(uid);
  const snapshot = await userRef.get();
  const now = Timestamp.now();
  if (snapshot.exists) {
    const profile = snapshot.data();
    const lastSeenAt = toMillis(profile?.lastSeenAt);
    const profileChanged =
      profile?.displayName !== displayName ||
      (profile?.avatarUrl ?? null) !== (request.data.avatarUrl ?? null);
    const shouldRefreshLastSeen =
      now.toMillis() - lastSeenAt >= profileLastSeenUpdateIntervalMillis;

    if (profileChanged || shouldRefreshLastSeen) {
      await userRef.update({
        displayName,
        avatarUrl: request.data.avatarUrl ?? null,
        ...(shouldRefreshLastSeen ? { lastSeenAt: now } : {}),
        updatedAt: now,
      });
    }
    return { status: "ready" as const };
  }

  try {
    await userRef.create({
      userId: uid,
      authProvider: "google",
      displayName,
      avatarUrl: request.data.avatarUrl ?? null,
      totalWins: 0,
      totalLosses: 0,
      totalDraws: 0,
      totalGamesPlayed: 0,
      totalBoxesWon: 0,
      highestBoxesSingleGame: 0,
      isPremium: false,
      sparks: 0,
      unlockedThemes: [defaultThemeId],
      activeThemeId: defaultThemeId,
      loginStreak: 0,
      lastLoginClaimAt: null,
      createdAt: now,
      updatedAt: now,
      lastSeenAt: now,
    });
  } catch (error) {
    if (!isAlreadyExistsError(error)) throw error;
  }

  return { status: "ready" as const };
});

export const claimDailyLogin = onCall<ClaimDailyLoginInput>(callableOptions, async (request) => {
  const uid = requireUid(request.auth?.uid);
  const isAnonymous = isAnonymousAuth(request.auth?.token.firebase?.sign_in_provider);
  if (isAnonymous) {
    throw new HttpsError("failed-precondition", "Anonymous players do not get permanent profiles.");
  }

  const userRef = db.collection("users").doc(uid);
  const result = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(userRef);
    if (!snapshot.exists) {
      throw new HttpsError("failed-precondition", "Profile not found. Sign in again.");
    }

    const profile = snapshot.data()!;
    const now = Timestamp.now();
    const lastClaimMillis = toMillis(profile.lastLoginClaimAt);
    const elapsedMillis = now.toMillis() - lastClaimMillis;

    if (lastClaimMillis > 0 && elapsedMillis < minClaimGapMillis) {
      throw new HttpsError("failed-precondition", "Daily reward already claimed.");
    }

    const previousStreak = Number(profile.loginStreak ?? 0);
    const nextStreak =
      lastClaimMillis > 0 && elapsedMillis <= streakResetGapMillis ? previousStreak + 1 : 1;
    const reward = dailyLoginRewards[(nextStreak - 1) % dailyLoginRewards.length];

    transaction.update(userRef, {
      sparks: FieldValue.increment(reward),
      loginStreak: nextStreak,
      lastLoginClaimAt: now,
      updatedAt: now,
    });

    return {
      reward,
      loginStreak: nextStreak,
      claimedAt: now.toMillis(),
    };
  });

  return result;
});

export const unlockTheme = onCall<UnlockThemeInput>(callableOptions, async (request) => {
  const uid = requireUid(request.auth?.uid);
  const isAnonymous = isAnonymousAuth(request.auth?.token.firebase?.sign_in_provider);
  if (isAnonymous) {
    throw new HttpsError("failed-precondition", "Anonymous players do not get permanent profiles.");
  }

  const themeId = request.data.themeId;
  const catalogEntry = themeCatalog[themeId];
  if (!catalogEntry) {
    throw new HttpsError("invalid-argument", "Unknown themeId.");
  }

  const userRef = db.collection("users").doc(uid);
  const result = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(userRef);
    if (!snapshot.exists) {
      throw new HttpsError("failed-precondition", "Profile not found. Sign in again.");
    }

    const profile = snapshot.data()!;
    const unlockedThemes = normalizeUnlockedThemes(profile.unlockedThemes);
    if (unlockedThemes.includes(themeId)) {
      throw new HttpsError("already-exists", "Theme already unlocked.");
    }

    const sparks = Number(profile.sparks ?? 0);
    if (sparks < catalogEntry.priceSparks) {
      throw new HttpsError("failed-precondition", "Not enough Sparks.");
    }

    transaction.update(userRef, {
      sparks: FieldValue.increment(-catalogEntry.priceSparks),
      unlockedThemes: FieldValue.arrayUnion(themeId),
      activeThemeId: themeId,
      updatedAt: Timestamp.now(),
    });

    return {
      themeId,
      spentSparks: catalogEntry.priceSparks,
      remainingSparks: sparks - catalogEntry.priceSparks,
    };
  });

  return result;
});

export const selectTheme = onCall<SelectThemeInput>(callableOptions, async (request) => {
  const uid = requireUid(request.auth?.uid);
  const isAnonymous = isAnonymousAuth(request.auth?.token.firebase?.sign_in_provider);
  if (isAnonymous) {
    throw new HttpsError("failed-precondition", "Anonymous players do not get permanent profiles.");
  }

  const themeId = request.data.themeId;
  if (!themeCatalog[themeId]) {
    throw new HttpsError("invalid-argument", "Unknown themeId.");
  }

  const userRef = db.collection("users").doc(uid);
  const result = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(userRef);
    if (!snapshot.exists) {
      throw new HttpsError("failed-precondition", "Profile not found. Sign in again.");
    }

    const profile = snapshot.data()!;
    const unlockedThemes = normalizeUnlockedThemes(profile.unlockedThemes);
    if (!unlockedThemes.includes(themeId)) {
      throw new HttpsError("permission-denied", "Theme not unlocked.");
    }

    transaction.update(userRef, {
      activeThemeId: themeId,
      updatedAt: Timestamp.now(),
    });

    return { themeId };
  });

  return result;
});

function normalizeUnlockedThemes(value: unknown): string[] {
  const unlocked = Array.isArray(value) ? value.filter((id) => typeof id === "string") : [];
  return unlocked.includes(defaultThemeId) ? unlocked : [defaultThemeId, ...unlocked];
}

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
  if (
    input.rematchWithUid !== undefined &&
    (typeof input.rematchWithUid !== "string" || input.rematchWithUid.length > 128)
  ) {
    throw new HttpsError("invalid-argument", "Invalid rematchWithUid.");
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

function isEligiblePairing(
  entryData: DocumentData,
  requesterUid: string | null,
  requesterRestrictedToUid: string | null,
): boolean {
  const entryUid = entryData.userId ?? entryData.guestId ?? null;
  if (entryUid === requesterUid) return true;

  const entryRestrictedToUid = entryData.restrictedToUid ?? null;
  if (entryRestrictedToUid && entryRestrictedToUid !== requesterUid) return false;
  if (requesterRestrictedToUid && entryUid !== requesterRestrictedToUid) return false;
  return true;
}

async function assertNoConflictingQueue(
  transaction: Transaction,
  uid: string,
  queueName: QueueName,
) {
  const otherQueueRefs = allQueueNames
    .filter((name) => name !== queueName)
    .map((name) => db.collection("matchmakingQueue").doc(`${name}_${uid}`));
  const otherSnapshots = await Promise.all(
    otherQueueRefs.map((ref) => transaction.get(ref)),
  );

  for (const otherSnapshot of otherSnapshots) {
    if (!otherSnapshot.exists) continue;
    const otherQueue = otherSnapshot.data();
    if (otherQueue?.status === "queued") {
      throw new HttpsError(
        "failed-precondition",
        "You are already queued in a different match mode. Cancel that queue first.",
      );
    }
    if (otherQueue?.status === "matched") {
      const otherGameId = typeof otherQueue.gameId === "string" ? otherQueue.gameId : null;
      if (!otherGameId) continue;
      const otherGameSnapshot = await transaction.get(db.collection("games").doc(otherGameId));
      if (otherGameSnapshot.exists && otherGameSnapshot.data()?.status === "active") {
        throw new HttpsError(
          "failed-precondition",
          "You already have an active match in a different mode.",
        );
      }
    }
  }
}

function attemptCreateMatchInTransaction({
  transaction,
  waitingDocs,
  queueName,
  requestedPlayerCount,
  now,
  requesterQueueRef,
  requesterQueueData,
  allowBots = false,
}: {
  transaction: Transaction;
  waitingDocs: QueryDocumentSnapshot[];
  queueName: QueueName;
  requestedPlayerCount: PlayerCount;
  now: Timestamp;
  requesterQueueRef?: DocumentReference;
  requesterQueueData?: DocumentData;
  allowBots?: boolean;
}) {
  const cutoffMillis = now.toMillis() - staleQueueAgeMillis;
  const staleQueueDocs = waitingDocs.filter(
    (doc) => toMillis(doc.data().joinedAt) < cutoffMillis,
  );
  const freshWaitingDocs = waitingDocs.filter(
    (doc) => toMillis(doc.data().joinedAt) >= cutoffMillis,
  );

  for (const queueDoc of staleQueueDocs) {
    transaction.update(queueDoc.ref, {
      status: "expired",
      expiredAt: now,
      expireAt: Timestamp.fromMillis(now.toMillis() + queueTtlMillis),
    });
  }

  const requesterUid = requesterQueueData
    ? requesterQueueData.userId ?? requesterQueueData.guestId ?? null
    : null;
  const requesterRestrictedToUid = requesterQueueData?.restrictedToUid ?? null;

  const waitingEntries = freshWaitingDocs
    .filter((doc) => isEligiblePairing(doc.data(), requesterUid, requesterRestrictedToUid))
    .map((doc) => ({
      ref: doc.ref,
      id: doc.id,
      data: doc.data(),
    }));
  const requesterAlreadyWaiting = requesterQueueRef
    ? waitingEntries.some((entry) => entry.ref.path === requesterQueueRef.path)
    : false;

  if (requesterQueueRef && requesterQueueData && !requesterAlreadyWaiting) {
    waitingEntries.push({
      ref: requesterQueueRef,
      id: requesterQueueRef.id,
      data: requesterQueueData,
    });
  }

  waitingEntries.sort((a, b) => toMillis(a.data.joinedAt) - toMillis(b.data.joinedAt));

  if (waitingEntries.length < requestedPlayerCount && !allowBots) {
    if (requesterQueueRef && requesterQueueData && !requesterAlreadyWaiting) {
      transaction.set(requesterQueueRef, requesterQueueData);
    }
    return {
      queueId: requesterQueueRef?.id ?? null,
      queueName,
      status: "queued" as const,
    };
  }

  const selectedQueueEntries =
    allowBots && requesterQueueRef
      ? [
          ...waitingEntries.filter((entry) => entry.ref.path === requesterQueueRef.path),
          ...waitingEntries.filter((entry) => entry.ref.path !== requesterQueueRef.path),
        ].slice(0, requestedPlayerCount)
      : waitingEntries.slice(0, requestedPlayerCount);
  const requesterWasMatched = requesterQueueRef
    ? selectedQueueEntries.some((entry) => entry.ref.path === requesterQueueRef.path)
    : true;

  if (!requesterWasMatched) {
    if (requesterQueueRef && requesterQueueData && !requesterAlreadyWaiting) {
      transaction.set(requesterQueueRef, requesterQueueData);
    }
    return {
      queueId: requesterQueueRef?.id ?? null,
      queueName,
      status: "queued" as const,
    };
  }

  const selectedPlayers = selectedQueueEntries.map((entry, index) =>
    queueDocToPlayer(entry.id, entry.data, index),
  );
  while (allowBots && selectedPlayers.length < requestedPlayerCount) {
    selectedPlayers.push(createBotPlayer(selectedPlayers.length));
  }
  const firstPlayer = selectedPlayers[0];
  const gameRef = db.collection("games").doc();
  const turnDeadlineAt = Timestamp.fromMillis(
    now.toMillis() + TURN_DURATION_SECONDS * 1000,
  );
  const playerType = selectedQueueEntries[0]?.data.authType ?? "anonymous";

  transaction.set(gameRef, {
    gameId: gameRef.id,
    status: "active",
    playerType,
    playerCount: requestedPlayerCount,
    playerIds: selectedPlayers.map((player) => player.playerId),
    players: selectedPlayers,
    lineOwners: createInitialLineOwners(),
    boxOwners: createInitialBoxOwners(),
    capturedBoxCount: 0,
    currentTurnPlayerId: firstPlayer.playerId,
    turnIndex: 0,
    turnStartedAt: now,
    turnDeadlineAt,
    winnerPlayerIds: [],
    createdAt: now,
    startedAt: now,
    completedAt: null,
    expireAt: Timestamp.fromMillis(
      now.toMillis() +
        (playerType === "anonymous" ? anonymousGameTtlMillis : signedGameTtlMillis),
    ),
  });

  for (const entry of selectedQueueEntries) {
    transaction.set(
      entry.ref,
      {
        ...entry.data,
        status: "matched",
        gameId: gameRef.id,
        matchedAt: now,
        expireAt: Timestamp.fromMillis(now.toMillis() + queueTtlMillis),
      },
      { merge: true },
    );
  }

  return {
    queueId: requesterQueueRef?.id ?? null,
    queueName,
    status: "matched" as const,
    gameId: gameRef.id,
  };
}

async function applyMoveInTransaction({
  transaction,
  gameRef,
  game,
  players,
  currentPlayer,
  currentPlayerIndex,
  lineOwners,
  boxOwners,
  orientation,
  row,
  col,
  movedAt,
}: {
  transaction: Transaction;
  gameRef: DocumentReference;
  game: DocumentData;
  players: (ServerPlayer & DocumentData)[];
  currentPlayer: ServerPlayer & DocumentData;
  currentPlayerIndex: number;
  lineOwners: LineOwners;
  boxOwners: BoxOwners;
  orientation: LineOrientation;
  row: number;
  col: number;
  movedAt: Timestamp;
}) {
  const targetLineId = lineId(orientation, row, col);
  const nextLineOwners = {
    ...lineOwners,
    [targetLineId]: currentPlayerIndex,
  };
  const completedBoxIds = getAdjacentBoxIds(orientation, row, col).filter(
    (candidateBoxId) =>
      boxOwners[candidateBoxId] == null &&
      isBoxComplete(candidateBoxId, nextLineOwners),
  );
  const nextTurnPlayerId =
    completedBoxIds.length > 0
      ? currentPlayer.playerId
      : getNextActivePlayer(players, currentPlayer.playerId);
  const turnDeadlineAt = Timestamp.fromMillis(
    movedAt.toMillis() + TURN_DURATION_SECONDS * 1000,
  );
  const capturedBoxCount =
    Number(game.capturedBoxCount ?? countOwnedBoxes(boxOwners)) + completedBoxIds.length;
  const gameComplete = capturedBoxCount >= BOX_ROWS * BOX_COLS || nextTurnPlayerId === null;
  const finalPlayers: (ServerPlayer & DocumentData)[] = players.map((player) => ({
    ...player,
    score:
      player.playerId === currentPlayer.playerId
        ? Number(player.score ?? 0) + completedBoxIds.length
        : Number(player.score ?? 0),
    consecutiveSkips:
      player.playerId === currentPlayer.playerId
        ? 0
        : Number(player.consecutiveSkips ?? 0),
    connectionStatus:
      player.playerId === currentPlayer.playerId
        ? "connected"
        : player.connectionStatus,
  }));
  const winnerPlayerIds = gameComplete ? calculateWinnerIds(finalPlayers) : [];
  const signedPlayers = gameComplete ? finalPlayers.filter(isSignedServerPlayer) : [];
  const signedUserSnapshots = gameComplete
    ? await Promise.all(
        signedPlayers.map((player) =>
          transaction.get(db.collection("users").doc(player.userId)),
        ),
      )
    : [];

  const gameUpdates: Record<string, unknown> = {
    players: finalPlayers,
    [`lineOwners.${targetLineId}`]: currentPlayerIndex,
    capturedBoxCount,
    currentTurnPlayerId: nextTurnPlayerId ?? currentPlayer.playerId,
    turnIndex: FieldValue.increment(1),
    turnStartedAt: movedAt,
    turnDeadlineAt,
  };

  for (const completedBoxId of completedBoxIds) {
    gameUpdates[`boxOwners.${completedBoxId}`] = currentPlayerIndex;
  }

  if (gameComplete) {
    gameUpdates.status = "completed";
    gameUpdates.completedAt = movedAt;
    gameUpdates.winnerPlayerIds = winnerPlayerIds;
    gameUpdates.expireAt = Timestamp.fromMillis(
      movedAt.toMillis() +
        (game.playerType === "anonymous" ? anonymousGameTtlMillis : signedGameTtlMillis),
    );
  }

  transaction.update(gameRef, gameUpdates);

  if (gameComplete) {
    writeSignedPlayerCompletionStats(
      transaction,
      gameRef.id,
      finalPlayers,
      signedPlayers,
      signedUserSnapshots,
      winnerPlayerIds,
      movedAt,
    );
  }

  return { completedBoxIds, status: gameComplete ? "completed" : "active" };
}

function chooseBotLine(lineOwners: LineOwners, boxOwners: BoxOwners) {
  const openLines = Object.entries(lineOwners)
    .filter(([, owner]) => owner == null)
    .map(([id]) => parseLineId(id))
    .filter((line): line is { orientation: LineOrientation; row: number; col: number } =>
      Boolean(line),
    );

  return (
    openLines.find((line) => {
      const nextLineOwners = {
        ...lineOwners,
        [lineId(line.orientation, line.row, line.col)]: 0,
      };
      return getAdjacentBoxIds(line.orientation, line.row, line.col).some(
        (candidateBoxId) =>
          boxOwners[candidateBoxId] == null &&
          isBoxComplete(candidateBoxId, nextLineOwners),
      );
    }) ?? openLines[0]
  );
}

function parseLineId(id: string) {
  const [prefix, rowValue, colValue] = id.split("-");
  const orientation = prefix === "v" ? "vertical" : prefix === "h" ? "horizontal" : null;
  if (!orientation) return null;
  return {
    orientation,
    row: Number(rowValue),
    col: Number(colValue),
  };
}

function normalizeGamePlayers(players: unknown) {
  if (!Array.isArray(players)) {
    throw new HttpsError(
      "failed-precondition",
      "Game state is not compacted. Start a new match.",
    );
  }
  return players.map((player) => player as ServerPlayer & DocumentData);
}

function normalizeLineOwners(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return createInitialLineOwners();
  }
  return value as LineOwners;
}

function normalizeBoxOwners(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return createInitialBoxOwners();
  }
  return value as BoxOwners;
}

function countOwnedBoxes(boxOwners: BoxOwners) {
  return Object.values(boxOwners).filter((owner) => owner != null).length;
}

function playerBelongsToUid(player: DocumentData, uid: string) {
  return player.userId === uid || player.guestId === uid || player.playerId === uid;
}

function toMillis(value: unknown) {
  if (value instanceof Timestamp) return value.toMillis();
  if (typeof value === "number") return value;
  return 0;
}

function isSignedServerPlayer(
  player: ServerPlayer & DocumentData,
): player is SignedServerPlayer {
  return !player.isAnonymous && typeof player.userId === "string" && player.userId.length > 0;
}

function isAlreadyExistsError(error: unknown) {
  const candidate = error as { code?: unknown };
  return candidate.code === 6 || candidate.code === "already-exists";
}

function writeSignedPlayerCompletionStats(
  transaction: Transaction,
  gameId: string,
  finalPlayers: (ServerPlayer & DocumentData)[],
  signedPlayers: SignedServerPlayer[],
  signedUserSnapshots: DocumentSnapshot[],
  winnerPlayerIds: string[],
  completedAt: Timestamp,
) {
  const isDraw = winnerPlayerIds.length !== 1;
  const highScore = Math.max(...finalPlayers.map((player) => Number(player.score ?? 0)));

  signedPlayers.forEach((player, index) => {
    const userRef = db.collection("users").doc(player.userId);
    const userSnapshot = signedUserSnapshots[index];
    const score = Number(player.score ?? 0);
    const won = !isDraw && winnerPlayerIds.includes(player.playerId);
    const lost = !isDraw && !won;
    const currentHighest = Number(
      userSnapshot.exists ? userSnapshot.data()?.highestBoxesSingleGame ?? 0 : 0,
    );
    const sparksEarned =
      completionBaseSparks + (won ? winBonusSparks : 0) + score * sparksPerBoxWon;

    transaction.set(
      userRef,
      {
        userId: player.userId,
        displayName: player.displayName ?? "Breezeblocks Player",
        avatarUrl: player.avatarUrl ?? null,
        totalGamesPlayed: FieldValue.increment(1),
        totalWins: FieldValue.increment(won ? 1 : 0),
        totalLosses: FieldValue.increment(lost ? 1 : 0),
        totalDraws: FieldValue.increment(isDraw ? 1 : 0),
        totalBoxesWon: FieldValue.increment(score),
        highestBoxesSingleGame: Math.max(currentHighest, score),
        sparks: FieldValue.increment(sparksEarned),
        updatedAt: completedAt,
      },
      { merge: true },
    );

    transaction.set(db.collection("matchHistory").doc(`${gameId}_${player.userId}`), {
      matchId: `${gameId}_${player.userId}`,
      gameId,
      userId: player.userId,
      playerId: player.playerId,
      displayName: player.displayName ?? "Breezeblocks Player",
      result: isDraw ? "draw" : won ? "win" : "loss",
      score,
      highScore,
      playerCount: finalPlayers.length,
      winnerPlayerIds,
      completedAt,
      createdAt: completedAt,
      expireAt: Timestamp.fromMillis(completedAt.toMillis() + signedGameTtlMillis),
    });
  });
}

function calculateWinnerIds(players: (ServerPlayer & DocumentData)[]) {
  const scores = players.map((player) => ({
    playerId: player.playerId,
    score: Number(player.score ?? 0),
  }));
  const highScore = Math.max(...scores.map((score) => score.score));
  return scores
    .filter((score) => score.score === highScore)
    .map((score) => score.playerId);
}
