# Contributing

## Safety first

Changes must preserve these invariants:

- only the currently authenticated user's messages can become deletion candidates;
- the live URL, workspace session, `auth.test` identity, and `conversations.info` IM target must agree;
- peer DM and self-DM use the same own-author checks;
- scan, preview, and delete fail closed on malformed data, target/session drift, pin uncertainty, policy errors, exhausted retries, or lifecycle cancellation;
- no backend, analytics, remote code, broad Slack host access, credential automation, or message-content logging; and
- release publishing never installs dependencies or rebuilds the artifact.

Do not add channels, group DMs, saved-for-later protection, Enterprise Grid fallback, file-object deletion, or compliance bypasses to an unrelated change.

## Fixtures and public data

Use synthetic workspace, user, DM, and message data. Never commit a Slack session value, cookie, real Slack identifier, DM content, browser-profile detail, local absolute path, screenshot from a personal/production workspace, or local denylist. Redact issue and pull-request evidence before publication.

## Checks

```bash
npm ci --ignore-scripts
npm audit --audit-level=high
npm test
npm run typecheck
npm run package
npm run verify:release
npm run scan:public
```

Behavior changes need tests that would catch a consumer-visible safety regression. Avoid tests that only copy source strings or assert wiring.

## Releases

Version and manifest changes must agree. Release tags are immutable. The protected build job creates `dist.zip`, `SHA256SUMS`, and `provenance.json`; the protected publish job downloads and verifies those exact bytes without package installation or build execution. Never replace bytes under an existing tag.
