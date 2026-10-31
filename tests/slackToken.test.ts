import { describe, expect, it } from "vitest";
import {
  parseSlackTarget,
  readSlackContext,
  SessionVerificationError,
  UnsupportedGridError,
} from "../src/lib/slackToken";
import { URL_TARGET } from "./helpers";

function fakeWindow(config: unknown, pathname = "/client/TTEST01/DTEST01") {
  const stored = config === null ? null : JSON.stringify(config);
  return {
    localStorage: {
      getItem: (key: string) => key === "localConfig_v2" ? stored : null,
    },
    location: { origin: "https://app.slack.com", pathname },
  };
}

describe("parseSlackTarget", () => {
  it("binds the workspace and DM from the exact client URL", () => {
    expect(parseSlackTarget("/client/TTEST01/DTEST01/thread/123")).toEqual(URL_TARGET);
  });

  it.each([
    "/client/TTEST01/CTEST01",
    "/client/TTEST01/GTEST01",
    "/client/TTEST01",
    "/archives/DTEST01",
    "/foo/client/TTEST01/DTEST01",
  ])("rejects unsupported or incomplete paths: %s", (pathname) => {
    expect(() => parseSlackTarget(pathname)).toThrow(SessionVerificationError);
  });

  it("rejects Enterprise Grid URLs without a fallback", () => {
    expect(() => parseSlackTarget("/client/ETEST01/DTEST01")).toThrow(UnsupportedGridError);
  });
});

describe("readSlackContext", () => {
  it("uses only the team entry bound to the URL", () => {
    const win = fakeWindow({
      lastActiveTeamId: "TOTHER1",
      teams: {
        TOTHER1: { token: "other-synthetic-session", user_id: "UOTHER1" },
        TTEST01: { token: "synthetic-session-value", user_id: "UTEST01" },
      },
    });
    expect(readSlackContext(URL_TARGET, win)).toEqual({
      token: "synthetic-session-value",
      userId: "UTEST01",
      teamId: "TTEST01",
      apiBase: "https://app.slack.com",
    });
  });

  it.each([
    { teams: { TTEST01: { user_id: "UTEST01" } } },
    { teams: { TTEST01: { token: "synthetic-session-value" } } },
    { teams: { TOTHER1: { token: "other-synthetic-session", user_id: "UOTHER1" } } },
  ])("rejects missing token, user, or matching team", (config) => {
    expect(() => readSlackContext(URL_TARGET, fakeWindow(config))).toThrow(SessionVerificationError);
  });

  it("rejects a non-object local session payload", () => {
    const win = fakeWindow({});
    win.localStorage.getItem = () => "null";
    expect(() => readSlackContext(URL_TARGET, win)).toThrow(SessionVerificationError);
  });

  it("rejects a non-Slack origin", () => {
    const win = fakeWindow({ teams: { TTEST01: { token: "x", user_id: "u" } } });
    win.location.origin = "https://example.invalid";
    expect(() => readSlackContext(URL_TARGET, win)).toThrow(/only on https:\/\/app\.slack\.com/);
  });
});
