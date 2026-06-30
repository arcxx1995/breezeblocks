"use client";

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

const modes = [
  { label: "Quick Match", href: "/matchmaking?mode=quick" },
  { label: "2 Players", href: "/matchmaking?mode=2p" },
  { label: "3 Players", href: "/matchmaking?mode=3p" },
  { label: "4 Players", href: "/matchmaking?mode=4p" },
];

export function LobbyClient() {
  const { player } = useAuth();
  const initials = player.displayName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <AppScreen>
      <BrandHeader
        title="Lobby"
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
                  ? "Signed in. Your wins and boxes will be saved when stats are connected."
                  : "Playing as Guest. You will only match with other anonymous players."}
              </p>
            </div>
          </div>
          <StatStrip
            stats={[
              { label: "Wins", value: player.provider === "google" ? "0" : "--" },
              { label: "Boxes", value: player.provider === "google" ? "0" : "--" },
              { label: "Games", value: player.provider === "google" ? "0" : "--" },
            ]}
          />
          <AuthNotice dark />
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
