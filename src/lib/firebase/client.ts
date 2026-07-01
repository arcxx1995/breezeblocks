import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import {
  connectFirestoreEmulator,
  getFirestore,
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
