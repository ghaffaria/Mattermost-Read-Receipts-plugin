# Copyright 2026 Alireza Ghaffari
# SPDX-License-Identifier: MPL-2.0

"""Install a local test artifact without overlapping Mattermost's RPC recovery.

Only the established loopback lab on port 19065 is accepted. Credentials are
read from MM_ACCESS_TOKEN and never written. The original health-check setting
is restored even when upload or verification fails.
"""
import argparse
import fcntl
import json
import os
from pathlib import Path
import tempfile
import urllib.parse
import urllib.request
import uuid


def validate_base(base):
    parsed = urllib.parse.urlsplit(base)
    if (parsed.scheme != 'http' or parsed.hostname not in ('localhost', '127.0.0.1')
            or parsed.port != 19065 or parsed.path not in ('', '/')
            or parsed.username or parsed.password or parsed.query or parsed.fragment):
        raise ValueError('Only http://localhost:19065 or http://127.0.0.1:19065 is allowed')
    return base.rstrip('/')


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class LabClient:
    def __init__(self, base, token):
        self.base = validate_base(base)
        self.token = token
        self.opener = urllib.request.build_opener(NoRedirect())

    def request(self, method, route, data=None, content_type='application/json'):
        if data is not None and not isinstance(data, bytes):
            data = json.dumps(data).encode()
        req = urllib.request.Request(self.base + route, data=data, method=method,
                                     headers={'Authorization': 'Bearer ' + self.token,
                                              'Content-Type': content_type})
        with self.opener.open(req, timeout=180) as response:
            return json.load(response)

    def health_setting(self, enabled):
        self.request('PUT', '/api/v4/config/patch', {'PluginSettings': {'EnableHealthCheck': enabled}})


def install(client, archive, expected_version):
    config = client.request('GET', '/api/v4/config')
    original = config['PluginSettings']['EnableHealthCheck']
    # In Mattermost 12.0.1, cancellation drains the running health-check job.
    # Do this BEFORE uploading: that job calls Activate outside the app's
    # installation lock and otherwise races with manual installation.
    try:
        client.health_setting(False)
        boundary = 'rr-lab-' + uuid.uuid4().hex
        body = (f'--{boundary}\r\nContent-Disposition: form-data; name="force"\r\n\r\ntrue\r\n'
                f'--{boundary}\r\nContent-Disposition: form-data; name="plugin"; filename="plugin.tar.gz"\r\n'
                'Content-Type: application/gzip\r\n\r\n').encode()
        body += Path(archive).read_bytes() + f'\r\n--{boundary}--\r\n'.encode()
        manifest = client.request('POST', '/api/v4/plugins', body,
                                  'multipart/form-data; boundary=' + boundary)
        if manifest.get('id') != 'mattermost-readreceipts' or manifest.get('version') != expected_version:
            raise RuntimeError('Unexpected installed plugin identity/version')
        ping = client.request('GET', '/plugins/mattermost-readreceipts/api/v1/debug/ping')
        if ping.get('version') != expected_version:
            raise RuntimeError('Runtime version differs from uploaded package')
    finally:
        # This also runs if the initial maintenance request timed out after the
        # server applied it. Never leave automatic recovery disabled silently.
        client.health_setting(original)
    effective = client.request('GET', '/api/v4/config')
    if effective['PluginSettings']['EnableHealthCheck'] != original:
        raise RuntimeError('Health-check setting was not restored')
    return {'version': expected_version, 'health_check_restored': original}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archive', type=Path)
    parser.add_argument('--version', required=True)
    parser.add_argument('--base-url', default='http://localhost:19065')
    args = parser.parse_args()
    token = os.environ.get('MM_ACCESS_TOKEN')
    if not token:
        raise SystemExit('MM_ACCESS_TOKEN is required')
    client = LabClient(args.base_url, token)
    # Serialize invocations on this Mac as well as draining the host job.
    with open(Path(tempfile.gettempdir()) / 'mattermost-rr-lab-install.lock', 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        print(json.dumps(install(client, args.archive, args.version)))


if __name__ == '__main__':
    main()
