const ONBOARDING_COMPLETE_KEY = "breezeblocks:onboarding-complete";

export function isOnboardingComplete(): boolean {
  return window.localStorage.getItem(ONBOARDING_COMPLETE_KEY) === "true";
}

export function markOnboardingComplete(): void {
  window.localStorage.setItem(ONBOARDING_COMPLETE_KEY, "true");
}
