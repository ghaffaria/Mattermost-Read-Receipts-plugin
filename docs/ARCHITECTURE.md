# Architecture

The server stores one explicit first-read timestamp per message/user in PostgreSQL. Channel cursors and message delivery do not infer readers. Authentication and channel membership apply to receipt reads and writes; outsider GET/POST requests to a private channel returned403.

The web plugin uses a focused-window/active-document controller and an isolated DOM adapter, including channel and thread displays. Losing visibility or focus resets the continuous dwell. Server-confirmed history supplies the indicator; no optimistic readers are invented.

Android uses ClientMix REST methods, per-list controllers scoped by server/account/channel/thread, and native window-focus snapshots. Visibility is50% of the smaller of rendered row height and usable viewport, continuously for2000ms. Header, composer, software keyboard and inline unread banner are excluded from the usable list. Autocomplete and call overlays gate tracking. Receipt polling is3seconds in foreground; settings refresh every15seconds; batches are limited to200 IDs. Retired controllers ignore late responses. Automatic network retries for the read POST are disabled; controlled retry requires fresh dwell.

The native network patch coalesces concurrent initialization, retains handshake ownership, retires SDK wrappers before delayed close acknowledgements, recovers factory failures, and uses Android event-generation identifiers so old sockets cannot affect successors. Strict sequence validation remains enabled. SDK URL validation accepts localhost/internal hostnames while preserving protocol/host/port checks and TLS verification.

The Android fork is distributed as a checksum-verified patch against official v2.46.0. No server database schema changes are required by the APK. Source locations: server/, webapp/, mobile/android/. Signing material and runtime state are excluded.
