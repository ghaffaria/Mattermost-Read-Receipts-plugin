"""Build a clean, versioned multi-architecture Mattermost plugin archive."""
from pathlib import Path
import gzip
import json
import tarfile
root=Path(__file__).resolve().parents[1]
version=json.loads((root/"plugin.json").read_text())["version"]
dest=root/"dist"/("mattermost-readreceipts-"+version+".tar.gz")
dest.parent.mkdir(exist_ok=True)
with dest.open("wb") as raw:
    with gzip.GzipFile(fileobj=raw,mode="wb",mtime=0) as compressed:
        with tarfile.open(fileobj=compressed,mode="w") as archive:
            for source,name in [(root/"plugin.json","plugin.json"),(root/"webapp/dist/main.js","main.js"),(root/".build/plugin-linux-amd64","plugin-linux-amd64"),(root/".build/plugin-linux-arm64","plugin-linux-arm64")]:
                info=archive.gettarinfo(str(source),arcname=name)
                info.uid=info.gid=0
                info.uname=info.gname=""
                info.mtime=0
                info.mode=0o755 if name.startswith("plugin-linux") else 0o644
                with source.open("rb") as content:archive.addfile(info,content)
print(dest)
