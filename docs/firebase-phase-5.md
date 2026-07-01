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
- `submitMove`
- `claimTimeoutSkip`
- `claimBotMove`
- `ensureSignedProfile`

When Firebase is not configured, the matchmaking screen creates a local queue session in `localStorage` and opens `/game?gameId=local` after a short simulated wait.

## Implemented backend scaffold

- `functions/src/index.ts` creates or reuses one queue entry per player/mode, expires stale queues inside matchmaking, creates compact single-document game state, starts bot matches after long waits, validates `submitMove`, handles bot moves and timeout skips, creates signed profiles, and finalizes signed player stats/history when games complete.
- `functions/src/gameRules.ts` contains the server board constants and box completion helpers.
- `src/lib/firebase/games.ts` contains client helpers for online game subscription, `submitMove`, bot moves, and timeout claims.
- `src/lib/firebase/profile.ts` contains client helpers for signed profile creation and one-time profile/history reads.

## Remaining validation work

- Run Firebase emulators against real project config on a machine with Java installed.
- Complete a two-browser signed match and confirm `users/{uid}` stats and `matchHistory` documents update once.
