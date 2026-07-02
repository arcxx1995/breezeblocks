"use client";

import { useState } from "react";

export type SettingsPrefs = {
  sound: boolean;
  music: boolean;
  haptics: boolean;
  smoothMotion: boolean;
};

const DEFAULTS: SettingsPrefs = {
  sound: true,
  music: false,
  haptics: true,
  smoothMotion: true,
};

const STORAGE_KEYS: Record<keyof SettingsPrefs, string> = {
  sound: "breezeblocks:sound",
  music: "breezeblocks:music",
  haptics: "breezeblocks:haptics",
  smoothMotion: "breezeblocks:smooth-motion",
};

function readPrefs(): SettingsPrefs {
  const prefs = { ...DEFAULTS };
  for (const key of Object.keys(STORAGE_KEYS) as (keyof SettingsPrefs)[]) {
    const raw = window.localStorage.getItem(STORAGE_KEYS[key]);
    if (raw !== null) prefs[key] = raw === "true";
  }
  return prefs;
}

export function useSettingsPrefs() {
  // ponytail: lazy-init reads localStorage during hydration, so a returning
  // user with non-default prefs can see one flash of default text. Move to
  // useSyncExternalStore if that flash becomes visibly annoying.
  const [prefs, setPrefs] = useState<SettingsPrefs>(() =>
    typeof window === "undefined" ? DEFAULTS : readPrefs(),
  );

  function toggle(key: keyof SettingsPrefs) {
    setPrefs((current) => {
      const next = { ...current, [key]: !current[key] };
      window.localStorage.setItem(STORAGE_KEYS[key], String(next[key]));
      return next;
    });
  }

  return { prefs, toggle };
}

type WindowWithWebkitAudio = Window & { webkitAudioContext?: typeof AudioContext };

export function playFeedbackBeep() {
  const Ctx = window.AudioContext ?? (window as WindowWithWebkitAudio).webkitAudioContext;
  if (!Ctx) return;
  const ctx = new Ctx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = 660;
  gain.gain.setValueAtTime(0.08, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.12);
}
