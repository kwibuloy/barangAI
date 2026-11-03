"""Grouped cases: related reports from different residents, confirmed by staff.

Already accepted reports each become a one-report case, so they appear on the residents' map.
Downgrading deletes all grouping decisions (the reports themselves are kept).

Revision ID: 0007
Revises: 0006
"""

from uuid import uuid4

import sqlalchemy as sa
from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("cases", sa.Column("id", sa.String(36), primary_key=True),
                    sa.Column("category", sa.String(40), nullable=False),
                    sa.Column("latitude", sa.Float(), nullable=False),
                    sa.Column("longitude", sa.Float(), nullable=False),
                    sa.Column("location_label", sa.String(200)),
                    sa.Column("created_by", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
                    sa.Column("created_at", sa.DateTime(timezone=True), nullable=False))
    with op.batch_alter_table("reports") as batch:
        batch.add_column(sa.Column("case_id", sa.String(36), nullable=True))
        batch.add_column(sa.Column("case_confirmed", sa.Boolean(), nullable=False, server_default=sa.false()))
        batch.create_foreign_key("fk_reports_case_id", "cases", ["case_id"], ["id"])
        batch.create_index("ix_reports_case_id", ["case_id"])
    backfill()
    if op.get_context().dialect.name == "postgresql":
        # Server-only access, like every other table (0004): no client policies.
        op.execute('ALTER TABLE public."cases" ENABLE ROW LEVEL SECURITY')


def backfill():
    if op.get_context().as_sql:
        return  # Offline SQL scripts have no rows to read; a live upgrade fills these in.
    bind = op.get_bind()
    accepted = bind.execute(sa.text(
        "SELECT id, verified_category, resident_category, latitude, longitude, location_label, updated_at FROM reports "
        "WHERE status IN ('Accepted', 'In Progress', 'Resolved') AND case_id IS NULL")).all()
    for report in accepted:
        # The staff member who accepted it opened the case.
        actor = bind.execute(sa.text(
            "SELECT actor_id FROM report_events WHERE report_id = :id AND to_status = 'Accepted' "
            "ORDER BY created_at DESC LIMIT 1"), {"id": report.id}).scalar()
        if actor is None:
            continue
        case_id = str(uuid4())
        bind.execute(sa.text(
            "INSERT INTO cases (id, category, latitude, longitude, location_label, created_by, created_at) "
            "VALUES (:id, :category, :latitude, :longitude, :label, :actor, :created_at)"),
            {"id": case_id, "category": report.verified_category or report.resident_category,
             "latitude": report.latitude, "longitude": report.longitude, "label": report.location_label,
             "actor": actor, "created_at": report.updated_at})
        bind.execute(sa.text("UPDATE reports SET case_id = :case_id, case_confirmed = :yes WHERE id = :id"),
                     {"case_id": case_id, "yes": True, "id": report.id})


def downgrade():
    with op.batch_alter_table("reports") as batch:
        batch.drop_index("ix_reports_case_id")
        batch.drop_constraint("fk_reports_case_id", type_="foreignkey")
        batch.drop_column("case_confirmed")
        batch.drop_column("case_id")
    op.drop_table("cases")
