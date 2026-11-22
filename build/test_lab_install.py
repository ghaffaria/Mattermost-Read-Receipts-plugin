# Copyright 2026 Alireza Ghaffari
# SPDX-License-Identifier: MPL-2.0

import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('lab_install', Path(__file__).resolve().parents[1] / 'ops/install_lab_plugin.py')
lab = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lab)


class FakeClient:
    def __init__(self, fail=False, initial=True):
        self.enabled = initial
        self.fail = fail
        self.events = []

    def health_setting(self, enabled):
        self.events.append(('health', enabled))
        self.enabled = enabled

    def request(self, method, route, data=None, content_type=None):
        if route == '/api/v4/config':
            return {'PluginSettings': {'EnableHealthCheck': self.enabled}}
        self.events.append((method, route))
        if method == 'POST':
            if self.enabled:
                raise AssertionError('upload raced with the health-check job')
            if self.fail:
                raise RuntimeError('simulated upload failure')
            return {'id': 'mattermost-readreceipts', 'version': 'test'}
        return {'version': 'test'}


class LabMaintenanceContract(unittest.TestCase):
    def test_refuses_every_non_lab_destination(self):
        for url in ['https://company.example', 'http://localhost:8065', 'http://localhost:19065/other',
                    'http://localhost:19065@company.example', 'http://localhost:19065?host=other',
                    'http://localhost.:19065']:
            with self.subTest(url=url), self.assertRaises(ValueError):
                lab.validate_base(url)
        self.assertEqual(lab.validate_base('http://localhost:19065/'), 'http://localhost:19065')

    def run_install(self, client):
        with tempfile.NamedTemporaryFile() as archive:
            archive.write(b'test artifact')
            archive.flush()
            return lab.install(client, archive.name, 'test')

    def test_drains_health_job_before_upload_and_restores_after_verification(self):
        client = FakeClient()
        self.run_install(client)
        self.assertEqual(client.events, [('health', False), ('POST', '/api/v4/plugins'),
                                         ('GET', '/plugins/mattermost-readreceipts/api/v1/debug/ping'),
                                         ('health', True)])

    def test_failed_upload_always_restores_automatic_recovery(self):
        client = FakeClient(fail=True)
        with self.assertRaises(RuntimeError):
            self.run_install(client)
        self.assertTrue(client.enabled)

    def test_respects_preexisting_disabled_health_setting(self):
        client = FakeClient(initial=False)
        self.run_install(client)
        self.assertFalse(client.enabled)


if __name__ == '__main__':
    unittest.main()
