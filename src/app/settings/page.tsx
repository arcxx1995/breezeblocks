"use client";

import Link from "next/link";
import {
  ActionLink,
  AppScreen,
  BottomNav,
  Panel,
} from "@/components/AppShell";
import { AccountActions } from "@/components/AccountActions";
import { ThemedBrandHeader } from "@/components/ThemedBrandHeader";
import { usePlayerProfile } from "@/components/usePlayerProfile";
import { getTheme } from "@/lib/themes";
import { playFeedbackBeep, useSettingsPrefs, type SettingsPrefs } from "@/lib/settings";

const TOGGLES: { key: keyof SettingsPrefs; label: string }[] = [
  { key: "sound", label: "Sound" },
  { key: "haptics", label: "Haptics" },
  { key: "music", label: "Music" },
  { key: "smoothMotion", label: "Smooth motion" },
];

export default function SettingsPage() {
  const { profile } = usePlayerProfile();
  const theme = getTheme(profile?.activeThemeId ?? "classic");
  const { prefs, toggle } = useSettingsPrefs();

  function handleToggle(key: keyof SettingsPrefs) {
    const next = { ...prefs, [key]: !prefs[key] };
    toggle(key);
    if (next.sound) playFeedbackBeep();
    if (next.haptics && typeof navigator !== "undefined") navigator.vibrate?.(10);
  }

  return (
    <AppScreen nav={<BottomNav />}>
      <ThemedBrandHeader title="Settings" />

      <section className="space-y-4 py-4">
        <Panel
          tone="custom"
          className="divide-y divide-black/20 p-0 text-black"
          style={{ backgroundColor: theme.accent }}
        >
          {TOGGLES.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => handleToggle(key)}
              aria-pressed={prefs[key]}
              className="flex min-h-14 w-full items-center justify-between gap-3 px-4 text-left"
            >
              <span className="font-bold">{label}</span>
              <span
                className={`rounded-full px-3 py-1 text-sm font-medium ${
                  prefs[key] ? "bg-black text-white" : "bg-black/25 text-black/60"
                }`}
              >
                {prefs[key] ? "On" : "Off"}
              </span>
            </button>
          ))}
          <div className="flex min-h-14 items-center justify-between gap-3 px-4">
            <span className="font-bold">Theme</span>
            <span className="rounded-full bg-black px-3 py-1 text-sm font-medium text-white">
              System
            </span>
          </div>
        </Panel>

        <AccountActions />
        <ActionLink href="/shop" variant="secondary">
          Shop
        </ActionLink>

        <div className="flex justify-center gap-2">
          <Link
            href="/privacy"
            className="rounded-full border border-white/20 px-4 py-1.5 text-xs font-medium text-white/70 transition hover:border-white/45 hover:text-white"
          >
            Privacy Policy
          </Link>
          <Link
            href="/terms"
            className="rounded-full border border-white/20 px-4 py-1.5 text-xs font-medium text-white/70 transition hover:border-white/45 hover:text-white"
          >
            Terms of Service
          </Link>
        </div>
      </section>
    </AppScreen>
  );
}
