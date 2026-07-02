# Breezeblocks Agent Context

This file is the handoff guide for future coding agents working in this repo. It describes the current implementation, planned product direction, backend model, build workflow, and pitfalls that matter when changing the app.

## Product

Breezeblocks is a mobile-first dots-and-boxes strategy game. Players draw horizontal or vertical lines between adjacent dots; completing the fourth side of a box captures that box, awards 1 point, and grants another turn. The board currently uses the product-spec interpretation of a "100 dot matrix": 10 dots by 10 dots, which creates 9 by 9 capturable boxes, or 81 boxes total.

The target product supports 2-4 player multiplayer, anonymous and signed-in matchmaking, Google auth, eventual Play Games auth on Android, player profiles, match history, total wins/losses/draws, total boxes won, onboarding, lobby, matchmaking, online game, local prototype game, result screen, settings, privacy, and terms screens.

Important distinction: some libraries and features appear in the product spec as recommendations, but are not installed or implemented yet. The current repo does not use Zustand, Framer Motion, shadcn/ui, or a native Play Games plugin. The current stack is plain Next.js App Router, React state/hooks, Tailwind CSS v4, Firebase web SDK, Firebase Functions, Firestore, and Capacitor Android.

## Current Stack

- Next.js `16.2.9` with App Router.
- React `19.2.4` and React DOM `19.2.4`.
- TypeScript `^5` with strict mode enabled.
- Tailwind CSS `^4` via `@tailwindcss/postcss`.
- Firebase web SDK `^12.15.0`.
- Firebase Functions/Admin in `functions/` using Node.js 22, `firebase-functions ^7.0.0`, `firebase-admin ^13.6.0`.
- Capacitor `^8.4.1` for Android packaging.
- `lightningcss-darwin-arm64 ^1.32.0` is a direct dependency: Tailwind v4 native binary for arm64 macOS.
- ESLint 9 with `eslint-config-next`.
- Static export is enabled with `next.config.ts` `output: "export"`.
- Android app id/package is `com.breezeblocks.game`.
- Firebase project alias in `.firebaserc` is `breezeblocks-7a498`.

## Commands

Use RTK for shell commands in this environment; prefix commands with `rtk`.

Root app commands:

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run emulators
npm run android:sync
npm run android:open
npm run android:run
```

Firebase Functions commands from `functions/`:

```bash
npm run build
npm run serve
npm run deploy
```

`npm run dev` uses `next dev --webpack`. `npm run build` runs `next build` and, because static export is configured, produces the exported web app in `out/`. Capacitor uses `out/` as its `webDir`.

`npm run emulators` starts Auth, Firestore, and Functions emulators with Firebase CLI. The Emulator UI is configured at `http://127.0.0.1:4000`.

## Environment

The app expects these public Firebase web env vars when using Firebase:

```bash
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_APP_ID
```

For local emulator development, also set:

```bash
NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true
```

Do not commit local env files. The permission profile blocks reads of `.env`, `.env.local`, `.env.*.local`, key files, pem files, and secrets directories.

When Firebase config is absent, the app deliberately falls back to a local guest identity and local matchmaking simulation. Google sign-in is disabled in that mode.

## Routing

Root layout is `src/app/layout.tsx`. It imports `globals.css`, loads Geist Mono, sets metadata, and wraps the app in `AuthProvider`.

Routes:

- `/`: `EntryClient`; loading/session restore screen. After auth is ready, it checks `localStorage["breezeblocks:onboarding-complete"]` and routes to `/onboarding` or `/lobby`.
- `/onboarding`: `OnboardingFlow`; seven teaching slides plus final auth choice.
- `/lobby`: `LobbyClient`; player summary, stats preview, match mode links, nav.
- `/matchmaking`: `MatchmakingRouteClient`; reads `mode` query param and renders `MatchmakingClient`.
- `/game`: `GameRouteClient`; reads `gameId` query param. `gameId=local` renders local prototype, any other id renders online game.
- `/game/[gameId]`: static params only include `local`; `dynamicParams = false`. This exists for static export compatibility and passes `fallbackGameId`.
- `/result`: `ResultClient`; reads `gameId` query param.
- `/result/[gameId]`: static params only include `local`; `dynamicParams = false`.
- `/profile`: `ProfileClient`.
- `/how-to-play`: static rules page.
- `/settings`: static settings plus auth/account actions.
- `/privacy` and `/terms`: static legal pages.

Because static export is enabled, arbitrary online room ids should use query-string URLs such as `/game?gameId={id}` and `/result?gameId={id}`, not dynamic path params.

## UI and Design

The UI is mobile-first and constrained to a narrow app-like column: `max-w-md`, black background, white text, colorful panels, rounded-lg cards, and pill CTAs.

Core shell components live in `src/components/AppShell.tsx`:

- `AppScreen`: black full-height mobile screen wrapper.
- `BrandHeader`: logo/title header linking to `/lobby`.
- `ActionLink`: reusable pill links with `primary`, `secondary`, and `ghost` variants.
- `Panel`: rounded card/panel with tones `dark`, `lilac`, `lime`, `cream`, `pink`.
- `BottomNav`: four-item nav for Lobby, Rules, Profile, Settings.
- `DotBoardPreview`: 5 by 5 preview dot grid.
- `StatStrip`: three-column stat display.

Design source is `DESIGN.md`. It defines the intended black-and-white editorial base with pastel blocks:

- Black: `#000000`
- White: `#ffffff`
- Lilac: `#C5B0F4`
- Lime: `#DCEEB1`
- Cream: `#F4ECD6`
- Pink: `#EFD4D4`
- Coral: `#F3C9B6`
- Surface dark: `#111111`

`globals.css` imports Tailwind v4, sets black/white CSS variables, maps both sans and mono to Geist Mono, and disables tap highlight on buttons.

## Game Rules

Shared client board constants in `src/lib/game/engine.ts`:

- `DOT_ROWS = 10`
- `DOT_COLS = 10`
- `BOX_ROWS = 9`
- `BOX_COLS = 9`
- `TURN_DURATION_SECONDS = 20`

Board implications:

- 100 dots.
- 81 capturable boxes.
- 90 horizontal line slots.
- 90 vertical line slots.
- 180 total possible lines.

Line ids use the first character of orientation: `h-{row}-{col}` or `v-{row}-{col}`. Box ids are `b-{row}-{col}`.

Valid moves:

- Must be horizontal or vertical.
- Must connect adjacent dots.
- Must be inside board bounds.
- Must target an unowned line.
- Online moves must be submitted by the active player before `turnDeadlineAt`.

Capture behavior:

- A line may complete 0, 1, or 2 boxes.
- Completed boxes are owned by the player who drew the final side.
- Capturing one or more boxes increments score by the number of boxes and keeps the same player on turn.
- Non-capturing moves advance to the next active player.
- Turn timer resets to 20 seconds after every accepted move.

Timeout behavior:

- Local game auto-skips when the deadline is reached.
- Online game lets only the next active player claim an expired turn with `claimTimeoutSkip`.
- A player with 3 consecutive skips becomes inactive.

Game completion:

- Local engine completes when all boxes are owned.
- Online function completes when `capturedBoxCount >= BOX_ROWS * BOX_COLS`.
- Winners are every player tied for highest score. Multiple winners means draw.

## Local Game Implementation

`src/components/BreezeblocksGame.tsx` is the local prototype. It uses `createInitialGame`, `submitLine`, and `skipTurn` from `src/lib/game/engine.ts`.

Local state shape:

- `players`: local `Player[]` with ids `player-1`, `player-2`.
- `lines`: record keyed by line id; each line has orientation, row, col, and `ownerPlayerId`.
- `boxes`: record keyed by box id; each box has row, col, and `ownerPlayerId`.
- `currentPlayerIndex`
- `turnStartedAt`
- `turnDeadlineAt`
- `moveNumber`
- `status`: `active` or `completed`
- `winnerPlayerIds`
- `log`: last five move messages.

Default local players are Lilac and Lime. The local game renders an SVG board with drag-to-connect interaction:

- Board viewbox is 360 by 360.
- Padding is 28.
- Step is derived from dot columns.
- Dot hit radius is 14.
- Preview lines snap horizontally/vertically to one adjacent step.
- Diagonal or non-adjacent drags do nothing.

Hydration detail: the local game initializes with `INITIAL_GAME_TIME = 0`, then resets to `Date.now()` in a zero-delay effect to avoid server/client timer mismatch.

## Online Game Implementation

`src/components/OnlineGameClient.tsx` renders online Firestore games.

It subscribes with `subscribeToOnlineGame(gameId)`, normalizes compact Firestore maps into `Record<string, Line>` and `Record<string, Box>`, renders the same SVG board behavior, and calls callable functions for moves/timeouts/bots.

Online client states:

- If Firebase config is missing: show "Online game unavailable."
- If auth is not ready: show "Checking player session."
- If no `player.uid`: require joining from lobby as guest or signed player.
- If Firestore errors: show error state.
- If snapshot is missing: show loading state.
- If game is complete: show Result and Profile links.

Move control:

- `isMyTurn` is currently `activePlayer.playerId === player.uid`. This works because online player ids are the Firebase uid for both signed and anonymous queue players.
- Local guest fallback does not play online; it opens local after simulated wait.
- `submitOnlineMove` calls `submitMove` callable.
- The client sets `lastMoveId` optimistically for visual feedback and clears it if the callable fails.

Bot behavior:

- If active player is a bot, a human client in the game calls `claimOnlineBotMove` after about 800 ms.
- Function-side `botMoveDelayMillis` is 700 ms.
- Bot chooses the first line that completes a box; otherwise the first open line.

Timeout behavior:

- The online client calculates remaining seconds from Firestore `turnDeadlineAt`.
- When remaining seconds reaches 0, only `getTimeoutClaimantId(players, currentTurnPlayerId)` should call `claimOnlineTimeout`.
- This reduces duplicate timeout claims across clients.

Realtime pause:

- After a completed online game has displayed for 30 seconds, the client pauses realtime subscription for that game.

## Firebase Client Layer

`src/lib/firebase/client.ts`:

- Builds Firebase config from public env vars.
- `hasFirebaseConfig()` returns true only if all required values exist.
- `getFirebaseApp()` returns null when config is incomplete.
- `getFirebaseAuth()`, `getFirebaseDb()`, and `getFirebaseFunctions()` connect to local emulators when `NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true`.
- Emulator ports are Auth 9099, Firestore 8080, Functions 5001.

`src/lib/firebase/auth.ts`:

- `AuthSnapshot` contains `uid`, `displayName`, `avatarUrl`, `isAnonymous`, `provider`.
- Providers are `"guest"`, `"anonymous"`, and `"google"`.
- No Firebase user yields a local guest snapshot.
- Anonymous auth uses `signInAnonymously`.
- Google auth uses `GoogleAuthProvider` and `signInWithPopup` with `prompt: "select_account"`.
- Guest names are `Guest Breeze {digits}` using the last 3 digits from a seed, padded.

`src/components/AuthProvider.tsx`:

- Owns auth state and exposes `useAuth()`.
- Subscribes to Firebase auth state when available.
- Falls back to local guest when Firebase is unavailable.
- Calls `ensureSignedProfile(snapshot)` whenever a Google user is observed.
- Exposes `signInGuest`, `signInGoogle`, and `signOut`.

`src/components/AuthActions.tsx`:

- Reusable auth buttons.
- Google button is disabled when Firebase is not configured.
- Onboarding uses `onBeforeAction` to mark onboarding complete before auth.

`src/components/AccountActions.tsx`:

- Used by `/settings`.
- Wraps `AuthActionButton`/`AuthNotice` from `AuthActions.tsx` into sign-in/sign-out/guest actions.

## Matchmaking

Types live in `src/lib/matchmaking/types.ts`.

Modes:

- `quick`
- `2p`
- `3p`
- `4p`

`JoinQueueInput.allowBots` (`src/lib/matchmaking/types.ts`) is an optional flag. `useMatchmaking`'s `joinMatchmaking(allowBots = false)` sets it; `MatchmakingClient`'s `startBotMatch()` calls it with `true` to allow bot fill server-side.

Current `modeToPlayerCount` maps `quick` to 2 players. Queue names:

- `anon_2p`
- `anon_3p`
- `anon_4p`
- `signed_2p`
- `signed_3p`
- `signed_4p`

`src/components/useMatchmaking.ts`:

- Determines `authType` from auth provider: Google means `signed`, everything else means `anonymous`.
- Starts queue with display name, user id for signed players, guest id for anonymous players, and requested player count.
- Subscribes to queue document only when queue source is `functions`.
- Cancels via callable when Firebase is configured or clears local queue otherwise.

`src/components/MatchmakingClient.tsx`:

- Starts queue on mount.
- Shows elapsed seconds and rotating queue status copy.
- If queue is matched and has `gameId`, routes to `/game?gameId={gameId}`.
- If local fallback queue is still queued after 18 seconds, routes to `/game?gameId=local`.
- If function queue is still queued after 20 seconds, calls `startBotMatch()` once to allow bot fill.
- Provides cancel back to `/lobby`.
- Provides "Open Local Prototype" link.

`src/lib/firebase/matchmaking.ts`:

- `joinQueue()` calls callable `joinQueue` when Functions is available.
- Without Functions, writes a queue snapshot to `localStorage["breezeblocks:local-queue"]`.
- `subscribeToQueue()` listens to `matchmakingQueue/{queueId}`.
- `cancelQueue()` calls callable or removes local snapshot.

## Firebase Functions Backend

Main file: `functions/src/index.ts`.

Rules helpers: `functions/src/gameRules.ts`.

Callable functions:

- `joinQueue`
- `cancelQueue`
- `submitMove`
- `claimTimeoutSkip`
- `claimBotMove`
- `ensureSignedProfile`

Scheduled functions:

- `sweepMatchmakingQueues`: runs every 1 minute (`onSchedule`, `maxInstances: 1`). Server-side matchmaking backstop. Scans each queue name; while a full group (`>= playerCount`) is waiting it forms matches via the same `attemptCreateMatchInTransaction` core as `joinQueue` (no requester, `allowBots: false`), one match per transaction, capped at `sweepMaxMatchesPerQueue` (6) per queue per run. Complements the client re-poll in `MatchmakingClient`: the client fast-path pairs players in the first ~20s while their app is open; the sweep catches backlogs and players whose clients backgrounded. Double-matching is prevented by the shared match core + `status` guard + Firestore transaction retry. Reuses the existing `matchmakingQueue` composite index (`status`, `queueName`, `joinedAt`); needs Cloud Scheduler enabled on deploy.

Callable options:

- Region: `us-central1`
- Memory: `256MiB`
- Timeout: 30 seconds
- Max instances: 5

Backend constants:

- `playerColors = ["#C5B0F4", "#DCEEB1", "#F4ECD6", "#EFD4D4"]`
- Stale queue age: 2 minutes.
- Matchmaking query limit: 12.
- Profile last-seen refresh interval: 1 hour.
- Queue TTL: 24 hours.
- Anonymous game TTL: 7 days.
- Signed game TTL: 90 days.
- Bot move delay: 700 ms.
- Matched queue reconnect window: 2 minutes (`matchedQueueReconnectMillis`).

### `joinQueue`

Requires auth. Validates:

- `authType` is `anonymous` or `signed`.
- `requestedPlayerCount` is 2, 3, or 4.
- `displayName` exists and is at most 80 chars.
- Signed users cannot join anonymous queues.
- Anonymous users cannot join signed queues.

Queue document id is deterministic per queue and uid: `${queueName}_${uid}`. This means one queue entry per player/mode, reducing duplicate queue spam.

Inside a transaction:

- Reads existing requester queue entry.
- Reads oldest queued entries for the queue name.
- Reuses fresh queued entries.
- Returns matched entries if already matched, as long as the match happened within `matchedQueueReconnectMillis` (2 minutes) — lets a client reconnect to its own just-created game using the same queue doc.
- Expires stale queued entries.
- Creates requester queue entry if needed.
- Creates a match if enough players are waiting or if `allowBots` is true.

Game creation uses a compact single-document shape under `games/{gameId}`:

- `gameId`
- `status`
- `playerType`
- `playerCount`
- `playerIds`
- `players`
- `lineOwners`
- `boxOwners`
- `capturedBoxCount`
- `currentTurnPlayerId`
- `turnIndex`
- `turnStartedAt`
- `turnDeadlineAt`
- `winnerPlayerIds`
- `createdAt`
- `startedAt`
- `completedAt`
- `expireAt`

`lineOwners` and `boxOwners` are maps keyed by ids. Owner values are player indexes, not player ids. Client normalization converts indexes back to player ids using the players array.

When bots are added, bot ids are `bot_2`, `bot_3`, etc. Bot display names are Breeze Bot, Dot Bot, Line Bot, or Box Bot.

### `cancelQueue`

Requires auth and `queueId`. Only the queue owner can cancel. Matched entries cannot be cancelled. Updates status to `cancelled`, writes `cancelledAt`, and keeps an `expireAt` for TTL cleanup.

### `submitMove`

Requires auth, `gameId`, valid line orientation/coordinates, active game, current player ownership, and unexpired timer.

Transaction steps:

- Load game.
- Normalize players, line owners, and box owners.
- Verify current turn player belongs to uid.
- Verify target line exists and is open.
- Apply line owner.
- Detect completed adjacent boxes.
- Update player score and reset mover skip count.
- Keep turn on capture; otherwise advance with `getNextActivePlayer`.
- Increment `turnIndex`.
- Reset turn timestamps/deadline.
- Update `capturedBoxCount`.
- If complete, set status `completed`, completed timestamp, winners, and TTL.
- For signed players only, write profile stat increments and match history.

### `claimTimeoutSkip`

Requires auth and `gameId`. Only runs when current turn deadline has passed. Requester must be a player in the game and must be the next active player after the skipped player. Skipped player increments `consecutiveSkips`; after 3 skips their `connectionStatus` becomes `inactive`.

### `claimBotMove`

Requires auth and `gameId`. Requester must be a non-bot human player in the game. The current player must be a bot. The bot must have waited at least `botMoveDelayMillis`. Applies the selected bot move via the same `applyMoveInTransaction` path as human moves.

### `ensureSignedProfile`

Requires signed non-anonymous auth. Anonymous users are rejected. Creates or updates `users/{uid}` with:

- `userId`
- `authProvider`
- `displayName`
- `avatarUrl`
- `totalWins`
- `totalLosses`
- `totalDraws`
- `totalGamesPlayed`
- `totalBoxesWon`
- `highestBoxesSingleGame`
- `createdAt`
- `updatedAt`
- `lastSeenAt`

Existing profiles update display name/avatar and throttle `lastSeenAt` updates to once per hour.

## Firestore Model and Security

Firestore rules are in `firestore.rules`. Clients can read only documents they own or participate in. All client writes are denied; Cloud Functions perform all writes.

Collections:

- `users/{userId}`: signed profile/stats. Readable only by that uid. Writes denied to clients.
- `matchmakingQueue/{queueEntryId}`: queue entries. Readable only by the owner uid via `userId` or `guestId`. Writes denied to clients.
- `games/{gameId}`: compact game documents. Readable only when `request.auth.uid` is in `playerIds`. Writes denied to clients.
- `matchHistory/{matchId}`: signed match history. Readable only by matching `userId`. Writes denied to clients.

Indexes in `firestore.indexes.json`:

- `matchHistory`: `userId ASC`, `completedAt DESC`.
- `matchmakingQueue`: `status ASC`, `queueName ASC`, `joinedAt ASC`.

TTL field overrides:

- `matchmakingQueue.expireAt`
- `games.expireAt`
- `matchHistory.expireAt`

Index disabled fields:

- `games.lineOwners`
- `games.boxOwners`
- `games.players`
- `games.winnerPlayerIds`

`firestore.rules` also has a nested `match /{document=**}` wildcard under `games/{gameId}` granting read access to subcollections of a game to its players. No client code currently reads any game subcollection; the compact single-document model is still the only one in use. Treat this rule as unused/speculative, not a sign subcollections exist.

## Profiles and Results

`src/lib/firebase/profile.ts`:

- `ensureSignedProfile()` calls callable no more than once per 6 hours per uid using `localStorage["breezeblocks:profile-ensured:{uid}"]`.
- `getPlayerProfile(userId)` reads `users/{userId}`.
- `getMatchHistory(userId)` reads latest 10 entries from `matchHistory`.

`src/components/usePlayerProfile.ts`:

- Loads profile and history only when Firebase is configured and provider is Google.
- Returns empty stats/history for guests.

`src/components/ProfileClient.tsx`:

- Shows auth action, stats, and recent signed matches.
- Guest matches are playable but not permanently saved.

`src/components/ResultClient.tsx`:

- For local game, shows local-only result copy.
- For online game, fetches `games/{gameId}` once via `getOnlineGame()`.
- Shows top 3 player scores in `StatStrip` and a full final-score list only when more than 3 players exist.
- Notes signed stats/history are saved automatically when the online game completes.

## Android and Capacitor

`capacitor.config.ts`:

- `appId: "com.breezeblocks.game"`
- `appName: "Breezeblocks"`
- `webDir: "out"`

Android project is under `android/`.

Important Android files:

- `android/app/build.gradle`: namespace/application id `com.breezeblocks.game`, versionCode 1, versionName 1.0, minify disabled for release, applies google-services plugin only if `google-services.json` exists.
- `android/app/src/main/AndroidManifest.xml`: main exported `MainActivity`, `INTERNET` permission, FileProvider.
- `android/app/src/main/res/values/strings.xml`: app name/title/package/custom URL scheme.

Release/setup notes are in `docs/android-release.md`. Android builds require:

1. `npm run build`
2. `npm run android:sync`
3. `npm run android:open` or `npm run android:run`

Android Studio is still needed for device/emulator management, signing, release builds, and Play Console uploads.

Current auth on Android is Firebase web Google sign-in in the Capacitor shell. Native Play Games sign-in is planned and should be added later with a Capacitor plugin or a custom Android bridge after Play Games credentials are available.

Play Games setup must be done in Google dashboards:

- Create Play Console Android app.
- Connect Firebase project.
- Add package `com.breezeblocks.game`.
- Generate debug/release SHA-1 fingerprints.
- Add fingerprints to Firebase.
- Enable Anonymous, Google, and Play Games auth providers.
- Configure Play Games Services credentials and tester accounts.

## Static Export Notes

`next.config.ts` sets:

```ts
output: "export";
images: { unoptimized: true };
turbopack: { root: __dirname };
```

Because the exported app runs inside Capacitor:

- Avoid features that require a Next.js server at runtime.
- Do not add API routes for game logic; use Firebase Functions or client-only logic.
- Use query params for dynamic online ids.
- Ensure new pages/components work after `next build` static export.

## Docs in Repo

- `README.md`: still mostly default create-next-app text.
- `breezeblocks_product_spec_build_plan.md`: broad product plan and intended feature set.
- `DESIGN.md`: design tokens and visual direction from Figma analysis.
- `docs/firebase-phase-5.md`: current Firebase backend boundary and remaining validation work.
- `docs/firebase-emulators.md`: local emulator workflow.
- `docs/android-release.md`: Android packaging and Play Games setup notes.

## Current Known Gaps and Cautions

- README is not yet updated to match the app.
- Product spec mentions Zustand and Framer Motion, but they are not installed.
- Play Games native auth is not implemented.
- Settings values are static display rows, not persisted controls.
- Local game supports only two default players; online backend supports 2-4.
- Quick Match currently maps to 2 players.
- Online game permissions depend on `playerIds` containing Firebase uids; keep that invariant.
- Online compact owner maps store player indexes. Any migration to owner ids must update Functions and client normalization together.
- Firestore client writes are intentionally denied. Do not add client writes to protected collections; route mutations through Functions.
- Result/profile stats are only permanent for signed Google users. Anonymous games expire and do not update `users` or `matchHistory`.
- `functions/lib/*.js` generated files are present in the repo. When editing Functions source, run `npm run build` in `functions/` if generated JS needs to stay in sync.
- There are existing uncommitted changes in this working tree. Do not revert files you did not intentionally modify.
- No automated test suite exists anywhere in the repo (no jest/vitest/playwright/cypress, no `*.test.*`/`*.spec.*` files).
- `.agents/`, `.trae/`, and `skills-lock.json` are Claude Code skill-plugin tooling (caveman/cavecrew), unrelated to app code. Ignore for app changes.

## Verification Checklist for Changes

For frontend-only changes:

```bash
npm run lint
npm run build
```

For Functions changes:

```bash
cd functions
npm run build
```

For Firebase flow changes:

```bash
npm run emulators
npm run dev
```

Then test with two browser sessions:

1. Normal window and incognito/private window.
2. Sign in as guest in both.
3. Join the same 2-player queue.
4. Confirm a `games/{gameId}` doc appears in Emulator UI.
5. Play moves and verify turn order, captures, score, timer skip, and completion.

For Android changes:

```bash
npm run build
npm run android:sync
```

Then open/run with Android Studio or Capacitor CLI.

