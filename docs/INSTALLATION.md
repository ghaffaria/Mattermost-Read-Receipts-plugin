# Install the Mattermost Read Receipts plugin, preserve data and roll back

This guide covers the server plugin, supported web/desktop clients and the separately installed Android read-receipts app. It is a deployment checklist, not a record of a production installation. Validate the real server version, license policy and network path in an isolated staging environment first.

## 1. Choose the right release files

Use [plugin 1.1.2](https://github.com/ghaffaria/Mattermost-Read-Receipts-plugin/releases/tag/v1.1.2) for the current MPL-2.0 and developer-attribution package. Its assets include the plugin archive, corresponding source archive and `SHA256SUMS`. Obtain the unchanged Android APK from the [Android 2.46.0-rr.1 release](https://github.com/ghaffaria/Mattermost-Read-Receipts-plugin/releases/tag/v1.1.1-android-2.46.0-rr.1).

Verify each file against the checksum file from the same release:

```sh
shasum -a 256 -c SHA256SUMS
```

Download all files listed in that checksum file into the same directory before running the command. The Linux binaries inside the plugin run on the Mattermost server; Windows and macOS desktop clients receive the web component from that server.

## 2. Record and back up the current deployment

Record the Mattermost server build, database version/schema, current plugin ID/version, enabled state and settings. Preserve the installed plugin package so that an application rollback has a known target.

Create a coordinated backup of PostgreSQL, uploaded files, Mattermost configuration and plugin files. Follow the deployment's maintenance and backup procedures so the database/files represent a usable recovery point. Verify the backup and rehearse restoration in a separate environment. Keep credentials and backup contents out of this repository.

Plugin retention cleanup is disabled by default. Keep it disabled during an upgrade/rehearsal unless deletion under a specific retention policy is intentional. Do not drop receipt tables as an upgrade step.

## 3. Upload and enable the plugin

In Mattermost System Console, open plugin management, upload `mattermost-readreceipts-1.1.2.tar.gz`, and enable Read Receipts. Server policy must permit plugin installation. Review plugin logs and confirm the activated version.

In plugin settings, verify the developer credit and GitHub link, then review:

| Setting | Purpose | Default |
|---|---|---|
| Enable | Enable explicit per-message receipts | On |
| Visibility Threshold (ms) | Required uninterrupted visible interval | 2000 |
| Receipt Retention (days) | Retention period used by cleanup | 30 |
| Enable automatic receipt cleanup | Opt in to scheduled retention deletion | Off |
| Log Level | Plugin logging verbosity | Info |

Explain the read-receipt behavior to users. The implementation does not claim WhatsApp-style per-user opt-out controls. A recorded Seen status is not a manual acknowledgement of an instruction.

## 4. Run acceptance tests with separate accounts

Use at least a sender and a reader; add more accounts for selective-reader tests.

1. Send a target while the recipient has another channel open. Confirm there is no receipt for that reader.
2. Open the target conversation and keep the message visible beyond the configured threshold. Confirm the exact recipient appears in Seen.
3. Stay in the same channel, scroll several screens above the latest messages, and send a new target. Confirm no Seen until the recipient scrolls to it.
4. Repeat in a private channel and verify that a non-member cannot obtain or write receipts.
5. Keep a parent message visible while its thread is closed. Confirm a new reply remains unseen; open the thread and verify that reply separately.
6. Minimize the desktop app, send another target, and confirm no receipt until restoration and viewing.
7. Test both client directions and several reader subsets. Reopening a message must not replace the original first-read timestamp.

Repeat through the actual reverse proxy and TLS endpoint, including a genuine disconnection/reconnection. Compare [documented validation](VALIDATION.md) with your own version and topology rather than assuming those results certify an untested environment.

## 5. Add the optional Android client

The official mobile app does not implement this custom protocol. Install the separately signed QA APK alongside it and log in to the authorized staging server. Do not uninstall the official app or clear its data. The APK has its own application ID, account session and local storage.

The APK adds no new server schema migration. Organization-wide push delivery needs organization-owned Firebase/HPNS configuration and separate validation; the supplied APK does not have qualified custom push. See [Android build and installation](ANDROID.md).

## Rollback

For a client rollback, close the derived Android app and return to the official client. Existing messages and valid server-side receipts remain, although the official mobile app does not supply this custom Seen feature.

For a plugin rollback, disable the new version, restore the recorded previous package/settings and inspect activation logs. Avoid dropping receipt tables or deleting historical rows. Retain logs from the failed attempt.

If the deployment also changed the Mattermost server or database schema, a plugin-package rollback does not undo those migrations. Restore the coordinated database/files/configuration recovery point with its matching server version when required; do not assume a binary downgrade is sufficient.
