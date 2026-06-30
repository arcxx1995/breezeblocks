import {
  ActionLink,
  AppScreen,
  BottomNav,
  BrandHeader,
  Panel,
} from "@/components/AppShell";
import { AccountActions } from "@/components/AccountActions";

const settings = [
  ["Sound", "On"],
  ["Haptics", "On"],
  ["Music", "Off"],
  ["Move hints", "On"],
  ["Theme", "System"],
];

export default function SettingsPage() {
  return (
    <AppScreen>
      <BrandHeader title="Settings" />

      <section className="space-y-4 py-4">
        <Panel className="divide-y divide-white/10 p-0">
          {settings.map(([label, value]) => (
            <div
              key={label}
              className="flex min-h-14 items-center justify-between gap-3 px-4"
            >
              <span className="font-bold">{label}</span>
              <span className="rounded-full bg-white px-3 py-1 text-sm font-medium text-black">
                {value}
              </span>
            </div>
          ))}
        </Panel>

        <Panel tone="pink" className="space-y-3">
          <h2 className="text-xl font-bold">Account</h2>
          <AccountActions />
        </Panel>

        <Panel className="grid gap-2">
          <ActionLink href="/privacy" variant="ghost">
            Privacy Policy
          </ActionLink>
          <ActionLink href="/terms" variant="ghost">
            Terms of Service
          </ActionLink>
        </Panel>
      </section>

      <BottomNav />
    </AppScreen>
  );
}
