"use client";

import { AuthActionButton, AuthNotice } from "@/components/AuthActions";
import { useAuth } from "@/components/AuthProvider";

export function AccountActions() {
  const { player } = useAuth();

  return (
    <div className="grid gap-2">
      {player.provider === "google" ? (
        <AuthActionButton action="signOut" variant="secondary">
          Sign out
        </AuthActionButton>
      ) : (
        <>
          <AuthActionButton action="google">Sign in</AuthActionButton>
          <AuthActionButton action="anonymous" variant="secondary">
            Continue as guest
          </AuthActionButton>
        </>
      )}
      <AuthNotice dark />
    </div>
  );
}
