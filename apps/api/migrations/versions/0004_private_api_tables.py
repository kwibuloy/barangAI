"""Deny direct client Data API access to application tables on PostgreSQL.

Revision ID: 0004
Revises: 0003
"""

from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None

TABLES = (
    "users", "sessions", "reports", "report_events", "staff_actions",
    "duplicate_suggestions", "notifications", "alembic_version",
)


def upgrade():
    if op.get_context().dialect.name != "postgresql":
        return
    # No policies: anon/authenticated cannot read or write rows. The server's
    # table-owner connection keeps access and applies the existing API RBAC.
    for table in TABLES:
        op.execute(f'ALTER TABLE public."{table}" ENABLE ROW LEVEL SECURITY')


def downgrade():
    if op.get_context().dialect.name != "postgresql":
        return
    for table in TABLES:
        op.execute(f'ALTER TABLE public."{table}" DISABLE ROW LEVEL SECURITY')
