"use client";

import Link from "next/link";
import {
  PointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  BOX_COLS,
  BOX_ROWS,
  DOT_COLS,
  DOT_ROWS,
  TURN_DURATION_SECONDS,
  boxId,
  lineId,
  type Box,
  type Line,
  type LineOrientation,
} from "@/lib/game/engine";
import {
  claimOnlineBotMove,
  claimOnlineTimeout,
  submitOnlineMove,
  subscribeToOnlineGame,
  type OnlineGameSnapshot,
} from "@/lib/firebase/games";
import { hasFirebaseConfig } from "@/lib/firebase/client";
import { useAuth } from "@/components/AuthProvider";

const BOARD_SIZE = 360;
const PADDING = 28;
const STEP = (BOARD_SIZE - PADDING * 2) / (DOT_COLS - 1);
const TOTAL_BOXES = BOX_ROWS * BOX_COLS;
const DOT_HIT_RADIUS = 14;

type OnlinePlayer = {
  playerId: string;
  displayName: string;
  color: string;
  score: number;
  consecutiveSkips: number;
  connectionStatus: "connected" | "disconnected" | "inactive" | "left";
  turnOrder: number;
  isBot: boolean;
};

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

export function OnlineGameClient({ gameId }: { gameId: string }) {
  const { player, isReady } = useAuth();
  const [snapshot, setSnapshot] = useState<OnlineGameSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [lastMoveId, setLastMoveId] = useState<string | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pausedRealtime, setPausedRealtime] = useState<{
    gameId: string;
    paused: boolean;
  } | null>(null);
  const timeoutClaimRef = useRef<string | null>(null);
  const pauseRealtime = pausedRealtime?.gameId === gameId && pausedRealtime.paused;

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!hasFirebaseConfig() || pauseRealtime) return;
    return subscribeToOnlineGame(
      gameId,
      (nextSnapshot) => {
        setSnapshot(nextSnapshot);
        setError(null);
      },
      (caught) => {
        setError(caught.message);
      },
    );
  }, [gameId, pauseRealtime]);

  const game = snapshot?.game ?? null;
  const players = useMemo(() => normalizePlayers(snapshot), [snapshot]);
  const lines = useMemo(() => normalizeLines(snapshot), [snapshot]);
  const boxes = useMemo(() => normalizeBoxes(snapshot), [snapshot]);
  const activePlayer = players.find(
    (candidate) => candidate.playerId === game?.currentTurnPlayerId,
  );
  const isMyTurn =
    Boolean(player.uid) && Boolean(activePlayer) && activePlayer?.playerId === player.uid;
  const capturedBoxes = useMemo(
    () => Object.values(boxes).filter((box) => box.ownerPlayerId).length,
    [boxes],
  );
  const deadlineMillis = toMillis(game?.turnDeadlineAt);
  const remainingSeconds =
    game?.status === "active"
      ? Math.max(0, Math.ceil((deadlineMillis - now) / 1000))
      : 0;
  const winners = players.filter((candidate) =>
    Array.isArray(game?.winnerPlayerIds)
      ? game?.winnerPlayerIds.includes(candidate.playerId)
      : false,
  );

  useEffect(() => {
    if (game?.status !== "completed" || pauseRealtime) return;
    const timeout = window.setTimeout(
      () => setPausedRealtime({ gameId, paused: true }),
      30000,
    );
    return () => window.clearTimeout(timeout);
  }, [game?.status, gameId, pauseRealtime]);

  useEffect(() => {
    if (!game || game.status !== "active") return;
    if (!activePlayer?.isBot) return;
    const botMoveKey = `${gameId}:bot:${game.turnIndex ?? 0}`;
    if (timeoutClaimRef.current === botMoveKey) return;
    timeoutClaimRef.current = botMoveKey;
    const timeout = window.setTimeout(() => {
      claimOnlineBotMove(gameId).catch((caught: unknown) => {
        setMoveError(toErrorMessage(caught));
      });
    }, 800);
    return () => window.clearTimeout(timeout);
  }, [activePlayer?.isBot, game, gameId]);

  useEffect(() => {
    if (!game || game.status !== "active") return;
    if (!player.uid) return;
    if (remainingSeconds > 0) return;
    if (player.uid === game.currentTurnPlayerId) return;
    const timeoutKey = `${gameId}:${game.turnIndex ?? 0}`;
    if (timeoutClaimRef.current === timeoutKey) return;
    timeoutClaimRef.current = timeoutKey;
    claimOnlineTimeout(gameId).catch((caught: unknown) => {
      setMoveError(toErrorMessage(caught));
    });
  }, [game, gameId, player.uid, remainingSeconds]);

  async function drawLine(orientation: LineOrientation, row: number, col: number) {
    if (!game || game.status !== "active" || !isMyTurn || isSubmitting) return;
    const id = lineId(orientation, row, col);
    if (lines[id]?.ownerPlayerId) return;

    try {
      setIsSubmitting(true);
      setMoveError(null);
      setLastMoveId(id);
      await submitOnlineMove({ gameId, orientation, row, col });
    } catch (caught) {
      setMoveError(toErrorMessage(caught));
      setLastMoveId(null);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!hasFirebaseConfig()) {
    return (
      <OnlineGameShell title="Online game unavailable" gameId={gameId}>
        <EmptyState
          title="Firebase is not configured."
          body="Add the public Firebase web config and run the Firebase emulators or deploy the backend to play online games."
        />
      </OnlineGameShell>
    );
  }

  if (!isReady) {
    return (
      <OnlineGameShell title="Joining game" gameId={gameId}>
        <EmptyState title="Checking player session." body="The game will load after auth is ready." />
      </OnlineGameShell>
    );
  }

  if (!player.uid) {
    return (
      <OnlineGameShell title="Sign in required" gameId={gameId}>
        <EmptyState
          title="You need a player session."
          body="Join from the lobby as a guest or signed player before opening an online game."
        />
      </OnlineGameShell>
    );
  }

  if (error) {
    return (
      <OnlineGameShell title="Game error" gameId={gameId}>
        <EmptyState title="Could not load this game." body={error} />
      </OnlineGameShell>
    );
  }

  if (!snapshot) {
    return (
      <OnlineGameShell title="Loading game" gameId={gameId}>
        <EmptyState title="Waiting for game state." body="This room will appear once Firestore sends the first snapshot." />
      </OnlineGameShell>
    );
  }

  if (!game) {
    return (
      <OnlineGameShell title="Match expired" gameId={gameId}>
        <EmptyState
          title="This match is no longer available."
          body="The queue pointed to an old game room. Start matchmaking again to create a fresh match."
        />
      </OnlineGameShell>
    );
  }

  return (
    <main className="app-phone-viewport text-white">
      <section className="app-phone-screen flex flex-col px-4 py-4">
        <header className="flex items-center justify-between gap-3 py-2">
          <div className="min-w-0">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-[#DCEEB1]">
              Breezeblocks
            </p>
            <h1 className="truncate text-3xl font-[340] leading-none text-white">
              Online match
            </h1>
            <p className="mt-1 truncate font-mono text-[10px] uppercase tracking-[0.14em] text-white/40">
              Room {gameId}
            </p>
          </div>
          <Link
            href="/lobby"
            className="h-10 rounded-full bg-white px-5 py-2.5 text-sm font-medium text-black transition hover:bg-[#F4ECD6] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C5B0F4]"
          >
            Lobby
          </Link>
        </header>

        <section className="grid grid-cols-2 gap-2 py-3">
          {players.map((candidate) => {
            const isActive =
              candidate.playerId === game.currentTurnPlayerId && game.status === "active";
            return (
              <div
                key={candidate.playerId}
                className={`rounded-lg border p-3 transition ${
                  isActive
                    ? "border-white bg-white text-black"
                    : "border-white/15 bg-[#111111] text-white"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className="size-3 shrink-0 rounded-full"
                      style={{ backgroundColor: candidate.color }}
                    />
                    <span className="truncate text-sm font-extrabold">
                      {candidate.displayName}
                    </span>
                  </div>
                  <span className="font-mono text-xl font-normal">
                    {candidate.score}
                  </span>
                </div>
                <p
                  className={`mt-1 font-mono text-xs uppercase tracking-[0.12em] ${
                    isActive ? "text-black/60" : "text-white/55"
                  }`}
                >
                  {candidate.connectionStatus === "inactive"
                    ? "Inactive"
                    : candidate.isBot
                      ? "Bot"
                      : `${candidate.consecutiveSkips} skips`}
                </p>
              </div>
            );
          })}
        </section>

        <section className="rounded-lg border border-white/15 bg-[#C5B0F4] p-4 text-black">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-xl font-bold leading-snug">
                {game.status === "completed"
                  ? winners.length > 1
                    ? "Draw game"
                    : `${winners[0]?.displayName ?? "Winner"} wins`
                  : isMyTurn
                    ? "Your turn"
                    : `${activePlayer?.displayName ?? "Player"}'s turn`}
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

        {moveError ? (
          <p className="mt-3 rounded-lg border border-[#F3C9B6]/40 bg-[#F3C9B6]/10 px-3 py-2 text-sm text-[#F3C9B6]">
            {moveError}
          </p>
        ) : null}

        {game.status === "completed" ? (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Link
              href={`/result?gameId=${encodeURIComponent(gameId)}`}
              className="rounded-full bg-white px-4 py-3 text-center text-sm font-medium text-black transition hover:bg-[#F4ECD6]"
            >
              Result
            </Link>
            <Link
              href="/profile"
              className="rounded-full border border-white/20 bg-[#111111] px-4 py-3 text-center text-sm font-medium text-white transition hover:border-white/45"
            >
              Profile
            </Link>
          </div>
        ) : null}

        <section className="flex flex-1 items-center py-4">
          <OnlineGameBoard
            activePlayer={activePlayer}
            boxes={boxes}
            canMove={isMyTurn && game.status === "active" && !isSubmitting}
            lastMoveId={lastMoveId}
            lines={lines}
            players={players}
            onDrawLine={drawLine}
          />
        </section>
      </section>
    </main>
  );
}

function OnlineGameShell({
  title,
  gameId,
  children,
}: {
  title: string;
  gameId: string;
  children: ReactNode;
}) {
  return (
    <main className="app-phone-viewport text-white">
      <section className="app-phone-screen flex flex-col px-4 py-4">
        <header className="flex items-center justify-between gap-3 py-2">
          <div className="min-w-0">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-[#DCEEB1]">
              Breezeblocks
            </p>
            <h1 className="truncate text-3xl font-[340] leading-none text-white">
              {title}
            </h1>
            <p className="mt-1 truncate font-mono text-[10px] uppercase tracking-[0.14em] text-white/40">
              Room {gameId}
            </p>
          </div>
          <Link
            href="/lobby"
            className="h-10 rounded-full bg-white px-5 py-2.5 text-sm font-medium text-black transition hover:bg-[#F4ECD6]"
          >
            Lobby
          </Link>
        </header>
        {children}
      </section>
    </main>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <section className="mt-6 rounded-lg border border-white/15 bg-[#111111] p-4">
      <h2 className="text-xl font-bold text-white">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-white/65">{body}</p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Link
          href="/matchmaking"
          className="rounded-full bg-white px-4 py-3 text-center text-sm font-medium text-black transition hover:bg-[#F4ECD6]"
        >
          Matchmaking
        </Link>
        <Link
          href="/game?gameId=local"
          className="rounded-full border border-white/20 bg-black px-4 py-3 text-center text-sm font-medium text-white transition hover:border-white/45"
        >
          Local game
        </Link>
      </div>
    </section>
  );
}

function OnlineGameBoard({
  activePlayer,
  boxes,
  canMove,
  lastMoveId,
  lines,
  players,
  onDrawLine,
}: {
  activePlayer: OnlinePlayer | undefined;
  boxes: Record<string, Box>;
  canMove: boolean;
  lastMoveId: string | null;
  lines: Record<string, Line>;
  players: OnlinePlayer[];
  onDrawLine: (orientation: LineOrientation, row: number, col: number) => void;
}) {
  const [dragStart, setDragStart] = useState<BoardDot | null>(null);
  const [dragTarget, setDragTarget] = useState<BoardDot | null>(null);
  const [dragPoint, setDragPoint] = useState<BoardPoint | null>(null);
  const previewLine =
    dragStart && dragTarget ? getBoardLineFromDots(dragStart, dragTarget) : null;

  function startDrag(event: PointerEvent<SVGSVGElement>) {
    if (!canMove) return;
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
    if (line && !lines[line.id]?.ownerPlayerId) {
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
        aria-label="10 by 10 Breezeblocks online game board"
        onPointerDown={startDrag}
        onPointerMove={updateDrag}
        onPointerUp={finishDrag}
        onPointerCancel={cancelDrag}
      >
        <rect width={BOARD_SIZE} height={BOARD_SIZE} rx="14" fill="#000000" />

        {Array.from({ length: BOX_ROWS }).map((_, row) =>
          Array.from({ length: BOX_COLS }).map((__, col) => {
            const box = boxes[boxId(row, col)];
            const owner = players.find(
              (candidate) => candidate.playerId === box.ownerPlayerId,
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
            const line = lines[id];
            const owner = getLineDisplayOwner(lines, boxes, players, "horizontal", row, col);
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
            const line = lines[id];
            const owner = getLineDisplayOwner(lines, boxes, players, "vertical", row, col);
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

        {dragStart && dragPoint && activePlayer ? (
          <line
            x1={PADDING + dragStart.col * STEP}
            y1={PADDING + dragStart.row * STEP}
            x2={getPreviewEndPoint(dragStart, dragPoint).x}
            y2={getPreviewEndPoint(dragStart, dragPoint).y}
            stroke={activePlayer.color}
            strokeWidth="8"
            strokeLinecap="round"
            opacity={
              previewLine && lines[previewLine.id]?.ownerPlayerId ? 0.25 : 0.7
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

function normalizePlayers(snapshot: OnlineGameSnapshot | null): OnlinePlayer[] {
  return [...(snapshot?.players ?? [])]
    .map((player) => ({
      playerId: String(player.playerId ?? player.id),
      displayName: String(player.displayName ?? "Player"),
      color: String(player.color ?? "#C5B0F4"),
      score: Number(player.score ?? 0),
      consecutiveSkips: Number(player.consecutiveSkips ?? 0),
      connectionStatus:
        player.connectionStatus === "inactive" || player.connectionStatus === "left"
          ? player.connectionStatus
          : player.connectionStatus === "disconnected"
            ? "disconnected"
            : "connected",
      turnOrder: Number(player.turnOrder ?? 0),
      isBot: player.isBot === true,
    }))
    .sort((a, b) => a.turnOrder - b.turnOrder);
}

function normalizeLines(snapshot: OnlineGameSnapshot | null) {
  const lines: Record<string, Line> = {};
  for (let row = 0; row < DOT_ROWS; row += 1) {
    for (let col = 0; col < DOT_COLS - 1; col += 1) {
      const id = lineId("horizontal", row, col);
      lines[id] = { id, orientation: "horizontal", row, col, ownerPlayerId: null };
    }
  }
  for (let row = 0; row < DOT_ROWS - 1; row += 1) {
    for (let col = 0; col < DOT_COLS; col += 1) {
      const id = lineId("vertical", row, col);
      lines[id] = { id, orientation: "vertical", row, col, ownerPlayerId: null };
    }
  }
  for (const line of snapshot?.lines ?? []) {
    const id = String(line.lineId ?? line.id);
    const orientation = line.orientation === "vertical" ? "vertical" : "horizontal";
    lines[id] = {
      id,
      orientation,
      row: Number(line.row ?? 0),
      col: Number(line.col ?? 0),
      ownerPlayerId: line.ownerPlayerId ? String(line.ownerPlayerId) : null,
    };
  }
  return lines;
}

function normalizeBoxes(snapshot: OnlineGameSnapshot | null) {
  const boxes: Record<string, Box> = {};
  for (let row = 0; row < BOX_ROWS; row += 1) {
    for (let col = 0; col < BOX_COLS; col += 1) {
      const id = boxId(row, col);
      boxes[id] = { id, row, col, ownerPlayerId: null };
    }
  }
  for (const box of snapshot?.boxes ?? []) {
    const id = String(box.boxId ?? box.id);
    boxes[id] = {
      id,
      row: Number(box.row ?? 0),
      col: Number(box.col ?? 0),
      ownerPlayerId: box.ownerPlayerId ? String(box.ownerPlayerId) : null,
    };
  }
  return boxes;
}

function toMillis(value: unknown) {
  if (!value) return Date.now();
  if (typeof value === "number") return value;
  const candidate = value as { toMillis?: unknown };
  if (
    typeof value === "object" &&
    "toMillis" in value &&
    typeof candidate.toMillis === "function"
  ) {
    return candidate.toMillis();
  }
  return Date.now();
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
  lines: Record<string, Line>,
  boxes: Record<string, Box>,
  players: OnlinePlayer[],
  orientation: LineOrientation,
  row: number,
  col: number,
) {
  const line = lines[lineId(orientation, row, col)];
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
    .map((id) => (id ? boxes[id] : null))
    .find((box) => box?.ownerPlayerId);
  const ownerId = filledBox?.ownerPlayerId ?? line.ownerPlayerId;

  return players.find((candidate) => candidate.playerId === ownerId);
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Move failed.";
}
