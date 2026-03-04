#!/usr/bin/env python3
import asyncio
import os
import sys
from dataclasses import dataclass

from sqlalchemy import select


CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.dirname(CURRENT_DIR)
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

import modules.models as models  # noqa: E402
from core.database import SessionLocal  # noqa: E402
from iam.audit.service import IAMAuditService  # noqa: E402
from modules.iam.services.crypto_keyring import BindPasswordKeyring, KeyringConfigError  # noqa: E402


@dataclass
class Stats:
    total: int = 0
    migrated: int = 0
    skipped: int = 0
    failed: int = 0


def _aad(directory_id: int) -> bytes:
    return b"bind_password:" + str(int(directory_id)).encode("utf-8")


async def _audit(
    *,
    db,
    directory_id: int,
    old_kid: str | None,
    new_kid: str,
    result: str,
    reason: str | None = None,
) -> None:
    await IAMAuditService.log(
        db=db,
        action="DIRECTORY_BIND_PASSWORD_REENCRYPT",
        target_type="directory",
        user_id=0,
        username="system",
        target_id=directory_id,
        target_name=f"directory:{directory_id}",
        result=result,
        reason=reason,
        detail={
            "directory_id": directory_id,
            "old_kid": old_kid,
            "new_kid": new_kid,
            "result": result,
        },
        ip_address="127.0.0.1",
        user_agent="script/reencrypt_bind_passwords",
        trace_id="reencrypt-bind-passwords",
    )


async def main() -> int:
    try:
        _, active_kid = BindPasswordKeyring.load_keyring()
    except KeyringConfigError as exc:
        print(f"[ERROR] keyring config invalid: {exc} (code={exc.code})")
        return 1

    stats = Stats()
    async with SessionLocal() as db:
        rows = (
            await db.execute(
                select(models.DirectoryConfig).where(models.DirectoryConfig.bind_password_ciphertext.is_not(None))
            )
        ).scalars().all()
        stats.total = len(rows)

        for row in rows:
            directory_id = int(row.id)
            ciphertext = str(row.bind_password_ciphertext or "").strip()
            if not ciphertext:
                stats.skipped += 1
                continue

            old_kid = BindPasswordKeyring.parse_ciphertext_kid(ciphertext)
            if old_kid is None:
                stats.failed += 1
                await _audit(
                    db=db,
                    directory_id=directory_id,
                    old_kid=None,
                    new_kid=active_kid,
                    result="fail",
                    reason="UNSUPPORTED_CIPHERTEXT_FORMAT",
                )
                await db.commit()
                continue

            if old_kid == active_kid:
                stats.skipped += 1
                continue

            try:
                plain = BindPasswordKeyring.decrypt_bind_password(ciphertext, aad=_aad(directory_id))
                row.bind_password_ciphertext = BindPasswordKeyring.encrypt_bind_password(plain, aad=_aad(directory_id))
                stats.migrated += 1
                await _audit(
                    db=db,
                    directory_id=directory_id,
                    old_kid=old_kid,
                    new_kid=active_kid,
                    result="success",
                )
                await db.commit()
            except Exception as exc:
                stats.failed += 1
                await _audit(
                    db=db,
                    directory_id=directory_id,
                    old_kid=old_kid,
                    new_kid=active_kid,
                    result="fail",
                    reason=str(exc.__class__.__name__),
                )
                await db.commit()

    print(
        f"Re-encryption done: total={stats.total}, migrated={stats.migrated}, "
        f"skipped={stats.skipped}, failed={stats.failed}"
    )
    return 0 if stats.failed == 0 else 2


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
