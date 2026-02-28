#!/usr/bin/env python3
import argparse
import base64
import hashlib
import json
import os
import re
import secrets
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

LICENSE_ID_PATTERN = re.compile(r"^HYX(?:-[A-Z0-9]{5}){5}$")
LICENSE_ID_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def generate_hyx_license_id() -> str:
    groups = ["".join(secrets.choice(LICENSE_ID_ALPHABET) for _ in range(5)) for _ in range(5)]
    return "HYX-" + "-".join(groups)


def normalize_license_id(license_id: str | None) -> str:
    if not license_id or not str(license_id).strip():
        return generate_hyx_license_id()
    value = str(license_id).strip().upper()
    if not LICENSE_ID_PATTERN.fullmatch(value):
        raise ValueError("license_id must match HYX-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX")
    return value


def canonical_json(payload: dict[str, Any]) -> str:
    # Canonicalization rule:
    # - UTF-8 encoded JSON
    # - sort_keys=True for deterministic key order
    # - separators without spaces
    # - ensure_ascii=False to preserve UTF-8 text
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def read_json(path: str) -> Any:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def write_json(path: str, data: Any) -> None:
    out = Path(path)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("utf-8").rstrip("=")


def b64url_decode(text: str) -> bytes:
    padded = text + "=" * (-len(text) % 4)
    return base64.urlsafe_b64decode(padded.encode("utf-8"))


def run_cmd(cmd: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, capture_output=True, text=True, check=False)


def openssl_sign(private_key_path: str, message: bytes) -> bytes:
    with tempfile.NamedTemporaryFile(prefix="ngep-license-msg-", delete=False) as f_msg:
        msg_path = f_msg.name
        f_msg.write(message)
    with tempfile.NamedTemporaryFile(prefix="ngep-license-sig-", delete=False) as f_sig:
        sig_path = f_sig.name

    try:
        proc = run_cmd(
            [
                "openssl",
                "pkeyutl",
                "-sign",
                "-inkey",
                private_key_path,
                "-rawin",
                "-in",
                msg_path,
                "-out",
                sig_path,
            ]
        )
        if proc.returncode != 0:
            err = (proc.stderr or proc.stdout or "").strip()
            raise RuntimeError(f"openssl sign failed: {err}")
        return Path(sig_path).read_bytes()
    finally:
        try:
            os.remove(msg_path)
        except Exception:
            pass
        try:
            os.remove(sig_path)
        except Exception:
            pass


def openssl_verify(public_key_path: str, message: bytes, signature: bytes) -> bool:
    with tempfile.NamedTemporaryFile(prefix="ngep-license-msg-", delete=False) as f_msg:
        msg_path = f_msg.name
        f_msg.write(message)
    with tempfile.NamedTemporaryFile(prefix="ngep-license-sig-", delete=False) as f_sig:
        sig_path = f_sig.name
        f_sig.write(signature)

    try:
        proc = run_cmd(
            [
                "openssl",
                "pkeyutl",
                "-verify",
                "-pubin",
                "-inkey",
                public_key_path,
                "-rawin",
                "-in",
                msg_path,
                "-sigfile",
                sig_path,
            ]
        )
        return proc.returncode == 0
    finally:
        try:
            os.remove(msg_path)
        except Exception:
            pass
        try:
            os.remove(sig_path)
        except Exception:
            pass


def parse_json_input(value: str | None, file_path: str | None, default: Any) -> Any:
    if value and file_path:
        raise ValueError("Use either JSON string option or file option, not both")
    if value:
        return json.loads(value)
    if file_path:
        return read_json(file_path)
    return default


def extract_fingerprint(payload: dict[str, Any], signature: str) -> str:
    canonical = canonical_json(payload)
    return hashlib.sha256(f"{canonical}.{signature}".encode("utf-8")).hexdigest()


def load_license_document(
    *,
    license_file: str | None = None,
    license_doc: dict[str, Any] | None = None,
) -> dict[str, Any]:
    if license_file and license_doc is not None:
        raise ValueError("Provide either license_file or license_doc, not both")
    if license_file:
        doc = read_json(license_file)
    elif license_doc is not None:
        doc = license_doc
    else:
        raise ValueError("license_file or license_doc is required")

    payload = doc.get("payload")
    signature = doc.get("signature")
    if not isinstance(payload, dict) or not isinstance(signature, str):
        raise ValueError("license file must contain object fields: payload, signature")
    return {"payload": payload, "signature": signature}


def generate_keypair(private_key_out: str, public_key_out: str) -> dict[str, str]:
    private_path = Path(private_key_out)
    public_path = Path(public_key_out)
    private_path.parent.mkdir(parents=True, exist_ok=True)
    public_path.parent.mkdir(parents=True, exist_ok=True)

    proc_private = run_cmd(
        [
            "openssl",
            "genpkey",
            "-algorithm",
            "Ed25519",
            "-out",
            str(private_path),
        ]
    )
    if proc_private.returncode != 0:
        err = (proc_private.stderr or proc_private.stdout or "").strip()
        raise RuntimeError(f"openssl genpkey failed: {err}")

    proc_public = run_cmd(
        [
            "openssl",
            "pkey",
            "-in",
            str(private_path),
            "-pubout",
            "-out",
            str(public_path),
        ]
    )
    if proc_public.returncode != 0:
        err = (proc_public.stderr or proc_public.stdout or "").strip()
        raise RuntimeError(f"openssl pubout failed: {err}")

    return {"private_key": str(private_path), "public_key": str(public_path)}


def build_license_payload(
    *,
    license_id: str | None,
    product_id: str,
    product_model: str,
    grant_type: str,
    customer: str,
    installation_id: str,
    issued_at: str | None,
    not_before: str | None,
    expires_at: str,
    edition: str,
    features: Any,
    limits_users: int,
    extra_limits: dict[str, Any] | None,
    rev: int,
) -> dict[str, Any]:
    if grant_type not in {"formal", "trial", "learning"}:
        raise ValueError("grant_type must be one of formal|trial|learning")
    if not isinstance(features, (dict, list)):
        raise ValueError("features must be JSON object or array")
    if extra_limits is not None and not isinstance(extra_limits, dict):
        raise ValueError("extra_limits must be JSON object")

    issued_at_value = issued_at or utc_now_iso()
    not_before_value = not_before or issued_at_value

    limits: dict[str, Any] = {"users": int(limits_users)}
    for k, v in (extra_limits or {}).items():
        limits[k] = v
    limits["users"] = int(limits_users)

    return {
        "license_id": normalize_license_id(license_id),
        "product_id": product_id,
        "product_model": product_model,
        "grant_type": grant_type,
        "customer": customer,
        "installation_id": installation_id,
        "issued_at": issued_at_value,
        "not_before": not_before_value,
        "expires_at": expires_at,
        "edition": edition,
        "features": features,
        "limits": limits,
        "rev": int(rev),
    }


def issue_license(
    *,
    private_key: str,
    payload: dict[str, Any],
    output: str | None = None,
) -> dict[str, Any]:
    canonical = canonical_json(payload)
    signature = b64url_encode(openssl_sign(private_key, canonical.encode("utf-8")))
    license_doc = {"payload": payload, "signature": signature}
    if output:
        write_json(output, license_doc)
    return {
        "license_doc": license_doc,
        "signature": signature,
        "fingerprint": extract_fingerprint(payload, signature),
        "output": output,
    }


def verify_license(
    *,
    public_key: str,
    license_doc: dict[str, Any],
) -> dict[str, Any]:
    loaded = load_license_document(license_doc=license_doc)
    payload = loaded["payload"]
    signature = loaded["signature"]
    canonical = canonical_json(payload)
    valid = openssl_verify(public_key, canonical.encode("utf-8"), b64url_decode(signature))
    return {
        "valid": valid,
        "payload": payload,
        "signature": signature,
        "fingerprint": extract_fingerprint(payload, signature),
    }


def show_license(
    *,
    license_doc: dict[str, Any],
) -> dict[str, Any]:
    loaded = load_license_document(license_doc=license_doc)
    payload = loaded["payload"]
    signature = loaded["signature"]
    return {
        "license_doc": {"payload": payload, "signature": signature},
        "canonical_payload": canonical_json(payload),
        "fingerprint": extract_fingerprint(payload, signature),
    }


def build_revoke_list(
    *,
    product_id: str,
    rev: int,
    reason: str,
    revoked_at: str | None,
    license_ids: list[str] | None,
    license_docs: list[dict[str, Any]] | None = None,
    output: str | None = None,
) -> dict[str, Any]:
    entries: list[dict[str, Any]] = []
    revoked_at_value = revoked_at or utc_now_iso()

    for license_id in license_ids or []:
        entries.append(
            {
                "license_id": license_id,
                "reason": reason,
                "revoked_at": revoked_at_value,
            }
        )

    for doc in license_docs or []:
        loaded = load_license_document(license_doc=doc)
        payload = loaded["payload"]
        signature = loaded["signature"]
        entries.append(
            {
                "license_id": payload.get("license_id"),
                "fingerprint": extract_fingerprint(payload, signature),
                "reason": reason,
                "revoked_at": revoked_at_value,
            }
        )

    revocation_list = {
        "product_id": product_id,
        "rev": int(rev),
        "updated_at": utc_now_iso(),
        "revoked": entries,
    }
    if output:
        write_json(output, revocation_list)
    return revocation_list


def cmd_gen_keypair(args: argparse.Namespace) -> int:
    result = generate_keypair(args.private_key_out, args.public_key_out)
    print(f"[ok] private key: {result['private_key']}")
    print(f"[ok] public key : {result['public_key']}")
    return 0


def cmd_issue(args: argparse.Namespace) -> int:
    features = parse_json_input(args.features_json, args.features_file, {})
    extra_limits = parse_json_input(args.limits_json, args.limits_file, {})
    payload = build_license_payload(
        license_id=args.license_id,
        product_id=args.product_id,
        product_model=args.product_model,
        grant_type=args.grant_type,
        customer=args.customer,
        installation_id=args.installation_id,
        issued_at=args.issued_at,
        not_before=args.not_before,
        expires_at=args.expires_at,
        edition=args.edition,
        features=features,
        limits_users=int(args.limits_users),
        extra_limits=extra_limits,
        rev=int(args.rev),
    )
    result = issue_license(private_key=args.private_key, payload=payload, output=args.output)
    print(f"[ok] license file: {args.output}")
    print(f"[ok] license_id : {payload['license_id']}")
    print(f"[ok] product_model: {payload['product_model']}")
    print(f"[ok] fingerprint: {result['fingerprint']}")
    return 0


def cmd_verify(args: argparse.Namespace) -> int:
    doc = load_license_document(license_file=args.license_file)
    result = verify_license(public_key=args.public_key, license_doc=doc)
    if not result["valid"]:
        print("[fail] signature verification failed")
        return 2
    payload = result["payload"]
    print("[ok] signature verification passed")
    print(f"[ok] license_id : {payload.get('license_id')}")
    print(f"[ok] product_id : {payload.get('product_id')}")
    print(f"[ok] product_model : {payload.get('product_model')}")
    print(f"[ok] grant_type : {payload.get('grant_type')}")
    print(f"[ok] expires_at : {payload.get('expires_at')}")
    print(f"[ok] fingerprint: {result['fingerprint']}")
    return 0


def cmd_show(args: argparse.Namespace) -> int:
    doc = load_license_document(license_file=args.license_file)
    shown = show_license(license_doc=doc)
    print(json.dumps(shown["license_doc"], ensure_ascii=False, indent=2))
    if args.canonical:
        print("\n# canonical_payload")
        print(shown["canonical_payload"])
    return 0


def cmd_revoke_list(args: argparse.Namespace) -> int:
    docs: list[dict[str, Any]] = []
    for path in args.license_files or []:
        docs.append(load_license_document(license_file=path))
    revocation_list = build_revoke_list(
        product_id=args.product_id,
        rev=int(args.rev),
        reason=args.reason,
        revoked_at=args.revoked_at,
        license_ids=args.license_ids or [],
        license_docs=docs,
        output=args.output,
    )
    print(f"[ok] revoke list file: {args.output}")
    print(f"[ok] revoked entries : {len(revocation_list['revoked'])}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="NGEP License Generator (Ed25519)")
    sub = parser.add_subparsers(dest="command", required=True)

    p_key = sub.add_parser("gen-keypair", help="Generate Ed25519 keypair (private/public PEM)")
    p_key.add_argument("--private-key-out", required=True, help="Output path for private key PEM")
    p_key.add_argument("--public-key-out", required=True, help="Output path for public key PEM")
    p_key.set_defaults(func=cmd_gen_keypair)

    p_issue = sub.add_parser("issue", help="Issue license file {payload, signature}")
    p_issue.add_argument("--private-key", required=True, help="Ed25519 private key PEM")
    p_issue.add_argument("--output", required=True, help="License output JSON path")
    p_issue.add_argument("--license-id", help="license_id (default auto: HYX-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX)")
    p_issue.add_argument("--product-id", default="enterprise-portal", help="product_id (default: enterprise-portal)")
    p_issue.add_argument("--product-model", default="NGEPv3.0-HYX-PS", help="product_model, e.g. NGEPv3.0-HYX-PS")
    p_issue.add_argument("--grant-type", required=True, choices=["formal", "trial", "learning"])
    p_issue.add_argument("--customer", required=True, help="Customer name")
    p_issue.add_argument("--installation-id", required=True, help="Target installation_id")
    p_issue.add_argument("--issued-at", help="ISO8601 UTC timestamp")
    p_issue.add_argument("--not-before", help="ISO8601 UTC timestamp")
    p_issue.add_argument("--expires-at", required=True, help="ISO8601 UTC timestamp")
    p_issue.add_argument("--edition", default="standard", help="Edition name")
    p_issue.add_argument("--features-json", help="JSON string for features")
    p_issue.add_argument("--features-file", help="Path to features JSON file")
    p_issue.add_argument("--limits-users", type=int, required=True, help="Licensed user limit")
    p_issue.add_argument("--limits-json", help="JSON string for extra limits")
    p_issue.add_argument("--limits-file", help="Path to extra limits JSON file")
    p_issue.add_argument("--rev", type=int, default=1, help="Revision number")
    p_issue.set_defaults(func=cmd_issue)

    p_verify = sub.add_parser("verify", help="Verify license signature with public key")
    p_verify.add_argument("--public-key", required=True, help="Ed25519 public key PEM")
    p_verify.add_argument("--license-file", required=True, help="License JSON file")
    p_verify.set_defaults(func=cmd_verify)

    p_show = sub.add_parser("show", help="Display license payload and signature")
    p_show.add_argument("--license-file", required=True, help="License JSON file")
    p_show.add_argument("--canonical", action="store_true", help="Print canonical payload string")
    p_show.set_defaults(func=cmd_show)

    p_revoke = sub.add_parser("revoke-list", help="Generate revocation list JSON")
    p_revoke.add_argument("--output", required=True, help="Revocation list output JSON path")
    p_revoke.add_argument("--product-id", required=True, help="product_id")
    p_revoke.add_argument("--license-id", dest="license_ids", action="append", help="Revoked license_id")
    p_revoke.add_argument(
        "--license-file",
        dest="license_files",
        action="append",
        help="Derive license_id/fingerprint from license file",
    )
    p_revoke.add_argument("--reason", default="manual_revoke", help="Revoke reason")
    p_revoke.add_argument("--revoked-at", help="ISO8601 UTC timestamp")
    p_revoke.add_argument("--rev", type=int, default=1, help="Revocation list revision")
    p_revoke.set_defaults(func=cmd_revoke_list)
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    try:
        return int(args.func(args))
    except Exception as exc:
        print(f"[error] {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
