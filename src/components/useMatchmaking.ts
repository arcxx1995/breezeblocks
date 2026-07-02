"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  const { isConfigured, isReady, player, signInGuest } = useAuth();
  const [queue, setQueue] = useState<JoinQueueResult | null>(null);
  const [status, setStatus] = useState<QueueStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);
  const authType = player.provider === "google" ? "signed" : "anonymous";
  const requestedPlayerCount = modeToPlayerCount(mode);
  const queueName = useMemo(
    () => toQueueName(authType, requestedPlayerCount),
    [authType, requestedPlayerCount],
  );

  const joinMatchmaking = useCallback(async (allowBots = false, rematchWithUid?: string) => {
    cancelledRef.current = false;
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
      // The user may have cancelled while this request was in flight (e.g. a
      // bot-fill retry that started just before Cancel was clicked). Firestore
      // transactions don't know about that, so a stale response can still
      // report "matched" — don't resurrect it into local state.
      if (cancelledRef.current) return;
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

  // Deliberately depends on the primitive queueId/status/source, not the
  // `queue` object itself. subscribeToQueue's onChange hands back a fresh
  // object on every snapshot delivery (including the immediate one on
  // subscribe), even when nothing meaningful changed. Depending on the
  // object would re-run this effect on every delivery, tearing down and
  // re-subscribing in a tight loop that never stays open long enough for a
  // real update (or the poll fallback's interval) to land.
  useEffect(() => {
    if (!queue || queue.status !== "queued" || queue.source !== "functions") return;

    return subscribeToQueue(
      queue.queueId,
      (nextQueue) => {
        if (!nextQueue || cancelledRef.current) return;
        setQueue(nextQueue);
        setStatus(nextQueue.status);
      },
      (caught) => setError(caught.message),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue?.queueId, queue?.status, queue?.source]);

  const stopQueue = useCallback(async () => {
    cancelledRef.current = true;
    try {
      if (queue) await cancelQueue(queue.queueId);
      setQueue(null);
      setStatus("cancelled");
    } catch (caught) {
      setStatus("error");
      setError(caught instanceof Error ? caught.message : "Could not cancel queue.");
    }
  }, [queue]);

  // Leaving the matchmaking screen without hitting Cancel (back button, app
  // switch, closing the tab) used to leave the queue doc "queued" on the
  // server for up to 2 minutes, where a later join could match against it as
  // a phantom opponent that never moves. Cancel on unmount closes that gap.
  const latestQueueRef = useRef(queue);
  useEffect(() => {
    latestQueueRef.current = queue;
  }, [queue]);
  useEffect(() => {
    return () => {
      const current = latestQueueRef.current;
      if (current && current.status === "queued") {
        cancelQueue(current.queueId).catch(() => {});
      }
    };
  }, []);

  return {
    queue,
    queueName,
    status,
    error,
    isReady,
    startBotMatch,
    startQueue,
    startRematch,
    stopQueue,
  };
}
