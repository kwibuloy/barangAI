"""A recording-ready demo: about three months of synthetic reports across four Dasmariñas barangays.

`python -m barangai.seed_demo --story`, on an empty local database only. Everything here is made up: the reports,
residents, streets, notes and timings, including the month-on-month improvement, which is written into STORY_MONTHS
below. The barangay names and boundaries are real, so run the server with DEMO_MODE=true (deploy/demo.ps1 does) and never
present these figures as anyone's results.

Status follows workflow.NEXT, with a staff note on every change and a verified category from acceptance, and points go
through points.settle. Only the dates are set by hand, so one run is the same as the next for the same clock.
"""

import io
import json
import math
import os
import random
from dataclasses import dataclass, field
from datetime import UTC, datetime, time, timedelta
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageOps
from sqlalchemy import inspect, select
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from . import barangays, points
from .auth import TERMS_VERSION, hasher
from .db import database_url, engine_for_url, project_root, session_for_url, upgrade_sqlite
from .media import sanitize_image, save_image
from .models import (
    Barangay,
    Case,
    Notification,
    PointEntry,
    Report,
    ReportEvent,
    Reward,
    StaffAction,
    User,
    Voucher,
    now,
)
from .reports import CATEGORIES
from .seed_demo import is_local, role_passwords, seed_rewards
from .usage import MANILA
from .workflow import NEXT

# How much each barangay reports, and how quickly its made-up desk works compared with the month's figures.
STORY_BARANGAYS = (
    ("Salitran II", 1.25, 1.0),
    ("Sampaloc I", 1.0, 0.85),
    ("Burol I", 0.9, 1.15),
    ("Paliparan II", 0.75, 1.35),
)
STORY_SEED = 20261105
BOUNDARIES = Path(__file__).resolve().parents[1] / "data" / "dasmarinas-barangays.geojson"
COMMONS = project_root() / "showreel" / "build" / "commons"
RESIDENTS_PER_BARANGAY = 20
# CC0 clears copyright, not the people pictured: the garbage and pothole photos show riders and a tricycle's number.
NO_PEOPLE_SHOWN = {"flooding", "fallen_trees"}


@dataclass(frozen=True)
class Month:
    """One month's made-up desk: reports per barangay before scaling, typical hours to accept, typical days from
    acceptance to resolved, and the share rejected and the share left stuck."""

    reports: int
    accept_hours: float
    resolve_days: float
    rejected: float
    stuck: float


# Oldest first, then the month in progress. Invented so that the demo shows a desk improving; not a measurement.
STORY_MONTHS = (
    Month(15, 26, 8.5, 0.14, 0.07),
    Month(19, 17, 6.5, 0.12, 0.04),
    Month(23, 10, 4.5, 0.10, 0.01),
    Month(25, 7, 3.0, 0.09, 0),
)
STREETS = ("Sampaguita", "Mabini", "Rizal", "Bonifacio", "Luna", "Acacia", "Narra", "Molave", "Ilang-Ilang", "Kamagong")
DESCRIPTIONS = {
    "flooding": (
        "Street is flooded after the rain, water up to the ankles.",
        "Baha sa kanto, hindi madaanan ng tricycle.",
        "Drain is blocked and the water is not going down.",
        "Water is rising near the waiting shed.",
    ),
    "fallen_trees": (
        "A big branch fell and is blocking half the road.",
        "May natumbang puno sa gilid ng kalsada.",
        "Tree came down after the storm, leaning on the fence.",
        "Branches are all over the sidewalk.",
    ),
    "broken_streetlights": (
        "This streetlight has been off for a week.",
        "Walang ilaw sa poste, madilim pag gabi.",
        "Lamp is hanging loose from the pole.",
        "Light keeps flickering then goes off at night.",
    ),
    "exposed_wiring": (
        "A cable is hanging low over the sidewalk.",
        "May nakalaylay na wire malapit sa poste.",
        "Wires came loose from the pole after the wind.",
        "Exposed wire near the gate, kids pass here.",
    ),
    "potholes": (
        "Deep pothole in the middle lane.",
        "Malalim na lubak, delikado sa motor.",
        "Road is breaking up near the corner.",
        "Pothole fills with water when it rains.",
    ),
    "uncollected_garbage": (
        "Garbage has not been collected for days.",
        "Tambak na basura sa kanto, mabaho na.",
        "Bags have torn open and are spilling on the road.",
        "Trash pile is growing beside the drain.",
    ),
    "damaged_signage": (
        "The street sign is bent and cannot be read.",
        "Natumba ang karatula sa kanto.",
        "Stop sign is leaning into the road.",
        "Sign has fallen off its post.",
    ),
    "other": (
        "Sidewalk slab is broken and sticking up.",
        "Sira ang takip ng kanal.",
        "Railing on the footbridge is loose.",
        "Waiting shed roof is coming apart.",
    ),
}
CHECK_NOTES = (
    "Checking the photo and the pin.",
    "Titingnan namin ang lugar.",
    "A tanod will look at this on the next round.",
    "Checking this against other reports nearby.",
)
ACCEPT_NOTES = {
    "flooding": "Confirmed flooding on site. Added to the drainage list.",
    "fallen_trees": "Confirmed on site. The barangay crew will clear it.",
    "broken_streetlights": "Confirmed: the light is out at night.",
    "exposed_wiring": "Confirmed. Area marked, please stay clear of the wire.",
    "potholes": "Confirmed on site. Added to the road repair list.",
    "uncollected_garbage": "Confirmed. Added to the next collection round.",
    "damaged_signage": "Confirmed. Sign is on the repair list.",
    "other": "Confirmed on site. We will send someone to fix it.",
}
WORK_NOTES = {
    "flooding": "Crew is clearing the drain.",
    "fallen_trees": "Crew is cutting and hauling the tree.",
    "broken_streetlights": "Electrician scheduled to replace the lamp.",
    "exposed_wiring": "Area marked; waiting on the repair crew.",
    "potholes": "Road crew is patching the hole.",
    "uncollected_garbage": "Collection truck is assigned to this area.",
    "damaged_signage": "Sign taken down for repair.",
    "other": "Crew is on it.",
}
DONE_NOTES = {
    "flooding": "Drain cleared and the water has gone down.",
    "fallen_trees": "Tree cleared and the road is open.",
    "broken_streetlights": "Lamp replaced and working at night.",
    "exposed_wiring": "Wire secured by the crew.",
    "potholes": "Pothole patched.",
    "uncollected_garbage": "Pile collected and the area cleaned.",
    "damaged_signage": "Sign fixed and back up.",
    "other": "Repaired.",
}
REJECTIONS = (
    ("not_barangay_concern", "This one is for the subdivision's association, not the barangay."),
    ("already_reported", "Someone already reported this, and it is being handled."),
    ("not_enough_details", "We could not find this from the photo and pin. Please send it again with a landmark."),
    ("no_problem_found", "We checked the spot and found nothing wrong."),
    ("other", "This was fixed before our team got there."),
)
ACTIONS = (
    "Crew went to the site.",
    "Materials requested from the barangay hall.",
    "Second visit done to finish the work.",
)
COORDINATION = ("Called the crew lead about the schedule.", "Told the barangay captain about this one.")
HAZARDS = {
    "exposed_wiring": ["electrical_hazard", "risk_to_people"],
    "flooding": ["blocks_road"],
    "fallen_trees": ["blocks_road"],
}
CATEGORY_WEIGHTS = {
    "flooding": 4,
    "potholes": 5,
    "uncollected_garbage": 5,
    "broken_streetlights": 4,
    "fallen_trees": 2,
    "exposed_wiring": 2,
    "damaged_signage": 1,
    "other": 2,
}


def scene_base(rng: random.Random, sky=(170, 200, 225), ground=(120, 118, 112), horizon=0.5):
    """A street at eye level: sky, a row of low buildings and a road, with enough texture not to read as a flat tile."""
    width, height = 1280, 960
    picture = Image.new("RGB", (width, height), sky)
    draw = ImageDraw.Draw(picture)
    line = int(height * horizon)
    for y in range(line):
        shade = y / max(line, 1)
        draw.line((0, y, width, y), fill=tuple(int(value * (1 - 0.18 * shade) + 30 * shade) for value in sky))
    x = -rng.randint(0, 80)
    while x < width:
        wide, tall = rng.randint(110, 240), rng.randint(90, 240)
        wall = rng.choice(((205, 190, 165), (180, 195, 185), (215, 205, 195), (170, 165, 160), (200, 170, 150)))
        draw.rectangle((x, line - tall, x + wide, line), fill=wall)
        draw.polygon(
            ((x - 10, line - tall), (x + wide / 2, line - tall - rng.randint(18, 42)), (x + wide + 10, line - tall)),
            fill=rng.choice(((110, 70, 60), (90, 90, 100), (130, 90, 70))),
        )
        for window in range(rng.randint(1, 3)):
            left = x + 18 + window * 56
            if left + 34 < x + wide:
                draw.rectangle((left, line - tall + 28, left + 34, line - tall + 72), fill=(70, 85, 95))
        x += wide + rng.randint(0, 26)
    for y in range(line, height):
        shade = (y - line) / max(height - line, 1)
        draw.line((0, y, width, y), fill=tuple(int(value * (0.85 + 0.2 * shade)) for value in ground))
    for _ in range(2600):
        px, py = rng.randint(0, width - 1), rng.randint(line, height - 1)
        tone = rng.randint(-24, 24)
        draw.point((px, py), fill=tuple(max(0, min(255, value + tone)) for value in ground))
    return picture, draw, line


def draw_flooding(rng):
    picture, draw, line = scene_base(rng, sky=(150, 165, 180), horizon=0.45)
    water = (118, 104, 78)
    draw.rectangle((0, line + 40, 1280, 960), fill=water)
    for _ in range(90):
        y = rng.randint(line + 50, 950)
        x = rng.randint(0, 1200)
        draw.arc((x, y, x + rng.randint(40, 170), y + rng.randint(6, 18)), 180, 360, fill=(165, 150, 120), width=2)
    return picture


def draw_trees(rng):
    picture, draw, line = scene_base(rng, sky=(175, 195, 205))
    x, y = rng.randint(120, 300), rng.randint(line + 120, line + 200)
    draw.line((x, y + 150, x + 900, y - 30), fill=(84, 60, 42), width=rng.randint(34, 50))
    for _ in range(170):
        cx, cy = rng.randint(x + 240, x + 1040), rng.randint(y - 170, y + 110)
        size = rng.randint(24, 62)
        draw.ellipse((cx, cy, cx + size, cy + size), fill=rng.choice(((48, 112, 52), (66, 132, 58), (38, 92, 46))))
    return picture


def draw_streetlight(rng):
    picture, draw, line = scene_base(rng, sky=(70, 78, 105), ground=(70, 70, 74))
    x = rng.randint(420, 860)
    draw.rectangle((x, 130, x + 18, 960), fill=(52, 54, 58))
    draw.line((x + 9, 140, x + 190, 120), fill=(52, 54, 58), width=12)
    draw.polygon(((x + 170, 118), (x + 250, 124), (x + 240, 168), (x + 182, 160)), fill=(95, 95, 90))
    draw.line((x + 205, 160, x + 195, 205), fill=(160, 150, 120), width=4)
    return picture


def draw_wiring(rng):
    picture, draw, line = scene_base(rng, sky=(185, 205, 225))
    x = rng.randint(300, 760)
    draw.rectangle((x, 60, x + 22, 960), fill=(92, 88, 82))
    for y in (120, 180):
        draw.rectangle((x - 110, y, x + 130, y + 12), fill=(70, 66, 60))
    for _ in range(24):
        start, sag = rng.randint(60, 230), rng.randint(20, 240)
        points_list = [
            (px, start + sag * math.sin(px / 1280 * math.pi) + rng.randint(-5, 5)) for px in range(0, 1281, 40)
        ]
        draw.line(points_list, fill=(28, 28, 30), width=rng.randint(2, 4))
    draw.line(((x + 10, 180), (x + 80, 420), (x + 30, 640), (x + 120, 760)), fill=(25, 25, 25), width=5)
    return picture


def draw_pothole(rng):
    picture, draw, line = scene_base(rng, ground=(96, 96, 98), horizon=0.34)
    for x in range(40, 1280, 260):
        draw.polygon(((x, 640), (x + 120, 640), (x + 130, 660), (x + 6, 660)), fill=(225, 220, 190))
    for _ in range(rng.randint(2, 4)):
        cx, cy, wide, tall = rng.randint(160, 900), rng.randint(520, 800), rng.randint(180, 340), rng.randint(70, 130)
        draw.ellipse((cx - 12, cy - 8, cx + wide + 12, cy + tall + 8), fill=(70, 66, 62))
        draw.ellipse((cx, cy, cx + wide, cy + tall), fill=(34, 32, 30))
        draw.ellipse((cx + wide * 0.2, cy + tall * 0.45, cx + wide * 0.8, cy + tall * 0.95), fill=(62, 72, 80))
    return picture


def draw_garbage(rng):
    picture, draw, line = scene_base(rng, horizon=0.42)
    for _ in range(130):
        cx, cy = rng.randint(180, 1100), rng.randint(line + 120, 880)
        size = rng.randint(40, 120)
        color = rng.choice(((30, 30, 34), (225, 225, 220), (60, 90, 150), (190, 70, 60), (55, 120, 80), (230, 200, 90)))
        draw.ellipse((cx, cy, cx + size, cy + size * 0.8), fill=color, outline=(20, 20, 20))
    return picture


def draw_sign(rng):
    picture, draw, line = scene_base(rng, sky=(180, 205, 225))
    sign = Image.new("RGBA", (360, 240), (0, 0, 0, 0))
    pen = ImageDraw.Draw(sign)
    pen.rectangle(
        (0, 0, 359, 239),
        fill=rng.choice(((30, 110, 70, 255), (200, 170, 40, 255), (180, 50, 45, 255))),
        outline=(240, 240, 240, 255),
        width=9,
    )
    for row in range(3):
        pen.rectangle((40, 50 + row * 56, 320 - row * 50, 72 + row * 56), fill=(240, 240, 240, 255))
    x = rng.randint(380, 820)
    draw.line((x, 980, x + rng.randint(20, 110), 330), fill=(95, 95, 98), width=16)
    turned = sign.rotate(rng.randint(14, 38), expand=True)
    picture.paste(turned, (x - 130, 110), turned)
    return picture


def draw_other(rng):
    picture, draw, line = scene_base(rng, ground=(165, 160, 150), horizon=0.38)
    for x in range(0, 1280, 210):
        draw.line((x, line + 40, x - 60, 960), fill=(120, 116, 106), width=5)
    for y in range(line + 90, 960, 130):
        draw.line((0, y, 1280, y), fill=(120, 116, 106), width=4)
    x, y = rng.randint(250, 850), rng.randint(line + 150, 720)
    draw.polygon(
        ((x, y), (x + 280, y - 44), (x + 340, y + 120), (x + 40, y + 170)), fill=(142, 138, 128), outline=(60, 58, 54)
    )
    for _ in range(9):
        draw.line(
            (x + rng.randint(0, 300), y + rng.randint(-30, 150), x + rng.randint(0, 300), y + rng.randint(-30, 150)),
            fill=(55, 52, 48),
            width=4,
        )
    return picture


SCENES = {
    "flooding": draw_flooding,
    "fallen_trees": draw_trees,
    "broken_streetlights": draw_streetlight,
    "exposed_wiring": draw_wiring,
    "potholes": draw_pothole,
    "uncollected_garbage": draw_garbage,
    "damaged_signage": draw_sign,
    "other": draw_other,
}


def recorded_cc0(folder: Path) -> dict[str, Path]:
    """Only photos whose licence is on file as CC0 count. The showreel's other pictures have no licence recorded."""
    try:
        credits = json.loads((folder / "credits.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    return {
        name: folder / f"{name}.jpg"
        for name, credit in credits.items()
        if name in NO_PEOPLE_SHOWN and credit.get("license") == "CC0" and (folder / f"{name}.jpg").is_file()
    }


def jpeg(picture: Image.Image) -> bytes:
    output = io.BytesIO()
    picture.convert("RGB").save(output, format="JPEG", quality=88)
    return output.getvalue()


def photo_pool(rng: random.Random, folder: Path) -> dict[str, list[bytes]]:
    """A few pictures per category, through the same blur and metadata stripping as a real upload. A crop or flip of
    one CC0 photo, or a drawn scene. Drawn scenes are illustrations; no photo here shows these reports' real places."""
    pool, sources = {}, recorded_cc0(folder)
    for category in sorted(CATEGORIES):
        variants = []
        for _ in range(4):
            if category in sources:
                with Image.open(sources[category]) as original:
                    picture = ImageOps.exif_transpose(original).convert("RGB")
                keep = rng.uniform(0.72, 0.95)
                wide, tall = int(picture.width * keep), int(picture.height * keep)
                left, top = rng.randint(0, picture.width - wide), rng.randint(0, picture.height - tall)
                picture = picture.crop((left, top, left + wide, top + tall))
                picture = ImageOps.mirror(picture) if rng.random() < 0.5 else picture
                picture.thumbnail((1280, 1280))
            else:
                picture = SCENES[category](rng).filter(ImageFilter.GaussianBlur(0.7))
            variants.append(sanitize_image(jpeg(picture)))
        pool[category] = variants
    return pool


def outer_ring(boundary: dict) -> list:
    return max((polygon[0] for polygon in barangays.polygons(boundary)), key=len)


def spot_inside(rng: random.Random, boundary: dict) -> tuple[float, float]:
    ring = outer_ring(boundary)
    west, east = min(point[0] for point in ring), max(point[0] for point in ring)
    south, north = min(point[1] for point in ring), max(point[1] for point in ring)
    while True:
        lat, lng = rng.uniform(south, north), rng.uniform(west, east)
        if barangays.contains(boundary, lat, lng):
            return round(lat, 6), round(lng, 6)


def near(rng: random.Random, boundary: dict, spot: tuple[float, float], metres: float) -> tuple[float, float]:
    """A pin close to `spot` and still inside the barangay."""
    for _ in range(40):
        reach = metres / 111_000
        lat, lng = round(spot[0] + rng.uniform(-reach, reach), 6), round(spot[1] + rng.uniform(-reach, reach), 6)
        if barangays.contains(boundary, lat, lng):
            return lat, lng
    return spot


def office_hours(moment: datetime, rng: random.Random) -> datetime:
    """Staff act from 7 in the morning to 7 in the evening, Philippine time."""
    local = moment.astimezone(MANILA)
    if 7 <= local.hour < 19:
        return moment
    day = local.date() + timedelta(days=1 if local.hour >= 19 else 0)
    return datetime.combine(day, time(8, rng.randint(0, 59)), MANILA).astimezone(UTC)


@dataclass
class Plan:
    area: int
    category: str
    verified: str
    created: datetime
    steps: list[tuple[str, datetime]]
    reason: tuple[str, str] | None = None
    members: list[datetime] = field(default_factory=list)  # Further residents' report times, for a grouped case.
    hero: bool = False


def month_starts(moment: datetime) -> list[datetime]:
    """UTC start of each story month, the month in progress last, and its end exclusive after that."""
    local = moment.astimezone(MANILA).date().replace(day=1)
    firsts = [local]
    for _ in range(3):
        firsts.insert(0, (firsts[0] - timedelta(days=1)).replace(day=1))
    return [datetime.combine(first, time.min, MANILA).astimezone(UTC) for first in firsts]


def lognormal(rng: random.Random, typical: float, low: float, high: float, spread=0.5) -> float:
    return max(low, min(high, typical * math.exp(rng.gauss(0, spread))))


def timeline(rng, created, month, speed, moment, rejected=None, snap=True, resolve_days=None):
    """The status steps of one report in order, each late enough after the last, and only those that have happened."""
    accept_hours = lognormal(rng, month.accept_hours * speed, 1.5, 60)
    check_at = created + timedelta(hours=accept_hours * rng.uniform(0.2, 0.55))
    fix = lambda value: office_hours(value, rng) if snap else value  # noqa: E731
    steps = [("Under Verification", fix(check_at))]
    accepted = fix(created + timedelta(hours=accept_hours))
    if accepted <= steps[-1][1]:
        accepted = steps[-1][1] + timedelta(minutes=rng.randint(20, 90))
    if rejected:
        steps.append(("Rejected", accepted))
    else:
        steps.append(("Accepted", accepted))
        days = resolve_days if resolve_days is not None else lognormal(rng, month.resolve_days * speed, 0.6, 24, 0.45)
        steps.append(("In Progress", fix(accepted + timedelta(days=days * rng.uniform(0.15, 0.5)))))
        steps.append(
            ("Resolved", accepted + timedelta(days=days) if not snap else fix(accepted + timedelta(days=days)))
        )
    in_order = [steps[0]]
    for status, when in steps[1:]:
        in_order.append((status, max(when, in_order[-1][1] + timedelta(minutes=5))))
    return [step for step in in_order if step[1] < moment]


def weighted_category(rng: random.Random) -> str:
    names = sorted(CATEGORY_WEIGHTS)
    return rng.choices(names, [CATEGORY_WEIGHTS[name] for name in names])[0]


def reported_at(rng: random.Random, low: datetime, high: datetime) -> datetime:
    """Any day in the range, in a resident's waking hours."""
    for _ in range(50):
        moment = low + (high - low) * rng.random()
        local = moment.astimezone(MANILA)
        if 6 <= local.hour < 22:
            return moment
    return moment  # The small hours of a month's first day have no waking hours in them.


def build_plans(rng: random.Random, moment: datetime) -> list[Plan]:
    starts = month_starts(moment)
    plans = []
    for area, (_, volume, speed) in enumerate(STORY_BARANGAYS):
        for index, month in enumerate(STORY_MONTHS):
            low = starts[index]
            high = starts[index + 1] if index < 3 else moment
            share = 1.0 if index < 3 else (moment - low) / timedelta(days=30)
            for _ in range(max(1, round(month.reports * volume * share))):
                created = reported_at(rng, low, high)
                reason = rng.choice(REJECTIONS) if rng.random() < month.rejected else None
                steps = timeline(rng, created, month, speed, moment, rejected=reason is not None)
                if rng.random() < month.stuck and not reason:
                    # Left where it is: the backlog a real desk would also have.
                    steps = steps[: rng.randint(1, 3)]
                category = weighted_category(rng)
                # Sometimes staff correct the resident's category. Three fields, kept distinct.
                verified = weighted_category(rng) if rng.random() < 0.08 else category
                plan = Plan(
                    area, category, verified, created, steps, reason if steps and steps[-1][0] == "Rejected" else None
                )
                if not reason and rng.random() < 0.14 and steps:
                    first_step = steps[0][1]
                    plan.members = [
                        created + (first_step - created) * rng.uniform(0.2, 0.9) for _ in range(rng.randint(1, 2))
                    ]
                plans.append(plan)
        # So "fixed this month" has something to show, even early in a month.
        current = STORY_MONTHS[-1]
        for _ in range(5):
            resolved = starts[-1] + (moment - timedelta(minutes=30) - starts[-1]) * rng.random()
            days = lognormal(rng, current.resolve_days * speed, 0.6, 12, 0.35)
            hours_before = lognormal(rng, current.accept_hours * speed, 1.5, 48)
            created = resolved - timedelta(days=days, hours=hours_before)
            category = weighted_category(rng)
            plans.append(
                Plan(
                    area,
                    category,
                    category,
                    created,
                    [
                        ("Under Verification", created + timedelta(hours=hours_before * 0.4)),
                        ("Accepted", created + timedelta(hours=hours_before)),
                        ("In Progress", created + timedelta(hours=hours_before, days=days * 0.4)),
                        ("Resolved", resolved),
                    ],
                )
            )
        # And a queue with something fresh in it.
        for ago, last in ((3, 0), (9, 0), (20, 1), (40, 2), (70, 3)):
            created = moment - timedelta(hours=ago)
            steps = [
                ("Under Verification", created + timedelta(hours=1)),
                ("Accepted", created + timedelta(hours=8)),
                ("In Progress", created + timedelta(hours=30)),
            ][:last]
            category = weighted_category(rng)
            plans.append(Plan(area, category, category, created, steps))
    return sorted(plans, key=lambda plan: plan.created)


def add_report(db, rng, plan, created, resident, spot, street, area_id, pool):
    report = Report(
        resident_id=resident.id,
        resident_category=plan.category,
        status="Pending",
        image_path="",
        description=rng.choice(DESCRIPTIONS[plan.category]),
        latitude=spot[0],
        longitude=spot[1],
        location_label=street,
        location_source=rng.choices(("photo", "device", "manual"), (5, 3, 2))[0],
        hazards=HAZARDS.get(plan.category) if rng.random() < 0.4 else None,
        barangay_id=area_id,
        created_at=created,
        updated_at=created,
    )
    db.add(report)
    db.flush()
    db.add(ReportEvent(report_id=report.id, to_status="Pending", actor_id=resident.id, created_at=created))
    report.image_path = save_image(report.id, rng.choice(pool[plan.category]))
    return report


def note_for(rng: random.Random, plan: Plan, status: str) -> str:
    if status == "Under Verification":
        return rng.choice(CHECK_NOTES)
    if status == "Accepted":
        return ACCEPT_NOTES[plan.verified]
    if status == "In Progress":
        return WORK_NOTES[plan.verified]
    if status == "Resolved":
        return DONE_NOTES[plan.verified]
    return plan.reason[1]


def date_new_points(db, report_ids: list[str], moment: datetime, started: datetime) -> None:
    """Points settled just now belong to the story's date, which is also what the daily cap reads."""
    db.flush()
    for entry in db.scalars(
        select(PointEntry).where(PointEntry.report_id.in_(report_ids), PointEntry.created_at >= started)
    ):
        entry.created_at = moment


def walk(db, rng, plan, reports, staff, moment, started, reader_cutoff):
    previous = "Pending"
    case = None
    if len(reports) > 1 and plan.steps:
        spot = reports[0]
        case = Case(
            category=plan.verified,
            latitude=spot.latitude,
            longitude=spot.longitude,
            location_label=spot.location_label,
            created_by=staff.id,
            created_at=plan.steps[0][1],
        )
        db.add(case)
        db.flush()
        for report in reports:
            report.case_id, report.case_confirmed = case.id, True
    for status, when in plan.steps:
        if status not in NEXT[previous]:
            raise ValueError(f"{previous} cannot become {status}")
        note = note_for(rng, plan, status)
        for report in reports:
            db.add(
                ReportEvent(
                    report_id=report.id,
                    from_status=previous,
                    to_status=status,
                    actor_id=staff.id,
                    note=note,
                    rejection_reason=plan.reason[0] if status == "Rejected" else None,
                    created_at=when,
                )
            )
            db.add(
                Notification(
                    user_id=report.resident_id,
                    report_id=report.id,
                    status=status,
                    created_at=when,
                    read_at=when + timedelta(hours=rng.randint(1, 30)) if when < reader_cutoff else None,
                )
            )
            report.status, report.updated_at = status, when
            if status == "Accepted":
                report.verified_category = plan.verified
                if case is None:
                    case = Case(
                        category=plan.verified,
                        latitude=report.latitude,
                        longitude=report.longitude,
                        location_label=report.location_label,
                        created_by=staff.id,
                        created_at=when,
                    )
                    db.add(case)
                    db.flush()
                    report.case_id, report.case_confirmed = case.id, True
            db.flush()
            points.settle(db, report)
            date_new_points(db, [item.id for item in reports], when, started)
        if status == "In Progress":
            action = rng.choice(ACTIONS)
            for report in reports:
                db.add(
                    StaffAction(
                        report_id=report.id,
                        actor_id=staff.id,
                        kind="action",
                        note=action,
                        created_at=when + timedelta(hours=2),
                    )
                )
            if rng.random() < 0.3:
                db.add(
                    StaffAction(
                        report_id=reports[0].id,
                        actor_id=staff.id,
                        kind="coordination",
                        note=rng.choice(COORDINATION),
                        created_at=when + timedelta(hours=1),
                    )
                )
        previous = status


def spend_points(db, rng, residents, staff_by_area, moment):
    """Codes in each state a resident can hold: bought with points they earned, at the shop's prices."""
    for resident, area_id in residents:
        balance = points.balance(db, resident.id)
        rewards = sorted(
            db.scalars(
                select(Reward).where(Reward.barangay_id == area_id, Reward.active, Reward.points_cost <= balance)
            ),
            key=lambda reward: (reward.points_cost, reward.name),
        )
        if not rewards or rng.random() < 0.3:
            continue
        kept = (
            "active" if resident.email == "resident1@demo.test" else rng.choice(("active", "used", "used", "expired"))
        )
        reward = rng.choice([item for item in rewards if item.stock is None] or rewards)
        days_ago = {"active": rng.randint(1, 20), "used": rng.randint(5, 50), "expired": rng.randint(32, 60)}[kept]
        bought = moment - timedelta(days=days_ago)
        voucher = Voucher(
            code="".join(rng.choices(points.CODE_LETTERS, k=points.CODE_LENGTH)),
            user_id=resident.id,
            reward_id=reward.id,
            barangay_id=area_id,
            points_cost=reward.points_cost,
            status=kept,
            created_at=bought,
            expires_at=bought + timedelta(days=30),
        )
        if kept == "used":
            voucher.used_at, voucher.used_by = bought + timedelta(days=rng.randint(1, 4)), staff_by_area[area_id].id
        db.add(voucher)
        db.flush()
        db.add(
            PointEntry(
                user_id=resident.id, kind="redeem", amount=-reward.points_cost, voucher_id=voucher.id, created_at=bought
            )
        )
        if kept == "expired":
            db.add(
                PointEntry(
                    user_id=resident.id,
                    kind="refund",
                    amount=reward.points_cost,
                    voucher_id=voucher.id,
                    created_at=voucher.expires_at,
                )
            )


def seed_story(
    password, staff_password=None, admin_password=None, moment: datetime | None = None, photos: Path = COMMONS
) -> dict:
    """Fills an empty database. `moment` is the story's "now"; the same one gives the same story."""
    if not is_local():
        raise SystemExit("Refusing to seed a remote database with the story")
    url = make_url(database_url())
    target = Path(url.database or "")
    if target.resolve() == (project_root() / "barangai-dev.db").resolve():
        raise SystemExit("The story never goes in the real database. Set DATABASE_URL, or use deploy/demo.ps1.")
    # Looked at before migrating: a database in use must not change at all on its way to being refused.
    if target.is_file():
        engine = engine_for_url(database_url())
        if inspect(engine).has_table("users"):
            with Session(engine) as db:
                if db.scalar(select(User.id).limit(1)):
                    raise SystemExit("The story needs an empty database, so it can never mix with real records.")
    upgrade_sqlite(keep_copy=False)
    passwords = role_passwords(password, staff_password, admin_password)
    moment = moment or datetime.now(UTC)
    rng = random.Random(STORY_SEED)
    with session_for_url() as db:
        if db.scalar(select(User.id).limit(1)) or db.scalar(select(Report.id).limit(1)):
            raise SystemExit(
                "The story needs an empty database, so it can never mix with real records. Use a fresh one."
            )
        admin = User(
            email="admin@demo.test",
            password_hash=hasher.hash(passwords["administrator"]),
            role="administrator",
            terms_accepted_at=moment,
            terms_version=TERMS_VERSION,
        )
        db.add(admin)
        db.commit()
    # Loading needs an administrator to exist, and starts enforcing each staff account's one barangay.
    barangays.import_boundaries(json.loads(BOUNDARIES.read_text(encoding="utf-8")))
    names = [name for name, _, _ in STORY_BARANGAYS]
    with session_for_url() as db:
        areas = {area.name: area for area in db.scalars(select(Barangay).where(Barangay.name.in_(names)))}
        staff_hash = hasher.hash(passwords["staff"])
        for index, name in enumerate(names):
            # The first keeps the address the screenshot script and the skill already use.
            email = "staff@demo.test" if index == 0 else f"staff-{name.lower().replace(' ', '-')}@demo.test"
            db.add(
                User(
                    email=email,
                    password_hash=staff_hash,
                    role="staff",
                    barangay_id=areas[name].id,
                    terms_accepted_at=moment,
                    terms_version=TERMS_VERSION,
                )
            )
        resident_hash = hasher.hash(passwords["resident"])
        for number in range(1, RESIDENTS_PER_BARANGAY * len(names) + 1):
            db.add(
                User(
                    email=f"resident{number}@demo.test",
                    password_hash=resident_hash,
                    role="resident",
                    terms_accepted_at=moment - timedelta(days=rng.randint(20, 100)),
                    terms_version=TERMS_VERSION,
                )
            )
        db.commit()
    seed_rewards(names)
    pool = photo_pool(rng, photos)
    started = now()
    reader_cutoff = moment - timedelta(days=3)
    with session_for_url() as db:
        areas = {area.name: area for area in db.scalars(select(Barangay).where(Barangay.name.in_(names)))}
        staff = {user.barangay_id: user for user in db.scalars(select(User).where(User.role == "staff"))}
        residents_by_area, residents = {}, []
        for index, name in enumerate(names):
            area = areas[name]
            numbers = range(index * RESIDENTS_PER_BARANGAY + 1, (index + 1) * RESIDENTS_PER_BARANGAY + 1)
            emails = [f"resident{number}@demo.test" for number in numbers]
            found = {user.email: user for user in db.scalars(select(User).where(User.email.in_(emails)))}
            residents_by_area[area.id] = [found[email] for email in emails]
            residents += [(found[email], area.id) for email in emails]
        streets = {}
        for name in names:
            area = areas[name]
            chosen = rng.sample(STREETS, 7)
            streets[area.id] = [(f"Demo {street} Street", spot_inside(rng, area.boundary)) for street in chosen]
        counts = {"reports": 0, "incidents": 0}
        for plan in build_plans(rng, moment):
            area = areas[names[plan.area]]
            street, anchor = rng.choice(streets[area.id])
            group = residents_by_area[area.id]
            # The first of each barangay reports a little more than the rest: resident1 is who the demo signs in as.
            first = rng.choices(group, [3, *[1] * (len(group) - 1)])[0]
            spot = near(rng, area.boundary, anchor, 90)
            reports = [add_report(db, rng, plan, plan.created, first, spot, street, area.id, pool)]
            others = [resident for resident in group if resident is not first]
            for when, resident in zip(plan.members, rng.sample(others, len(plan.members)), strict=True):
                reports.append(
                    add_report(db, rng, plan, when, resident, near(rng, area.boundary, spot, 12), street, area.id, pool)
                )
            walk(db, rng, plan, reports, staff[area.id], moment, started, reader_cutoff)
            for report in reports:
                if report.status == "Pending":
                    for person in (staff[area.id], db.scalar(select(User).where(User.role == "administrator"))):
                        db.add(
                            Notification(
                                user_id=person.id,
                                report_id=report.id,
                                status="Pending",
                                kind="new_report",
                                created_at=report.created_at,
                            )
                        )
            counts["reports"] += len(reports)
            counts["incidents"] += 1
        spend_points(db, rng, residents, staff, moment)
        db.commit()
    for email, role in (("staff@demo.test", "staff"), ("admin@demo.test", "administrator")):
        if not os.environ.get({"staff": "SEED_DEMO_STAFF_PASSWORD", "administrator": "SEED_DEMO_ADMIN_PASSWORD"}[role]):
            print(f"{email}: {passwords[role]}")
    return {**counts, "barangays": names, "cc0_photos": sorted(recorded_cc0(photos))}
