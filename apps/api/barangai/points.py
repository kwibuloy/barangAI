"""Points for valid reports, spent in each barangay's rewards shop for single-use codes.

Staff accepting a report is what makes it valid, so nothing is earned before that and a rejected report earns nothing.
The ledger is append-only: a balance is the sum of its entries. Amounts are starting values, not tested ones, so each
can be set in the environment.
"""

import os
import secrets
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session

from .auth import get_current_user, rate_limit, require_csrf, require_role
from .db import get_db
from .models import Barangay, PointEntry, Report, Reward, User, Voucher, now, utc_iso
from .usage import limit_setting

router = APIRouter()
EARNED = ("accepted", "resolved", "first_reporter")
AWARDS = {
    "accepted": ("POINTS_ACCEPTED", 25),
    "resolved": ("POINTS_RESOLVED", 10),
    "first_reporter": ("POINTS_FIRST", 5),
}
# No 0/O or 1/I/L, so a code can be read out at a counter.
CODE_LETTERS = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"
CODE_LENGTH = 8
MAX_COST = 1_000_000


def balance(db: Session, user_id: str) -> int:
    return db.scalar(select(func.coalesce(func.sum(PointEntry.amount), 0)).where(PointEntry.user_id == user_id))


def has_entry(db: Session, user_id: str, kind: str, report_ids: list[str]) -> bool:
    return bool(
        db.scalar(
            select(PointEntry.id)
            .where(PointEntry.user_id == user_id, PointEntry.kind == kind, PointEntry.report_id.in_(report_ids))
            .limit(1)
        )
    )


def award(db: Session, user_id: str, report_id: str, kind: str) -> None:
    name, default = AWARDS[kind]
    try:
        amount = max(0, int(os.environ.get(name, default)))
    except ValueError:
        amount = default
    db.add(PointEntry(user_id=user_id, report_id=report_id, kind=kind, amount=amount))
    db.flush()


def settle(db: Session, report: Report) -> None:
    """Awards what a report has newly earned. Safe to call on every status change: each award happens once."""
    if report.status not in {"Accepted", "In Progress", "Resolved"} or (report.case_id and not report.case_confirmed):
        return
    user_id = report.resident_id
    group = [report]
    if report.case_id:
        group = list(db.scalars(select(Report).where(Report.case_id == report.case_id, Report.case_confirmed)))
    # One incident pays one resident once, however many reports of it they send.
    theirs = [item.id for item in group if item.resident_id == user_id]
    if not has_entry(db, user_id, "accepted", theirs):
        since = now() - timedelta(days=1)
        earned_today = db.scalar(
            select(func.count())
            .select_from(PointEntry)
            .where(PointEntry.user_id == user_id, PointEntry.kind == "accepted", PointEntry.created_at >= since)
        )
        if earned_today < limit_setting("MAX_REWARDED_REPORTS_PER_DAY", 5):
            award(db, user_id, report.id, "accepted")
    if (
        report.status == "Resolved"
        and has_entry(db, user_id, "accepted", theirs)
        and not has_entry(db, user_id, "resolved", theirs)
    ):
        award(db, user_id, report.id, "resolved")
    # Reporting first only means something once someone else has reported it too.
    if len({item.resident_id for item in group}) > 1 and not db.scalar(
        select(PointEntry.id)
        .where(PointEntry.kind == "first_reporter", PointEntry.report_id.in_([item.id for item in group]))
        .limit(1)
    ):
        first = min(group, key=lambda item: item.created_at)
        if has_entry(
            db, first.resident_id, "accepted", [item.id for item in group if item.resident_id == first.resident_id]
        ):
            award(db, first.resident_id, first.id, "first_reporter")


def reverse_report(db: Session, report_id: str, user_id: str) -> None:
    """A deleted report takes its points back, but never below zero; codes already issued stay valid."""
    earned = db.scalar(
        select(func.coalesce(func.sum(PointEntry.amount), 0)).where(
            PointEntry.report_id == report_id, PointEntry.kind.in_(EARNED), PointEntry.user_id == user_id
        )
    )
    taken = min(earned, max(balance(db, user_id), 0))
    db.execute(update(PointEntry).where(PointEntry.report_id == report_id).values(report_id=None))
    if taken > 0:
        db.add(PointEntry(user_id=user_id, kind="reversal", amount=-taken))
    db.flush()


def expire_due(db: Session, user_id: str | None = None) -> None:
    """Unused codes past their date refund their points and stock. Runs when codes are read or used."""
    due = select(Voucher).where(Voucher.status == "active", Voucher.expires_at < now())
    if user_id:
        due = due.where(Voucher.user_id == user_id)
    for voucher in db.scalars(due).all():
        changed = db.execute(
            update(Voucher).where(Voucher.id == voucher.id, Voucher.status == "active").values(status="expired")
        )
        if changed.rowcount != 1:
            continue
        db.add(PointEntry(user_id=voucher.user_id, kind="refund", amount=voucher.points_cost, voucher_id=voucher.id))
        db.execute(
            update(Reward)
            .where(Reward.id == voucher.reward_id, Reward.stock.is_not(None))
            .values(stock=Reward.stock + 1)
        )
    db.commit()
    db.expire_all()


def erase_account(db: Session, user_id: str) -> None:
    """Part of deleting a resident's account. Stock held by codes they never used goes back on the shelf."""
    unused = select(Voucher.reward_id).where(Voucher.user_id == user_id, Voucher.status == "active")
    for reward_id in db.scalars(unused).all():
        db.execute(
            update(Reward).where(Reward.id == reward_id, Reward.stock.is_not(None)).values(stock=Reward.stock + 1)
        )
    db.execute(delete(PointEntry).where(PointEntry.user_id == user_id))
    db.execute(delete(Voucher).where(Voucher.user_id == user_id))


def reward_data(reward: Reward, manage: bool = False) -> dict:
    data = {
        "id": reward.id,
        "barangay_id": reward.barangay_id,
        "name": reward.name,
        "description": reward.description,
        "partner": reward.partner,
        "points_cost": reward.points_cost,
        "stock": reward.stock,
    }
    return {**data, "active": reward.active} if manage else data


def voucher_data(voucher: Voucher, db: Session) -> dict:
    reward = db.get(Reward, voucher.reward_id)
    barangay = db.get(Barangay, voucher.barangay_id)
    return {
        "id": voucher.id,
        "code": voucher.code,
        "status": voucher.status,
        "points_cost": voucher.points_cost,
        "reward": reward.name,
        "partner": reward.partner,
        "barangay": barangay.name,
        "created_at": utc_iso(voucher.created_at),
        "expires_at": utc_iso(voucher.expires_at),
        "used_at": utc_iso(voucher.used_at) if voucher.used_at else None,
    }


def managed_reward(db: Session, reward_id: str, user: User) -> Reward:
    reward = db.get(Reward, reward_id)
    if not reward or (user.role == "staff" and reward.barangay_id != user.barangay_id):
        raise HTTPException(404, "Reward not found")
    return reward


class RewardInput(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    partner: str | None = Field(default=None, max_length=120)
    points_cost: int = Field(ge=1, le=MAX_COST)
    stock: int | None = Field(default=None, ge=0, le=MAX_COST)
    barangay_id: str | None = None


class RewardChange(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    partner: str | None = Field(default=None, max_length=120)
    points_cost: int | None = Field(default=None, ge=1, le=MAX_COST)
    stock: int | None = Field(default=None, ge=0, le=MAX_COST)
    active: bool | None = None


class CodeInput(BaseModel):
    code: str = Field(min_length=1, max_length=40)


@router.get("/points")
def my_points(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_role(user, {"resident"})
    user_id = user.id
    expire_due(db, user_id)
    entries = db.scalars(
        select(PointEntry).where(PointEntry.user_id == user_id).order_by(PointEntry.created_at.desc()).limit(100)
    )
    return {
        "balance": balance(db, user_id),
        "history": [
            {
                "id": item.id,
                "kind": item.kind,
                "amount": item.amount,
                "report_id": item.report_id,
                "created_at": utc_iso(item.created_at),
            }
            for item in entries
        ],
    }


@router.get("/rewards/barangays")
def shop_barangays(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Any resident may pick any barangay's shop, whatever barangays they have reported in."""
    return [{"id": item.id, "name": item.name} for item in db.scalars(select(Barangay).order_by(Barangay.name))]


@router.get("/rewards")
def shop(
    barangay_id: str = Query(min_length=1, max_length=36),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    rewards = db.scalars(
        select(Reward).where(Reward.barangay_id == barangay_id, Reward.active).order_by(Reward.points_cost, Reward.name)
    )
    return [reward_data(item) for item in rewards]


@router.get("/rewards/manage")
def manage_list(
    barangay_id: str | None = Query(default=None, max_length=36),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Staff see their own barangay's rewards, whatever they ask for; administrators see all or filter."""
    require_role(user, {"staff", "administrator"})
    query = select(Reward).order_by(Reward.name)
    if user.role == "staff":
        query = query.where(Reward.barangay_id == user.barangay_id)
    elif barangay_id:
        query = query.where(Reward.barangay_id == barangay_id)
    names = dict(db.execute(select(Barangay.id, Barangay.name)).tuples().all())
    return [{**reward_data(item, manage=True), "barangay": names.get(item.barangay_id)} for item in db.scalars(query)]


@router.post("/rewards", status_code=201)
def create_reward(body: RewardInput, db: Session = Depends(get_db), user: User = Depends(require_csrf)):
    require_role(user, {"staff", "administrator"})
    barangay_id = user.barangay_id if user.role == "staff" else body.barangay_id
    if not barangay_id or not db.get(Barangay, barangay_id):
        raise HTTPException(422, "Choose a barangay for this reward")
    reward = Reward(
        barangay_id=barangay_id,
        name=body.name.strip(),
        description=(body.description or "").strip() or None,
        partner=(body.partner or "").strip() or None,
        points_cost=body.points_cost,
        stock=body.stock,
        created_by=user.id,
    )
    if not reward.name:
        raise HTTPException(422, "Name the reward")
    db.add(reward)
    db.commit()
    db.refresh(reward)
    return reward_data(reward, manage=True)


@router.patch("/rewards/{reward_id}")
def change_reward(
    reward_id: str, body: RewardChange, db: Session = Depends(get_db), user: User = Depends(require_csrf)
):
    require_role(user, {"staff", "administrator"})
    reward = managed_reward(db, reward_id, user)
    changes = body.model_dump(exclude_unset=True)
    if changes.get("points_cost") is None:
        changes.pop("points_cost", None)
    if changes.get("active") is None:
        changes.pop("active", None)
    if "name" in changes and not (changes["name"] or "").strip():
        raise HTTPException(422, "Name the reward")
    for field, value in changes.items():
        setattr(reward, field, value.strip() or None if isinstance(value, str) else value)
    db.commit()
    db.refresh(reward)
    return reward_data(reward, manage=True)


@router.post("/rewards/{reward_id}/redeem", status_code=201)
def redeem(reward_id: str, request: Request, db: Session = Depends(get_db), user: User = Depends(require_csrf)):
    require_role(user, {"resident"})
    rate_limit(request, "redeem", 10, key=user.id)
    user_id = user.id
    expire_due(db)
    # One redemption at a time, so two taps cannot spend the same points. A write takes the lock on SQLite too.
    db.execute(update(User).where(User.id == user_id).values(id=User.id))
    reward = db.get(Reward, reward_id)
    if not reward or not reward.active:
        raise HTTPException(404, "Reward not found")
    if balance(db, user_id) < reward.points_cost:
        raise HTTPException(409, "Not enough points")
    if reward.stock is not None:
        taken = db.execute(
            update(Reward).where(Reward.id == reward.id, Reward.stock > 0).values(stock=Reward.stock - 1)
        )
        if taken.rowcount != 1:
            db.rollback()
            raise HTTPException(409, "This reward is out of stock")
    days = limit_setting("VOUCHER_DAYS", 30)
    voucher = Voucher(
        code="".join(secrets.choice(CODE_LETTERS) for _ in range(CODE_LENGTH)),
        user_id=user_id,
        reward_id=reward.id,
        barangay_id=reward.barangay_id,
        points_cost=reward.points_cost,
        expires_at=now() + timedelta(days=days),
    )
    db.add(voucher)
    db.flush()
    db.add(PointEntry(user_id=user_id, kind="redeem", amount=-reward.points_cost, voucher_id=voucher.id))
    db.commit()
    db.refresh(voucher)
    return voucher_data(voucher, db)


@router.get("/vouchers")
def my_vouchers(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """The resident's codes still to use, and the ones already used or expired."""
    require_role(user, {"resident"})
    user_id = user.id
    expire_due(db, user_id)
    vouchers = [
        voucher_data(item, db)
        for item in db.scalars(select(Voucher).where(Voucher.user_id == user_id).order_by(Voucher.created_at.desc()))
    ]
    return {
        "available": [item for item in vouchers if item["status"] == "active"],
        "history": [item for item in vouchers if item["status"] != "active"],
    }


@router.post("/vouchers/use")
def use_voucher(body: CodeInput, request: Request, db: Session = Depends(get_db), user: User = Depends(require_csrf)):
    """Staff of the code's barangay, or an administrator, mark a code as used. A code works once."""
    require_role(user, {"staff", "administrator"})
    rate_limit(request, "voucher_use", 20, key=user.id)
    user_id, role, own_barangay = user.id, user.role, user.barangay_id
    expire_due(db)
    voucher = db.scalar(select(Voucher).where(Voucher.code == "".join(body.code.split()).upper()))
    if not voucher or (role == "staff" and voucher.barangay_id != own_barangay):
        raise HTTPException(404, "Code not found")
    if voucher.status == "used":
        raise HTTPException(409, "This code was already used")
    if voucher.status == "expired":
        raise HTTPException(409, "This code has expired")
    used = db.execute(
        update(Voucher)
        .where(Voucher.id == voucher.id, Voucher.status == "active")
        .values(status="used", used_at=now(), used_by=user_id)
    )
    if used.rowcount != 1:
        db.rollback()
        raise HTTPException(409, "This code was already used")
    db.commit()
    db.refresh(voucher)
    return voucher_data(voucher, db)
