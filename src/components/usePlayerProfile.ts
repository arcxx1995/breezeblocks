"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import {
  claimDailyLogin,
  getMatchHistory,
  getPlayerProfile,
  selectTheme as selectThemeCallable,
  unlockTheme as unlockThemeCallable,
  type MatchHistoryEntry,
  type PlayerProfile,
} from "@/lib/firebase/profile";

export function usePlayerProfile() {
  const { player, isConfigured } = useAuth();
  const [profileState, setProfileState] = useState<{
    userId: string;
    profile: PlayerProfile | null;
  } | null>(null);
  const [historyState, setHistoryState] = useState<{
    userId: string;
    history: MatchHistoryEntry[];
  } | null>(null);
  const [errorState, setErrorState] = useState<{
    userId: string;
    message: string;
  } | null>(null);

  useEffect(() => {
    if (!isConfigured || player.provider !== "google" || !player.uid) return;

    const userId = player.uid;
    let ignore = false;

    Promise.all([getPlayerProfile(userId), getMatchHistory(userId)])
      .then(([nextProfile, nextHistory]) => {
        if (ignore) return;
        setProfileState({ userId, profile: nextProfile });
        setHistoryState({ userId, history: nextHistory });
      })
      .catch((caught: unknown) => {
        if (ignore) return;
        setErrorState({
          userId,
          message: caught instanceof Error ? caught.message : "Could not load profile.",
        });
      });

    return () => {
      ignore = true;
    };
  }, [isConfigured, player.provider, player.uid]);

  const activeUserId =
    isConfigured && player.provider === "google" ? player.uid : null;

  const profile =
    activeUserId && profileState?.userId === activeUserId
      ? profileState.profile
      : null;

  const claimDaily = useCallback(async () => {
    if (!activeUserId) return null;
    const result = await claimDailyLogin();
    if (!result) return null;
    setProfileState((current) =>
      current && current.userId === activeUserId && current.profile
        ? {
            userId: activeUserId,
            profile: {
              ...current.profile,
              sparks: current.profile.sparks + result.reward,
              loginStreak: result.loginStreak,
              lastLoginClaimAtMillis: result.claimedAt,
            },
          }
        : current,
    );
    return result;
  }, [activeUserId]);

  const unlockTheme = useCallback(
    async (themeId: string) => {
      if (!activeUserId) return null;
      const result = await unlockThemeCallable(themeId);
      if (!result) return null;
      setProfileState((current) =>
        current && current.userId === activeUserId && current.profile
          ? {
              userId: activeUserId,
              profile: {
                ...current.profile,
                sparks: result.remainingSparks,
                unlockedThemes: [...current.profile.unlockedThemes, result.themeId],
                activeThemeId: result.themeId,
              },
            }
          : current,
      );
      return result;
    },
    [activeUserId],
  );

  const selectTheme = useCallback(
    async (themeId: string) => {
      if (!activeUserId) return null;
      const result = await selectThemeCallable(themeId);
      if (!result) return null;
      setProfileState((current) =>
        current && current.userId === activeUserId && current.profile
          ? {
              userId: activeUserId,
              profile: { ...current.profile, activeThemeId: result.themeId },
            }
          : current,
      );
      return result;
    },
    [activeUserId],
  );

  return {
    profile,
    history:
      activeUserId && historyState?.userId === activeUserId
        ? historyState.history
        : [],
    error:
      activeUserId && errorState?.userId === activeUserId
        ? errorState.message
        : null,
    isSignedIn: player.provider === "google",
    claimDaily,
    unlockTheme,
    selectTheme,
  };
}
