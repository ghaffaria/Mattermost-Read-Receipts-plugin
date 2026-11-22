# Copyright 2026 Alireza Ghaffari
# SPDX-License-Identifier: MPL-2.0

"""Create the corresponding source artifact without local runtime/work files."""
from pathlib import Path
import gzip
import json
import tarfile

root = Path(__file__).resolve().parents[1]
version = json.loads((root / 'plugin.json').read_text())['version']
filename = f'mattermost-readreceipts-{version}-source.tar.gz'
(root / 'SOURCE_CODE.txt').write_text(
    f'Corresponding source for Mattermost Read Receipts {version}:\n\n'
    f'The matching source archive is generated alongside this plugin:\n{filename}\n\n'
    f'Versioned source: https://github.com/ghaffaria/Mattermost-Read-Receipts-plugin/tree/v{version}\n'
    f'Release: https://github.com/ghaffaria/Mattermost-Read-Receipts-plugin/releases/tag/v{version}\n\n'
    'Public project:\n'
    'https://github.com/ghaffaria/Mattermost-Read-Receipts-plugin\n\n'
    'When redistributing covered binaries, provide the matching source archive or\n'
    'equivalent source access as required by MPL 2.0 section 3.2.\n\n'
    'Developed by Alireza Ghaffari\nhttps://github.com/ghaffaria\n')
files = [root / n for n in ('LICENSE', 'LICENSING.md', 'NOTICE', 'SOURCE_CODE.txt',
                            'THIRD_PARTY_NOTICES.txt', 'README.md', 'Makefile',
                            'plugin.json', 'go.mod', 'go.sum')]
allowed = {
    'server': {'.go'},
    'webapp': {'.ts', '.tsx', '.js', '.jsx', '.css'},
    'build': {'.py', '.go'},
    'ops': {'.py', '.sh', '.md', '.yml'},
    'mobile': {'.patch', '.md', '.py'},
}
public_docs = {'ARCHITECTURE.md', 'CONFIGURATION.md', 'INSTALLATION.md',
               'UPGRADE.md', 'TESTING.md', 'RPC_RECOVERY.md', 'ANDROID.md',
               'COMMUNITY_REQUESTS.md', 'VALIDATION.md', 'WINDOWS.md', 'CHANGELOG.md'}
# Curated evidence that was already public in the preceding release.
public_evidence = {
    'screenshots/android-after-scroll.png',
    'screenshots/android-autocomplete-covered.png',
    'screenshots/android-multiline-keyboard.png',
    'screenshots/android-notification-shade.png',
    'screenshots/android-scrolled-up.png',
    'screenshots/android-tall-partial.png',
    'screenshots/android-tall-visible.png',
    'screenshots/desktop-five-member-readers.png',
    'windows/evidence/01-unopened-public.json',
    'windows/evidence/02-roundtrip-before-web-focus.json',
    'windows/evidence/02-user-windows-reply.png',
    'windows/evidence/03-reply-after-web-focus.json',
    'windows/evidence/03-windows-reply-seen.png',
    'windows/evidence/04-web-minimized-no-seen.png',
    'windows/evidence/04-windows-minimized.json',
    'windows/evidence/05-web-restored-seen.png',
    'windows/evidence/05-windows-restored.json',
    'windows/evidence/07-web-scroll-no-seen.png',
    'windows/evidence/07-windows-scrolled-up.json',
    'windows/evidence/08-web-scroll-seen.png',
    'windows/evidence/08-windows-scroll-visible.json',
    'windows/evidence/09-private-unopened.json',
    'windows/evidence/10-private-visible.json',
    'windows/evidence/12-private-scrolled-up.json',
    'windows/evidence/12-web-private-scroll-no-seen.png',
    'windows/evidence/13-private-scroll-visible.json',
    'windows/evidence/13-web-private-scroll-seen.png',
    'windows/evidence/14-thread-closed.json',
    'windows/evidence/14-web-thread-closed-no-seen.png',
    'windows/evidence/15-thread-visible.json',
    'windows/evidence/15-web-thread-seen.png',
    'windows/evidence/16-final-receipt-audit.json',
}
for directory in ('server', 'webapp', 'build', 'ops', 'docs', 'licenses', 'mobile'):
    for p in (root / directory).rglob('*'):
        parts = p.relative_to(root).parts
        if (not p.is_file() or p.is_symlink()
                or any(x.startswith('.') or x in ('node_modules', 'dist', '__pycache__') for x in parts)
                or p.suffix in ('.apk', '.jks', '.keystore', '.dump', '.log', '.pyc')):
            continue
        if directory == 'docs' and not ((p.parent == root / 'docs' and p.name in public_docs)
                                        or p.relative_to(root / 'docs').as_posix() in public_evidence):
            continue
        if directory in allowed and p.suffix not in allowed[directory]:
            if not ((directory == 'webapp' and p.parent == root / 'webapp'
                     and p.name in ('package.json', 'package-lock.json', 'tsconfig.json'))
                    or (directory == 'mobile' and p.parent == root / 'mobile/android'
                        and p.name in ('source-files.json', 'release.json'))):
                continue
        if p.suffix in ('.key', '.pem', '.p12', '.pfx', '.db', '.sqlite', '.sql', '.zip'):
            continue
        files.append(p)
dest = root / 'dist' / filename
dest.parent.mkdir(exist_ok=True)
with dest.open('wb') as raw, gzip.GzipFile(fileobj=raw, mode='wb', mtime=0) as compressed:
    with tarfile.open(fileobj=compressed, mode='w') as archive:
        for p in sorted(files):
            if not p.is_file():
                continue
            info = archive.gettarinfo(str(p), arcname=str(p.relative_to(root)))
            info.uid = info.gid = info.mtime = 0
            info.uname = info.gname = ''
            info.mode = 0o644
            with p.open('rb') as source:
                archive.addfile(info, source)
print(dest)
