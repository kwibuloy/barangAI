"""Points for valid reports, each barangay's rewards shop, and single-use codes.

Revision ID: 0012
Revises: 0011
"""

import sqlalchemy as sa
from alembic import op

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "rewards",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("barangay_id", sa.String(36), sa.ForeignKey("barangays.id"), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("partner", sa.String(120)),
        sa.Column("points_cost", sa.Integer(), nullable=False),
        sa.Column("stock", sa.Integer()),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_by", sa.String(36), sa.ForeignKey("users.id")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_rewards_barangay_id", "rewards", ["barangay_id"])
    op.create_table(
        "vouchers",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("code", sa.String(16), nullable=False, unique=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("reward_id", sa.String(36), sa.ForeignKey("rewards.id"), nullable=False),
        sa.Column("barangay_id", sa.String(36), sa.ForeignKey("barangays.id"), nullable=False),
        sa.Column("points_cost", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True)),
        sa.Column("used_by", sa.String(36), sa.ForeignKey("users.id")),
    )
    op.create_index("ix_vouchers_user_id", "vouchers", ["user_id"])
    op.create_table(
        "point_entries",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("amount", sa.Integer(), nullable=False),
        sa.Column("report_id", sa.String(36)),
        sa.Column("voucher_id", sa.String(36)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("user_id", "report_id", "kind", name="uq_point_entries_once"),
    )
    op.create_index("ix_point_entries_user_id", "point_entries", ["user_id"])
    op.create_index("ix_point_entries_report_id", "point_entries", ["report_id"])
    if op.get_context().dialect.name == "postgresql":
        # Server-only access, like every other table (0004): no client policies.
        for table in ("rewards", "vouchers", "point_entries"):
            op.execute(f'ALTER TABLE public."{table}" ENABLE ROW LEVEL SECURITY')


def downgrade():
    op.drop_index("ix_point_entries_report_id", table_name="point_entries")
    op.drop_index("ix_point_entries_user_id", table_name="point_entries")
    op.drop_table("point_entries")
    op.drop_index("ix_vouchers_user_id", table_name="vouchers")
    op.drop_table("vouchers")
    op.drop_index("ix_rewards_barangay_id", table_name="rewards")
    op.drop_table("rewards")
