from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint, false, true
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base

# Report categories (AGENTS.md): residents, staff and both AI models choose from the same eight.
CATEGORIES = (
    "flooding",
    "potholes",
    "fallen_trees",
    "uncollected_garbage",
    "damaged_signage",
    "broken_streetlights",
    "exposed_wiring",
    "other",
)


def now():
    return datetime.now(UTC)


def utc_iso(value: datetime):
    # SQLite drops timezone data on read; stored naive values still represent UTC.
    return value.replace(tzinfo=UTC).isoformat() if value.tzinfo is None else value.astimezone(UTC).isoformat()


def uid():
    return str(uuid4())


class Barangay(Base):
    """A jurisdiction: staff belong to one, and reports are placed in one by their pin (barangays.py)."""
    __tablename__ = "barangays"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    name: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    # GeoJSON Polygon or MultiPolygon, checked before it is saved.
    boundary: Mapped[dict] = mapped_column(JSON, nullable=False, deferred=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, nullable=False)


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    email: Mapped[str] = mapped_column(String(320), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False, default="resident")
    # Appearance and language, so they follow the account to another device. Only known keys are stored.
    preferences: Mapped[dict | None] = mapped_column(JSON)
    # Staff only: the barangay whose reports they handle.
    barangay_id: Mapped[str | None] = mapped_column(ForeignKey("barangays.id", name="fk_users_barangay_id"))
    barangay: Mapped[Barangay | None] = relationship()
    # When this account agreed to the terms and privacy notice, and which version. Empty for older accounts.
    terms_accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    terms_version: Mapped[str | None] = mapped_column(String(20))
    identities: Mapped[list["OAuthIdentity"]] = relationship(viewonly=True)


class LoginSession(Base):
    __tablename__ = "sessions"
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    csrf_token: Mapped[str] = mapped_column(String(64), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    user: Mapped[User] = relationship()


class OAuthIdentity(Base):
    __tablename__ = "oauth_identities"
    __table_args__ = (UniqueConstraint("provider", "subject"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    provider: Mapped[str] = mapped_column(String(20), nullable=False)
    subject: Mapped[str] = mapped_column(String(255), nullable=False)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)


class Case(Base):
    """One incident reported by one or more residents. Its status is the shared status of its confirmed reports."""
    __tablename__ = "cases"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    category: Mapped[str] = mapped_column(String(40), nullable=False)
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    location_label: Mapped[str | None] = mapped_column(String(200))
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, nullable=False)


class Report(Base):
    __tablename__ = "reports"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    resident_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    resident_category: Mapped[str] = mapped_column(String(40), nullable=False)
    model_category: Mapped[str | None] = mapped_column(String(40))
    verified_category: Mapped[str | None] = mapped_column(String(40))
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="Pending")
    image_path: Mapped[str] = mapped_column(Text, nullable=False)
    # Deferred: about 512 numbers per report, needed only when comparing photos.
    image_embedding: Mapped[list[float] | None] = mapped_column(JSON, deferred=True)
    embedding_model_version: Mapped[str | None] = mapped_column(String(100))
    # Street name for the pin, from reverse geocoding; shown to the resident before submitting.
    location_label: Mapped[str | None] = mapped_column(String(200))
    # Safety flags from the vision model's own analysis of the photo, never from the client.
    hazards: Mapped[list[str] | None] = mapped_column(JSON)
    # Grouped case (cases.py). Unconfirmed means a resident said "I see this too" and staff have not checked it.
    case_id: Mapped[str | None] = mapped_column(ForeignKey("cases.id", name="fk_reports_case_id"), index=True)
    case_confirmed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=false())
    # Where the pin came from ("photo", "device" or "manual"), as the resident's form reported it.
    location_source: Mapped[str | None] = mapped_column(String(10))
    # Staff-only checks of the photo against the pin and the date (trust.py). Signals to look closer, never proof.
    trust_flags: Mapped[list[dict] | None] = mapped_column(JSON)
    # Set by the server from the pin. Empty when the pin is outside every barangay: then only administrators see it.
    barangay_id: Mapped[str | None] = mapped_column(ForeignKey("barangays.id", name="fk_reports_barangay_id"), index=True)
    barangay: Mapped[Barangay | None] = relationship()
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, nullable=False)
    events: Mapped[list["ReportEvent"]] = relationship(order_by="ReportEvent.created_at", cascade="all, delete-orphan")
    actions: Mapped[list["StaffAction"]] = relationship(order_by="StaffAction.created_at", cascade="all, delete-orphan")
    addenda: Mapped[list["ReportAddendum"]] = relationship(order_by="ReportAddendum.created_at",
                                                           cascade="all, delete-orphan")


class ReportAddendum(Base):
    """Details a resident added to their own report after sending it. Append-only: the original stays as staff
    first saw it, and every addition is kept with its time."""
    __tablename__ = "report_addenda"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    report_id: Mapped[str] = mapped_column(ForeignKey("reports.id"), index=True, nullable=False)
    author_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    note: Mapped[str] = mapped_column(Text, nullable=False)
    image_path: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, nullable=False)


class ReportEvent(Base):
    __tablename__ = "report_events"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    report_id: Mapped[str] = mapped_column(ForeignKey("reports.id"), nullable=False)
    from_status: Mapped[str | None] = mapped_column(String(30))
    to_status: Mapped[str] = mapped_column(String(30), nullable=False)
    actor_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    note: Mapped[str | None] = mapped_column(Text)
    rejection_reason: Mapped[str | None] = mapped_column(String(30))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, nullable=False)


class StaffAction(Base):
    __tablename__ = "staff_actions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    report_id: Mapped[str] = mapped_column(ForeignKey("reports.id"), nullable=False)
    actor_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    note: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, nullable=False)


class Notification(Base):
    __tablename__ = "notifications"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    report_id: Mapped[str] = mapped_column(ForeignKey("reports.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False)
    # "status" tells a resident their report moved; "new_report" and "addendum" tell staff something arrived.
    kind: Mapped[str] = mapped_column(String(20), nullable=False, default="status", server_default="status")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, nullable=False)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class DuplicateSuggestion(Base):
    __tablename__ = "duplicate_suggestions"
    __table_args__ = (UniqueConstraint("report_id", "candidate_report_id", "model_version"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    report_id: Mapped[str] = mapped_column(ForeignKey("reports.id"), nullable=False)
    candidate_report_id: Mapped[str] = mapped_column(ForeignKey("reports.id"), nullable=False)
    model_version: Mapped[str] = mapped_column(String(100), nullable=False)
    score: Mapped[float] = mapped_column(Float, nullable=False)
    decision: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    actor_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, nullable=False)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Usage(Base):
    """A counter per period (usage.py), kept in the database so a restart or Render's sleep does not reset it."""
    __tablename__ = "daily_usage"
    key: Mapped[str] = mapped_column(String(80), primary_key=True)
    count: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, nullable=False)


class DeletionRequest(Base):
    """A resident asking barangay staff to delete a report. Outlives the report as the record of the decision, so
    report_id is not a foreign key, and an approved request keeps no reason or other content."""
    __tablename__ = "deletion_requests"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    report_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    requester_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    reason: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    decided_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, nullable=False)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Reward(Base):
    """Something in one barangay's shop, offered by the barangay or a partner. No stock means unlimited."""

    __tablename__ = "rewards"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    barangay_id: Mapped[str] = mapped_column(ForeignKey("barangays.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    partner: Mapped[str | None] = mapped_column(String(120))
    points_cost: Mapped[int] = mapped_column(Integer, nullable=False)
    stock: Mapped[int | None] = mapped_column(Integer)
    active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=true(), nullable=False)
    created_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, nullable=False)


class Voucher(Base):
    """A single-use code for one reward: active, then used or expired."""

    __tablename__ = "vouchers"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    code: Mapped[str] = mapped_column(String(16), unique=True, nullable=False)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    reward_id: Mapped[str] = mapped_column(ForeignKey("rewards.id"), nullable=False)
    barangay_id: Mapped[str] = mapped_column(ForeignKey("barangays.id"), nullable=False)
    points_cost: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="active", server_default="active", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    used_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"))


class PointEntry(Base):
    """Append-only ledger; a balance is the sum. report_id has no foreign key, so entries outlive a deleted report."""

    __tablename__ = "point_entries"
    __table_args__ = (UniqueConstraint("user_id", "report_id", "kind", name="uq_point_entries_once"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    amount: Mapped[int] = mapped_column(Integer, nullable=False)
    report_id: Mapped[str | None] = mapped_column(String(36), index=True)
    voucher_id: Mapped[str | None] = mapped_column(String(36))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, nullable=False)

