"""Download public datasets into ml/data/raw/<name>/ without exposing credentials.

Credentials come only from the environment (KAGGLE_API_TOKEN, ROBOFLOW_API_KEY); they are
never printed, logged or written. The original archive is kept unchanged next to an
`extracted/` copy, and FETCH.json records URL (without secrets), size, SHA-256 and time.

    python ml/audit/fetch.py kaggle akinduhiman/urban-issues-dataset urban_issues
    python ml/audit/fetch.py roboflow aaa-yryty/fallentrees/3 aaa_fallentrees --format yolov8
    python ml/audit/fetch.py url https://zenodo.org/... some_name --filename data.zip
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import shutil
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path

RAW = Path(__file__).resolve().parents[1] / "data" / "raw"
UA = "BarangAI-research-fetch/1.0"


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):  # handled manually so auth is never forwarded
        return None


def _open(url: str, headers: dict[str, str], *, follow: bool = True):
    opener = urllib.request.build_opener(NoRedirect)
    for _ in range(8):
        request = urllib.request.Request(url, headers={"User-Agent": UA, **headers})
        try:
            return opener.open(request, timeout=120)
        except urllib.error.HTTPError as error:
            if follow and error.code in (301, 302, 303, 307, 308) and error.headers.get("Location"):
                location = urllib.parse.urljoin(url, error.headers["Location"])
                # Credentials stay with the first host only; Range etc. must survive for resume.
                if urllib.parse.urlsplit(location).netloc != urllib.parse.urlsplit(url).netloc:
                    headers = {k: v for k, v in headers.items() if k.lower() != "authorization"}
                url = location
                continue
            raise
    raise RuntimeError("too many redirects")


def download(url: str, headers: dict[str, str], target: Path, public_url: str) -> dict:
    target.parent.mkdir(parents=True, exist_ok=True)
    partial = target.with_suffix(target.suffix + ".part")
    for attempt in range(40):  # storage hosts drop TLS handshakes intermittently; partial data is kept
        offset = partial.stat().st_size if partial.exists() else 0
        try:
            response = _open(url, {**headers, **({"Range": f"bytes={offset}-"} if offset else {})})
            if offset and response.status != 206:
                offset = 0  # server ignored Range; restart
            content_range = response.headers.get("Content-Range", "")  # "bytes a-b/total"
            length = response.headers.get("Content-Length")
            expected = (int(content_range.rsplit("/", 1)[1]) if "/" in content_range and not content_range.endswith("*")
                        else int(length) + offset if length else None)
            with response, partial.open("ab" if offset else "wb") as out:
                done, last = offset, time.time()
                while chunk := response.read(1 << 20):
                    out.write(chunk)
                    done += len(chunk)
                    if time.time() - last > 30:
                        print(f"  {target.name}: {done / 2**20:,.0f} MB"
                              + (f" / {expected / 2**20:,.0f} MB" if expected else ""), flush=True)
                        last = time.time()
            if expected is not None and done != expected:  # dropped connections can end a stream silently
                raise ConnectionError(f"short read {done} of {expected}")
            break
        except (urllib.error.URLError, TimeoutError, ConnectionError, OSError) as error:
            print(f"  retry {attempt + 1}: {type(error).__name__}", flush=True)
            time.sleep(min(120, 10 * (attempt + 1)))
    else:
        raise SystemExit(f"download failed: {public_url}")
    if target.suffix.lower() == ".zip" and not zipfile.is_zipfile(partial):
        raise SystemExit(f"{partial.name} is not a complete zip; kept as .part, rerun to resume")
    partial.replace(target)
    digest = hashlib.sha256()
    with target.open("rb") as stream:
        while block := stream.read(1 << 22):
            digest.update(block)
    return {"url": public_url, "file": target.name, "bytes": target.stat().st_size,
            "sha256": digest.hexdigest(), "fetched_utc": dt.datetime.now(dt.UTC).isoformat()}


def extract(archive: Path, dest: Path) -> int:
    root = dest.resolve()
    with zipfile.ZipFile(archive) as zf:
        bad = zf.testzip()
        if bad:
            raise SystemExit(f"corrupt member {bad} in {archive}")
        for member in zf.infolist():
            path = (root / member.filename).resolve()
            if not path.is_relative_to(root):  # zip-slip guard
                raise SystemExit(f"unsafe path in archive: {member.filename}")
        zf.extractall(root)
        return len(zf.infolist())


def finish(name: str, record: dict, *, unzip: bool = True) -> None:
    folder = RAW / name
    archive = folder / record["file"]
    if unzip and zipfile.is_zipfile(archive):
        record["members"] = extract(archive, folder / "extracted")
    (folder / "FETCH.json").write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k: v for k, v in record.items() if k != "url"} | {"name": name}))


def kaggle(args) -> None:
    token = os.environ.get("KAGGLE_API_TOKEN")
    if not token:
        raise SystemExit("KAGGLE_API_TOKEN is not set in this process")
    url = f"https://www.kaggle.com/api/v1/datasets/download/{args.ref}"
    record = download(url, {"Authorization": f"Bearer {token}"}, RAW / args.name / f"{args.ref.split('/')[-1]}.zip",
                      f"https://www.kaggle.com/datasets/{args.ref}")
    record["source"] = f"kaggle:{args.ref}"
    finish(args.name, record)


def roboflow(args) -> None:
    key = os.environ.get("ROBOFLOW_API_KEY")
    if not key:
        raise SystemExit("ROBOFLOW_API_KEY is not set in this process")
    workspace, project, version = args.ref.split("/")
    query = urllib.parse.urlencode({"api_key": key})
    meta_url = f"https://api.roboflow.com/{workspace}/{project}/{version}/{args.format}?{query}"
    for attempt in range(30):  # export may need to be generated on Roboflow's side (free for public data)
        try:
            with _open(meta_url, {}) as response:
                meta = json.load(response)
        except (urllib.error.URLError, TimeoutError, ConnectionError) as error:
            if isinstance(error, urllib.error.HTTPError) and error.code < 500:
                raise SystemExit(f"Roboflow export request rejected: HTTP {error.code}")
            print(f"  meta retry {attempt + 1}: {type(error).__name__}", flush=True)
            time.sleep(20)
            continue
        link = (meta.get("export") or {}).get("link")
        if link:
            break
        time.sleep(10)
    else:
        raise SystemExit(f"export link unavailable for {args.ref}")
    record = download(link, {}, RAW / args.name / f"{project}-v{version}-{args.format}.zip",
                      f"https://universe.roboflow.com/{workspace}/{project}/dataset/{version}")
    record["source"] = f"roboflow:{args.ref}:{args.format}"
    version_info = meta.get("version") or {}
    record["roboflow_version"] = {k: version_info.get(k) for k in ("id", "name", "images", "splits", "preprocessing",
                                                                   "augmentation", "created", "exports") if k in version_info}
    record["roboflow_project"] = {k: (meta.get("project") or {}).get(k) for k in
                                  ("name", "type", "license", "classes", "images", "annotation")}
    finish(args.name, record)


def _json(url: str):
    with _open(url, {"Accept": "application/json"}) as response:
        return json.load(response)


def mendeley(args) -> None:
    """Download every file (optionally only under --folders) and verify Mendeley's published SHA-256."""
    base = f"https://data.mendeley.com/public-api/datasets/{args.dataset}"
    meta = _json(f"{base}?version={args.version}")
    folders = {f["id"]: f for f in _json(f"{base}/folders/{args.version}")}

    def folder_path(folder_id: str | None) -> Path:
        parts = []
        while folder_id and folder_id in folders:
            parts.append(folders[folder_id]["name"])
            folder_id = folders[folder_id].get("parent_id")
        return Path(*reversed(parts)) if parts else Path()

    wanted = set(args.folders or [])
    # A folder is scanned if no filter is given or any folder on its path is wanted.
    scan = ([] if wanted else ["root"]) + [fid for fid in folders
                                          if not wanted or set(folder_path(fid).parts) & wanted]
    files = []
    for fid in scan:
        for item in _json(f"{base}/files?folder_id={fid}&version={args.version}"):
            details = item["content_details"]
            rel = folder_path(None if fid == "root" else fid) / item["filename"]
            target = RAW / args.name / "extracted" / rel
            record = download(details["download_url"], {}, target, details["download_url"])
            if record["sha256"] != details.get("sha256_hash", record["sha256"]):
                raise SystemExit(f"sha256 mismatch for {rel}")
            files.append({"path": rel.as_posix(), "bytes": record["bytes"], "sha256": record["sha256"]})
    licence = meta.get("data_licence") or {}
    summary = {"source": f"mendeley:{args.dataset}:v{args.version}", "url": f"https://data.mendeley.com/datasets/{args.dataset}/{args.version}",
               "title": meta.get("name"), "licence": licence.get("short_name") or licence.get("full_name"),
               "doi": (meta.get("doi") or {}).get("id"), "files": files, "file_count": len(files),
               "bytes": sum(f["bytes"] for f in files), "fetched_utc": dt.datetime.now(dt.UTC).isoformat()}
    for item in files:  # unzip archives in place (originals kept)
        path = RAW / args.name / "extracted" / item["path"]
        if path.suffix.lower() == ".zip":
            item["members"] = extract(path, path.with_suffix(""))
    (RAW / args.name / "FETCH.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k: v for k, v in summary.items() if k != "files"} | {"name": args.name}))


def plain(args) -> None:
    record = download(args.url, {}, RAW / args.name / (args.filename or Path(urllib.parse.urlsplit(args.url).path).name),
                      args.url)
    record["source"] = f"url:{args.url}"
    finish(args.name, record, unzip=not args.no_unzip)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="kind", required=True)
    p = sub.add_parser("kaggle"); p.add_argument("ref"); p.add_argument("name"); p.set_defaults(run=kaggle)
    p = sub.add_parser("roboflow"); p.add_argument("ref"); p.add_argument("name")
    p.add_argument("--format", default="yolov8"); p.set_defaults(run=roboflow)
    p = sub.add_parser("mendeley"); p.add_argument("dataset"); p.add_argument("version"); p.add_argument("name")
    p.add_argument("--folders", nargs="*", help="only these folder names (and their subfolders)"); p.set_defaults(run=mendeley)
    p = sub.add_parser("url"); p.add_argument("url"); p.add_argument("name")
    p.add_argument("--filename"); p.add_argument("--no-unzip", action="store_true"); p.set_defaults(run=plain)
    args = parser.parse_args()
    if (RAW / args.name / "FETCH.json").exists():
        print(f"{args.name}: already fetched; delete its folder to refetch")
        return
    args.run(args)


if __name__ == "__main__":
    sys.exit(main())
