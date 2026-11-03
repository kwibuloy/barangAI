"""Initial workflow tables.

Revision ID: 0001
Revises:
"""

from alembic import op
import sqlalchemy as sa

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("users", sa.Column("id", sa.String(36), primary_key=True),
                    sa.Column("email", sa.String(320), nullable=False, unique=True),
                    sa.Column("password_hash", sa.Text(), nullable=False), sa.Column("role", sa.String(20), nullable=False))
    op.create_table("sessions", sa.Column("token_hash", sa.String(64), primary_key=True),
                    sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
                    sa.Column("csrf_token", sa.String(64), nullable=False),
                    sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False))
    op.create_table("reports", sa.Column("id", sa.String(36), primary_key=True),
                    sa.Column("resident_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
                    sa.Column("description", sa.Text()), sa.Column("latitude", sa.Float(), nullable=False),
                    sa.Column("longitude", sa.Float(), nullable=False),
                    sa.Column("resident_category", sa.String(40), nullable=False),
                    sa.Column("model_category", sa.String(40)), sa.Column("verified_category", sa.String(40)),
                    sa.Column("status", sa.String(30), nullable=False), sa.Column("image_path", sa.Text(), nullable=False),
                    sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
                    sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False))
    op.create_table("report_events", sa.Column("id", sa.String(36), primary_key=True),
                    sa.Column("report_id", sa.String(36), sa.ForeignKey("reports.id"), nullable=False),
                    sa.Column("from_status", sa.String(30)), sa.Column("to_status", sa.String(30), nullable=False),
                    sa.Column("actor_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
                    sa.Column("note", sa.Text()), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False))
    op.create_table("staff_actions", sa.Column("id", sa.String(36), primary_key=True),
                    sa.Column("report_id", sa.String(36), sa.ForeignKey("reports.id"), nullable=False),
                    sa.Column("actor_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
                    sa.Column("kind", sa.String(20), nullable=False), sa.Column("note", sa.Text(), nullable=False),
                    sa.Column("created_at", sa.DateTime(timezone=True), nullable=False))


def downgrade():
    op.drop_table("staff_actions")
    op.drop_table("report_events")
    op.drop_table("reports")
    op.drop_table("sessions")
    op.drop_table("users")
