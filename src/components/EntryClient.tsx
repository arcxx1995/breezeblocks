"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ActionLink,
  AppScreen,
  DotBoardPreview,
  Panel,
} from "@/components/AppShell";
import { useAuth } from "@/components/AuthProvider";

export function EntryClient() {
  const router = useRouter();
  const { isReady } = useAuth();

  useEffect(() => {
    if (!isReady) return;

    const onboardingComplete =
      window.localStorage.getItem("breezeblocks:onboarding-complete") ===
      "true";

    const timeout = window.setTimeout(() => {
      router.replace(onboardingComplete ? "/lobby" : "/onboarding");
    }, 900);

    return () => window.clearTimeout(timeout);
  }, [isReady, router]);

  return (
    <AppScreen>
      <div className="flex flex-1 flex-col justify-between gap-6 py-4">
        <section className="space-y-5">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-[#DCEEB1]">
              Breezeblocks
            </p>
            <h1 className="mt-2 text-5xl font-[340] leading-none text-white">
              Setting up the board
            </h1>
          </div>

          <Panel tone="lilac">
            <DotBoardPreview active />
          </Panel>

          <div className="grid grid-cols-4 gap-2">
            {["#C5B0F4", "#DCEEB1", "#F4ECD6", "#EFD4D4"].map((color) => (
              <span
                key={color}
                className="h-2 rounded-full"
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <p className="text-base leading-7 text-white/65">
            {isReady
              ? "Routing you to the right place..."
              : "Restoring session and counting the dots..."}
          </p>
          <div className="grid gap-2">
            <ActionLink href="/onboarding">Start</ActionLink>
            <ActionLink href="/lobby" variant="secondary">
              Skip to lobby
            </ActionLink>
          </div>
        </section>
      </div>
    </AppScreen>
  );
}
