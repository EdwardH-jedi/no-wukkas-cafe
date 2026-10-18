"""Read-only review inventory; run from the repository root."""
import json
import struct
import subprocess
from pathlib import Path


def command(args):
    result = subprocess.run(args, capture_output=True, text=True, check=False)
    print(json.dumps({"command": args, "exit": result.returncode,
                      "stdout": result.stdout, "stderr": result.stderr}))


command(["git", "rev-parse", "HEAD", "main", "6941c37"])
command(["git", "diff", "--exit-code", "6941c37", "--", "src", "scripts", "tests/helpers"])
command(["grep", "-rnE", r"Math\.random|Date\.now|setTimeout", "src/sim", "src/core"])
command(["git", "diff", "--check"])
oversized = []
for path in sorted(Path("src").rglob("*")):
    if not path.is_file():
        continue
    try:
        lines = len(path.read_text().splitlines())
    except UnicodeError:
        continue
    if lines > 600:
        oversized.append({"file": str(path), "lines": lines})
print(json.dumps({"src_files_over_600": oversized}))
screenshots = []
for folder in ["2026-10-17-polish", "2026-10-18-a11y"]:
    for path in sorted((Path("docs/verification") / folder).glob("*.png")):
        meta = json.loads(path.with_suffix(".json").read_text())
        dimensions = struct.unpack(">II", path.read_bytes()[16:24])
        screenshots.append(dimensions == (meta["css"]["width"], meta["css"]["height"]))
print(json.dumps({"png_sidecar_pairs": len(screenshots), "dimensions_match": sum(screenshots)}))
