"""Verify migrations and private photo uploads in a disposable local PostgreSQL container.

Uses only synthetic data. Requires Docker, the API environment and its test extras.
Never connects to DATABASE_URL inherited from the operator's environment.
"""

import io
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys
import tempfile
import time

import psycopg2
from psycopg2 import sql

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "artifacts/database-verification-2026-10-20"
sys.path.insert(0, str(ROOT / "apps/api"))


def docker(*args):
    return subprocess.check_output(["docker", *args], text=True).strip()


def connect(port, password, user="postgres", database="postgres"):
    return psycopg2.connect(host="127.0.0.1", port=port, user=user,
                            password=password, dbname=database, connect_timeout=3)


def wait_ready(port, password):
    for _ in range(60):
        try:
            with connect(port, password):
                return
        except psycopg2.OperationalError:
            time.sleep(.5)
    raise RuntimeError("Disposable PostgreSQL did not become ready")


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    container = "barangai-verify-" + secrets.token_hex(4)
    admin_password = secrets.token_urlsafe(32)
    owner_password = secrets.token_urlsafe(32)
    process_env = dict(os.environ, POSTGRES_PASSWORD=admin_password)
    started = False
    proof = {"status": "failed", "environment": "disposable local PostgreSQL 16; local private image storage",
             "synthetic_data_only": True, "supabase_verified": False,
             "physical_phone_verified": False, "checks": {}}
    try:
        subprocess.run(["docker", "run", "--detach", "--rm", "--name", container,
                        "--publish", "127.0.0.1::5432", "--env", "POSTGRES_PASSWORD", "postgres:16"],
                       env=process_env, check=True, stdout=subprocess.DEVNULL)
        started = True
        port = int(docker("port", container, "5432/tcp").rsplit(":", 1)[1])
        wait_ready(port, admin_password)
        admin = connect(port, admin_password)
        admin.autocommit = True
        with admin.cursor() as cur:
            cur.execute(sql.SQL("CREATE ROLE barangai_owner LOGIN PASSWORD {} NOSUPERUSER NOCREATEDB NOCREATEROLE").format(sql.Literal(owner_password)))
            cur.execute("CREATE DATABASE barangai_verify OWNER barangai_owner")
            cur.execute("CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN")
        admin.close()
        os.environ.update(DATABASE_URL=f"postgresql://barangai_owner:{owner_password}@127.0.0.1:{port}/barangai_verify",
                          MEDIA_STORAGE="local", COOKIE_SECURE="false")
        for key in ("MODEL_CHECKPOINT", "MODEL_APPROVED_SHA256", "MODEL_CONFIDENCE_THRESHOLD",
                    "STATIC_SITE_DIR", "API_ROOT_PATH", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET",
                    "CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_WORKERS_AI_TOKEN"):
            os.environ.pop(key, None)
        from alembic import command
        from alembic.config import Config
        config = Config(str(ROOT / "apps/api/alembic.ini"))
        config.set_main_option("script_location", str(ROOT / "apps/api/migrations"))
        command.upgrade(config, "0003")
        with connect(port, owner_password, "barangai_owner", "barangai_verify") as db:
            with db.cursor() as cur:
                cur.execute("INSERT INTO users (id,email,password_hash,role) VALUES (%s,%s,%s,%s)",
                            ("legacy-synthetic", "legacy@example.test", "not-a-login-hash", "resident"))
        command.upgrade(config, "head")
        command.upgrade(config, "head")
        with connect(port, owner_password, "barangai_owner", "barangai_verify") as db:
            with db.cursor() as cur:
                cur.execute("SELECT email FROM users WHERE id='legacy-synthetic'")
                assert cur.fetchone() == ("legacy@example.test",)
                cur.execute("SELECT version_num FROM alembic_version")
                assert cur.fetchone() == ("0005",)
                cur.execute("SELECT rolname,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user")
                assert cur.fetchone() == ("barangai_owner", False, False)
                cur.execute("SELECT c.relname,c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r'")
                tables = dict(cur.fetchall())
                assert len(tables) == 9 and all(tables.values())
                cur.execute("SELECT count(*) FROM pg_policies WHERE schemaname='public'")
                assert cur.fetchone() == (0,)
        proof["checks"]["migrations"] = {"fresh_to_0003_then_head": True, "legacy_row_preserved": True,
                                          "head_repeat_safe": True, "revision": "0005", "rls_tables": tables,
                                          "server_is_non_superuser_table_owner": True}
        with connect(port, admin_password, database="barangai_verify") as db:
            with db.cursor() as cur:
                cur.execute("GRANT USAGE ON SCHEMA public TO anon, authenticated")
                cur.execute("GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated")
        for role in ("anon", "authenticated"):
            with connect(port, admin_password, database="barangai_verify") as db:
                with db.cursor() as cur:
                    cur.execute(sql.SQL("SET ROLE {}").format(sql.Identifier(role)))
                    for table in tables:
                        cur.execute(sql.SQL("SELECT * FROM {}").format(sql.Identifier(table)))
                        assert cur.fetchall() == []
                    cur.execute("UPDATE users SET role='administrator' WHERE id='legacy-synthetic'")
                    assert cur.rowcount == 0
                    cur.execute("DELETE FROM users WHERE id='legacy-synthetic'")
                    assert cur.rowcount == 0
                    try:
                        cur.execute("INSERT INTO users (id,email,password_hash,role) VALUES ('forged','forged@example.test','synthetic','administrator')")
                    except psycopg2.errors.InsufficientPrivilege:
                        db.rollback()
                    else:
                        raise AssertionError("Client role bypassed row security")
            proof["checks"][role] = "All tables invisible; update/delete affect zero rows; insert denied despite table grants"
        from fastapi.testclient import TestClient
        from PIL import Image
        with tempfile.TemporaryDirectory(prefix="barangai-private-") as media:
            os.environ["PRIVATE_MEDIA_DIR"] = media
            from barangai.main import create_app
            password = secrets.token_urlsafe(24)
            report_ids = []
            with TestClient(create_app()) as client:
                assert client.post("/reports").status_code == 401
                assert client.post("/auth/register", json={"email": "upload@example.test", "password": password}).status_code == 201
                headers = {"X-CSRF-Token": client.cookies["csrf_token"]}
                for fmt, mime in (("JPEG", "image/jpeg"), ("PNG", "image/png"), ("WEBP", "image/webp")):
                    buffer = io.BytesIO()
                    exif = Image.Exif(); exif[274] = 6; exif[270] = "synthetic-private-metadata"
                    Image.new("RGB", (32, 64), "red").save(buffer, format=fmt, exif=exif)
                    raw = buffer.getvalue()
                    files = {"image": ("synthetic." + fmt.lower(), raw, mime)}
                    preview = client.post("/reports/predict", files=files, headers=headers)
                    assert preview.status_code == 200 and not preview.json()["prediction_available"]
                    response = client.post("/reports", files=files, headers=headers, data={"latitude": "14.6", "longitude": "121", "resident_category": "fallen_trees", "description": "Synthetic upload verification"})
                    assert response.status_code == 201, response.text
                    report = response.json(); report_ids.append(report["id"])
                    assert report["status"] == "Pending" and report["resident_category"] == "fallen_trees"
                    assert report["model_category"] is None and report["verified_category"] is None
                    image = client.get(f'/reports/{report["id"]}/image')
                    assert image.status_code == 200 and image.headers["cache-control"] == "private, no-store"
                    with Image.open(io.BytesIO(image.content)) as sanitized:
                        assert sanitized.size == (64, 32) and not sanitized.getexif()
                    assert b"synthetic-private-metadata" not in image.content
                invalid = client.post("/reports", files={"image": ("invalid.jpg", b"not an image", "image/jpeg")}, headers=headers,
                                      data={"latitude": "14.6", "longitude": "121", "resident_category": "flooding"})
                assert invalid.status_code == 422
                assert len(client.get("/reports").json()) == 3
                assert len(list(Path(media).glob("*"))) == 3
                assert client.post("/auth/logout", headers=headers).status_code == 204
                assert client.get(f'/reports/{report_ids[0]}/image').status_code == 401
                assert client.post("/auth/register", json={"email": "other-upload@example.test", "password": password}).status_code == 201
                assert client.get(f'/reports/{report_ids[0]}/image').status_code == 404
                assert client.get(f'/reports/{report_ids[0]}').status_code == 404
            docker("restart", container)
            # Docker can allocate a different ephemeral host port after restart.
            port = int(docker("port", container, "5432/tcp").rsplit(":", 1)[1])
            wait_ready(port, admin_password)
            from barangai.db import database_url, engine_for_url
            engine_for_url(database_url()).dispose()
            os.environ["DATABASE_URL"] = f"postgresql://barangai_owner:{owner_password}@127.0.0.1:{port}/barangai_verify"
            with TestClient(create_app()) as client:
                assert client.post("/auth/login", json={"email": "upload@example.test", "password": password}).status_code == 200
                assert len(client.get("/reports").json()) == 3
                assert all(client.get(f'/reports/{rid}/image').status_code == 200 for rid in report_ids)
            proof["checks"]["photo_uploads"] = {"formats": ["JPEG", "PNG", "WebP"], "preview_and_submission": True,
                "orientation_and_metadata": True, "manual_category_without_ai": True, "invalid_upload_no_extra_rows_or_files": True,
                "logout_denied": True, "other_resident_denied": True, "database_restart_preserves_reports_and_image_access": True}
        proof["status"] = "passed"
    finally:
        if started:
            docker("rm", "--force", container)
        proof["container_removed"] = started
        (OUTPUT / "results.json").write_text(json.dumps(proof, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(proof, indent=2))


if __name__ == "__main__":
    main()
