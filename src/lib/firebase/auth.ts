import {
  GoogleAuthProvider,
  linkWithPopup,
  onAuthStateChanged,
  signInAnonymously,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { FirebaseError } from "firebase/app";
import { getFirebaseAuth } from "@/lib/firebase/client";

export type AuthSnapshot = {
  uid: string | null;
  displayName: string;
  avatarUrl: string | null;
  isAnonymous: boolean;
  provider: "guest" | "anonymous" | "google";
};

export function toAuthSnapshot(user: User | null): AuthSnapshot {
  if (!user) {
    return {
      uid: null,
      displayName: getGuestName(),
      avatarUrl: null,
      isAnonymous: true,
      provider: "guest",
    };
  }

  const googleProvider = user.providerData.some(
    (provider) => provider.providerId === "google.com",
  );

  return {
    uid: user.uid,
    displayName:
      user.displayName ??
      (user.isAnonymous ? getGuestName(user.uid) : "Breezeblocks Player"),
    avatarUrl: user.photoURL,
    isAnonymous: user.isAnonymous,
    provider: googleProvider ? "google" : "anonymous",
  };
}

export function subscribeToAuthState(
  onChange: (snapshot: AuthSnapshot) => void,
  onUnavailable: () => void,
) {
  const auth = getFirebaseAuth();
  if (!auth) {
    onUnavailable();
    return () => {};
  }

  return onAuthStateChanged(auth, (user) => onChange(toAuthSnapshot(user)));
}

export async function signInAsGuest() {
  const auth = getFirebaseAuth();
  if (!auth) throw new Error("Firebase is not configured.");
  return signInAnonymously(auth);
}

export async function signInWithGoogle() {
  const auth = getFirebaseAuth();
  if (!auth) throw new Error("Firebase is not configured.");
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });

  const anonymousUser = auth.currentUser?.isAnonymous ? auth.currentUser : null;
  if (anonymousUser) {
    try {
      return await linkWithPopup(anonymousUser, provider);
    } catch (error) {
      if (!(error instanceof FirebaseError) || error.code !== "auth/credential-already-in-use") {
        throw error;
      }
      // Google account is already tied to a different uid; the anonymous
      // session (and anything scoped to its uid, e.g. an in-progress game)
      // cannot be preserved, so fall through to a normal sign-in.
    }
  }

  return signInWithPopup(auth, provider);
}

export async function signOutCurrentUser() {
  const auth = getFirebaseAuth();
  if (!auth) return;
  await signOut(auth);
}

export function getGuestName(seed = "124") {
  const digits = seed.replace(/\D/g, "").slice(-3).padStart(3, "1");
  return `Guest Breeze ${digits}`;
}
