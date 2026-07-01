import { Suspense } from "react";
import { MatchmakingRouteClient } from "@/components/MatchmakingRouteClient";

export default function MatchmakingPage() {
  return (
    <Suspense>
      <MatchmakingRouteClient />
    </Suspense>
  );
}
