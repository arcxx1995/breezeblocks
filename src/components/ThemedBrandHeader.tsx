"use client";

import type { ComponentProps } from "react";
import { BrandHeader } from "@/components/AppShell";
import { usePlayerProfile } from "@/components/usePlayerProfile";
import { getTheme } from "@/lib/themes";

export function ThemedBrandHeader(props: ComponentProps<typeof BrandHeader>) {
  const { profile } = usePlayerProfile();
  const theme = getTheme(profile?.activeThemeId ?? "classic");
  return <BrandHeader {...props} accentColor={theme.accent} />;
}
