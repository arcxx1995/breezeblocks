"use client";

import { useSearchParams } from "next/navigation";
import { MatchmakingClient } from "@/components/MatchmakingClient";

export function MatchmakingRouteClient() {
  const searchParams = useSearchParams();
  const mode = searchParams.get("mode") ?? "quick";
  const rematchWith = searchParams.get("rematchWith") ?? undefined;
  return <MatchmakingClient key={`${mode}-${rematchWith ?? ""}`} mode={mode} rematchWith={rematchWith} />;
}
