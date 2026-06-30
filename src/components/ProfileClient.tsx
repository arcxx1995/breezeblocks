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

export function ProfileClient() {
  const { player } = useAuth();
  const isSignedIn = player.provider === "google";
  const initials = player.displayName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <AppScreen>
      <BrandHeader title="Profile" />

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
                  ? "Your permanent Breezeblocks profile is ready for stats."
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
            { label: "Wins", value: "0" },
            { label: "Boxes", value: "0" },
            { label: "Games", value: "0" },
          ]}
        />

        <Panel className="space-y-3">
          <h2 className="text-lg font-bold">Recent matches</h2>
          {["Local prototype", "No saved online games yet"].map((item) => (
            <div
              key={item}
              className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-white/70"
            >
              {item}
            </div>
          ))}
        </Panel>
      </section>

      <BottomNav />
    </AppScreen>
  );
}
