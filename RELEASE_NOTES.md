# Release notes

## 0.2.0 — initial public fork release

- Restricts scope to the verified peer DM or self-DM currently open at `app.slack.com`.
- Verifies URL workspace/DM, local session, `auth.test` identity, and `conversations.info` IM shape before preview and deletion.
- Deletes only reviewed own-author candidates; excludes app, bot, system, unsupported, foreign-author, out-of-range, and protected pinned rows.
- Scans complete Slack-returned history so custom date ranges include in-range replies under older roots.
- Adds immutable 15-minute previews, explicit confirmation, single-flight cancellation, periodic identity/target/pin refresh, and complete/stopped/failed-partial outcomes.
- Removes the conversation picker, channels, group DMs, `saved.list`, broad Slack host access, and `activeTab`.
- Adds English/Vietnamese usage and installation guides, privacy/security disclosures, exact dependencies, tests, read-only CI, deterministic packaging, checksum, provenance, and protected no-build release publishing.

Known limitations: internal Slack web API/session behavior may change; Enterprise Grid is unsupported; Slack file objects, edit history, hidden/inaccessible history, and retention/compliance copies are not removed. Chrome Web Store submission and approval remain external gates.
