# Licensing

Original project source in `server/`, `webapp/`, `build/`, `ops/` and the project-owned Android preparation script is licensed under **Mozilla Public License 2.0 (MPL-2.0)**. SPDX headers identify covered source files. See [LICENSE](LICENSE). Project-owned manifests, build configuration and documentation are also covered by MPL-2.0 unless an explicit different notice applies. Copyright 2026 Alireza Ghaffari.


## Third-party boundaries

- Mattermost server/mobile and other dependencies retain their original licenses and notices. Root MPL licensing does not relicense them.
- `mobile/android/read-receipts-2.46.0-rr.1.patch` is a mixed-origin patch against the official pinned Mattermost Mobile source. It contains upstream context and modifications. It is excluded from the blanket MPL grant; applicable upstream file licenses remain in force. The existing Android APK is not relicensed or rebuilt by this release. See the [pinned upstream licensing](https://github.com/mattermost/mattermost-mobile/tree/v2.46.0).
- Bundled Go dependencies are listed in [THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt); original license/notice texts are included under `licenses/`. Mattermost v6.7.2 explicitly licenses its `model/` and `plugin/` SDK directories under Apache-2.0; the plugin imports those SDK paths. The dependency's complete licensing policy is preserved.
- Go's standard library retains the Go Authors' BSD license. Frontend runtime uses project code and Webpack's generated loader; build tools retain their own licenses and are not relicensed by the project.

## Corresponding source availability

See [SOURCE_CODE.txt](SOURCE_CODE.txt) for the versioned source location. The repository is now public, and a corresponding source archive accompanies the plugin release. When redistributing covered binaries, provide recipients the corresponding source or a valid source location as required by MPL-2.0. Historical release documents describe the repository visibility at the time of their creation.

