# Android build and installation

See [Persian build commands](../mobile/android/README.fa.md) and [release metadata](../mobile/android/release.json). The preparation script clones pinned official v2.46.0, verifies the commit and patch/file hashes, and refuses to overwrite an existing destination.

Requirements: Node24.15.0/npm11, Python3, JDK17, SDK36, NDK27.1.12297006, CMake3.22.1. Run prepare.py with a new absolute destination, then npm11 ci --ignore-scripts. Set RR_JAVA_HOME, ANDROID_SDK_ROOT and RR_QA_SIGNING_CONFIG and run scripts/build-read-receipts-qa.sh. The signing JSON must be private600 and contain store_file, store_password, key_alias. Keep the same key for future updates; never commit it. Output: android/app/build/outputs/apk/release/app-release.apk.

The released APK is arm64, minAPI30/target36, non-debuggable, standalone Hermes and QA-signed. Install alongside the official app. Do not uninstall or clear the official app. Updates of this custom ID use the same signing key and adb install -r. Enter the chosen server URL and account manually; no QA endpoint or credential is embedded. Push is not configured for this custom ID.

Validation commands after preparation/build:

```sh
node --test scripts/test-read-receipts-network-client.cjs
npx jest app/products/read_receipts app/client/websocket app/managers/websocket_manager.test.ts --runInBand
npx tsc --noEmit
```

The published source reproduces the tested source files; deterministic byte-for-byte APK rebuilding is not claimed. The checked-in source-files.json identifies39 changed files; SDK patch includes12 files. See validation for the exact original APK checksum.
