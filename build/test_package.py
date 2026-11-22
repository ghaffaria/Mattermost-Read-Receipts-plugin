# Copyright 2026 Alireza Ghaffari
# SPDX-License-Identifier: MPL-2.0

"""Verify the installable artifact's client/server boundary and entry points."""
import json
import os
from pathlib import Path, PurePosixPath
import tarfile
import unittest


class PackageContract(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        root = Path(__file__).resolve().parents[1]
        version = json.loads((root / 'plugin.json').read_text())['version']
        cls.archive = tarfile.open(os.environ.get(
            'RR_PACKAGE_UNDER_TEST', root / 'dist' / f'mattermost-readreceipts-{version}.tar.gz'))
        cls.manifest = json.load(cls.archive.extractfile('plugin.json'))

    @classmethod
    def tearDownClass(cls):
        cls.archive.close()

    def test_host_only_publishes_javascript_directory(self):
        # Mattermost publishes the WHOLE directory containing bundle_path.
        # A root-level entry point consequently publishes the backend binaries.
        bundle = PurePosixPath(self.manifest['webapp']['bundle_path'])
        self.assertNotEqual(str(bundle.parent), '.', 'web bundle must have its own directory')
        published = [m.name for m in self.archive.getmembers()
                     if PurePosixPath(m.name).parent == bundle.parent]
        self.assertIn(str(bundle), published)
        self.assertTrue(all(n.endswith(('.js', '.js.LICENSE.txt')) for n in published), published)
        self.assertLess(sum(self.archive.getmember(n).size for n in published), 1024 * 1024)

    def test_all_manifest_entry_points_exist(self):
        self.assertTrue(self.archive.getmember(self.manifest['webapp']['bundle_path']).isfile())
        self.assertEqual(set(self.manifest['server']['executables']), {'linux-amd64', 'linux-arm64'})
        for name in self.manifest['server']['executables'].values():
            member = self.archive.getmember(name)
            self.assertTrue(member.isfile())
            self.assertTrue(member.mode & 0o111, name)

    def test_licenses_and_source_notice_preserved(self):
        for name in ['LICENSE', 'NOTICE', 'LICENSING.md', 'SOURCE_CODE.txt', 'THIRD_PARTY_NOTICES.txt']:
            self.assertGreater(self.archive.getmember(name).size, 0, name)
        self.assertTrue(any(m.name.startswith('licenses/_third_party/') for m in self.archive.getmembers()))

    def test_matching_source_has_changes_and_no_local_runtime_data(self):
        source = Path(self.archive.name).with_name(
            'mattermost-readreceipts-' + self.manifest['version'] + '-source.tar.gz')
        with tarfile.open(source) as archive:
            names = archive.getnames()
            self.assertIn('ops/install_lab_plugin.py', names)
            self.assertIn('server/version.go', names)
            self.assertEqual(json.load(archive.extractfile('plugin.json'))['version'], self.manifest['version'])
            for name in names:
                parts = PurePosixPath(name).parts
                self.assertFalse(any(p in ('.local', '.git', '.build', 'node_modules', 'dist') for p in parts), name)
                self.assertFalse(name.endswith(('.apk', '.jks', '.keystore', '.dump', '.env', '.log')), name)


if __name__ == '__main__':
    unittest.main()
