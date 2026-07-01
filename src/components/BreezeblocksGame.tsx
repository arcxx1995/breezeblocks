"use client";

import { PointerEvent, useEffect, useMemo, useState } from "react";
import {
  BOX_COLS,
  BOX_ROWS,
  DOT_COLS,
  DOT_ROWS,
  GameState,
  LineOrientation,
  TURN_DURATION_SECONDS,
  boxId,
  createInitialGame,
  lineId,
  skipTurn,
  submitLine,
} from "@/lib/game/engine";

const BOARD_SIZE = 360;
const PADDING = 28;
const STEP = (BOARD_SIZE - PADDING * 2) / (DOT_COLS - 1);
const TOTAL_BOXES = BOX_ROWS * BOX_COLS;
const DOT_HIT_RADIUS = 14;

type BoardDot = {
  row: number;
  col: number;
};

type BoardLine = {
  id: string;
  orientation: LineOrientation;
  row: number;
  col: number;
};

type BoardPoint = {
  x: number;
  y: number;
};

export function BreezeblocksGame({ gameId = "local" }: { gameId?: string }) {
  const [game, setGame] = useState<GameState>(() => createInitialGame());
  const [now, setNow] = useState(() => Date.now());
  const [lastMoveId, setLastMoveId] = useState<string | null>(null);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (game.status !== "active") return;
    const delay = Math.max(0, game.turnDeadlineAt - Date.now());
    const timeout = window.setTimeout(() => {
      const currentTime = Date.now();
      setGame((current) =>
        current.status === "active" && current.turnDeadlineAt <= currentTime
          ? skipTurn(current, currentTime)
          : current,
      );
      setNow(currentTime);
    }, delay);
    return () => window.clearTimeout(timeout);
  }, [game.status, game.turnDeadlineAt]);

  const activePlayer = game.players[game.currentPlayerIndex];
  const remainingSeconds = Math.max(
    0,
    Math.ceil((game.turnDeadlineAt - now) / 1000),
  );
  const capturedBoxes = useMemo(
    () => Object.values(game.boxes).filter((box) => box.ownerPlayerId).length,
    [game.boxes],
  );

  function drawLine(orientation: LineOrientation, row: number, col: number) {
    const id = lineId(orientation, row, col);
    if (game.lines[id]?.ownerPlayerId || game.status !== "active") return;
    setGame((current) => submitLine(current, orientation, row, col));
    setLastMoveId(id);
    setNow(Date.now());
  }

  function resetGame() {
    const startedAt = Date.now();
    setGame(createInitialGame(startedAt));
    setLastMoveId(null);
    setNow(startedAt);
  }

  const winners = game.players.filter((player) =>
    game.winnerPlayerIds.includes(player.id),
  );

  return (
    <main className="app-phone-viewport text-white">
      <section className="app-phone-screen flex flex-col px-4 py-4">
        <header className="flex items-center justify-between gap-3 py-2">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-[#DCEEB1]">
              Breezeblocks
            </p>
            <h1 className="text-3xl font-[340] leading-none text-white">
              Local match
            </h1>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-white/40">
              Room {gameId}
            </p>
          </div>
          <button
            type="button"
            onClick={resetGame}
            className="h-10 rounded-full bg-white px-5 text-sm font-medium text-black transition hover:bg-[#F4ECD6] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C5B0F4]"
          >
            Reset
          </button>
        </header>

        <section className="grid grid-cols-2 gap-2 py-3">
          {game.players.map((player, index) => (
            <div
              key={player.id}
              className={`rounded-lg border p-3 transition ${
                index === game.currentPlayerIndex && game.status === "active"
                  ? "border-white bg-white text-black"
                  : "border-white/15 bg-[#111111] text-white"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className="size-3 shrink-0 rounded-full"
                    style={{ backgroundColor: player.color }}
                  />
                  <span className="truncate text-sm font-extrabold">
                    {player.name}
                  </span>
                </div>
                <span className="font-mono text-xl font-normal">
                  {player.score}
                </span>
              </div>
              <p
                className={`mt-1 font-mono text-xs uppercase tracking-[0.12em] ${
                  index === game.currentPlayerIndex && game.status === "active"
                    ? "text-black/60"
                    : "text-white/55"
                }`}
              >
                {player.status === "inactive"
                  ? "Inactive"
                  : `${player.consecutiveSkips} skips`}
              </p>
            </div>
          ))}
        </section>

        <section className="rounded-lg border border-white/15 bg-[#C5B0F4] p-4 text-black">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-xl font-bold leading-snug">
                {game.status === "completed"
                  ? winners.length > 1
                    ? "Draw game"
                    : `${winners[0]?.name} wins`
                  : `${activePlayer.name}'s turn`}
              </p>
              <p className="font-mono text-xs uppercase tracking-[0.12em] text-black/65">
                {capturedBoxes} of {TOTAL_BOXES} boxes captured
              </p>
            </div>
            <div
              className={`grid size-14 place-items-center rounded-full border-4 bg-black font-mono text-lg font-normal ${
                remainingSeconds <= 5 && game.status === "active"
                  ? "border-[#F3C9B6] text-[#F3C9B6]"
                  : "border-white text-white"
              }`}
            >
              {game.status === "completed" ? "OK" : remainingSeconds}
            </div>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-black/20">
            <div
              className="h-full rounded-full transition-all duration-200"
              style={{
                width: `${
                  game.status === "completed"
                    ? 100
                    : (remainingSeconds / TURN_DURATION_SECONDS) * 100
                }%`,
                backgroundColor:
                  remainingSeconds <= 5 ? "#F3C9B6" : "#000000",
              }}
            />
          </div>
        </section>

        <section className="flex flex-1 items-center py-4">
          <GameBoard
            game={game}
            lastMoveId={lastMoveId}
            onDrawLine={drawLine}
          />
        </section>
      </section>
    </main>
  );
}

function GameBoard({
  game,
  lastMoveId,
  onDrawLine,
}: {
  game: GameState;
  lastMoveId: string | null;
  onDrawLine: (orientation: LineOrientation, row: number, col: number) => void;
}) {
  const [dragStart, setDragStart] = useState<BoardDot | null>(null);
  const [dragTarget, setDragTarget] = useState<BoardDot | null>(null);
  const [dragPoint, setDragPoint] = useState<BoardPoint | null>(null);
  const previewLine =
    dragStart && dragTarget ? getBoardLineFromDots(dragStart, dragTarget) : null;
  const activePlayer = game.players[game.currentPlayerIndex];

  function startDrag(event: PointerEvent<SVGSVGElement>) {
    if (game.status !== "active") return;
    const dot = getDotFromPointer(event);
    if (!dot) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragStart(dot);
    setDragPoint(getPointFromPointer(event));
    setDragTarget(null);
  }

  function updateDrag(event: PointerEvent<SVGSVGElement>) {
    if (!dragStart) return;
    setDragPoint(getPointFromPointer(event));
    setDragTarget(getDotFromPointer(event));
  }

  function finishDrag(event: PointerEvent<SVGSVGElement>) {
    if (!dragStart) return;
    const target = getDotFromPointer(event);
    const line = target ? getBoardLineFromDots(dragStart, target) : null;
    if (line && !game.lines[line.id]?.ownerPlayerId) {
      onDrawLine(line.orientation, line.row, line.col);
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDragStart(null);
    setDragTarget(null);
    setDragPoint(null);
  }

  function cancelDrag(event: PointerEvent<SVGSVGElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDragStart(null);
    setDragTarget(null);
    setDragPoint(null);
  }

  return (
    <div className="mx-auto aspect-square w-full max-w-[390px] rounded-lg border border-white/15 bg-white p-2 shadow-2xl shadow-black">
      <svg
        viewBox={`0 0 ${BOARD_SIZE} ${BOARD_SIZE}`}
        className="h-full w-full touch-none select-none"
        role="img"
        aria-label="10 by 10 Breezeblocks game board"
        onPointerDown={startDrag}
        onPointerMove={updateDrag}
        onPointerUp={finishDrag}
        onPointerCancel={cancelDrag}
      >
        <rect width={BOARD_SIZE} height={BOARD_SIZE} rx="14" fill="#000000" />

        {Array.from({ length: BOX_ROWS }).map((_, row) =>
          Array.from({ length: BOX_COLS }).map((__, col) => {
            const box = game.boxes[boxId(row, col)];
            const owner = game.players.find(
              (player) => player.id === box.ownerPlayerId,
            );
            return (
              <rect
                key={box.id}
                x={PADDING + col * STEP}
                y={PADDING + row * STEP}
                width={STEP}
                height={STEP}
                rx="5"
                fill={owner?.color ?? "#F7F7F5"}
                opacity={owner ? 1 : 0.1}
              />
            );
          }),
        )}

        {Array.from({ length: DOT_ROWS }).map((_, row) =>
          Array.from({ length: DOT_COLS - 1 }).map((__, col) => {
            const id = lineId("horizontal", row, col);
            const line = game.lines[id];
            const owner = getLineDisplayOwner(game, "horizontal", row, col);
            return (
              <line
                key={id}
                x1={PADDING + col * STEP}
                y1={PADDING + row * STEP}
                x2={PADDING + (col + 1) * STEP}
                y2={PADDING + row * STEP}
                stroke={owner?.color ?? "transparent"}
                strokeWidth={lastMoveId === id ? 10 : line.ownerPlayerId ? 8 : 0}
                strokeLinecap="round"
              />
            );
          }),
        )}

        {Array.from({ length: DOT_ROWS - 1 }).map((_, row) =>
          Array.from({ length: DOT_COLS }).map((__, col) => {
            const id = lineId("vertical", row, col);
            const line = game.lines[id];
            const owner = getLineDisplayOwner(game, "vertical", row, col);
            return (
              <line
                key={id}
                x1={PADDING + col * STEP}
                y1={PADDING + row * STEP}
                x2={PADDING + col * STEP}
                y2={PADDING + (row + 1) * STEP}
                stroke={owner?.color ?? "transparent"}
                strokeWidth={lastMoveId === id ? 10 : line.ownerPlayerId ? 8 : 0}
                strokeLinecap="round"
              />
            );
          }),
        )}

        {dragStart && dragPoint ? (
          <line
            x1={PADDING + dragStart!.col * STEP}
            y1={PADDING + dragStart!.row * STEP}
            x2={getPreviewEndPoint(dragStart, dragPoint).x}
            y2={getPreviewEndPoint(dragStart, dragPoint).y}
            stroke={activePlayer.color}
            strokeWidth="8"
            strokeLinecap="round"
            opacity={
              previewLine && game.lines[previewLine.id]?.ownerPlayerId
                ? 0.25
                : 0.7
            }
          />
        ) : null}

        {Array.from({ length: DOT_ROWS }).map((_, row) =>
          Array.from({ length: DOT_COLS }).map((__, col) => (
            <g key={`dot-${row}-${col}`} className="cursor-crosshair">
              <circle
                cx={PADDING + col * STEP}
                cy={PADDING + row * STEP}
                r={DOT_HIT_RADIUS}
                fill="transparent"
              />
              <circle
                cx={PADDING + col * STEP}
                cy={PADDING + row * STEP}
                r={dragStart?.row === row && dragStart.col === col ? 6.5 : 4.8}
                fill="#FFFFFF"
              />
            </g>
          )),
        )}
      </svg>
    </div>
  );
}

function getDotFromPointer(event: PointerEvent<SVGSVGElement>) {
  const { x, y } = getPointFromPointer(event);
  const col = Math.round((x - PADDING) / STEP);
  const row = Math.round((y - PADDING) / STEP);

  if (row < 0 || row >= DOT_ROWS || col < 0 || col >= DOT_COLS) return null;

  const dotX = PADDING + col * STEP;
  const dotY = PADDING + row * STEP;
  const distance = Math.hypot(x - dotX, y - dotY);

  return distance <= DOT_HIT_RADIUS ? { row, col } : null;
}

function getPointFromPointer(event: PointerEvent<SVGSVGElement>): BoardPoint {
  const rect = event.currentTarget.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * BOARD_SIZE;
  const y = ((event.clientY - rect.top) / rect.height) * BOARD_SIZE;

  return {
    x: Math.min(BOARD_SIZE - PADDING, Math.max(PADDING, x)),
    y: Math.min(BOARD_SIZE - PADDING, Math.max(PADDING, y)),
  };
}

function getPreviewEndPoint(start: BoardDot, point: BoardPoint): BoardPoint {
  const startX = PADDING + start.col * STEP;
  const startY = PADDING + start.row * STEP;
  const deltaX = point.x - startX;
  const deltaY = point.y - startY;

  if (Math.abs(deltaX) >= Math.abs(deltaY)) {
    return {
      x: Math.min(startX + STEP, Math.max(startX - STEP, point.x)),
      y: startY,
    };
  }

  return {
    x: startX,
    y: Math.min(startY + STEP, Math.max(startY - STEP, point.y)),
  };
}

function getBoardLineFromDots(start: BoardDot, end: BoardDot): BoardLine | null {
  const rowDelta = end.row - start.row;
  const colDelta = end.col - start.col;

  if (rowDelta === 0 && Math.abs(colDelta) === 1) {
    const col = Math.min(start.col, end.col);
    return {
      id: lineId("horizontal", start.row, col),
      orientation: "horizontal",
      row: start.row,
      col,
    };
  }

  if (colDelta === 0 && Math.abs(rowDelta) === 1) {
    const row = Math.min(start.row, end.row);
    return {
      id: lineId("vertical", row, start.col),
      orientation: "vertical",
      row,
      col: start.col,
    };
  }

  return null;
}

function getLineDisplayOwner(
  game: GameState,
  orientation: LineOrientation,
  row: number,
  col: number,
) {
  const line = game.lines[lineId(orientation, row, col)];
  const adjacentBoxIds =
    orientation === "horizontal"
      ? [
          row > 0 ? boxId(row - 1, col) : null,
          row < BOX_ROWS ? boxId(row, col) : null,
        ]
      : [
          col > 0 ? boxId(row, col - 1) : null,
          col < BOX_COLS ? boxId(row, col) : null,
        ];
  const filledBox = adjacentBoxIds
    .map((id) => (id ? game.boxes[id] : null))
    .find((box) => box?.ownerPlayerId);
  const ownerId = filledBox?.ownerPlayerId ?? line.ownerPlayerId;

  return game.players.find((player) => player.id === ownerId);
}
