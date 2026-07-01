"use client";

import { useState } from "react";
import {
  ActionLink,
  AppScreen,
  BottomNav,
  BrandHeader,
  Panel,
  StatStrip,
} from "@/components/AppShell";
import { AuthNotice } from "@/components/AuthActions";
import { useAuth } from "@/components/AuthProvider";
import { usePlayerProfile } from "@/components/usePlayerProfile";
import { getTheme } from "@/lib/themes";

const modes = [
  { label: "Quick Match", href: "/matchmaking?mode=quick" },
  { label: "2 Players", href: "/matchmaking?mode=2p" },
  { label: "3 Players", href: "/matchmaking?mode=3p" },
  { label: "4 Players", href: "/matchmaking?mode=4p" },
];

// Mirrors functions/src/index.ts minClaimGapMillis so the button reflects
// today's claim state on load instead of waiting for a failed claim attempt.
const DAILY_CLAIM_GAP_MILLIS = 20 * 60 * 60 * 1000;

export function LobbyClient() {
  const { player } = useAuth();
  const { profile, isSignedIn, claimDaily } = usePlayerProfile();
  const theme = getTheme(profile?.activeThemeId ?? "classic");
  const [claiming, setClaiming] = useState(false);
  const [claimedReward, setClaimedReward] = useState<number | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [now] = useState(() => Date.now());
  const claimedToday = profile
    ? now - profile.lastLoginClaimAtMillis < DAILY_CLAIM_GAP_MILLIS
    : false;
  const initials = player.displayName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  async function handleClaimDaily() {
    setClaiming(true);
    setClaimError(null);
    try {
      const result = await claimDaily();
      if (result) {
        setClaimedReward(result.reward);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not claim reward.";
      if (!message.toLowerCase().includes("already claimed")) {
        setClaimError(message);
      }
    } finally {
      setClaiming(false);
    }
  }

  return (
    <AppScreen>
      <BrandHeader
        title="Lobby"
        accentColor={theme.accent}
        action={
          <ActionLink href="/settings" variant="secondary">
            Settings
          </ActionLink>
        }
      />

      <section className="space-y-4 py-4">
        <Panel tone="lilac" className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="grid size-12 place-items-center rounded-full bg-black font-mono text-sm text-white">
              {initials}
            </div>
            <div>
              <h2 className="text-2xl font-bold leading-tight">
                {player.displayName}
              </h2>
              <p className="text-sm text-black/65">
                {player.provider === "google"
                  ? "Signed in. Your wins, boxes, and games are saved."
                  : "Playing as Guest. You will only match with other anonymous players."}
              </p>
            </div>
          </div>
          <StatStrip
            stats={[
              {
                label: "Wins",
                value: isSignedIn ? String(profile?.totalWins ?? 0) : "--",
              },
              {
                label: "Boxes",
                value: isSignedIn ? String(profile?.totalBoxesWon ?? 0) : "--",
              },
              {
                label: "Games",
                value: isSignedIn ? String(profile?.totalGamesPlayed ?? 0) : "--",
              },
            ]}
          />
          <AuthNotice dark />
        </Panel>

        <Panel tone="lime" className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">Daily Reward</h2>
              <p className="text-sm text-black/65">
                {isSignedIn
                  ? `${profile?.sparks ?? 0} Sparks · Day ${profile?.loginStreak ?? 0} streak`
                  : "Sign in to earn Sparks and unlock themes."}
              </p>
            </div>
            {isSignedIn && (
              <button
                type="button"
                onClick={handleClaimDaily}
                disabled={claimedToday || claiming}
                className="flex min-h-11 shrink-0 items-center justify-center rounded-full bg-black px-4 text-sm font-medium text-white transition disabled:opacity-40"
              >
                {claiming ? "Claiming..." : claimedToday ? "Claimed" : "Claim"}
              </button>
            )}
          </div>
          {claimedReward !== null && (
            <p className="text-sm font-medium text-black">+{claimedReward} Sparks!</p>
          )}
          {claimError && <p className="text-sm text-black/70">{claimError}</p>}
        </Panel>

        <ActionLink href="/matchmaking?mode=quick">Find Match</ActionLink>

        <section className="grid grid-cols-2 gap-2">
          {modes.map((mode) => (
            <ActionLink key={mode.href} href={mode.href} variant="secondary">
              {mode.label}
            </ActionLink>
          ))}
        </section>

        <section className="grid grid-cols-2 gap-2">
          <Panel className="space-y-3">
            <h2 className="text-lg font-bold">How to Play</h2>
            <ActionLink href="/how-to-play" variant="ghost">
              Open
            </ActionLink>
          </Panel>
          <Panel className="space-y-3">
            <h2 className="text-lg font-bold">Profile</h2>
            <ActionLink href="/profile" variant="ghost">
              Open
            </ActionLink>
          </Panel>
        </section>
      </section>

      <BottomNav />
    </AppScreen>
  );
}
