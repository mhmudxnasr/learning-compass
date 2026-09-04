"""Install only this plugin into the active default profile, with rollback backup."""
from pathlib import Path
import hashlib
import json
import os
import shutil
import tempfile

root = Path(__file__).resolve().parent
home = Path(os.environ.get('HERMES_HOME', str(Path.home()/'.hermes'))).resolve()
if home != (Path.home()/'.hermes').resolve():
    raise SystemExit('This installer is scoped to the default profile only')
target = home/'plugins/compass-native'
backup = None
if target.exists():
    backup = Path(tempfile.mkdtemp(prefix='compass-native-', dir=home/'cache'))/'previous'
    shutil.copytree(target, backup)
target.mkdir(parents=True,exist_ok=True)
files = ['plugin.yaml','__init__.py','tools.py','pdf_worker.py']
for name in files: shutil.copy2(root/name,target/name)
manifest = {name:hashlib.sha256((target/name).read_bytes()).hexdigest() for name in files}
assert all(manifest[name] == hashlib.sha256((root/name).read_bytes()).hexdigest() for name in files)
print(json.dumps({'installed':str(target),'backup':str(backup) if backup else None,'sha256':manifest},indent=2))
