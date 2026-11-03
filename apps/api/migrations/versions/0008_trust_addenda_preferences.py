"""Report trust checks, residents' added details, staff notifications and saved preferences.

Adds reports.location_source and reports.trust_flags (staff-only checks of the photo against the pin and date),
the append-only report_addenda table, notifications.kind (existing rows are resident status updates) and
users.preferences. Downgrading drops the added details and staff notifications; reports and status updates stay.

Revision ID: 0008
Revises: 0007
"""

import sqlalchemy as sa
from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("reports") as batch:
        batch.add_column(sa.Column("location_source", sa.String(10), nullable=True))
        batch.add_column(sa.Column("trust_flags", sa.JSON(), nullable=True))
    with op.batch_alter_table("users") as batch:
        batch.add_column(sa.Column("preferences", sa.JSON(), nullable=True))
    with op.batch_alter_table("notifications") as batch:
        batch.add_column(sa.Column("kind", sa.String(20), nullable=False, server_default="status"))
    op.create_table("report_addenda", sa.Column("id", sa.String(36), primary_key=True),
                    sa.Column("report_id", sa.String(36), sa.ForeignKey("reports.id"), nullable=False),
                    sa.Column("author_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
                    sa.Column("note", sa.Text(), nullable=False),
                    sa.Column("image_path", sa.Text(), nullable=True),
                    sa.Column("created_at", sa.DateTime(timezone=True), nullable=False))
    op.create_index("ix_report_addenda_report_id", "report_addenda", ["report_id"])
    if op.get_context().dialect.name == "postgresql":
        # Server-only access, like every other table (0004): no client policies.
        op.execute('ALTER TABLE public."report_addenda" ENABLE ROW LEVEL SECURITY')


def downgrade():
    if not op.get_context().as_sql:
        photos = op.get_bind().execute(sa.text("SELECT COUNT(*) FROM report_addenda WHERE image_path IS NOT NULL"))
        if photos.scalar():
            # Dropping the table would orphan private photos the deletion command could no longer find.
            raise RuntimeError("Delete the reports with added photos (barangai.delete_report) before downgrading")
    op.drop_index("ix_report_addenda_report_id", table_name="report_addenda")
    op.drop_table("report_addenda")
    # Staff notifications have no meaning without the kind column; residents' status updates are kept.
    op.execute("DELETE FROM notifications WHERE kind <> 'status'")
    with op.batch_alter_table("notifications") as batch:
        batch.drop_column("kind")
    with op.batch_alter_table("users") as batch:
        batch.drop_column("preferences")
    with op.batch_alter_table("reports") as batch:
        batch.drop_column("trust_flags")
        batch.drop_column("location_source")
