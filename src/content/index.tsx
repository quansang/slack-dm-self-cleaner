import { render } from "preact";
import { isDuplicateExtensionCopy } from "../lib/duplicateGuard";
import { RunOwner } from "../lib/runOwner";
import { App } from "./panel/App";

const MOUNT_ID = "slack-dm-self-cleaner-panel-root";
const PRODUCT_MARKER_ID = "slack-dm-self-cleaner-product-marker";
const owner = new RunOwner();
let duplicateCopy = false;
let closingPromise: Promise<void> | null = null;

function claimProductMarker(): HTMLElement {
  const runtimeId = chrome.runtime.id;
  const existing = document.getElementById(PRODUCT_MARKER_ID);
  if (existing) {
    if (isDuplicateExtensionCopy(existing.dataset.extensionId, runtimeId)) {
      existing.dataset.duplicate = "true";
      duplicateCopy = true;
    }
    return existing;
  }

  const marker = document.createElement("meta");
  marker.id = PRODUCT_MARKER_ID;
  marker.dataset.product = "slack-dm-self-cleaner";
  marker.dataset.extensionId = runtimeId;
  marker.dataset.duplicate = "false";
  document.head.appendChild(marker);
  return marker;
}

const marker = claimProductMarker();

async function closePanel(): Promise<void> {
  if (closingPromise) return closingPromise;
  closingPromise = (async () => {
    try {
      await owner.stopAndWait();
    } catch {
      // The initiating UI handler owns the operation error; closing must still clear session data.
    }
    owner.clearSensitiveState();
    const host = document.getElementById(MOUNT_ID);
    const mount = host?.shadowRoot?.firstElementChild;
    if (mount instanceof HTMLElement) render(null, mount);
    host?.remove();
  })();
  try {
    await closingPromise;
  } finally {
    closingPromise = null;
  }
}

function mountPanel(): void {
  const host = document.createElement("div");
  host.id = MOUNT_ID;
  document.body.appendChild(host);
  const shadow = host.attachShadow({ mode: "open" });
  const mount = document.createElement("div");
  shadow.appendChild(mount);
  render(
    <App owner={owner} duplicate={duplicateCopy} onRequestClose={closePanel} />,
    mount,
  );
}

async function togglePanel(): Promise<void> {
  if (document.getElementById(MOUNT_ID)) {
    await closePanel();
    return;
  }
  if (marker.dataset.duplicate === "true") duplicateCopy = true;
  mountPanel();
}

const duplicateObserver = new MutationObserver(() => {
  if (marker.dataset.duplicate !== "true") return;
  duplicateCopy = true;
  void owner.stopAndWait().catch(() => {}).then(() => {
    owner.clearSensitiveState();
    const host = document.getElementById(MOUNT_ID);
    const mount = host?.shadowRoot?.firstElementChild;
    if (mount instanceof HTMLElement) {
      render(<App owner={owner} duplicate onRequestClose={closePanel} />, mount);
    }
  });
});
duplicateObserver.observe(marker, { attributes: true, attributeFilter: ["data-duplicate"] });

chrome.runtime.onMessage.addListener((message: unknown) => {
  if (
    typeof message === "object"
    && message !== null
    && "type" in message
    && message.type === "TOGGLE_PANEL"
  ) {
    void togglePanel();
  }
});

window.addEventListener("pagehide", () => {
  duplicateObserver.disconnect();
  void closePanel();
}, { once: true });
