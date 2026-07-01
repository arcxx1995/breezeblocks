export type AuthType = "anonymous" | "signed";
export type MatchMode = "quick" | "2p" | "3p" | "4p";
export type PlayerCount = 2 | 3 | 4;
export type QueueStatus = "idle" | "queued" | "matched" | "cancelled" | "error";

export type QueueName =
  | "anon_2p"
  | "anon_3p"
  | "anon_4p"
  | "signed_2p"
  | "signed_3p"
  | "signed_4p";

export type JoinQueueInput = {
  authType: AuthType;
  requestedPlayerCount: PlayerCount;
  displayName: string;
  userId?: string;
  guestId?: string;
  allowBots?: boolean;
  rematchWithUid?: string;
};

export type JoinQueueResult = {
  queueId: string;
  queueName: QueueName;
  status: "queued" | "matched";
  gameId?: string;
  source: "functions" | "local";
};

export type QueueSnapshot = JoinQueueResult & {
  createdAt: number;
};

export function modeToPlayerCount(mode: MatchMode): PlayerCount {
  if (mode === "3p") return 3;
  if (mode === "4p") return 4;
  return 2;
}

export function toQueueName(authType: AuthType, playerCount: PlayerCount): QueueName {
  const prefix = authType === "signed" ? "signed" : "anon";
  return `${prefix}_${playerCount}p` as QueueName;
}
