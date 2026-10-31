export interface UrlTarget {
  teamId: string;
  channelId: string;
}

export interface SlackContext {
  token: string;
  userId: string;
  teamId: string;
  apiBase: "https://app.slack.com";
}

export interface VerifiedSession extends SlackContext {
  workspaceName: string;
  userName: string;
}

export type TargetKind = "peer" | "self";

export interface VerifiedTarget {
  channelId: string;
  peerUserId: string;
  kind: TargetKind;
  label: string;
}

export interface SlackMessage {
  ts: string;
  user?: string;
  subtype?: string;
  thread_ts?: string;
  reply_count?: number;
  bot_id?: string;
  app_id?: string;
}

export type ScanMode = "all" | "custom";

export interface ScanFilters {
  mode: ScanMode;
  startSec?: number;
  endExclusiveSec?: number;
  keepPinned: boolean;
}

export interface ScanCandidate {
  readonly channelId: string;
  readonly ts: string;
  readonly authorUserId: string;
  readonly subtype: string | null;
}

export interface ScanExclusions {
  foreignAuthor: number;
  appOrBot: number;
  unsupportedSubtype: number;
  pinned: number;
  outsideDateRange: number;
}
export interface ScanProgress {
  pages: number;
  threads: number;
  scanned: number;
  candidates: number;
  excluded: number;
}

export interface ScanSnapshot {
  readonly sessionTeamId: string;
  readonly sessionUserId: string;
  readonly target: Readonly<VerifiedTarget>;
  readonly filters: Readonly<ScanFilters>;
  readonly candidates: readonly Readonly<ScanCandidate>[];
  readonly exclusions: Readonly<ScanExclusions>;
  readonly scannedAtMs: number;
  readonly expiresAtMs: number;
  readonly snapshotBoundaryTs: string | null;
  readonly pages: number;
  readonly threads: number;
}

export interface DeleteProgress {
  deleted: number;
  alreadyGone: number;
  excluded: number;
  remaining: number;
  total: number;
  ratePerMin: number;
  elapsedMs: number;
  lastErrorCode?: string;
}

export type DeleteTerminal = "complete" | "stopped" | "failed-partial";

export interface DeleteResult {
  terminal: DeleteTerminal;
  progress: DeleteProgress;
  message?: string;
}
