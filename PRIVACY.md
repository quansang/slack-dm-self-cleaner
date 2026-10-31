# Privacy Policy — Slack DM Self Cleaner

_Last updated: 2026-10-31_

Slack DM Self Cleaner is an unofficial, single-purpose Chrome extension for previewing and deleting the authenticated user's own messages in the verified one-to-one Slack DM currently open in the browser.

## Data handling

The extension:

- reads the matching workspace's Slack browser-session value and user ID from Slack's page-local configuration;
- keeps the session value, verified identity, message timestamps, authorship evidence, subtype, pin state, and current-run counts only in memory;
- sends requests only to `https://app.slack.com/api/*` from the Slack content-script context;
- sends the session value to Slack as required by Slack's own web client API calls;
- does not send data to the developer or any third-party server;
- does not use analytics, advertising, telemetry, remote code, a backend, or a kill switch;
- does not write session values, message data, or run state to Chrome storage, local storage, logs, or developer-controlled storage; and
- clears the current in-memory run when the panel closes or the page unloads.

The extension uses the browser session only to call `auth.test`, `conversations.info`, `users.info`, `conversations.history`, `conversations.replies`, `pins.list`, and `chat.delete` for the verified DM workflow. It never calls `saved.list`.

## Authentication data disclosure

The Slack browser-session value is authentication information. It is accessed only because this no-workspace-app design operates as the already signed-in Slack user. It remains in the Slack page/extension process memory, is never requested as user input, and is never transferred to the developer or another service. If this behavior is not acceptable, do not install or use the extension.

## Message content

The extension receives Slack message objects while scanning but admits only non-content deletion evidence: conversation ID, timestamp, author user ID, and reviewed subtype. It does not log or persist message text, attachments, or file content. Deleting a `file_share` message does not delete the Slack file object.

## Browser permissions

The manifest injects a content script only on `https://app.slack.com/*`. It declares no optional Chrome permissions and no broad `*.slack.com` host permission. Network calls are same-origin requests to Slack.

## Retention and sharing

The developer collects no user data, retains no user data, sells no user data, and shares no user data. GitHub Issues and security reports are user-submitted public or private communications; users must redact session values, cookies, real workspace/user IDs, DM content, and browser-profile details.

## Limitations

“All accessible history” means matching messages Slack currently returns to the authenticated account. Plan-hidden or inaccessible history, Slack file objects, edit history, and retention, Legal Hold, Discovery, or compliance copies are outside scope. Enterprise Grid is unsupported in version 0.2.0.

## Contact

- Support: <https://github.com/quansang/slack-dm-self-cleaner/issues>
- Private vulnerability reports: <https://github.com/quansang/slack-dm-self-cleaner/security/advisories/new>

This policy is hosted at the stable public URL:
<https://github.com/quansang/slack-dm-self-cleaner/blob/main/PRIVACY.md>
