"""Why staff rejected a report, on the Rejected status event.

Revision ID: 0011
Revises: 0010
"""

import sqlalchemy as sa
from alembic import op

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("report_events") as batch:
        batch.add_column(sa.Column("rejection_reason", sa.String(30)))


def downgrade():
    with op.batch_alter_table("report_events") as batch:
        batch.drop_column("rejection_reason")
