const MATCH_INTERVAL = 3;
const MATCH_COUNTER_KEY = "breezeblocks:ad-match-counter";
const STUB_AD_MILLIS = 3000;

export type AdSlot = "queue_to_lobby" | "post_match";

/**
 * ponytail: no ad network is installed yet (no @capacitor-community/admob or
 * similar dependency). These functions decide WHEN an ad should show and stub
 * out the actual playback with a timed promise, so the gating flow (free vs
 * premium, cadence, blocking only the free client) is real and testable.
 * Swap showInterstitial/showRewarded for real SDK calls once an ad network is
 * chosen; nothing else in the call sites needs to change.
 */

export function shouldShowInterstitial(slot: AdSlot, isPremium: boolean): boolean {
  if (isPremium) return false;
  if (slot === "post_match") return isMatchIntervalDue();
  return true;
}

export function showInterstitial(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, STUB_AD_MILLIS));
}

export function showRewarded(): Promise<{ granted: boolean }> {
  return new Promise((resolve) => {
    window.setTimeout(() => resolve({ granted: true }), STUB_AD_MILLIS);
  });
}

function isMatchIntervalDue(): boolean {
  if (typeof window === "undefined") return false;
  const next = readMatchCounter() + 1;
  window.localStorage.setItem(MATCH_COUNTER_KEY, String(next));
  return next % MATCH_INTERVAL === 0;
}

function readMatchCounter(): number {
  const raw = window.localStorage.getItem(MATCH_COUNTER_KEY);
  const value = raw ? Number(raw) : 0;
  return Number.isFinite(value) ? value : 0;
}
