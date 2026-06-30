"use client";

import { useEffect, useState } from "react";
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
import type { MatchMode } from "@/lib/matchmaking/types";

const statusCopy = [
  "Finding players...",
  "Waiting for 1 more player...",
  "Match found!",
  "Building the board...",
];

export function MatchmakingClient({ mode }: { mode: string }) {
  const router = useRouter();
  const { player } = useAuth();
  const [elapsed, setElapsed] = useState(0);
  const matchMode = normalizeMode(mode);
  const matchmaking = useMatchmaking(matchMode);
  const {
    error,
    queue,
    queueName,
    startQueue,
    status: queueStatus,
    stopQueue,
  } = matchmaking;
  const status =
    queueStatus === "error"
      ? "Could not join queue"
      : statusCopy[Math.min(Math.floor(elapsed / 8), statusCopy.length - 1)];

  useEffect(() => {
    const interval = window.setInterval(
      () => setElapsed((current) => current + 1),
      1000,
    );
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    startQueue();
  }, [startQueue]);

  useEffect(() => {
    if (queueStatus === "matched" && queue?.gameId) {
      router.push(`/game/${queue.gameId}`);
      return;
    }
    if (queueStatus !== "queued" || elapsed < 18 || queue?.source !== "local") return;
    const timeout = window.setTimeout(() => router.push("/game/local"), 900);
    return () => window.clearTimeout(timeout);
  }, [elapsed, queue, queueStatus, router]);

  return (
    <AppScreen>
      <BrandHeader title="Matchmaking" />

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
              ? "Signed queue keeps profile players together until Firebase matchmaking is connected."
              : "Anonymous queue keeps guest players together until Firebase matchmaking is connected."}
          </p>
          {error ? (
            <p className="text-sm leading-6 text-[#F3C9B6]">{error}</p>
          ) : null}
        </Panel>

        {elapsed >= 30 ? (
          <Panel tone="cream" className="space-y-3">
            <h2 className="text-xl font-bold">Taking longer than usual.</h2>
            <div className="grid gap-2">
              <ActionLink href="/matchmaking?mode=quick">Try Quick Match</ActionLink>
              <ActionLink href="/matchmaking?mode=2p" variant="secondary">
                Switch to 2-player mode
              </ActionLink>
            </div>
          </Panel>
        ) : null}

        <div className="mt-auto grid gap-2">
          <ActionLink href="/game/local">Open Local Prototype</ActionLink>
          <button
            type="button"
            onClick={() => {
              stopQueue();
              router.push("/lobby");
            }}
            className="min-h-11 rounded-full border border-white/20 bg-[#111111] px-5 text-sm font-medium text-white transition hover:border-white/45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C5B0F4]"
          >
            Cancel
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
