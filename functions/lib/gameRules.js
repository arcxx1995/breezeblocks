"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TURN_DURATION_SECONDS = exports.BOX_COLS = exports.BOX_ROWS = exports.DOT_COLS = exports.DOT_ROWS = void 0;
exports.lineId = lineId;
exports.boxId = boxId;
exports.createInitialLines = createInitialLines;
exports.createInitialBoxes = createInitialBoxes;
exports.assertValidLine = assertValidLine;
exports.getCompletedBoxes = getCompletedBoxes;
exports.getNextActivePlayer = getNextActivePlayer;
exports.DOT_ROWS = 10;
exports.DOT_COLS = 10;
exports.BOX_ROWS = 9;
exports.BOX_COLS = 9;
exports.TURN_DURATION_SECONDS = 20;
function lineId(orientation, row, col) {
    return `${orientation[0]}-${row}-${col}`;
}
function boxId(row, col) {
    return `b-${row}-${col}`;
}
function createInitialLines() {
    const lines = [];
    for (let row = 0; row < exports.DOT_ROWS; row += 1) {
        for (let col = 0; col < exports.DOT_COLS - 1; col += 1) {
            lines.push({
                lineId: lineId("horizontal", row, col),
                orientation: "horizontal",
                row,
                col,
                ownerPlayerId: null,
            });
        }
    }
    for (let row = 0; row < exports.DOT_ROWS - 1; row += 1) {
        for (let col = 0; col < exports.DOT_COLS; col += 1) {
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
function createInitialBoxes() {
    const boxes = [];
    for (let row = 0; row < exports.BOX_ROWS; row += 1) {
        for (let col = 0; col < exports.BOX_COLS; col += 1) {
            boxes.push({ boxId: boxId(row, col), row, col, ownerPlayerId: null });
        }
    }
    return boxes;
}
function assertValidLine(orientation, row, col) {
    if (orientation === "horizontal") {
        return row >= 0 && row < exports.DOT_ROWS && col >= 0 && col < exports.DOT_COLS - 1;
    }
    return row >= 0 && row < exports.DOT_ROWS - 1 && col >= 0 && col < exports.DOT_COLS;
}
function getCompletedBoxes(orientation, row, col, lines, boxes) {
    return getAdjacentBoxIds(orientation, row, col).filter((candidateBoxId) => {
        const box = boxes.get(candidateBoxId);
        return box && !box.ownerPlayerId && isBoxComplete(candidateBoxId, lines);
    });
}
function getNextActivePlayer(players, currentPlayerId) {
    const orderedPlayers = [...players].sort((a, b) => a.turnOrder - b.turnOrder);
    const currentIndex = orderedPlayers.findIndex((player) => player.playerId === currentPlayerId);
    for (let offset = 1; offset <= orderedPlayers.length; offset += 1) {
        const candidate = orderedPlayers[(currentIndex + offset) % orderedPlayers.length];
        if (candidate.connectionStatus !== "inactive" && candidate.connectionStatus !== "left") {
            return candidate.playerId;
        }
    }
    return currentPlayerId;
}
function getAdjacentBoxIds(orientation, row, col) {
    if (orientation === "horizontal") {
        return [
            row > 0 ? boxId(row - 1, col) : null,
            row < exports.BOX_ROWS ? boxId(row, col) : null,
        ].filter((id) => Boolean(id));
    }
    return [
        col > 0 ? boxId(row, col - 1) : null,
        col < exports.BOX_COLS ? boxId(row, col) : null,
    ].filter((id) => Boolean(id));
}
function isBoxComplete(id, lines) {
    const [, rowValue, colValue] = id.split("-");
    const row = Number(rowValue);
    const col = Number(colValue);
    return (Boolean(lines.get(lineId("horizontal", row, col))?.ownerPlayerId) &&
        Boolean(lines.get(lineId("horizontal", row + 1, col))?.ownerPlayerId) &&
        Boolean(lines.get(lineId("vertical", row, col))?.ownerPlayerId) &&
        Boolean(lines.get(lineId("vertical", row, col + 1))?.ownerPlayerId));
}
