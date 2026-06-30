"use client";

import { useCallback, useMemo, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import {
  cancelQueue,
  createMatchIfReady,
  joinQueue,
} from "@/lib/firebase/matchmaking";
import {
  type JoinQueueResult,
  type MatchMode,
  type QueueStatus,
  modeToPlayerCount,
  toQueueName,
} from "@/lib/matchmaking/types";

export function useMatchmaking(mode: MatchMode) {
  const { player } = useAuth();
  const [queue, setQueue] = useState<JoinQueueResult | null>(null);
  const [status, setStatus] = useState<QueueStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const authType = player.provider === "google" ? "signed" : "anonymous";
  const requestedPlayerCount = modeToPlayerCount(mode);
  const queueName = useMemo(
    () => toQueueName(authType, requestedPlayerCount),
    [authType, requestedPlayerCount],
  );

  const startQueue = useCallback(async () => {
    setStatus("queued");
    setError(null);
    try {
      const result = await joinQueue({
        authType,
        requestedPlayerCount,
        displayName: player.displayName,
        userId: player.provider === "google" ? player.uid ?? undefined : undefined,
        guestId: player.provider !== "google" ? player.uid ?? player.displayName : undefined,
      });
      setQueue(result);
      setStatus(result.status);
      if (result.status === "queued" && result.source === "functions") {
        const matchResult = await createMatchIfReady({
          authType,
          requestedPlayerCount,
        });
        if (matchResult.status === "matched" && matchResult.gameId) {
          setQueue({ ...result, status: "matched", gameId: matchResult.gameId });
          setStatus("matched");
        }
      }
    } catch (caught) {
      setStatus("error");
      setError(caught instanceof Error ? caught.message : "Could not join queue.");
    }
  }, [authType, player.displayName, player.provider, player.uid, requestedPlayerCount]);

  const stopQueue = useCallback(async () => {
    if (!queue) return;
    await cancelQueue(queue.queueId);
    setQueue(null);
    setStatus("cancelled");
  }, [queue]);

  return {
    queue,
    queueName,
    status,
    error,
    startQueue,
    stopQueue,
  };
}
