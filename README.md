# Slack DM Self Cleaner

A transparent, unofficial Chrome extension that previews and permanently deletes **only messages authored by the currently authenticated user** in the verified one-to-one Slack direct message open at `app.slack.com`.

- Peer DMs and the verified self-DM are supported.
- Channels, group DMs, and Enterprise Grid are rejected.
- No Slack app, OAuth installation, backend, analytics, remote code, or credential input.
- Requests go only to Slack from the open Slack tab. The session value stays in memory and is never stored or logged by the extension.

This project is not affiliated with, endorsed by, or sponsored by Slack Technologies, LLC.

## Safety model

The extension does not trust a `D…` URL by itself. Before a preview and again before deletion it requires agreement between:

1. the live `/client/T…/D…` URL;
2. the matching workspace entry in Slack's page-local session configuration;
3. `auth.test` workspace and user identity; and
4. `conversations.info` reporting the exact conversation as an `is_im` conversation with a verified participant.

The self-DM path is accepted only when that verified IM participant equals the authenticated user. Every candidate freezes its channel, timestamp, author, and reviewed subtype. The live URL and local session are checked before every deletion; remote identity, target, and pins are refreshed at the start and periodically. Any uncertainty stops the run.

## Safe use

1. Sign in at `https://app.slack.com` and open the intended **peer DM** or **DM with yourself**.
2. Click the extension toolbar icon.
3. Verify the displayed workspace, account, target kind/name, and DM ID.
4. Keep **All accessible history** for the default zero-input scope. It sends no date bounds and scans all history Slack currently returns.
5. Or select **Custom date range** and choose local **On or after** / **On or before** calendar days. The scan still traverses older thread roots so in-range replies are not hidden.
6. Keep **Keep pinned messages** enabled unless pinned messages should deliberately be included.
7. Select **Scan messages**. Long scans can be stopped without creating a preview.
8. Review the immutable candidate/excluded counts, scan time, 15-minute expiry, snapshot boundary, scope, and pin policy. Messages posted after the scan are excluded.
9. Check the explicit permanent-deletion confirmation, then delete. Stop remains available during deletion.
10. Wait for **Complete**, **Stopped**, or **Failed after partial work**. Closing, toggling, unloading, or invalidating the extension aborts active work; hiding the panel is never success.

Never enable a Store copy and an unpacked copy on the same Slack page. Duplicate copies hard-stop; disable one and reload Slack.

## Install from a GitHub Release while Store approval is pending

The Chrome Web Store listing is not approved yet. The release ZIP is the pre-approval installation path where managed Chrome policy permits Developer mode.

1. Open the named GitHub Release and download `dist.zip` and `SHA256SUMS`.
2. Verify the checksum. Stop if it differs:
   - macOS/Linux: `shasum -a 256 dist.zip`
   - Windows PowerShell: `Get-FileHash .\dist.zip -Algorithm SHA256`
3. Extract `dist.zip` into a permanent folder. Confirm `manifest.json` is directly inside that folder.
4. Open `chrome://extensions`, enable **Developer mode**, select **Load unpacked**, and choose the extracted folder.
5. Pin Slack DM Self Cleaner, open or reload `app.slack.com`, and click the toolbar icon.

Managed Chrome may block Developer mode. Unpacked installations do not auto-update, and the extracted folder must remain in place.

### Update an unpacked installation

1. Stop active work and wait for its terminal state.
2. Download and verify a newer release.
3. Replace the extracted folder with the newly extracted files.
4. Select **Reload** for the extension at `chrome://extensions`.
5. Reload every open Slack tab.

### Uninstall an unpacked installation

Stop active work, wait for its terminal state, remove the extension at `chrome://extensions`, then reload Slack.

## Install from the Chrome Web Store after approval

No Store listing is currently approved; do not trust a similarly named listing. After this repository publishes a verified listing URL:

1. Stop active work, remove any unpacked copy, and reload Slack before installing the Store copy.
2. Follow only the verified listing link published in this repository, select **Add to Chrome**, and review site access.
3. Pin the extension and reload Slack. Store updates are automatic, but open Slack tabs may need a reload after an update.
4. To uninstall, stop and wait for the terminal state, remove the Store extension, then reload Slack.

## What is and is not deleted

**Eligible:** the authenticated user's supported top-level messages and thread replies that Slack currently returns for the verified DM and selected scope. A `file_share` message may be deleted as a message.

**Not removed:** another user's messages, Slack file objects, edit history, plan-hidden or inaccessible history, retention/Legal Hold/Discovery/compliance copies, saved-for-later state, channels, group DMs, or Enterprise Grid content.

`message_not_found` is reported as **Already gone**, never as a successful deletion. Policy, malformed-response, exhausted rate/network, identity, target, and pin uncertainty stop as failed-partial.

## Privacy and security

See [PRIVACY.md](./PRIVACY.md) and [SECURITY.md](./SECURITY.md). Do not include session values, cookies, real workspace/user identifiers, DM content, or browser-profile data in issues or screenshots.

Support: [GitHub Issues](https://github.com/quansang/slack-dm-self-cleaner/issues) using synthetic/redacted details only.

## Build and verify

Requires Node.js 20.19 or later.

```bash
npm ci --ignore-scripts
npm audit --audit-level=high
npm test
npm run typecheck
npm run package
npm run verify:release
npm run scan:public
```

`npm run package` creates deterministic `release/dist.zip`, `SHA256SUMS`, and `provenance.json`. The ZIP contains the files inside `dist/`, so `manifest.json` is at its root. The same CI-built ZIP is used for GitHub Releases and Store submission; the publish job never installs dependencies or runs build tooling.

## Risks

The extension relies on Slack's undocumented browser-session configuration and internal web API. Slack may change or prohibit this mechanism. It does not bypass workspace policy, retention, unavailable history, or compliance controls. Deletion is irreversible and distribution cannot remotely disable an installed copy.

## Attribution

Forked from [`om-1021/bulk-delete-for-slack`](https://github.com/om-1021/bulk-delete-for-slack) at audited commit [`e106bda7c945c02712bd83896cf6e2b1e78d18a3`](https://github.com/om-1021/bulk-delete-for-slack/commit/e106bda7c945c02712bd83896cf6e2b1e78d18a3). Original history and MIT notice are preserved.

## License

[MIT](./LICENSE)
