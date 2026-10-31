import type { SlackApi } from "./slackApi";
import type { RateLimiter } from "./rateLimiter";
import type { SlackContext, UrlTarget, VerifiedSession, VerifiedTarget } from "./types";

export class VerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VerificationError";
  }
}

export async function verifySession(
  context: SlackContext,
  api: SlackApi,
  limiter: RateLimiter,
  signal?: AbortSignal,
): Promise<VerifiedSession> {
  const auth = await limiter.execute(() => api.authTest(signal), signal);
  if (auth.teamId !== context.teamId || auth.userId !== context.userId) {
    throw new VerificationError("The authenticated Slack workspace or user does not match the current URL session.");
  }
  return {
    ...context,
    workspaceName: auth.workspaceName,
    userName: auth.userName,
  };
}

export async function verifyTarget(
  urlTarget: UrlTarget,
  session: VerifiedSession,
  api: SlackApi,
  limiter: RateLimiter,
  signal?: AbortSignal,
): Promise<VerifiedTarget> {
  if (urlTarget.teamId !== session.teamId) {
    throw new VerificationError("The current Slack URL moved to a different workspace.");
  }

  const channel = await limiter.execute(
    () => api.conversationsInfo(urlTarget.channelId, signal),
    signal,
  );
  if (
    channel.id !== urlTarget.channelId
    || channel.is_im !== true
    || channel.is_mpim === true
    || channel.user.length === 0
  ) {
    throw new VerificationError("The open conversation is not a verified one-to-one direct message.");
  }

  if (channel.user === session.userId) {
    return {
      channelId: channel.id,
      peerUserId: channel.user,
      kind: "self",
      label: "Your self-DM (notes to yourself)",
    };
  }

  const user = await limiter.execute(() => api.usersInfo(channel.user, signal), signal);
  if (user.id !== channel.user) {
    throw new VerificationError("The direct-message participant could not be verified.");
  }
  const displayName = user.profile?.display_name
    || user.profile?.real_name
    || user.real_name
    || user.name;
  if (!displayName) {
    throw new VerificationError("The direct-message participant has no verified display name.");
  }
  return {
    channelId: channel.id,
    peerUserId: channel.user,
    kind: "peer",
    label: `DM with ${displayName}`,
  };
}

export function assertFrozenContext(
  liveUrl: UrlTarget,
  session: VerifiedSession,
  target: VerifiedTarget,
): void {
  if (liveUrl.teamId !== session.teamId || liveUrl.channelId !== target.channelId) {
    throw new VerificationError("Slack navigation changed the verified direct message. The operation was stopped.");
  }
}

export function assertSameVerifiedSession(
  expectedTeamId: string,
  expectedUserId: string,
  actual: VerifiedSession,
): void {
  if (actual.teamId !== expectedTeamId || actual.userId !== expectedUserId) {
    throw new VerificationError("The authenticated Slack workspace or user changed after the scan.");
  }
}

export function assertSameVerifiedTarget(
  expected: VerifiedTarget,
  actual: VerifiedTarget,
): void {
  if (
    actual.channelId !== expected.channelId
    || actual.peerUserId !== expected.peerUserId
    || actual.kind !== expected.kind
  ) {
    throw new VerificationError("The verified direct-message target changed after the scan.");
  }
}
