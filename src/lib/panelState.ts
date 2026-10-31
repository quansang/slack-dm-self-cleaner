import type {
  DeleteProgress,
  DeleteResult,
  ScanProgress,
  ScanSnapshot,
  VerifiedSession,
  VerifiedTarget,
} from "./types";

export type PanelStatus =
  | "verifying"
  | "idle"
  | "scanning"
  | "preview"
  | "running"
  | "complete"
  | "stopped"
  | "failed-partial"
  | "error"
  | "duplicate";

export interface PanelState {
  status: PanelStatus;
  session?: VerifiedSession;
  target?: VerifiedTarget;
  scope: "all" | "custom";
  startDate: string;
  endDate: string;
  keepPinned: boolean;
  confirmed: boolean;
  scanProgress: ScanProgress;
  snapshot?: ScanSnapshot;
  deleteProgress: DeleteProgress;
  message?: string;
}

const EMPTY_SCAN_PROGRESS: ScanProgress = {
  pages: 0,
  threads: 0,
  scanned: 0,
  candidates: 0,
  excluded: 0,
};
const EMPTY_DELETE_PROGRESS: DeleteProgress = {
  deleted: 0,
  alreadyGone: 0,
  excluded: 0,
  remaining: 0,
  total: 0,
  ratePerMin: 0,
  elapsedMs: 0,
};

export const initialState: PanelState = {
  status: "verifying",
  scope: "all",
  startDate: "",
  endDate: "",
  keepPinned: true,
  confirmed: false,
  scanProgress: EMPTY_SCAN_PROGRESS,
  deleteProgress: EMPTY_DELETE_PROGRESS,
};

export type PanelAction =
  | { type: "VERIFIED"; session: VerifiedSession; target: VerifiedTarget }
  | { type: "SET_SCOPE"; scope: "all" | "custom" }
  | { type: "SET_START_DATE"; value: string }
  | { type: "SET_END_DATE"; value: string }
  | { type: "SET_KEEP_PINNED"; value: boolean }
  | { type: "SET_CONFIRMED"; value: boolean }
  | { type: "SCAN_START" }
  | { type: "SCAN_PROGRESS"; progress: ScanProgress }
  | { type: "SCAN_DONE"; snapshot: ScanSnapshot; session: VerifiedSession; target: VerifiedTarget }
  | { type: "SCAN_STOPPED" }
  | { type: "RUN_START" }
  | { type: "RUN_PROGRESS"; progress: DeleteProgress }
  | { type: "RUN_RESULT"; result: DeleteResult }
  | { type: "RESET_START" }
  | { type: "ERROR"; message: string }
  | { type: "DUPLICATE" };

function canEdit(state: PanelState): boolean {
  return state.status === "idle" || state.status === "preview" || state.status === "error";
}

function invalidatePreview(state: PanelState): PanelState {
  return {
    ...state,
    status: state.session && state.target ? "idle" : "verifying",
    confirmed: false,
    snapshot: undefined,
    message: undefined,
    scanProgress: EMPTY_SCAN_PROGRESS,
    deleteProgress: EMPTY_DELETE_PROGRESS,
  };
}

export function reduce(state: PanelState, action: PanelAction): PanelState {
  switch (action.type) {
    case "VERIFIED":
      return {
        ...state,
        status: "idle",
        session: action.session,
        target: action.target,
        message: undefined,
      };
    case "SET_SCOPE":
      if (!canEdit(state)) return state;
      return invalidatePreview({
        ...state,
        scope: action.scope,
        startDate: action.scope === "all" ? "" : state.startDate,
        endDate: action.scope === "all" ? "" : state.endDate,
      });
    case "SET_START_DATE":
      if (!canEdit(state)) return state;
      return invalidatePreview({ ...state, startDate: action.value });
    case "SET_END_DATE":
      if (!canEdit(state)) return state;
      return invalidatePreview({ ...state, endDate: action.value });
    case "SET_KEEP_PINNED":
      if (!canEdit(state)) return state;
      return invalidatePreview({ ...state, keepPinned: action.value });
    case "SET_CONFIRMED":
      if (state.status !== "preview") return state;
      return { ...state, confirmed: action.value };
    case "SCAN_START":
      if (state.status !== "idle" || !state.session || !state.target) return state;
      return {
        ...state,
        status: "scanning",
        confirmed: false,
        snapshot: undefined,
        message: undefined,
        scanProgress: EMPTY_SCAN_PROGRESS,
      };
    case "SCAN_PROGRESS":
      if (state.status !== "scanning") return state;
      return { ...state, scanProgress: action.progress };
    case "SCAN_DONE":
      if (state.status !== "scanning") return state;
      return {
        ...state,
        status: "preview",
        session: action.session,
        target: action.target,
        snapshot: action.snapshot,
        confirmed: false,
      };
    case "SCAN_STOPPED":
      if (state.status !== "scanning") return state;
      return {
        ...state,
        status: "stopped",
        message: "Scanning was stopped. No deletion preview was created.",
      };
    case "RUN_START":
      if (state.status !== "preview" || !state.snapshot || !state.confirmed) return state;
      return {
        ...state,
        status: "running",
        message: undefined,
        deleteProgress: {
          ...EMPTY_DELETE_PROGRESS,
          total: state.snapshot.candidates.length,
          remaining: state.snapshot.candidates.length,
        },
      };
    case "RUN_PROGRESS":
      if (state.status !== "running") return state;
      return { ...state, deleteProgress: action.progress };
    case "RUN_RESULT":
      if (state.status !== "running") return state;
      return {
        ...state,
        status: action.result.terminal,
        deleteProgress: action.result.progress,
        message: action.result.message,
      };
    case "RESET_START":
      if (state.status === "scanning" || state.status === "running") return state;
      return {
        ...initialState,
        scope: state.scope,
        startDate: state.startDate,
        endDate: state.endDate,
        keepPinned: state.keepPinned,
      };
    case "ERROR":
      return { ...state, status: "error", message: action.message, confirmed: false };
    case "DUPLICATE":
      return {
        ...initialState,
        status: "duplicate",
        message: "Two copies of Slack DM Self Cleaner are active. Disable one copy and reload Slack.",
      };
    default:
      return state;
  }
}
