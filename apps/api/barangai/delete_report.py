"""Administrator-only operator deletion; inspection is the default."""

import argparse
import json
import os
import sys
from getpass import getpass
from pathlib import Path
from uuid import UUID

from argon2.exceptions import InvalidHashError, VerificationError
from sqlalchemy import delete, func, or_, select

from .auth import hasher
from .db import session_for_url
from .media import delete_image
from .models import DuplicateSuggestion, Notification, Report, ReportAddendum, ReportEvent, StaffAction, User, now

REASONS = ("resident-request", "retention-expired", "synthetic-demo-cleanup")


class ReceiptWriteError(RuntimeError):
    def __init__(self, receipt):
        super().__init__("Deletion succeeded, but the receipt could not be saved; preserve the printed recovery receipt.")
        self.receipt = receipt


def delete_report(report_id, email, password, *, confirm=None, receipt_path=None, reason=None):
    """Inspect or delete one report. Never removes users or unrelated reports."""
    if str(UUID(report_id)) != report_id:
        raise ValueError("Use the exact report UUID")
    if confirm is not None and confirm != report_id:
        raise ValueError("Confirmation must exactly match the report ID")
    if confirm is not None and (reason not in REASONS or not receipt_path):
        raise ValueError("Deletion requires an approved reason and a receipt path")

    with session_for_url() as db:
        admin = db.scalar(select(User).where(User.email == email.lower()))
        try:
            authenticated = admin is not None and hasher.verify(admin.password_hash, password)
        except (VerificationError, InvalidHashError):
            authenticated = False
        if not authenticated or admin.role != "administrator":
            raise PermissionError("Administrator authentication required")
        admin_id = admin.id

        report = db.scalar(select(Report).where(Report.id == report_id).with_for_update())
        if report is None:
            raise ValueError("Report not found; no deletion performed")
        dependencies = (
            (Notification, Notification.report_id == report_id),
            (DuplicateSuggestion, or_(DuplicateSuggestion.report_id == report_id,
                                      DuplicateSuggestion.candidate_report_id == report_id)),
            (StaffAction, StaffAction.report_id == report_id),
            (ReportEvent, ReportEvent.report_id == report_id),
            (ReportAddendum, ReportAddendum.report_id == report_id),
        )
        # Photos residents added later are deleted with the report's own.
        extra_images = list(db.scalars(select(ReportAddendum.image_path).where(
            ReportAddendum.report_id == report_id, ReportAddendum.image_path.is_not(None))))
        counts = {model.__tablename__: db.scalar(select(func.count()).select_from(model).where(condition))
                  for model, condition in dependencies}
        if confirm is None:
            return {"action": "dry-run", "report_id": report_id, "images": 1 + len(extra_images),
                    "dependent_rows": counts, "users_deleted": 0}

        receipt_file = Path(receipt_path).expanduser().resolve()
        database = db.get_bind().url
        if database.get_backend_name() == "sqlite" and database.database not in {None, ":memory:"}:
            if receipt_file == Path(database.database).resolve():
                raise ValueError("Receipt must be separate from the database")
        for location in [report.image_path, *extra_images]:
            if not location.startswith("supabase:") and receipt_file == Path(location).resolve():
                raise ValueError("Receipt must be separate from the report image")
        # Open before changing data so an unusable operator path fails safely.
        descriptor = os.open(receipt_file, os.O_WRONLY | os.O_APPEND | os.O_CREAT, 0o600)
        with os.fdopen(descriptor, "a", encoding="utf-8") as output:
            for model, condition in dependencies:
                db.execute(delete(model).where(condition))
            db.execute(delete(Report).where(Report.id == report_id))
            # SQL changes are still uncommitted if private storage rejects deletion. Added photos go first, so a
            # failure among them leaves the report's own photo and rows intact for a retry.
            for location in extra_images:
                delete_image(location)
            delete_image(report.image_path)
            db.commit()
            receipt = {"action": "report-deleted", "report_id": report_id,
                       "administrator_id": admin_id, "time": now().isoformat(), "reason": reason}
            try:
                output.write(json.dumps(receipt, separators=(",", ":")) + "\n")
                output.flush()
                os.fsync(output.fileno())
            except OSError as error:
                raise ReceiptWriteError(receipt) from error
            return receipt


def main(argv=None):
    parser = argparse.ArgumentParser(description="Inspect a report, or explicitly confirm administrator deletion")
    parser.add_argument("report_id")
    parser.add_argument("--email", required=True, help="Administrator email")
    parser.add_argument("--confirm", help="Exact report ID; omission performs a dry-run")
    parser.add_argument("--reason", choices=REASONS)
    parser.add_argument("--receipt", help="Append-only JSONL receipt path outside the repository")
    args = parser.parse_args(argv)
    try:
        result = delete_report(args.report_id, args.email, getpass("Administrator password: "),
                               confirm=args.confirm, receipt_path=args.receipt, reason=args.reason)
    except ReceiptWriteError as error:
        print(json.dumps(error.receipt))
        print(str(error), file=sys.stderr)
        return 2
    except (PermissionError, ValueError, OSError) as error:
        print(str(error), file=sys.stderr)
        return 1
    except Exception:
        # Driver errors can include connection details; avoid printing credentials.
        print("Deletion did not complete. Inspect the report and retry; preserve any recovery receipt.", file=sys.stderr)
        return 1
    print(json.dumps(result))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
