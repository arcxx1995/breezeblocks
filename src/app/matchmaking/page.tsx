import { MatchmakingClient } from "@/components/MatchmakingClient";

export default async function MatchmakingPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const params = await searchParams;
  return <MatchmakingClient mode={params.mode ?? "quick"} />;
}
