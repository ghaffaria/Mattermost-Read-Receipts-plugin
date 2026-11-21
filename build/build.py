# Copyright 2026 Alireza Ghaffari
# SPDX-License-Identifier: MPL-2.0

"""Build the plugin without relying on the macOS Xcode-provided make."""
from pathlib import Path
import os
import subprocess
import sys

root = Path(__file__).resolve().parents[1]
subprocess.run(["npm", "run", "check-types"], cwd=root / "webapp", check=True)
subprocess.run(["npm", "run", "build"], cwd=root / "webapp", check=True)
(root / ".build").mkdir(exist_ok=True)
for arch in ("amd64", "arm64"):
    env = dict(os.environ, CGO_ENABLED="0", GOOS="linux", GOARCH=arch)
    env.setdefault("GOMAXPROCS", "2")
    subprocess.run(
        ["go", "build", "-trimpath", "-buildvcs=false", "-o",
         str(root / ".build" / ("plugin-linux-" + arch)), "./server"],
        cwd=root, env=env, check=True,
    )
    subprocess.run(
        ["go", "build", "-trimpath", "-buildvcs=false", "-o",
         str(root / ".build" / ("healthcheck-linux-" + arch)), "./build/healthcheck"],
        cwd=root, env=env, check=True,
    )
subprocess.run([sys.executable, str(root / "build/package.py")], cwd=root, check=True)
