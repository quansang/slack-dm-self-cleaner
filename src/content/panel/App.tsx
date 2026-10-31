import { useEffect, useReducer } from "preact/hooks";
import { buildScanFilters } from "../../lib/dates";
import { initialState, reduce } from "../../lib/panelState";
import { OperationAbortedError } from "../../lib/rateLimiter";
import type { RunOwner } from "../../lib/runOwner";
import type { PanelStatus } from "../../lib/panelState";
import { PANEL_CSS } from "./styles";

interface AppProps {
  owner: RunOwner;
  duplicate: boolean;
  onRequestClose: () => Promise<void>;
}

function statusTitle(status: PanelStatus): string {
  const titles: Record<PanelStatus, string> = {
    verifying: "Verifying Slack context…",
    idle: "Ready to scan",
    scanning: "Scanning…",
    preview: "Review scan preview",
    running: "Deleting…",
    complete: "Complete",
    stopped: "Stopped",
    "failed-partial": "Failed after partial work",
    error: "Cannot continue",
    duplicate: "Duplicate extension copies detected",
  };
  return titles[status];
}

function formatLocalTime(timestampMs: number): string {
  return new Date(timestampMs).toLocaleString();
}

function failureMessage(error: unknown): string {
  return error instanceof Error ? error.message : "An unexpected error stopped the operation.";
}

export function App({ owner, duplicate, onRequestClose }: AppProps) {
  const [state, dispatch] = useReducer(reduce, initialState);

  useEffect(() => {
    if (duplicate) {
      dispatch({ type: "DUPLICATE" });
      return;
    }
    owner.inspect().then(
      (view) => dispatch({ type: "VERIFIED", ...view }),
      (error) => dispatch({ type: "ERROR", message: failureMessage(error) }),
    );
  }, [duplicate, owner]);

  useEffect(() => {
    if (state.status !== "preview" || !state.snapshot) return;
    const remainingMs = state.snapshot.expiresAtMs - Date.now();
    if (remainingMs <= 0) {
      owner.invalidatePreview();
      dispatch({ type: "ERROR", message: "The scan preview expired. Scan again before deleting." });
      return;
    }
    const timer = window.setTimeout(() => {
      owner.invalidatePreview();
      dispatch({ type: "ERROR", message: "The scan preview expired. Scan again before deleting." });
    }, remainingMs);
    return () => window.clearTimeout(timer);
  }, [owner, state.snapshot, state.status]);

  function invalidateAndDispatch(action: Parameters<typeof dispatch>[0]): void {
    try {
      owner.invalidatePreview();
      dispatch(action);
    } catch (error) {
      dispatch({ type: "ERROR", message: failureMessage(error) });
    }
  }

  async function handleScan(): Promise<void> {
    let filters;
    try {
      filters = buildScanFilters(
        state.scope,
        state.keepPinned,
        state.startDate,
        state.endDate,
      );
    } catch (error) {
      dispatch({ type: "ERROR", message: failureMessage(error) });
      return;
    }

    dispatch({ type: "SCAN_START" });
    try {
      const result = await owner.scan(
        filters,
        (progress) => dispatch({ type: "SCAN_PROGRESS", progress }),
      );
      dispatch({ type: "SCAN_DONE", snapshot: result.snapshot, ...result.view });
    } catch (error) {
      if (error instanceof OperationAbortedError) dispatch({ type: "SCAN_STOPPED" });
      else dispatch({ type: "ERROR", message: failureMessage(error) });
    }
  }

  async function handleDelete(): Promise<void> {
    if (!state.snapshot || Date.now() > state.snapshot.expiresAtMs) {
      owner.invalidatePreview();
      dispatch({ type: "ERROR", message: "The scan preview expired. Scan again before deleting." });
      return;
    }
    dispatch({ type: "RUN_START" });
    try {
      const result = await owner.delete(
        (progress) => dispatch({ type: "RUN_PROGRESS", progress }),
      );
      dispatch({ type: "RUN_RESULT", result });
    } catch (error) {
      dispatch({ type: "ERROR", message: failureMessage(error) });
    }
  }

  async function handleReset(): Promise<void> {
    dispatch({ type: "RESET_START" });
    try {
      const view = await owner.reset();
      dispatch({ type: "VERIFIED", ...view });
    } catch (error) {
      dispatch({ type: "ERROR", message: failureMessage(error) });
    }
  }

  const completed = state.deleteProgress.deleted
    + state.deleteProgress.alreadyGone
    + state.deleteProgress.excluded;
  const progressPercent = state.deleteProgress.total > 0
    ? Math.round((completed / state.deleteProgress.total) * 100)
    : 0;
  const estimatedSeconds = state.deleteProgress.ratePerMin > 0
    ? Math.ceil((state.deleteProgress.remaining / state.deleteProgress.ratePerMin) * 60)
    : null;
  const scanExcluded = state.snapshot
    ? Object.values(state.snapshot.exclusions).reduce((sum, value) => sum + value, 0)
    : 0;
  const editable = state.status === "idle" || state.status === "preview";

  return (
    <div>
      <style>{PANEL_CSS}</style>
      <aside
        class="panel"
        aria-label="Slack DM Self Cleaner"
        onKeyDown={(event) => event.stopPropagation()}
        onKeyUp={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header class="header">
          <div>
            <h1>Slack DM Self Cleaner</h1>
            <span>{statusTitle(state.status)}</span>
          </div>
          <button type="button" onClick={() => void onRequestClose()} aria-label="Close and stop">×</button>
        </header>

        <main class="body">
          {(state.status === "error" || state.status === "duplicate" || state.status === "failed-partial") && (
            <div class="error" role="alert">{state.message}</div>
          )}

          {state.session && state.target && (
            <section class="identity" aria-label="Verified Slack context">
              <dl>
                <div><dt>Workspace</dt><dd>{state.session.workspaceName} ({state.session.teamId})</dd></div>
                <div><dt>Account</dt><dd>{state.session.userName} ({state.session.userId})</dd></div>
                <div><dt>Target</dt><dd>{state.target.label}</dd></div>
                <div><dt>DM ID</dt><dd>{state.target.channelId}</dd></div>
              </dl>
            </section>
          )}

          {editable && state.session && state.target && (
            <section class="controls" aria-label="Cleanup scope">
              <fieldset>
                <legend>History scope</legend>
                <label class="radio-row">
                  <input
                    type="radio"
                    name="scope"
                    checked={state.scope === "all"}
                    onInput={() => invalidateAndDispatch({ type: "SET_SCOPE", scope: "all" })}
                  />
                  <span><b>All accessible history</b><small>All matching messages Slack currently returns. No date bounds.</small></span>
                </label>
                <label class="radio-row">
                  <input
                    type="radio"
                    name="scope"
                    checked={state.scope === "custom"}
                    onInput={() => invalidateAndDispatch({ type: "SET_SCOPE", scope: "custom" })}
                  />
                  <span><b>Custom date range</b><small>Local calendar days; both dates are included.</small></span>
                </label>
              </fieldset>

              {state.scope === "custom" && (
                <div class="date-grid">
                  <label>On or after<input type="date" value={state.startDate} onInput={(event) => invalidateAndDispatch({ type: "SET_START_DATE", value: (event.target as HTMLInputElement).value })} /></label>
                  <label>On or before<input type="date" value={state.endDate} onInput={(event) => invalidateAndDispatch({ type: "SET_END_DATE", value: (event.target as HTMLInputElement).value })} /></label>
                </div>
              )}

              <label class="checkbox-row">
                <input
                  type="checkbox"
                  checked={state.keepPinned}
                  onInput={(event) => invalidateAndDispatch({ type: "SET_KEEP_PINNED", value: (event.target as HTMLInputElement).checked })}
                />
                <span><b>Keep pinned messages</b><small>Enabled by default. Disable deliberately to include eligible pinned messages.</small></span>
              </label>

              {state.status === "idle" && (
                <button class="btn btn-primary" type="button" onClick={() => void handleScan()}>Scan messages</button>
              )}
            </section>
          )}

          {state.status === "scanning" && (
            <section class="operation" aria-live="polite">
              <div class="spinner" />
              <p><b>Scanning complete accessible history…</b></p>
              <div class="metric-grid">
                <span>Pages <b>{state.scanProgress.pages}</b></span>
                <span>Threads <b>{state.scanProgress.threads}</b></span>
                <span>Checked <b>{state.scanProgress.scanned}</b></span>
                <span>Candidates <b>{state.scanProgress.candidates}</b></span>
              </div>
              <button class="btn btn-danger" type="button" onClick={() => void owner.stopAndWait()}>Stop scan</button>
            </section>
          )}

          {state.status === "preview" && state.snapshot && state.target && (
            <section class="preview">
              <h2>{state.snapshot.candidates.length} deletion candidate{state.snapshot.candidates.length === 1 ? "" : "s"}</h2>
              <dl>
                <div><dt>Target</dt><dd>{state.target.label}</dd></div>
                <div><dt>Scope</dt><dd>{state.scope === "all" ? "All accessible history" : `${state.startDate} through ${state.endDate}`}</dd></div>
                <div><dt>Pins</dt><dd>{state.keepPinned ? "Protected" : "Included when otherwise eligible"}</dd></div>
                <div><dt>Excluded</dt><dd>{scanExcluded}</dd></div>
                <div><dt>Scan completed</dt><dd>{formatLocalTime(state.snapshot.scannedAtMs)}</dd></div>
                <div><dt>Preview expires</dt><dd>{formatLocalTime(state.snapshot.expiresAtMs)}</dd></div>
                <div><dt>Snapshot boundary</dt><dd>{state.snapshot.snapshotBoundaryTs ?? "No messages returned"}</dd></div>
              </dl>
              <p class="warning">Messages posted after this scan are not included. Any target or filter change requires a new scan.</p>
              {state.snapshot.candidates.length > 0 && (
                <>
                  <label class="confirm">
                    <input type="checkbox" checked={state.confirmed} onInput={(event) => dispatch({ type: "SET_CONFIRMED", value: (event.target as HTMLInputElement).checked })} />
                    <span>I verified the workspace, account, {state.target.kind === "self" ? "self-DM" : "peer DM"}, scope, and pin policy. I understand deletion is permanent.</span>
                  </label>
                  <button class="btn btn-danger" type="button" disabled={!state.confirmed} onClick={() => void handleDelete()}>
                    Permanently delete {state.snapshot.candidates.length} messages
                  </button>
                </>
              )}
            </section>
          )}

          {state.status === "running" && (
            <section class="operation" aria-live="polite">
              <div class="progress-wrap"><div class="progress-bar" style={{ width: `${progressPercent}%` }} /></div>
              <div class="metric-grid">
                <span>Deleted <b>{state.deleteProgress.deleted}</b></span>
                <span>Already gone <b>{state.deleteProgress.alreadyGone}</b></span>
                <span>Excluded <b>{state.deleteProgress.excluded}</b></span>
                <span>Remaining <b>{state.deleteProgress.remaining}</b></span>
              </div>
              <p class="eta">{estimatedSeconds === null ? "Calculating ETA…" : `Estimated ${estimatedSeconds}s remaining`}</p>
              <button class="btn btn-danger" type="button" onClick={() => void owner.stopAndWait()}>Stop deletion</button>
            </section>
          )}

          {(state.status === "complete" || state.status === "stopped" || state.status === "failed-partial") && (
            <section class="result" aria-live="polite">
              <h2>{statusTitle(state.status)}</h2>
              {state.message && state.status !== "failed-partial" && <p>{state.message}</p>}
              <div class="metric-grid">
                <span>Deleted <b>{state.deleteProgress.deleted}</b></span>
                <span>Already gone <b>{state.deleteProgress.alreadyGone}</b></span>
                <span>Excluded <b>{state.deleteProgress.excluded}</b></span>
                <span>Remaining <b>{state.deleteProgress.remaining}</b></span>
              </div>
              <button class="btn btn-secondary" type="button" onClick={() => void handleReset()}>Reset from current Slack URL</button>
            </section>
          )}

          {state.status === "error" && state.session && state.target && (
            <button class="btn btn-secondary" type="button" onClick={() => void handleReset()}>Re-verify current Slack URL</button>
          )}

          <p class="note">
            No developer or third-party servers. Requests go only to Slack using the active browser session.
            All accessible history means Slack-returned messages only. Plan-hidden history, Slack file objects,
            edit history, and retention or compliance copies are not removed.
          </p>
        </main>
      </aside>
    </div>
  );
}
