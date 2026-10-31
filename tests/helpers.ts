import type { SlackApi } from "../src/lib/slackApi";
import { RateLimiter } from "../src/lib/rateLimiter";
import type {
  SlackContext,
  UrlTarget,
  VerifiedSession,
  VerifiedTarget,
} from "../src/lib/types";

export const URL_TARGET: UrlTarget = { teamId: "TTEST01", channelId: "DTEST01" };
export const TEST_CONTEXT: SlackContext = {
  token: "synthetic-session-value",
  userId: "UTEST01",
  teamId: "TTEST01",
  apiBase: "https://app.slack.com",
};
export const TEST_SESSION: VerifiedSession = {
  ...TEST_CONTEXT,
  workspaceName: "Example Workspace",
  userName: "Example User",
};
export const PEER_TARGET: VerifiedTarget = {
  channelId: "DTEST01",
  peerUserId: "UPEER01",
  kind: "peer",
  label: "DM with Example Peer",
};
export const SELF_TARGET: VerifiedTarget = {
  channelId: "DTEST01",
  peerUserId: "UTEST01",
  kind: "self",
  label: "Your self-DM (notes to yourself)",
};

export function fakeApi(overrides: Partial<SlackApi> = {}): SlackApi {
  return {
    authTest: async () => ({
      teamId: TEST_CONTEXT.teamId,
      userId: TEST_CONTEXT.userId,
      workspaceName: "Example Workspace",
      userName: "Example User",
    }),
    conversationsHistory: async () => ({ messages: [] }),
    conversationsReplies: async () => ({ messages: [] }),
    conversationsInfo: async () => ({
      id: PEER_TARGET.channelId,
      is_im: true,
      is_mpim: false,
      user: PEER_TARGET.peerUserId,
    }),
    usersInfo: async () => ({
      id: PEER_TARGET.peerUserId,
      profile: { display_name: "Example Peer" },
    }),
    pinsList: async () => new Set<string>(),
    chatDelete: async () => ({ status: "deleted" }),
    ...overrides,
  };
}

export function immediateLimiter(): RateLimiter {
  return new RateLimiter({
    minIntervalMs: 0,
    maxAttempts: 3,
    sleep: async () => {},
  });
}
