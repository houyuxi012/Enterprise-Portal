import base64
import hashlib
import json
import logging
import re
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from cryptography.hazmat.primitives.serialization import load_pem_public_key
from fastapi import HTTPException, Request, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

import models
from services.audit_service import AuditService
from services.license_settings import settings

logger = logging.getLogger(__name__)


class LicenseValidationError(Exception):
    def __init__(self, code: str, message: str, status_code: int = status.HTTP_400_BAD_REQUEST):
        self.code = code
        self.message = message
        self.status_code = status_code
        super().__init__(message)


class LicenseService:
    LICENSE_ID_PATTERN = re.compile(r"^HYX(?:-[A-Z0-9]{5}){5}$")

    CODE_LICENSE_REQUIRED = "LICENSE_REQUIRED"
    CODE_READ_ONLY = "LICENSE_READ_ONLY"
    CODE_SIGNATURE_INVALID = "LICENSE_SIGNATURE_INVALID"
    CODE_PRODUCT_MISMATCH = "LICENSE_PRODUCT_MISMATCH"
    CODE_PRODUCT_MODEL_MISMATCH = "LICENSE_PRODUCT_MODEL_MISMATCH"
    CODE_INSTALLATION_MISMATCH = "LICENSE_INSTALLATION_MISMATCH"
    CODE_NOT_YET_VALID = "LICENSE_NOT_YET_VALID"
    CODE_EXPIRED = "LICENSE_EXPIRED"
    CODE_REVOKED = "LICENSE_REVOKED"
    CODE_REVOCATION_PATH_MISSING = "LICENSE_REVOCATION_PATH_MISSING"
    CODE_REVOCATION_WRITE_FAILED = "LICENSE_REVOCATION_WRITE_FAILED"
    CODE_TIME_ROLLBACK = "TIME_ROLLBACK"
    CODE_INVALID_PAYLOAD = "LICENSE_INVALID_PAYLOAD"
    CODE_MISSING = "LICENSE_NOT_INSTALLED"

    _state_cache: dict[str, Any] = {"expires_at": 0.0, "state": None}
    _public_keyring_cache_raw: Optional[str] = None
    _public_keyring_cache_map: dict[str, Ed25519PublicKey] = {}
    _revocation_cache: dict[str, Any] = {
        "expires_at": 0.0,
        "path": "",
        "mtime": 0.0,
        "data": None,
    }

    @classmethod
    def invalidate_cache(cls):
        cls._state_cache["expires_at"] = 0.0
        cls._state_cache["state"] = None

    @classmethod
    def _invalidate_revocation_cache(cls):
        cls._revocation_cache = {
            "expires_at": 0.0,
            "path": "",
            "mtime": 0.0,
            "data": None,
        }

    @staticmethod
    def _request_ip(request: Optional[Request]) -> str:
        if request is None:
            return "unknown"
        x_real_ip = request.headers.get("X-Real-IP")
        x_forwarded_for = request.headers.get("X-Forwarded-For", "").split(",")[0].strip()
        return x_real_ip or x_forwarded_for or (request.client.host if request.client else "unknown")

    @staticmethod
    def _request_trace_id(request: Optional[Request]) -> Optional[str]:
        if request is None:
            return None
        return request.headers.get("X-Request-ID")

    @staticmethod
    def _request_ua(request: Optional[Request]) -> Optional[str]:
        if request is None:
            return None
        return request.headers.get("User-Agent")

    @staticmethod
    def _ensure_utc(dt: datetime) -> datetime:
        if dt.tzinfo is None:
            return dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)

    @classmethod
    def _parse_datetime(cls, raw: Any, field_name: str) -> datetime:
        if isinstance(raw, datetime):
            return cls._ensure_utc(raw)
        if not isinstance(raw, str) or not raw.strip():
            raise LicenseValidationError(
                cls.CODE_INVALID_PAYLOAD,
                f"无效的时间字段：{field_name}",
            )
        text = raw.strip().replace("Z", "+00:00")
        try:
            return cls._ensure_utc(datetime.fromisoformat(text))
        except Exception:
            raise LicenseValidationError(
                cls.CODE_INVALID_PAYLOAD,
                f"时间格式错误：{field_name}",
            )

    @staticmethod
    def _canonical_payload(payload: dict[str, Any]) -> str:
        return json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)

    @classmethod
    def _decode_signature(cls, signature: str) -> bytes:
        text = (signature or "").strip()
        if not text:
            raise LicenseValidationError(cls.CODE_INVALID_PAYLOAD, "缺少签名字段 signature")

        # Try base64url/base64 first.
        for decoder in (base64.urlsafe_b64decode, base64.b64decode):
            try:
                padded = text + "=" * (-len(text) % 4)
                raw = decoder(padded)
                if raw:
                    return raw
            except Exception:
                continue

        # Hex fallback for operational tooling compatibility.
        try:
            raw_hex = bytes.fromhex(text)
            if raw_hex:
                return raw_hex
        except Exception:
            pass

        raise LicenseValidationError(cls.CODE_INVALID_PAYLOAD, "签名编码无效")

    @classmethod
    def _normalize_public_key_text(cls, raw: str) -> str:
        return (raw or "").replace("\r\n", "\n").replace("\r", "\n").strip()

    @classmethod
    def _normalize_fingerprint(cls, raw: str) -> str:
        text = (raw or "").strip().lower()
        if text.startswith("sha256:"):
            text = text.split(":", 1)[1]
        return text

    @classmethod
    def _parse_public_key(cls, key_text: str, *, field_name: str) -> Ed25519PublicKey:
        normalized = cls._normalize_public_key_text(key_text)
        key: Optional[Ed25519PublicKey] = None
        if "BEGIN PUBLIC KEY" in normalized:
            try:
                loaded = load_pem_public_key(normalized.encode("utf-8"))
                if isinstance(loaded, Ed25519PublicKey):
                    key = loaded
            except Exception:
                key = None
        else:
            raw_key: Optional[bytes] = None
            for decoder in (base64.urlsafe_b64decode, base64.b64decode):
                try:
                    padded = normalized + "=" * (-len(normalized) % 4)
                    decoded = decoder(padded)
                    if decoded:
                        raw_key = decoded
                        break
                except Exception:
                    continue
            if raw_key is None:
                try:
                    raw_key = bytes.fromhex(normalized)
                except Exception:
                    raw_key = None
            if raw_key and len(raw_key) == 32:
                try:
                    key = Ed25519PublicKey.from_public_bytes(raw_key)
                except Exception:
                    key = None
        if key is None:
            raise LicenseValidationError(
                cls.CODE_INVALID_PAYLOAD,
                f"{field_name} 格式无效",
                status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        return key

    @classmethod
    def _load_public_keyring(cls) -> dict[str, Ed25519PublicKey]:
        keyring_raw = (settings.LICENSE_ED25519_PUBLIC_KEYS or "").strip()
        fp_map_raw = (settings.LICENSE_ED25519_PUBLIC_KEY_FINGERPRINTS or "").strip()
        single_key_raw = cls._normalize_public_key_text(settings.LICENSE_ED25519_PUBLIC_KEY or "")
        single_fp_raw = cls._normalize_fingerprint(settings.LICENSE_ED25519_PUBLIC_KEY_FINGERPRINT or "")

        cache_token = "|".join([keyring_raw, fp_map_raw, single_key_raw, single_fp_raw])
        if cls._public_keyring_cache_raw == cache_token and cls._public_keyring_cache_map:
            return cls._public_keyring_cache_map

        keyring_text_map: dict[str, str] = {}
        expected_fp_map: dict[str, str] = {}

        if keyring_raw:
            try:
                parsed = json.loads(keyring_raw)
            except Exception:
                raise LicenseValidationError(
                    cls.CODE_INVALID_PAYLOAD,
                    "LICENSE_ED25519_PUBLIC_KEYS 不是合法 JSON",
                    status.HTTP_500_INTERNAL_SERVER_ERROR,
                )
            if not isinstance(parsed, dict) or not parsed:
                raise LicenseValidationError(
                    cls.CODE_INVALID_PAYLOAD,
                    "LICENSE_ED25519_PUBLIC_KEYS 必须是非空对象（kid -> 公钥）",
                    status.HTTP_500_INTERNAL_SERVER_ERROR,
                )
            for kid, key_text in parsed.items():
                kid_text = str(kid).strip()
                value_text = cls._normalize_public_key_text(str(key_text or ""))
                if not kid_text or not value_text:
                    raise LicenseValidationError(
                        cls.CODE_INVALID_PAYLOAD,
                        "LICENSE_ED25519_PUBLIC_KEYS 存在空 kid 或空公钥",
                        status.HTTP_500_INTERNAL_SERVER_ERROR,
                    )
                keyring_text_map[kid_text] = value_text
        elif single_key_raw:
            keyring_text_map["default"] = single_key_raw
        else:
            raise LicenseValidationError(
                cls.CODE_INVALID_PAYLOAD,
                "系统未配置 License 公钥（LICENSE_ED25519_PUBLIC_KEY 或 LICENSE_ED25519_PUBLIC_KEYS）",
                status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        if fp_map_raw:
            try:
                parsed_fp = json.loads(fp_map_raw)
            except Exception:
                raise LicenseValidationError(
                    cls.CODE_INVALID_PAYLOAD,
                    "LICENSE_ED25519_PUBLIC_KEY_FINGERPRINTS 不是合法 JSON",
                    status.HTTP_500_INTERNAL_SERVER_ERROR,
                )
            if not isinstance(parsed_fp, dict):
                raise LicenseValidationError(
                    cls.CODE_INVALID_PAYLOAD,
                    "LICENSE_ED25519_PUBLIC_KEY_FINGERPRINTS 必须是对象（kid -> sha256）",
                    status.HTTP_500_INTERNAL_SERVER_ERROR,
                )
            for kid, fp in parsed_fp.items():
                kid_text = str(kid).strip()
                fp_text = cls._normalize_fingerprint(str(fp or ""))
                if kid_text and fp_text:
                    expected_fp_map[kid_text] = fp_text
        elif single_fp_raw and "default" in keyring_text_map:
            expected_fp_map["default"] = single_fp_raw

        if not expected_fp_map:
            raise LicenseValidationError(
                cls.CODE_INVALID_PAYLOAD,
                "系统未配置 License 公钥指纹（LICENSE_ED25519_PUBLIC_KEY_FINGERPRINT 或 LICENSE_ED25519_PUBLIC_KEY_FINGERPRINTS）",
                status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        keyring_obj: dict[str, Ed25519PublicKey] = {}
        for kid, key_text in keyring_text_map.items():
            expected_fp = expected_fp_map.get(kid)
            if not expected_fp:
                raise LicenseValidationError(
                    cls.CODE_INVALID_PAYLOAD,
                    f"缺少公钥指纹配置：kid={kid}",
                    status.HTTP_500_INTERNAL_SERVER_ERROR,
                )
            actual_fp = hashlib.sha256(key_text.encode("utf-8")).hexdigest()
            if actual_fp != expected_fp:
                raise LicenseValidationError(
                    cls.CODE_INVALID_PAYLOAD,
                    f"License 公钥指纹校验失败：kid={kid}",
                    status.HTTP_500_INTERNAL_SERVER_ERROR,
                )
            keyring_obj[kid] = cls._parse_public_key(key_text, field_name=f"公钥(kid={kid})")

        cls._public_keyring_cache_raw = cache_token
        cls._public_keyring_cache_map = keyring_obj
        return keyring_obj

    @classmethod
    def _resolve_verify_key_candidates(
        cls,
        payload: dict[str, Any],
        keyring: dict[str, Ed25519PublicKey],
    ) -> list[tuple[str, Ed25519PublicKey]]:
        payload_kid = str(payload.get("key_id") or "").strip()
        if payload_kid:
            key = keyring.get(payload_kid)
            if key is None:
                raise LicenseValidationError(
                    cls.CODE_INVALID_PAYLOAD,
                    f"未知的 key_id：{payload_kid}",
                )
            return [(payload_kid, key)]
        return list(keyring.items())

    @classmethod
    def _load_revocation_list(cls) -> Optional[dict[str, Any]]:
        path = (settings.LICENSE_REVOCATION_LIST_PATH or "").strip()
        if not path:
            cls._invalidate_revocation_cache()
            return None

        now_ts = time.time()
        cached_path = str(cls._revocation_cache.get("path") or "")
        cached_data = cls._revocation_cache.get("data")
        cached_expire = float(cls._revocation_cache.get("expires_at") or 0.0)
        if cached_path == path and cached_data is not None and now_ts < cached_expire:
            return cached_data

        file_path = Path(path)
        if not file_path.exists():
            cls._revocation_cache = {"expires_at": now_ts + 5.0, "path": path, "mtime": 0.0, "data": None}
            return None

        mtime = file_path.stat().st_mtime
        if cached_path == path and cached_data is not None and cls._revocation_cache.get("mtime") == mtime:
            cls._revocation_cache["expires_at"] = now_ts + max(1, settings.LICENSE_CACHE_TTL_SECONDS)
            return cached_data

        try:
            raw = json.loads(file_path.read_text(encoding="utf-8"))
        except Exception as e:
            logger.warning("Failed to parse revocation list file %s: %s", path, e)
            cls._revocation_cache = {"expires_at": now_ts + 5.0, "path": path, "mtime": mtime, "data": None}
            return None

        if not isinstance(raw, dict):
            logger.warning("Invalid revocation list format in %s: root must be object", path)
            cls._revocation_cache = {"expires_at": now_ts + 5.0, "path": path, "mtime": mtime, "data": None}
            return None

        revoked_entries = raw.get("revoked") or []
        if not isinstance(revoked_entries, list):
            logger.warning("Invalid revocation list format in %s: revoked must be array", path)
            cls._revocation_cache = {"expires_at": now_ts + 5.0, "path": path, "mtime": mtime, "data": None}
            return None

        license_ids: set[str] = set()
        fingerprints: set[str] = set()
        for item in revoked_entries:
            if not isinstance(item, dict):
                continue
            license_id = str(item.get("license_id") or "").strip().upper()
            fingerprint = str(item.get("fingerprint") or "").strip().lower()
            if license_id:
                license_ids.add(license_id)
            if fingerprint:
                fingerprints.add(fingerprint)

        parsed = {
            "product_id": str(raw.get("product_id") or "").strip(),
            "rev": int(raw.get("rev") or 0),
            "updated_at": raw.get("updated_at"),
            "license_ids": license_ids,
            "fingerprints": fingerprints,
        }
        cls._revocation_cache = {
            "expires_at": now_ts + max(1, settings.LICENSE_CACHE_TTL_SECONDS),
            "path": path,
            "mtime": mtime,
            "data": parsed,
        }
        return parsed

    @classmethod
    def _normalize_revocation_payload(cls, payload: dict[str, Any]) -> dict[str, Any]:
        if not isinstance(payload, dict):
            raise LicenseValidationError(cls.CODE_INVALID_PAYLOAD, "吊销列表 payload 必须是 JSON 对象")

        revoked = payload.get("revoked")
        if not isinstance(revoked, list):
            raise LicenseValidationError(cls.CODE_INVALID_PAYLOAD, "吊销列表缺少 revoked 数组")

        product_id = str(payload.get("product_id") or "").strip()
        if not product_id:
            raise LicenseValidationError(cls.CODE_INVALID_PAYLOAD, "吊销列表缺少 product_id")
        if product_id != settings.PRODUCT_ID:
            raise LicenseValidationError(
                cls.CODE_PRODUCT_MISMATCH,
                "吊销列表 product_id 与当前系统不匹配",
            )

        normalized_revoked: list[dict[str, Any]] = []
        for index, item in enumerate(revoked):
            if not isinstance(item, dict):
                raise LicenseValidationError(
                    cls.CODE_INVALID_PAYLOAD,
                    f"吊销项格式错误：revoked[{index}] 必须是对象",
                )

            license_id = str(item.get("license_id") or "").strip().upper()
            fingerprint = str(item.get("fingerprint") or "").strip().lower()

            if not license_id and not fingerprint:
                raise LicenseValidationError(
                    cls.CODE_INVALID_PAYLOAD,
                    f"吊销项缺少 license_id/fingerprint：revoked[{index}]",
                )

            if license_id and not cls.LICENSE_ID_PATTERN.fullmatch(license_id):
                raise LicenseValidationError(
                    cls.CODE_INVALID_PAYLOAD,
                    f"吊销项 license_id 格式错误：revoked[{index}]",
                )
            if fingerprint and not re.fullmatch(r"[0-9a-f]{64}", fingerprint):
                raise LicenseValidationError(
                    cls.CODE_INVALID_PAYLOAD,
                    f"吊销项 fingerprint 格式错误：revoked[{index}]",
                )

            normalized_entry: dict[str, Any] = {
                "reason": str(item.get("reason") or "").strip() or "manual_revoke",
                "revoked_at": str(item.get("revoked_at") or "").strip() or datetime.now(timezone.utc).replace(
                    microsecond=0
                ).isoformat().replace("+00:00", "Z"),
            }
            if license_id:
                normalized_entry["license_id"] = license_id
            if fingerprint:
                normalized_entry["fingerprint"] = fingerprint
            normalized_revoked.append(normalized_entry)

        return {
            "product_id": product_id,
            "rev": int(payload.get("rev") or 0),
            "updated_at": str(payload.get("updated_at") or "").strip()
            or datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
            "revoked": normalized_revoked,
        }

    @classmethod
    def _compute_safe_now(
        cls,
        system_now: datetime,
        last_seen_time: Optional[datetime],
    ) -> tuple[datetime, bool]:
        now_utc = cls._ensure_utc(system_now)
        if last_seen_time is None:
            return now_utc, False
        last_seen = cls._ensure_utc(last_seen_time)
        rollback_grace = timedelta(seconds=max(0, settings.LICENSE_TIME_ROLLBACK_GRACE_SECONDS))
        if now_utc + rollback_grace < last_seen:
            return last_seen, True
        return (last_seen if last_seen > now_utc else now_utc), False

    @classmethod
    def verify_payload_signature_and_claims(
        cls,
        payload: dict[str, Any],
        signature: str,
        last_seen_time: Optional[datetime] = None,
        system_now: Optional[datetime] = None,
    ) -> dict[str, Any]:
        if not isinstance(payload, dict) or not payload:
            raise LicenseValidationError(cls.CODE_INVALID_PAYLOAD, "payload 必须是非空 JSON 对象")

        canonical = cls._canonical_payload(payload)
        canonical_bytes = canonical.encode("utf-8")
        signature_raw = cls._decode_signature(signature)
        keyring = cls._load_public_keyring()
        verify_candidates = cls._resolve_verify_key_candidates(payload, keyring)
        verified_key_id: Optional[str] = None
        verified = False
        for key_id, public_key in verify_candidates:
            try:
                public_key.verify(signature_raw, canonical_bytes)
                verified_key_id = key_id
                verified = True
                break
            except InvalidSignature:
                continue

        if not verified:
            raise LicenseValidationError(
                cls.CODE_SIGNATURE_INVALID,
                "License 签名校验失败",
            )

        license_id = str(payload.get("license_id") or "").strip()
        product_id = str(payload.get("product_id") or "").strip()
        product_model = str(payload.get("product_model") or "").strip()
        installation_id = str(payload.get("installation_id") or "").strip()
        grant_type = str(payload.get("grant_type") or "").strip().lower()
        customer = str(payload.get("customer") or "").strip()
        features = payload.get("features") or {}
        limits = payload.get("limits") or {}

        if not license_id:
            raise LicenseValidationError(cls.CODE_INVALID_PAYLOAD, "缺少 license_id")
        if not cls.LICENSE_ID_PATTERN.fullmatch(license_id):
            raise LicenseValidationError(
                cls.CODE_INVALID_PAYLOAD,
                "license_id 格式必须为 HYX-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX",
            )
        if not product_id:
            raise LicenseValidationError(cls.CODE_INVALID_PAYLOAD, "缺少 product_id")
        if not product_model:
            raise LicenseValidationError(cls.CODE_INVALID_PAYLOAD, "缺少 product_model")
        if not installation_id:
            raise LicenseValidationError(cls.CODE_INVALID_PAYLOAD, "缺少 installation_id")
        if grant_type not in {"formal", "trial", "learning"}:
            raise LicenseValidationError(
                cls.CODE_INVALID_PAYLOAD,
                "grant_type 必须是 formal、trial、learning 之一",
            )
        if not isinstance(features, (dict, list, tuple, set)):
            raise LicenseValidationError(cls.CODE_INVALID_PAYLOAD, "features 必须是对象或数组")
        if not isinstance(limits, dict):
            raise LicenseValidationError(cls.CODE_INVALID_PAYLOAD, "limits 必须是对象")

        not_before = cls._parse_datetime(payload.get("not_before"), "not_before")
        expires_at = cls._parse_datetime(payload.get("expires_at"), "expires_at")
        if expires_at <= not_before:
            raise LicenseValidationError(
                cls.CODE_INVALID_PAYLOAD,
                "expires_at 必须晚于 not_before",
            )

        if product_id != settings.PRODUCT_ID:
            raise LicenseValidationError(
                cls.CODE_PRODUCT_MISMATCH,
                "License 的 product_id 与当前系统不匹配",
            )
        if product_model != settings.PRODUCT_MODEL:
            raise LicenseValidationError(
                cls.CODE_PRODUCT_MODEL_MISMATCH,
                "License 的 product_model 与当前产品型号不匹配",
            )
        if installation_id != settings.INSTALLATION_ID:
            raise LicenseValidationError(
                cls.CODE_INSTALLATION_MISMATCH,
                "License 的 installation_id 与当前部署序列号不匹配",
            )

        now_utc = cls._ensure_utc(system_now or datetime.now(timezone.utc))
        safe_now, rollback = cls._compute_safe_now(now_utc, last_seen_time)
        if rollback:
            raise LicenseValidationError(
                cls.CODE_TIME_ROLLBACK,
                "检测到系统时间回拨",
                status.HTTP_403_FORBIDDEN,
            )
        if safe_now < not_before:
            raise LicenseValidationError(
                cls.CODE_NOT_YET_VALID,
                "License 尚未生效",
                status.HTTP_403_FORBIDDEN,
            )
        if safe_now >= expires_at:
            raise LicenseValidationError(
                cls.CODE_EXPIRED,
                "License 已过期",
                status.HTTP_403_FORBIDDEN,
            )

        fingerprint = hashlib.sha256(canonical_bytes).hexdigest()
        revocation = cls._load_revocation_list()
        if revocation and str(revocation.get("product_id") or "").strip() == product_id:
            revoked_ids = revocation.get("license_ids") or set()
            revoked_fps = revocation.get("fingerprints") or set()
            if license_id.upper() in revoked_ids or fingerprint.lower() in revoked_fps:
                raise LicenseValidationError(
                    cls.CODE_REVOKED,
                    "License 已被吊销",
                    status.HTTP_403_FORBIDDEN,
                )
        return {
            "license_id": license_id,
            "product_id": product_id,
            "product_model": product_model,
            "installation_id": installation_id,
            "grant_type": grant_type,
            "customer": customer,
            "features": dict(features) if isinstance(features, dict) else {"_list": list(features)},
            "limits": limits,
            "not_before": not_before,
            "expires_at": expires_at,
            "signature": signature,
            "fingerprint": fingerprint,
            "payload": payload,
            "safe_now": safe_now,
            "status": "active",
            "reason": None,
            "verified_key_id": verified_key_id,
        }

    @classmethod
    def _serialize_state(cls, row: models.LicenseState) -> dict[str, Any]:
        return {
            "id": row.id,
            "product_id": row.product_id,
            "installation_id": row.installation_id,
            "grant_type": row.grant_type,
            "customer": row.customer,
            "features": row.features or {},
            "limits": row.limits or {},
            "not_before": row.not_before,
            "expires_at": row.expires_at,
            "signature": row.signature,
            "fingerprint": row.fingerprint,
            "status": row.status,
            "reason": row.reason,
            "last_seen_time": row.last_seen_time,
            "installed_at": row.installed_at,
            "payload": row.payload or {},
        }

    @classmethod
    async def _load_state_row(cls, db: AsyncSession) -> Optional[models.LicenseState]:
        row = await db.get(models.LicenseState, 1)
        if row is not None:
            return row
        result = await db.execute(select(models.LicenseState).order_by(models.LicenseState.id.desc()).limit(1))
        return result.scalars().first()

    @classmethod
    async def get_current_state(
        cls,
        db: AsyncSession,
        force_refresh: bool = False,
    ) -> Optional[dict[str, Any]]:
        now_ts = time.time()
        if (
            not force_refresh
            and cls._state_cache["state"] is not None
            and now_ts < cls._state_cache["expires_at"]
        ):
            return cls._state_cache["state"]

        row = await cls._load_state_row(db)
        if row is None:
            cls._state_cache["state"] = None
            cls._state_cache["expires_at"] = now_ts + max(1, settings.LICENSE_CACHE_TTL_SECONDS)
            return None

        state = cls._serialize_state(row)
        cls._state_cache["state"] = state
        cls._state_cache["expires_at"] = now_ts + max(1, settings.LICENSE_CACHE_TTL_SECONDS)
        return state

    @classmethod
    def _evaluate_runtime_state(
        cls,
        state: Optional[dict[str, Any]],
        system_now: Optional[datetime] = None,
    ) -> dict[str, Any]:
        if state is None:
            return {"ok": False, "reason_code": cls.CODE_MISSING, "safe_now": None}

        now_utc = cls._ensure_utc(system_now or datetime.now(timezone.utc))
        safe_now, rollback = cls._compute_safe_now(now_utc, state.get("last_seen_time"))
        if rollback:
            return {"ok": False, "reason_code": cls.CODE_TIME_ROLLBACK, "safe_now": safe_now}

        if safe_now < cls._ensure_utc(state["not_before"]):
            return {"ok": False, "reason_code": cls.CODE_NOT_YET_VALID, "safe_now": safe_now}

        if safe_now >= cls._ensure_utc(state["expires_at"]):
            return {"ok": False, "reason_code": cls.CODE_EXPIRED, "safe_now": safe_now}

        status_value = (state.get("status") or "").lower()
        reason_value = str(state.get("reason") or "").upper()
        if status_value not in {"active"}:
            # Backward-compat self-heal: if a previously expired row remains stale
            # while current time is still in license validity window, do not block.
            if reason_value == cls.CODE_EXPIRED:
                return {"ok": True, "reason_code": None, "safe_now": safe_now}
            return {
                "ok": False,
                "reason_code": reason_value or "LICENSE_INACTIVE",
                "safe_now": safe_now,
            }

        return {"ok": True, "reason_code": None, "safe_now": safe_now}

    @classmethod
    def _is_state_revoked(cls, state: dict[str, Any]) -> bool:
        revocation = cls._load_revocation_list()
        if not revocation:
            return False

        product_id = str(state.get("product_id") or "").strip()
        revoked_product = str(revocation.get("product_id") or "").strip()
        if revoked_product and product_id and revoked_product != product_id:
            return False

        payload = state.get("payload") if isinstance(state.get("payload"), dict) else {}
        license_id = str(payload.get("license_id") or "").strip().upper()
        fingerprint = str(state.get("fingerprint") or "").strip().lower()
        revoked_ids = revocation.get("license_ids") or set()
        revoked_fingerprints = revocation.get("fingerprints") or set()
        return bool(
            (license_id and license_id in revoked_ids)
            or (fingerprint and fingerprint in revoked_fingerprints)
        )

    @classmethod
    async def _evaluate_runtime_with_revocation(
        cls,
        db: AsyncSession,
        state: Optional[dict[str, Any]],
        *,
        system_now: Optional[datetime] = None,
    ) -> dict[str, Any]:
        runtime = cls._evaluate_runtime_state(state, system_now=system_now)
        if runtime["ok"] and state is not None and cls._is_state_revoked(state):
            return {
                "ok": False,
                "reason_code": cls.CODE_REVOKED,
                "safe_now": runtime.get("safe_now"),
            }
        return runtime

    @staticmethod
    def _feature_enabled(features: Any, feature: str) -> bool:
        target = (feature or "").strip()
        if not target:
            return False

        if isinstance(features, dict):
            value = features.get(target)
            if isinstance(value, bool):
                return value
            if isinstance(value, (int, float)):
                return value > 0
            if isinstance(value, str):
                return value.strip().lower() in {"1", "true", "yes", "enabled", "on"}
            if isinstance(value, dict):
                enabled = value.get("enabled")
                if isinstance(enabled, bool):
                    return enabled
            list_value = features.get("_list")
            if isinstance(list_value, (list, tuple, set)):
                return target in [str(i) for i in list_value]
            return False

        if isinstance(features, (list, tuple, set)):
            return target in [str(i) for i in features]

        return False

    @classmethod
    async def _append_event(
        cls,
        db: AsyncSession,
        *,
        event_type: str,
        status: str,
        reason: Optional[str],
        payload: Optional[dict[str, Any]],
        signature: Optional[str],
        fingerprint: Optional[str],
        product_id: Optional[str],
        installation_id: Optional[str],
        grant_type: Optional[str],
        customer: Optional[str],
        actor_id: Optional[int],
        actor_username: Optional[str],
        ip_address: Optional[str],
        trace_id: Optional[str],
    ) -> None:
        db.add(
            models.LicenseEvent(
                event_type=event_type,
                status=status,
                reason=reason,
                payload=payload,
                signature=signature,
                fingerprint=fingerprint,
                product_id=product_id,
                installation_id=installation_id,
                grant_type=grant_type,
                customer=customer,
                actor_id=actor_id,
                actor_username=actor_username,
                ip_address=ip_address,
                trace_id=trace_id,
            )
        )

    @classmethod
    def _normalize_business_action(cls, action: str) -> str:
        normalized = (action or "").strip().lower()
        mapping = {
            "license.install": "LICENSE_INSTALL",
            "license.verify_failed": "LICENSE_VERIFY_FAILED",
            "license.expired": "LICENSE_EXPIRED",
            "license.revocation.install": "LICENSE_REVOCATION_INSTALL",
        }
        if normalized in mapping:
            return mapping[normalized]
        return (action or "LICENSE_EVENT").upper().replace(".", "_")

    @classmethod
    async def _append_business_audit(
        cls,
        db: AsyncSession,
        *,
        action: str,
        result: str,
        reason: Optional[str],
        detail: dict[str, Any],
        actor_id: Optional[int],
        actor_username: Optional[str],
        request: Optional[Request],
    ) -> None:
        try:
            action_code = cls._normalize_business_action(action)
            target_key = detail.get("installation_id") or detail.get("product_id") or settings.INSTALLATION_ID
            detail_payload = dict(detail or {})
            if reason and not detail_payload.get("reason"):
                detail_payload["reason"] = reason
            await AuditService.log_business_action(
                db=db,
                user_id=actor_id or 0,
                username=actor_username or "system",
                action=action_code,
                target=f"license:{target_key}",
                status="SUCCESS" if str(result).lower() == "success" else "FAIL",
                detail=json.dumps(detail_payload, ensure_ascii=False, default=str),
                ip_address=cls._request_ip(request),
                trace_id=cls._request_trace_id(request),
                domain="BUSINESS",
            )
        except Exception as e:
            logger.warning("Failed to write business audit for license event %s: %s", action, e)

    @classmethod
    async def _touch_last_seen(
        cls,
        db: AsyncSession,
        state_id: int,
        safe_now: datetime,
    ) -> None:
        row = await db.get(models.LicenseState, state_id)
        if row is None:
            return
        current = row.last_seen_time
        if current is None:
            row.last_seen_time = safe_now
            await db.commit()
            cls.invalidate_cache()
            return
        current_utc = cls._ensure_utc(current)
        if safe_now <= current_utc:
            return
        if (safe_now - current_utc).total_seconds() < settings.LICENSE_LAST_SEEN_TOUCH_SECONDS:
            return
        row.last_seen_time = safe_now
        await db.commit()
        cls.invalidate_cache()

    @classmethod
    async def _mark_runtime_transition(
        cls,
        db: AsyncSession,
        *,
        state: dict[str, Any],
        reason_code: str,
        safe_now: Optional[datetime],
        request: Optional[Request],
        actor_id: Optional[int],
        actor_username: Optional[str],
    ) -> None:
        row = await db.get(models.LicenseState, state["id"])
        if row is None:
            return

        # Re-evaluate against the latest DB row to avoid stale worker cache
        # incorrectly mutating a newly installed license.
        current_state = cls._serialize_state(row)
        current_runtime = cls._evaluate_runtime_state(
            current_state,
            system_now=safe_now or datetime.now(timezone.utc),
        )
        current_reason = current_runtime.get("reason_code")

        # Self-heal: if row is marked expired but time window is actually valid,
        # reactivate it instead of keeping the system in read-only mode forever.
        if (
            reason_code == cls.CODE_EXPIRED
            and safe_now is not None
            and safe_now < cls._ensure_utc(row.expires_at)
            and (row.status or "").lower() == "expired"
            and (row.reason or "").upper() in {"", cls.CODE_EXPIRED}
        ):
            row.status = "active"
            row.reason = None
            row.last_seen_time = safe_now
            await db.commit()
            cls.invalidate_cache()
            return

        # If current row no longer has the same runtime reason, skip transition.
        # This happens when another worker has already installed/refreshed license.
        if current_reason != reason_code:
            cls.invalidate_cache()
            return

        should_emit = False
        event_type = "license.verify_failed"
        if reason_code == cls.CODE_EXPIRED:
            if row.status != "expired":
                row.status = "expired"
                row.reason = cls.CODE_EXPIRED
                should_emit = True
            event_type = "license.expired"
        elif reason_code == cls.CODE_TIME_ROLLBACK:
            if row.status != "invalid" or row.reason != cls.CODE_TIME_ROLLBACK:
                row.status = "invalid"
                row.reason = cls.CODE_TIME_ROLLBACK
                should_emit = True
            event_type = "license.verify_failed"
        elif reason_code == cls.CODE_REVOKED:
            if row.status != "invalid" or row.reason != cls.CODE_REVOKED:
                row.status = "invalid"
                row.reason = cls.CODE_REVOKED
                should_emit = True
            event_type = "license.verify_failed"
        else:
            return

        if safe_now is not None:
            row.last_seen_time = safe_now

        if not should_emit:
            await db.commit()
            cls.invalidate_cache()
            return

        detail_payload = row.payload or {}
        await cls._append_event(
            db,
            event_type=event_type,
            status="failed",
            reason=reason_code,
            payload=detail_payload,
            signature=row.signature,
            fingerprint=row.fingerprint,
            product_id=row.product_id,
            installation_id=row.installation_id,
            grant_type=row.grant_type,
            customer=row.customer,
            actor_id=actor_id,
            actor_username=actor_username,
            ip_address=cls._request_ip(request),
            trace_id=cls._request_trace_id(request),
        )
        await cls._append_business_audit(
            db,
            action=event_type,
            result="fail",
            reason=reason_code,
            detail={
                "product_id": row.product_id,
                "installation_id": row.installation_id,
                "grant_type": row.grant_type,
                "customer": row.customer,
                "status": row.status,
                "reason": row.reason,
            },
            actor_id=actor_id,
            actor_username=actor_username,
            request=request,
        )
        await db.commit()
        cls.invalidate_cache()

    @classmethod
    async def install_license(
        cls,
        db: AsyncSession,
        *,
        payload: dict[str, Any],
        signature: str,
        request: Optional[Request],
        actor_id: Optional[int],
        actor_username: Optional[str],
    ) -> dict[str, Any]:
        existing = await db.get(models.LicenseState, 1)
        legacy_state: Optional[models.LicenseState] = None
        if existing is None:
            result = await db.execute(select(models.LicenseState).order_by(models.LicenseState.id.desc()).limit(1))
            legacy_state = result.scalars().first()
        rollback_anchor = existing or legacy_state
        last_seen_time = rollback_anchor.last_seen_time if rollback_anchor else None
        now_utc = datetime.now(timezone.utc)

        try:
            verified = cls.verify_payload_signature_and_claims(
                payload=payload,
                signature=signature,
                last_seen_time=last_seen_time,
                system_now=now_utc,
            )
        except LicenseValidationError as e:
            # For rollback failure, current license must be marked invalid immediately.
            if e.code == cls.CODE_TIME_ROLLBACK and rollback_anchor is not None:
                rollback_anchor.status = "invalid"
                rollback_anchor.reason = cls.CODE_TIME_ROLLBACK
                rollback_anchor.last_seen_time = cls._ensure_utc(last_seen_time or now_utc)

            failure_event = "license.expired" if e.code == cls.CODE_EXPIRED else "license.verify_failed"
            await cls._append_event(
                db,
                event_type=failure_event,
                status="failed",
                reason=e.code,
                payload=payload if isinstance(payload, dict) else None,
                signature=signature,
                fingerprint=None,
                product_id=str(payload.get("product_id") or "") if isinstance(payload, dict) else None,
                installation_id=str(payload.get("installation_id") or "") if isinstance(payload, dict) else None,
                grant_type=str(payload.get("grant_type") or "") if isinstance(payload, dict) else None,
                customer=str(payload.get("customer") or "") if isinstance(payload, dict) else None,
                actor_id=actor_id,
                actor_username=actor_username,
                ip_address=cls._request_ip(request),
                trace_id=cls._request_trace_id(request),
            )
            await cls._append_business_audit(
                db,
                action=failure_event,
                result="fail",
                reason=e.code,
                detail={
                    "message": e.message,
                    "license_id": payload.get("license_id") if isinstance(payload, dict) else None,
                    "product_id": payload.get("product_id") if isinstance(payload, dict) else None,
                    "product_model": payload.get("product_model") if isinstance(payload, dict) else None,
                    "installation_id": payload.get("installation_id") if isinstance(payload, dict) else None,
                },
                actor_id=actor_id,
                actor_username=actor_username,
                request=request,
            )
            await db.commit()
            cls.invalidate_cache()
            raise HTTPException(
                status_code=e.status_code,
                detail={"code": e.code, "message": e.message},
            )

        state = existing or models.LicenseState(id=1)
        state.product_id = verified["product_id"]
        state.installation_id = verified["installation_id"]
        state.grant_type = verified["grant_type"]
        state.customer = verified["customer"]
        state.features = verified["features"]
        state.limits = verified["limits"]
        state.not_before = verified["not_before"]
        state.expires_at = verified["expires_at"]
        state.signature = verified["signature"]
        state.fingerprint = verified["fingerprint"]
        state.payload = verified["payload"]
        state.status = "active"
        state.reason = None
        state.last_seen_time = verified["safe_now"]

        db.add(state)
        await db.execute(delete(models.LicenseState).where(models.LicenseState.id != 1))
        await cls._append_event(
            db,
            event_type="license.install",
            status="success",
            reason=None,
            payload=verified["payload"],
            signature=verified["signature"],
            fingerprint=verified["fingerprint"],
            product_id=verified["product_id"],
            installation_id=verified["installation_id"],
            grant_type=verified["grant_type"],
            customer=verified["customer"],
            actor_id=actor_id,
            actor_username=actor_username,
            ip_address=cls._request_ip(request),
            trace_id=cls._request_trace_id(request),
        )
        await cls._append_business_audit(
            db,
            action="license.install",
            result="success",
            reason=None,
            detail={
                "license_id": verified["license_id"],
                "product_id": verified["product_id"],
                "product_model": verified["product_model"],
                "installation_id": verified["installation_id"],
                "grant_type": verified["grant_type"],
                "customer": verified["customer"],
                "expires_at": verified["expires_at"].isoformat(),
            },
            actor_id=actor_id,
            actor_username=actor_username,
            request=request,
        )
        await db.commit()
        cls.invalidate_cache()
        return cls._serialize_state(state)

    @classmethod
    async def install_revocation_list(
        cls,
        db: AsyncSession,
        *,
        payload: dict[str, Any],
        request: Optional[Request],
        actor_id: Optional[int],
        actor_username: Optional[str],
    ) -> dict[str, Any]:
        storage_path = (settings.LICENSE_REVOCATION_LIST_PATH or "").strip()
        if not storage_path:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "code": cls.CODE_REVOCATION_PATH_MISSING,
                    "message": "系统未配置吊销列表存储路径（LICENSE_REVOCATION_LIST_PATH）",
                },
            )

        normalized_payload: Optional[dict[str, Any]] = None
        try:
            normalized_payload = cls._normalize_revocation_payload(payload)
            target_path = Path(storage_path)
            target_path.parent.mkdir(parents=True, exist_ok=True)
            tmp_path = target_path.with_suffix(f"{target_path.suffix}.tmp")
            tmp_path.write_text(
                json.dumps(normalized_payload, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
            tmp_path.replace(target_path)
            cls._invalidate_revocation_cache()
        except LicenseValidationError as e:
            await cls._append_event(
                db,
                event_type="license.revocation.install",
                status="failed",
                reason=e.code,
                payload=payload if isinstance(payload, dict) else None,
                signature=None,
                fingerprint=None,
                product_id=(
                    str(payload.get("product_id") or "")
                    if isinstance(payload, dict)
                    else None
                ),
                installation_id=settings.INSTALLATION_ID,
                grant_type=None,
                customer=None,
                actor_id=actor_id,
                actor_username=actor_username,
                ip_address=cls._request_ip(request),
                trace_id=cls._request_trace_id(request),
            )
            await cls._append_business_audit(
                db,
                action="license.revocation.install",
                result="fail",
                reason=e.code,
                detail={
                    "product_id": payload.get("product_id") if isinstance(payload, dict) else None,
                    "message": e.message,
                },
                actor_id=actor_id,
                actor_username=actor_username,
                request=request,
            )
            await db.commit()
            raise HTTPException(status_code=e.status_code, detail={"code": e.code, "message": e.message})
        except Exception:
            await cls._append_event(
                db,
                event_type="license.revocation.install",
                status="failed",
                reason=cls.CODE_REVOCATION_WRITE_FAILED,
                payload=normalized_payload if isinstance(normalized_payload, dict) else None,
                signature=None,
                fingerprint=None,
                product_id=(
                    str(normalized_payload.get("product_id") or "")
                    if isinstance(normalized_payload, dict)
                    else settings.PRODUCT_ID
                ),
                installation_id=settings.INSTALLATION_ID,
                grant_type=None,
                customer=None,
                actor_id=actor_id,
                actor_username=actor_username,
                ip_address=cls._request_ip(request),
                trace_id=cls._request_trace_id(request),
            )
            await cls._append_business_audit(
                db,
                action="license.revocation.install",
                result="fail",
                reason=cls.CODE_REVOCATION_WRITE_FAILED,
                detail={
                    "product_id": (
                        normalized_payload.get("product_id")
                        if isinstance(normalized_payload, dict)
                        else settings.PRODUCT_ID
                    ),
                    "path": storage_path,
                },
                actor_id=actor_id,
                actor_username=actor_username,
                request=request,
            )
            await db.commit()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail={
                    "code": cls.CODE_REVOCATION_WRITE_FAILED,
                    "message": "吊销列表写入失败",
                },
            )

        await cls._append_event(
            db,
            event_type="license.revocation.install",
            status="success",
            reason=None,
            payload=normalized_payload,
            signature=None,
            fingerprint=None,
            product_id=normalized_payload["product_id"],
            installation_id=settings.INSTALLATION_ID,
            grant_type=None,
            customer=None,
            actor_id=actor_id,
            actor_username=actor_username,
            ip_address=cls._request_ip(request),
            trace_id=cls._request_trace_id(request),
        )
        await cls._append_business_audit(
            db,
            action="license.revocation.install",
            result="success",
            reason=None,
            detail={
                "product_id": normalized_payload["product_id"],
                "path": storage_path,
                "rev": normalized_payload.get("rev"),
                "revoked_count": len(normalized_payload.get("revoked") or []),
                "updated_at": normalized_payload.get("updated_at"),
            },
            actor_id=actor_id,
            actor_username=actor_username,
            request=request,
        )
        await db.commit()
        return {
            "installed": True,
            "path": storage_path,
            "product_id": normalized_payload["product_id"],
            "rev": int(normalized_payload.get("rev") or 0),
            "revoked_count": len(normalized_payload.get("revoked") or []),
            "updated_at": str(normalized_payload.get("updated_at") or ""),
        }

    @classmethod
    async def has_feature(cls, db: AsyncSession, feature: str) -> bool:
        state = await cls.get_current_state(db)
        runtime = await cls._evaluate_runtime_with_revocation(db, state)
        if not runtime["ok"]:
            state = await cls.get_current_state(db, force_refresh=True)
            runtime = await cls._evaluate_runtime_with_revocation(db, state)
        if not runtime["ok"]:
            if state and runtime["reason_code"] in {cls.CODE_EXPIRED, cls.CODE_TIME_ROLLBACK, cls.CODE_REVOKED}:
                await cls._mark_runtime_transition(
                    db,
                    state=state,
                    reason_code=runtime["reason_code"],
                    safe_now=runtime.get("safe_now"),
                    request=None,
                    actor_id=None,
                    actor_username=None,
                )
            return False

        assert state is not None
        await cls._touch_last_seen(db, state["id"], runtime["safe_now"])
        return cls._feature_enabled(state.get("features"), feature)

    @classmethod
    async def require_feature(cls, db: AsyncSession, feature: str) -> None:
        state = await cls.get_current_state(db)
        runtime = await cls._evaluate_runtime_with_revocation(db, state)
        if not runtime["ok"]:
            state = await cls.get_current_state(db, force_refresh=True)
            runtime = await cls._evaluate_runtime_with_revocation(db, state)
        reason_code = runtime.get("reason_code")
        if runtime["ok"] and state is not None and cls._feature_enabled(state.get("features"), feature):
            await cls._touch_last_seen(db, state["id"], runtime["safe_now"])
            return

        if state and reason_code in {cls.CODE_EXPIRED, cls.CODE_TIME_ROLLBACK, cls.CODE_REVOKED}:
            await cls._mark_runtime_transition(
                db,
                state=state,
                reason_code=reason_code,
                safe_now=runtime.get("safe_now"),
                request=None,
                actor_id=None,
                actor_username=None,
            )

        message = f"功能「{feature}」需要有效授权"
        if reason_code == cls.CODE_EXPIRED:
            message = f"功能「{feature}」需要有效授权（当前授权已过期）"
        elif reason_code == cls.CODE_TIME_ROLLBACK:
            message = f"功能「{feature}」因时间回拨保护被阻止"
        elif reason_code == cls.CODE_NOT_YET_VALID:
            message = f"功能「{feature}」对应授权尚未生效"
        elif reason_code == cls.CODE_MISSING:
            message = f"功能「{feature}」需要先安装授权许可"
        elif reason_code == cls.CODE_REVOKED:
            message = f"功能「{feature}」对应授权已被吊销"
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": cls.CODE_LICENSE_REQUIRED, "message": message, "reason": reason_code},
        )

    @classmethod
    async def get_limits(cls, db: AsyncSession) -> dict[str, Any]:
        state = await cls.get_current_state(db)
        runtime = await cls._evaluate_runtime_with_revocation(db, state)
        if not runtime["ok"] or state is None:
            return {}
        await cls._touch_last_seen(db, state["id"], runtime["safe_now"])
        limits = state.get("limits") or {}
        return dict(limits) if isinstance(limits, dict) else {}

    @classmethod
    async def get_access_policy(
        cls,
        db: AsyncSession,
        *,
        request: Optional[Request] = None,
    ) -> dict[str, Any]:
        """
        Runtime license gate policy for global API access control.
        Returns:
            {
              mode: "full" | "read_only" | "blocked",
              code: str,
              reason: Optional[str],
              message: str
            }
        """
        state = await cls.get_current_state(db)
        runtime = await cls._evaluate_runtime_with_revocation(db, state)
        if not runtime["ok"]:
            state = await cls.get_current_state(db, force_refresh=True)
            runtime = await cls._evaluate_runtime_with_revocation(db, state)
        reason_code = runtime.get("reason_code")

        if runtime["ok"] and state is not None:
            await cls._touch_last_seen(db, state["id"], runtime["safe_now"])
            return {
                "mode": "full",
                "code": "OK",
                "reason": None,
                "message": "授权生效中",
            }

        if state and reason_code in {cls.CODE_EXPIRED, cls.CODE_TIME_ROLLBACK, cls.CODE_REVOKED}:
            await cls._mark_runtime_transition(
                db,
                state=state,
                reason_code=reason_code,
                safe_now=runtime.get("safe_now"),
                request=request,
                actor_id=None,
                actor_username=None,
            )
            state = await cls.get_current_state(db, force_refresh=True)
            runtime = await cls._evaluate_runtime_with_revocation(db, state)
            reason_code = runtime.get("reason_code")

        if reason_code == cls.CODE_EXPIRED:
            return {
                "mode": "read_only",
                "code": cls.CODE_READ_ONLY,
                "reason": cls.CODE_EXPIRED,
                "message": "授权已到期，系统当前仅允许只读访问。",
            }

        if reason_code == cls.CODE_NOT_YET_VALID:
            message = "授权尚未生效，当前仅可访问授权许可功能。"
        elif reason_code == cls.CODE_TIME_ROLLBACK:
            message = "检测到系统时间回拨，授权已锁定，请校正系统时间并重新导入授权。"
        elif reason_code == cls.CODE_REVOKED:
            message = "当前授权已被吊销，请导入新的有效授权。"
        elif reason_code == cls.CODE_MISSING:
            message = "系统未安装授权许可，当前仅可访问授权许可功能。"
        else:
            message = "授权无效，当前仅可访问授权许可功能。"

        return {
            "mode": "blocked",
            "code": cls.CODE_LICENSE_REQUIRED,
            "reason": reason_code or "LICENSE_INACTIVE",
            "message": message,
        }

    @classmethod
    def _mask_signature(cls, signature: Optional[str]) -> str:
        if not signature:
            return ""
        text = signature.strip()
        if len(text) <= 16:
            return "*" * len(text)
        return f"{text[:8]}...{text[-6:]}"

    @classmethod
    async def get_license_status(
        cls,
        db: AsyncSession,
        *,
        request: Optional[Request] = None,
        actor_id: Optional[int] = None,
        actor_username: Optional[str] = None,
    ) -> dict[str, Any]:
        state = await cls.get_current_state(db)
        runtime = await cls._evaluate_runtime_with_revocation(db, state)
        if not runtime["ok"]:
            state = await cls.get_current_state(db, force_refresh=True)
            runtime = await cls._evaluate_runtime_with_revocation(db, state)
        if state is None:
            return {
                "installed": False,
                "status": "missing",
                "reason": cls.CODE_MISSING,
                "license_id": None,
                "product_id": settings.PRODUCT_ID,
                "product_model": settings.PRODUCT_MODEL,
                "installation_id": settings.INSTALLATION_ID,
                "grant_type": None,
                "customer": None,
                "installed_at": None,
                "not_before": None,
                "expires_at": None,
                "features_count": 0,
                "limits": {},
            }

        if not runtime["ok"] and runtime["reason_code"] in {cls.CODE_EXPIRED, cls.CODE_TIME_ROLLBACK, cls.CODE_REVOKED}:
            await cls._mark_runtime_transition(
                db,
                state=state,
                reason_code=runtime["reason_code"],
                safe_now=runtime.get("safe_now"),
                request=request,
                actor_id=actor_id,
                actor_username=actor_username,
            )
            state = await cls.get_current_state(db, force_refresh=True)
            runtime = await cls._evaluate_runtime_with_revocation(db, state)

        if runtime["ok"]:
            await cls._touch_last_seen(db, state["id"], runtime["safe_now"])

        features = state.get("features") if state else {}
        features_count = len(features) if isinstance(features, dict) else 0
        runtime_reason = None if runtime["ok"] else runtime.get("reason_code")
        if runtime["ok"]:
            runtime_status = "active"
        elif runtime_reason == cls.CODE_EXPIRED:
            runtime_status = "expired"
        elif runtime_reason == cls.CODE_MISSING:
            runtime_status = "missing"
        else:
            runtime_status = "invalid"
        return {
            "installed": True,
            "status": runtime_status,
            "reason": runtime_reason,
            "license_id": (
                (state.get("payload") or {}).get("license_id")
                if isinstance(state.get("payload"), dict)
                else None
            ),
            "product_id": state.get("product_id") if state else settings.PRODUCT_ID,
            "product_model": (
                (state.get("payload") or {}).get("product_model")
                if isinstance(state.get("payload"), dict)
                else settings.PRODUCT_MODEL
            ),
            # Always expose runtime installation id for UI/ops.
            # This is the real value used during license verification.
            "installation_id": settings.INSTALLATION_ID,
            "grant_type": state.get("grant_type") if state else None,
            "customer": state.get("customer") if state else None,
            "installed_at": state.get("installed_at") if state else None,
            "not_before": state.get("not_before") if state else None,
            "expires_at": state.get("expires_at") if state else None,
            "features_count": features_count,
            "limits": state.get("limits") if state else {},
        }

    @classmethod
    async def get_license_claims(
        cls,
        db: AsyncSession,
        *,
        request: Optional[Request] = None,
        actor_id: Optional[int] = None,
        actor_username: Optional[str] = None,
    ) -> dict[str, Any]:
        status_payload = await cls.get_license_status(
            db,
            request=request,
            actor_id=actor_id,
            actor_username=actor_username,
        )
        state = await cls.get_current_state(db, force_refresh=True)
        if state is None:
            return {"installed": False, "claims": None}

        payload = state.get("payload") if isinstance(state.get("payload"), dict) else {}
        claims = {
            "product_id": state.get("product_id"),
            "product_model": payload.get("product_model") if isinstance(payload, dict) else settings.PRODUCT_MODEL,
            "installation_id": state.get("installation_id"),
            "grant_type": state.get("grant_type"),
            "customer": state.get("customer"),
            "features": state.get("features") or {},
            "limits": state.get("limits") or {},
            "not_before": state.get("not_before"),
            "expires_at": state.get("expires_at"),
            "signature": cls._mask_signature(state.get("signature")),
            "fingerprint": state.get("fingerprint"),
            "status": state.get("status"),
            "reason": state.get("reason"),
            "claims_version": payload.get("version") if isinstance(payload, dict) else None,
        }
        return {"installed": True, "status": status_payload, "claims": claims}
