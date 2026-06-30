import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  type DocumentData,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { getFirebaseDb, getFirebaseFunctions } from "@/lib/firebase/client";
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

export function subscribeToOnlineGame(
  gameId: string,
  onChange: (snapshot: OnlineGameSnapshot) => void,
  onError: (error: Error) => void,
) {
  const db = getFirebaseDb();
  if (!db) return () => {};

  const gameRef = doc(db, "games", gameId);
  const playersQuery = query(collection(gameRef, "players"), orderBy("turnOrder"));
  const linesQuery = query(collection(gameRef, "lines"), orderBy("lineId"));
  const boxesQuery = query(collection(gameRef, "boxes"), orderBy("boxId"));

  const state: OnlineGameSnapshot = {
    game: null,
    players: [],
    lines: [],
    boxes: [],
  };

  const emit = () => onChange({ ...state });
  const unsubscribers = [
    onSnapshot(
      gameRef,
      (snapshot) => {
        state.game = snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
        emit();
      },
      onError,
    ),
    onSnapshot(
      playersQuery,
      (snapshot) => {
        state.players = snapshot.docs.map((entry) => ({
          id: entry.id,
          ...entry.data(),
        }));
        emit();
      },
      onError,
    ),
    onSnapshot(
      linesQuery,
      (snapshot) => {
        state.lines = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
        emit();
      },
      onError,
    ),
    onSnapshot(
      boxesQuery,
      (snapshot) => {
        state.boxes = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
        emit();
      },
      onError,
    ),
  ];

  return () => {
    for (const unsubscribe of unsubscribers) unsubscribe();
  };
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
