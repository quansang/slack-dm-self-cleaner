import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const listed = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard"],
  { cwd: root, encoding: "utf8" },
).split("\n").filter(Boolean);

const generatedFiles = [];
const collectGenerated = (directory) => {
  if (!existsSync(directory)) return;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) collectGenerated(absolute);
    else if (entry.isFile()) generatedFiles.push(relative(root, absolute));
  }
};
collectGenerated(join(root, "dist"));
collectGenerated(join(root, "release"));
const files = [...new Set([...listed, ...generatedFiles])].sort();

const deniedPatterns = [
  { name: "macOS local path", pattern: /\/Users\//i },
  { name: "Windows local path", pattern: /[A-Z]:\\Users\\/i },
  { name: "Slack session token", pattern: /xox[cpsbar]-[A-Za-z0-9-]{8,}/ },
  { name: "Slack session cookie", pattern: /d=xoxd-[A-Za-z0-9%-]{8,}/ },
  { name: "GitHub token", pattern: /gh[pousr]_[A-Za-z0-9]{20,}/ },
  { name: "private key", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
];
const denylistPath = process.env.SLACK_CLEANER_DENYLIST;
const denylist = denylistPath && existsSync(denylistPath)
  ? readFileSync(denylistPath, "utf8").split("\n").map((line) => line.trim()).filter(Boolean)
  : [];

const findings = [];
for (const file of files) {
  const absolute = join(root, file);
  if (!existsSync(absolute)) continue;
  const bytes = readFileSync(absolute);
  if (bytes.includes(0)) continue;
  const text = bytes.toString("utf8");
  for (const denied of deniedPatterns) {
    if (denied.pattern.test(text)) findings.push(`${file}: ${denied.name}`);
  }
  const lower = text.toLocaleLowerCase("en-US");
  for (const value of denylist) {
    if (lower.includes(value.toLocaleLowerCase("en-US"))) findings.push(`${file}: local denylist match`);
  }
}
if (findings.length > 0) {
  throw new Error(`Public-surface scan failed:\n${findings.join("\n")}`);
}
console.log(`Public-surface scan passed (${files.length} files, ${denylist.length} local denylist values)`);
