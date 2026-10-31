import { describe, expect, it } from "vitest";
import { initialState, reduce } from "../src/lib/panelState";
import type { ScanSnapshot } from "../src/lib/types";
import { PEER_TARGET, TEST_SESSION } from "./helpers";

const SNAPSHOT: ScanSnapshot = {
  sessionTeamId: TEST_SESSION.teamId,
  sessionUserId: TEST_SESSION.userId,
  target: PEER_TARGET,
  filters: { mode: "all", keepPinned: true },
  candidates: [{ channelId: "DTEST01", ts: "1.1", authorUserId: "UTEST01", subtype: null }],
  exclusions: { foreignAuthor: 0, appOrBot: 0, unsupportedSubtype: 0, pinned: 0, outsideDateRange: 0 },
  scannedAtMs: 1000,
  expiresAtMs: 901_000,
  snapshotBoundaryTs: "1.1",
  pages: 1,
  threads: 0,
};

describe("panel reducer", () => {
  it("follows idle to scan to immutable preview to complete", () => {
    const idle = reduce(initialState, { type: "VERIFIED", session: TEST_SESSION, target: PEER_TARGET });
    const scanning = reduce(idle, { type: "SCAN_START" });
    const preview = reduce(scanning, {
      type: "SCAN_DONE",
      snapshot: SNAPSHOT,
      session: TEST_SESSION,
      target: PEER_TARGET,
    });
    const confirmed = reduce(preview, { type: "SET_CONFIRMED", value: true });
    const running = reduce(confirmed, { type: "RUN_START" });
    const complete = reduce(running, {
      type: "RUN_RESULT",
      result: {
        terminal: "complete",
        progress: {
          deleted: 1,
          alreadyGone: 0,
          excluded: 0,
          remaining: 0,
          total: 1,
          ratePerMin: 10,
          elapsedMs: 6000,
        },
      },
    });

    expect([idle.status, scanning.status, preview.status, running.status, complete.status]).toEqual([
      "idle", "scanning", "preview", "running", "complete",
    ]);
  });

  it("rejects delete before preview confirmation and rejects a second scan while scanning", () => {
    const idle = reduce(initialState, { type: "VERIFIED", session: TEST_SESSION, target: PEER_TARGET });
    expect(reduce(idle, { type: "RUN_START" })).toBe(idle);
    const scanning = reduce(idle, { type: "SCAN_START" });
    expect(reduce(scanning, { type: "SCAN_START" })).toBe(scanning);
  });

  it("invalidates preview when scope, dates, or pin policy changes", () => {
    const idle = reduce(initialState, { type: "VERIFIED", session: TEST_SESSION, target: PEER_TARGET });
    const scanning = reduce(idle, { type: "SCAN_START" });
    const preview = reduce(scanning, {
      type: "SCAN_DONE",
      snapshot: SNAPSHOT,
      session: TEST_SESSION,
      target: PEER_TARGET,
    });
    const changed = reduce(preview, { type: "SET_KEEP_PINNED", value: false });
    expect(changed.status).toBe("idle");
    expect(changed.snapshot).toBeUndefined();
    expect(changed.confirmed).toBe(false);
  });

  it("distinguishes stopped and failed-partial terminal states", () => {
    const scanning = reduce(
      reduce(initialState, { type: "VERIFIED", session: TEST_SESSION, target: PEER_TARGET }),
      { type: "SCAN_START" },
    );
    expect(reduce(scanning, { type: "SCAN_STOPPED" }).status).toBe("stopped");

    const preview = reduce(scanning, {
      type: "SCAN_DONE",
      snapshot: SNAPSHOT,
      session: TEST_SESSION,
      target: PEER_TARGET,
    });
    const running = reduce(
      reduce(preview, { type: "SET_CONFIRMED", value: true }),
      { type: "RUN_START" },
    );
    const failed = reduce(running, {
      type: "RUN_RESULT",
      result: {
        terminal: "failed-partial",
        message: "policy",
        progress: {
          deleted: 0,
          alreadyGone: 0,
          excluded: 0,
          remaining: 1,
          total: 1,
          ratePerMin: 0,
          elapsedMs: 1,
        },
      },
    });
    expect(failed.status).toBe("failed-partial");
    expect(failed.message).toBe("policy");
  });
});
