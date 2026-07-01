import { Suspense } from "react";
import { GameRouteClient } from "@/components/GameRouteClient";

export function generateStaticParams() {
  return [{ gameId: "local" }];
}

export const dynamicParams = false;

export default async function GamePage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = await params;
  return (
    <Suspense>
      <GameRouteClient fallbackGameId={gameId} />
    </Suspense>
  );
}
