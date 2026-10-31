# Security Policy

## Supported version

Security fixes are provided for the latest published release. Version 0.2.0 is the first release planned under this repository.

## Report a vulnerability

Use [GitHub private vulnerability reporting](https://github.com/quansang/slack-dm-self-cleaner/security/advisories/new). Do not open a public issue for a vulnerability involving authentication data, cross-DM deletion, another user's messages, package integrity, or a bypass of lifecycle cancellation.

Never include:

- Slack session values or cookies;
- real workspace, user, participant, channel, or DM identifiers;
- message content, files, screenshots containing Slack data, or browser-profile data; or
- local absolute paths, environment files, or credentials.

Use synthetic identifiers and describe the smallest reproducible sequence. The maintainer will acknowledge valid reports through GitHub, assess whether distribution must be paused, and publish a versioned fix or advisory. No bounty is promised.

## Security invariants

A release must fail closed unless the live Slack URL, local workspace session, `auth.test` identity, and `conversations.info` IM target agree. Only candidates authored by the verified user and carrying a reviewed subtype can reach `chat.delete`. Pin lookup failures, malformed responses, identity/target drift, exhausted rate/network retries, policy failures, preview expiry, duplicate copies, and extension invalidation stop mutation.

The extension has no backend, analytics, remote code, third-party endpoint, token storage, or message-content logging. Release builds use exact dependencies, read-only build authority, a protected no-build publish job, a root-layout check, SHA-256, provenance, and the same ZIP for GitHub and Chrome Web Store distribution.

## Incident response

For a data-loss or credential defect, the maintainer will stop new distribution, deprecate the affected release, publish English and Vietnamese removal/update guidance, and ship a new versioned fixed or deletion-disabled build. Existing installed copies cannot be remotely disabled; users must remove or update them. Release bytes under an existing tag are never replaced.
