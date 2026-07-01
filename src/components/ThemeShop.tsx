"use client";

import { useState } from "react";
import { Panel } from "@/components/AppShell";
import { usePlayerProfile } from "@/components/usePlayerProfile";
import { THEMES, type Theme } from "@/lib/themes";

export function ThemeShop() {
  const { profile, isSignedIn, unlockTheme, selectTheme } = usePlayerProfile();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isSignedIn) {
    return (
      <p className="text-sm text-white/60">
        Sign in to unlock themes with Sparks earned from daily logins and matches.
      </p>
    );
  }

  const unlockedThemes = profile?.unlockedThemes ?? ["classic"];
  const activeThemeId = profile?.activeThemeId ?? "classic";
  const sparks = profile?.sparks ?? 0;

  async function handleTap(theme: Theme) {
    const owned = unlockedThemes.includes(theme.id);
    setPendingId(theme.id);
    setError(null);
    try {
      if (owned) {
        if (theme.id !== activeThemeId) await selectTheme(theme.id);
      } else {
        await unlockTheme(theme.id);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update theme.");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-white/60">{sparks} Sparks available</p>
      <div className="grid grid-cols-2 gap-2">
        {THEMES.map((theme) => {
          const owned = unlockedThemes.includes(theme.id);
          const equipped = activeThemeId === theme.id;
          const canAfford = sparks >= theme.priceSparks;

          return (
            <Panel
              key={theme.id}
              tone="custom"
              style={{ backgroundColor: theme.background, color: theme.textColor }}
              className="space-y-2"
            >
              <div className="flex items-center justify-between">
                <span
                  className="size-5 rounded-full border border-black/10"
                  style={{ backgroundColor: theme.accent }}
                />
                {equipped && (
                  <span className="text-[10px] font-bold uppercase tracking-wide opacity-70">
                    Equipped
                  </span>
                )}
              </div>
              <p className="text-sm font-bold">{theme.name}</p>
              <button
                type="button"
                onClick={() => handleTap(theme)}
                disabled={pendingId === theme.id || equipped || (!owned && !canAfford)}
                className="flex min-h-9 w-full items-center justify-center rounded-full px-3 text-xs font-medium transition disabled:opacity-40"
                style={{ backgroundColor: theme.textColor, color: theme.background }}
              >
                {pendingId === theme.id
                  ? "..."
                  : equipped
                    ? "Equipped"
                    : owned
                      ? "Equip"
                      : `Unlock · ${theme.priceSparks} Sparks`}
              </button>
            </Panel>
          );
        })}
      </div>
      {error && <p className="text-sm text-white/70">{error}</p>}
    </div>
  );
}
