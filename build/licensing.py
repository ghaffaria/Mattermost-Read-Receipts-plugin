# Copyright 2026 Alireza Ghaffari
# SPDX-License-Identifier: MPL-2.0

"""Collect original notices for modules in the plugin's compiled dependency graph."""
from pathlib import Path
import os
import subprocess

root = Path(__file__).resolve().parents[1]
licenses = root / 'licenses' / '_third_party'
modules = set()
for arch in ('amd64', 'arm64'):
    env = dict(os.environ, CGO_ENABLED='0', GOOS='linux', GOARCH=arch)
    lines = subprocess.check_output(
        ['go', 'list', '-deps', '-f', '{{if .Module}}{{if not .Module.Main}}{{.Module.Path}}|{{.Module.Version}}|{{.Module.Dir}}{{end}}{{end}}', './server'],
        cwd=root, env=env, text=True,
    ).splitlines()
    modules.update(line for line in lines if line)
entries = []
def collect(label, directory, target):
    files = sorted(p for p in directory.iterdir() if p.is_file() and p.name.upper().startswith(('LICENSE', 'COPYING', 'NOTICE', 'COPYRIGHT')))
    if not files:
        raise RuntimeError('Missing upstream license for ' + label)
    for source in files:
        dest = licenses / target / source.name
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(source.read_bytes())
    entries.append(label + '\n  ' + ', '.join(str((licenses / target / p.name).relative_to(root)) for p in files))
for line in sorted(modules):
    name, version, directory = line.split('|', 2)
    collect(name + ' ' + version, Path(directory), name + '@' + version)
goroot = Path(subprocess.check_output(['go', 'env', 'GOROOT'], text=True).strip())
go_license_root = next((p for p in (goroot, goroot.parent) if (p / 'LICENSE').is_file()), None)
if go_license_root is None: raise RuntimeError('Go standard-library license not found')
collect('Go standard library', go_license_root, 'go-standard-library')
for name in ('webpack', 'typescript'):
    collect('Frontend build/runtime tooling: ' + name, root / 'webapp/node_modules' / name, 'frontend-tooling/' + name)
(root / 'THIRD_PARTY_NOTICES.txt').write_text(
    'Third-party notices for Mattermost Read Receipts\n\n'
    'Project code is MPL-2.0. Dependencies retain their original licenses.\n'
    'Mattermost SDK model/ and plugin/ are Apache-2.0 under its preserved licensing policy.\n'
    'License texts below are copied without alteration from the pinned local dependencies.\n\n'
    + '\n\n'.join(entries) + '\n'
)
print('Collected notices for', len(entries), 'dependency/toolchain entries.')
