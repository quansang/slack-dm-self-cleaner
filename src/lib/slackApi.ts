import type { SlackContext, SlackMessage } from "./types";
import { isSlackTimestamp } from "./slackTimestamp";

export interface HistoryPage {
  messages: SlackMessage[];
  nextCursor?: string;
}

export interface AuthTestResult {
  teamId: string;
  userId: string;
  workspaceName: string;
  userName: string;
}

export interface ConversationInfo {
  id: string;
  is_im: boolean;
  is_mpim: boolean;
  user: string;
}

export interface UserInfo {
  id: string;
  name?: string;
  real_name?: string;
  profile?: { display_name?: string; real_name?: string };
}

export type ChatDeleteOutcome = { status: "deleted" } | { status: "alreadyGone" };

export class SlackApiError extends Error {
  readonly code: string;
  readonly httpStatus?: number;
  readonly retryAfterMs?: number;
  readonly retryable: boolean;

  constructor(
    message: string,
    options: {
      code: string;
      httpStatus?: number;
      retryAfterMs?: number;
      retryable?: boolean;
    },
  ) {
    super(message);
    this.name = "SlackApiError";
    this.code = options.code;
    this.httpStatus = options.httpStatus;
    this.retryAfterMs = options.retryAfterMs;
    this.retryable = options.retryable ?? false;
  }
}

export interface SlackApi {
  authTest(signal?: AbortSignal): Promise<AuthTestResult>;
  conversationsHistory(channel: string, cursor?: string, signal?: AbortSignal): Promise<HistoryPage>;
  conversationsReplies(channel: string, ts: string, cursor?: string, signal?: AbortSignal): Promise<HistoryPage>;
  conversationsInfo(channel: string, signal?: AbortSignal): Promise<ConversationInfo>;
  usersInfo(user: string, signal?: AbortSignal): Promise<UserInfo>;
  pinsList(channel: string, signal?: AbortSignal): Promise<Set<string>>;
  chatDelete(channel: string, ts: string, signal?: AbortSignal): Promise<ChatDeleteOutcome>;
}

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function requiredString(value: unknown, method: string, field: string): string {
  const parsed = optionalString(value);
  if (!parsed) {
    throw new SlackApiError(`${method} returned an invalid ${field}.`, { code: "malformed_response" });
  }
  return parsed;
}

function requiredTimestamp(value: unknown, method: string, field: string): string {
  const parsed = requiredString(value, method, field);
  if (!isSlackTimestamp(parsed)) {
    throw new SlackApiError(`${method} returned an invalid ${field}.`, { code: "malformed_response" });
  }
  return parsed;
}

function retryAfterMs(response: Response): number {
  const value = response.headers.get("Retry-After");
  if (value === null) return 1000;
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : 1000;
}

export function createSlackApi(ctx: SlackContext, fetchImpl: typeof fetch = fetch): SlackApi {
  async function post(method: string, params: Record<string, string>, signal?: AbortSignal): Promise<JsonObject> {
    const body = new URLSearchParams({ token: ctx.token, ...params });
    let response: Response;
    try {
      response = await fetchImpl(`${ctx.apiBase}/api/${method}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
        signal,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      throw new SlackApiError(`${method} could not reach Slack.`, {
        code: "network_error",
        retryable: true,
      });
    }

    if (response.status === 429) {
      throw new SlackApiError(`${method} was rate limited.`, {
        code: "ratelimited",
        httpStatus: 429,
        retryAfterMs: retryAfterMs(response),
        retryable: true,
      });
    }
    if (response.status >= 500) {
      throw new SlackApiError(`${method} returned HTTP ${response.status}.`, {
        code: "server_error",
        httpStatus: response.status,
        retryAfterMs: retryAfterMs(response),
        retryable: true,
      });
    }
    if (!response.ok) {
      throw new SlackApiError(`${method} returned HTTP ${response.status}.`, {
        code: "http_error",
        httpStatus: response.status,
      });
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch {
      throw new SlackApiError(`${method} returned non-JSON data.`, { code: "malformed_response" });
    }
    if (!isObject(json)) {
      throw new SlackApiError(`${method} returned an invalid response.`, { code: "malformed_response" });
    }
    if (json.ok !== true) {
      const code = optionalString(json.error) ?? "unknown_slack_error";
      throw new SlackApiError(`${method} failed with ${code}.`, { code });
    }
    return json;
  }

  function parseMessage(value: unknown, method: string): SlackMessage {
    if (!isObject(value)) {
      throw new SlackApiError(`${method} returned an invalid message.`, { code: "malformed_response" });
    }
    const ts = requiredTimestamp(value.ts, method, "message timestamp");
    const replyCount = value.reply_count;
    if (replyCount !== undefined && (
      typeof replyCount !== "number"
      || !Number.isInteger(replyCount)
      || replyCount < 0
    )) {
      throw new SlackApiError(`${method} returned an invalid reply count.`, { code: "malformed_response" });
    }
    return {
      ts,
      user: optionalString(value.user),
      subtype: optionalString(value.subtype),
      thread_ts: optionalString(value.thread_ts),
      reply_count: replyCount as number | undefined,
      bot_id: optionalString(value.bot_id),
      app_id: optionalString(value.app_id),
    };
  }

  function parsePage(json: JsonObject, method: string): HistoryPage {
    if (!Array.isArray(json.messages)) {
      throw new SlackApiError(`${method} returned no message list.`, { code: "malformed_response" });
    }
    const metadata = json.response_metadata;
    if (metadata !== undefined && !isObject(metadata)) {
      throw new SlackApiError(`${method} returned invalid pagination metadata.`, { code: "malformed_response" });
    }
    return {
      messages: json.messages.map((message) => parseMessage(message, method)),
      nextCursor: metadata && optionalString(metadata.next_cursor),
    };
  }

  return {
    async authTest(signal) {
      const json = await post("auth.test", {}, signal);
      return {
        teamId: requiredString(json.team_id, "auth.test", "workspace ID"),
        userId: requiredString(json.user_id, "auth.test", "user ID"),
        workspaceName: requiredString(json.team, "auth.test", "workspace name"),
        userName: requiredString(json.user, "auth.test", "user name"),
      };
    },

    async conversationsHistory(channel, cursor, signal) {
      const params: Record<string, string> = { channel, limit: "200" };
      if (cursor) params.cursor = cursor;
      return parsePage(await post("conversations.history", params, signal), "conversations.history");
    },

    async conversationsReplies(channel, ts, cursor, signal) {
      const params: Record<string, string> = { channel, ts, limit: "200" };
      if (cursor) params.cursor = cursor;
      return parsePage(await post("conversations.replies", params, signal), "conversations.replies");
    },

    async conversationsInfo(channel, signal) {
      const json = await post("conversations.info", { channel }, signal);
      if (!isObject(json.channel)) {
        throw new SlackApiError("conversations.info returned no conversation.", { code: "malformed_response" });
      }
      const isIm = json.channel.is_im;
      const isMpim = json.channel.is_mpim;
      if (
        typeof isIm !== "boolean"
        || (isMpim !== undefined && typeof isMpim !== "boolean")
      ) {
        throw new SlackApiError("conversations.info returned invalid conversation flags.", {
          code: "malformed_response",
        });
      }
      return {
        id: requiredString(json.channel.id, "conversations.info", "conversation ID"),
        is_im: isIm,
        is_mpim: isMpim === true,
        user: requiredString(json.channel.user, "conversations.info", "DM user"),
      };
    },

    async usersInfo(user, signal) {
      const json = await post("users.info", { user }, signal);
      if (!isObject(json.user)) {
        throw new SlackApiError("users.info returned no user.", { code: "malformed_response" });
      }
      const profile = isObject(json.user.profile)
        ? {
            display_name: optionalString(json.user.profile.display_name),
            real_name: optionalString(json.user.profile.real_name),
          }
        : undefined;
      return {
        id: requiredString(json.user.id, "users.info", "user ID"),
        name: optionalString(json.user.name),
        real_name: optionalString(json.user.real_name),
        profile,
      };
    },

    async pinsList(channel, signal) {
      const json = await post("pins.list", { channel }, signal);
      if (!Array.isArray(json.items)) {
        throw new SlackApiError("pins.list returned no item list.", { code: "malformed_response" });
      }
      const pins = new Set<string>();
      for (const item of json.items) {
        if (!isObject(item)) {
          throw new SlackApiError("pins.list returned an invalid item.", { code: "malformed_response" });
        }
        if (item.type === "file" || item.type === "file_comment") continue;
        if (item.type !== "message") {
          throw new SlackApiError("pins.list returned an unknown item type.", { code: "malformed_response" });
        }
        if (!isObject(item.message)) {
          throw new SlackApiError("pins.list returned an invalid message pin.", { code: "malformed_response" });
        }
        pins.add(requiredTimestamp(item.message.ts, "pins.list", "pinned message timestamp"));
      }
      return pins;
    },

    async chatDelete(channel, ts, signal) {
      try {
        await post("chat.delete", { channel, ts }, signal);
        return { status: "deleted" };
      } catch (error) {
        if (error instanceof SlackApiError && error.code === "message_not_found") {
          return { status: "alreadyGone" };
        }
        throw error;
      }
    },
  };
}
