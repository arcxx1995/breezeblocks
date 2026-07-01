import { Suspense } from "react";
import { ResultClient } from "@/components/ResultClient";

export function generateStaticParams() {
  return [{ gameId: "local" }];
}

export const dynamicParams = false;

export default async function ResultPage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = await params;

  return (
    <Suspense>
      <ResultClient fallbackGameId={gameId} />
    </Suspense>
  );
}
