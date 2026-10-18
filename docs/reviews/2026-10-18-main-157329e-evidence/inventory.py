"""Read-only source inventory and comparison against the preceding review's traces."""
import json
from pathlib import Path

here = Path(__file__).resolve().parent
root = here.parents[2]
large = []
for path in sorted((root / "src").rglob("*")):
    if path.is_file():
        lines = len(path.read_bytes().splitlines())
        if lines > 600:
            large.append({"file": str(path.relative_to(root)), "lines": lines})
previous = json.loads((here.parent / "2026-10-18-main-0cae2cf-evidence/rush-trace.json").read_text())
current = json.loads((here / "rush-trace.json").read_text())
print(json.dumps({
    "large_source_files": large,
    "trace_json_equal": previous == current,
    "unchanged_profiles": [k for k in current if current[k] == previous.get(k)],
    "hashes": {k: v["sha1"] for k, v in current.items()},
}, indent=2))
