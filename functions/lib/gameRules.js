"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_RATING = exports.TURN_DURATION_SECONDS = exports.BOX_COLS = exports.BOX_ROWS = exports.DOT_COLS = exports.DOT_ROWS = void 0;
exports.lineId = lineId;
exports.boxId = boxId;
exports.createInitialLines = createInitialLines;
exports.createInitialBoxes = createInitialBoxes;
exports.createInitialLineOwners = createInitialLineOwners;
exports.createInitialBoxOwners = createInitialBoxOwners;
exports.assertValidLine = assertValidLine;
exports.getCompletedBoxes = getCompletedBoxes;
exports.getNextActivePlayer = getNextActivePlayer;
exports.getAdjacentBoxIds = getAdjacentBoxIds;
exports.isBoxComplete = isBoxComplete;
exports.parseLineId = parseLineId;
exports.computeRatingDelta = computeRatingDelta;
exports.chooseBotLine = chooseBotLine;
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
function createInitialLineOwners() {
    return Object.fromEntries(createInitialLines().map((line) => [line.lineId, null]));
}
function createInitialBoxOwners() {
    return Object.fromEntries(createInitialBoxes().map((box) => [box.boxId, null]));
}
function assertValidLine(orientation, row, col) {
    if (orientation === "horizontal") {
        return row >= 0 && row < exports.DOT_ROWS && col >= 0 && col < exports.DOT_COLS - 1;
    }
    return row >= 0 && row < exports.DOT_ROWS - 1 && col >= 0 && col < exports.DOT_COLS;
}
function getCompletedBoxes(orientation, row, col, lines, boxes) {
    const lineOwners = Object.fromEntries([...lines.entries()].map(([id, line]) => [id, line.ownerPlayerId]));
    return getAdjacentBoxIds(orientation, row, col).filter((candidateBoxId) => {
        const box = boxes.get(candidateBoxId);
        return box && !box.ownerPlayerId && isBoxComplete(candidateBoxId, lineOwners);
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
    return null;
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
function isBoxComplete(id, lineOwners) {
    const [, rowValue, colValue] = id.split("-");
    const row = Number(rowValue);
    const col = Number(colValue);
    return (lineOwners[lineId("horizontal", row, col)] != null &&
        lineOwners[lineId("horizontal", row + 1, col)] != null &&
        lineOwners[lineId("vertical", row, col)] != null &&
        lineOwners[lineId("vertical", row, col + 1)] != null);
}
function parseLineId(id) {
    const [prefix, rowValue, colValue] = id.split("-");
    const orientation = prefix === "v" ? "vertical" : prefix === "h" ? "horizontal" : null;
    if (!orientation)
        return null;
    return { orientation, row: Number(rowValue), col: Number(colValue) };
}
function getOpenLines(lineOwners) {
    return Object.entries(lineOwners)
        .filter(([, owner]) => owner == null)
        .map(([id]) => parseLineId(id))
        .filter((line) => Boolean(line));
}
function boxSides(id) {
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
function openBoxSides(id, lineOwners) {
    return boxSides(id).filter((side) => lineOwners[lineId(side.orientation, side.row, side.col)] == null);
}
function openBoxIds(boxOwners) {
    return Object.entries(boxOwners)
        .filter(([, owner]) => owner == null)
        .map(([id]) => id);
}
function completesABox(line, lineOwners, boxOwners) {
    const hypothetical = { ...lineOwners, [lineId(line.orientation, line.row, line.col)]: 0 };
    return getAdjacentBoxIds(line.orientation, line.row, line.col).some((id) => boxOwners[id] == null && isBoxComplete(id, hypothetical));
}
// Uncaptured boxes touching this line, excluding the box we're standing on.
function adjacentOpenBoxes(line, boxOwners, exceptBoxId) {
    return getAdjacentBoxIds(line.orientation, line.row, line.col).filter((id) => boxOwners[id] == null && id !== exceptBoxId);
}
function findCaptureLineForBox(boxId_, lineOwners) {
    return openBoxSides(boxId_, lineOwners)[0] ?? null;
}
// Walk the chain/loop of degree-<=2 boxes reachable from startBoxId. A
// junction box (degree 3+) is treated as the boundary of the chain, same
// as a board edge.
function classifyRegion(startBoxId, lineOwners, boxOwners) {
    const visited = new Set();
    const queue = [startBoxId];
    let isLoop = true;
    while (queue.length > 0) {
        const current = queue.pop();
        if (visited.has(current))
            continue;
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
            if (!visited.has(neighborId))
                queue.push(neighborId);
        }
    }
    return { boxIds: [...visited], isLoop };
}
// The "double-cross" move: decline the remaining capture(s) in a chain/loop
// and instead draw the one line that hands the rest back to the opponent
// as a package deal, forcing them to spend a move re-opening play.
function findHandbackLine(regionBoxIds, lineOwners, boxOwners, isLoop) {
    const regionSet = new Set(regionBoxIds);
    const seen = new Set();
    const regionLines = [];
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
function findCapturingMove(lineOwners, boxOwners, difficulty) {
    const openIds = openBoxIds(boxOwners);
    const hotBoxId = openIds.find((id) => openBoxSides(id, lineOwners).length === 1);
    if (!hotBoxId)
        return null;
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
function isSafeLine(line, lineOwners, boxOwners) {
    const hypothetical = { ...lineOwners, [lineId(line.orientation, line.row, line.col)]: 0 };
    return getAdjacentBoxIds(line.orientation, line.row, line.col).every((id) => {
        if (boxOwners[id] != null)
            return true;
        return openBoxSides(id, hypothetical).length !== 1;
    });
}
// How many boxes would the opponent be able to run off with if this line
// is played (full greedy cascade, no double-crossing on their end).
function countGreedyCaptureFrom(lineOwners, boxOwners) {
    let lo = lineOwners;
    let bo = boxOwners;
    let count = 0;
    while (true) {
        const ids = openBoxIds(bo);
        const hotId = ids.find((id) => openBoxSides(id, lo).length === 1);
        if (!hotId)
            break;
        const line = findCaptureLineForBox(hotId, lo);
        if (!line)
            break;
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
function pickSmallestSacrifice(openLines, lineOwners, boxOwners) {
    let best = openLines[0];
    let bestCount = Infinity;
    for (const line of openLines) {
        const lo = { ...lineOwners, [lineId(line.orientation, line.row, line.col)]: 0 };
        const count = countGreedyCaptureFrom(lo, boxOwners);
        if (count < bestCount) {
            bestCount = count;
            best = line;
            if (bestCount === 0)
                break;
        }
    }
    return best;
}
// --- Skill rating -------------------------------------------------------
//
// Elo, generalized to 2-4 player games by treating a match as a round-robin
// of pairwise results (win/loss/draw by final score) and averaging the
// per-pair delta so K stays meaningful regardless of player count.
exports.DEFAULT_RATING = 1000;
// Provisional K: new accounts move fast so a fresh 1000 converges toward its
// true skill in a handful of games instead of staying an uninformative 1000.
// This makes per-player K asymmetric (a rookie's delta can exceed a veteran's),
// so the system is only zero-sum once everyone is out of placements — the
// standard, accepted trade-off (USCF/Glicko do the same).
function eloK(gamesPlayed) {
    if (gamesPlayed < 10)
        return 48;
    if (gamesPlayed < 30)
        return 32;
    return 24;
}
// Margin-of-victory multiplier. Symmetric per pair (winner and loser share the
// same |margin|, so it scales both sides equally and stays zero-sum), diminishing
// so a blowout counts more than a squeaker without dwarfing the base result.
function movMultiplier(margin) {
    return Math.min(2, 1 + Math.log1p(Math.max(0, margin)) * 0.18);
}
// Returns a float delta. Ratings are stored as floats so nothing is lost to
// per-player rounding — the system stays exactly zero-sum between equal-K
// players (provisional K is the only intentional asymmetry). Round at display.
function computeRatingDelta(playerRating, opponents, gamesPlayed = 0) {
    if (opponents.length === 0)
        return 0;
    const totalDelta = opponents.reduce((sum, opponent) => {
        const expected = 1 / (1 + 10 ** ((opponent.rating - playerRating) / 400));
        return sum + (opponent.result - expected) * movMultiplier(opponent.margin ?? 0);
    }, 0);
    return (eloK(gamesPlayed) * totalDelta) / opponents.length;
}
function chooseBotLine(lineOwners, boxOwners, difficulty = "medium") {
    const openLines = getOpenLines(lineOwners);
    if (openLines.length === 0)
        return null;
    if (difficulty === "easy") {
        return openLines.find((line) => completesABox(line, lineOwners, boxOwners)) ?? openLines[0];
    }
    const capturingMove = findCapturingMove(lineOwners, boxOwners, difficulty);
    if (capturingMove)
        return capturingMove;
    const safeLines = openLines.filter((line) => isSafeLine(line, lineOwners, boxOwners));
    if (safeLines.length > 0)
        return safeLines[0];
    return pickSmallestSacrifice(openLines, lineOwners, boxOwners);
}
