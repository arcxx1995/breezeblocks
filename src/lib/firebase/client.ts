import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import {
  connectFirestoreEmulator,
  getFirestore,
  onSnapshot,
  type DocumentData,
  type DocumentReference,
  type Firestore,
} from "firebase/firestore";
import {
  connectFunctionsEmulator,
  getFunctions,
  type Functions,
} from "firebase/functions";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const useFirebaseEmulators =
  process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true";
let authEmulatorConnected = false;
let firestoreEmulatorConnected = false;
let functionsEmulatorConnected = false;

export function hasFirebaseConfig() {
  return Object.values(firebaseConfig).every(Boolean);
}

export function getFirebaseApp(): FirebaseApp | null {
  if (!hasFirebaseConfig()) return null;
  return getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
}

export function getFirebaseAuth(): Auth | null {
  const app = getFirebaseApp();
  if (!app) return null;

  const auth = getAuth(app);
  if (useFirebaseEmulators && !authEmulatorConnected) {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", {
      disableWarnings: true,
    });
    authEmulatorConnected = true;
  }
  return auth;
}

export function getFirebaseDb(): Firestore | null {
  const app = getFirebaseApp();
  if (!app) return null;

  const db = getFirestore(app);
  if (useFirebaseEmulators && !firestoreEmulatorConnected) {
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
    firestoreEmulatorConnected = true;
  }
  return db;
}

export function getFirebaseFunctions(): Functions | null {
  const app = getFirebaseApp();
  if (!app) return null;

  const functions = getFunctions(app);
  if (useFirebaseEmulators && !functionsEmulatorConnected) {
    connectFunctionsEmulator(functions, "127.0.0.1", 5001);
    functionsEmulatorConnected = true;
  }
  return functions;
}

// A Firestore Listen stream can go quiet on a flaky connection without ever
// calling onNext or onError again, leaving the UI stuck on stale state even
// after the server has moved on. Polling the same doc alongside the listener
// means a stalled stream still gets reconciled. The poll must NOT go through
// the Firestore SDK at all: the SDK multiplexes onSnapshot, getDoc, and even
// getDocFromServer for a given doc over the same underlying WebChannel
// connection, so an SDK-level "fallback" just rides the same broken pipe as
// the stalled listener (confirmed via network capture — every request during
// a stall was to the same Listen/channel endpoint, none independent). A raw
// REST fetch with the user's own ID token is a genuinely separate connection.
export function subscribeWithPollFallback(
  ref: DocumentReference<DocumentData>,
  onChange: (data: DocumentData | null) => void,
  onError: (error: Error) => void,
  pollMillis = 5000,
) {
  const toChange = (data: DocumentData | undefined) => onChange(data ?? null);
  const unsubscribe = onSnapshot(
    ref,
    (snapshot) => toChange(snapshot.data()),
    onError,
  );
  const pollId = setInterval(() => {
    pollDocViaRest(ref)
      .then(toChange)
      .catch(() => {});
  }, pollMillis);
  return () => {
    unsubscribe();
    clearInterval(pollId);
  };
}

async function pollDocViaRest(
  ref: DocumentReference<DocumentData>,
): Promise<DocumentData | undefined> {
  const idToken = await getFirebaseAuth()?.currentUser?.getIdToken();
  if (!idToken) return undefined;

  const url = useFirebaseEmulators
    ? `http://127.0.0.1:8080/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/${ref.path}`
    : `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/${ref.path}`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${idToken}` } });
  if (response.status === 404) return undefined;
  if (!response.ok) throw new Error(`Firestore REST poll failed: ${response.status}`);

  const body = await response.json();
  return decodeFirestoreRestFields(body.fields ?? {});
}

function decodeFirestoreRestFields(fields: Record<string, unknown>): DocumentData {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [key, decodeFirestoreRestValue(value)]),
  );
}

function decodeFirestoreRestValue(value: unknown): unknown {
  const typed = value as Record<string, unknown>;
  if (!typed || typeof typed !== "object") return null;
  if ("nullValue" in typed) return null;
  if ("stringValue" in typed) return typed.stringValue;
  if ("integerValue" in typed) return Number(typed.integerValue);
  if ("doubleValue" in typed) return typed.doubleValue;
  if ("booleanValue" in typed) return typed.booleanValue;
  if ("timestampValue" in typed) return Date.parse(typed.timestampValue as string);
  if ("arrayValue" in typed) {
    const values = (typed.arrayValue as { values?: unknown[] })?.values ?? [];
    return values.map(decodeFirestoreRestValue);
  }
  if ("mapValue" in typed) {
    const nestedFields = (typed.mapValue as { fields?: Record<string, unknown> })?.fields ?? {};
    return decodeFirestoreRestFields(nestedFields);
  }
  return null;
}
