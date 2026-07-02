import {
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  type DocumentData,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { getFirebaseDb, getFirebaseFunctions } from "@/lib/firebase/client";
import type { AuthSnapshot } from "@/lib/firebase/auth";

const PROFILE_ENSURE_INTERVAL_MS = 6 * 60 * 60 * 1000;

export type PlayerProfile = {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  totalWins: number;
  totalLosses: number;
  totalDraws: number;
  totalGamesPlayed: number;
  totalBoxesWon: number;
  highestBoxesSingleGame: number;
  isPremium: boolean;
  sparks: number;
  unlockedThemes: string[];
  activeThemeId: string;
  loginStreak: number;
  lastLoginClaimAtMillis: number;
};

export type DailyLoginClaimResult = {
  reward: number;
  loginStreak: number;
  claimedAt: number;
};

export type UnlockThemeResult = {
  themeId: string;
  spentSparks: number;
  remainingSparks: number;
};

export type SelectThemeResult = {
  themeId: string;
};

export type MatchHistoryEntry = {
  matchId: string;
  gameId: string;
  userId: string;
  result: "win" | "loss" | "draw";
  score: number;
  highScore: number;
  playerCount: number;
  completedAt: unknown;
};

export async function ensureSignedProfile(player: AuthSnapshot) {
  if (!player.uid || player.provider !== "google") return;
  if (isRecentlyEnsured(player.uid)) return;

  const functions = getFirebaseFunctions();
  if (!functions) return;

  const callable = httpsCallable<
    { displayName: string; avatarUrl: string | null },
    { status: "ready" }
  >(functions, "ensureSignedProfile");

  await callable({
    displayName: player.displayName,
    avatarUrl: player.avatarUrl,
  });
  markEnsured(player.uid);
}

export async function claimDailyLogin() {
  const functions = getFirebaseFunctions();
  if (!functions) return null;

  const callable = httpsCallable<Record<string, never>, DailyLoginClaimResult>(
    functions,
    "claimDailyLogin",
  );
  const response = await callable({});
  return response.data;
}

export async function unlockTheme(themeId: string) {
  const functions = getFirebaseFunctions();
  if (!functions) return null;

  const callable = httpsCallable<{ themeId: string }, UnlockThemeResult>(
    functions,
    "unlockTheme",
  );
  const response = await callable({ themeId });
  return response.data;
}

export async function selectTheme(themeId: string) {
  const functions = getFirebaseFunctions();
  if (!functions) return null;

  const callable = httpsCallable<{ themeId: string }, SelectThemeResult>(
    functions,
    "selectTheme",
  );
  const response = await callable({ themeId });
  return response.data;
}

export async function getPlayerProfile(userId: string) {
  const db = getFirebaseDb();
  if (!db) return null;

  const snapshot = await getDoc(doc(db, "users", userId));
  return snapshot.exists() ? toPlayerProfile(snapshot.data()) : null;
}

// Sparks/stats change server-side as matches complete, so the lobby/profile/
// theme shop subscribe live instead of fetching once and going stale.
export function subscribeToPlayerProfile(
  userId: string,
  onChange: (profile: PlayerProfile | null) => void,
  onError: (error: Error) => void,
) {
  const db = getFirebaseDb();
  if (!db) return () => {};

  return onSnapshot(
    doc(db, "users", userId),
    (snapshot) => onChange(snapshot.exists() ? toPlayerProfile(snapshot.data()) : null),
    onError,
  );
}

export async function getMatchHistory(userId: string) {
  const db = getFirebaseDb();
  if (!db) return [];

  const historyQuery = query(
    collection(db, "matchHistory"),
    where("userId", "==", userId),
    orderBy("completedAt", "desc"),
    limit(10),
  );

  const snapshot = await getDocs(historyQuery);
  return snapshot.docs.map((entry) =>
    toMatchHistoryEntry({ matchId: entry.id, ...entry.data() }),
  );
}

function toPlayerProfile(data: DocumentData): PlayerProfile {
  return {
    userId: String(data.userId ?? ""),
    displayName: String(data.displayName ?? "Breezeblocks Player"),
    avatarUrl: typeof data.avatarUrl === "string" ? data.avatarUrl : null,
    totalWins: Number(data.totalWins ?? 0),
    totalLosses: Number(data.totalLosses ?? 0),
    totalDraws: Number(data.totalDraws ?? 0),
    totalGamesPlayed: Number(data.totalGamesPlayed ?? 0),
    totalBoxesWon: Number(data.totalBoxesWon ?? 0),
    highestBoxesSingleGame: Number(data.highestBoxesSingleGame ?? 0),
    isPremium: data.isPremium === true,
    sparks: Number(data.sparks ?? 0),
    unlockedThemes: Array.isArray(data.unlockedThemes) ? data.unlockedThemes : ["classic"],
    activeThemeId: typeof data.activeThemeId === "string" ? data.activeThemeId : "classic",
    loginStreak: Number(data.loginStreak ?? 0),
    lastLoginClaimAtMillis:
      data.lastLoginClaimAt instanceof Timestamp ? data.lastLoginClaimAt.toMillis() : 0,
  };
}

function toMatchHistoryEntry(data: DocumentData): MatchHistoryEntry {
  const result: MatchHistoryEntry["result"] =
    data.result === "win" || data.result === "loss" || data.result === "draw"
      ? data.result
      : "draw";

  return {
    matchId: String(data.matchId ?? ""),
    gameId: String(data.gameId ?? ""),
    userId: String(data.userId ?? ""),
    result,
    score: Number(data.score ?? 0),
    highScore: Number(data.highScore ?? 0),
    playerCount: Number(data.playerCount ?? 0),
    completedAt: data.completedAt ?? null,
  };
}

function isRecentlyEnsured(userId: string) {
  if (typeof window === "undefined") return false;
  const value = window.localStorage.getItem(profileEnsureKey(userId));
  const lastEnsuredAt = value ? Number(value) : 0;
  return Date.now() - lastEnsuredAt < PROFILE_ENSURE_INTERVAL_MS;
}

function markEnsured(userId: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(profileEnsureKey(userId), String(Date.now()));
}

function profileEnsureKey(userId: string) {
  return `breezeblocks:profile-ensured:${userId}`;
}
