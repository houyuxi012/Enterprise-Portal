import os
import sys
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException

# Ensure backend modules are importable in both old/new repo layouts.
_repo_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
for _candidate in (
    os.path.join(_repo_root, "Next-Gen Enterprise Portal", "backend"),
    os.path.join(_repo_root, "code", "backend"),
    os.path.join(_repo_root, "backend"),
    _repo_root,
):
    if os.path.isdir(_candidate) and _candidate not in sys.path:
        sys.path.append(_candidate)

from modules.admin.services.license_service import LicenseService, LicenseValidationError
from modules.admin.services.license_settings import settings


class _NoopPublicKey:
    def verify(self, signature: bytes, payload: bytes) -> None:
        return None


def _mock_signature_verifier(monkeypatch):
    monkeypatch.setattr(LicenseService, "_decode_signature", classmethod(lambda cls, _: b"sig"))
    monkeypatch.setattr(
        LicenseService,
        "_load_public_keyring",
        classmethod(lambda cls: {"default": _NoopPublicKey()}),
    )


@pytest.fixture(autouse=True)
def _reset_license_service_cache():
    LicenseService.invalidate_cache()
    yield
    LicenseService.invalidate_cache()


@pytest.mark.asyncio
async def test_require_feature_rejects_when_license_missing(monkeypatch):
    async def _fake_get_current_state(cls, db, force_refresh: bool = False):
        return None

    monkeypatch.setattr(LicenseService, "get_current_state", classmethod(_fake_get_current_state))

    with pytest.raises(HTTPException) as exc_info:
        await LicenseService.require_feature(db=None, feature="ldap")

    assert exc_info.value.status_code == 403
    assert exc_info.value.detail["code"] == LicenseService.CODE_LICENSE_REQUIRED
    assert exc_info.value.detail["reason"] == LicenseService.CODE_MISSING


@pytest.mark.asyncio
async def test_require_feature_rejects_when_license_expired(monkeypatch):
    now = datetime.now(timezone.utc)
    expired_state = {
        "id": 1,
        "features": {"ldap": True},
        "not_before": now - timedelta(days=2),
        "expires_at": now - timedelta(minutes=1),
        "status": "active",
        "reason": None,
        "last_seen_time": now - timedelta(minutes=2),
    }

    async def _fake_get_current_state(cls, db, force_refresh: bool = False):
        return expired_state

    async def _fake_mark_transition(
        cls,
        db,
        *,
        state,
        reason_code: str,
        safe_now,
        request,
        actor_id,
        actor_username,
    ):
        return None

    monkeypatch.setattr(LicenseService, "get_current_state", classmethod(_fake_get_current_state))
    monkeypatch.setattr(
        LicenseService,
        "_mark_runtime_transition",
        classmethod(_fake_mark_transition),
    )

    with pytest.raises(HTTPException) as exc_info:
        await LicenseService.require_feature(db=None, feature="ldap")

    assert exc_info.value.status_code == 403
    assert exc_info.value.detail["code"] == LicenseService.CODE_LICENSE_REQUIRED
    assert exc_info.value.detail["reason"] == LicenseService.CODE_EXPIRED


def test_verify_payload_rejects_installation_id_mismatch(monkeypatch):
    now = datetime.now(timezone.utc)
    monkeypatch.setattr(settings, "PRODUCT_ID", "enterprise-portal", raising=False)
    monkeypatch.setattr(settings, "PRODUCT_MODEL", "NGEPv3.0-HYX-PS", raising=False)
    monkeypatch.setattr(settings, "INSTALLATION_ID", "install-a", raising=False)

    _mock_signature_verifier(monkeypatch)

    payload = {
        "license_id": "HYX-ABCDE-FGHIJ-KLMNO-PQRST-UVWXY",
        "product_id": "enterprise-portal",
        "product_model": "NGEPv3.0-HYX-PS",
        "installation_id": "install-b",
        "grant_type": "formal",
        "customer": "ACME",
        "features": {"ldap": True},
        "limits": {"users": 100},
        "not_before": (now - timedelta(minutes=5)).isoformat(),
        "expires_at": (now + timedelta(days=30)).isoformat(),
    }

    with pytest.raises(LicenseValidationError) as exc_info:
        LicenseService.verify_payload_signature_and_claims(payload=payload, signature="signature")

    assert exc_info.value.code == LicenseService.CODE_INSTALLATION_MISMATCH


def test_verify_payload_rejects_product_model_mismatch(monkeypatch):
    now = datetime.now(timezone.utc)
    monkeypatch.setattr(settings, "PRODUCT_ID", "enterprise-portal", raising=False)
    monkeypatch.setattr(settings, "PRODUCT_MODEL", "NGEPv3.0-HYX-PS", raising=False)
    monkeypatch.setattr(settings, "INSTALLATION_ID", "install-a", raising=False)

    _mock_signature_verifier(monkeypatch)

    payload = {
        "license_id": "HYX-AAAAA-BBBBB-CCCCC-DDDDD-EEEEE",
        "product_id": "enterprise-portal",
        "product_model": "NGEPv2.0-OLD",
        "installation_id": "install-a",
        "grant_type": "formal",
        "customer": "ACME",
        "features": {"ldap": True},
        "limits": {"users": 100},
        "not_before": (now - timedelta(minutes=5)).isoformat(),
        "expires_at": (now + timedelta(days=30)).isoformat(),
    }

    with pytest.raises(LicenseValidationError) as exc_info:
        LicenseService.verify_payload_signature_and_claims(payload=payload, signature="signature")

    assert exc_info.value.code == LicenseService.CODE_PRODUCT_MODEL_MISMATCH


def test_verify_payload_rejects_time_rollback(monkeypatch):
    now = datetime.now(timezone.utc)
    monkeypatch.setattr(settings, "PRODUCT_ID", "enterprise-portal", raising=False)
    monkeypatch.setattr(settings, "PRODUCT_MODEL", "NGEPv3.0-HYX-PS", raising=False)
    monkeypatch.setattr(settings, "INSTALLATION_ID", "install-a", raising=False)
    monkeypatch.setattr(settings, "LICENSE_TIME_ROLLBACK_GRACE_SECONDS", 600, raising=False)

    _mock_signature_verifier(monkeypatch)

    payload = {
        "license_id": "HYX-11111-22222-33333-44444-55555",
        "product_id": "enterprise-portal",
        "product_model": "NGEPv3.0-HYX-PS",
        "installation_id": "install-a",
        "grant_type": "formal",
        "customer": "ACME",
        "features": {"ldap": True},
        "limits": {"users": 100},
        "not_before": (now - timedelta(minutes=5)).isoformat(),
        "expires_at": (now + timedelta(days=30)).isoformat(),
    }

    with pytest.raises(LicenseValidationError) as exc_info:
        LicenseService.verify_payload_signature_and_claims(
            payload=payload,
            signature="signature",
            last_seen_time=now + timedelta(minutes=20),
            system_now=now,
        )

    assert exc_info.value.code == LicenseService.CODE_TIME_ROLLBACK


def test_verify_payload_rejects_invalid_license_id_format(monkeypatch):
    now = datetime.now(timezone.utc)
    monkeypatch.setattr(settings, "PRODUCT_ID", "enterprise-portal", raising=False)
    monkeypatch.setattr(settings, "PRODUCT_MODEL", "NGEPv3.0-HYX-PS", raising=False)
    monkeypatch.setattr(settings, "INSTALLATION_ID", "install-a", raising=False)

    _mock_signature_verifier(monkeypatch)

    payload = {
        "license_id": "LIC-EP-2026-DEMO",
        "product_id": "enterprise-portal",
        "product_model": "NGEPv3.0-HYX-PS",
        "installation_id": "install-a",
        "grant_type": "formal",
        "customer": "ACME",
        "features": {"ldap": True},
        "limits": {"users": 100},
        "not_before": (now - timedelta(minutes=5)).isoformat(),
        "expires_at": (now + timedelta(days=30)).isoformat(),
    }

    with pytest.raises(LicenseValidationError) as exc_info:
        LicenseService.verify_payload_signature_and_claims(payload=payload, signature="signature")

    assert exc_info.value.code == LicenseService.CODE_INVALID_PAYLOAD


def test_verify_payload_rejects_revoked_license(monkeypatch):
    now = datetime.now(timezone.utc)
    monkeypatch.setattr(settings, "PRODUCT_ID", "enterprise-portal", raising=False)
    monkeypatch.setattr(settings, "PRODUCT_MODEL", "NGEPv3.0-HYX-PS", raising=False)
    monkeypatch.setattr(settings, "INSTALLATION_ID", "install-a", raising=False)

    _mock_signature_verifier(monkeypatch)
    monkeypatch.setattr(
        LicenseService,
        "_load_revocation_list",
        classmethod(
            lambda cls: {
                "product_id": "enterprise-portal",
                "license_ids": {"HYX-ABCDE-FGHIJ-KLMNO-PQRST-UVWXY"},
                "fingerprints": set(),
                "rev": 1,
            }
        ),
    )

    payload = {
        "license_id": "HYX-ABCDE-FGHIJ-KLMNO-PQRST-UVWXY",
        "product_id": "enterprise-portal",
        "product_model": "NGEPv3.0-HYX-PS",
        "installation_id": "install-a",
        "grant_type": "formal",
        "customer": "ACME",
        "features": {"ldap": True},
        "limits": {"users": 100},
        "not_before": (now - timedelta(minutes=5)).isoformat(),
        "expires_at": (now + timedelta(days=30)).isoformat(),
    }

    with pytest.raises(LicenseValidationError) as exc_info:
        LicenseService.verify_payload_signature_and_claims(payload=payload, signature="signature")

    assert exc_info.value.code == LicenseService.CODE_REVOKED
