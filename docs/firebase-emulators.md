# Firebase Emulator Workflow

Use this workflow while the Firebase project stays on the Spark plan. Firestore
and Auth can run locally, and callable Functions run in the local Functions
emulator instead of deploying to Firebase.

## Local environment

Keep the public Firebase web config in `.env.local`, then add:

```bash
NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true
```

The app still needs the public Firebase project config so the SDK can initialize,
but this flag redirects Auth, Firestore, and Functions calls to localhost.

## Run locally

Terminal 1:

```bash
npm run emulators
```

Terminal 2:

```bash
npm run dev
```

Open:

- App: `http://localhost:3000`
- Emulator UI: `http://127.0.0.1:4000`

If port `3000` is busy:

```bash
npm run dev -- --port 3001
```

## Test matchmaking

1. Open the app in one normal browser window.
2. Open the app in one incognito/private window.
3. Sign in as guest in both windows.
4. Join the same 2-player queue in both windows.
5. Confirm a local `games/{gameId}` document appears in the Emulator UI.
6. Play from `/game?gameId={gameId}` and verify turns, lines, boxes, scores, and timer skips.

## Notes

- Local emulator data is separate from production Firestore.
- Firestore rules are still enforced by the emulator.
- Cloud Functions deployment is not needed for this workflow.
- The Firestore emulator requires Java installed locally.
