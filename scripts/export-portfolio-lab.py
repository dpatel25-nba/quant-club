"""Publish only the explicitly synthetic Portfolio Lab demo and source bundle."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil
import zipfile


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", type=Path, default=Path(__file__).resolve().parents[2]/"portfolio-lab")
    args = parser.parse_args()
    source = args.project.resolve()
    output = Path(__file__).resolve().parents[1]/"portfolio-lab"
    report = (source/"outputs/demo/report.html").read_text()
    match = re.search(r'<script id="forecast-data" type="application/json">(.*?)</script>', report, re.S)
    payload = json.loads(match.group(1)) if match else {}
    manifest = json.loads((source/"outputs/demo/manifest.json").read_text())
    if payload.get("kind") != "synthetic" or manifest.get("data", {}).get("data_kind") != "synthetic":
        raise ValueError("This public-demo exporter requires explicitly synthetic inputs")
    if not all(str(name).startswith("DEMO_") for name in payload.get("assets", [])) or not payload.get("assets"):
        raise ValueError("Expected clearly named demo securities")
    for name, digest in manifest["source_sha256"].items():
        if hashlib.sha256((source/"portfolio_forecast"/name).read_bytes()).hexdigest() != digest:
            raise ValueError(f"Regenerate the demo after changing {name}")
    output.mkdir(exist_ok=True)
    (output/"index.html").write_text(report)
    for name in ("RESEARCH.md", "MODEL_SPEC.md", "DATA_CONTRACT.md", "ROADMAP.md", "VALIDATION.md"):
        shutil.copyfile(source/"docs"/name, output/name)
    files = [source/"README.md", source/"pyproject.toml", source/".gitignore"]
    files += sorted((source/"portfolio_forecast").glob("*.py"))
    files += [source/"portfolio_forecast/report.html"]
    files += sorted((source/"tests").glob("*.py")) + sorted((source/"docs").glob("*.md"))
    with zipfile.ZipFile(output/"source.zip", "w", zipfile.ZIP_DEFLATED) as archive:
        for file in files:
            info = zipfile.ZipInfo("portfolio-lab/"+str(file.relative_to(source)), date_time=(2026, 9, 23, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            archive.writestr(info, file.read_bytes())
    demo_files = [source/"outputs/demo"/name for name in ("forecast.json", "manifest.json", "paths_0.npz", "paths_1.npz", "scenario_used.csv")]
    demo_files += sorted((source/"outputs/demo/inputs").glob("*.csv")) + [source/"outputs/demo/inputs/metadata.json"]
    with zipfile.ZipFile(output/"simulation.zip", "w", zipfile.ZIP_DEFLATED) as archive:
        for file in demo_files:
            info = zipfile.ZipInfo(str(file.relative_to(source/"outputs/demo")), date_time=(2026, 9, 23, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            archive.writestr(info, file.read_bytes())
    release = {"data_kind": "synthetic", "as_of": payload["asOf"], "paths_per_scenario": payload["paths"],
               "horizon_months": payload["horizon"], "assets": payload["assets"],
               "source_manifest": manifest,
               "files": {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(output.iterdir()) if p.is_file() and p.name != "release.json"}}
    (output/"release.json").write_text(json.dumps(release, indent=2)+"\n")
    print(f"Exported synthetic Portfolio Lab demo and {len(files)} source files to {output}")


if __name__ == "__main__":
    main()
