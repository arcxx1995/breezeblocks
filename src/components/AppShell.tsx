import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

type AppScreenProps = {
  children: ReactNode;
  className?: string;
};

type ActionLinkProps = {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost";
};

export function AppScreen({ children, className = "" }: AppScreenProps) {
  return (
    <main className={`app-phone-viewport text-white ${className}`}>
      <section className="app-phone-screen flex flex-col px-4 py-4">
        {children}
      </section>
    </main>
  );
}

export function BrandHeader({
  title,
  action,
  accentColor,
}: {
  title?: string;
  action?: ReactNode;
  accentColor?: string;
}) {
  return (
    <header className="flex items-center justify-between gap-3 py-2">
      <Link href="/lobby" className="min-w-0">
        <p
          className="font-mono text-xs uppercase tracking-[0.18em]"
          style={{ color: accentColor ?? "#DCEEB1" }}
        >
          Breezeblocks
        </p>
        <h1 className="truncate text-3xl font-[340] leading-none text-white">
          {title ?? "Play the board"}
        </h1>
      </Link>
      {action}
    </header>
  );
}

export function ActionLink({
  href,
  children,
  variant = "primary",
}: ActionLinkProps) {
  const styles = {
    primary: "bg-white text-black hover:bg-[#F4ECD6]",
    secondary:
      "border border-white/20 bg-[#111111] text-white hover:border-white/45",
    ghost: "bg-transparent text-white/70 hover:text-white",
  };

  return (
    <Link
      href={href}
      className={`flex min-h-11 items-center justify-center rounded-full px-5 text-center text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C5B0F4] ${styles[variant]}`}
    >
      {children}
    </Link>
  );
}

export function Panel({
  children,
  tone = "dark",
  className = "",
  style,
}: {
  children: ReactNode;
  tone?: "dark" | "lilac" | "lime" | "cream" | "pink" | "custom";
  className?: string;
  style?: CSSProperties;
}) {
  const tones = {
    dark: "border-white/15 bg-[#111111] text-white",
    lilac: "border-transparent bg-[#C5B0F4] text-black",
    lime: "border-transparent bg-[#DCEEB1] text-black",
    cream: "border-transparent bg-[#F4ECD6] text-black",
    pink: "border-transparent bg-[#EFD4D4] text-black",
    custom: "border-transparent",
  };

  return (
    <section className={`rounded-lg border p-4 ${tones[tone]} ${className}`} style={style}>
      {children}
    </section>
  );
}

export function BottomNav() {
  const items = [
    { href: "/lobby", label: "Lobby" },
    { href: "/how-to-play", label: "Rules" },
    { href: "/profile", label: "Profile" },
    { href: "/settings", label: "Settings" },
  ];

  return (
    <nav className="mt-auto grid grid-cols-4 gap-1 border-t border-white/10 pt-3">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="rounded-lg px-2 py-2 text-center text-xs font-medium text-white/60 transition hover:bg-white/10 hover:text-white"
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

export function DotBoardPreview({ active = false }: { active?: boolean }) {
  return (
    <div className="grid aspect-square w-full grid-cols-5 gap-3 rounded-lg bg-black p-5">
      {Array.from({ length: 25 }).map((_, index) => (
        <span
          key={index}
          className={`size-2 rounded-full ${
            active && [6, 7, 8, 13, 18].includes(index)
              ? "bg-[#C5B0F4]"
              : "bg-white"
          }`}
        />
      ))}
    </div>
  );
}

export function StatStrip({
  stats,
}: {
  stats: { label: string; value: string }[];
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {stats.map((stat) => (
        <div key={stat.label} className="rounded-lg bg-white/10 p-3">
          <p className="font-mono text-lg text-white">{stat.value}</p>
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-white/45">
            {stat.label}
          </p>
        </div>
      ))}
    </div>
  );
}
