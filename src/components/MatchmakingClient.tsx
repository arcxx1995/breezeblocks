"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ActionLink,
  AppScreen,
  BrandHeader,
  DotBoardPreview,
  Panel,
} from "@/components/AppShell";
import { useAuth } from "@/components/AuthProvider";
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
  const { player } = useAuth();
  const { profile } = usePlayerProfile();
  const isPremium = profile?.isPremium === true;
  const theme = getTheme(profile?.activeThemeId ?? "classic");
  const [elapsed, setElapsed] = useState(0);
  const [isCancelling, setIsCancelling] = useState(false);
  const botRequestedRef = useRef(false);
  const rematchFallbackRef = useRef(false);
  const matchMode = normalizeMode(mode);
  const matchmaking = useMatchmaking(matchMode);
  const {
    error,
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
    if (rematchWith) {
      startRematch(rematchWith);
      return;
    }
    startQueue();
  }, [rematchWith, startQueue, startRematch]);

  useEffect(() => {
    if (queueStatus === "matched" && queue?.gameId) {
      router.push(`/game?gameId=${encodeURIComponent(queue.gameId)}`);
      return;
    }
    if (queueStatus !== "queued" || elapsed < 18 || queue?.source !== "local") return;
    const timeout = window.setTimeout(() => router.push("/game?gameId=local"), 900);
    return () => window.clearTimeout(timeout);
  }, [elapsed, queue, queueStatus, router]);

  useEffect(() => {
    if (rematchFallbackRef.current) return;
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

  useEffect(() => {
    if (botRequestedRef.current) return;
    if (queueStatus !== "queued" || elapsed < 20 || queue?.source !== "functions") return;
    botRequestedRef.current = true;
    startBotMatch();
  }, [elapsed, queue?.source, queueStatus, startBotMatch]);

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

        <Panel className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold">Your color</span>
            <span className="size-5 rounded-full bg-[#C5B0F4]" />
          </div>
          <p className="text-sm leading-6 text-white/65">
            {player.provider === "google"
              ? "Signed queue tries live players first, then starts a bot match if the wait runs long."
              : "Anonymous queue tries guests first, then starts a bot match if the wait runs long."}
          </p>
          {error ? (
            <p className="text-sm leading-6 text-[#F3C9B6]">{error}</p>
          ) : null}
        </Panel>

        {elapsed >= 16 ? (
          <Panel tone="cream" className="space-y-3">
            <h2 className="text-xl font-bold">
              {elapsed >= 20 ? "Adding a bot player." : "Taking longer than usual."}
            </h2>
            <div className="grid gap-2">
              <ActionLink href="/matchmaking?mode=quick">Try Quick Match</ActionLink>
              <ActionLink href="/matchmaking?mode=2p" variant="secondary">
                Switch to 2-player mode
              </ActionLink>
            </div>
          </Panel>
        ) : null}

        <div className="mt-auto grid gap-2">
          <ActionLink href="/game?gameId=local">Open Local Prototype</ActionLink>
          <button
            type="button"
            disabled={isCancelling}
            onClick={async () => {
              setIsCancelling(true);
              await stopQueue();
              if (shouldShowInterstitial("queue_to_lobby", isPremium)) {
                await showInterstitial();
              }
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
