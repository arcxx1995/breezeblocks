"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import type { CSSProperties, ReactNode } from "react";
import { useSettingsPrefs } from "@/lib/settings";

type AppScreenProps = {
  children: ReactNode;
  nav?: ReactNode;
  className?: string;
  scrollable?: boolean;
};

type ActionLinkProps = {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  onClick?: () => void;
};

export function AppScreen({
  children,
  nav,
  className = "",
  scrollable = true,
}: AppScreenProps) {
  return (
    <main className={`app-phone-viewport text-white ${className}`}>
      <section className="app-phone-screen flex flex-col">
        <div
          className="app-phone-scroll flex-1 px-4 py-4"
          style={scrollable ? undefined : { overflowY: "hidden" }}
        >
          {children}
        </div>
        {nav && <div className="px-4 pb-4">{nav}</div>}
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
  onClick,
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
      onClick={onClick}
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

export function BottomNav({ accentColor = "#DCEEB1" }: { accentColor?: string }) {
  const pathname = usePathname();
  const { prefs } = useSettingsPrefs();
  const items = [
    { href: "/profile", label: "Profile", Icon: ProfileIcon },
    { href: "/lobby", label: "Lobby", Icon: HomeIcon },
    { href: "/settings", label: "Settings", Icon: SettingsIcon },
  ];

  return (
    <nav className="grid grid-cols-3 items-end gap-1 border-t border-white/10 bg-black pt-3">
      {items.map((item) => (
        <NavItem
          key={item.href}
          href={item.href}
          label={item.label}
          Icon={item.Icon}
          active={pathname === item.href}
          accentColor={accentColor}
          smoothMotion={prefs.smoothMotion}
        />
      ))}
    </nav>
  );
}

const NAV_SPRING = { type: "spring", stiffness: 340, damping: 26, mass: 0.7 } as const;
const NAV_INSTANT = { duration: 0 } as const;

function NavItem({
  href,
  label,
  Icon,
  active,
  accentColor,
  smoothMotion,
}: {
  href: string;
  label: string;
  Icon: (props: { className?: string }) => ReactNode;
  active: boolean;
  accentColor: string;
  smoothMotion: boolean;
}) {
  const transition = smoothMotion ? NAV_SPRING : NAV_INSTANT;
  const labelTransition = smoothMotion
    ? { duration: 0.22, ease: "easeOut" as const }
    : NAV_INSTANT;

  return (
    <Link
      href={href}
      aria-label={label}
      className="flex flex-col items-center gap-1 pb-2 text-center text-xs font-medium"
    >
      <div className="flex h-12 w-12 shrink-0 items-center justify-center">
        <motion.div
          className="flex items-center justify-center rounded-full"
          initial={{
            width: 24,
            height: 24,
            backgroundColor: "rgba(255,255,255,0)",
            boxShadow: "0 0 0 rgba(0,0,0,0)",
          }}
          animate={{
            width: active ? 48 : 24,
            height: active ? 48 : 24,
            backgroundColor: active ? accentColor : "rgba(255,255,255,0)",
            boxShadow: active
              ? "0 6px 16px rgba(0,0,0,0.35)"
              : "0 0 0 rgba(0,0,0,0)",
          }}
          transition={transition}
        >
          <motion.span
            className="flex"
            initial={{ color: "rgba(255,255,255,0.5)", scale: 1 }}
            animate={{
              color: active ? "#000000" : "rgba(255,255,255,0.5)",
              scale: active ? 1.05 : 1,
            }}
            transition={transition}
          >
            <Icon className="size-5" />
          </motion.span>
        </motion.div>
      </div>
      <motion.span
        initial={{ color: "rgba(255,255,255,0.5)" }}
        animate={{ color: active ? "#ffffff" : "rgba(255,255,255,0.5)" }}
        transition={labelTransition}
      >
        {label}
      </motion.span>
    </Link>
  );
}

function HomeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M4 11.5 12 4l8 7.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6 10v9a1 1 0 0 0 1 1h3v-6h4v6h3a1 1 0 0 0 1-1v-9"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ProfileIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <circle cx="12" cy="8" r="3.4" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M5 20c0-3.6 3.1-6.5 7-6.5s7 2.9 7 6.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M12 3v2.4M12 18.6V21M4.9 4.9l1.7 1.7M17.4 17.4l1.7 1.7M3 12h2.4M18.6 12H21M4.9 19.1l1.7-1.7M17.4 6.6l1.7-1.7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
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
