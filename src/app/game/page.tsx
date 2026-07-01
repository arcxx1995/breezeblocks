import { Suspense } from "react";
import { GameRouteClient } from "@/components/GameRouteClient";

export default function GamePage() {
  return (
    <Suspense>
      <GameRouteClient />
    </Suspense>
  );
}
