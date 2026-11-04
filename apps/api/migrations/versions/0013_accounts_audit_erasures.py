"""Disabled accounts, points owed, the photo-view and reward-change logs, and the erasure ledger.

Revision ID: 0013
Revises: 0012
"""

import sqlalchemy as sa
from alembic import op

revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("users") as batch:
        batch.add_column(sa.Column("disabled_at", sa.DateTime(timezone=True), nullable=True))
        batch.add_column(sa.Column("points_owed", sa.Integer(), nullable=False, server_default="0"))
    op.create_table(
        "report_photo_views",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("report_id", sa.String(36), sa.ForeignKey("reports.id"), nullable=False),
        sa.Column("actor_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_report_photo_views_report_id", "report_photo_views", ["report_id"])
    op.create_table(
        "reward_changes",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("reward_id", sa.String(36), sa.ForeignKey("rewards.id"), nullable=False),
        sa.Column("actor_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("action", sa.String(20), nullable=False),
        sa.Column("changes", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_reward_changes_reward_id", "reward_changes", ["reward_id"])
    op.create_table(
        "erasures",
        sa.Column("kind", sa.String(10), primary_key=True),
        sa.Column("subject_id", sa.String(36), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    if op.get_context().dialect.name == "postgresql":
        # Server-only access, like every other table (0004): no client policies.
        for table in ("report_photo_views", "reward_changes", "erasures"):
            op.execute(f'ALTER TABLE public."{table}" ENABLE ROW LEVEL SECURITY')


def downgrade():
    op.drop_table("erasures")
    op.drop_index("ix_reward_changes_reward_id", table_name="reward_changes")
    op.drop_table("reward_changes")
    op.drop_index("ix_report_photo_views_report_id", table_name="report_photo_views")
    op.drop_table("report_photo_views")
    with op.batch_alter_table("users") as batch:
        batch.drop_column("points_owed")
        batch.drop_column("disabled_at")
