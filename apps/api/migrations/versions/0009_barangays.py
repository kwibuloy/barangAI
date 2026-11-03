"""Barangays and staff jurisdiction.

Adds the barangays table (name and GeoJSON boundary), plus users.barangay_id and reports.barangay_id. Both start
empty: nothing is enforced until a barangay is loaded (barangai/barangays.py). Downgrading drops the barangays and
their assignments; users and reports stay.

Revision ID: 0009
Revises: 0008
"""

import sqlalchemy as sa
from alembic import op

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "barangays",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(120), nullable=False, unique=True),
        sa.Column("boundary", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    with op.batch_alter_table("users") as batch:
        batch.add_column(sa.Column("barangay_id", sa.String(36), nullable=True))
        batch.create_foreign_key("fk_users_barangay_id", "barangays", ["barangay_id"], ["id"])
    with op.batch_alter_table("reports") as batch:
        batch.add_column(sa.Column("barangay_id", sa.String(36), nullable=True))
        batch.create_foreign_key("fk_reports_barangay_id", "barangays", ["barangay_id"], ["id"])
        batch.create_index("ix_reports_barangay_id", ["barangay_id"])
    if op.get_context().dialect.name == "postgresql":
        # Server-only access, like every other table (0004): no client policies.
        op.execute('ALTER TABLE public."barangays" ENABLE ROW LEVEL SECURITY')


def downgrade():
    with op.batch_alter_table("reports") as batch:
        batch.drop_index("ix_reports_barangay_id")
        batch.drop_constraint("fk_reports_barangay_id", type_="foreignkey")
        batch.drop_column("barangay_id")
    with op.batch_alter_table("users") as batch:
        batch.drop_constraint("fk_users_barangay_id", type_="foreignkey")
        batch.drop_column("barangay_id")
    op.drop_table("barangays")
