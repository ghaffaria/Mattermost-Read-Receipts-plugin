# Mattermost Read Receipts

[فارسی](README.fa.md) · [Releases](https://github.com/ghaffaria/Mattermost-Read-Receipts-plugin/releases) · [Architecture](docs/ARCHITECTURE.md) · [Validation](docs/VALIDATION.md)

Plugin **1.1.2** and derived Android client **2.46.0-rr.1** provide automatic, explicit per-message receipts. A message must remain visible in the focused, active conversation for **2 continuous seconds** by default. Authors see **✓✓ Seen by …** with server-confirmed readers. Receiving a message or advancing a channel read cursor does not create a receipt.

## Download

Use [plugin v1.1.2](https://github.com/ghaffaria/Mattermost-Read-Receipts-plugin/releases/tag/v1.1.2). The unchanged APK remains in the [Android release](https://github.com/ghaffaria/Mattermost-Read-Receipts-plugin/releases/tag/v1.1.1-android-2.46.0-rr.1):

- `mattermost-readreceipts-1.1.2.tar.gz`: Linux amd64/arm64 plugin.
- `mattermost-read-receipts-android-2.46.0-rr.1-arm64-v8a.apk`: separately signed Android QA app.
- `SHA256SUMS`: verify downloads before installation.

The Android app is based on official Mattermost Mobile v2.46.0, commit `655df13b131da6810f4f073622c925af1b87c3fb`. Its package ID is `com.pardis.mattermost.readreceipts.qa`; it installs alongside the official app. It does not replace the official app or reuse its data. The unchanged official Android app does not implement this custom receipt protocol.

## Verified scope

Tested with **Mattermost Enterprise12.0.1, schema234, PostgreSQL17.12**, installed **macOS Desktop6.3.2**, two Android16/API36 arm64 emulators and browser clients. Six bidirectional client paths, five-member public/private/group channels, scrolled-up messages, threads, notification shade, short interrupted exposure and reconnects passed within the documented scope.

**Windows desktop ↔ web validated:** official Windows app in UTM passed public/private channel delivery, offscreen scroll, minimize/restore and closed/open thread scenarios. Windows-to-web receipts were also checked. See the [Windows test report and screenshots](docs/WINDOWS.md) for evidence, operator-reported acceptance and version/coverage limits. No custom Windows build is needed.

**Custom Firebase/HPNS push is not configured or qualified.** This is a QA-signed derived app; physical devices, other Android API levels, iOS, HA/load and production Enterprise Advanced policies are not certified. No production deployment was performed.

## Build and install

```sh
cd webapp
npm ci
cd ..
make test
make dist
```

Go, Node/npm and Python3 are required. See [Android build](docs/ANDROID.md) and [installation / rollback](docs/INSTALLATION.md). Runtime configuration, databases, credentials and signing keys are intentionally excluded.

## Screenshot

![Different readers for the second message in a five-member group](docs/screenshots/desktop-five-member-readers.png)

The screenshots contain synthetic accounts in an isolated local test environment. See [validation and additional screenshots](docs/VALIDATION.md) for negative cases and their matching positive cases.

## Repository replacement

The previous working tree was replaced with the current implementation on2026-11-21. Earlier commits and the previous release remain recoverable in Git history. The server plugin and APK are the exact tested artifacts; checksums identify their bytes. The Android source is supplied as a verified patch against the pinned official upstream, with a preparation script. Upstream mobile licensing is available in the [official repository](https://github.com/mattermost/mattermost-mobile/tree/v2.46.0).

## License

Original project code: [MPL-2.0](LICENSE). See [scope and third-party boundaries](LICENSING.md). Plugin 1.1.2 adds developer credit in the plugin description and a clickable settings footer. APK bytes and Android licensing remain unchanged. Historical UI validation used plugin 1.1.1; 1.1.2 changes licensing/attribution and the activation version log only.
