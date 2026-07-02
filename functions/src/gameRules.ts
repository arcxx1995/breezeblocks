export const DOT_ROWS = 10;
export const DOT_COLS = 10;
export const BOX_ROWS = 9;
export const BOX_COLS = 9;
export const TURN_DURATION_SECONDS = 20;

export type LineOrientation = "horizontal" | "vertical";

export type ServerLine = {
  lineId: string;
  orientation: LineOrientation;
  row: number;
  col: number;
  ownerPlayerId: string | null;
};

export type ServerBox = {
  boxId: string;
  row: number;
  col: number;
  ownerPlayerId: string | null;
};

export type BotDifficulty = "easy" | "medium" | "hard";

export type ServerPlayer = {
  playerId: string;
  score: number;
  connectionStatus: "connected" | "disconnected" | "inactive" | "left";
  consecutiveSkips: number;
  turnOrder: number;
  botDifficulty?: BotDifficulty;
  rating?: number;
};

export type OwnerIndex = number | null;
export type LineOwners = Record<string, OwnerIndex>;
export type BoxOwners = Record<string, OwnerIndex>;

export function lineId(orientation: LineOrientation, row: number, col: number) {
  return `${orientation[0]}-${row}-${col}`;
}

export function boxId(row: number, col: number) {
  return `b-${row}-${col}`;
}

export function createInitialLines() {
  const lines: ServerLine[] = [];
  for (let row = 0; row < DOT_ROWS; row += 1) {
    for (let col = 0; col < DOT_COLS - 1; col += 1) {
      lines.push({
        lineId: lineId("horizontal", row, col),
        orientation: "horizontal",
        row,
        col,
        ownerPlayerId: null,
      });
    }
  }
  for (let row = 0; row < DOT_ROWS - 1; row += 1) {
    for (let col = 0; col < DOT_COLS; col += 1) {
      lines.push({
        lineId: lineId("vertical", row, col),
        orientation: "vertical",
        row,
        col,
        ownerPlayerId: null,
      });
    }
  }
  return lines;
}

export function createInitialBoxes() {
  const boxes: ServerBox[] = [];
  for (let row = 0; row < BOX_ROWS; row += 1) {
    for (let col = 0; col < BOX_COLS; col += 1) {
      boxes.push({ boxId: boxId(row, col), row, col, ownerPlayerId: null });
    }
  }
  return boxes;
}

export function createInitialLineOwners() {
  return Object.fromEntries(
    createInitialLines().map((line) => [line.lineId, null]),
  ) as LineOwners;
}

export function createInitialBoxOwners() {
  return Object.fromEntries(
    createInitialBoxes().map((box) => [box.boxId, null]),
  ) as BoxOwners;
}

export function assertValidLine(
  orientation: LineOrientation,
  row: number,
  col: number,
) {
  if (orientation === "horizontal") {
    return row >= 0 && row < DOT_ROWS && col >= 0 && col < DOT_COLS - 1;
  }
  return row >= 0 && row < DOT_ROWS - 1 && col >= 0 && col < DOT_COLS;
}

export function getCompletedBoxes(
  orientation: LineOrientation,
  row: number,
  col: number,
  lines: Map<string, ServerLine>,
  boxes: Map<string, ServerBox>,
) {
  const lineOwners = Object.fromEntries(
    [...lines.entries()].map(([id, line]) => [id, line.ownerPlayerId]),
  ) as LineOwners;
  return getAdjacentBoxIds(orientation, row, col).filter((candidateBoxId) => {
    const box = boxes.get(candidateBoxId);
    return box && !box.ownerPlayerId && isBoxComplete(candidateBoxId, lineOwners);
  });
}

export function getNextActivePlayer(
  players: ServerPlayer[],
  currentPlayerId: string,
) {
  const orderedPlayers = [...players].sort((a, b) => a.turnOrder - b.turnOrder);
  const currentIndex = orderedPlayers.findIndex(
    (player) => player.playerId === currentPlayerId,
  );
  for (let offset = 1; offset <= orderedPlayers.length; offset += 1) {
    const candidate = orderedPlayers[(currentIndex + offset) % orderedPlayers.length];
    if (candidate.connectionStatus !== "inactive" && candidate.connectionStatus !== "left") {
      return candidate.playerId;
    }
  }
  return null;
}

export function getAdjacentBoxIds(
  orientation: LineOrientation,
  row: number,
  col: number,
) {
  if (orientation === "horizontal") {
    return [
      row > 0 ? boxId(row - 1, col) : null,
      row < BOX_ROWS ? boxId(row, col) : null,
    ].filter((id): id is string => Boolean(id));
  }

  return [
    col > 0 ? boxId(row, col - 1) : null,
    col < BOX_COLS ? boxId(row, col) : null,
  ].filter((id): id is string => Boolean(id));
}

export function isBoxComplete(id: string, lineOwners: LineOwners) {
  const [, rowValue, colValue] = id.split("-");
  const row = Number(rowValue);
  const col = Number(colValue);
  return (
    lineOwners[lineId("horizontal", row, col)] != null &&
    lineOwners[lineId("horizontal", row + 1, col)] != null &&
    lineOwners[lineId("vertical", row, col)] != null &&
    lineOwners[lineId("vertical", row, col + 1)] != null
  );
}

// --- Bot move selection -----------------------------------------------
//
// easy: takes a completing move if one exists, otherwise the first open
// line. No awareness of gifting boxes away.
//
// medium: takes completing moves, otherwise prefers a "safe" line (one
// that doesn't leave any box on 3 sides), otherwise sacrifices the
// smallest available chain.
//
// hard: same as medium, plus chain-parity control (the "double-cross"
// rule). When about to fully consume a chain of 3+ boxes (or a loop of
// 4+) while other boxes remain on the board, it stops short and hands
// back the last 2 boxes (4 for a loop) instead of taking them — forcing
// the opponent to spend an extra move opening the next chain.

export type LineRef = { orientation: LineOrientation; row: number; col: number };

export function parseLineId(id: string): LineRef | null {
  const [prefix, rowValue, colValue] = id.split("-");
  const orientation = prefix === "v" ? "vertical" : prefix === "h" ? "horizontal" : null;
  if (!orientation) return null;
  return { orientation, row: Number(rowValue), col: Number(colValue) };
}

function getOpenLines(lineOwners: LineOwners): LineRef[] {
  return Object.entries(lineOwners)
    .filter(([, owner]) => owner == null)
    .map(([id]) => parseLineId(id))
    .filter((line): line is LineRef => Boolean(line));
}

function boxSides(id: string): LineRef[] {
  const [, rowValue, colValue] = id.split("-");
  const row = Number(rowValue);
  const col = Number(colValue);
  return [
    { orientation: "horizontal", row, col },
    { orientation: "horizontal", row: row + 1, col },
    { orientation: "vertical", row, col },
    { orientation: "vertical", row, col: col + 1 },
  ];
}

function openBoxSides(id: string, lineOwners: LineOwners): LineRef[] {
  return boxSides(id).filter((side) => lineOwners[lineId(side.orientation, side.row, side.col)] == null);
}

function openBoxIds(boxOwners: BoxOwners): string[] {
  return Object.entries(boxOwners)
    .filter(([, owner]) => owner == null)
    .map(([id]) => id);
}

function completesABox(line: LineRef, lineOwners: LineOwners, boxOwners: BoxOwners): boolean {
  const hypothetical = { ...lineOwners, [lineId(line.orientation, line.row, line.col)]: 0 };
  return getAdjacentBoxIds(line.orientation, line.row, line.col).some(
    (id) => boxOwners[id] == null && isBoxComplete(id, hypothetical),
  );
}

// Uncaptured boxes touching this line, excluding the box we're standing on.
function adjacentOpenBoxes(line: LineRef, boxOwners: BoxOwners, exceptBoxId?: string): string[] {
  return getAdjacentBoxIds(line.orientation, line.row, line.col).filter(
    (id) => boxOwners[id] == null && id !== exceptBoxId,
  );
}

function findCaptureLineForBox(boxId_: string, lineOwners: LineOwners): LineRef | null {
  return openBoxSides(boxId_, lineOwners)[0] ?? null;
}

// Walk the chain/loop of degree-<=2 boxes reachable from startBoxId. A
// junction box (degree 3+) is treated as the boundary of the chain, same
// as a board edge.
function classifyRegion(startBoxId: string, lineOwners: LineOwners, boxOwners: BoxOwners) {
  const visited = new Set<string>();
  const queue = [startBoxId];
  let isLoop = true;
  while (queue.length > 0) {
    const current = queue.pop()!;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const side of openBoxSides(current, lineOwners)) {
      const neighbors = adjacentOpenBoxes(side, boxOwners, current);
      if (neighbors.length === 0) {
        isLoop = false;
        continue;
      }
      const neighborId = neighbors[0];
      if (openBoxSides(neighborId, lineOwners).length > 2) {
        isLoop = false;
        continue;
      }
      if (!visited.has(neighborId)) queue.push(neighborId);
    }
  }
  return { boxIds: [...visited], isLoop };
}

// The "double-cross" move: decline the remaining capture(s) in a chain/loop
// and instead draw the one line that hands the rest back to the opponent
// as a package deal, forcing them to spend a move re-opening play.
function findHandbackLine(
  regionBoxIds: string[],
  lineOwners: LineOwners,
  boxOwners: BoxOwners,
  isLoop: boolean,
): LineRef | null {
  const regionSet = new Set(regionBoxIds);
  const seen = new Set<string>();
  const regionLines: LineRef[] = [];
  for (const boxId_ of regionBoxIds) {
    for (const side of openBoxSides(boxId_, lineOwners)) {
      const key = lineId(side.orientation, side.row, side.col);
      if (!seen.has(key)) {
        seen.add(key);
        regionLines.push(side);
      }
    }
  }

  if (!isLoop) {
    const dangling = regionLines.find((line) => {
      const allAdjacent = getAdjacentBoxIds(line.orientation, line.row, line.col);
      const openAdjacent = allAdjacent.filter((id) => boxOwners[id] == null);
      return openAdjacent.length <= 1;
    });
    return dangling ?? regionLines[0] ?? null;
  }

  const nonHotLine = regionLines.find((line) => {
    const touching = adjacentOpenBoxes(line, boxOwners).filter((id) => regionSet.has(id));
    return touching.every((id) => openBoxSides(id, lineOwners).length !== 1);
  });
  return nonHotLine ?? regionLines[0] ?? null;
}

function findCapturingMove(
  lineOwners: LineOwners,
  boxOwners: BoxOwners,
  difficulty: BotDifficulty,
): LineRef | null {
  const openIds = openBoxIds(boxOwners);
  const hotBoxId = openIds.find((id) => openBoxSides(id, lineOwners).length === 1);
  if (!hotBoxId) return null;

  if (difficulty === "hard") {
    const region = classifyRegion(hotBoxId, lineOwners, boxOwners);
    const cutoff = region.isLoop ? 4 : 2;
    const remainingElsewhere = openIds.length - region.boxIds.length;
    if (remainingElsewhere > 0 && region.boxIds.length === cutoff) {
      return findHandbackLine(region.boxIds, lineOwners, boxOwners, region.isLoop);
    }
  }

  return findCaptureLineForBox(hotBoxId, lineOwners);
}

function isSafeLine(line: LineRef, lineOwners: LineOwners, boxOwners: BoxOwners): boolean {
  const hypothetical = { ...lineOwners, [lineId(line.orientation, line.row, line.col)]: 0 };
  return getAdjacentBoxIds(line.orientation, line.row, line.col).every((id) => {
    if (boxOwners[id] != null) return true;
    return openBoxSides(id, hypothetical).length !== 1;
  });
}

// How many boxes would the opponent be able to run off with if this line
// is played (full greedy cascade, no double-crossing on their end).
function countGreedyCaptureFrom(lineOwners: LineOwners, boxOwners: BoxOwners): number {
  let lo = lineOwners;
  let bo = boxOwners;
  let count = 0;
  while (true) {
    const ids = openBoxIds(bo);
    const hotId = ids.find((id) => openBoxSides(id, lo).length === 1);
    if (!hotId) break;
    const line = findCaptureLineForBox(hotId, lo);
    if (!line) break;
    lo = { ...lo, [lineId(line.orientation, line.row, line.col)]: 0 };
    for (const id of ids) {
      if (bo[id] == null && isBoxComplete(id, lo)) {
        bo = { ...bo, [id]: 0 };
        count += 1;
      }
    }
  }
  return count;
}

function pickSmallestSacrifice(
  openLines: LineRef[],
  lineOwners: LineOwners,
  boxOwners: BoxOwners,
): LineRef {
  let best = openLines[0];
  let bestCount = Infinity;
  for (const line of openLines) {
    const lo = { ...lineOwners, [lineId(line.orientation, line.row, line.col)]: 0 };
    const count = countGreedyCaptureFrom(lo, boxOwners);
    if (count < bestCount) {
      bestCount = count;
      best = line;
      if (bestCount === 0) break;
    }
  }
  return best;
}

// --- Skill rating -------------------------------------------------------
//
// Elo, generalized to 2-4 player games by treating a match as a round-robin
// of pairwise results (win/loss/draw by final score) and averaging the
// per-pair delta so K stays meaningful regardless of player count.

export const DEFAULT_RATING = 1000;

// Provisional K: new accounts move fast so a fresh 1000 converges toward its
// true skill in a handful of games instead of staying an uninformative 1000.
// This makes per-player K asymmetric (a rookie's delta can exceed a veteran's),
// so the system is only zero-sum once everyone is out of placements — the
// standard, accepted trade-off (USCF/Glicko do the same).
function eloK(gamesPlayed: number): number {
  if (gamesPlayed < 10) return 48;
  if (gamesPlayed < 30) return 32;
  return 24;
}

// Margin-of-victory multiplier. Symmetric per pair (winner and loser share the
// same |margin|, so it scales both sides equally and stays zero-sum), diminishing
// so a blowout counts more than a squeaker without dwarfing the base result.
function movMultiplier(margin: number): number {
  return Math.min(2, 1 + Math.log1p(Math.max(0, margin)) * 0.18);
}

// Returns a float delta. Ratings are stored as floats so nothing is lost to
// per-player rounding — the system stays exactly zero-sum between equal-K
// players (provisional K is the only intentional asymmetry). Round at display.
export function computeRatingDelta(
  playerRating: number,
  opponents: { rating: number; result: 0 | 0.5 | 1; margin?: number }[],
  gamesPlayed = 0,
): number {
  if (opponents.length === 0) return 0;
  const totalDelta = opponents.reduce((sum, opponent) => {
    const expected = 1 / (1 + 10 ** ((opponent.rating - playerRating) / 400));
    return sum + (opponent.result - expected) * movMultiplier(opponent.margin ?? 0);
  }, 0);
  return (eloK(gamesPlayed) * totalDelta) / opponents.length;
}

export function chooseBotLine(
  lineOwners: LineOwners,
  boxOwners: BoxOwners,
  difficulty: BotDifficulty = "medium",
): LineRef | null {
  const openLines = getOpenLines(lineOwners);
  if (openLines.length === 0) return null;

  if (difficulty === "easy") {
    return openLines.find((line) => completesABox(line, lineOwners, boxOwners)) ?? openLines[0];
  }

  const capturingMove = findCapturingMove(lineOwners, boxOwners, difficulty);
  if (capturingMove) return capturingMove;

  const safeLines = openLines.filter((line) => isSafeLine(line, lineOwners, boxOwners));
  if (safeLines.length > 0) return safeLines[0];

  return pickSmallestSacrifice(openLines, lineOwners, boxOwners);
}
