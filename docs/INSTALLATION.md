# Installation, preservation and rollback

Download the plugin and APK from Releases and verify SHA256SUMS. Keep production unchanged until an isolated staging rehearsal on your real version, license policies and data succeeds.

Before a server change, record server/database/plugin versions and settings. Create and verify a coordinated backup of PostgreSQL, uploaded data, configuration and existing plugin files during a controlled maintenance window. Keep its credentials private. Rehearse restoration in a separate environment. The repository does not contain your data or deployment configuration.

Install plugin1.1.1 through Mattermost System Console plugin management, enable it and verify configuration. Check the plugin logs and authentication/channel permissions. Test with separate users in DM/public/private/group and threads: receipt absent while offscreen or unfocused, present only after actual continuous visibility, exact reader subset, unchanged first timestamp after reopening. Repeat over the real proxy/TLS path. See validation for known limits.

Install the separately signed Android APK alongside the vendor app; never clear/uninstall the vendor app to install this package. Log in separately to an authorized staging server. The APK adds no server schema migration. Push needs organization-owned Firebase/HPNS configuration and separate validation before organization-wide distribution.

For a client rollback, close the QA app and return to the official client; stored messages and valid server receipts remain. The official client lacks this custom receipt feature. For plugin rollback, disable the new plugin and restore the recorded prior package/settings. If database/server migrations were also performed, restore the coordinated database/files/config backup with its matching server version; do not assume binary downgrade alone is safe. Preserve failed-run logs and avoid deleting receipt tables.
