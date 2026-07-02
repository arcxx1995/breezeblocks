"use client";

import { useState } from "react";
import {
  ActionLink,
  AppScreen,
  DotBoardPreview,
  Panel,
} from "@/components/AppShell";
import { AuthActionButton, AuthNotice } from "@/components/AuthActions";
import { markOnboardingComplete } from "@/lib/onboarding";

const slides = [
  {
    title: "Welcome to Breezeblocks",
    copy: "Draw lines, capture boxes, and outthink your opponents.",
    cta: "Start",
    tone: "lilac",
  },
  {
    title: "Draw a Line",
    copy: "Connect neighboring dots. Lines can only be horizontal or vertical.",
    cta: "Next",
    tone: "lime",
  },
  {
    title: "Complete the Fourth Side",
    copy: "When your line completes a box, that box becomes yours.",
    cta: "Capture",
    tone: "cream",
  },
  {
    title: "Every Box Is 1 Point",
    copy: "Capture boxes to increase your score. The player with the most boxes wins.",
    cta: "Nice",
    tone: "pink",
  },
  {
    title: "Capture and Continue",
    copy: "If you capture a box, you get another turn with a fresh timer.",
    cta: "Next",
    tone: "lilac",
  },
  {
    title: "Move Before Time Runs Out",
    copy: "You get 20 seconds to draw a line. If you do not move, your turn is skipped.",
    cta: "Got it",
    tone: "lime",
  },
  {
    title: "Play With 2-4 Players",
    copy: "Every player gets a color. Take turns, set traps, and capture the board.",
    cta: "Continue",
    tone: "cream",
  },
] as const;

export function OnboardingFlow() {
  const [index, setIndex] = useState(0);
  const slide = slides[index];
  const isLast = index === slides.length;

  if (isLast) {
    return (
      <AppScreen>
        <div className="flex flex-1 flex-col gap-5 py-4">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-[#DCEEB1]">
            Breezeblocks
          </p>
          <Panel tone="lilac" className="space-y-5">
            <DotBoardPreview active />
            <div>
              <h1 className="text-4xl font-[340] leading-none">
                Play Your Way
              </h1>
              <p className="mt-3 text-base leading-7 text-black/70">
                Anonymous players match only with anonymous players. Signed-in
                players save wins, boxes, and profile stats.
              </p>
            </div>
          </Panel>
          <div className="grid gap-2">
            <AuthActionButton
              action="anonymous"
              onBeforeAction={markOnboardingComplete}
            >
              Play Anonymously
            </AuthActionButton>
            <AuthActionButton
              action="google"
              variant="secondary"
              onBeforeAction={markOnboardingComplete}
            >
              Sign in with Google
            </AuthActionButton>
            <AuthNotice />
          </div>
        </div>
      </AppScreen>
    );
  }

  return (
    <AppScreen>
      <div className="flex flex-1 flex-col gap-5 py-4">
        <div className="flex items-center justify-between">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-[#DCEEB1]">
            Breezeblocks
          </p>
          <p className="font-mono text-xs text-white/45">
            {index + 1}/{slides.length}
          </p>
        </div>

        <Panel tone={slide.tone} className="space-y-5">
          <DotBoardPreview active={index > 0} />
          <div>
            <h1 className="text-4xl font-[340] leading-none">
              {slide.title}
            </h1>
            <p className="mt-3 text-base leading-7 text-black/70">
              {slide.copy}
            </p>
          </div>
        </Panel>

        <div className="mt-auto grid gap-2">
          <button
            type="button"
            onClick={() => setIndex((current) => current + 1)}
            className="min-h-11 rounded-full bg-white px-5 text-sm font-medium text-black transition hover:bg-[#F4ECD6] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C5B0F4]"
          >
            {slide.cta}
          </button>
          <ActionLink
            href="/lobby"
            variant="ghost"
            onClick={markOnboardingComplete}
          >
            Skip
          </ActionLink>
        </div>
      </div>
    </AppScreen>
  );
}
