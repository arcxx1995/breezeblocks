"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  signInAsGuest,
  signInWithGoogle,
  signOutCurrentUser,
  subscribeToAuthState,
  toAuthSnapshot,
  type AuthSnapshot,
} from "@/lib/firebase/auth";
import { hasFirebaseConfig } from "@/lib/firebase/client";
import { ensureSignedProfile } from "@/lib/firebase/profile";

type AuthContextValue = {
  player: AuthSnapshot;
  isReady: boolean;
  isConfigured: boolean;
  error: string | null;
  signInGuest: () => Promise<void>;
  signInGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [player, setPlayer] = useState<AuthSnapshot>(() => toAuthSnapshot(null));
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isConfigured = hasFirebaseConfig();

  useEffect(() => {
    const unsubscribe = subscribeToAuthState(
      (snapshot) => {
        setPlayer(snapshot);
        setIsReady(true);
        setError(null);
        ensureSignedProfile(snapshot).catch((caught: unknown) => {
          setError(toErrorMessage(caught));
        });
      },
      () => {
        setPlayer(toAuthSnapshot(null));
        setIsReady(true);
      },
    );

    return unsubscribe;
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      player,
      isReady,
      isConfigured,
      error,
      async signInGuest() {
        try {
          setError(null);
          await signInAsGuest();
        } catch (caught) {
          const message = toErrorMessage(caught);
          setError(message);
          throw new Error(message);
        }
      },
      async signInGoogle() {
        try {
          setError(null);
          await signInWithGoogle();
        } catch (caught) {
          const message = toErrorMessage(caught);
          setError(message);
          throw new Error(message);
        }
      },
      async signOut() {
        try {
          setError(null);
          await signOutCurrentUser();
          setPlayer(toAuthSnapshot(null));
        } catch (caught) {
          const message = toErrorMessage(caught);
          setError(message);
          throw new Error(message);
        }
      },
    }),
    [error, isConfigured, isReady, player],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider.");
  return value;
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Authentication failed.";
}
