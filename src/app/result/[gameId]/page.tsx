import {
  ActionLink,
  AppScreen,
  BrandHeader,
  Panel,
  StatStrip,
} from "@/components/AppShell";

export default async function ResultPage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = await params;

  return (
    <AppScreen>
      <BrandHeader title="Result" />

      <section className="flex flex-1 flex-col gap-4 py-4">
        <Panel tone="lilac" className="space-y-4">
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-black/60">
            Room {gameId}
          </p>
          <h2 className="text-5xl font-[340] leading-none">Lilac wins</h2>
          <p className="text-base leading-7 text-black/70">
            Final scoring will come from the completed game document once
            multiplayer is connected.
          </p>
        </Panel>

        <StatStrip
          stats={[
            { label: "Lilac", value: "43" },
            { label: "Lime", value: "38" },
            { label: "Time", value: "8m" },
          ]}
        />

        <Panel className="space-y-2">
          <h2 className="text-lg font-bold">Guest progress</h2>
          <p className="text-sm leading-6 text-white/65">
            Sign in before future matches to save wins, boxes, and match
            history.
          </p>
        </Panel>

        <div className="mt-auto grid gap-2">
          <ActionLink href="/game/local">Play Again</ActionLink>
          <ActionLink href="/lobby" variant="secondary">
            Back to Lobby
          </ActionLink>
          <ActionLink href="/profile" variant="ghost">
            Sign in to save future stats
          </ActionLink>
        </div>
      </section>
    </AppScreen>
  );
}
