"""Who can sign up, report and guess passwords: per-address caps, the password blocklist and the daily lockout."""

from datetime import timedelta

import pytest
from conftest import register
from test_barangays import account
from test_cases import PASSWORD, headers, login


def usage(prefix):
    from barangai.db import session_for_url
    from barangai.models import Usage

    with session_for_url() as db:
        return sum(item.count for item in db.query(Usage).all() if item.key.startswith(prefix))


def from_address(address):
    return {"X-Forwarded-For": address}


def join(client, email, address):
    return client.post(
        "/auth/register",
        json={"email": email, "password": PASSWORD, "accepted_terms": True},
        headers=from_address(address),
    )


def test_one_address_cannot_use_up_the_sites_signups(client, monkeypatch):
    monkeypatch.setenv("TRUSTED_PROXY_HOPS", "1")
    monkeypatch.setenv("MAX_SIGNUPS_PER_ADDRESS_PER_DAY", "2")
    assert join(client, "a@example.test", "10.0.0.1").status_code == 201
    assert join(client, "b@example.test", "10.0.0.1").status_code == 201
    refused = join(client, "c@example.test", "10.0.0.1")
    assert refused.status_code == 429 and "network" in refused.json()["detail"]
    # Checked first, so the refused attempt took nothing from the site's own counter.
    assert usage("signups:") == 2
    # Each phone on the Wi-Fi has its own address.
    assert join(client, "c@example.test", "10.0.0.2").status_code == 201


def test_one_address_cannot_use_up_the_sites_reports(client, photo, monkeypatch):
    monkeypatch.setenv("TRUSTED_PROXY_HOPS", "1")
    monkeypatch.setenv("MAX_REPORTS_PER_ADDRESS_PER_DAY", "1")

    def send(address):
        return client.post(
            "/reports",
            data={"latitude": "14.6", "longitude": "121.0", "resident_category": "flooding"},
            files={"image": ("incident.jpg", photo, "image/jpeg")},
            headers={"X-CSRF-Token": client.cookies.get("csrf_token", ""), **from_address(address)},
        )

    assert join(client, "a@example.test", "10.0.0.1").status_code == 201
    assert send("10.0.0.1").status_code == 201
    refused = send("10.0.0.1")
    assert refused.status_code == 429 and "network" in refused.json()["detail"]
    assert usage("reports:") == 1
    assert send("10.0.0.2").status_code == 201


def test_callers_that_cant_be_told_apart_are_not_capped_as_one(client, monkeypatch):
    """Behind a proxy before TRUSTED_PROXY_HOPS is set, every resident looks like the proxy."""
    monkeypatch.setenv("MAX_SIGNUPS_PER_ADDRESS_PER_DAY", "1")
    assert join(client, "a@example.test", "10.0.0.1").status_code == 201
    assert join(client, "b@example.test", "10.0.0.1").status_code == 201


def test_addresses_are_stored_hashed(client, monkeypatch):
    from barangai.db import session_for_url
    from barangai.models import Usage

    monkeypatch.setenv("TRUSTED_PROXY_HOPS", "1")
    join(client, "a@example.test", "10.9.8.7")
    with session_for_url() as db:
        keys = [item.key for item in db.query(Usage).all()]
    assert any(key.startswith("signups_ip:") for key in keys) and not any("10.9.8.7" in key for key in keys)


@pytest.mark.parametrize(
    "password",
    [
        "password1234",
        "Password@2026!",
        "qwertyuiop123",
        "123456789012",
        "abcdefghijklmnop",
        "passwordpassword",
        "barangay12345",
        "mahalkita2026!",
        "aaaaaaaaaaaaaa",
        "ana.rivera-is-here",
    ],
)
def test_easy_passwords_are_refused_at_sign_up(client, password):
    answer = client.post(
        "/auth/register",
        json={"email": "ana.rivera@example.test", "password": password, "accepted_terms": True},
    )
    assert answer.status_code == 422 and isinstance(answer.json()["detail"], str)


def test_ordinary_passwords_pass_and_very_short_email_names_dont_block_words(client):
    from barangai.auth import password_problem

    assert password_problem("correct horse battery staple", "ana@example.test") is None
    assert password_problem("banana split sundae", "ana@example.test") is None
    assert password_problem("password manager generated 7Q", "ana@example.test") is None
    assert password_problem("482915730264", "ana@example.test") is None


def test_a_changed_password_meets_the_same_rules(client):
    register(client, "ana@example.test")
    answer = client.post(
        "/auth/password",
        json={"current_password": PASSWORD, "new_password": "password12345"},
        headers=headers(client),
    )
    assert answer.status_code == 422
    # A wrong current password still says only that.
    answer = client.post(
        "/auth/password",
        json={"current_password": "not the password", "new_password": "password12345"},
        headers=headers(client),
    )
    assert answer.status_code == 403


def test_the_command_line_reset_meets_the_same_rules(client):
    from barangai.bootstrap_staff import create_staff, reset_password

    register(client, "ana@example.test")
    with pytest.raises(ValueError, match="common"):
        reset_password("ana@example.test", "password12345")
    with pytest.raises(ValueError, match="common"):
        create_staff("desk@example.test", "password12345", "staff")


def fail(client, email):
    return client.post("/auth/login", json={"email": email, "password": "not the password"})


def test_slow_guessing_locks_the_email_until_the_next_manila_day(client, monkeypatch):
    from barangai import usage

    monkeypatch.setenv("MAX_LOGIN_FAILURES_PER_DAY", "3")
    register(client, "ana@example.test")
    client.cookies.clear()
    assert [fail(client, "ana@example.test").status_code for _ in range(3)] == [401, 401, 401]
    locked = client.post("/auth/login", json={"email": "ana@example.test", "password": PASSWORD})
    assert locked.status_code == 429 and "tomorrow" in locked.json()["detail"]
    # Sessions already signed in aren't touched, and another account isn't either.
    register(client, "ben@example.test")
    assert client.get("/auth/me").status_code == 200

    real_now = usage.now
    monkeypatch.setattr(usage, "now", lambda: real_now() + timedelta(days=1))
    client.cookies.clear()
    assert client.post("/auth/login", json={"email": "ana@example.test", "password": PASSWORD}).status_code == 200


def test_the_lockout_says_nothing_about_whether_an_email_exists(client, monkeypatch):
    monkeypatch.setenv("MAX_LOGIN_FAILURES_PER_DAY", "2")
    register(client, "ana@example.test")
    client.cookies.clear()
    answers = {}
    for email in ("ana@example.test", "nobody@example.test"):
        for _ in range(2):
            fail(client, email)
        answers[email] = fail(client, email)
    assert answers["ana@example.test"].status_code == answers["nobody@example.test"].status_code == 429
    assert answers["ana@example.test"].json() == answers["nobody@example.test"].json()


def test_the_failure_count_holds_no_email_and_a_reset_clears_it(client, monkeypatch):
    from barangai.bootstrap_staff import reset_password
    from barangai.db import session_for_url
    from barangai.models import Usage

    monkeypatch.setenv("MAX_LOGIN_FAILURES_PER_DAY", "1")
    register(client, "ana@example.test")
    client.cookies.clear()
    fail(client, "ana@example.test")
    with session_for_url() as db:
        keys = [item.key for item in db.query(Usage).all()]
    assert any(key.startswith("login_fail:") for key in keys) and not any("ana" in key for key in keys)
    assert client.post("/auth/login", json={"email": "ana@example.test", "password": PASSWORD}).status_code == 429
    reset_password("ana@example.test", "a new synthetic phrase")
    login(client, "ana@example.test", "a new synthetic phrase")


def test_an_administrator_reset_clears_the_lockout(client, monkeypatch):
    monkeypatch.setenv("MAX_LOGIN_FAILURES_PER_DAY", "1")
    account("desk@example.test", "staff")
    account("boss@example.test", "administrator")
    fail(client, "desk@example.test")
    assert (
        client.post("/auth/login", json={"email": "desk@example.test", "password": "account-password-123"}).status_code
        == 429
    )
    login(client, "boss@example.test", "account-password-123")
    staff = next(item for item in client.get("/admin/staff").json() if item["email"] == "desk@example.test")
    password = client.post(f"/admin/staff/{staff['id']}/reset-password", headers=headers(client)).json()
    client.cookies.clear()
    login(client, "desk@example.test", password["temporary_password"])


def test_deleting_an_account_clears_its_failure_count(client, monkeypatch):
    register(client, "ana@example.test")
    token = dict(client.cookies)
    client.cookies.clear()
    fail(client, "ana@example.test")
    assert usage("login_fail:") == 2  # Per email, and per email and address.
    client.cookies.update(token)
    answer = client.post(
        "/auth/delete-account", json={"email": "ana@example.test", "password": PASSWORD}, headers=headers(client)
    )
    assert answer.status_code == 204
    assert usage("login_fail:") == 0


def test_a_stranger_guessing_cannot_lock_the_owner_out(client, monkeypatch):
    monkeypatch.setenv("TRUSTED_PROXY_HOPS", "1")
    monkeypatch.setenv("MAX_LOGIN_FAILURES_PER_DAY", "3")
    register(client, "ana@example.test")
    client.cookies.clear()

    def attempt(password, address):
        return client.post(
            "/auth/login", json={"email": "ana@example.test", "password": password}, headers=from_address(address)
        ).status_code

    assert [attempt("not the password", "10.0.0.66") for _ in range(4)] == [401, 401, 401, 429]
    assert attempt(PASSWORD, "10.0.0.66") == 429  # That device stays locked out, even with the right password.
    assert attempt(PASSWORD, "10.0.0.7") == 200


def test_guessing_from_many_addresses_still_hits_the_cap_per_email(client, monkeypatch):
    monkeypatch.setenv("TRUSTED_PROXY_HOPS", "1")
    monkeypatch.setenv("MAX_LOGIN_FAILURES_PER_EMAIL_PER_DAY", "3")
    register(client, "ana@example.test")
    client.cookies.clear()

    def attempt(password, address):
        return client.post(
            "/auth/login", json={"email": "ana@example.test", "password": password}, headers=from_address(address)
        ).status_code

    assert [attempt("not the password", f"10.0.1.{index}") for index in range(3)] == [401, 401, 401]
    assert attempt(PASSWORD, "10.0.2.1") == 429


def test_callers_that_cant_be_told_apart_share_only_the_cap_per_email(client, monkeypatch):
    """Behind a proxy with no hop count set, an address cap would really be one shared count."""
    monkeypatch.setenv("MAX_LOGIN_FAILURES_PER_DAY", "1")
    register(client, "ana@example.test")
    client.cookies.clear()
    behind = {"X-Forwarded-For": "10.0.0.66"}
    for _ in range(2):
        client.post("/auth/login", json={"email": "ana@example.test", "password": "wrong one"}, headers=behind)
    answer = client.post("/auth/login", json={"email": "ana@example.test", "password": PASSWORD}, headers=behind)
    assert answer.status_code == 200
