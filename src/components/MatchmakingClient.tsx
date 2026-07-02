"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AppScreen,
  BrandHeader,
  DotBoardPreview,
  Panel,
} from "@/components/AppShell";
import { useMatchmaking } from "@/components/useMatchmaking";
import { usePlayerProfile } from "@/components/usePlayerProfile";
import { shouldShowInterstitial, showInterstitial } from "@/lib/ads/adGate";
import type { MatchMode } from "@/lib/matchmaking/types";
import { getTheme } from "@/lib/themes";

const REMATCH_FALLBACK_SECONDS = 12;

const statusCopy = [
  "Finding players...",
  "Waiting for 1 more player...",
  "Match found!",
  "Building the board...",
];

export function MatchmakingClient({
  mode,
  rematchWith,
}: {
  mode: string;
  rematchWith?: string;
}) {
  const router = useRouter();
  const { profile } = usePlayerProfile();
  const isPremium = profile?.isPremium === true;
  const theme = getTheme(profile?.activeThemeId ?? "classic");
  const [elapsed, setElapsed] = useState(0);
  const [isCancelling, setIsCancelling] = useState(false);
  const [botOfferDismissed, setBotOfferDismissed] = useState(false);
  const rematchFallbackRef = useRef(false);
  const hasMatchedRef = useRef(false);
  const cancellingRef = useRef(false);
  const elapsedRef = useRef(0);
  const matchMode = normalizeMode(mode);
  const matchmaking = useMatchmaking(matchMode);
  const {
    error,
    isReady,
    queue,
    queueName,
    startBotMatch,
    startQueue,
    startRematch,
    status: queueStatus,
    stopQueue,
  } = matchmaking;
  const status =
    queueStatus === "error"
      ? "Could not join queue"
      : rematchWith && elapsed < REMATCH_FALLBACK_SECONDS
        ? "Waiting for your last opponent..."
        : statusCopy[Math.min(Math.floor(elapsed / 8), statusCopy.length - 1)];

  useEffect(() => {
    const interval = window.setInterval(
      () => setElapsed((current) => current + 1),
      1000,
    );
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    elapsedRef.current = elapsed;
  }, [elapsed]);

  // Matching only runs when joinQueue is called, so two players already sitting
  // in the queue never get paired (and the rating band never re-widens) until
  // someone new joins. Re-run joinQueue on a timer while queued to close that
  // gap. Read-only guards live in refs so this effect doesn't re-subscribe each
  // second. Rematch has its own fallback path, so leave it alone here.
  useEffect(() => {
    if (rematchWith || queueStatus !== "queued" || queue?.source !== "functions") return;
    const interval = window.setInterval(() => {
      // Stop once the bot offer is available at 20s — past there it's the user's
      // call, not more auto-polling.
      if (cancellingRef.current || hasMatchedRef.current || elapsedRef.current >= 20) return;
      startQueue();
    }, 6000);
    return () => window.clearInterval(interval);
  }, [queue?.source, queueStatus, rematchWith, startQueue]);

  useEffect(() => {
    // Wait for the real, restored auth state before ever queueing — firing
    // while auth is still resolving can catch a transient guest/anonymous
    // identity that a moment later flips to the actual signed-in account,
    // leaving a stray queue entry (and game) behind under the wrong identity.
    if (!isReady) return;
    if (rematchWith) {
      startRematch(rematchWith);
      return;
    }
    startQueue();
  }, [isReady, rematchWith, startQueue, startRematch]);

  useEffect(() => {
    if (queueStatus === "matched" && queue?.gameId) {
      hasMatchedRef.current = true;
      router.push(`/game?gameId=${encodeURIComponent(queue.gameId)}`);
      return;
    }
    if (queueStatus !== "queued" || elapsed < 18 || queue?.source !== "local") return;
    const timeout = window.setTimeout(() => router.push("/game?gameId=local"), 900);
    return () => window.clearTimeout(timeout);
  }, [elapsed, queue, queueStatus, router]);

  useEffect(() => {
    if (rematchFallbackRef.current || cancellingRef.current) return;
    if (
      !rematchWith ||
      queueStatus !== "queued" ||
      elapsed < REMATCH_FALLBACK_SECONDS ||
      queue?.source !== "functions"
    ) {
      return;
    }
    rematchFallbackRef.current = true;
    startQueue();
  }, [elapsed, queue?.source, queueStatus, rematchWith, startQueue]);

  const showBotOffer =
    !botOfferDismissed &&
    !isCancelling &&
    queueStatus === "queued" &&
    elapsed >= 20 &&
    queue?.source === "functions";

  return (
    <AppScreen>
      <BrandHeader title="Matchmaking" accentColor={theme.accent} />

      <section className="flex flex-1 flex-col gap-4 py-4">
        <Panel tone="lime" className="space-y-5">
          <DotBoardPreview active />
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="text-3xl font-[340] leading-none">{status}</h2>
              <p className="mt-2 font-mono text-xs uppercase tracking-[0.12em] text-black/60">
                {queue?.queueName ?? queueName}
              </p>
            </div>
            <div className="grid size-14 place-items-center rounded-full bg-black font-mono text-lg text-white">
              {elapsed}s
            </div>
          </div>
        </Panel>

        {error ? (
          <Panel className="space-y-1">
            <p className="text-sm leading-6 text-[#F3C9B6]">{error}</p>
          </Panel>
        ) : null}

        {showBotOffer ? (
          <Panel className="space-y-3">
            <p className="text-sm leading-6">No players found.</p>
            <button
              type="button"
              onClick={() => {
                if (cancellingRef.current) return;
                setBotOfferDismissed(true);
                startBotMatch();
              }}
              className="min-h-11 w-full rounded-full bg-black px-5 text-sm font-medium text-white transition hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C5B0F4]"
            >
              Start bot match
            </button>
          </Panel>
        ) : null}

        <div className="mt-auto grid gap-2">
          <button
            type="button"
            disabled={isCancelling || queueStatus === "matched"}
            onClick={async () => {
              cancellingRef.current = true;
              setIsCancelling(true);
              await stopQueue();
              if (shouldShowInterstitial("queue_to_lobby", isPremium)) {
                await showInterstitial();
              }
              if (hasMatchedRef.current) return;
              router.replace("/lobby");
            }}
            className="min-h-11 rounded-full border border-white/20 bg-[#111111] px-5 text-sm font-medium text-white transition hover:border-white/45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C5B0F4] disabled:cursor-not-allowed disabled:opacity-45"
          >
            {isCancelling ? "Cancelling..." : "Cancel"}
          </button>
        </div>
      </section>
    </AppScreen>
  );
}

function normalizeMode(mode: string): MatchMode {
  if (mode === "3p" || mode === "4p" || mode === "2p") return mode;
  return "quick";
}
