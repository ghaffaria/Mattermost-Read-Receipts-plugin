# RPC recovery — 1.1.3

Release **1.1.3** includes the lab-validated packaging and recovery changes described here. Publication is separate from deployment: this work did not deploy to or test production. The existing Android APK is unchanged.

## Findings and scope

The observed host log contains `yamux: keepalive failed: i/o deadline reached` before `plugin RPC connection is not responding`. A long pause of the plugin process reproduces this sequence. Once the transport is closed, resuming that same process does not repair the RPC session; Mattermost must start a new plugin process.

The exact scheduler or VM event behind the original unplanned pause was not captured. A later same-version reinstall and an ordered shutdown of the other local lab did not reproduce it. The controlled pause establishes the failure and recovery path, not that every RPC failure has the same external trigger.

Two recovery amplifiers were identified:

- Mattermost publishes the entire parent directory of `webapp.bundle_path`. The previous root-level `main.js` caused **53,553,926 bytes across 80 files**, including both server executables, to be copied into the client directory on every activation. The new layout publishes **10,615 bytes in one JavaScript file** through `webapp/main.js`.
- The host's automatic restart calls `Deactivate` and `Activate` separately from manual installation. Concurrent activation can race through removal and creation of the same client directory. The earlier failed restart overlapped manual recovery and reported `destination already exists`.

The lab installer drains the host health-check job before upload, restores its original setting in `finally`, verifies the running version, and serializes local installer invocations with a file lock. It only accepts the established loopback lab on port 19065 and refuses redirects. Automatic health checks remain enabled outside this short maintenance operation.

The version reported by `/api/v1/debug/ping` and the activation log now comes from one runtime constant, checked against `plugin.json` by a Go test. This fixes the misleading `1.1.1` ping previously returned by the `1.1.2` package.

No changes were made to receipt semantics, permission checks, source schemas, or the Android client. This change improves restart recovery; it cannot prevent an operating system from suspending a process or a transport from timing out.

## Source evidence

The host implementation was inspected at its recorded build commit:

- [Web bundle publication and plugin activation](https://github.com/mattermost/mattermost/blob/987e57120dca630dadbcd2638064ab66a02bb81e/server/public/plugin/environment.go)
- [RPC health check supervisor](https://github.com/mattermost/mattermost/blob/987e57120dca630dadbcd2638064ab66a02bb81e/server/public/plugin/supervisor.go)

## Lab installation

Use the already-authorized lab administrator token through `MM_ACCESS_TOKEN`. Never put it in a command argument, a checked-in file, or a report.

```sh
python3 ops/install_lab_plugin.py \
  dist/mattermost-readreceipts-1.1.3.tar.gz \
  --version 1.1.3
```

The helper temporarily drains **host plugin health checks**, then restores their previous setting. It does not change authentication, receipt cleanup settings, or channel permissions. If a connection fails during restoration, it exits with an error; check the effective setting before continuing. It is not a production deployment tool.

## Validation

The package and corresponding source archive are built together. Public client files are limited to the JavaScript directory; backend binaries and their notices remain in the installable plugin archive. Package tests check the entry points, executable modes, licenses, source correspondence, and exclusion of local work/runtime files.

Baseline controlled failure on 1.1.2: host health-check failure to activation took **14.885 seconds**. The same controlled failure on 1.1.3-rc.1 took **0.401 seconds**. These are observations on this Mac's Docker Desktop lab, not production latency guarantees. Both tests allowed the host to recover automatically without a manual enable/disable during recovery.

Go race tests, thirteen frontend tests, type checking, four packaging tests, four lab-installer tests, and the private-evidence source-export boundary test passed.

The full scenario passed using the installed macOS Desktop 6.3.2, build 408386646761, with a dedicated profile containing only two local lab servers. Source: Team Edition 12.1.0 on port 18065. Target: Enterprise 12.0.1, build 39742891057, on port 19065, with PostgreSQL 17.12 and the final **1.1.3** package. The Browser plugin was unavailable, so the existing Playwright installation was used. Web viewport: 1440 by 1000; the desktop used its native window.

1. The desktop author was logged into the source lab and signed out of the target.
2. The final artifact was installed on the target using the lab maintenance helper; host health checks were restored to enabled.
3. The author sent a message through the web composer. Two other web accounts viewed it, and one replied through the web composer. No API-created chat message or receipt was used.
4. The desktop author logged out of the source, selected the target server, logged in, and navigated through the sidebar without reload.
5. The same two web readers appeared on the same authored message at the first observation after channel navigation, and remained present through 17 seconds. Another logout and login retained the same readers.

Page identity, meaningful content, absence of a framework error overlay, screenshot evidence, and the interaction checks passed. No Read Receipts HTTP failure occurred during the final conversation scenario. Host access-control field requests returned 401 during logout/login transitions; those were separate from the plugin's requests. This does not claim independent human acceptance or compatibility with every host or desktop version.

Private runtime evidence, credentials, database copies, and desktop profiles remain outside the public source bundle.
