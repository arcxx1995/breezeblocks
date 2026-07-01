"use client";

import {
  AppScreen,
  BottomNav,
  BrandHeader,
  Panel,
  StatStrip,
} from "@/components/AppShell";
import { AuthActionButton, AuthNotice } from "@/components/AuthActions";
import { useAuth } from "@/components/AuthProvider";
import { usePlayerProfile } from "@/components/usePlayerProfile";
import { getTheme } from "@/lib/themes";

export function ProfileClient() {
  const { player } = useAuth();
  const { error, history, isSignedIn, profile } = usePlayerProfile();
  const theme = getTheme(profile?.activeThemeId ?? "classic");
  const initials = player.displayName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <AppScreen>
      <BrandHeader title="Profile" accentColor={theme.accent} />

      <section className="space-y-4 py-4">
        <Panel tone="cream" className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="grid size-14 place-items-center rounded-full bg-black font-mono text-white">
              {initials}
            </div>
            <div>
              <h2 className="text-2xl font-bold leading-tight">
                {player.displayName}
              </h2>
              <p className="text-sm text-black/65">
                {isSignedIn
                  ? "Your permanent Breezeblocks profile is tracking every signed match."
                  : "Create a profile to save your wins, boxes, and match history."}
              </p>
            </div>
          </div>
          {isSignedIn ? (
            <AuthActionButton action="signOut" variant="secondary">
              Sign out
            </AuthActionButton>
          ) : (
            <AuthActionButton action="google">Sign in with Google</AuthActionButton>
          )}
          <AuthNotice dark />
        </Panel>

        <StatStrip
          stats={[
            { label: "Wins", value: String(profile?.totalWins ?? 0) },
            { label: "Boxes", value: String(profile?.totalBoxesWon ?? 0) },
            { label: "Games", value: String(profile?.totalGamesPlayed ?? 0) },
          ]}
        />

        <Panel className="space-y-3">
          <h2 className="text-lg font-bold">Recent matches</h2>
          {error ? (
            <p className="text-sm leading-6 text-[#F3C9B6]">{error}</p>
          ) : null}
          {!isSignedIn ? (
            <p className="text-sm leading-6 text-white/65">
              Guest matches are playable but are not saved to permanent history.
            </p>
          ) : null}
          {isSignedIn && history.length === 0 ? (
            <p className="text-sm leading-6 text-white/65">
              No completed signed matches yet.
            </p>
          ) : null}
          {history.map((item) => (
            <div
              key={item.matchId}
              className="rounded-lg border border-white/10 bg-white/5 p-3"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-white">
                    {formatResult(item.result)} · {item.score} boxes
                  </p>
                  <p className="truncate font-mono text-[10px] uppercase tracking-[0.12em] text-white/40">
                    Room {item.gameId}
                  </p>
                </div>
                <span className="shrink-0 font-mono text-xs text-white/55">
                  {formatMatchDate(item.completedAt)}
                </span>
              </div>
            </div>
          ))}
        </Panel>
      </section>

      <BottomNav />
    </AppScreen>
  );
}

function formatResult(result: "win" | "loss" | "draw") {
  if (result === "win") return "Win";
  if (result === "loss") return "Loss";
  return "Draw";
}

function formatMatchDate(value: unknown) {
  const date =
    value && typeof value === "object" && "toDate" in value
      ? (value as { toDate: () => Date }).toDate()
      : null;

  if (!date) return "Done";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(date);
}
