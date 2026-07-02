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
import { onSchedule } from "firebase-functions/scheduler";
import {
  BOX_ROWS,
  BOX_COLS,
  DEFAULT_RATING,
  TURN_DURATION_SECONDS,
  assertValidLine,
  chooseBotLine,
  computeRatingDelta,
  createInitialBoxOwners,
  createInitialLineOwners,
  getAdjacentBoxIds,
  getNextActivePlayer,
  isBoxComplete,
  lineId,
  type BoxOwners,
  type BotDifficulty,
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
// Cap matches formed per queue per sweep so a large backlog can't blow the
// function timeout — the next sweep drains the rest.
const sweepMaxMatchesPerQueue = 6;
const profileLastSeenUpdateIntervalMillis = 60 * 60 * 1000;
const queueTtlMillis = 24 * 60 * 60 * 1000;
const anonymousGameTtlMillis = 7 * 24 * 60 * 60 * 1000;
const signedGameTtlMillis = 90 * 24 * 60 * 60 * 1000;
const botMoveDelayMillis = 700;
const dailyLoginRewards = [10, 15, 20, 25, 30, 40, 50];
const millisPerDay = 24 * 60 * 60 * 1000;
// Match Sparks: flat and capped per day. Bot/unrated games pay near-zero so
// grinding weak bots (allowBots matchmaking) can't mint currency. Loser payout
// no longer scales with boxes captured, killing score-farming on a loss.
const matchWinSparks = 10;
const matchDrawOrLossSparks = 4;
const botOrUnratedMatchSparks = 1;
const maxRewardedMatchesPerDay = 6;
// Rewarded ad faucet: the only ad-backed Spark source. Capped per day and gated
// by a minimum gap so a client can't spam the callable to mint Sparks.
// ponytail: true server-side ad verification (SSV) is impossible until an ad
// network is wired; the day cap + gap is the abuse ceiling until then. Add the
// network's signed callback check here when available.
const rewardedAdSparks = 8;
const maxRewardedAdsPerDay = 5;
const minRewardedAdGapMillis = 3 * 1000;

function utcDayNumber(millis: number): number {
  return Math.floor(millis / millisPerDay);
}
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
    // Must run before assertNoConflictingQueue, which can write (expire
    // stale queue docs) — Firestore transactions require all reads first.
    const { rating: requesterRating, botDifficulty } = await resolveRequesterMatchProfile(
      transaction,
      input.authType,
      uid,
    );
    await assertNoConflictingQueue(transaction, uid, queueName, now);
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
          requesterRating: typeof queue?.rating === "number" ? queue.rating : requesterRating,
          allowBots: input.allowBots === true,
          botDifficulty,
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
      rating: requesterRating,
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
      requesterRating,
      allowBots: input.allowBots === true,
      botDifficulty,
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

// Server-side backstop for matchmaking. The client re-poll (fast-path) only
// runs while a player's app is open and awake, so a pair that both background
// their tab — or any backlog the fast-path can't drain — would sit unmatched.
// This sweep runs on a fixed clock, independent of any client, and pairs
// whoever is already waiting. It only does work when a full group is present,
// so it "switches on" exactly when there are enough players to match and
// no-ops otherwise. Safe to run alongside joinQueue: it shares the same match
// core, so the status guard + Firestore transaction retry prevent double
// matches (whichever commits first wins; the other sees "matched" and skips).
export const sweepMatchmakingQueues = onSchedule(
  {
    schedule: "every 1 minutes",
    region: "us-central1",
    memory: "256MiB",
    timeoutSeconds: 60,
    maxInstances: 1,
  },
  async () => {
    for (const queueName of allQueueNames) {
      const { playerCount } = parseQueueName(queueName);
      for (let formed = 0; formed < sweepMaxMatchesPerQueue; formed += 1) {
        // One match per transaction so a concurrent joinQueue can't double-match.
        const matched = await db.runTransaction(async (transaction) => {
          const waitingSnapshot = await transaction.get(
            db
              .collection("matchmakingQueue")
              .where("queueName", "==", queueName)
              .where("status", "==", "queued")
              .orderBy("joinedAt", "asc")
              .limit(matchmakingQueryLimit),
          );
          if (waitingSnapshot.size < playerCount) return false;
          const result = attemptCreateMatchInTransaction({
            transaction,
            waitingDocs: waitingSnapshot.docs,
            queueName,
            requestedPlayerCount: playerCount,
            now: Timestamp.now(),
            // No requester and no bot fill: the sweep only pairs real players
            // who are genuinely waiting; bot fill stays a deliberate client choice.
            allowBots: false,
          });
          return result.status === "matched";
        });
        if (!matched) break;
      }
    }
  },
);

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
        // Reached here only because every remaining player timed out — abandonment.
        true,
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
    const botLine = chooseBotLine(lineOwners, boxOwners, currentPlayer.botDifficulty ?? "medium");
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

// Bots are calibrated rating anchors: their tier reflects a known strength, so
// unlike an anonymous human (whose true skill is unknown but always reads 1000)
// a bot is a legitimate opponent to rate against. They never gain/lose rating
// themselves — a fixed reference point, like a chess engine's rating.
const botAnchorRating: Record<BotDifficulty, number> = {
  easy: 800,
  medium: 1000,
  hard: 1200,
};

function createBotPlayer(index: number, botDifficulty: BotDifficulty) {
  return {
    playerId: `bot_${index + 1}`,
    userId: null,
    guestId: null,
    displayName: ["Breeze Bot", "Dot Bot", "Line Bot"][index - 1] ?? "Box Bot",
    avatarUrl: null,
    color: playerColors[index],
    score: 0,
    rating: botAnchorRating[botDifficulty],
    isAnonymous: true,
    isBot: true,
    botDifficulty,
    connectionStatus: "connected",
    consecutiveSkips: 0,
    turnOrder: index,
    queueEntryId: `bot_${index + 1}`,
  };
}

// Resolves both the skill rating used for player-vs-player matching and the
// bot tier used when a queue falls back to bot fill. Guests have no
// persistent profile, so they always get the default rating and the middle
// bot tier. Uses a transaction read so it composes with joinQueue's existing
// transaction (all reads must precede writes).
async function resolveRequesterMatchProfile(
  transaction: Transaction,
  authType: AuthType,
  uid: string,
): Promise<{ rating: number; botDifficulty: BotDifficulty }> {
  if (authType !== "signed") return { rating: DEFAULT_RATING, botDifficulty: "medium" };
  const snapshot = await transaction.get(db.collection("users").doc(uid));
  const data = snapshot.data();
  const rating = typeof data?.rating === "number" ? data.rating : DEFAULT_RATING;
  const gamesPlayed = typeof data?.totalGamesPlayed === "number" ? data.totalGamesPlayed : 0;
  const wins = typeof data?.totalWins === "number" ? data.totalWins : 0;
  if (gamesPlayed < 5) return { rating, botDifficulty: "easy" };
  const winRate = wins / gamesPlayed;
  const botDifficulty: BotDifficulty = winRate < 0.4 ? "easy" : winRate <= 0.65 ? "medium" : "hard";
  return { rating, botDifficulty };
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
      rating: DEFAULT_RATING,
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
    const today = utcDayNumber(now.toMillis());
    const lastClaimDay = lastClaimMillis > 0 ? utcDayNumber(lastClaimMillis) : null;

    // One claim per UTC calendar day. Closes the banking abuse where a 20h gap
    // let a user collect ~1.2 daily rewards per real day.
    if (lastClaimDay !== null && today <= lastClaimDay) {
      throw new HttpsError("failed-precondition", "Daily reward already claimed.");
    }

    const previousStreak = Number(profile.loginStreak ?? 0);
    // Consecutive day keeps the streak; any longer gap resets to day 1.
    const nextStreak =
      lastClaimDay !== null && today - lastClaimDay === 1 ? previousStreak + 1 : 1;
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

export const grantRewardedSparks = onCall(callableOptions, async (request) => {
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
    const today = utcDayNumber(now.toMillis());
    const priorDay = Number(profile.rewardedAdDayKey ?? -1);
    const grantedToday = priorDay === today ? Number(profile.rewardedAdTodayCount ?? 0) : 0;

    if (grantedToday >= maxRewardedAdsPerDay) {
      throw new HttpsError("resource-exhausted", "Daily rewarded-ad limit reached.");
    }

    // Anti-spam gate. The real defence against faking a watch is server-side ad
    // verification, which needs the ad network — see rewardedAdSparks comment.
    const lastGrantMillis = toMillis(profile.lastRewardedAdAt);
    if (lastGrantMillis > 0 && now.toMillis() - lastGrantMillis < minRewardedAdGapMillis) {
      throw new HttpsError("failed-precondition", "Please wait before watching another ad.");
    }

    const nextCount = grantedToday + 1;
    transaction.update(userRef, {
      sparks: FieldValue.increment(rewardedAdSparks),
      rewardedAdDayKey: today,
      rewardedAdTodayCount: nextCount,
      lastRewardedAdAt: now,
      updatedAt: now,
    });

    return {
      reward: rewardedAdSparks,
      grantedToday: nextCount,
      remainingToday: maxRewardedAdsPerDay - nextCount,
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
    input.rematchWithUid != null &&
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

function parseQueueName(queueName: QueueName): {
  authType: AuthType;
  playerCount: PlayerCount;
} {
  const [prefix, countPart] = queueName.split("_");
  const authType: AuthType = prefix === "signed" ? "signed" : "anonymous";
  const playerCount = Number(countPart.replace("p", "")) as PlayerCount;
  return { authType, playerCount };
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
    rating: entryRating(queue),
    isAnonymous: queue.authType === "anonymous",
    connectionStatus: "connected",
    consecutiveSkips: 0,
    turnOrder: index,
    queueEntryId,
  };
}

// How far apart in rating two players can be to match. Grows with how long
// the candidate has already been waiting, so a lone mismatched pair still
// ends up matched with each other instead of both waiting out the clock and
// getting bot-filled separately.
function ratingBandForWaitMillis(waitMillis: number): number {
  return 150 + (waitMillis / 1000) * 25;
}

function entryRating(data: DocumentData): number {
  return typeof data.rating === "number" ? data.rating : DEFAULT_RATING;
}

// Picks the requester plus the closest-rating opponents currently waiting,
// widening per-candidate tolerance by how long that candidate has waited.
function selectRatingMatchedEntries(
  waitingEntries: { ref: DocumentReference; id: string; data: DocumentData }[],
  requesterQueueRef: DocumentReference | undefined,
  requesterRating: number,
  requestedPlayerCount: number,
  now: Timestamp,
) {
  const requesterEntry = requesterQueueRef
    ? waitingEntries.find((entry) => entry.ref.path === requesterQueueRef.path)
    : undefined;
  if (!requesterEntry) return waitingEntries.slice(0, requestedPlayerCount);

  const requesterWaitMillis = now.toMillis() - toMillis(requesterEntry.data.joinedAt);
  const eligibleOpponents = waitingEntries
    .filter((entry) => entry !== requesterEntry)
    .filter((entry) => {
      // Symmetric band: widen by whichever side has waited longer, so a lone
      // long-waiting requester also gets matched, not just long-waiting opponents.
      const waitMillis = Math.max(
        requesterWaitMillis,
        now.toMillis() - toMillis(entry.data.joinedAt),
      );
      return Math.abs(entryRating(entry.data) - requesterRating) <= ratingBandForWaitMillis(waitMillis);
    })
    .sort((a, b) => {
      const distanceDiff =
        Math.abs(entryRating(a.data) - requesterRating) - Math.abs(entryRating(b.data) - requesterRating);
      return distanceDiff !== 0 ? distanceDiff : toMillis(a.data.joinedAt) - toMillis(b.data.joinedAt);
    });

  return [requesterEntry, ...eligibleOpponents.slice(0, requestedPlayerCount - 1)];
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
  now: Timestamp,
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
      // A closed tab/app switch never runs the client's unmount cancel, so a
      // "queued" entry in another mode can outlive the session. Without this
      // staleness check it would block every future joinQueue call forever.
      const isStale = now.toMillis() - toMillis(otherQueue.joinedAt) >= staleQueueAgeMillis;
      if (isStale) {
        transaction.update(otherSnapshot.ref, {
          status: "expired",
          expiredAt: now,
          expireAt: Timestamp.fromMillis(now.toMillis() + queueTtlMillis),
        });
        continue;
      }
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
  requesterRating = DEFAULT_RATING,
  allowBots = false,
  botDifficulty = "medium",
}: {
  transaction: Transaction;
  waitingDocs: QueryDocumentSnapshot[];
  queueName: QueueName;
  requestedPlayerCount: PlayerCount;
  now: Timestamp;
  requesterQueueRef?: DocumentReference;
  requesterQueueData?: DocumentData;
  requesterRating?: number;
  allowBots?: boolean;
  botDifficulty?: BotDifficulty;
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
  } else if (requesterQueueRef && requesterQueueData && requesterAlreadyWaiting) {
    // Re-join of an already-queued doc (e.g. the rematch fallback clearing its
    // restrictedToUid). Refresh the stored doc and the in-memory entry so the
    // updated fields are visible to this match AND to future joiners — otherwise
    // a stale restrictedToUid keeps other players from ever pairing with it.
    const existing = waitingEntries.find((entry) => entry.ref.path === requesterQueueRef.path);
    if (existing) existing.data = requesterQueueData;
    transaction.set(requesterQueueRef, requesterQueueData, { merge: true });
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
      : selectRatingMatchedEntries(
          waitingEntries,
          requesterQueueRef,
          requesterRating,
          requestedPlayerCount,
          now,
        );
  const requesterWasMatched = requesterQueueRef
    ? selectedQueueEntries.some((entry) => entry.ref.path === requesterQueueRef.path)
    : true;

  if (!requesterWasMatched || (!allowBots && selectedQueueEntries.length < requestedPlayerCount)) {
    if (requesterQueueRef && requesterQueueData && !requesterAlreadyWaiting) {
      transaction.set(requesterQueueRef, requesterQueueData);
    }
    return {
      queueId: requesterQueueRef?.id ?? null,
      queueName,
      status: "queued" as const,
    };
  }

  // Seat by join time so the earliest joiner moves first, instead of the
  // match-triggering (latest) player always getting the first-move advantage.
  const orderedQueueEntries = [...selectedQueueEntries].sort(
    (a, b) => toMillis(a.data.joinedAt) - toMillis(b.data.joinedAt),
  );
  const selectedPlayers = orderedQueueEntries.map((entry, index) =>
    queueDocToPlayer(entry.id, entry.data, index),
  );
  while (allowBots && selectedPlayers.length < requestedPlayerCount) {
    selectedPlayers.push(createBotPlayer(selectedPlayers.length, botDifficulty));
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
      // Board not full = ended by everyone else going inactive, not a real finish.
      capturedBoxCount < BOX_ROWS * BOX_COLS,
    );
  }

  return { completedBoxIds, status: gameComplete ? "completed" : "active" };
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
  abandoned: boolean,
) {
  const highScore = Math.max(...finalPlayers.map((player) => Number(player.score ?? 0)));

  // Rating applies to a real finish where every human is a rated (signed)
  // player; bots are allowed as fixed anchors. Anonymous humans are excluded
  // because their true skill is unknown yet always reads 1000 — rating against
  // them would mint/burn points against a phantom the other side never absorbs.
  const rated =
    !abandoned &&
    finalPlayers.filter((player) => !player.isBot).every(isSignedServerPlayer);

  // Freeze one pre-game rating per player: signed humans from their live profile
  // snapshot, bots (and any excluded anon) from the game doc. Using one source
  // for both sides of every pair keeps equal-K deltas exactly zero-sum.
  const preGameRating = new Map<string, number>();
  finalPlayers.forEach((player) => {
    const signedIndex = signedPlayers.findIndex((s) => s.playerId === player.playerId);
    if (signedIndex >= 0) {
      const snapshot = signedUserSnapshots[signedIndex];
      preGameRating.set(
        player.playerId,
        Number(snapshot.exists ? snapshot.data()?.rating ?? DEFAULT_RATING : DEFAULT_RATING),
      );
    } else {
      preGameRating.set(player.playerId, Number(player.rating ?? DEFAULT_RATING));
    }
  });

  signedPlayers.forEach((player, index) => {
    const userRef = db.collection("users").doc(player.userId);
    const userSnapshot = signedUserSnapshots[index];
    const score = Number(player.score ?? 0);
    // Outcome from final standing, so a player who finished behind a two-way tie
    // for first records a loss — not a draw. Co-leaders record a draw; the sole
    // top score records a win.
    const isWinner = winnerPlayerIds.includes(player.playerId);
    const won = isWinner && winnerPlayerIds.length === 1;
    const draw = isWinner && winnerPlayerIds.length > 1;
    const lost = !isWinner;
    const currentHighest = Number(
      userSnapshot.exists ? userSnapshot.data()?.highestBoxesSingleGame ?? 0 : 0,
    );
    const gamesPlayed = Number(
      userSnapshot.exists ? userSnapshot.data()?.totalGamesPlayed ?? 0 : 0,
    );

    let ratingUpdate: Record<string, unknown> = {};
    if (rated) {
      const playerRating = preGameRating.get(player.playerId) ?? DEFAULT_RATING;
      const opponents = finalPlayers
        .filter((other) => other.playerId !== player.playerId)
        .map((other) => {
          const otherScore = Number(other.score ?? 0);
          const result: 0 | 0.5 | 1 = score > otherScore ? 1 : score < otherScore ? 0 : 0.5;
          return {
            rating: preGameRating.get(other.playerId) ?? DEFAULT_RATING,
            result,
            margin: Math.abs(score - otherScore),
          };
        });
      const ratingDelta = computeRatingDelta(playerRating, opponents, gamesPlayed);
      ratingUpdate = { rating: playerRating + ratingDelta };
    }
    // Bot or unrated (anonymous-opponent) finishes pay a token amount only —
    // never enough to farm. Rated human finishes pay a flat, per-day-capped
    // reward. Loser payout no longer scales with boxes captured.
    const hasBotOpponent = finalPlayers.some((other) => other.isBot);
    const matchDay = utcDayNumber(completedAt.toMillis());
    const priorRewardDay = Number(
      userSnapshot.exists ? userSnapshot.data()?.matchRewardDayKey ?? -1 : -1,
    );
    const rewardedToday =
      priorRewardDay === matchDay
        ? Number(userSnapshot.data()?.matchRewardTodayCount ?? 0)
        : 0;

    let sparksEarned: number;
    let nextRewardedToday = rewardedToday;
    if (!rated || hasBotOpponent) {
      sparksEarned = botOrUnratedMatchSparks;
    } else if (rewardedToday < maxRewardedMatchesPerDay) {
      sparksEarned = won ? matchWinSparks : matchDrawOrLossSparks;
      nextRewardedToday = rewardedToday + 1;
    } else {
      sparksEarned = 0;
    }

    transaction.set(
      userRef,
      {
        userId: player.userId,
        displayName: player.displayName ?? "Breezeblocks Player",
        avatarUrl: player.avatarUrl ?? null,
        totalGamesPlayed: FieldValue.increment(1),
        totalWins: FieldValue.increment(won ? 1 : 0),
        totalLosses: FieldValue.increment(lost ? 1 : 0),
        totalDraws: FieldValue.increment(draw ? 1 : 0),
        totalBoxesWon: FieldValue.increment(score),
        highestBoxesSingleGame: Math.max(currentHighest, score),
        ...ratingUpdate,
        sparks: FieldValue.increment(sparksEarned),
        matchRewardDayKey: matchDay,
        matchRewardTodayCount: nextRewardedToday,
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
      result: won ? "win" : draw ? "draw" : "loss",
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
