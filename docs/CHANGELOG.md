# Changelog

## 1.1.3 — 2026-11-22

**Post-release clarification (2026-11-22):** On 2026-11-22, the maintainer reported that the original production incident (missing Seen lists in the desktop client) was resolved by logging out and logging back in once while the previous plugin version was still installed. Version 1.1.3 had not been deployed at the time of that report. **The resolution of that incident must not be attributed to 1.1.3.** The precise production root cause remains unconfirmed; the laboratory RPC findings are separate evidence. This is an operator-reported outcome; 1.1.3 remains a packaging and laboratory RPC-recovery update.

- Move the public web entry point into `webapp/main.js`; only JavaScript assets are published by the host instead of the full plugin root.
- Add a loopback-only lab installer that coordinates with automatic host recovery, preserves the previous health-check setting, and verifies runtime version.
- Report one tested version constant in ping responses and activation logs.
- Generate the matching MPL-covered source archive alongside the installable package, retaining legal notices while excluding private local runtime/evidence files.
- Add distribution-boundary, source-export and installer checks. Preserve existing receipt logic, first-read timestamps and channel permission checks.
- Validate the web-only conversation and desktop server-switch path in the isolated Enterprise 12.0.1 lab. The controlled RPC-recovery measurements were recorded on 1.1.3-rc.1; the laboratory pause's external trigger was not captured.
- Keep the Android APK **2.46.0-rr.1** and mobile source unchanged. No production deployment is part of this release.

## 1.1.2

MPL-2.0 licensing, developer attribution and corresponding-source availability. Receipt behavior remained unchanged from 1.1.1. The maintainer reported company production use; this is separate from independent lab acceptance.

## 1.1.1 / Android 2.46.0-rr.1

Earlier web/desktop visibility and thread corrections, followed by the separately installed derived Android client. See the retained [validation](VALIDATION.md) and [Windows evidence](WINDOWS.md) for tested scenarios and limitations.
