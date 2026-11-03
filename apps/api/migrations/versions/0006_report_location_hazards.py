"""Report street label and AI hazard flags.

Revision ID: 0006
Revises: 0005
"""

from alembic import op
import sqlalchemy as sa

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("reports") as batch:
        batch.add_column(sa.Column("location_label", sa.String(200), nullable=True))
        batch.add_column(sa.Column("hazards", sa.JSON(), nullable=True))


def downgrade():
    with op.batch_alter_table("reports") as batch:
        batch.drop_column("hazards")
        batch.drop_column("location_label")
