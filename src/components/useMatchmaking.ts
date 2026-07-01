"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import {
  cancelQueue,
  joinQueue,
  subscribeToQueue,
} from "@/lib/firebase/matchmaking";
import {
  type JoinQueueResult,
  type MatchMode,
  type QueueStatus,
  modeToPlayerCount,
  toQueueName,
} from "@/lib/matchmaking/types";

export function useMatchmaking(mode: MatchMode) {
  const { isConfigured, player, signInGuest } = useAuth();
  const [queue, setQueue] = useState<JoinQueueResult | null>(null);
  const [status, setStatus] = useState<QueueStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const authType = player.provider === "google" ? "signed" : "anonymous";
  const requestedPlayerCount = modeToPlayerCount(mode);
  const queueName = useMemo(
    () => toQueueName(authType, requestedPlayerCount),
    [authType, requestedPlayerCount],
  );

  const joinMatchmaking = useCallback(async (allowBots = false, rematchWithUid?: string) => {
    setStatus("queued");
    setError(null);
    try {
      if (isConfigured && player.provider !== "google" && !player.uid) {
        await signInGuest();
        setStatus("idle");
        return;
      }

      const result = await joinQueue({
        authType,
        requestedPlayerCount,
        displayName: player.displayName,
        userId: player.provider === "google" ? player.uid ?? undefined : undefined,
        guestId: player.provider !== "google" ? player.uid ?? player.displayName : undefined,
        allowBots,
        rematchWithUid,
      });
      setQueue(result);
      setStatus(result.status);
    } catch (caught) {
      setStatus("error");
      setError(caught instanceof Error ? caught.message : "Could not join queue.");
    }
  }, [
    authType,
    isConfigured,
    player.displayName,
    player.provider,
    player.uid,
    requestedPlayerCount,
    signInGuest,
  ]);

  const startQueue = useCallback(() => joinMatchmaking(false), [joinMatchmaking]);
  const startBotMatch = useCallback(() => joinMatchmaking(true), [joinMatchmaking]);
  const startRematch = useCallback(
    (opponentUid: string) => joinMatchmaking(false, opponentUid),
    [joinMatchmaking],
  );

  useEffect(() => {
    if (!queue || queue.status !== "queued" || queue.source !== "functions") return;

    return subscribeToQueue(
      queue.queueId,
      (nextQueue) => {
        if (!nextQueue) return;
        setQueue(nextQueue);
        setStatus(nextQueue.status);
      },
      (caught) => setError(caught.message),
    );
  }, [queue]);

  const stopQueue = useCallback(async () => {
    try {
      if (queue) await cancelQueue(queue.queueId);
      setQueue(null);
      setStatus("cancelled");
    } catch (caught) {
      setStatus("error");
      setError(caught instanceof Error ? caught.message : "Could not cancel queue.");
    }
  }, [queue]);

  return {
    queue,
    queueName,
    status,
    error,
    startBotMatch,
    startQueue,
    startRematch,
    stopQueue,
  };
}
