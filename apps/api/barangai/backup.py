"""Back up and restore the one laptop's data: the SQLite database and the photos its reports point to.

    python -m barangai.backup create <folder on another drive>
    python -m barangai.backup restore <backup folder> [--replace]     (stop the server first)

A backup holds private photos and account data unencrypted, so keep it on an encrypted drive.
"""

import argparse
import json
import shutil
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

from sqlalchemy.engine import make_url

from .db import copy_sqlite, database_url
from .media import local_path, media_dir

MANILA = timezone(timedelta(hours=8))
DATABASE_NAME = "barangai.db"
PHOTOS = "photos"
MANIFEST = "manifest.json"
COUNTED = ("users", "reports", "report_events", "point_entries", "vouchers")


def database_file() -> Path:
    url = make_url(database_url())
    if url.get_backend_name() != "sqlite" or not url.database or url.database == ":memory:":
        raise ValueError("Backups cover a local SQLite database only")
    return Path(url.database).resolve()


def photo_locations(connection):
    rows = connection.execute(
        "SELECT image_path FROM reports UNION ALL SELECT image_path FROM report_addenda WHERE image_path IS NOT NULL"
    )
    return [row[0] for row in rows if row[0]]


def counts(connection):
    return {table: connection.execute(f"SELECT count(*) FROM {table}").fetchone()[0] for table in COUNTED}


def create_backup(destination) -> Path:
    source = database_file()
    if not source.is_file():
        raise ValueError(f"No database at {source}")
    stamp = datetime.now(MANILA)
    folder = Path(destination).resolve() / f"barangai-backup-{stamp:%Y%m%d-%H%M%S}"
    (folder / PHOTOS).mkdir(parents=True)
    copied = folder / DATABASE_NAME
    copy_sqlite(source, copied)
    connection = sqlite3.connect(copied)
    try:
        check = connection.execute("PRAGMA integrity_check").fetchone()[0]
        if check != "ok":
            raise ValueError(f"The copied database failed its integrity check: {check}")
        locations = photo_locations(connection)
        table_counts = counts(connection)
    finally:
        connection.close()
    missing = []
    for location in locations:
        path = local_path(location)
        if path:
            shutil.copy2(path, folder / PHOTOS / path.name)
        else:
            missing.append(location)
    manifest = {
        "created_at": stamp.isoformat(),
        "counts": table_counts,
        "photos": len(locations) - len(missing),
        "photos_missing": missing,
    }
    (folder / MANIFEST).write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    # The launcher shows this at start, so a laptop with no recent backup is noticed.
    source.with_name(f"{source.stem}.last-backup.txt").write_text(
        f"{stamp:%d %b %Y %H:%M} to {folder}\n", encoding="utf-8"
    )
    return folder


def restore_backup(folder, replace=False) -> dict:
    """Puts a backup in place of the configured database and photo folder. Anything it replaces is renamed, not deleted."""
    folder = Path(folder).resolve()
    copied, manifest_file = folder / DATABASE_NAME, folder / MANIFEST
    if not copied.is_file() or not manifest_file.is_file():
        raise ValueError(f"{folder} is not a BarangAI backup")
    check = sqlite3.connect(copied)
    try:
        expected = json.loads(manifest_file.read_text(encoding="utf-8"))["counts"]
        if check.execute("PRAGMA integrity_check").fetchone()[0] != "ok" or counts(check) != expected:
            raise ValueError(f"{folder} is damaged: its database doesn't match its manifest")
    finally:
        check.close()
    target = database_file()
    existing = [
        path for path in (target, *(target.with_name(target.name + end) for end in ("-wal", "-shm"))) if path.exists()
    ]
    if existing and not replace:
        raise ValueError(f"{target} already exists. Stop the server and pass --replace to set it aside and restore")
    stamp = f"{datetime.now(MANILA):%Y%m%d-%H%M%S}"
    target.parent.mkdir(parents=True, exist_ok=True)
    for path in existing:
        path.rename(path.with_name(f"{target.stem}.replaced-{stamp}{path.name.removeprefix(target.stem)}"))
    shutil.copy2(copied, target)
    photos = media_dir()
    for photo in (folder / PHOTOS).iterdir():
        here = photos / photo.name
        if here.exists() and here.read_bytes() != photo.read_bytes():
            here.rename(here.with_name(f"{here.name}.replaced-{stamp}"))
        shutil.copy2(photo, here)
    connection = sqlite3.connect(target)
    try:
        table_counts = counts(connection)
    finally:
        connection.close()
    return {"database": str(target), "photos": str(photos), "counts": table_counts}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("create").add_argument("destination")
    restore = commands.add_parser("restore")
    restore.add_argument("folder")
    restore.add_argument("--replace", action="store_true")
    args = parser.parse_args(argv)
    try:
        if args.command == "create":
            folder = create_backup(args.destination)
            manifest = json.loads((folder / MANIFEST).read_text(encoding="utf-8"))
            print(
                f"Backed up {database_file()} to {folder}: {manifest['counts']['reports']} reports, "
                f"{manifest['photos']} photos, {len(manifest['photos_missing'])} missing."
            )
            print("It holds private photos and account data unencrypted. Keep it on an encrypted drive.")
        else:
            print(json.dumps(restore_backup(args.folder, args.replace)))
    except (ValueError, OSError) as error:
        print(str(error))
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
