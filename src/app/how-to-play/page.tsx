import {
  ActionLink,
  AppScreen,
  BottomNav,
  DotBoardPreview,
  Panel,
} from "@/components/AppShell";
import { ThemedBrandHeader } from "@/components/ThemedBrandHeader";

const rules = [
  {
    title: "Draw one line",
    copy: "On your turn, connect two adjacent dots horizontally or vertically.",
    tone: "lilac",
  },
  {
    title: "Capture boxes",
    copy: "If your line completes the fourth side, the box becomes your color.",
    tone: "lime",
  },
  {
    title: "Keep the turn",
    copy: "Capture a box and you play again with a fresh 20-second timer.",
    tone: "cream",
  },
  {
    title: "Win the board",
    copy: "The player with the most captured boxes after all 81 boxes are filled wins.",
    tone: "pink",
  },
] as const;

export default function HowToPlayPage() {
  return (
    <AppScreen nav={<BottomNav />}>
      <ThemedBrandHeader title="How to Play" />

      <section className="space-y-3 py-4">
        <Panel>
          <DotBoardPreview active />
        </Panel>

        {rules.map((rule, index) => (
          <Panel key={rule.title} tone={rule.tone}>
            <p className="font-mono text-xs uppercase tracking-[0.12em] text-black/55">
              Step {index + 1}
            </p>
            <h2 className="mt-2 text-2xl font-bold leading-tight">
              {rule.title}
            </h2>
            <p className="mt-2 text-sm leading-6 text-black/70">{rule.copy}</p>
          </Panel>
        ))}

        <ActionLink href="/game?gameId=local">Try Local Match</ActionLink>
      </section>
    </AppScreen>
  );
}
