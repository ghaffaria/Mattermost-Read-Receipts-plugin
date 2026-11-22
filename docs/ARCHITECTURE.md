# Architecture: explicit Mattermost message read receipts

The plugin separates three concerns: observing message visibility in a client, accepting an authenticated receipt on the server, and showing the sender a server-confirmed reader list. Message delivery and channel read cursors are not substitutes for explicit per-message receipts.

## Components and source layout

| Component | Location | Responsibility |
|---|---|---|
| Mattermost server plugin | `server/` | Authenticate requests, check channel access, persist receipts and publish live updates |
| Web/desktop client | `webapp/` | Observe focused conversation/message visibility and render Seen indicators |
| Derived Android client | `mobile/android/` | Pinned upstream patch, preparation script and source verification metadata |
| Lab maintenance | `ops/` | Coordinate local test installations with host RPC recovery; refuse non-lab destinations |
| Build and licensing | `build/` | Compile server architectures, build the web bundle and include legal/source notices |

The same web plugin is loaded by browsers and official Windows/macOS desktop apps. The Android client implements the receipt protocol in its native message lists. It is distributed separately from the official app.

## Receipt lifecycle

1. A client identifies a message belonging to the current account and conversation.
2. Visibility tracking starts only when the message meets the supported viewport rule and the client has reading attention.
3. Losing focus, hiding the client or moving the target outside the usable list discards partial dwell.
4. After the continuous interval, the client submits an explicit read observation.
5. The server validates identity, channel membership and the target message before committing the receipt.
6. The sender receives a live update or hydrates stored history and displays `✓✓ Seen by …` with confirmed readers.

No optimistic reader is invented while configuration or authorization is unknown. Each thread reply is an independent target, even when its parent has already been seen.

## PostgreSQL storage and preservation

The PostgreSQL store uses `read_events`, with a composite primary key on `message_id` and `user_id`, plus channel metadata and a first-read timestamp. `read_receipts_schema` tracks the plugin's migration state.

Initialization runs schema repair inside a transaction. It discovers the actual primary-key constraint rather than assuming a generated constraint name. Missing channel metadata is repaired through the authoritative Mattermost post mapping. Existing duplicate pairs cause the migration to fail and roll back rather than silently discard history.

Repeated reads preserve the original timestamp. Cleanup is explicitly opt-in; the default deployment preserves receipt history. Receipt endpoints require authentication and channel access, including private-channel membership. The documented outsider tests returned HTTP 403 for unauthorized reads and writes.

## Web and desktop visibility

The web controller combines active-document visibility, document focus, conversation context and rendered message geometry. Its isolated DOM adapter handles channel and thread displays. Separate copies of the same post in the channel and thread pane must not cancel a valid visible copy or generate duplicate writes.

The continuous clock is reset when reading attention is lost. This protects against false Seen caused by an open but unfocused or minimized desktop webview. Platform-specific behavior still requires client tests; [Windows validation](WINDOWS.md) records both observed cases and remaining coverage limits.

## Packaging and RPC recovery

The web entry point is `webapp/main.js` inside the plugin archive. Mattermost publishes the entire containing directory; keeping only browser assets there avoids copying backend executables during activation. Linux amd64 and arm64 executables remain at the archive root.

An expired internal RPC keepalive closes the transport. Automatic host recovery must create a new plugin process. The lab installer drains the host health-check job before a manual upload to avoid overlapping activation, then restores the previous setting. This maintenance behavior is external to receipt creation and does not change authorization or database semantics. See [RPC recovery scope and measured results](RPC_RECOVERY.md).

## Android viewport and lifecycle

Android uses ClientMix REST methods and per-list controllers scoped by server, account, channel and thread. Native focus snapshots supplement JavaScript app state. The visibility threshold is 50% of the smaller of rendered row height and usable viewport, continuously for the configured interval, normally 2000 ms.

Header, composer, software keyboard and inline unread banner are excluded from the usable list. Autocomplete and call overlays gate tracking. Foreground receipt polling runs every three seconds, settings refresh every 15 seconds, and batches are limited to 200 IDs. Retired controllers ignore late responses. Automatic network retry of the read POST is disabled; a controlled retry requires fresh dwell.

The network patch coalesces concurrent initialization, preserves handshake ownership, retires SDK wrappers before delayed close acknowledgements and recovers factory failures. Android event-generation identifiers prevent callbacks from old sockets from affecting their replacements. Strict sequence validation remains enabled. SDK URL validation accepts localhost/internal hostnames while retaining protocol, host, port and TLS checks.

## Distribution boundaries

The Android patch is checksum-pinned against official Mobile v2.46.0. Applying it does not require an APK-specific server database migration. Project metadata, source and notices are included in the plugin/source release; private signing keys, database snapshots and runtime credentials are excluded.

MPL-2.0 applies to project-owned source as described in [LICENSING.md](../LICENSING.md). Mattermost and dependencies retain their own licensing. See [validation](VALIDATION.md) for the difference between visibility evidence and proof of comprehension, as well as limits for tall posts, push, physical devices and production policies.
