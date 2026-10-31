import { SlackApiError, type SlackApi } from "./slackApi";
import { OperationAbortedError, RateLimiter, RetryExhaustedError } from "./rateLimiter";
import { isSlackTimestamp } from "./slackTimestamp";
import type {
  DeleteProgress,
  DeleteResult,
  ScanCandidate,
  ScanExclusions,
  ScanFilters,
  ScanProgress,
  ScanSnapshot,
  SlackContext,
  SlackMessage,
  UrlTarget,
  VerifiedSession,
  VerifiedTarget,
} from "./types";
import {
  assertFrozenContext,
  assertSameVerifiedSession,
  assertSameVerifiedTarget,
  VerificationError,
  verifySession,
  verifyTarget,
} from "./verification";

const PREVIEW_TTL_MS = 15 * 60 * 1000;
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const REFRESH_DELETE_COUNT = 100;
const MAX_IDENTICAL_TERMINAL_ERRORS = 3;
const SUPPORTED_SUBTYPES: Record<string, true> = {
  file_share: true,
  me_message: true,
  thread_broadcast: true,
};
const SKIPPABLE_DELETE_ERRORS: Record<string, true> = {
  cant_delete_message: true,
};

export interface CleanerDeps {
  api: SlackApi;
  limiter: RateLimiter;
  now: () => number;
  readCurrent: () => { target: UrlTarget; context: SlackContext };
}

function totalExclusions(exclusions: ScanExclusions): number {
  return exclusions.foreignAuthor
    + exclusions.appOrBot
    + exclusions.unsupportedSubtype
    + exclusions.pinned
    + exclusions.outsideDateRange;
}

function assertValidFilters(filters: ScanFilters): void {
  if (filters.mode === "all") return;
  if (
    filters.startSec === undefined
    || filters.endExclusiveSec === undefined
    || !Number.isFinite(filters.startSec)
    || !Number.isFinite(filters.endExclusiveSec)
    || filters.startSec >= filters.endExclusiveSec
  ) {
    throw new VerificationError("Choose a valid local start and end date before scanning.");
  }
}

function assertLocalContext(
  current: { target: UrlTarget; context: SlackContext },
  session: VerifiedSession,
  target: VerifiedTarget,
): void {
  assertFrozenContext(current.target, session, target);
  if (
    current.context.teamId !== session.teamId
    || current.context.userId !== session.userId
    || current.context.token !== session.token
  ) {
    throw new VerificationError("The local Slack session changed after verification.");
  }
}

async function refreshVerifiedContext(
  session: VerifiedSession,
  target: VerifiedTarget,
  deps: CleanerDeps,
  signal?: AbortSignal,
): Promise<void> {
  const current = deps.readCurrent();
  assertLocalContext(current, session, target);
  const refreshedSession = await verifySession(current.context, deps.api, deps.limiter, signal);
  assertSameVerifiedSession(session.teamId, session.userId, refreshedSession);
  const refreshedTarget = await verifyTarget(current.target, refreshedSession, deps.api, deps.limiter, signal);
  assertSameVerifiedTarget(target, refreshedTarget);
}

function candidateFromMessage(
  message: SlackMessage,
  session: VerifiedSession,
  target: VerifiedTarget,
  filters: ScanFilters,
  protectedTimestamps: ReadonlySet<string>,
  exclusions: ScanExclusions,
): ScanCandidate | null {
  if (message.bot_id || message.app_id || message.subtype === "bot_message") {
    exclusions.appOrBot += 1;
    return null;
  }
  if (!message.user || (message.subtype !== undefined && !SUPPORTED_SUBTYPES[message.subtype])) {
    exclusions.unsupportedSubtype += 1;
    return null;
  }
  if (message.user !== session.userId) {
    exclusions.foreignAuthor += 1;
    return null;
  }

  const timestamp = Number(message.ts);
  if (!isSlackTimestamp(message.ts)) {
    throw new VerificationError("Slack returned an invalid message timestamp.");
  }
  if (
    filters.mode === "custom"
    && (timestamp < filters.startSec! || timestamp >= filters.endExclusiveSec!)
  ) {
    exclusions.outsideDateRange += 1;
    return null;
  }
  if (protectedTimestamps.has(message.ts)) {
    exclusions.pinned += 1;
    return null;
  }
  return Object.freeze({
    channelId: target.channelId,
    ts: message.ts,
    authorUserId: message.user,
    subtype: message.subtype ?? null,
  });
}

export async function scan(
  session: VerifiedSession,
  target: VerifiedTarget,
  filters: ScanFilters,
  deps: CleanerDeps,
  onProgress?: (progress: ScanProgress) => void,
  signal?: AbortSignal,
): Promise<ScanSnapshot> {
  assertValidFilters(filters);
  await refreshVerifiedContext(session, target, deps, signal);

  const protectedTimestamps = filters.keepPinned
    ? await deps.limiter.execute(() => deps.api.pinsList(target.channelId, signal), signal)
    : new Set<string>();
  const exclusions: ScanExclusions = {
    foreignAuthor: 0,
    appOrBot: 0,
    unsupportedSubtype: 0,
    pinned: 0,
    outsideDateRange: 0,
  };
  const candidatesByTimestamp = new Map<string, ScanCandidate>();
  const threadRoots = new Set<string>();
  const seenMessages = new Map<string, SlackMessage>();
  let pages = 0;
  let threads = 0;
  let scanned = 0;
  let snapshotBoundaryTs: string | null = null;

  const report = () => {
    onProgress?.({
      pages,
      threads,
      scanned,
      candidates: candidatesByTimestamp.size,
      excluded: totalExclusions(exclusions),
    });
  };
  const inspectMessage = (message: SlackMessage) => {
    const previous = seenMessages.get(message.ts);
    if (previous) {
      if (
        previous.user !== message.user
        || previous.subtype !== message.subtype
        || previous.bot_id !== message.bot_id
        || previous.app_id !== message.app_id
      ) {
        throw new VerificationError("Slack returned conflicting authorship evidence for one message.");
      }
      return;
    }
    seenMessages.set(message.ts, message);
    scanned += 1;
    if (snapshotBoundaryTs === null || Number(message.ts) > Number(snapshotBoundaryTs)) {
      snapshotBoundaryTs = message.ts;
    }
    const candidate = candidateFromMessage(
      message,
      session,
      target,
      filters,
      protectedTimestamps,
      exclusions,
    );
    if (candidate) candidatesByTimestamp.set(candidate.ts, candidate);
  };

  const historyCursors = new Set<string>();
  let cursor: string | undefined;
  do {
    const page = await deps.limiter.execute(
      () => deps.api.conversationsHistory(target.channelId, cursor, signal),
      signal,
    );
    pages += 1;
    for (const message of page.messages) {
      inspectMessage(message);
      if ((message.reply_count ?? 0) > 0) threadRoots.add(message.ts);
    }
    cursor = page.nextCursor;
    if (cursor) {
      if (historyCursors.has(cursor)) {
        throw new VerificationError("Slack returned a repeated conversations.history cursor.");
      }
      historyCursors.add(cursor);
    }
    report();
  } while (cursor);

  for (const rootTimestamp of threadRoots) {
    let replyCursor: string | undefined;
    const replyCursors = new Set<string>();
    threads += 1;
    do {
      const page = await deps.limiter.execute(
        () => deps.api.conversationsReplies(target.channelId, rootTimestamp, replyCursor, signal),
        signal,
      );
      pages += 1;
      for (const message of page.messages) {
        if (message.ts !== rootTimestamp) inspectMessage(message);
      }
      replyCursor = page.nextCursor;
      if (replyCursor) {
        if (replyCursors.has(replyCursor)) {
          throw new VerificationError("Slack returned a repeated conversations.replies cursor.");
        }
        replyCursors.add(replyCursor);
      }
      report();
    } while (replyCursor);
  }

  const candidates = [...candidatesByTimestamp.values()]
    .sort((left, right) => Number(right.ts) - Number(left.ts));
  const scannedAtMs = deps.now();
  return Object.freeze({
    sessionTeamId: session.teamId,
    sessionUserId: session.userId,
    target: Object.freeze({ ...target }),
    filters: Object.freeze({ ...filters }),
    candidates: Object.freeze(candidates),
    exclusions: Object.freeze({ ...exclusions }),
    scannedAtMs,
    expiresAtMs: scannedAtMs + PREVIEW_TTL_MS,
    snapshotBoundaryTs,
    pages,
    threads,
  });
}

function updateRate(progress: DeleteProgress, startedAt: number, now: number): void {
  progress.elapsedMs = now - startedAt;
  const completed = progress.deleted + progress.alreadyGone + progress.excluded;
  const minutes = progress.elapsedMs / 60_000;
  progress.ratePerMin = minutes > 0 ? completed / minutes : 0;
  progress.remaining = progress.total - completed;
}

function errorMessage(error: unknown): { code: string; message: string } {
  if (error instanceof RetryExhaustedError) {
    return { code: error.code, message: "Slack rate or network retries were exhausted. Deletion stopped." };
  }
  if (error instanceof SlackApiError) {
    return { code: error.code, message: `Slack rejected the operation (${error.code}). Deletion stopped.` };
  }
  if (error instanceof VerificationError) {
    return { code: "verification_failed", message: error.message };
  }
  return { code: "unexpected_error", message: "An unexpected error stopped deletion." };
}

export async function runDelete(
  snapshot: ScanSnapshot,
  session: VerifiedSession,
  target: VerifiedTarget,
  deps: CleanerDeps,
  onProgress: (progress: DeleteProgress) => void,
  signal?: AbortSignal,
): Promise<DeleteResult> {
  const startedAt = deps.now();
  const progress: DeleteProgress = {
    deleted: 0,
    alreadyGone: 0,
    excluded: 0,
    remaining: snapshot.candidates.length,
    total: snapshot.candidates.length,
    ratePerMin: 0,
    elapsedMs: 0,
  };
  let protectedTimestamps = new Set<string>();
  let deletionCalls = 0;
  let lastRefreshAt = startedAt;
  const terminalErrors: Record<string, number> = {};

  const finish = (terminal: DeleteResult["terminal"], message?: string): DeleteResult => {
    updateRate(progress, startedAt, deps.now());
    return { terminal, progress: { ...progress }, message };
  };

  try {
    if (deps.now() > snapshot.expiresAtMs) {
      throw new VerificationError("The scan preview expired. Scan again before deleting.");
    }
    if (
      snapshot.sessionTeamId !== session.teamId
      || snapshot.sessionUserId !== session.userId
    ) {
      throw new VerificationError("The scan belongs to a different Slack workspace or user.");
    }
    assertSameVerifiedTarget(snapshot.target, target);
    await refreshVerifiedContext(session, target, deps, signal);
    if (snapshot.filters.keepPinned) {
      protectedTimestamps = await deps.limiter.execute(
        () => deps.api.pinsList(target.channelId, signal),
        signal,
      );
    }

    for (const candidate of snapshot.candidates) {
      if (signal?.aborted) return finish("stopped", "Deletion was stopped.");
      if (
        candidate.channelId !== target.channelId
        || candidate.authorUserId !== session.userId
        || !isSlackTimestamp(candidate.ts)
        || (candidate.subtype !== null && !SUPPORTED_SUBTYPES[candidate.subtype])
      ) {
        throw new VerificationError("A frozen deletion candidate failed its author, target, timestamp, or subtype check.");
      }

      const refreshDue = deletionCalls > 0 && (
        deletionCalls % REFRESH_DELETE_COUNT === 0
        || deps.now() - lastRefreshAt >= REFRESH_INTERVAL_MS
      );
      if (refreshDue) {
        await refreshVerifiedContext(session, target, deps, signal);
        if (snapshot.filters.keepPinned) {
          protectedTimestamps = await deps.limiter.execute(
            () => deps.api.pinsList(target.channelId, signal),
            signal,
          );
        }
        lastRefreshAt = deps.now();
      }

      assertLocalContext(deps.readCurrent(), session, target);
      if (protectedTimestamps.has(candidate.ts)) {
        progress.excluded += 1;
        updateRate(progress, startedAt, deps.now());
        onProgress({ ...progress });
        continue;
      }

      try {
        const outcome = await deps.limiter.execute(
          () => deps.api.chatDelete(target.channelId, candidate.ts, signal),
          signal,
        );
        deletionCalls += 1;
        if (outcome.status === "deleted") progress.deleted += 1;
        else progress.alreadyGone += 1;
      } catch (error) {
        if (error instanceof OperationAbortedError) return finish("stopped", "Deletion was stopped.");
        if (error instanceof SlackApiError && SKIPPABLE_DELETE_ERRORS[error.code]) {
          progress.excluded += 1;
          terminalErrors[error.code] = (terminalErrors[error.code] ?? 0) + 1;
          progress.lastErrorCode = error.code;
          deletionCalls += 1;
          if (terminalErrors[error.code] >= MAX_IDENTICAL_TERMINAL_ERRORS) {
            updateRate(progress, startedAt, deps.now());
            onProgress({ ...progress });
            return finish(
              "failed-partial",
              `Slack returned ${error.code} three times. Deletion stopped to prevent repeated futile calls.`,
            );
          }
        } else {
          throw error;
        }
      }

      updateRate(progress, startedAt, deps.now());
      onProgress({ ...progress });
    }
    return finish("complete");
  } catch (error) {
    if (error instanceof OperationAbortedError) return finish("stopped", "Deletion was stopped.");
    const failure = errorMessage(error);
    progress.lastErrorCode = failure.code;
    return finish("failed-partial", failure.message);
  }
}
