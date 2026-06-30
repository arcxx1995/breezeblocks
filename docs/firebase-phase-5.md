# Firebase Phase 5 Notes

## Client configuration

Copy `.env.example` to a local `.env.local` and fill the public Firebase web app values outside source control:

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`

The app falls back to a local guest identity when these values are absent.

## Current backend boundary

The web client calls callable functions when Firebase is configured:

- `joinQueue`
- `cancelQueue`
- `createMatchIfReady`
- `submitMove`

When Firebase is not configured, the matchmaking screen creates a local queue session in `localStorage` and opens `/game/local` after a short simulated wait.

## Implemented backend scaffold

- `functions/src/index.ts` creates queue entries, cancels queue entries, creates game documents from ready queues, initializes players/lines/boxes, and validates `submitMove`.
- `functions/src/gameRules.ts` contains the server board constants and box completion helpers.
- `src/lib/firebase/games.ts` contains client helpers for online game subscription and `submitMove`.

## Remaining backend work

- Run Firebase emulators against real project config.
- Add stale queue cleanup.
- Add `claimTimeoutSkip`.
- Update signed-in profile stats when a game completes.
- Replace local game UI with Firestore-backed rendering for non-local game IDs.
