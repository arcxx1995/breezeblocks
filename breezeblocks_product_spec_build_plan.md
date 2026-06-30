# Breezeblocks — Complete Product Spec & Build Plan

## 1. Product Overview

**Breezeblocks** is a mobile-first Android multiplayer strategy game built with **Next.js / React**, not Flutter.

Players enter a 100-dot board. Each player is assigned a color. On their turn, a player draws one horizontal or vertical line between two adjacent dots. If that line completes a box, the box turns into that player’s color and the player earns 1 point.

The game supports:

- 2–4 player multiplayer
- Anonymous matchmaking
- Signed-in player matchmaking
- Google / Play Games sign-in
- Player profiles
- Total wins tracking
- Total boxes won tracking
- Loading screen
- Comprehensive onboarding
- Main lobby
- Real-time game screen
- 20-second turn timer
- Automatic skipped turns on timeout

The app should feel light, breezy, strategic, colorful, and satisfying.

---

## 2. Important Board Definition

The phrase **100 dot matrix** will be interpreted as:

- 10 dots across
- 10 dots down
- 100 total dots
- 9×9 possible boxes
- 81 total capturable boxes

If the goal is to have **100 boxes**, then the board must instead be:

- 11 dots across
- 11 dots down
- 121 total dots
- 10×10 possible boxes
- 100 total capturable boxes

For this specification, Breezeblocks will use the original requested version:

> **10×10 dots = 100 dots = 81 boxes**

---

## 3. Recommended Tech Stack

### Frontend

Use:

- Next.js
- React
- TypeScript
- Tailwind CSS
- Zustand for local game UI state
- SVG for board rendering
- Framer Motion for animations
- Capacitor for Android packaging

Capacitor is designed to build native Android, iOS, and PWA apps from web technologies such as JavaScript, HTML, and CSS, which fits the requirement to build Breezeblocks in Next.js/React instead of Flutter.

Reference: https://capacitorjs.com/

### Android Packaging

Use:

- Next.js static export
- Capacitor Android project
- Android Studio for final build/signing
- Google Play Console for release

Next.js static export can generate static HTML/CSS/JS assets into an `out` folder, which is suitable for loading inside a Capacitor Android shell.

Reference: https://nextjs.org/docs/app/guides/static-exports

### Backend

Use Firebase for the first version:

- Firebase Authentication
- Firebase Anonymous Auth
- Google / Play Games sign-in
- Firestore for game state
- Cloud Functions for authoritative move validation
- Firebase Hosting optional for web preview
- Firebase Analytics optional

Firebase supports anonymous temporary accounts, and those accounts can later be linked to permanent sign-in credentials, which fits the anonymous-to-signed Breezeblocks flow.

Reference: https://firebase.google.com/docs/auth/web/anonymous-auth

### Why Firebase Over Supabase for MVP

Supabase is good, but Firebase is simpler for this exact game because Breezeblocks needs:

- Anonymous auth
- Google auth
- Play Games auth compatibility
- Realtime client updates
- Mobile-first integration
- Server-side Cloud Functions

Firebase also documents how to authenticate with Google Play Games Services on Android by signing the player in with Google Play Games and requesting an OAuth 2.0 auth code.

Reference: https://firebase.google.com/docs/auth/android/play-games

---

## 4. Google Play / Google Auth Requirement

“Google Play Store Auth” should be treated as:

1. **Google Play Games Services platform authentication**
2. **Google / in-game account authentication**
3. **A Breezeblocks internal player profile**

Google Play Games Services are configured through Google Play Console.

Reference: https://developer.android.com/games/pgs/console/setup

Play Games Services v2 separates platform authentication from in-game authentication, so Breezeblocks should not rely only on Play Store install identity; it should create its own internal player profile after auth.

Reference: https://developer.android.com/games/pgs/platform-authentication

### Auth Types

Breezeblocks has two player types:

1. Anonymous player
2. Signed-in player

### Anonymous Players

Anonymous players can:

- Play without signing up
- Enter anonymous queue
- Match only with anonymous players
- Receive a guest name
- Finish full games

Anonymous players cannot:

- Match with signed-in players
- Save permanent stats
- Access permanent profile
- Appear on leaderboards

Example guest names:

- Guest Breeze 124
- Guest Dot 821
- Guest Kite 492
- Guest Cloud 304

### Signed-In Players

Signed-in players can:

- Sign in with Google / Play Games
- Create a permanent Breezeblocks profile
- Match with signed-in players
- Track total wins
- Track total boxes won
- Track games played
- View match history
- Later appear on leaderboards

---

## 5. Core Game Rules

## 5.1 Players

Supported player counts:

- 2 players
- 3 players
- 4 players

Each player gets a unique color.

Default colors:

- Player 1: Blue
- Player 2: Red
- Player 3: Green
- Player 4: Yellow

## 5.2 Board

Board:

- 10×10 dots
- 100 dots total
- 9×9 boxes
- 81 capturable boxes

Line count:

- 90 horizontal lines
- 90 vertical lines
- 180 total possible lines

## 5.3 Turn Rules

On each turn, the active player has **20 seconds** to draw one valid line.

A valid line must:

- Connect two adjacent dots
- Be horizontal or vertical
- Not be diagonal
- Not already be drawn
- Be drawn by the active player only
- Be inside the board boundary

## 5.4 Timer Rule

Each player gets **20 seconds** per turn.

If the player does not draw a valid line within 20 seconds:

- The turn is skipped automatically
- No line is drawn
- No box is captured
- No point is awarded
- The turn passes to the next player

If the player captures a box:

- The player gets 1 point per captured box
- The captured box fills with their color
- The player keeps the turn
- The timer resets to a fresh 20 seconds

If the player does not capture a box:

- The turn passes to the next player
- The next player gets 20 seconds

## 5.5 Box Capture Rule

A box is captured when all 4 sides are drawn.

The player who draws the final side owns the box.

A single line can complete:

- 0 boxes
- 1 box
- 2 boxes

If a player completes 2 boxes with one line, they receive 2 points.

## 5.6 Game End

The game ends when all boxes are captured or all possible lines are drawn.

Winner:

- Player with the most captured boxes wins.
- If multiple players have the same highest score, the game is a draw between those players.

---

## 6. Product Screens

## 6.1 Loading Screen

Purpose:

- Show brand identity
- Restore session
- Load game assets
- Check auth state
- Route user to onboarding or lobby

Visual:

- Breezeblocks logo
- Animated dots
- Soft wind movement
- Gradient background

Loading copy examples:

- “Setting up the board…”
- “Counting the dots…”
- “Waiting for the breeze…”
- “Sharpening the blocks…”

Routing logic:

- If first-time user: go to onboarding
- If returning anonymous user: go to lobby
- If signed-in user: go to lobby
- If session invalid: go to onboarding/login choice

---

## 6.2 Onboarding Flow

The onboarding should teach the game visually.

### Slide 1 — Welcome

Title:

**Welcome to Breezeblocks**

Copy:

“Draw lines, capture boxes, and outthink your opponents.”

Visual:

- Empty dot board
- Colored lines gently appearing

CTA:

“Start”

---

### Slide 2 — Draw a Line

Title:

**Draw a Line**

Copy:

“On your turn, connect two neighboring dots. Lines can only be horizontal or vertical.”

Visual:

- Two dots glow
- A line appears between them
- Diagonal attempt shakes and disappears

Interactive element:

- User taps a valid line slot

CTA:

“Next”

---

### Slide 3 — Capture a Box

Title:

**Complete the Fourth Side**

Copy:

“When your line completes a box, that box becomes yours.”

Visual:

- Three sides of a box already drawn
- User draws final side
- Box fills with color

CTA:

“Capture”

---

### Slide 4 — Score Points

Title:

**Every Box Is 1 Point**

Copy:

“Capture boxes to increase your score. The player with the most boxes wins.”

Visual:

- Box fills
- `+1 Box` flair appears
- Score counter increases

CTA:

“Nice”

---

### Slide 5 — Keep the Turn

Title:

**Capture and Continue**

Copy:

“If you capture a box, you get another turn. Use this to create chains.”

Visual:

- Player captures one box
- Timer resets to 20 seconds
- Same player remains active

CTA:

“Next”

---

### Slide 6 — 20 Seconds Per Turn

Title:

**Move Before Time Runs Out**

Copy:

“You get 20 seconds to draw a line. If you don’t move, your turn is skipped.”

Visual:

- Countdown from 20
- Timer turns urgent at 5 seconds
- Turn skips at 0

CTA:

“Got it”

---

### Slide 7 — Multiplayer

Title:

**Play With 2–4 Players**

Copy:

“Every player gets a color. Take turns, set traps, and capture the board.”

Visual:

- Four player cards
- Color chips
- Turn order animation

CTA:

“Continue”

---

### Slide 8 — Choose How to Play

Title:

**Play Your Way**

Options:

1. Play Anonymously
2. Sign in with Google

Copy:

“Anonymous players match only with anonymous players. Signed-in players save wins, boxes, and profile stats.”

---

## 6.3 Main Lobby

Purpose:

The main hub of the game.

### Header

Contains:

- Breezeblocks logo
- Player name
- Avatar or guest icon
- Settings button
- Profile button

For anonymous users:

- Show guest name
- Show “Sign in to save stats” CTA

For signed-in users:

- Show avatar
- Show display name
- Show total wins preview
- Show total boxes preview

### Primary CTA

**Find Match**

### Game Mode Selector

Options:

- Quick Match
- 2 Players
- 3 Players
- 4 Players

Quick Match should select the fastest available queue.

### Lobby Cards

Cards:

1. Find Match
2. How to Play
3. Profile
4. Settings

### Anonymous Notice

“Playing as Guest. You’ll only match with other anonymous players.”

### Signed-In Notice

“Signed in. Your wins and boxes will be saved.”

---

## 6.4 Matchmaking Screen

Purpose:

Show waiting state while finding players.

Elements:

- Animated dot board
- Player color preview
- Queue status
- Cancel button

Copy examples:

- “Finding players…”
- “Waiting for 1 more player…”
- “Waiting for 2 more players…”
- “Match found!”
- “Building the board…”

### Queue Rules

Anonymous users enter only anonymous queues.

Signed-in users enter only signed queues.

Queue names:

```ts
anon_2p
anon_3p
anon_4p
signed_2p
signed_3p
signed_4p
```

### Queue Timeout UX

After 30 seconds:

Show:

“Taking longer than usual.”

Options:

- Continue waiting
- Try Quick Match
- Switch to 2-player mode
- Cancel

---

## 6.5 Game Screen

Purpose:

The main interactive multiplayer screen.

### Top Area

Contains:

- Game room ID, optional
- Current turn label
- 20-second countdown timer
- Active player color
- Connection status

Example:

“Arpan’s turn — 14s”

### Scoreboard

Each player card shows:

- Name
- Avatar or guest icon
- Color
- Current boxes captured
- Active turn highlight
- Disconnected/inactive state

### Board Area

Board displays:

- 10×10 dots
- Horizontal line slots
- Vertical line slots
- Captured boxes
- Hover/touch previews
- Last move highlight

### Bottom Area

Contains:

- Game log
- Resign button
- Settings button
- Optional emote button

### Game Log Examples

- “Blue captured a box.”
- “Red skipped their turn.”
- “Green captured 2 boxes.”
- “Yellow has 5 seconds left.”
- “Game over.”

---

## 6.6 Result Screen

Appears when game ends.

Elements:

- Winner announcement
- Final scoreboard
- Boxes captured by each player
- Total game duration
- CTA: Play Again
- CTA: Back to Lobby
- CTA for anonymous users: Sign in to save future stats

For signed-in users, update:

- Total wins
- Total boxes won
- Total games played
- Total losses
- Total draws

---

## 6.7 Profile Screen

Only fully available to signed-in users.

Profile fields:

- Display name
- Avatar
- Total wins
- Total boxes won
- Total games played
- Win rate
- Highest boxes in one game
- Recent matches

Anonymous users see:

“Create a profile to save your wins, boxes, and match history.”

CTA:

“Sign in with Google”

---

## 6.8 Settings Screen

Settings:

- Sound on/off
- Haptics on/off
- Music on/off
- Show move hints on/off
- Dark/light/system theme
- Sign out
- Delete account
- Privacy policy
- Terms of service

---

## 7. Game State Model

## 7.1 Constants

```ts
const DOT_ROWS = 10;
const DOT_COLS = 10;

const BOX_ROWS = 9;
const BOX_COLS = 9;

const TURN_DURATION_SECONDS = 20;

const HORIZONTAL_LINE_ROWS = 10;
const HORIZONTAL_LINE_COLS = 9;

const VERTICAL_LINE_ROWS = 9;
const VERTICAL_LINE_COLS = 10;
```

---

## 7.2 Line Model

```ts
type LineOrientation = "horizontal" | "vertical";

type Line = {
  id: string;
  orientation: LineOrientation;
  row: number;
  col: number;
  ownerPlayerId: string | null;
  drawnAt: string | null;
};
```

Horizontal lines:

```ts
H[row][col]
// row: 0 to 9
// col: 0 to 8
```

Vertical lines:

```ts
V[row][col]
// row: 0 to 8
// col: 0 to 9
```

---

## 7.3 Box Model

```ts
type Box = {
  id: string;
  row: number;
  col: number;
  ownerPlayerId: string | null;
  completedAt: string | null;
};
```

Boxes:

```ts
B[row][col]
// row: 0 to 8
// col: 0 to 8
```

A box at `B[row][col]` is complete when:

```ts
H[row][col]       // top
H[row + 1][col]   // bottom
V[row][col]       // left
V[row][col + 1]   // right
```

are all drawn.

---

## 7.4 Player Model

```ts
type GamePlayer = {
  playerId: string;
  userId: string | null;
  guestId: string | null;
  displayName: string;
  avatarUrl?: string | null;
  color: string;
  score: number;
  isAnonymous: boolean;
  connectionStatus: "connected" | "disconnected" | "inactive" | "left";
  consecutiveSkips: number;
  turnOrder: number;
};
```

---

## 7.5 Game Model

```ts
type Game = {
  gameId: string;
  status: "waiting" | "active" | "completed" | "cancelled";
  playerType: "anonymous" | "signed";
  playerCount: 2 | 3 | 4;

  players: GamePlayer[];

  currentTurnPlayerId: string;
  turnIndex: number;
  turnStartedAt: string;
  turnDeadlineAt: string;

  lines: Record<string, Line>;
  boxes: Record<string, Box>;

  moveHistory: Move[];
  skipHistory: SkippedTurn[];

  winnerPlayerIds: string[];

  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
};
```

---

## 7.6 Move Model

```ts
type Move = {
  moveId: string;
  gameId: string;
  playerId: string;
  orientation: "horizontal" | "vertical";
  row: number;
  col: number;
  completedBoxIds: string[];
  createdAt: string;
};
```

---

## 7.7 Skipped Turn Model

```ts
type SkippedTurn = {
  skipId: string;
  gameId: string;
  playerId: string;
  reason: "timeout";
  skippedAt: string;
};
```

---

## 8. Backend Authority Rules

The backend must be the source of truth.

The frontend can display the board and send intended moves, but it cannot directly decide:

- Scores
- Box ownership
- Turn changes
- Skips
- Winners
- Game completion

All game-changing actions must go through Cloud Functions.

---

## 9. Core Backend Functions

## 9.1 `joinQueue`

Purpose:

Add player to matchmaking queue.

Input:

```ts
{
  authType: "anonymous" | "signed";
  requestedPlayerCount: 2 | 3 | 4;
}
```

Validation:

- User must be authenticated, either anonymously or signed-in.
- Anonymous users can only join anonymous queue.
- Signed-in users can only join signed queue.
- User cannot already be in another active queue.
- User cannot already be in an active game, unless reconnecting.

Output:

```ts
{
  queueId: string;
  status: "queued" | "matched";
  gameId?: string;
}
```

---

## 9.2 `cancelQueue`

Purpose:

Remove player from queue.

Input:

```ts
{
  queueId: string;
}
```

Validation:

- Queue entry belongs to current user/session.
- Queue entry is not already matched.

---

## 9.3 `createMatchIfReady`

Purpose:

Create a game when enough players are waiting.

Logic:

1. Find queue with enough players.
2. Lock selected queue entries.
3. Create game document.
4. Assign colors.
5. Randomize turn order.
6. Initialize lines and boxes.
7. Set first player.
8. Set `turnStartedAt`.
9. Set `turnDeadlineAt = now + 20 seconds`.
10. Remove players from queue.
11. Notify clients.

---

## 9.4 `submitMove`

Purpose:

Submit a player’s line move.

Input:

```ts
{
  gameId: string;
  orientation: "horizontal" | "vertical";
  row: number;
  col: number;
}
```

Validation:

1. Game exists.
2. Game is active.
3. Player belongs to game.
4. Player is connected or valid.
5. It is the player’s turn.
6. Current time is before `turnDeadlineAt`.
7. Line orientation is valid.
8. Line coordinates are inside board.
9. Line has not already been drawn.

Execution:

1. Draw line.
2. Check adjacent boxes.
3. Capture completed boxes.
4. Add points.
5. Record move.
6. Reset consecutive skips for player.
7. If boxes captured, keep same player’s turn.
8. If no boxes captured, advance turn.
9. Set new `turnStartedAt`.
10. Set new `turnDeadlineAt = now + 20 seconds`.
11. If game complete, finish game.
12. Broadcast state.

---

## 9.5 `claimTimeoutSkip`

Purpose:

Skip a player’s turn after 20 seconds.

The frontend may call this when countdown reaches zero, but the backend must verify the deadline.

Input:

```ts
{
  gameId: string;
}
```

Validation:

1. Game exists.
2. Game is active.
3. Current time is after `turnDeadlineAt`.
4. No valid move has already advanced the turn.
5. Current player is still the same timed-out player.

Execution:

1. Create skipped turn record.
2. Increase player’s consecutive skip count.
3. If consecutive skips reach 3, mark player inactive.
4. Advance to next active player.
5. Set new `turnStartedAt`.
6. Set new `turnDeadlineAt = now + 20 seconds`.
7. Broadcast `TURN_SKIPPED`.
8. Broadcast `TURN_CHANGED`.

Important:

The frontend does not decide the skip. It only asks the server to process the timeout. The server checks the official deadline.

---

## 9.6 `completeGame`

Purpose:

Finalize game and update signed-in profile stats.

Triggered when:

- All boxes are captured
- All lines are drawn
- Forfeit condition is met

Execution:

1. Calculate final scores.
2. Determine winner or draw.
3. Mark game as completed.
4. Update signed-in players’ stats.
5. Do not save permanent stats for anonymous players.
6. Create match history records.
7. Broadcast result.

---

## 10. Timer Behavior

Each player gets exactly **20 seconds**.

### Timer Display

Frontend shows:

- Circular countdown
- Numeric countdown
- Active player name
- Warning pulse at 5 seconds
- Red/orange urgency from 5 to 0 seconds

### Timer States

```ts
type TurnTimerState = {
  activePlayerId: string;
  turnStartedAt: string;
  turnDeadlineAt: string;
  durationSeconds: 20;
  remainingSeconds: number;
  status: "running" | "expired";
};
```

### Skip Rules

If timer hits 0:

- Turn skips automatically
- No line is drawn
- No point is awarded
- The next player receives the turn

### Repeated Timeout Rules

- 1 timeout: normal skip
- 2 consecutive timeouts: warning state
- 3 consecutive timeouts: mark player inactive
- Inactive players are auto-skipped until the game ends or they reconnect

For MVP, do not replace inactive players with bots. Just auto-skip them.

---

## 11. Matchmaking Logic

### Queue Types

```ts
anon_2p
anon_3p
anon_4p
signed_2p
signed_3p
signed_4p
```

### Anonymous Matching Rule

Anonymous players can only match with anonymous players.

### Signed Matching Rule

Signed-in players can only match with signed-in players.

### Quick Match Logic

For anonymous users:

1. Check `anon_2p`
2. Check `anon_3p`
3. Check `anon_4p`
4. Join fastest viable anonymous queue

For signed-in users:

1. Check `signed_2p`
2. Check `signed_3p`
3. Check `signed_4p`
4. Join fastest viable signed queue

### Match Creation

When enough players are available:

1. Create game
2. Assign colors
3. Randomize first turn
4. Remove users from queue
5. Send players to game screen

---

## 12. Database Structure

Use Firestore collections.

## 12.1 `users`

```ts
users/{userId} = {
  userId: string;
  authProvider: "google" | "play_games" | "anonymous";
  googleId?: string;
  playGamesPlayerId?: string;
  displayName: string;
  avatarUrl?: string;

  totalWins: number;
  totalLosses: number;
  totalDraws: number;
  totalGamesPlayed: number;
  totalBoxesWon: number;
  highestBoxesSingleGame: number;

  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastSeenAt: Timestamp;
}
```

---

## 12.2 `games`

```ts
games/{gameId} = {
  gameId: string;
  status: "waiting" | "active" | "completed" | "cancelled";
  playerType: "anonymous" | "signed";
  playerCount: 2 | 3 | 4;

  currentTurnPlayerId: string;
  turnIndex: number;
  turnStartedAt: Timestamp;
  turnDeadlineAt: Timestamp;

  winnerPlayerIds: string[];

  createdAt: Timestamp;
  startedAt: Timestamp;
  completedAt?: Timestamp;
}
```

---

## 12.3 `games/{gameId}/players`

```ts
players/{playerId} = {
  playerId: string;
  userId?: string;
  guestId?: string;
  displayName: string;
  avatarUrl?: string;
  color: string;
  score: number;
  isAnonymous: boolean;
  connectionStatus: "connected" | "disconnected" | "inactive" | "left";
  consecutiveSkips: number;
  turnOrder: number;
}
```

---

## 12.4 `games/{gameId}/lines`

```ts
lines/{lineId} = {
  lineId: string;
  orientation: "horizontal" | "vertical";
  row: number;
  col: number;
  ownerPlayerId?: string;
  drawnAt?: Timestamp;
}
```

---

## 12.5 `games/{gameId}/boxes`

```ts
boxes/{boxId} = {
  boxId: string;
  row: number;
  col: number;
  ownerPlayerId?: string;
  completedAt?: Timestamp;
}
```

---

## 12.6 `games/{gameId}/moves`

```ts
moves/{moveId} = {
  moveId: string;
  gameId: string;
  playerId: string;
  orientation: "horizontal" | "vertical";
  row: number;
  col: number;
  completedBoxIds: string[];
  createdAt: Timestamp;
}
```

---

## 12.7 `matchmakingQueue`

```ts
matchmakingQueue/{queueEntryId} = {
  queueEntryId: string;
  authType: "anonymous" | "signed";
  requestedPlayerCount: 2 | 3 | 4;
  userId?: string;
  guestId?: string;
  displayName: string;
  status: "queued" | "matched" | "cancelled";
  joinedAt: Timestamp;
}
```

---

## 12.8 `matchHistory`

```ts
matchHistory/{matchId} = {
  matchId: string;
  gameId: string;
  userId: string;
  result: "win" | "loss" | "draw";
  boxesCaptured: number;
  playerCount: 2 | 3 | 4;
  completedAt: Timestamp;
}
```

---

## 13. Frontend Routes

Use Next.js app router.

```txt
/app
  /page.tsx                     Loading / redirect
  /onboarding/page.tsx           Onboarding
  /lobby/page.tsx                Main lobby
  /matchmaking/page.tsx          Matchmaking
  /game/[gameId]/page.tsx        Game screen
  /result/[gameId]/page.tsx      Result screen
  /profile/page.tsx              Profile
  /settings/page.tsx             Settings
  /how-to-play/page.tsx          Tutorial replay
```

For Capacitor, keep routes client-safe and avoid server-only Next.js behavior in the mobile bundle.

---

## 14. Recommended Folder Structure

```txt
breezeblocks/
  app/
    page.tsx
    onboarding/
    lobby/
    matchmaking/
    game/[gameId]/
    result/[gameId]/
    profile/
    settings/
    how-to-play/

  components/
    board/
      Dot.tsx
      LineSlot.tsx
      CapturedBox.tsx
      GameBoard.tsx
      TurnTimer.tsx
    lobby/
    onboarding/
    profile/
    shared/

  lib/
    firebase/
      client.ts
      auth.ts
      games.ts
      matchmaking.ts
    game/
      boardConstants.ts
      lineUtils.ts
      boxUtils.ts
      scoring.ts
      turnUtils.ts
      validation.ts
    capacitor/
      haptics.ts
      appState.ts

  store/
    useAuthStore.ts
    useGameStore.ts
    useLobbyStore.ts

  functions/
    src/
      joinQueue.ts
      cancelQueue.ts
      createMatchIfReady.ts
      submitMove.ts
      claimTimeoutSkip.ts
      completeGame.ts
      updateStats.ts

  public/
    icons/
    sounds/
    images/

  capacitor.config.ts
  next.config.ts
  package.json
```

---

## 15. UI Design Direction

### Brand Feel

Breezeblocks should feel:

- Breezy
- Lightweight
- Strategic
- Colorful
- Soft but competitive
- Friendly enough for casual players

### Visual Motifs

- Dots
- Wind trails
- Floating blocks
- Colored territory
- Smooth box fills
- Soft glow on active lines

### Suggested Colors

Backgrounds:

```txt
Deep Navy: #0B1020
Mist White: #F8FBFF
Soft Sky: #DDF7FF
```

Player colors:

```txt
Blue: #3B82F6
Red: #EF4444
Green: #22C55E
Yellow: #FACC15
```

Accent colors:

```txt
Breeze Cyan: #67E8F9
Soft Purple: #A78BFA
Success Green: #22C55E
Warning Orange: #FB923C
```

### Typography

Use:

- Headings: Space Grotesk or Sora
- Body: Inter
- Game numbers/timer: Geist Mono or JetBrains Mono

---

## 16. Game Animations

Required animations:

### Loading

- Dots appear one by one
- Breeze line moves across board
- Logo gently floats

### Onboarding

- Finger gesture drawing line
- Invalid diagonal shake
- Box capture fill
- `+1 Box` score pop

### Game

- Active player pulse
- Line draw stroke animation
- Box fill animation
- Score counter bump
- Timer urgency pulse
- Turn change slide
- Timeout skip shake
- Winner celebration

### Haptics

Use haptics for:

- Valid line drawn
- Box captured
- Invalid move
- Timeout warning
- Game win

---

## 17. Sound Design

MVP sound effects:

- Line drawn: soft click
- Box captured: bright pop
- Timer warning: subtle tick
- Turn skipped: soft whoosh
- Game won: short celebratory chime

Settings must allow:

- Sound off
- Music off
- Haptics off

---

## 18. MVP Scope

## Must Have

- Next.js / React app
- Android packaging through Capacitor
- Loading screen
- Onboarding
- Anonymous auth
- Google sign-in
- Main lobby
- 2-player matchmaking
- 3-player matchmaking
- 4-player matchmaking
- Anonymous-only queues
- Signed-in-only queues
- 10×10 dot board
- 81 capturable boxes
- Turn-based line drawing
- 20-second timer
- Automatic skip on timeout
- Box capture logic
- Score tracking
- Realtime game updates
- Result screen
- Signed-in profile
- Total wins
- Total boxes won

## Should Have

- Turn warning animation
- Haptics
- Sound effects
- Match history
- Reconnect support
- Inactive player auto-skip

## Later

- Bot mode
- Private rooms
- Friend invites
- Ranked mode
- Leaderboards
- Play Games achievements
- Cosmetics
- Emotes
- Daily challenges
- Seasonal boards
- Push notifications

---

# 19. Build Plan

## Phase 0 — Project Setup

Goal:

Create the foundation.

Tasks:

1. Create Next.js app with TypeScript.
2. Install Tailwind CSS.
3. Install Zustand.
4. Install Framer Motion.
5. Install Firebase client SDK.
6. Set up Firebase project.
7. Set up Firebase Auth.
8. Set up Firestore.
9. Set up Cloud Functions.
10. Install Capacitor.
11. Add Android platform.
12. Configure app name as Breezeblocks.

Deliverable:

- Running local Next.js app
- Firebase connected
- Capacitor Android project created

Acceptance criteria:

- App runs locally.
- Firebase config loads.
- Android shell opens the web app.

---

## Phase 1 — Local Game Prototype

Goal:

Build the core game without backend or multiplayer.

Tasks:

1. Render 10×10 dots.
2. Render horizontal line slots.
3. Render vertical line slots.
4. Allow local player to tap a line.
5. Prevent duplicate line drawing.
6. Prevent diagonal moves.
7. Add 2-player local turn system.
8. Detect completed boxes.
9. Fill captured boxes with player color.
10. Award points.
11. Keep turn after box capture.
12. Pass turn if no box captured.
13. Detect game completion.
14. Show local result screen.

Deliverable:

- Fully playable local 2-player game on one device.

Acceptance criteria:

- Player can draw valid lines.
- Boxes are captured correctly.
- Score updates correctly.
- Game ends correctly.

---

## Phase 2 — Timer and Skip Logic

Goal:

Add the 20-second turn mechanic locally.

Tasks:

1. Add visible countdown timer.
2. Start timer on turn begin.
3. Reset timer after valid move.
4. Reset timer after box capture.
5. Skip turn at 0 seconds.
6. Add skip animation.
7. Track consecutive skips.
8. Mark player inactive after 3 consecutive skips.

Deliverable:

- Local game with 20-second turn skip.

Acceptance criteria:

- Timer starts at 20.
- Timer reaches 0.
- Turn skips automatically.
- Capturing a box gives fresh 20 seconds.

---

## Phase 3 — Product Screens

Goal:

Build the full app shell.

Tasks:

1. Loading screen.
2. Onboarding screens.
3. Lobby screen.
4. Matchmaking screen.
5. Game screen.
6. Result screen.
7. Profile screen.
8. Settings screen.
9. How to Play screen.

Deliverable:

- Navigable mobile-first app.

Acceptance criteria:

- User can move through full app flow.
- Screens look good on Android dimensions.
- Onboarding teaches the game clearly.

---

## Phase 4 — Authentication

Goal:

Add anonymous and signed-in identity.

Tasks:

1. Add Firebase anonymous auth.
2. Add Google sign-in.
3. Add Play Games-compatible auth path for Android.
4. Create user profile document for signed-in users.
5. Create guest identity for anonymous users.
6. Add sign-out.
7. Add anonymous-to-signed upgrade path.
8. Store local onboarding completion.

Deliverable:

- Working auth system.

Acceptance criteria:

- User can play anonymously.
- User can sign in with Google.
- Signed-in users get profile docs.
- Anonymous users do not get permanent stats.
- Anonymous users can upgrade.

---

## Phase 5 — Matchmaking

Goal:

Create real multiplayer matching.

Tasks:

1. Create matchmaking queue collection.
2. Build `joinQueue` function.
3. Build `cancelQueue` function.
4. Build `createMatchIfReady` function.
5. Separate queues by auth type.
6. Separate queues by player count.
7. Add Quick Match logic.
8. Route matched players to game room.
9. Handle queue cancellation.
10. Handle stale queue entries.

Deliverable:

- Players can find matches.

Acceptance criteria:

- Anonymous players match only with anonymous players.
- Signed-in players match only with signed-in players.
- 2-player, 3-player, and 4-player queues work.
- Matchmaking creates game room correctly.

---

## Phase 6 — Realtime Multiplayer Game

Goal:

Make the online game playable.

Tasks:

1. Create game document.
2. Create players subcollection.
3. Create lines subcollection.
4. Create boxes subcollection.
5. Create moves subcollection.
6. Subscribe frontend to game state.
7. Build `submitMove` Cloud Function.
8. Validate turns server-side.
9. Validate lines server-side.
10. Validate timer server-side.
11. Update board after each move.
12. Broadcast captured boxes.
13. Broadcast turn changes.
14. End game when complete.

Deliverable:

- Real online multiplayer game.

Acceptance criteria:

- Two or more devices can play the same game.
- Moves sync in realtime.
- Wrong-turn moves are rejected.
- Duplicate moves are rejected.
- Box captures are server-authoritative.
- Game completion works.

---

## Phase 7 — Server-Authoritative Timeout

Goal:

Make 20-second timeout multiplayer-safe.

Tasks:

1. Add `turnStartedAt`.
2. Add `turnDeadlineAt`.
3. Display countdown from server deadline.
4. Add `claimTimeoutSkip` Cloud Function.
5. Let clients call timeout claim after deadline.
6. Server validates current time.
7. Server skips timed-out player.
8. Server broadcasts `TURN_SKIPPED`.
9. Server advances turn.
10. Add stale-game sweeper function for abandoned games.

Deliverable:

- Multiplayer timeout and skip system.

Acceptance criteria:

- If player does not move in 20 seconds, turn skips.
- Client cannot falsely skip before deadline.
- Client cannot extend timer.
- Turn deadline remains consistent across devices.

---

## Phase 8 — Profile Stats

Goal:

Track signed-in user progress.

Tasks:

1. Track total wins.
2. Track total losses.
3. Track total draws.
4. Track total games played.
5. Track total boxes won.
6. Track highest boxes in single game.
7. Create match history.
8. Show profile stats.
9. Prevent anonymous stat persistence.
10. Add upgrade CTA for anonymous users.

Deliverable:

- Profile and stats system.

Acceptance criteria:

- Signed-in wins update after game.
- Total boxes won updates after game.
- Profile shows correct stats.
- Anonymous users are prompted to sign in.

---

## Phase 9 — Android Polish

Goal:

Make it feel like a real Android game.

Tasks:

1. Add splash screen.
2. Add app icon.
3. Add haptics.
4. Add native back button behavior.
5. Add Android status bar styling.
6. Add app resume/reconnect behavior.
7. Add offline/disconnected UI.
8. Test on real Android devices.
9. Optimize bundle size.
10. Optimize board touch targets.

Deliverable:

- Polished Android build.

Acceptance criteria:

- App launches smoothly.
- Board is easy to tap.
- Back button does not break game.
- App reconnects after backgrounding.
- Visuals feel native enough.

---

## Phase 10 — Play Store Release

Goal:

Prepare for Google Play.

Tasks:

1. Create Google Play Console app.
2. Configure package name.
3. Configure signing.
4. Set up Play Games Services.
5. Configure OAuth credentials.
6. Add privacy policy.
7. Add terms of service.
8. Add screenshots.
9. Add feature graphic.
10. Add app description.
11. Create internal testing release.
12. Fix test feedback.
13. Create closed beta.
14. Submit production release.

Deliverable:

- Breezeblocks available on Google Play.

Acceptance criteria:

- Internal testing build installs.
- Google sign-in works.
- Multiplayer works on release build.
- Play Console requirements are satisfied.

---

# 20. Testing Plan

## Unit Tests

Test:

- Line validation
- Box completion
- Score calculation
- Turn advancement
- Timer expiry
- Skip logic
- Winner calculation

## Integration Tests

Test:

- Join queue
- Cancel queue
- Match creation
- Submit valid move
- Reject invalid move
- Capture box
- Skip timeout
- Complete game
- Update stats

## Manual Tests

Test:

- Anonymous 2-player match
- Anonymous 3-player match
- Anonymous 4-player match
- Signed-in 2-player match
- Signed-in profile update
- Timeout skip
- Disconnect and reconnect
- App background and resume
- Slow network behavior

## Anti-Cheat Tests

Try to:

- Move out of turn
- Draw already-used line
- Submit diagonal line
- Submit after timer expires
- Change score from frontend
- Join signed queue anonymously
- Join anonymous queue while signed in
- Submit duplicate move rapidly

All should fail.

---

# 21. Security Requirements

- No secret keys in frontend.
- Firebase rules must prevent direct score writes.
- Only Cloud Functions can mutate game state.
- Users can only read games they belong to.
- Users can only join queues matching their auth type.
- Moves must be validated server-side.
- Timer must be validated server-side.
- Profile stats must be updated server-side.
- Rate-limit move submissions.
- Prevent duplicate queue entries.
- Prevent multiple active games from one queue request.

---

# 22. Key Product Decisions

## Decision 1

Use **10×10 dots**, not 10×10 boxes.

Reason:

The user requested a 100-dot matrix. A 10×10 dot grid naturally creates 81 boxes.

## Decision 2

Use **automatic skip**, not manual skip.

Reason:

Manual skip can be abused. In v1, a player skips only when their 20-second timer expires.

## Decision 3

Anonymous players match only with anonymous players.

Reason:

Keeps casual play clean and prevents anonymous users from affecting signed-in player stats.

## Decision 4

Use backend-authoritative moves.

Reason:

A multiplayer game must not trust the client for score, box capture, or turn logic.

## Decision 5

Use SVG for board rendering in MVP.

Reason:

The board has only 100 dots, 180 lines, and 81 boxes. SVG gives easier click/touch handling than Canvas for the first version.

---

# 23. Final MVP User Flow

## First-Time User

1. Opens app.
2. Sees loading screen.
3. Enters onboarding.
4. Learns how to draw lines.
5. Learns how to capture boxes.
6. Learns about 20-second turns.
7. Chooses anonymous or Google sign-in.
8. Enters lobby.
9. Selects match type.
10. Enters queue.
11. Match is found.
12. Plays game.
13. Sees result.
14. If anonymous, gets CTA to sign in.

## Returning Signed-In User

1. Opens app.
2. Loading screen restores session.
3. Goes to lobby.
4. Sees profile stats.
5. Finds match.
6. Plays game.
7. Stats update after match.

---

# 24. Coding Agent Prompt

Build Breezeblocks as a mobile-first Android multiplayer game using Next.js, React, TypeScript, Tailwind, Firebase, and Capacitor.

The game uses a 10×10 dot matrix, meaning 100 dots and 81 capturable boxes. Players take turns drawing horizontal or vertical lines between adjacent dots. Diagonal lines are invalid. When a player draws the fourth side of a box, that box fills with the player’s color and the player gains 1 point. If a player captures a box, they keep the turn and receive a fresh 20-second timer. If they do not capture a box, the turn passes to the next player.

Each player has 20 seconds to draw a valid line. If they do not move before the timer expires, their turn is skipped automatically. The skip must be validated by the backend, not decided by the frontend.

The app must support 2-player, 3-player, and 4-player matchmaking. Anonymous users can queue and play, but they may only match with other anonymous users. Signed-in users may only match with signed-in users. Signed-in users must have profiles with Total Wins, Total Boxes Won, Total Games Played, and Match History.

Build the product screens: Loading Screen, Onboarding, Main Lobby, Matchmaking, Game Screen, Result Screen, Profile, Settings, and How to Play.

Use SVG for the game board in the MVP. Use Firebase Auth for anonymous and Google sign-in, Firestore for realtime game state, and Cloud Functions for server-authoritative game validation. Package the Android app using Capacitor.

Never trust the frontend to assign boxes, scores, winners, turn changes, or timeout skips. All important game mutations must happen through server-side functions.
