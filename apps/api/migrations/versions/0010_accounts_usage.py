"""Terms acceptance, database-counted limits, deletion requests and staff-only automatic logs.

Adds users.terms_accepted_at and users.terms_version (empty for older accounts), plus the daily_usage and
deletion_requests tables. Marks existing automatic grouping logs as kind "system", so residents stop seeing them, and
removes cases left with no report by earlier deletions, which still held the deleted report's location.

Revision ID: 0010
Revises: 0009
"""

import sqlalchemy as sa
from alembic import op

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None

AUTOMATIC = ("Grouped with report #%", "Confirmed as the same incident as %", "Not the same incident as %")


def upgrade():
    if op.get_context().dialect.name == "postgresql":
        # Fail rather than stall the running site; Render keeps the old instance when a deploy fails to start.
        op.execute("SET LOCAL lock_timeout = '10s'")
    with op.batch_alter_table("users") as batch:
        batch.add_column(sa.Column("terms_accepted_at", sa.DateTime(timezone=True), nullable=True))
        batch.add_column(sa.Column("terms_version", sa.String(20), nullable=True))
    op.create_table(
        "daily_usage",
        sa.Column("key", sa.String(80), primary_key=True),
        sa.Column("count", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "deletion_requests",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("report_id", sa.String(36), nullable=False),
        sa.Column("requester_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("decided_by", sa.String(36), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_deletion_requests_report_id", "deletion_requests", ["report_id"])
    for pattern in AUTOMATIC:
        op.execute(
            f"UPDATE staff_actions SET kind = 'system' WHERE kind = 'action' AND note LIKE '{pattern}'"
        )
    op.execute("DELETE FROM cases WHERE id NOT IN (SELECT case_id FROM reports WHERE case_id IS NOT NULL)")
    # A case still on a deleted report's pin moves to its earliest confirmed report. One statement, so all three
    # values are read from the same report and the check is not affected by the update.
    earliest = "(SELECT r.{} FROM reports r WHERE r.case_id = cases.id AND r.case_confirmed ORDER BY r.created_at LIMIT 1)"
    op.execute(
        f"UPDATE cases SET latitude = {earliest.format('latitude')}, longitude = {earliest.format('longitude')}, "
        f"location_label = {earliest.format('location_label')} "
        "WHERE NOT EXISTS (SELECT 1 FROM reports r WHERE r.case_id = cases.id AND r.latitude = cases.latitude "
        "AND r.longitude = cases.longitude) "
        "AND EXISTS (SELECT 1 FROM reports r WHERE r.case_id = cases.id AND r.case_confirmed)"
    )
    if op.get_context().dialect.name == "postgresql":
        # Server-only access, like every other table (0004): no client policies.
        op.execute('ALTER TABLE public."daily_usage" ENABLE ROW LEVEL SECURITY')
        op.execute('ALTER TABLE public."deletion_requests" ENABLE ROW LEVEL SECURITY')


def downgrade():
    op.execute("UPDATE staff_actions SET kind = 'action' WHERE kind = 'system'")
    op.drop_index("ix_deletion_requests_report_id", table_name="deletion_requests")
    op.drop_table("deletion_requests")
    op.drop_table("daily_usage")
    with op.batch_alter_table("users") as batch:
        batch.drop_column("terms_version")
        batch.drop_column("terms_accepted_at")
