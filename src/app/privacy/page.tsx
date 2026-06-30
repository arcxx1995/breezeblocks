import { ActionLink, AppScreen, BrandHeader, Panel } from "@/components/AppShell";

export default function PrivacyPage() {
  return (
    <AppScreen>
      <BrandHeader title="Privacy" />
      <section className="flex flex-1 flex-col gap-4 py-4">
        <Panel tone="cream" className="space-y-3">
          <h2 className="text-3xl font-[340] leading-none">Privacy Policy</h2>
          <p className="text-sm leading-6 text-black/70">
            The release version will describe Firebase authentication, profile
            stats, matchmaking data, and analytics choices.
          </p>
        </Panel>
        <div className="mt-auto">
          <ActionLink href="/settings">Back to Settings</ActionLink>
        </div>
      </section>
    </AppScreen>
  );
}
