"use client";

import { useSearchParams } from "next/navigation";
import { BreezeblocksGame } from "@/components/BreezeblocksGame";
import { OnlineGameClient } from "@/components/OnlineGameClient";

export function GameRouteClient({ fallbackGameId = "local" }: { fallbackGameId?: string }) {
  const searchParams = useSearchParams();
  const gameId = searchParams.get("gameId") ?? fallbackGameId;

  if (gameId === "local") return <BreezeblocksGame gameId={gameId} />;
  return <OnlineGameClient gameId={gameId} />;
}
