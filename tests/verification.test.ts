import { describe, expect, it } from "vitest";
import { verifySession, verifyTarget, VerificationError } from "../src/lib/verification";
import {
  fakeApi,
  immediateLimiter,
  SELF_TARGET,
  TEST_CONTEXT,
  TEST_SESSION,
  URL_TARGET,
} from "./helpers";

describe("verified Slack context", () => {
  it("constructs a session only when auth.test agrees with local team and user", async () => {
    await expect(verifySession(TEST_CONTEXT, fakeApi(), immediateLimiter())).resolves.toEqual(TEST_SESSION);

    const wrongUser = fakeApi({
      authTest: async () => ({
        teamId: TEST_CONTEXT.teamId,
        userId: "UOTHER1",
        workspaceName: "Example Workspace",
        userName: "Other User",
      }),
    });
    await expect(verifySession(TEST_CONTEXT, wrongUser, immediateLimiter())).rejects.toBeInstanceOf(VerificationError);
  });

  it("classifies the documented peer-DM shape", async () => {
    await expect(verifyTarget(
      URL_TARGET,
      TEST_SESSION,
      fakeApi(),
      immediateLimiter(),
    )).resolves.toMatchObject({ kind: "peer", peerUserId: "UPEER01", label: "DM with Example Peer" });
  });

  it("classifies self-DM only when the verified IM user equals auth.test user", async () => {
    const api = fakeApi({
      conversationsInfo: async () => ({
        id: URL_TARGET.channelId,
        is_im: true,
        is_mpim: false,
        user: TEST_SESSION.userId,
      }),
    });
    await expect(verifyTarget(URL_TARGET, TEST_SESSION, api, immediateLimiter())).resolves.toEqual(SELF_TARGET);
  });

  it.each([
    { id: "DOTHER1", is_im: true, is_mpim: false, user: "UPEER01" },
    { id: "DTEST01", is_im: false, is_mpim: false, user: "UPEER01" },
    { id: "DTEST01", is_im: true, is_mpim: true, user: "UPEER01" },
  ])("rejects a D-prefixed target without the exact IM contract", async (channel) => {
    const api = fakeApi({ conversationsInfo: async () => channel });
    await expect(verifyTarget(URL_TARGET, TEST_SESSION, api, immediateLimiter())).rejects.toBeInstanceOf(VerificationError);
  });
});
