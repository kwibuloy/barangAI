import argparse
import io
import os
import random
from datetime import datetime, timedelta
from getpass import getpass

from PIL import Image
from sqlalchemy import select
from sqlalchemy.engine import make_url

from . import trust
from .auth import hasher
from .db import database_url, session_for_url
from .media import sanitize_image, save_image
from .models import Case, Notification, Report, ReportAddendum, ReportEvent, StaffAction, User
from .reports import CATEGORIES
from .workflow import NEXT

# Synthetic point near Dasmariñas, Cavite; not a real resident address.
CENTER = (14.3294, 120.9367)
ACCOUNTS = [
    ("staff@demo.test", "staff"),
    ("admin@demo.test", "administrator"),
    ("resident1@demo.test", "resident"),
    ("resident2@demo.test", "resident"),
]
PATH = ["Pending", "Under Verification", "Accepted", "In Progress", "Resolved"]


def is_local():
    # Only SQLite counts: a "localhost" Postgres may be a tunnel to Supabase.
    return make_url(database_url()).get_backend_name() == "sqlite"


def photo(seed, exif=None):
    color = random.Random(seed).choices(range(40, 220), k=3)
    output = io.BytesIO()
    Image.new("RGB", (640, 480), tuple(color)).save(output, format="JPEG", **({"exif": exif} if exif else {}))
    return output.getvalue() if exif else sanitize_image(output.getvalue())


def camera_photo(seed, latitude, longitude, days_ago):
    """A synthetic original carrying camera details, as a phone would upload it (before sanitizing)."""
    exif = Image.Exif()
    exif[271] = "SyntheticCam"
    exif[0x8769] = {36867: (datetime.now(trust.MANILA) - timedelta(days=days_ago)).strftime("%Y:%m:%d %H:%M:%S")}
    exif[0x8825] = {1: "N", 2: (latitude, 0.0, 0.0), 3: "E", 4: (longitude, 0.0, 0.0)}
    return photo(seed, exif)


def seed(password: str, count: int):
    if len(password) < 12:
        raise ValueError("Password must be at least 12 characters")
    rng = random.Random(42)
    with session_for_url() as db:
        users = {}
        for email, role in ACCOUNTS:
            users[email] = db.scalar(select(User).where(User.email == email)) or User(
                email=email, password_hash=hasher.hash(password), role=role
            )
            db.add(users[email])
        db.flush()
        staff, residents = users["staff@demo.test"], [users["resident1@demo.test"], users["resident2@demo.test"]]
        for index in range(count):
            resident, category = residents[index % 2], sorted(CATEGORIES)[index % len(CATEGORIES)]
            final = PATH[index % len(PATH)] if index % 7 else "Rejected"
            report = Report(
                resident_id=resident.id,
                resident_category=category,
                image_path="",
                description=f"Synthetic demo concern #{index + 1}",
                latitude=CENTER[0] + rng.uniform(-0.006, 0.006),
                longitude=CENTER[1] + rng.uniform(-0.006, 0.006),
            )
            db.add(report)
            db.flush()
            db.add(ReportEvent(report_id=report.id, to_status="Pending", actor_id=resident.id))
            previous = "Pending"
            for status in (
                PATH[1 : PATH.index(final) + 1] if final != "Rejected" else ["Under Verification", "Rejected"]
            ):
                if status not in NEXT[previous]:
                    raise ValueError(f"{previous} cannot become {status}")
                db.add(
                    ReportEvent(
                        report_id=report.id,
                        from_status=previous,
                        to_status=status,
                        actor_id=staff.id,
                        note=f"Synthetic note: moved to {status}",
                        rejection_reason="not_enough_details" if status == "Rejected" else None,
                    )
                )
                db.add(Notification(user_id=resident.id, report_id=report.id, status=status))
                if status == "Accepted":
                    report.verified_category = category
                previous = status
            report.status = previous
            if previous in {"In Progress", "Resolved"}:
                db.add(
                    StaffAction(report_id=report.id, actor_id=staff.id, kind="action", note="Synthetic crew dispatched")
                )
            report.location_source = "photo"
            if previous in {"Accepted", "In Progress", "Resolved"}:
                # As the workflow does on acceptance: a one-report case, so it shows on the residents' map.
                case = Case(category=category, latitude=report.latitude, longitude=report.longitude,
                            created_by=staff.id)
                db.add(case)
                db.flush()
                report.case_id, report.case_confirmed = case.id, True
            if previous == "Pending":
                db.add(Notification(user_id=staff.id, report_id=report.id, status="Pending", kind="new_report"))
            report.image_path = save_image(report.id, photo(index))
        pitch_story(db, staff, residents)
        db.commit()


def pitch_story(db, staff, residents):
    """A few connected reports for the demo: a flood two residents reported (grouped, being fixed, with a note
    added later), a live wire waiting for review (high priority), and a report whose pin was moved far from the
    photo's GPS (staff photo checks). Synthetic streets and people only."""
    spot = (CENTER[0] + 0.001, CENTER[1] - 0.001)
    case = Case(category="flooding", latitude=spot[0], longitude=spot[1], location_label="Demo Riverside Street",
                created_by=staff.id)
    db.add(case)
    db.flush()
    for offset, resident in enumerate(residents):
        report = Report(resident_id=resident.id, resident_category="flooding", verified_category="flooding",
                        status="In Progress", image_path="", location_label="Demo Riverside Street",
                        description="Synthetic demo: street flooded after rain, water up to the ankles.",
                        latitude=spot[0] + offset * 0.0002, longitude=spot[1], hazards=["blocks_road"],
                        location_source="photo", case_id=case.id, case_confirmed=True)
        db.add(report)
        db.flush()
        previous = None
        for status in PATH[:4]:
            db.add(ReportEvent(report_id=report.id, from_status=previous, to_status=status,
                               actor_id=resident.id if previous is None else staff.id,
                               note=None if previous is None else f"Synthetic note: moved to {status}"))
            previous = status
        report.image_path = save_image(report.id, photo(100 + offset))
        if offset == 0:
            db.add(ReportAddendum(report_id=report.id, author_id=resident.id,
                                  note="Synthetic demo: the water is knee-deep now and cars are turning back."))
            db.add(Notification(user_id=staff.id, report_id=report.id, status="In Progress", kind="addendum"))
    wire = Report(resident_id=residents[0].id, resident_category="exposed_wiring", status="Pending", image_path="",
                  location_label="Demo Mabini Street", latitude=CENTER[0] - 0.001, longitude=CENTER[1] + 0.001,
                  description="Synthetic demo: a cable is hanging low over the sidewalk.",
                  hazards=["electrical_hazard", "risk_to_people"], location_source="photo")
    moved = Report(resident_id=residents[1].id, resident_category="potholes", status="Pending", image_path="",
                   location_label="Demo Rizal Street", latitude=CENTER[0] + 0.004, longitude=CENTER[1] + 0.002,
                   description="Synthetic demo: deep pothole in the middle lane.", location_source="manual")
    # The pothole photo was "taken" a month ago, a few hundred metres from where its pin was dropped; the real
    # checks (trust.py) find that from the photo itself.
    original = camera_photo(201, round(moved.latitude - 0.004, 6), moved.longitude, days_ago=30)
    moved.trust_flags = trust.flags(trust.photo_facts(original), moved.latitude, moved.longitude) or None
    for index, report in enumerate((wire, moved)):
        db.add(report)
        db.flush()
        db.add(ReportEvent(report_id=report.id, to_status="Pending", actor_id=report.resident_id))
        db.add(Notification(user_id=staff.id, report_id=report.id, status="Pending", kind="new_report"))
        report.image_path = save_image(report.id, sanitize_image(original) if report is moved else photo(200 + index))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Create synthetic demo accounts and reports")
    parser.add_argument("--count", type=int, default=12)
    parser.add_argument("--allow-remote", action="store_true", help="Permit PostgreSQL or Supabase storage")
    args = parser.parse_args()
    if not args.allow_remote and (not is_local() or os.environ.get("MEDIA_STORAGE", "local") != "local"):
        raise SystemExit("Refusing to seed a remote database or storage without --allow-remote")
    seed(os.environ.get("SEED_DEMO_PASSWORD") or getpass("Demo account password: "), args.count)
