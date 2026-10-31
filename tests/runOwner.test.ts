import { describe, expect, it } from "vitest";
import { OperationAbortedError } from "../src/lib/rateLimiter";
import {
  ExtensionInvalidatedError,
  MissingPreviewError,
  OperationBusyError,
  RunOwner,
} from "../src/lib/runOwner";
import { fakeApi, immediateLimiter, TEST_CONTEXT, URL_TARGET } from "./helpers";

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function ownerWithApi(api = fakeApi()): RunOwner {
  return new RunOwner({
    readCurrent: () => ({ target: URL_TARGET, context: TEST_CONTEXT }),
    apiFactory: () => api,
    limiter: immediateLimiter(),
    isExtensionValid: () => true,
  });
}

describe("RunOwner", () => {
  it("rejects a second operation while verification is in flight", async () => {
    const auth = deferred<{
      teamId: string;
      userId: string;
      workspaceName: string;
      userName: string;
    }>();
    const owner = ownerWithApi(fakeApi({ authTest: async () => auth.promise }));

    const first = owner.inspect();
    await expect(owner.inspect()).rejects.toBeInstanceOf(OperationBusyError);
    auth.resolve({
      teamId: "TTEST01",
      userId: "UTEST01",
      workspaceName: "Example Workspace",
      userName: "Example User",
    });
    await expect(first).resolves.toMatchObject({ target: { channelId: "DTEST01" } });
  });

  it("aborts and settles an active operation before release", async () => {
    const api = fakeApi({
      authTest: async (signal) => {
        const pending = deferred<never>();
        signal?.addEventListener("abort", () => pending.reject(new OperationAbortedError()), { once: true });
        return pending.promise;
      },
    });
    const owner = ownerWithApi(api);
    const active = owner.inspect();
    await owner.stopAndWait();
    await expect(active).rejects.toBeInstanceOf(OperationAbortedError);
    expect(owner.hasActiveOperation()).toBe(false);
  });

  it("requires an owner-held preview before deletion", async () => {
    const owner = ownerWithApi();
    await expect(owner.delete(() => {})).rejects.toBeInstanceOf(MissingPreviewError);
  });

  it("consumes a preview when deletion starts", async () => {
    const owner = ownerWithApi();
    await owner.scan({ mode: "all", keepPinned: false });
    await expect(owner.delete(() => {})).resolves.toMatchObject({ terminal: "complete" });
    await expect(owner.delete(() => {})).rejects.toBeInstanceOf(MissingPreviewError);
  });

  it("discards the previous preview before a replacement scan", async () => {
    const api = fakeApi();
    const owner = ownerWithApi(api);
    await owner.scan({ mode: "all", keepPinned: false });
    api.conversationsHistory = async () => {
      throw new Error("replacement scan failed");
    };

    await expect(owner.scan({ mode: "all", keepPinned: false })).rejects.toThrow("replacement scan failed");
    await expect(owner.delete(() => {})).rejects.toBeInstanceOf(MissingPreviewError);
  });

  it("hard-stops when the extension context is invalid", async () => {
    const owner = new RunOwner({
      readCurrent: () => ({ target: URL_TARGET, context: TEST_CONTEXT }),
      apiFactory: () => fakeApi(),
      limiter: immediateLimiter(),
      isExtensionValid: () => false,
    });
    await expect(owner.inspect()).rejects.toBeInstanceOf(ExtensionInvalidatedError);
  });
});
