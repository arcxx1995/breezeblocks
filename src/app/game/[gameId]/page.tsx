import { BreezeblocksGame } from "@/components/BreezeblocksGame";

export default async function GamePage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = await params;
  return <BreezeblocksGame gameId={gameId} />;
}
