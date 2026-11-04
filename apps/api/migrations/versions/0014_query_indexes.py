"""Indexes for the foreign keys every report list, detail page and sign-out reads by.

Revision ID: 0014
Revises: 0013
"""

from alembic import op

revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None

INDEXES = (
    ("reports", "resident_id"),
    ("report_events", "report_id"),
    ("staff_actions", "report_id"),
    ("notifications", "report_id"),
    ("duplicate_suggestions", "candidate_report_id"),
    ("sessions", "user_id"),
)


def upgrade():
    for table, column in INDEXES:
        op.create_index(f"ix_{table}_{column}", table, [column])


def downgrade():
    for table, column in INDEXES:
        op.drop_index(f"ix_{table}_{column}", table_name=table)
