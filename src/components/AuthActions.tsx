"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/components/AuthProvider";

const buttonClass =
  "min-h-11 rounded-full px-5 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C5B0F4]";

export function AuthActionButton({
  action,
  children,
  variant = "primary",
  redirectTo = "/lobby",
  onBeforeAction,
}: {
  action: "anonymous" | "google" | "signOut";
  children: string;
  variant?: "primary" | "secondary";
  redirectTo?: string;
  onBeforeAction?: () => void;
}) {
  const router = useRouter();
  const auth = useAuth();
  const [isPending, setIsPending] = useState(false);

  async function handleClick() {
    setIsPending(true);
    try {
      if (action === "anonymous") await auth.signInGuest();
      if (action === "google") await auth.signInGoogle();
      if (action === "signOut") await auth.signOut();
      onBeforeAction?.();
      router.push(redirectTo);
    } finally {
      setIsPending(false);
    }
  }

  const styles =
    variant === "primary"
      ? "bg-white text-black hover:bg-[#F4ECD6]"
      : "border border-white/20 bg-[#111111] text-white hover:border-white/45";

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending || (!auth.isConfigured && action === "google")}
      className={`${buttonClass} ${styles} disabled:cursor-not-allowed disabled:opacity-45`}
    >
      {isPending ? "Working..." : children}
    </button>
  );
}

export function AuthNotice({ dark = false }: { dark?: boolean }) {
  const { error, isConfigured } = useAuth();

  if (error) {
    return (
      <p className={`text-sm leading-6 ${dark ? "text-black/70" : "text-[#F3C9B6]"}`}>
        {error}
      </p>
    );
  }

  if (!isConfigured) {
    return (
      <p className={`text-sm leading-6 ${dark ? "text-black/70" : "text-white/55"}`}>
        Firebase env vars are not configured yet, so the app is using a local
        guest identity.
      </p>
    );
  }

  return null;
}
