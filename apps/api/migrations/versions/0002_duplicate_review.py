"""Validated embedding suggestion review.

Revision ID: 0002
Revises: 0001
"""

from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("reports", sa.Column("image_embedding", sa.JSON()))
    op.add_column("reports", sa.Column("embedding_model_version", sa.String(100)))
    op.create_table("duplicate_suggestions", sa.Column("id", sa.String(36), primary_key=True),
                    sa.Column("report_id", sa.String(36), sa.ForeignKey("reports.id"), nullable=False),
                    sa.Column("candidate_report_id", sa.String(36), sa.ForeignKey("reports.id"), nullable=False),
                    sa.Column("model_version", sa.String(100), nullable=False),
                    sa.Column("score", sa.Float(), nullable=False),
                    sa.Column("decision", sa.String(20), nullable=False),
                    sa.Column("actor_id", sa.String(36), sa.ForeignKey("users.id")),
                    sa.Column("note", sa.Text()), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
                    sa.Column("decided_at", sa.DateTime(timezone=True)),
                    sa.UniqueConstraint("report_id", "candidate_report_id", "model_version"))


def downgrade():
    op.drop_table("duplicate_suggestions")
    op.drop_column("reports", "embedding_model_version")
    op.drop_column("reports", "image_embedding")
