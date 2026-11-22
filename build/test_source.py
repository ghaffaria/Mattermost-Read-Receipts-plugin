# Copyright 2026 Alireza Ghaffari
# SPDX-License-Identifier: MPL-2.0

"""Private local evidence must not become corresponding-source material."""
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import tempfile
import unittest


class SourceExportBoundary(unittest.TestCase):
    def test_keeps_build_sources_and_excludes_private_evidence(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            files = {
                'plugin.json': '{"version":"test"}',
                'server/main.go': 'package main\n',
                'webapp/plugin.tsx': 'export default {};\n',
                'webapp/package.json': '{}',
                'ops/install_lab_plugin.py': '# public tool\n',
                'docs/RPC_RECOVERY.md': '# Public notes\n',
                'docs/screenshots/desktop-five-member-readers.png': 'public image fixture',
                'mobile/android/source-files.json': '{}',
                'docs/screenshots/private-unlisted.png': 'PRIVATE_EXPORT_CANARY',
                'docs/evidence/snapshot.json': 'PRIVATE_EXPORT_CANARY',
                'ops/qa-accounts.json': 'PRIVATE_EXPORT_CANARY',
                'server/runtime.env': 'PRIVATE_EXPORT_CANARY',
                'webapp/node_modules/dep/file.js': 'PRIVATE_EXPORT_CANARY',
                '.local/db.dump': 'PRIVATE_EXPORT_CANARY',
            }
            for name, content in files.items():
                p = root / name
                p.parent.mkdir(parents=True, exist_ok=True)
                p.write_text(content)
            (root / 'build').mkdir()
            shutil.copy2(Path(__file__).with_name('source.py'), root / 'build/source.py')
            subprocess.run([sys.executable, str(root / 'build/source.py')], check=True, capture_output=True)
            with tarfile.open(root / 'dist/mattermost-readreceipts-test-source.tar.gz') as archive:
                names = archive.getnames()
                self.assertIn('server/main.go', names)
                self.assertIn('webapp/package.json', names)
                self.assertIn('docs/RPC_RECOVERY.md', names)
                self.assertIn('docs/screenshots/desktop-five-member-readers.png', names)
                self.assertIn('mobile/android/source-files.json', names)
                for item in archive.getmembers():
                    if item.isfile():
                        self.assertNotIn(b'PRIVATE_EXPORT_CANARY', archive.extractfile(item).read(), item.name)


if __name__ == '__main__':
    unittest.main()
