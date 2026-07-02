"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ActionLink,
  AppScreen,
  BrandHeader,
  Panel,
  StatStrip,
} from "@/components/AppShell";
import { useAuth } from "@/components/AuthProvider";
import { usePlayerProfile } from "@/components/usePlayerProfile";
import { hasFirebaseConfig } from "@/lib/firebase/client";
import {
  getOnlineGame,
  type OnlineGameSnapshot,
} from "@/lib/firebase/games";
import { shouldShowInterstitial, showInterstitial, showRewarded } from "@/lib/ads/adGate";
import { getTheme } from "@/lib/themes";

export function ResultClient({ fallbackGameId = "local" }: { fallbackGameId?: string }) {
  const searchParams = useSearchParams();
    const gameId = searchParams.get("gameId") ?? fallbackGameId;
    const [snapshotState, setSnapshotState] = useState<{
    gameId: string;
    snapshot: OnlineGameSnapshot;
  } | null>(null);
  const [errorState, setErrorState] = useState<{
    gameId: string;
    message: string;
  } | null>(null);
  const { player } = useAuth();
  const { profile } = usePlayerProfile();
  const isPremium = profile?.isPremium === true;
  const theme = getTheme(profile?.activeThemeId ?? "classic");
  const [adState, setAdState] = useState<"idle" | "showing" | "done">("idle");
  const adDecidedForGameRef = useRef<string | null>(null);

  useEffect(() => {
    if (gameId === "local" || !hasFirebaseConfig()) return;
    let ignore = false;

    getOnlineGame(gameId)
      .then((nextSnapshot) => {
        if (ignore) return;
        setSnapshotState({ gameId, snapshot: nextSnapshot });
      })
      .catch((caught: unknown) => {
        if (ignore) return;
        setErrorState({
          gameId,
          message: caught instanceof Error ? caught.message : "Could not load result.",
        });
      });

    return () => {
      ignore = true;
    };
  }, [gameId]);

  const snapshot =
    snapshotState?.gameId === gameId ? snapshotState.snapshot : null;
  const error = errorState?.gameId === gameId ? errorState.message : null;
  const players = useMemo(
    () =>
      (snapshot?.players ?? [])
        .map((player) => ({
          playerId: String(player.playerId ?? player.id),
          displayName: String(player.displayName ?? "Player"),
          score: Number(player.score ?? 0),
        }))
        .sort((a, b) => b.score - a.score),
    [snapshot],
  );
  const game = snapshot?.game;
  const winnerIds = Array.isArray(game?.winnerPlayerIds)
    ? game?.winnerPlayerIds.map(String)
    : [];
  const winners = players.filter((player) => winnerIds.includes(player.playerId));
  const visibleStats =
    players.length > 0
      ? players.slice(0, 3).map((player) => ({
          label: player.displayName,
          value: String(player.score),
        }))
      : gameId === "local"
        ? [
            { label: "Mode", value: "Local" },
            { label: "Stats", value: "--" },
            { label: "History", value: "--" },
          ]
        : [
            { label: "Players", value: "--" },
            { label: "Boxes", value: "--" },
            { label: "State", value: "..." },
          ];
  const title =
    gameId === "local"
      ? "Local match complete"
      : winners.length === 0
        ? "Match result"
        : winners.length === 1
          ? `${winners[0].displayName} wins`
          : "Draw game";
  const isOnlineMatchOver = gameId !== "local" && game?.status === "completed";
  const opponent = players.find((entry) => entry.playerId !== player.uid) ?? null;
  const rematchMode = matchModeForPlayerCount(Number(game?.playerCount ?? 2));
  const isPremiumStatusSettled = player.provider !== "google" || profile !== null;

  useEffect(() => {
    if (!isOnlineMatchOver || !isPremiumStatusSettled || adDecidedForGameRef.current === gameId) {
      return;
    }
    adDecidedForGameRef.current = gameId;

    const needsAd = shouldShowInterstitial("post_match", isPremium);
    let ignore = false;

    Promise.resolve().then(() => {
      if (!ignore && needsAd) setAdState("showing");
    });
    const wait = needsAd ? showInterstitial() : Promise.resolve();
    wait.then(() => {
      if (!ignore) setAdState("done");
    });
    return () => {
      ignore = true;
    };
  }, [gameId, isOnlineMatchOver, isPremium, isPremiumStatusSettled]);

  const isGatedByAd = isOnlineMatchOver && adState === "showing";

  return (
    <AppScreen>
      <BrandHeader title="Result" accentColor={theme.accent} />

      <section className="flex flex-1 flex-col gap-4 py-4">
        <Panel tone="lilac" className="space-y-4">
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-black/60">
            Room {gameId}
          </p>
          <h2 className="text-5xl font-[340] leading-none">{title}</h2>
          <p className="text-base leading-7 text-black/70">
            {gameId === "local"
              ? "Local prototype matches stay on this device and do not update saved stats."
              : game?.status === "completed"
                ? "Signed player stats and match history are saved automatically."
                : "This result will finalize when the online game completes."}
          </p>
        </Panel>

        {error ? (
          <Panel className="text-sm leading-6 text-[#F3C9B6]">{error}</Panel>
        ) : null}

        <StatStrip stats={visibleStats} />

        {players.length > 3 ? (
          <Panel className="space-y-2">
            <h2 className="text-lg font-bold">Final scores</h2>
            {players.map((player) => (
              <div
                key={player.playerId}
                className="flex items-center justify-between rounded-lg bg-white/5 p-3 text-sm"
              >
                <span className="truncate text-white/75">{player.displayName}</span>
                <span className="font-mono text-white">{player.score}</span>
              </div>
            ))}
          </Panel>
        ) : null}

        {isGatedByAd ? (
          <Panel tone="cream" className="space-y-3">
            <h2 className="text-lg font-bold">Ad break</h2>
            <p className="text-sm leading-6 text-black/70">
              Free players see a short ad here every few matches. This doesn&apos;t hold up
              anyone else&apos;s game.
            </p>
            <button
              type="button"
              onClick={() => {
                showRewarded().then(() => setAdState("done"));
              }}
              className="min-h-11 w-full rounded-full bg-black px-5 text-sm font-medium text-white transition hover:bg-black/80"
            >
              Watch a bonus ad to skip
            </button>
          </Panel>
        ) : null}

        <div className="mt-auto grid gap-2">
          {isGatedByAd ? null : (
            <>
              {isOnlineMatchOver && opponent && players.length === 2 ? (
                // Single-opponent rematch only makes sense head-to-head; for 3-4p
                // re-queue the same mode instead of targeting one player.
                <ActionLink
                  href={`/matchmaking?mode=${rematchMode}&rematchWith=${encodeURIComponent(opponent.playerId)}`}
                >
                  Rematch {opponent.displayName}
                </ActionLink>
              ) : isOnlineMatchOver && players.length > 2 ? (
                <ActionLink href={`/matchmaking?mode=${rematchMode}`}>
                  Rematch ({players.length}P)
                </ActionLink>
              ) : null}
              <ActionLink
                href="/matchmaking?mode=quick"
                variant={isOnlineMatchOver ? "secondary" : "primary"}
              >
                {isOnlineMatchOver ? "New Match" : "Play Again"}
              </ActionLink>
            </>
          )}
          <ActionLink href="/lobby" variant="secondary">
            Back to Lobby
          </ActionLink>
          <ActionLink href="/profile" variant="ghost">
            View Profile
          </ActionLink>
        </div>
      </section>
    </AppScreen>
  );
}

function matchModeForPlayerCount(playerCount: number): "2p" | "3p" | "4p" {
  if (playerCount === 3) return "3p";
  if (playerCount === 4) return "4p";
  return "2p";
}
