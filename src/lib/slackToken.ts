import type { SlackContext, UrlTarget } from "./types";

export class SessionVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SessionVerificationError";
  }
}

export class UnsupportedGridError extends SessionVerificationError {
  constructor() {
    super("Enterprise Grid URLs are not supported in this release.");
    this.name = "UnsupportedGridError";
  }
}

interface MinimalWindow {
  localStorage: Pick<Storage, "getItem">;
  location: { origin: string; pathname: string };
}

const TEAM_ID = /^T[A-Z0-9]{5,}$/;
const GRID_ID = /^E[A-Z0-9]{5,}$/;
const DM_ID = /^D[A-Z0-9]{5,}$/;

export function parseSlackTarget(pathname: string): UrlTarget {
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] !== "client" || segments.length < 3) {
    throw new SessionVerificationError("Open the intended direct message in Slack first.");
  }

  const teamId = segments[1];
  const channelId = segments[2];
  if (GRID_ID.test(teamId)) throw new UnsupportedGridError();
  if (!TEAM_ID.test(teamId)) {
    throw new SessionVerificationError("The Slack workspace in the current URL could not be verified.");
  }
  if (!DM_ID.test(channelId)) {
    throw new SessionVerificationError("Only the currently open one-to-one direct message is supported.");
  }
  return { teamId, channelId };
}

export function readSlackContext(
  target: UrlTarget,
  win: MinimalWindow = window,
): SlackContext {
  if (win.location.origin !== "https://app.slack.com") {
    throw new SessionVerificationError("This extension runs only on https://app.slack.com.");
  }

  const raw = win.localStorage.getItem("localConfig_v2");
  if (!raw) throw new SessionVerificationError("Open and log into Slack first.");

  let config: unknown;
  try {
    config = JSON.parse(raw);
  } catch {
    throw new SessionVerificationError("Could not read the Slack session. Reload Slack and try again.");
  }

  if (typeof config !== "object" || config === null || Array.isArray(config)) {
    throw new SessionVerificationError("Could not read the Slack session. Reload Slack and try again.");
  }
  const teamsValue = "teams" in config ? config.teams : undefined;
  // The runtime object check permits dictionary lookup by the verified workspace ID.
  const teams = typeof teamsValue === "object" && teamsValue !== null && !Array.isArray(teamsValue)
    ? teamsValue as Record<string, unknown>
    : undefined;
  const teamValue = teams?.[target.teamId];
  const team = typeof teamValue === "object" && teamValue !== null && !Array.isArray(teamValue)
    ? teamValue
    : undefined;
  const tokenValue = team && "token" in team ? team.token : undefined;
  const userIdValue = team && "user_id" in team ? team.user_id : undefined;
  const token = typeof tokenValue === "string" ? tokenValue.trim() : "";
  const userId = typeof userIdValue === "string" ? userIdValue.trim() : "";
  if (!token || !userId) {
    throw new SessionVerificationError("No complete session exists for the workspace in the current URL.");
  }

  return {
    token,
    userId,
    teamId: target.teamId,
    apiBase: "https://app.slack.com",
  };
}

export function readCurrentSlackContext(win: MinimalWindow = window): {
  target: UrlTarget;
  context: SlackContext;
} {
  const target = parseSlackTarget(win.location.pathname);
  return { target, context: readSlackContext(target, win) };
}
