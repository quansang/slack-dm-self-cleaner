import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const release = join(root, "release");
const archive = join(release, "dist.zip");
const entries = execFileSync("unzip", ["-Z1", archive], { encoding: "utf8" })
  .split("\n")
  .filter(Boolean);
if (!entries.includes("manifest.json")) throw new Error("manifest.json is not at ZIP root");
if (entries.some((entry) => entry.endsWith(".map") || entry.startsWith("/") || entry.includes("../"))) {
  throw new Error("ZIP contains a source map or unsafe path");
}

const sha256 = createHash("sha256").update(readFileSync(archive)).digest("hex");
const checksum = readFileSync(join(release, "SHA256SUMS"), "utf8").trim();
if (checksum !== `${sha256}  dist.zip`) throw new Error("SHA256SUMS does not match dist.zip");
const provenance = JSON.parse(readFileSync(join(release, "provenance.json"), "utf8"));
if (provenance.sha256 !== sha256 || provenance.artifact !== "dist.zip") {
  throw new Error("Provenance does not identify the packaged ZIP");
}

const extracted = mkdtempSync(join(tmpdir(), "slack-dm-self-cleaner-"));
try {
  execFileSync("unzip", ["-q", archive, "-d", extracted]);
  const manifest = JSON.parse(readFileSync(join(extracted, "manifest.json"), "utf8"));
  const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  if (manifest.version !== packageJson.version) throw new Error("Packaged version does not match package.json");
  if (manifest.permissions || manifest.host_permissions) throw new Error("Packaged manifest has unexpected permissions");
  if (manifest.content_scripts?.[0]?.matches?.join(",") !== "https://app.slack.com/*") {
    throw new Error("Packaged content-script origin is not restricted to app.slack.com");
  }
} finally {
  rmSync(extracted, { recursive: true, force: true });
}
console.log(`Verified release/dist.zip (${entries.length} entries, sha256 ${sha256})`);
