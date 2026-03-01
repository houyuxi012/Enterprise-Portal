import re
import secrets
import string
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import models
import utils


def _parse_bool(value: str | bool | None, default: bool = False) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() == "true"


def _parse_int(value: str | int | None, default: int) -> int:
    if value is None:
        return default
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


async def get_password_policy_configs(db: AsyncSession) -> dict[str, str]:
    result = await db.execute(select(models.SystemConfig))
    return {c.key: c.value for c in result.scalars().all()}


async def validate_password(
    db: AsyncSession,
    password: str,
    user: models.User | None = None,
    configs: dict[str, str] | None = None,
    check_history: bool = True,
):
    """
    Validate password against system policy and history reuse constraints.
    """
    if not password:
        raise HTTPException(status_code=400, detail="Password cannot be empty")

    configs = configs or await get_password_policy_configs(db)

    min_length = _parse_int(configs.get("security_password_min_length"), 8)
    require_upper = _parse_bool(configs.get("security_password_require_uppercase"), False)
    require_lower = _parse_bool(configs.get("security_password_require_lowercase"), False)
    require_numbers = _parse_bool(configs.get("security_password_require_numbers"), False)
    require_symbols = _parse_bool(configs.get("security_password_require_symbols"), False)
    check_user_info = _parse_bool(configs.get("security_password_check_user_info"), False)
    history_reuse = max(0, _parse_int(configs.get("security_password_prevent_history_reuse"), 0))

    if len(password) < min_length:
        raise HTTPException(status_code=400, detail=f"密码长度不能少于 {min_length} 位")

    if require_upper and not re.search(r"[A-Z]", password):
        raise HTTPException(status_code=400, detail="密码必须包含大写字母")
    if require_lower and not re.search(r"[a-z]", password):
        raise HTTPException(status_code=400, detail="密码必须包含小写字母")
    if require_numbers and not re.search(r"\d", password):
        raise HTTPException(status_code=400, detail="密码必须包含数字")
    if require_symbols and not re.search(r'[!@#$%^&*(),.?":{}|<>\-_\+=\[\]/\\~`]', password):
        raise HTTPException(status_code=400, detail="密码必须包含特殊符号")

    if check_user_info and user:
        pwd_lower = password.lower()
        username = (getattr(user, "username", "") or "").lower()
        email = (getattr(user, "email", "") or "").lower()
        if username and username in pwd_lower:
            raise HTTPException(status_code=400, detail="安全策略要求: 密码不能包含用户名")
        if email:
            email_prefix = email.split("@")[0]
            if email_prefix and email_prefix in pwd_lower:
                raise HTTPException(status_code=400, detail="安全策略要求: 密码不能包含邮箱前缀")

    if check_history and history_reuse > 0 and user and getattr(user, "id", None):
        historical_hashes: list[str] = []
        current_hash = getattr(user, "hashed_password", None)
        if current_hash:
            historical_hashes.append(current_hash)

        history_stmt = (
            select(models.UserPasswordHistory.hashed_password)
            .where(models.UserPasswordHistory.user_id == user.id)
            .order_by(models.UserPasswordHistory.changed_at.desc(), models.UserPasswordHistory.id.desc())
            .limit(history_reuse)
        )
        history_rows = (await db.execute(history_stmt)).scalars().all()
        historical_hashes.extend(history_rows)

        for old_hash in historical_hashes:
            if old_hash and await utils.verify_password(password, old_hash):
                raise HTTPException(
                    status_code=400,
                    detail=f"新密码不能与最近 {history_reuse} 次使用的密码重复",
                )

    return True


async def is_password_expired(
    db: AsyncSession,
    user: models.User,
    configs: dict[str, str] | None = None,
) -> bool:
    """
    Check password max-age policy. 0 means never expire.
    """
    configs = configs or await get_password_policy_configs(db)
    max_age_days = max(0, _parse_int(configs.get("security_password_max_age_days"), 0))
    if max_age_days <= 0:
        return False

    changed_at = getattr(user, "password_changed_at", None)
    if not changed_at:
        return True
    if changed_at.tzinfo is None:
        changed_at = changed_at.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc) > (changed_at + timedelta(days=max_age_days))


async def set_user_password(
    db: AsyncSession,
    user: models.User,
    new_password: str,
    *,
    validate: bool = True,
    policy_user: models.User | None = None,
    configs: dict[str, str] | None = None,
):
    """
    Persist password change and record history for reuse prevention.
    """
    if validate:
        await validate_password(db, new_password, policy_user or user, configs=configs)

    old_hash = getattr(user, "hashed_password", None)
    now = datetime.now(timezone.utc)
    user.hashed_password = await utils.get_password_hash(new_password)
    user.password_changed_at = now
    user.password_violates_policy = False
    user.password_change_required = False
    db.add(user)

    if old_hash and getattr(user, "id", None):
        db.add(
            models.UserPasswordHistory(
                user_id=user.id,
                hashed_password=old_hash,
                changed_at=now,
            )
        )


def generate_compliant_password(db_configs: dict) -> str:
    """
    Generate a random password that satisfies active complexity rules.
    """
    min_length = _parse_int(db_configs.get("security_password_min_length"), 8)
    require_upper = _parse_bool(db_configs.get("security_password_require_uppercase"), False)
    require_lower = _parse_bool(db_configs.get("security_password_require_lowercase"), False)
    require_numbers = _parse_bool(db_configs.get("security_password_require_numbers"), False)
    require_symbols = _parse_bool(db_configs.get("security_password_require_symbols"), False)

    target_length = max(min_length, 8)
    pool = ""
    result = []

    if require_upper:
        pool += string.ascii_uppercase
        result.append(secrets.choice(string.ascii_uppercase))
    if require_lower:
        pool += string.ascii_lowercase
        result.append(secrets.choice(string.ascii_lowercase))
    if require_numbers:
        pool += string.digits
        result.append(secrets.choice(string.digits))
    if require_symbols:
        symbols = "!@#$%^*_+"
        pool += symbols
        result.append(secrets.choice(symbols))

    if not pool:
        pool = string.ascii_letters + string.digits

    while len(result) < target_length:
        result.append(secrets.choice(pool))

    secrets.SystemRandom().shuffle(result)
    return "".join(result)
