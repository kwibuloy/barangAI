"""Resident status notifications.

Revision ID: 0003
Revises: 0002
"""

from alembic import op
import sqlalchemy as sa

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("notifications", sa.Column("id", sa.String(36), primary_key=True),
                    sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
                    sa.Column("report_id", sa.String(36), sa.ForeignKey("reports.id"), nullable=False),
                    sa.Column("status", sa.String(30), nullable=False),
                    sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
                    sa.Column("read_at", sa.DateTime(timezone=True)))
    op.create_index("ix_notifications_user_id", "notifications", ["user_id"])


def downgrade():
    op.drop_index("ix_notifications_user_id", table_name="notifications")
    op.drop_table("notifications")
