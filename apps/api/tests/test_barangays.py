import json
from pathlib import Path

import pytest
from barangai.barangays import contains, features_from
from conftest import register
from test_reports import submit
from test_workflow import change


def square(south, west, north, east, holes=()):
    ring = [[west, south], [east, south], [east, north], [west, north], [west, south]]
    return {"type": "Polygon", "coordinates": [ring, *holes]}


def feature(name, boundary):
    return {"type": "Feature", "properties": {"name": name}, "geometry": boundary}


# Two synthetic neighbouring areas, with a pin in each and one outside both.
NORTH = {"latitude": "14.615", "longitude": "121.005"}
SOUTH = {"latitude": "14.605", "longitude": "121.005"}
OUTSIDE = {"latitude": "15.5", "longitude": "121.005"}


def load_areas():
    from barangai.barangays import import_boundaries

    account("admin@example.test", "administrator")
    return import_boundaries(
        {
            "type": "FeatureCollection",
            "features": [
                feature("North", square(14.61, 121.0, 14.62, 121.01)),
                feature("South", square(14.60, 121.0, 14.61, 121.01)),
            ],
        }
    )


def account(email, role, barangay=None):
    from barangai.auth import hasher
    from barangai.db import session_for_url
    from barangai.models import Barangay, User

    with session_for_url() as db:
        area = db.query(Barangay).filter_by(name=barangay).one() if barangay else None
        db.add(
            User(
                email=email,
                password_hash=hasher.hash("account-password-123"),
                role=role,
                barangay_id=area.id if area else None,
            )
        )
        db.commit()


def login(client, email):
    client.cookies.clear()
    assert client.post("/auth/login", json={"email": email, "password": "account-password-123"}).status_code == 200


def post(client, path, **body):
    return client.post(path, json=body, headers={"X-CSRF-Token": client.cookies.get("csrf_token", "")})


@pytest.fixture
def desk(client, photo):
    """A report in each area and one outside both, with staff for each area, unassigned staff and an administrator."""
    load_areas()
    account("north@example.test", "staff", "North")
    account("south@example.test", "staff", "South")
    account("nobody@example.test", "staff")
    register(client)
    ids = {
        "north": submit(client, photo, **NORTH).json()["id"],
        "south": submit(client, photo, **SOUTH).json()["id"],
        "outside": submit(client, photo, **OUTSIDE).json()["id"],
    }
    return ids


def test_contains_handles_holes_and_multipolygons():
    from barangai.barangays import contains

    hole = [[0.4, 0.4], [0.6, 0.4], [0.6, 0.6], [0.4, 0.6], [0.4, 0.4]]
    boundary = square(0, 0, 1, 1, holes=[hole])
    assert contains(boundary, 0.2, 0.2)
    assert not contains(boundary, 0.5, 0.5)
    assert not contains(boundary, 1.5, 0.5)
    several = {
        "type": "MultiPolygon",
        "coordinates": [square(0, 0, 1, 1)["coordinates"], square(5, 5, 6, 6)["coordinates"]],
    }
    assert contains(several, 5.5, 5.5)
    assert not contains(several, 3, 3)


@pytest.mark.parametrize(
    "boundary",
    [
        None,
        {"type": "Point", "coordinates": [1, 1]},
        {"type": "Polygon", "coordinates": []},
        {"type": "Polygon", "coordinates": [[[0, 0], [1, 1], [0, 0]]]},
        {"type": "Polygon", "coordinates": [[[0, 0], [1, 0], [1, 1], [0, 1]]]},
        {"type": "Polygon", "coordinates": [[[0, 0], [1, 0], [float("nan"), 1], [0, 0]]]},
        {"type": "Polygon", "coordinates": [[[0, 0], [True, 0], [1, 1], [0, 0]]]},
        {"type": "Polygon", "coordinates": [[[0, 0], [200, 0], [1, 1], [0, 0]]]},
    ],
)
def test_bad_boundaries_are_refused(boundary):
    from barangai.barangays import clean_boundary

    with pytest.raises(ValueError):
        clean_boundary(boundary)


def test_import_saves_nothing_when_any_feature_is_bad(client):
    from barangai.barangays import import_boundaries
    from barangai.db import session_for_url
    from barangai.models import Barangay

    good = feature("Good", square(0, 0, 1, 1))
    for data in (
        {"type": "FeatureCollection", "features": [good, feature("Bad", {"type": "Point"})]},
        {"type": "FeatureCollection", "features": [good, good]},
        {"type": "FeatureCollection", "features": []},
        feature(" ", square(0, 0, 1, 1)),
    ):
        with pytest.raises(ValueError):
            import_boundaries(data)
    with session_for_url() as db:
        assert db.query(Barangay).count() == 0


def test_all_staff_share_one_desk_until_barangays_are_loaded(client, photo):
    account("staff@example.test", "staff")
    register(client)
    report_id = submit(client, photo).json()["id"]
    login(client, "staff@example.test")
    assert [report["id"] for report in client.get("/reports").json()] == [report_id]
    assert client.get(f"/reports/{report_id}").json()["barangay"] is None
    updates = client.get("/notifications").json()
    assert [item["report_id"] for item in updates] == [report_id]


def test_the_server_places_a_report_from_its_pin(client, desk, photo):
    login(client, "admin@example.test")
    assert client.get(f"/reports/{desk['north']}").json()["barangay"] == "North"
    assert client.get(f"/reports/{desk['south']}").json()["barangay"] == "South"
    assert client.get(f"/reports/{desk['outside']}").json()["barangay"] is None
    client.cookies.clear()
    register(client, "second@example.test")
    from barangai.db import session_for_url
    from barangai.models import Barangay, Report

    # A field the client adds is ignored.
    with session_for_url() as db:
        south_id = db.query(Barangay).filter_by(name="South").one().id
    sent = submit(client, photo, barangay_id=south_id, **NORTH).json()
    assert "barangay" not in sent  # staff-only field
    with session_for_url() as db:
        assert db.get(Report, sent["id"]).barangay.name == "North"


@pytest.mark.parametrize(
    "email, visible",
    [
        ("north@example.test", {"north"}),
        ("south@example.test", {"south"}),
        ("nobody@example.test", set()),
        ("admin@example.test", {"north", "south", "outside"}),
    ],
)
def test_each_account_sees_only_its_jurisdiction(client, desk, email, visible):
    login(client, email)
    listed = {report["id"] for report in client.get("/reports").json()}
    assert listed == {desk[name] for name in visible}
    for name, report_id in desk.items():
        expected = 200 if name in visible else 404
        assert client.get(f"/reports/{report_id}").status_code == expected
        assert client.get(f"/reports/{report_id}/image").status_code == expected
        assert client.get(f"/reports/{report_id}/case").status_code == expected
        assert client.get(f"/reports/{report_id}/duplicates").status_code == expected


def test_staff_cannot_act_on_another_barangays_report(client, desk):
    login(client, "north@example.test")
    other = desk["south"]
    assert change(client, other, "Under Verification").status_code == 404
    assert post(client, f"/reports/{other}/actions", kind="action", note="Synthetic").status_code == 404
    assert post(client, f"/reports/{other}/duplicates/generate").status_code == 404
    assert post(client, f"/reports/{other}/case/decision", decision="confirmed").status_code == 404
    assert post(client, "/cases/link", report_id=desk["north"], other_report_id=other).status_code == 404
    assert change(client, desk["outside"], "Under Verification").status_code == 404
    login(client, "admin@example.test")
    assert client.get(f"/reports/{other}").json()["status"] == "Pending"
    assert change(client, desk["outside"], "Under Verification").status_code == 200


def test_notifications_reach_only_the_barangays_staff_and_administrators(client, desk):
    expected = {
        "north@example.test": {"north"},
        "south@example.test": {"south"},
        "nobody@example.test": set(),
        "admin@example.test": {"north", "south", "outside"},
    }
    for email, names in expected.items():
        login(client, email)
        assert {item["report_id"] for item in client.get("/notifications").json()} == {desk[name] for name in names}


def test_notifications_follow_staff_who_move(client, desk):
    from barangai.bootstrap_staff import assign_barangay

    assign_barangay("north@example.test", "South")
    login(client, "north@example.test")
    assert client.get("/notifications").json() == []
    assert client.get(f"/reports/{desk['south']}").status_code == 200
    assert client.get(f"/reports/{desk['north']}").status_code == 404


def test_daily_brief_counts_only_the_jurisdiction(client, desk):
    expected = {"north@example.test": 1, "nobody@example.test": 0, "admin@example.test": 3}
    for email, count in expected.items():
        login(client, email)
        assert client.get("/staff/brief").json()["facts"]["open"] == count


def test_resolved_count_in_brief_stays_in_the_jurisdiction(client, desk):
    login(client, "south@example.test")
    for status, extra in (
        ("Under Verification", {}),
        ("Accepted", {"verified_category": "flooding"}),
        ("In Progress", {}),
        ("Resolved", {}),
    ):
        assert change(client, desk["south"], status, **extra).status_code == 200
    assert client.get("/staff/brief").json()["facts"]["resolved_today"] == 1
    login(client, "north@example.test")
    assert client.get("/staff/brief").json()["facts"]["resolved_today"] == 0


def duplicate_ready(report_ids):
    from barangai.db import session_for_url
    from barangai.models import Report

    with session_for_url() as db:
        for report_id in report_ids:
            report = db.get(Report, report_id)
            report.image_embedding = [1.0, 0.0]
            report.embedding_model_version = "validated-synthetic-v1"
        db.commit()


def suggest(report_id):
    from barangai import cases
    from barangai.db import session_for_url
    from barangai.models import DuplicateSuggestion, Report

    with session_for_url() as db:
        cases.suggest_duplicates(db, db.get(Report, report_id))
    with session_for_url() as db:
        return [item.candidate_report_id for item in db.query(DuplicateSuggestion).filter_by(report_id=report_id)]


def test_suggestions_stay_inside_the_barangay(client, photo, monkeypatch):
    monkeypatch.setenv("VALIDATED_EMBEDDING_MODEL_VERSION", "validated-synthetic-v1")
    load_areas()
    register(client)
    # Metres apart, on either side of the shared border.
    north = submit(client, photo, latitude="14.6101", longitude="121.005", resident_category="other").json()["id"]
    neighbour = submit(client, photo, latitude="14.6102", longitude="121.005", resident_category="other").json()["id"]
    south = submit(client, photo, latitude="14.6099", longitude="121.005", resident_category="other").json()["id"]
    duplicate_ready([north, neighbour, south])
    assert suggest(south) == []
    assert suggest(north) == [neighbour]


def test_duplicate_decision_is_limited_to_the_barangay(client, desk, monkeypatch):
    from barangai.db import session_for_url
    from barangai.models import DuplicateSuggestion

    with session_for_url() as db:
        item = DuplicateSuggestion(
            report_id=desk["south"], candidate_report_id=desk["south"], model_version="synthetic", score=0.9
        )
        db.add(item)
        db.commit()
        suggestion_id = item.id
    login(client, "north@example.test")
    assert post(client, f"/duplicates/{suggestion_id}/decision", decision="confirmed").status_code == 404
    login(client, "south@example.test")
    assert post(client, f"/duplicates/{suggestion_id}/decision", decision="confirmed").status_code == 200


def test_administrators_cannot_group_across_barangays(client, desk):
    login(client, "admin@example.test")
    response = post(client, "/cases/link", report_id=desk["north"], other_report_id=desk["south"])
    assert response.status_code == 409


def test_evidence_from_across_a_border_stands_alone(client, desk, photo):
    login(client, "south@example.test")
    assert change(client, desk["south"], "Under Verification").status_code == 200
    accepted = change(client, desk["south"], "Accepted", verified_category="flooding").json()
    client.cookies.clear()
    register(client, "neighbour@example.test")
    across = submit(client, photo, case_id=accepted["case_id"], **NORTH).json()
    same = submit(client, photo, case_id=accepted["case_id"], **SOUTH).json()
    assert across["case_id"] is None
    assert same["case_id"] == accepted["case_id"]


def test_loading_barangays_places_older_reports_and_keeps_cases_together(client, photo):
    account("staff@example.test", "staff")
    register(client)
    first = submit(client, photo, **SOUTH).json()["id"]
    linked = submit(client, photo, **NORTH).json()["id"]
    lone = submit(client, photo, **NORTH).json()["id"]
    outside = submit(client, photo, **OUTSIDE).json()["id"]
    login(client, "staff@example.test")
    assert post(client, "/cases/link", report_id=first, other_report_id=linked, confirm_far=True).status_code == 200
    assert load_areas()["reports_assigned"] == 3

    from barangai.barangays import import_boundaries
    from barangai.db import session_for_url
    from barangai.models import Report

    def placed():
        with session_for_url() as db:
            return {
                report_id: getattr(db.get(Report, report_id).barangay, "name", None)
                for report_id in (first, linked, lone, outside)
            }

    assert placed() == {first: "South", linked: "South", lone: "North", outside: None}
    # Redrawing a boundary never moves a report that already has a barangay.
    assert import_boundaries(feature("North", square(14.0, 121.0, 14.1, 121.01)))["reports_assigned"] == 0
    assert placed() == {first: "South", linked: "South", lone: "North", outside: None}


def test_staff_accounts_and_the_barangay_rules(client):
    from barangai.bootstrap_staff import assign_barangay, create_staff
    from barangai.db import session_for_url
    from barangai.models import User

    password = "account-password-123"
    load_areas()
    with pytest.raises(ValueError):
        create_staff("a@example.test", password, "staff")
    with pytest.raises(ValueError):
        create_staff("a@example.test", password, "staff", "Nowhere")
    with pytest.raises(ValueError):
        create_staff("a@example.test", password, "administrator", "North")
    create_staff("a@example.test", password, "staff", "North")
    create_staff("b@example.test", password, "administrator")
    with session_for_url() as db:
        assert db.query(User).filter_by(email="a@example.test").one().barangay.name == "North"
    login(client, "a@example.test")
    assert client.get("/auth/me").json()["barangay"] == "North"
    assign_barangay("a@example.test", "South")
    assert client.get("/auth/me").json()["barangay"] == "South"
    with pytest.raises(ValueError):
        assign_barangay("b@example.test", "South")
    with pytest.raises(ValueError):
        assign_barangay("a@example.test", "Nowhere")


def test_loading_needs_an_administrator(client):
    from barangai.barangays import import_boundaries

    with pytest.raises(ValueError, match="administrator"):
        import_boundaries(feature("North", square(14.61, 121.0, 14.62, 121.01)))


def test_dry_run_reports_and_saves_nothing(client, photo):
    from barangai.barangays import import_boundaries
    from barangai.db import session_for_url
    from barangai.models import Barangay, Report

    account("admin@example.test", "administrator")
    account("staff@example.test", "staff")
    register(client)
    report_id = submit(client, photo, **NORTH).json()["id"]
    submit(client, photo, **OUTSIDE)
    result = import_boundaries(feature("North", square(14.61, 121.0, 14.62, 121.01)), dry_run=True)
    assert result["reports_assigned"] == 1
    assert result["reports_outside_every_boundary"] == 1
    assert result["staff_without_barangay"] == 1
    assert result["saved"] is False
    with session_for_url() as db:
        assert db.query(Barangay).count() == 0
        assert db.get(Report, report_id).barangay_id is None


def crossing_suggestion(north_id, south_id, decision="pending"):
    from barangai.db import session_for_url
    from barangai.models import DuplicateSuggestion

    with session_for_url() as db:
        item = DuplicateSuggestion(
            report_id=north_id, candidate_report_id=south_id, model_version="synthetic", score=0.9, decision=decision
        )
        db.add(item)
        db.commit()
        return item.id


def test_a_pair_across_a_border_cannot_be_decided(client, desk):
    from barangai.db import session_for_url
    from barangai.models import DuplicateSuggestion

    suggestion_id = crossing_suggestion(desk["north"], desk["south"])
    for email in ("north@example.test", "admin@example.test"):
        login(client, email)
        assert post(client, f"/duplicates/{suggestion_id}/decision", decision="confirmed").status_code == 409
    login(client, "south@example.test")
    assert post(client, f"/duplicates/{suggestion_id}/decision", decision="confirmed").status_code == 404
    with session_for_url() as db:
        assert db.get(DuplicateSuggestion, suggestion_id).decision == "pending"
    login(client, "north@example.test")
    assert post(client, f"/duplicates/{suggestion_id}/decision", decision="rejected").status_code == 200


def test_loading_removes_only_pending_suggestions_a_border_now_separates(client, photo):
    from barangai.db import session_for_url
    from barangai.models import DuplicateSuggestion

    register(client)
    north = submit(client, photo, **NORTH).json()["id"]
    neighbour = submit(client, photo, **NORTH).json()["id"]
    south = submit(client, photo, **SOUTH).json()["id"]
    crossing = crossing_suggestion(north, south)
    decided = crossing_suggestion(south, north, decision="rejected")
    inside = crossing_suggestion(north, neighbour)
    assert load_areas()["suggestions_removed"] == 1
    with session_for_url() as db:
        assert db.get(DuplicateSuggestion, crossing) is None
        assert db.get(DuplicateSuggestion, decided) is not None
        assert db.get(DuplicateSuggestion, inside) is not None


def test_rejecting_a_link_returns_the_report_to_its_own_barangay(client, photo):
    from barangai.db import session_for_url
    from barangai.models import Report

    account("staff@example.test", "staff")
    register(client)
    first = submit(client, photo, **SOUTH).json()["id"]
    login(client, "staff@example.test")
    assert change(client, first, "Under Verification").status_code == 200
    case_id = change(client, first, "Accepted", verified_category="flooding").json()["case_id"]
    client.cookies.clear()
    register(client, "neighbour@example.test")
    linked = submit(client, photo, case_id=case_id, **NORTH).json()
    assert linked["case_id"] == case_id
    load_areas()
    login(client, "admin@example.test")
    assert client.get(f"/reports/{linked['id']}").json()["barangay"] == "South"
    assert post(client, f"/reports/{linked['id']}/case/decision", decision="rejected").status_code == 200
    with session_for_url() as db:
        assert db.get(Report, linked["id"]).barangay.name == "North"


def test_rejecting_a_link_places_a_report_that_had_no_barangay(client, photo):
    from barangai.db import session_for_url
    from barangai.models import Report

    account("staff@example.test", "staff")
    register(client)
    first = submit(client, photo, **OUTSIDE).json()["id"]
    login(client, "staff@example.test")
    assert change(client, first, "Under Verification").status_code == 200
    case_id = change(client, first, "Accepted", verified_category="flooding").json()["case_id"]
    client.cookies.clear()
    register(client, "neighbour@example.test")
    linked = submit(client, photo, case_id=case_id, **NORTH).json()["id"]
    load_areas()
    with session_for_url() as db:
        assert db.get(Report, linked).barangay_id is None
    login(client, "admin@example.test")
    assert post(client, f"/reports/{linked}/case/decision", decision="rejected").status_code == 200
    with session_for_url() as db:
        assert db.get(Report, linked).barangay.name == "North"


def test_boundaries_and_locate_need_a_session(client):
    assert client.get("/barangays/boundaries").status_code == 401
    assert client.get("/barangays/locate", params={"lat": 14.6, "lng": 121.0}).status_code == 401


def test_maps_get_no_borders_and_no_warning_before_barangays_are_loaded(client):
    register(client)
    assert client.get("/barangays/boundaries").json() == {"type": "FeatureCollection", "features": []}
    assert client.get("/barangays/locate", params={"lat": 14.6, "lng": 121.0}).json() == {
        "active": False,
        "barangay": None,
    }


def test_locate_previews_the_barangay_of_a_pin(client):
    load_areas()
    register(client)
    pin = {"lat": NORTH["latitude"], "lng": NORTH["longitude"]}
    assert client.get("/barangays/locate", params=pin).json() == {"active": True, "barangay": "North"}
    pin = {"lat": OUTSIDE["latitude"], "lng": OUTSIDE["longitude"]}
    assert client.get("/barangays/locate", params=pin).json() == {"active": True, "barangay": None}
    assert client.get("/barangays/locate", params={"lat": 91, "lng": 121.0}).status_code == 422


def test_display_borders_are_lighter_but_the_stored_boundary_is_untouched(client):
    from barangai.barangays import display_ring, import_boundaries

    account("admin@example.test", "administrator")
    # A straight edge with needless points, plus one real corner the simplifying must keep.
    edge = [[121.0 + step / 1000, 14.6] for step in range(11)]
    ring = [*edge, [121.01, 14.61], [121.005, 14.615], [121.0, 14.61], edge[0]]
    assert display_ring(ring) == [
        [121.0, 14.6],
        [121.01, 14.6],
        [121.01, 14.61],
        [121.005, 14.615],
        [121.0, 14.61],
        [121.0, 14.6],
    ]
    import_boundaries(
        {"type": "Feature", "properties": {"name": "Edge"}, "geometry": {"type": "Polygon", "coordinates": [ring]}}
    )
    register(client)
    feature_out = client.get("/barangays/boundaries").json()["features"][0]
    assert feature_out["properties"] == {"name": "Edge"}
    assert len(feature_out["geometry"]["coordinates"][0]) < len(ring)
    from barangai.db import session_for_url
    from barangai.models import Barangay

    with session_for_url() as db:
        assert db.query(Barangay).one().boundary["coordinates"][0] == ring


def test_the_dasmarinas_file_has_every_barangay_and_places_known_pins():
    import json
    from pathlib import Path

    from barangai.barangays import contains, features_from

    path = Path(__file__).parents[1] / "data" / "dasmarinas-barangays.geojson"
    areas = dict(features_from(json.loads(path.read_text(encoding="utf-8"))))
    assert len(areas) == 75
    # Inside each one according to the file itself: guards against swapped coordinates and a bad export.
    for name, lat, lng in (
        ("Salawag", 14.3416, 120.9692),
        ("Paliparan II", 14.3009, 120.993),
        ("Zone IV", 14.3236, 120.9399),
    ):
        assert [area for area, boundary in areas.items() if contains(boundary, lat, lng)] == [name]
    assert not any(contains(boundary, 14.5995, 120.9842) for boundary in areas.values())  # Manila


@pytest.mark.parametrize("path, params", [("boundaries", {}), ("locate", {"lat": 14.6, "lng": 121.0})])
def test_boundary_routes_are_rate_limited(client, path, params):
    register(client)
    statuses = [client.get(f"/barangays/{path}", params=params).status_code for _ in range(31)]
    assert statuses == [200] * 30 + [429]


def test_taft_file_covers_the_campus_without_touching_dasmarinas():
    data_dir = Path(__file__).resolve().parents[1] / "data"
    taft = features_from(json.loads((data_dir / "taft-barangays.geojson").read_text(encoding="utf-8")))
    dasmarinas = features_from(json.loads((data_dir / "dasmarinas-barangays.geojson").read_text(encoding="utf-8")))
    assert len(taft) == 13
    assert not {name for name, _ in taft} & {name for name, _ in dasmarinas}
    assert [name for name, boundary in taft if contains(boundary, 14.5649, 120.9930)] == ["Barangay 719"]


def test_staff_decide_deletion_requests_only_in_their_barangay(client, desk):
    from barangai.db import session_for_url
    from barangai.models import Notification, Report, User

    assert post(client, f"/reports/{desk['south']}/deletion-request", reason="Synthetic").status_code == 201
    with session_for_url() as db:
        told = {
            db.get(User, item.user_id).email
            for item in db.query(Notification).filter_by(kind="deletion_request").all()
        }
    assert told == {"south@example.test", "admin@example.test"}
    login(client, "north@example.test")
    decision = f"/reports/{desk['south']}/deletion-request/decision"
    assert post(client, decision, decision="approved").status_code == 404
    login(client, "south@example.test")
    assert post(client, decision, decision="approved").json()["status"] == "approved"
    with session_for_url() as db:
        assert db.get(Report, desk["south"]) is None


def test_a_moved_report_tells_its_new_barangay_about_a_pending_deletion(client, photo):
    from barangai.db import session_for_url
    from barangai.models import Notification, Report, User

    account("staff@example.test", "staff")
    register(client)
    first = submit(client, photo, **SOUTH).json()["id"]
    login(client, "staff@example.test")
    assert change(client, first, "Under Verification").status_code == 200
    case_id = change(client, first, "Accepted", verified_category="flooding").json()["case_id"]
    client.cookies.clear()
    register(client, "neighbour@example.test")
    linked = submit(client, photo, case_id=case_id, **NORTH).json()["id"]
    assert post(client, f"/reports/{linked}/deletion-request", reason="Synthetic").status_code == 201
    load_areas()
    account("north@example.test", "staff", "North")
    account("south@example.test", "staff", "South")
    login(client, "admin@example.test")
    assert post(client, f"/reports/{linked}/case/decision", decision="rejected").status_code == 200
    with session_for_url() as db:
        assert db.get(Report, linked).barangay.name == "North"
        told = {
            db.get(User, item.user_id).email
            for item in db.query(Notification).filter_by(kind="deletion_request", report_id=linked).all()
        }
    assert "north@example.test" in told
    assert "south@example.test" not in told
