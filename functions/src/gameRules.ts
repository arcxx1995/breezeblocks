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

export type ServerPlayer = {
  playerId: string;
  score: number;
  connectionStatus: "connected" | "disconnected" | "inactive" | "left";
  consecutiveSkips: number;
  turnOrder: number;
};

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
  return getAdjacentBoxIds(orientation, row, col).filter((candidateBoxId) => {
    const box = boxes.get(candidateBoxId);
    return box && !box.ownerPlayerId && isBoxComplete(candidateBoxId, lines);
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
  return currentPlayerId;
}

function getAdjacentBoxIds(
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

function isBoxComplete(id: string, lines: Map<string, ServerLine>) {
  const [, rowValue, colValue] = id.split("-");
  const row = Number(rowValue);
  const col = Number(colValue);
  return (
    Boolean(lines.get(lineId("horizontal", row, col))?.ownerPlayerId) &&
    Boolean(lines.get(lineId("horizontal", row + 1, col))?.ownerPlayerId) &&
    Boolean(lines.get(lineId("vertical", row, col))?.ownerPlayerId) &&
    Boolean(lines.get(lineId("vertical", row, col + 1))?.ownerPlayerId)
  );
}
