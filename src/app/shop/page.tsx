import { AppScreen, BottomNav, Panel } from "@/components/AppShell";
import { ThemedBrandHeader } from "@/components/ThemedBrandHeader";
import { ThemeShop } from "@/components/ThemeShop";

export default function ShopPage() {
  return (
    <AppScreen nav={<BottomNav />}>
      <ThemedBrandHeader title="Shop" />

      <section className="space-y-4 py-4">
        <Panel className="space-y-3">
          <h2 className="text-xl font-bold">Themes</h2>
          <ThemeShop />
        </Panel>
      </section>
    </AppScreen>
  );
}
