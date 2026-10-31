import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const dist = join(root, "dist");
const release = join(root, "release");
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const manifest = JSON.parse(readFileSync(join(dist, "manifest.json"), "utf8"));
if (manifest.version !== packageJson.version) {
  throw new Error(`Version mismatch: package ${packageJson.version}, manifest ${manifest.version}`);
}

const files = [];
const visit = (directory) => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) visit(absolute);
    else if (entry.isFile()) files.push(relative(dist, absolute));
    else throw new Error(`Unsupported package entry: ${relative(dist, absolute)}`);
  }
};
visit(dist);
files.sort();
if (!files.includes("manifest.json")) throw new Error("dist/manifest.json is missing");
if (files.some((file) => file.endsWith(".map") || file.startsWith("../") || file.startsWith("/"))) {
  throw new Error("Package contains a source map or path outside dist");
}

const sourceDateEpoch = Number(
  process.env.SOURCE_DATE_EPOCH
    ?? execFileSync("git", ["show", "-s", "--format=%ct", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
);
if (!Number.isInteger(sourceDateEpoch) || sourceDateEpoch <= 0) {
  throw new Error("SOURCE_DATE_EPOCH must be a positive Unix timestamp");
}
const sourceDate = new Date(sourceDateEpoch * 1000);
for (const file of files) utimesSync(join(dist, file), sourceDate, sourceDate);

mkdirSync(release, { recursive: true });
const archive = join(release, "dist.zip");
rmSync(archive, { force: true });
execFileSync("zip", ["-X", "-q", archive, ...files], { cwd: dist });
const archiveBytes = readFileSync(archive);
const sha256 = createHash("sha256").update(archiveBytes).digest("hex");
writeFileSync(join(release, "SHA256SUMS"), `${sha256}  dist.zip\n`, "utf8");

const gitSha = process.env.GITHUB_SHA
  ?? execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const provenance = {
  artifact: "dist.zip",
  sha256,
  version: manifest.version,
  sourceRepository: "https://github.com/quansang/slack-dm-self-cleaner",
  sourceCommit: gitSha,
  sourceDateEpoch,
  builder: process.env.GITHUB_ACTIONS === "true" ? "github-actions" : "local",
  packageFiles: files,
};
writeFileSync(join(release, "provenance.json"), `${JSON.stringify(provenance, null, 2)}\n`, "utf8");
console.log(`Packaged release/dist.zip (${archiveBytes.length} bytes, sha256 ${sha256})`);
