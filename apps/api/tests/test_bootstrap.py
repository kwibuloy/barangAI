from barangai.auth import hasher
from barangai.db import session_for_url
from barangai.models import User


def test_staff_bootstrap_is_out_of_band(client):
    from barangai.bootstrap_staff import create_staff

    create_staff("staff@example.test", "staff-password-123", "staff")
    with session_for_url() as db:
        user = db.query(User).filter_by(email="staff@example.test").one()
        assert user.role == "staff"
        assert hasher.verify(user.password_hash, "staff-password-123")
    assert client.post("/auth/login", json={"email": "staff@example.test", "password": "staff-password-123"}).status_code == 200
