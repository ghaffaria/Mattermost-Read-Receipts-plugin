# Validation — 2026-11-21

Environment: Enterprise12.0.1/build39742891057/schema234/PostgreSQL17.12, Entry license; installed macOS Desktop6.3.2; two Android16/API36 arm64 emulators. The production Enterprise Advanced environment was not accessed/deployed. Synthetic users:1 desktop author,2/3 web,4/5 native Android.

Plugin1.1.1 and Android2.46.0-rr.1(candidate4) were tested.32 target scenarios and9 supporting fixtures were recorded; fixtures are not independent acceptance tests.

| Scenario | Observed result |
|---|---|
| Android ↔ Android / Web / installed Mac Desktop | All six directions passed with real client UI messages, exact reader identities and author exclusion |
| Five-member public/private channels | Public: readers2+4; private:3+4; author1 and unseen members absent |
| Five-member group, two messages | First: readers2+4. Second:3+5. Reading second did not mark the older offscreen first |
| Public/private scrolled up | Target absent, no Seen for6.696/6.510s; same target Seen after scrolling into view |
| Collapsed reply / opened native Thread | No reply receipt≥6.5s while collapsed; E-only after opening |
| Notification shade / cold-start under shade | No Seen6.685/6.651s; correct receipt after restore; cold-start→shade98ms |
| Interrupted exposure | Visible~800–850ms then hidden6.541s without Seen; fresh dwell required on return |
| Software keyboard / multiline composer | Usable list ends1289/1136px; targets above composer receive valid Seen |
| Autocomplete covering target | No receipt6.507s; same message receives Seen after overlay closes |
| Expanded80-line post | Row23.5% viewport: no Seen6.700s; same post98.5% viewport: E-only Seen |
| Native connection soak | Four live targets over111.499s, same process/no navigation;3real reliable reconnects, no observed sequence gaps/errors; new target after35s further idle passed |
| Restart | Session retained, one receipt row and original first timestamps preserved |
| Private channel outsider | GET/POST403, no unauthorized write |

## Windows desktop follow-up

**PASS for the tested Windows ↔ web scenarios.** Public/private unopened messages, offscreen scroll, minimize/restore and closed/open thread responses were checked with paired negative/positive server evidence. Reverse-direction receipts and Windows rendering were also verified. These additional Windows tests are separate from the earlier 32 Android target scenarios. See [Windows validation](WINDOWS.md) for screenshots, evidence and operator-reported additional acceptance. Exact Windows/desktop version was not recorded.

## Automated and preservation checks

- Jest154/154 in13 suites; actual SDK source/CJS/module61/61; native JVM8/8(5new,3existing).
- TypeScript and lint passed.39 changed upstream files and12 SDK files match the C4 build; clean pinned-source reconstruction passed.
- Both installed APK hashes match the release. Existing official/older Android packages and custom first-install time stayed unchanged; temporary emulator input settings were restored.
- Original local data/authentication and6physical files were preserved. All original laboratory posts/accounts/channels/receipt timestamps were preserved; only authorized test data/reads were appended. Private database snapshots and credentials are not published.

## Retained exceptions and limits

An initial emoji negative expectation failed: the target was fully visible ABOVE the inline emoji keyboard, so Seen at create+2557ms was legitimate. The wrong expectation was retained and classified; the valid positive behavior passed. A first-time skin-tone tooltip negative had API evidence only; no archived negative frame.

One browser group navigation remained on Loading and timed out before target rendering. UI send/reopen recovered; correct readers were then verified. Root cause remains unproven. Earlier candidate2 failed sustained live delivery; its concurrent WebSocket lifecycle bug was fixed and retested in C4. Candidate3 was withdrawn before installation after teardown review. These are not represented as clean initial command passes.

Visibility means50% of min(row height, usable viewport) for2continuous seconds; it does not prove comprehension or reading every line of a tall post. Tall full height>4500px is inferred from80lines, not measured from clipped bounds. Actual unread-banner Cancel interaction and live calls were not exercised. No physical-device/otherAPI/iOS/rotation/multiwindow/HA/load/production-policy or push certification. Custom Firebase/HPNS push remains unconfigured; artifacts are QA-signed.

## Screenshots

All accounts are synthetic. Screenshots are unaltered test captures.

![Five-member per-message readers](screenshots/desktop-five-member-readers.png)
![Offscreen target while scrolled up](screenshots/android-scrolled-up.png)
![Same target visible after scrolling](screenshots/android-after-scroll.png)
![Suggestions cover the target](screenshots/android-autocomplete-covered.png)
![Multiline composer reduces usable viewport](screenshots/android-multiline-keyboard.png)
![Tall post below visibility threshold](screenshots/android-tall-partial.png)
![Same tall post above viewport threshold](screenshots/android-tall-visible.png)
