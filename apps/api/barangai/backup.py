"""Back up and restore the one laptop's data: the SQLite database and the photos its reports point to.

    python -m barangai.backup create <folder on another drive>
    python -m barangai.backup restore <backup folder> [--replace]     (stop the server first)

A backup holds private photos and account data unencrypted, so keep it on an encrypted drive.
"""

import argparse
import json
import re
import shutil
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

from sqlalchemy.engine import make_url

from .db import copy_sqlite, database_url, engine_for_url, scrub_deleted, session_for_url, upgrade_sqlite
from .media import delete_image, local_path, media_dir

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


def erased_ids(path: Path) -> set[tuple[str, str]] | None:
    """The erasure ledger in a database file: None when there is no file, empty when it predates the ledger."""
    if not path.is_file():
        return None
    connection = sqlite3.connect(f"{path.resolve().as_uri()}?mode=ro", uri=True)
    try:
        if not connection.execute("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'erasures'").fetchone():
            return set()
        return set(connection.execute("SELECT kind, subject_id FROM erasures").fetchall())
    except sqlite3.Error as error:
        # An unreadable ledger must stop the restore: carrying on would bring back what it lists.
        raise ValueError(f"Can't read the erasure ledger in {path}: {error}") from error
    finally:
        connection.close()


def reapply_erasures(erased: set[tuple[str, str]]) -> tuple[dict, list[str]]:
    """Removes what was erased since this backup was made, by the same code as the original deletion, and returns the
    counts and the photos that went with it. Migrates first, because the backup may be older than the ledger, without
    the usual copy: it would hold what is being erased."""
    from . import delete_report as deletion  # Imported here: it needs the whole app, and creating a backup does not.
    from .models import Erasure, Report, User

    upgrade_sqlite(keep_copy=False)
    done = {"reports": 0, "users": 0, "photos": 0}
    with session_for_url() as db:
        images = []
        for kind, subject_id in sorted(erased):
            db.merge(Erasure(kind=kind, subject_id=subject_id))
        for subject_id in sorted(subject for kind, subject in erased if kind == "report"):
            report = db.get(Report, subject_id)
            if report:
                images += deletion.erase_rows(db, report)
                done["reports"] += 1
        for subject_id in sorted(subject for kind, subject in erased if kind == "user"):
            if db.get(User, subject_id):
                images += deletion.erase_account(db, subject_id)
                done["users"] += 1
        done["photos"] = len(images)
        db.commit()
        scrub_deleted(db)
    engine_for_url(database_url()).dispose()
    return done, images


def restore_backup(folder, replace=False) -> dict:
    """Puts a backup in place of the configured database and photo folder. Anything it replaces is renamed, not deleted.
    Accounts and reports erased since the backup was made are erased again, going by the erasure ledger of the database
    being replaced, plus the backup's own. On a new laptop with no database, only the backup's can be used."""
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
    # Pooled connections would otherwise keep using the file being set aside.
    engine_for_url(database_url()).dispose()
    current = erased_ids(target)
    existing = [
        path for path in (target, *(target.with_name(target.name + end) for end in ("-wal", "-shm"))) if path.exists()
    ]
    if existing and not replace:
        raise ValueError(f"{target} already exists. Stop the server and pass --replace to set it aside and restore")
    stamp = f"{datetime.now(MANILA):%Y%m%d-%H%M%S}"
    target.parent.mkdir(parents=True, exist_ok=True)
    set_aside = [
        (path, path.with_name(f"{target.stem}.replaced-{stamp}{path.name.removeprefix(target.stem)}"))
        for path in existing
    ]
    for path, aside in set_aside:
        path.rename(aside)
    shutil.copy2(copied, target)
    # Before any photo moves. If this fails, what was there goes back, so the newer ledger isn't left in a side file
    # with the erased rows live.
    erased = (erased_ids(copied) or set()) | (current or set())
    reerased, gone = {"reports": 0, "users": 0, "photos": 0}, []
    if erased:
        try:
            reerased, gone = reapply_erasures(erased)
        except Exception:
            engine_for_url(database_url()).dispose()
            for path in (target, *(target.with_name(target.name + end) for end in ("-wal", "-shm"))):
                path.unlink(missing_ok=True)
            for path, aside in set_aside:
                aside.rename(path)
            raise
    for location in gone:
        delete_image(location)
    gone_names = {re.split(r"[\\/]", location)[-1] for location in gone}
    photos = media_dir()
    for photo in (folder / PHOTOS).iterdir():
        if photo.name in gone_names:
            continue
        here = photos / photo.name
        if here.exists() and here.read_bytes() != photo.read_bytes():
            here.rename(here.with_name(f"{here.name}.replaced-{stamp}"))
        shutil.copy2(photo, here)
    connection = sqlite3.connect(target)
    try:
        table_counts = counts(connection)
    finally:
        connection.close()
    return {
        "database": str(target),
        "photos": str(photos),
        "counts": table_counts,
        "erasure_ledger": "backup only" if current is None else "current database and backup",
        "reerased": reerased,
    }


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
