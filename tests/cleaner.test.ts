import { describe, expect, it, vi } from "vitest";
import { runDelete, scan, type CleanerDeps } from "../src/lib/cleaner";
import { SlackApiError, type SlackApi } from "../src/lib/slackApi";
import type { ScanCandidate, ScanSnapshot } from "../src/lib/types";
import {
  fakeApi,
  immediateLimiter,
  PEER_TARGET,
  SELF_TARGET,
  TEST_CONTEXT,
  TEST_SESSION,
  URL_TARGET,
} from "./helpers";

function cleanerDeps(
  api: SlackApi,
  options: {
    now?: () => number;
    readCurrent?: CleanerDeps["readCurrent"];
  } = {},
): CleanerDeps {
  return {
    api,
    limiter: immediateLimiter(),
    now: options.now ?? (() => 1000),
    readCurrent: options.readCurrent ?? (() => ({ target: URL_TARGET, context: TEST_CONTEXT })),
  };
}

function candidate(ts: string): ScanCandidate {
  return {
    channelId: PEER_TARGET.channelId,
    ts,
    authorUserId: TEST_SESSION.userId,
    subtype: null,
  };
}

function snapshot(
  candidates: readonly ScanCandidate[],
  options: { keepPinned?: boolean; expiresAtMs?: number } = {},
): ScanSnapshot {
  return {
    sessionTeamId: TEST_SESSION.teamId,
    sessionUserId: TEST_SESSION.userId,
    target: PEER_TARGET,
    filters: { mode: "all", keepPinned: options.keepPinned ?? false },
    candidates,
    exclusions: {
      foreignAuthor: 0,
      appOrBot: 0,
      unsupportedSubtype: 0,
      pinned: 0,
      outsideDateRange: 0,
    },
    scannedAtMs: 1000,
    expiresAtMs: options.expiresAtMs ?? 901_000,
    snapshotBoundaryTs: candidates[0]?.ts ?? null,
    pages: 1,
    threads: 0,
  };
}

describe("scan", () => {
  it("admits only own reviewed message shapes and freezes non-content evidence", async () => {
    const api = fakeApi({
      conversationsHistory: async () => ({
        messages: [
          { ts: "106.1", user: "UTEST01" },
          { ts: "105.1", user: "UTEST01", subtype: "file_share" },
          { ts: "104.1", user: "UPEER01" },
          { ts: "103.1", user: "UTEST01", bot_id: "BTEST01" },
          { ts: "102.1", user: "UTEST01", app_id: "ATEST01" },
          { ts: "101.1", user: "UTEST01", subtype: "channel_join" },
        ],
      }),
    });

    const result = await scan(
      TEST_SESSION,
      PEER_TARGET,
      { mode: "all", keepPinned: false },
      cleanerDeps(api),
    );

    expect(result.candidates).toEqual([
      { channelId: "DTEST01", ts: "106.1", authorUserId: "UTEST01", subtype: null },
      { channelId: "DTEST01", ts: "105.1", authorUserId: "UTEST01", subtype: "file_share" },
    ]);
    expect(result.exclusions).toEqual({
      foreignAuthor: 1,
      appOrBot: 2,
      unsupportedSubtype: 1,
      pinned: 0,
      outsideDateRange: 0,
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.candidates)).toBe(true);
  });

  it("uses the same own-author invariant for the verified self-DM", async () => {
    const api = fakeApi({
      conversationsInfo: async () => ({ id: "DTEST01", is_im: true, is_mpim: false, user: "UTEST01" }),
      conversationsHistory: async () => ({ messages: [
        { ts: "2.1", user: "UTEST01" },
        { ts: "1.1", user: "UOTHER1" },
      ] }),
    });
    const result = await scan(
      TEST_SESSION,
      SELF_TARGET,
      { mode: "all", keepPinned: false },
      cleanerDeps(api),
    );
    expect(result.candidates.map((item) => item.ts)).toEqual(["2.1"]);
  });

  it("finds an in-range reply under an older root without bounding history", async () => {
    const history = vi.fn(async () => ({
      messages: [{ ts: "100.1", user: "UPEER01", reply_count: 1 }],
    }));
    const api = fakeApi({
      conversationsHistory: history,
      conversationsReplies: async () => ({ messages: [
        { ts: "100.1", user: "UPEER01", reply_count: 1 },
        { ts: "250.25", user: "UTEST01", thread_ts: "100.1" },
      ] }),
    });

    const result = await scan(
      TEST_SESSION,
      PEER_TARGET,
      { mode: "custom", startSec: 200, endExclusiveSec: 300, keepPinned: false },
      cleanerDeps(api),
    );
    expect(history).toHaveBeenCalledWith("DTEST01", undefined, undefined);
    expect(result.candidates.map((item) => item.ts)).toEqual(["250.25"]);
  });

  it("fails closed when pin protection cannot be established", async () => {
    const api = fakeApi({
      pinsList: async () => {
        throw new SlackApiError("pins failed", { code: "not_allowed_token_type" });
      },
    });
    await expect(scan(
      TEST_SESSION,
      PEER_TARGET,
      { mode: "all", keepPinned: true },
      cleanerDeps(api),
    )).rejects.toMatchObject({ code: "not_allowed_token_type" });
  });

  it("excludes protected timestamps and sorts candidates newest first", async () => {
    const api = fakeApi({
      pinsList: async () => new Set(["2.1"]),
      conversationsHistory: async () => ({ messages: [
        { ts: "1.1", user: "UTEST01" },
        { ts: "3.1", user: "UTEST01" },
        { ts: "2.1", user: "UTEST01" },
      ] }),
    });
    const result = await scan(
      TEST_SESSION,
      PEER_TARGET,
      { mode: "all", keepPinned: true },
      cleanerDeps(api),
    );
    expect(result.candidates.map((item) => item.ts)).toEqual(["3.1", "1.1"]);
    expect(result.exclusions.pinned).toBe(1);
  });

  it("deduplicates messages returned by history and thread pagination", async () => {
    const duplicateReply = { ts: "2.1", user: "UTEST01", subtype: "thread_broadcast", thread_ts: "1.1" };
    const api = fakeApi({
      conversationsHistory: async () => ({
        messages: [
          { ts: "1.1", user: "UPEER01", reply_count: 1 },
          duplicateReply,
        ],
      }),
      conversationsReplies: async () => ({
        messages: [
          { ts: "1.1", user: "UPEER01", reply_count: 1 },
          duplicateReply,
        ],
      }),
    });

    const result = await scan(
      TEST_SESSION,
      PEER_TARGET,
      { mode: "all", keepPinned: false },
      cleanerDeps(api),
    );

    expect(result.candidates.map((item) => item.ts)).toEqual(["2.1"]);
    expect(result.exclusions.foreignAuthor).toBe(1);
    expect(result.pages).toBe(2);
  });

  it("fails closed when duplicate rows disagree on authorship evidence", async () => {
    const api = fakeApi({
      conversationsHistory: async () => ({
        messages: [
          { ts: "1.1", user: "UPEER01", reply_count: 1 },
          { ts: "2.1", user: "UTEST01", subtype: "thread_broadcast", thread_ts: "1.1" },
        ],
      }),
      conversationsReplies: async () => ({
        messages: [
          { ts: "1.1", user: "UPEER01", reply_count: 1 },
          { ts: "2.1", user: "UOTHER1", subtype: "thread_broadcast", thread_ts: "1.1" },
        ],
      }),
    });

    await expect(scan(
      TEST_SESSION,
      PEER_TARGET,
      { mode: "all", keepPinned: false },
      cleanerDeps(api),
    )).rejects.toThrow("conflicting authorship evidence");
  });

  it("fails closed on a repeated history cursor", async () => {
    const api = fakeApi({
      conversationsHistory: async () => ({ messages: [], nextCursor: "repeat" }),
    });

    await expect(scan(
      TEST_SESSION,
      PEER_TARGET,
      { mode: "all", keepPinned: false },
      cleanerDeps(api),
    )).rejects.toThrow("repeated conversations.history cursor");
  });

  it("fails closed on a repeated thread cursor", async () => {
    const api = fakeApi({
      conversationsHistory: async () => ({
        messages: [{ ts: "1.1", user: "UPEER01", reply_count: 1 }],
      }),
      conversationsReplies: async () => ({
        messages: [{ ts: "1.1", user: "UPEER01", reply_count: 1 }],
        nextCursor: "repeat",
      }),
    });

    await expect(scan(
      TEST_SESSION,
      PEER_TARGET,
      { mode: "all", keepPinned: false },
      cleanerDeps(api),
    )).rejects.toThrow("repeated conversations.replies cursor");
  });

});

describe("runDelete", () => {
  it("reports deleted and already-gone separately in newest-first order", async () => {
    const calls: string[] = [];
    const api = fakeApi({
      chatDelete: async (_channel, ts) => {
        calls.push(ts);
        return ts === "3.1" ? { status: "deleted" } : { status: "alreadyGone" };
      },
    });
    const result = await runDelete(
      snapshot([candidate("3.1"), candidate("2.1")]),
      TEST_SESSION,
      PEER_TARGET,
      cleanerDeps(api),
      () => {},
    );
    expect(calls).toEqual(["3.1", "2.1"]);
    expect(result).toMatchObject({
      terminal: "complete",
      progress: { deleted: 1, alreadyGone: 1, excluded: 0, remaining: 0 },
    });
  });

  it("makes zero delete calls after live URL drift", async () => {
    const chatDelete = vi.fn(async () => ({ status: "deleted" as const }));
    const api = fakeApi({ chatDelete });
    const result = await runDelete(
      snapshot([candidate("3.1")]),
      TEST_SESSION,
      PEER_TARGET,
      cleanerDeps(api, {
        readCurrent: () => ({
          target: { teamId: "TTEST01", channelId: "DOTHER1" },
          context: TEST_CONTEXT,
        }),
      }),
      () => {},
    );
    expect(result.terminal).toBe("failed-partial");
    expect(chatDelete).not.toHaveBeenCalled();
  });

  it("rejects a forged foreign-author candidate before mutation", async () => {
    const chatDelete = vi.fn(async () => ({ status: "deleted" as const }));
    const forged = { ...candidate("3.1"), authorUserId: "UOTHER1" };
    const result = await runDelete(
      snapshot([forged]),
      TEST_SESSION,
      PEER_TARGET,
      cleanerDeps(fakeApi({ chatDelete })),
      () => {},
    );
    expect(result.terminal).toBe("failed-partial");
    expect(chatDelete).not.toHaveBeenCalled();
  });

  it("rejects a forged malformed timestamp before mutation", async () => {
    const chatDelete = vi.fn(async () => ({ status: "deleted" as const }));
    const result = await runDelete(
      snapshot([{ ...candidate("3.1"), ts: "1e3" }]),
      TEST_SESSION,
      PEER_TARGET,
      cleanerDeps(fakeApi({ chatDelete })),
      () => {},
    );
    expect(result.terminal).toBe("failed-partial");
    expect(chatDelete).not.toHaveBeenCalled();
  });

  it("refreshes session, target, and pins after 100 deletion calls", async () => {
    const authTest = vi.fn(fakeApi().authTest);
    const conversationsInfo = vi.fn(fakeApi().conversationsInfo);
    const pinsList = vi.fn()
      .mockResolvedValueOnce(new Set<string>())
      .mockResolvedValue(new Set([candidate("100.1").ts]));
    const api = fakeApi({ authTest, conversationsInfo, pinsList });
    const candidates = Array.from({ length: 101 }, (_, index) => candidate(`${200 - index}.1`));

    const result = await runDelete(
      snapshot(candidates, { keepPinned: true }),
      TEST_SESSION,
      PEER_TARGET,
      cleanerDeps(api),
      () => {},
    );
    expect(result).toMatchObject({ terminal: "complete", progress: { deleted: 100, excluded: 1 } });
    expect(authTest).toHaveBeenCalledTimes(2);
    expect(conversationsInfo).toHaveBeenCalledTimes(2);
    expect(pinsList).toHaveBeenCalledTimes(2);
  });

  it("halts failed-partial after three identical terminal delete errors", async () => {
    const chatDelete = vi.fn(async () => {
      throw new SlackApiError("cannot delete", { code: "cant_delete_message" });
    });
    const result = await runDelete(
      snapshot([candidate("4.1"), candidate("3.1"), candidate("2.1"), candidate("1.1")]),
      TEST_SESSION,
      PEER_TARGET,
      cleanerDeps(fakeApi({ chatDelete })),
      () => {},
    );
    expect(result).toMatchObject({
      terminal: "failed-partial",
      progress: { excluded: 3, remaining: 1, lastErrorCode: "cant_delete_message" },
    });
    expect(chatDelete).toHaveBeenCalledTimes(3);
  });

  it("halts immediately on policy uncertainty", async () => {
    const api = fakeApi({
      chatDelete: async () => {
        throw new SlackApiError("policy", { code: "compliance_exports_enabled" });
      },
    });
    const result = await runDelete(
      snapshot([candidate("2.1"), candidate("1.1")]),
      TEST_SESSION,
      PEER_TARGET,
      cleanerDeps(api),
      () => {},
    );
    expect(result).toMatchObject({
      terminal: "failed-partial",
      progress: { deleted: 0, remaining: 2, lastErrorCode: "compliance_exports_enabled" },
    });
  });

  it("blocks an expired preview before any mutation", async () => {
    const chatDelete = vi.fn(async () => ({ status: "deleted" as const }));
    const result = await runDelete(
      snapshot([candidate("1.1")], { expiresAtMs: 999 }),
      TEST_SESSION,
      PEER_TARGET,
      cleanerDeps(fakeApi({ chatDelete }), { now: () => 1000 }),
      () => {},
    );
    expect(result).toMatchObject({
      terminal: "failed-partial",
      progress: { remaining: 1, lastErrorCode: "verification_failed" },
    });
    expect(chatDelete).not.toHaveBeenCalled();
  });

  it("returns stopped without mutation when already aborted", async () => {
    const chatDelete = vi.fn(async () => ({ status: "deleted" as const }));
    const abort = new AbortController();
    abort.abort();
    const result = await runDelete(
      snapshot([candidate("1.1")]),
      TEST_SESSION,
      PEER_TARGET,
      cleanerDeps(fakeApi({ chatDelete })),
      () => {},
      abort.signal,
    );
    expect(result.terminal).toBe("stopped");
    expect(chatDelete).not.toHaveBeenCalled();
  });
});
