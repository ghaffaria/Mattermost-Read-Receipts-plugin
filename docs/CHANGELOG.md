# Changelog

## 1.1.3 — 2026-11-22

- Move the public web entry point into `webapp/main.js`; only JavaScript assets are published by the host instead of the full plugin root.
- Add a loopback-only lab installer that coordinates with automatic host recovery, preserves the previous health-check setting, and verifies runtime version.
- Report one tested version constant in ping responses and activation logs.
- Generate the matching MPL-covered source archive alongside the installable package, retaining legal notices while excluding private local runtime/evidence files.
- Add distribution-boundary, source-export and installer checks. Preserve existing receipt logic, first-read timestamps and channel permission checks.
- Validate the web-only conversation and desktop server-switch path in the isolated Enterprise 12.0.1 lab. The controlled RPC-recovery measurements were recorded on 1.1.3-rc.1; the original external pause trigger was not captured.
- Keep the Android APK **2.46.0-rr.1** and mobile source unchanged. No production deployment is part of this release.

## 1.1.2

MPL-2.0 licensing, developer attribution and corresponding-source availability. Receipt behavior remained unchanged from 1.1.1. The maintainer reported company production use; this is separate from independent lab acceptance.

## 1.1.1 / Android 2.46.0-rr.1

Earlier web/desktop visibility and thread corrections, followed by the separately installed derived Android client. See the retained [validation](VALIDATION.md) and [Windows evidence](WINDOWS.md) for tested scenarios and limitations.
