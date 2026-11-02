"""Record local build artifacts; never install or launch the candidate."""
from pathlib import Path
from datetime import datetime, timezone
import hashlib
import json

root = Path(__file__).resolve().parents[1]
release = root / 'src-tauri' / 'target' / 'release'
paths = [release / 'pharmacy-pos.exe', release / 'bundle' / 'nsis' / 'Pharmacy POS_0.1.0_x64-setup.exe']
artifacts = []
for path in paths:
    if not path.is_file():
        raise SystemExit(f'Build artifact missing: {path}')
    digest = hashlib.sha256()
    with path.open('rb') as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b''):
            digest.update(chunk)
    artifacts.append({'path': str(path.relative_to(root)), 'bytes': path.stat().st_size,
                      'modified_utc': datetime.fromtimestamp(path.stat().st_mtime, timezone.utc).isoformat(),
                      'sha256': digest.hexdigest().upper()})
# Bundler post-processing can touch the executable milliseconds after makensis.
# Reject older bundles while allowing that sub-second timestamp ordering.
if paths[1].stat().st_mtime + 1 < paths[0].stat().st_mtime:
    raise SystemExit('Installer predates the executable; rebuild the NSIS installer first')
manifest = {'recorded_utc': datetime.now(timezone.utc).isoformat(), 'artifacts': artifacts,
            'acceptance': 'Build artifacts only; clean installation and signed-in desktop/hardware acceptance pending'}
output = root / 'test-results' / 'release-gate' / 'artifacts.json'
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
print(json.dumps(manifest, indent=2))
