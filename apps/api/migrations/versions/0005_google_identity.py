"""Resident Google account identities.

Revision ID: 0005
Revises: 0004
"""

from alembic import op
import sqlalchemy as sa

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("oauth_identities",
                    sa.Column("id", sa.String(36), primary_key=True),
                    sa.Column("provider", sa.String(20), nullable=False),
                    sa.Column("subject", sa.String(255), nullable=False),
                    sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
                    sa.UniqueConstraint("provider", "subject"))
    if op.get_context().dialect.name == "postgresql":
        op.execute('ALTER TABLE public."oauth_identities" ENABLE ROW LEVEL SECURITY')


def downgrade():
    op.drop_table("oauth_identities")
