import { ActionLink, AppScreen, Panel } from "@/components/AppShell";
import { ThemedBrandHeader } from "@/components/ThemedBrandHeader";

export default function TermsPage() {
  return (
    <AppScreen>
      <ThemedBrandHeader title="Terms" />
      <section className="flex flex-1 flex-col gap-4 py-4">
        <Panel tone="lilac" className="space-y-3">
          <h2 className="text-3xl font-[340] leading-none">Terms of Service</h2>
          <p className="text-sm leading-6 text-black/70">
            The release version will cover account rules, fair play,
            matchmaking, and Google Play distribution terms.
          </p>
        </Panel>
        <div className="mt-auto">
          <ActionLink href="/settings">Back to Settings</ActionLink>
        </div>
      </section>
    </AppScreen>
  );
}
