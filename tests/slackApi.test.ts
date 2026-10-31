import { describe, expect, it, vi } from "vitest";
import { createSlackApi, SlackApiError } from "../src/lib/slackApi";
import { RateLimiter } from "../src/lib/rateLimiter";
import { TEST_CONTEXT } from "./helpers";

function jsonResponse(value: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

describe("createSlackApi", () => {
  it("posts to app.slack.com with the in-memory session and parses a history page", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      ok: true,
      messages: [{ ts: "101.25", user: "UTEST01", subtype: "file_share" }],
      response_metadata: { next_cursor: "next" },
    }));
    const page = await createSlackApi(TEST_CONTEXT, fetchMock as unknown as typeof fetch)
      .conversationsHistory("DTEST01");

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://app.slack.com/api/conversations.history");
    expect(init.credentials).toBe("include");
    expect(String(init.body)).toContain("token=synthetic-session-value");
    expect(page).toEqual({
      messages: [{
        ts: "101.25",
        user: "UTEST01",
        subtype: "file_share",
        thread_ts: undefined,
        reply_count: undefined,
        bot_id: undefined,
        app_id: undefined,
      }],
      nextCursor: "next",
    });
  });

  it("surfaces Slack ok:false responses without retrying inside the API client", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ ok: false, error: "invalid_auth" }));
    const api = createSlackApi(TEST_CONTEXT, fetchMock as unknown as typeof fetch);
    await expect(api.authTest()).rejects.toMatchObject({ code: "invalid_auth" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("surfaces Retry-After for the shared limiter", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(
      { ok: false, error: "ratelimited" },
      { status: 429, headers: { "Retry-After": "3" } },
    ));
    const api = createSlackApi(TEST_CONTEXT, fetchMock as unknown as typeof fetch);
    await expect(api.authTest()).rejects.toMatchObject({
      code: "ratelimited",
      retryable: true,
      retryAfterMs: 3000,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries a transient Slack server failure through the shared limiter", async () => {
    const responses = [
      jsonResponse({}, { status: 503 }),
      jsonResponse({
        ok: true,
        team_id: "TTEST01",
        user_id: "UTEST01",
        team: "Example Workspace",
        user: "Example User",
      }),
    ];
    const fetchMock = vi.fn(async () => responses.shift()!);
    const sleep = vi.fn(async () => {});
    const api = createSlackApi(TEST_CONTEXT, fetchMock as unknown as typeof fetch);
    const limiter = new RateLimiter({ minIntervalMs: 0, sleep });

    await expect(limiter.execute(() => api.authTest())).resolves.toMatchObject({
      teamId: "TTEST01",
      userId: "UTEST01",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(1000, undefined);
  });

  it.each([
    new Response("not json", { status: 200 }),
    jsonResponse({ ok: true }),
    jsonResponse({ ok: true, messages: [{ user: "UTEST01" }] }),
  ])("rejects malformed history responses", async (response) => {
    const api = createSlackApi(TEST_CONTEXT, vi.fn(async () => response) as unknown as typeof fetch);
    await expect(api.conversationsHistory("DTEST01")).rejects.toBeInstanceOf(SlackApiError);
  });

  it("parses auth, IM target, user, and pins with required shapes", async () => {
    const responses = [
      { ok: true, team_id: "TTEST01", user_id: "UTEST01", team: "Example Workspace", user: "Example User" },
      { ok: true, channel: { id: "DTEST01", is_im: true, is_mpim: false, user: "UPEER01" } },
      { ok: true, user: { id: "UPEER01", profile: { display_name: "Example Peer" } } },
      { ok: true, items: [{ type: "message", message: { ts: "100.1" } }, { type: "file" }] },
    ];
    const fetchMock = vi.fn(async () => jsonResponse(responses.shift()));
    const api = createSlackApi(TEST_CONTEXT, fetchMock as unknown as typeof fetch);

    await expect(api.authTest()).resolves.toMatchObject({ teamId: "TTEST01", userId: "UTEST01" });
    await expect(api.conversationsInfo("DTEST01")).resolves.toMatchObject({ id: "DTEST01", is_im: true });
    await expect(api.usersInfo("UPEER01")).resolves.toMatchObject({ id: "UPEER01" });
    await expect(api.pinsList("DTEST01")).resolves.toEqual(new Set(["100.1"]));
  });

  it("rejects malformed conversation flags", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      ok: true,
      channel: { id: "DTEST01", is_im: "true", is_mpim: false, user: "UPEER01" },
    }));
    const api = createSlackApi(TEST_CONTEXT, fetchMock as unknown as typeof fetch);

    await expect(api.conversationsInfo("DTEST01")).rejects.toMatchObject({ code: "malformed_response" });
  });

  it("fails closed when a message pin has no valid timestamp", async () => {
    const fetchMock = vi.fn(async () => (
      jsonResponse({ ok: true, items: [{ type: "message", message: {} }] })
    ));
    const api = createSlackApi(TEST_CONTEXT, fetchMock as unknown as typeof fetch);

    await expect(api.pinsList("DTEST01")).rejects.toMatchObject({ code: "malformed_response" });
  });

  it("distinguishes already-gone from a confirmed deletion", async () => {
    const responses = [
      { ok: false, error: "message_not_found" },
      { ok: true },
    ];
    const fetchMock = vi.fn(async () => jsonResponse(responses.shift()));
    const api = createSlackApi(TEST_CONTEXT, fetchMock as unknown as typeof fetch);
    await expect(api.chatDelete("DTEST01", "100.1")).resolves.toEqual({ status: "alreadyGone" });
    await expect(api.chatDelete("DTEST01", "100.2")).resolves.toEqual({ status: "deleted" });
  });
});
