import { httpsCallable } from "firebase/functions";
import { doc } from "firebase/firestore";
import { getFirebaseFunctions, subscribeWithPollFallback } from "@/lib/firebase/client";
import { getFirebaseDb } from "@/lib/firebase/client";
import {
  type JoinQueueInput,
  type JoinQueueResult,
  type QueueName,
  type QueueSnapshot,
  toQueueName,
} from "@/lib/matchmaking/types";

const STORAGE_KEY = "breezeblocks:local-queue";

type JoinQueueCallableResult = {
  queueId: string;
  status: "queued" | "matched";
  gameId?: string;
  queueName?: QueueName;
};

export async function joinQueue(input: JoinQueueInput): Promise<JoinQueueResult> {
  const functions = getFirebaseFunctions();
  const queueName = toQueueName(input.authType, input.requestedPlayerCount);

  if (functions) {
    const callable = httpsCallable<JoinQueueInput, JoinQueueCallableResult>(
      functions,
      "joinQueue",
    );
    const result = await callable(input);
    return {
      queueId: result.data.queueId,
      queueName: result.data.queueName ?? queueName,
      status: result.data.status,
      gameId: result.data.gameId,
      source: "functions",
    };
  }

  const queue: QueueSnapshot = {
    queueId: `local-${Date.now()}`,
    queueName,
    status: "queued",
    createdAt: Date.now(),
    source: "local",
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  return queue;
}

export function subscribeToQueue(
  queueId: string,
  onChange: (queue: JoinQueueResult | null) => void,
  onError: (error: Error) => void,
) {
  const db = getFirebaseDb();
  if (!db) return () => {};

  return subscribeWithPollFallback(
    doc(db, "matchmakingQueue", queueId),
    (data) => {
      if (!data) {
        onChange(null);
        return;
      }

      onChange({
        queueId,
        queueName: data.queueName,
        status: data.status,
        gameId: data.gameId,
        source: "functions",
      });
    },
    onError,
  );
}

export async function cancelQueue(queueId: string) {
  const functions = getFirebaseFunctions();

  if (functions) {
    const callable = httpsCallable<{ queueId: string }, { status: "cancelled" }>(
      functions,
      "cancelQueue",
    );
    await callable({ queueId });
    return;
  }

  const snapshot = getLocalQueueSnapshot();
  if (snapshot?.queueId === queueId) {
    window.localStorage.removeItem(STORAGE_KEY);
  }
}

export function getLocalQueueSnapshot(): QueueSnapshot | null {
  if (typeof window === "undefined") return null;

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as QueueSnapshot;
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}
