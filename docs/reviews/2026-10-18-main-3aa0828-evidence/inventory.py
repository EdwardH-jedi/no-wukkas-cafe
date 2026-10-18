import hashlib
import json
from pathlib import Path
import subprocess

out = Path(__file__).resolve().parent
root = out.parents[2]
files = []
for path in sorted((root / 'src').rglob('*')):
    if path.is_file():
        lines = len(path.read_bytes().splitlines())
        if lines > 600:
            files.append({'file': str(path.relative_to(root)), 'lines': lines})
balances = {}
for name in ['base', 'current']:
    path = out / ('balance-' + name + '.csv')
    if path.exists():
        balances[name] = {'bytes': path.stat().st_size, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}
result = {
    'head': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip(),
    'over_600_lines': files,
    'trace_equal': json.loads((out / 'rush-trace.txt').read_text()) == json.loads((out.parent / '2026-10-18-main-157329e-evidence/rush-trace.json').read_text()),
    'balance': balances,
    'balance_identical': len(balances) == 2 and balances['base'] == balances['current'],
}
(out / 'inventory.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result, indent=2))
