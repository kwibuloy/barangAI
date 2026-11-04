"""Temporary passwords that must be changed, and the feedback table.

Revision ID: 0015
Revises: 0014
"""

import sqlalchemy as sa
from alembic import op

revision = "0015"
down_revision = "0014"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("users") as batch:
        batch.add_column(sa.Column("must_change_password", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.create_table(
        "feedback",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_feedback_user_id", "feedback", ["user_id"])
    if op.get_context().dialect.name == "postgresql":
        op.execute('ALTER TABLE public."feedback" ENABLE ROW LEVEL SECURITY')


def downgrade():
    op.drop_index("ix_feedback_user_id", table_name="feedback")
    op.drop_table("feedback")
    with op.batch_alter_table("users") as batch:
        batch.drop_column("must_change_password")
