# Mattermost Android read-receipts client

This directory contains the preparation tool, checksum-pinned patch and source manifest for the derived Android client **2.46.0-rr.1**. It is based on official Mattermost Mobile **v2.46.0** and installs separately as `com.pardis.mattermost.readreceipts.qa`.

For the full prerequisites, signing procedure, build commands, APK installation and limitations, see [Android build and installation](../../docs/ANDROID.md). See [validation](../../docs/VALIDATION.md) for the tested client interactions and [licensing scope](../../LICENSING.md) for the upstream patch boundary.

The original Android APK has not been rebuilt by subsequent plugin licensing or documentation releases. Never commit a signing key, password, test credential or runtime data to this directory.
