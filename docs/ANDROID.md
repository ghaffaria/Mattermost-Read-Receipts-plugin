# Build and install the Mattermost Android read-receipts client

The derived Android app implements the explicit per-message visibility protocol used by this plugin. It is based on official Mattermost Mobile **v2.46.0**, pinned to commit `655df13b131da6810f4f073622c925af1b87c3fb`.

Release **2.46.0-rr.1** uses application ID `com.pardis.mattermost.readreceipts.qa`. It installs alongside the vendor app and does not reuse or clear its data. Subsequent plugin licensing/documentation updates do not change this APK.

## Prerequisites

| Tool | Recorded build version |
|---|---|
| Node.js | 24.15.0 |
| npm | 11 |
| Python | Python 3 for preparation |
| Java | JDK 17 |
| Android SDK | 36 |
| Android NDK | 27.1.12297006 |
| CMake | 3.22.1 |

Use [release metadata](../mobile/android/release.json), the [source-file manifest](../mobile/android/source-files.json) and the preserved patch when reproducing the build. The preparation script refuses an existing destination, verifies the official upstream commit and checks the patched files against recorded hashes.

## Prepare a new checkout

From the plugin repository root:

```sh
python3 mobile/android/prepare.py /absolute/new/path/mobile-rr
cd /absolute/new/path/mobile-rr
npx --yes npm@11 ci --ignore-scripts
```

Use an absolute destination that does not already exist. A checksum mismatch is a reason to stop and investigate the source, not to bypass verification.

## Provide private signing configuration

Create a private JSON file with your keystore location and signing values. The build expects the fields `store_file`, `store_password` and `key_alias`. Restrict the file to its owner and keep it outside the repository:

```sh
chmod 600 /absolute/private/signing.json
export RR_JAVA_HOME=/absolute/path/to/jdk17
export ANDROID_SDK_ROOT=/absolute/path/to/android-sdk
export RR_QA_SIGNING_CONFIG=/absolute/private/signing.json
bash scripts/build-read-receipts-qa.sh
```

The password and keystore are not included in this repository. Preserve the same signing key for updates of your installation; an independently signed build is not an in-place update to a differently signed APK. The published QA app is not vendor-signed.

Build output:

```text
android/app/build/outputs/apk/release/app-release.apk
```

## Validate the prepared source

```sh
node --test scripts/test-read-receipts-network-client.cjs
npx jest app/products/read_receipts app/client/websocket app/managers/websocket_manager.test.ts --runInBand
npx tsc --noEmit
```

The checked-in manifests cover 39 changed upstream files and 12 SDK-patch files for the recorded release. Source reproduction was checked, but byte-for-byte deterministic APK rebuilding is not claimed. A different build toolchain or signing key can produce different APK bytes.

## Install without replacing the official app

The published APK is arm64, minimum API 30, target API 36, non-debuggable and uses a standalone Hermes bundle. Check its release checksum before installing.

For an update signed with the same key:

```sh
adb install -r /absolute/path/to/the-compatible-signed.apk
```

Do not uninstall or clear the official Mattermost app to install this package. Enter the chosen server URL and account explicitly; the application does not embed a lab account or credential.

## Test read receipts across clients

Use separate accounts in Android-to-Android, Android-to-web and Android-to-desktop conversations. For each direction, check unopened/offscreen targets before confirming their matching positive cases after actual viewing. Repeat for threads, keyboard/composer changes, backgrounding and reconnects as appropriate to your deployment.

## Known distribution limits

Custom Firebase/HPNS push is not configured or qualified for this package ID. Organization-wide deployment requires organization-owned push configuration and a separate validation pass. The recorded lab used two Android 16/API 36 arm64 emulators; physical devices, other API levels, iOS and production Enterprise Advanced policies were not certified.

See [full validation](VALIDATION.md), [installation and rollback](INSTALLATION.md) and [licensing scope](../LICENSING.md). Upstream Mattermost Mobile licensing remains in force for the mixed-origin Android patch and existing APK.
