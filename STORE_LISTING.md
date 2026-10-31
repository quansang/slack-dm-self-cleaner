# Chrome Web Store listing — Slack DM Self Cleaner

Status: **submitted 2026-10-31; pending Chrome Web Store review (not approved)**. This file is the reviewed listing source; it is not evidence of Store availability.

## Product name

Slack DM Self Cleaner

## Category

Productivity

## Short description

Preview and delete only your own messages from the verified Slack peer DM or self-DM currently open in Chrome.

## Single purpose

Give the signed-in user a fail-closed scan, immutable preview, explicit confirmation, and stoppable deletion workflow for only that user's eligible messages in the verified one-to-one Slack DM currently open in the browser.

## Detailed description

Slack DM Self Cleaner is an unofficial Chrome extension for cleaning up messages you authored in one verified one-to-one Slack direct message.

Safe workflow:

1. Open the intended peer DM or DM with yourself at `app.slack.com`.
2. Verify the workspace, account, target kind/name, and DM ID shown by the extension.
3. Keep the zero-input **All accessible history** scope, or choose an optional local calendar date range.
4. Keep pinned messages protected by default, or deliberately disable that protection.
5. Scan all history Slack currently returns, review the immutable candidate/excluded counts and 15-minute snapshot, confirm permanent deletion, then delete.
6. Stop scanning or deletion at any time. Closing or unloading aborts active work.

Safety controls:

- peer DMs and the verified self-DM use the same own-author invariant;
- channels, group DMs, malformed targets, and Enterprise Grid are rejected;
- the live URL, local session, authenticated identity, and Slack IM target must agree;
- unsupported, system, app-authored, and bot-authored rows never enter deletion candidates;
- enabled pin protection fails closed;
- policy, malformed-response, identity/target drift, and exhausted rate/network errors stop as failed-partial;
- duplicate Store and unpacked copies hard-stop.

No Slack workspace app, OAuth installation, developer server, analytics, tracking, remote code, or credential input is used.

“All accessible history” means matching messages Slack currently returns. The extension does not remove another user's messages, Slack file objects, edit history, hidden/inaccessible history, or retention, Legal Hold, Discovery, and compliance copies. Deletion is permanent. Automated use may conflict with Slack's terms or workspace policy.

This product is not affiliated with, endorsed by, or sponsored by Slack Technologies, LLC.

## Site access justification

Content-script match: `https://app.slack.com/*`

The extension must run inside the signed-in Slack web client to read the current `/client/T…/D…` URL, verify the matching in-page session and direct-message target, scan the user's own messages, read pins, and submit user-confirmed deletions to Slack's same-origin API. It does not declare `activeTab`, optional Chrome permissions, or broad `https://*.slack.com/*` host access.

## Authentication-data disclosure

The extension reads the matching Slack browser-session value from Slack's page-local configuration and sends it only to `https://app.slack.com/api/*` as required for Slack's own web-client API calls. The value stays in process memory, is never requested as input, stored, logged, sent to the developer, or transferred to another service. The extension has no backend.

## Data-use declarations

- Authentication information handled by the extension: yes. The Slack session value is read in the page and sent only to Slack (`https://app.slack.com/api/*`); it is never sent to the developer or a third party. Declared in the Store Privacy tab.
- Personally identifiable information, website content and personal communications collected by developer: none. Only conversation ID, message timestamp, author user ID and subtype are held in memory during a run.
- Analytics or advertising: none.
- Data sale or third-party transfer: none.
- Remote code: none.
- Privacy policy: <https://github.com/quansang/slack-dm-self-cleaner/blob/main/PRIVACY.md>
- Support: <https://github.com/quansang/slack-dm-self-cleaner/issues>

## Reviewer instructions

Use a disposable, non-production Slack workspace and synthetic accounts/messages only. Open a peer DM and a DM with yourself. Verify default all-history, custom local dates, pin protection, Stop, close abort, navigation-drift rejection, and duplicate-copy rejection. Do not use personal history or production workspace data. The package intentionally refuses Enterprise Grid, channels, and group DMs.

## Owner prerequisites before tagging or submission

- [x] Chrome Web Store developer registration and fee completed.
- [x] 2-Step Verification enabled.
- [ ] Developer identity verification pending; account is temporarily labeled non-trader. Re-check trader/non-trader status when verification completes.
- [x] Dedicated public support route (GitHub Issues) and notification settings confirmed.
- [x] Stable public privacy URL live.
- [x] Product name and non-endorsement copy accepted.
- [x] Single-purpose, site-access, authentication-data, privacy, and remote-code disclosures entered exactly.
- [x] Synthetic screenshots (`store-screenshots/`, 1280x800) captured from the reviewed artifact and visually/OCR inspected.
- [x] Exact CI-built `dist.zip` uploaded; local rebuilds are forbidden.
- [x] Automatic publication after approval selected and submission receipt recorded without personal Slack data.
