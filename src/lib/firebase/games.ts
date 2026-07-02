import {
  doc,
  getDoc,
  type DocumentData,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import {
  getFirebaseDb,
  getFirebaseFunctions,
  subscribeWithPollFallback,
} from "@/lib/firebase/client";
import type { LineOrientation } from "@/lib/game/engine";

export type OnlineGameSnapshot = {
  game: DocumentData | null;
  players: DocumentData[];
  lines: DocumentData[];
  boxes: DocumentData[];
};

export type SubmitMoveResult = {
  completedBoxIds: string[];
  status: "active" | "completed";
};

export type TimeoutSkipResult = {
  status: "skipped";
  skippedPlayerId: string;
  nextPlayerId: string;
};

export type BotMoveResult = SubmitMoveResult;

export function subscribeToOnlineGame(
  gameId: string,
  onChange: (snapshot: OnlineGameSnapshot) => void,
  onError: (error: Error) => void,
) {
  const db = getFirebaseDb();
  if (!db) return () => {};

  const gameRef = doc(db, "games", gameId);
  return subscribeWithPollFallback(
    gameRef,
    (data) => {
      if (!data) {
        onChange({ game: null, players: [], lines: [], boxes: [] });
        return;
      }

      onChange(compactGameSnapshot(gameId, data));
    },
    onError,
  );
}

export async function getOnlineGame(gameId: string): Promise<OnlineGameSnapshot> {
  const db = getFirebaseDb();
  if (!db) return { game: null, players: [], lines: [], boxes: [] };

  const snapshot = await getDoc(doc(db, "games", gameId));
  if (!snapshot.exists()) return { game: null, players: [], lines: [], boxes: [] };

  return compactGameSnapshot(snapshot.id, snapshot.data());
}

export async function submitOnlineMove(input: {
  gameId: string;
  orientation: LineOrientation;
  row: number;
  col: number;
}) {
  const functions = getFirebaseFunctions();
  if (!functions) throw new Error("Firebase Functions are not configured.");

  const callable = httpsCallable<typeof input, SubmitMoveResult>(functions, "submitMove");
  const result = await callable(input);
  return result.data;
}

export async function claimOnlineTimeout(gameId: string) {
  const functions = getFirebaseFunctions();
  if (!functions) throw new Error("Firebase Functions are not configured.");

  const callable = httpsCallable<{ gameId: string }, TimeoutSkipResult>(
    functions,
    "claimTimeoutSkip",
  );
  const result = await callable({ gameId });
  return result.data;
}

export async function claimOnlineBotMove(gameId: string) {
  const functions = getFirebaseFunctions();
  if (!functions) throw new Error("Firebase Functions are not configured.");

  const callable = httpsCallable<{ gameId: string }, BotMoveResult>(
    functions,
    "claimBotMove",
  );
  const result = await callable({ gameId });
  return result.data;
}

function compactGameSnapshot(id: string, data: DocumentData): OnlineGameSnapshot {
  const game: DocumentData = { id, ...data };
  const players = Array.isArray(game.players) ? game.players : [];
  return {
    game,
    players,
    lines: ownerMapToLines(game.lineOwners, players),
    boxes: ownerMapToBoxes(game.boxOwners, players),
  };
}

function ownerMapToLines(value: unknown, players: DocumentData[]): DocumentData[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];

  return Object.entries(value as Record<string, unknown>).map(([id, ownerPlayerId]) => {
    const [prefix, row, col] = id.split("-");
    return {
      id,
      lineId: id,
      orientation: prefix === "v" ? "vertical" : "horizontal",
      row: Number(row ?? 0),
      col: Number(col ?? 0),
      ownerPlayerId: ownerToPlayerId(ownerPlayerId, players),
    };
  });
}

function ownerMapToBoxes(value: unknown, players: DocumentData[]): DocumentData[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];

  return Object.entries(value as Record<string, unknown>).map(([id, ownerPlayerId]) => {
    const [, row, col] = id.split("-");
    return {
      id,
      boxId: id,
      row: Number(row ?? 0),
      col: Number(col ?? 0),
      ownerPlayerId: ownerToPlayerId(ownerPlayerId, players),
    };
  });
}

function ownerToPlayerId(owner: unknown, players: DocumentData[]) {
  if (typeof owner === "string") return owner;
  if (typeof owner === "number") {
    const player = players[owner];
    return player ? String(player.playerId ?? player.id) : null;
  }
  return null;
}
