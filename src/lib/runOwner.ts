import { scan, runDelete, type CleanerDeps } from "./cleaner";
import { createSlackApi, type SlackApi } from "./slackApi";
import { OperationAbortedError, RateLimiter } from "./rateLimiter";
import { readCurrentSlackContext } from "./slackToken";
import type {
  DeleteProgress,
  DeleteResult,
  ScanFilters,
  ScanProgress,
  ScanSnapshot,
  SlackContext,
  UrlTarget,
  VerifiedSession,
  VerifiedTarget,
} from "./types";
import { verifySession, verifyTarget } from "./verification";

interface SlackWindow {
  localStorage: Pick<Storage, "getItem">;
  location: { origin: string; pathname: string };
}

export interface VerifiedView {
  session: VerifiedSession;
  target: VerifiedTarget;
}

export class OperationBusyError extends Error {
  constructor() {
    super("Another scan or deletion is already running.");
    this.name = "OperationBusyError";
  }
}

export class MissingPreviewError extends Error {
  constructor() {
    super("Scan this direct message again before deleting.");
    this.name = "MissingPreviewError";
  }
}

export class ExtensionInvalidatedError extends Error {
  constructor() {
    super("The extension was updated or removed. Reload Slack before continuing.");
    this.name = "ExtensionInvalidatedError";
  }
}

export class RunOwner {
  private readonly readSlackCurrent: () => { target: UrlTarget; context: SlackContext };
  private readonly apiFactory: (context: SlackContext) => SlackApi;
  private readonly limiter: RateLimiter;
  private readonly now: () => number;
  private readonly isExtensionValid: () => boolean;
  private activePromise: Promise<unknown> | null = null;
  private activeAbort: AbortController | null = null;
  private api: SlackApi | null = null;
  private session: VerifiedSession | null = null;
  private target: VerifiedTarget | null = null;
  private snapshot: ScanSnapshot | null = null;

  constructor(options: {
    slackWindow?: SlackWindow;
    readCurrent?: () => { target: UrlTarget; context: SlackContext };
    apiFactory?: (context: SlackContext) => SlackApi;
    limiter?: RateLimiter;
    now?: () => number;
    isExtensionValid?: () => boolean;
  } = {}) {
    if (options.readCurrent) {
      this.readSlackCurrent = options.readCurrent;
    } else {
      const slackWindow = options.slackWindow ?? window;
      this.readSlackCurrent = () => readCurrentSlackContext(slackWindow);
    }
    this.apiFactory = options.apiFactory ?? createSlackApi;
    this.limiter = options.limiter ?? new RateLimiter();
    this.now = options.now ?? (() => Date.now());
    this.isExtensionValid = options.isExtensionValid ?? (() => {
      try {
        return typeof chrome.runtime?.id === "string" && chrome.runtime.id.length > 0;
      } catch {
        return false;
      }
    });
  }

  private assertExtensionValid(): void {
    if (!this.isExtensionValid()) throw new ExtensionInvalidatedError();
  }

  private readCurrent(): { target: UrlTarget; context: SlackContext } {
    this.assertExtensionValid();
    return this.readSlackCurrent();
  }

  private async establish(signal?: AbortSignal): Promise<VerifiedView> {
    const current = this.readCurrent();
    const api = this.apiFactory(current.context);
    const session = await verifySession(current.context, api, this.limiter, signal);
    const target = await verifyTarget(current.target, session, api, this.limiter, signal);
    this.api = api;
    this.session = session;
    this.target = target;
    return { session, target };
  }

  private async exclusive<T>(operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
    if (this.activePromise) throw new OperationBusyError();
    const abort = new AbortController();
    this.activeAbort = abort;
    const promise = operation(abort.signal);
    this.activePromise = promise;
    try {
      return await promise;
    } finally {
      if (this.activePromise === promise) {
        this.activePromise = null;
        this.activeAbort = null;
      }
    }
  }

  async inspect(): Promise<VerifiedView> {
    return this.exclusive((signal) => this.establish(signal));
  }

  async scan(
    filters: ScanFilters,
    onProgress?: (progress: ScanProgress) => void,
  ): Promise<{ view: VerifiedView; snapshot: ScanSnapshot }> {
    return this.exclusive(async (signal) => {
      this.snapshot = null;
      const view = await this.establish(signal);
      const deps: CleanerDeps = {
        api: this.api!,
        limiter: this.limiter,
        now: this.now,
        readCurrent: () => this.readCurrent(),
      };
      const snapshot = await scan(
        view.session,
        view.target,
        filters,
        deps,
        onProgress,
        signal,
      );
      this.snapshot = snapshot;
      return { view, snapshot };
    });
  }

  async delete(onProgress: (progress: DeleteProgress) => void): Promise<DeleteResult> {
    return this.exclusive(async (signal) => {
      const snapshot = this.snapshot;
      if (!snapshot || !this.session || !this.target || !this.api) {
        throw new MissingPreviewError();
      }
      this.snapshot = null;
      const deps: CleanerDeps = {
        api: this.api,
        limiter: this.limiter,
        now: this.now,
        readCurrent: () => this.readCurrent(),
      };
      return runDelete(
        snapshot,
        this.session,
        this.target,
        deps,
        onProgress,
        signal,
      );
    });
  }

  invalidatePreview(): void {
    if (this.activePromise) throw new OperationBusyError();
    this.snapshot = null;
  }

  async reset(): Promise<VerifiedView> {
    if (this.activePromise) throw new OperationBusyError();
    this.snapshot = null;
    this.session = null;
    this.target = null;
    this.api = null;
    return this.inspect();
  }

  async stopAndWait(): Promise<void> {
    this.activeAbort?.abort();
    if (!this.activePromise) return;
    try {
      await this.activePromise;
    } catch (error) {
      if (!(error instanceof OperationAbortedError)) throw error;
    }
  }

  clearSensitiveState(): void {
    if (this.activePromise) throw new OperationBusyError();
    this.snapshot = null;
    this.session = null;
    this.target = null;
    this.api = null;
  }

  hasActiveOperation(): boolean {
    return this.activePromise !== null;
  }
}
