"""Read-only inventories for the 0cae2cf review. Run from the repository root."""
import json
import struct
from pathlib import Path

large = []
for path in sorted(Path("src").rglob("*")):
    if path.is_file():
        lines = len(path.read_text().splitlines())
        if lines > 600:
            large.append({"path": str(path), "lines": lines})
print(json.dumps({"src_files_over_600": large}, indent=2))

pairs = []
for folder in ["2026-10-17-polish", "2026-10-18-a11y"]:
    for path in sorted((Path("docs/verification") / folder).glob("*.png")):
        metadata = json.loads(path.with_suffix(".json").read_text())
        pixels = struct.unpack(">II", path.read_bytes()[16:24])
        pairs.append(pixels == (metadata["css"]["width"], metadata["css"]["height"]))
print(json.dumps({"png_sidecar_pairs": len(pairs), "matching": sum(pairs)}))

current = Path("docs/reviews/2026-10-18-main-0cae2cf-evidence/rush-trace.json")
previous = Path("docs/reviews/2026-10-18-main-6941c37-evidence/rush-trace.json")
a, b = json.loads(current.read_text()), json.loads(previous.read_text())
print(json.dumps({"rush_trace_json_equal": a == b, "profiles": len(a)}))
