#!/usr/bin/env python3
"""Prepare a pinned upstream checkout and apply the maintained Android patch."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('destination', type=Path, help='New, empty checkout path; existing paths are never overwritten')
    args = parser.parse_args()
    bundle = Path(__file__).resolve().parent
    release = json.loads((bundle / 'release.json').read_text())
    patch = bundle / release['source_patch']
    if hashlib.sha256(patch.read_bytes()).hexdigest() != release['source_patch_sha256']:
        raise SystemExit('Source patch checksum differs from release.json. Nothing was cloned or applied.')
    destination = args.destination.expanduser().resolve()
    if destination.exists():
        parser.error('Destination already exists; choose a new path.')
    subprocess.run([
        'git', 'clone', '--depth', '1', '--branch', release['upstream_tag'],
        release['upstream_repository'], str(destination),
    ], check=True)
    commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=destination, text=True).strip()
    if commit != release['upstream_commit']:
        raise SystemExit('Upstream commit differs from the recorded release. The patch was not applied.')
    subprocess.run(['git', 'apply', '--check', '--whitespace=nowarn', str(patch)], cwd=destination, check=True)
    subprocess.run(['git', 'apply', '--whitespace=nowarn', str(patch)], cwd=destination, check=True)
    files = json.loads((bundle / release['source_files']).read_text())
    for name, expected in files.items():
        if hashlib.sha256((destination / name).read_bytes()).hexdigest() != expected:
            raise SystemExit(f'Prepared source differs from the recorded build: {name}')
    print(f'Prepared {destination}')
    print('Install locked dependencies with: npx --yes npm@11 ci --ignore-scripts')
    print('Then use scripts/build-read-receipts-qa.sh with the private signing configuration described in README.fa.md.')


if __name__ == '__main__':
    main()
