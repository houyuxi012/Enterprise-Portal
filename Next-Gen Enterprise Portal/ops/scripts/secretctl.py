#!/usr/bin/env python3
from __future__ import annotations

import argparse
import ast
import base64
import os
import shlex
import subprocess
import sys
from pathlib import Path

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

DEFAULT_SECRETS_FILE = Path("/etc/portal/secrets.enc.yaml")
MASTER_KEY_NAME = "portal_master_key"
ENC_PREFIX = "ENC("
ENC_SUFFIX = ")"
ENC_VERSION = "v1"


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def _b64url_decode(value: str) -> bytes:
    padded = value + ("=" * (-len(value) % 4))
    return base64.urlsafe_b64decode(padded.encode("ascii"))


def parse_simple_yaml(path: Path) -> dict[str, str]:
    if not path.exists():
        raise RuntimeError(f"Secrets file does not exist: {path}")

    data: dict[str, str] = {}
    for lineno, raw_line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        stripped = raw_line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if raw_line[:1].isspace():
            raise RuntimeError(f"Unsupported nested YAML at {path}:{lineno}.")
        if ":" not in raw_line:
            raise RuntimeError(f"Invalid YAML mapping at {path}:{lineno}.")

        key, raw_value = raw_line.split(":", 1)
        key = key.strip()
        value = raw_value.strip()
        if not key:
            raise RuntimeError(f"Empty key at {path}:{lineno}.")
        if value[:1] in {"'", '"'}:
            try:
                value = ast.literal_eval(value)
            except Exception as exc:
                raise RuntimeError(f"Invalid quoted value at {path}:{lineno}: {exc}") from exc
        data[key] = str(value)
    return data


def dump_simple_yaml(path: Path, data: dict[str, str]) -> None:
    lines = [f"{key}: {value}" for key, value in data.items()]
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def _run_command(args: list[str], *, input_bytes: bytes | None = None) -> bytes:
    try:
        completed = subprocess.run(
            args,
            input=input_bytes,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=True,
        )
    except FileNotFoundError as exc:
        raise RuntimeError(f"Required command is not installed: {args[0]}") from exc
    except subprocess.CalledProcessError as exc:
        stderr = exc.stderr.decode("utf-8", errors="ignore").strip()
        raise RuntimeError(f"Command failed: {' '.join(args)}: {stderr}") from exc
    return completed.stdout


def _normalize_master_key(raw_value: bytes) -> bytes:
    if len(raw_value) == 32:
        return raw_value

    text = raw_value.decode("utf-8", errors="ignore").strip()
    if not text:
        raise RuntimeError("Master key is empty.")

    try:
        decoded = _b64url_decode(text)
        if len(decoded) == 32:
            return decoded
    except Exception:
        pass

    try:
        decoded = bytes.fromhex(text)
        if len(decoded) == 32:
            return decoded
    except ValueError:
        pass

    raise RuntimeError(
        "Master key must be 32 raw bytes, 32-byte base64url, or 32-byte hex. "
        "Refusing to derive a key from an arbitrary passphrase."
    )


def _keyctl_search() -> str | None:
    try:
        stdout = _run_command(["keyctl", "search", "@s", "user", MASTER_KEY_NAME])
    except RuntimeError as exc:
        if "Required command is not installed" in str(exc):
            raise
        return None
    key_id = stdout.decode("utf-8", errors="ignore").strip()
    return key_id or None


def _keyctl_pipe(key_id: str) -> bytes:
    return _run_command(["keyctl", "pipe", key_id])


def _keyctl_add(secret: bytes) -> None:
    _run_command(["keyctl", "padd", "user", MASTER_KEY_NAME, "@s"], input_bytes=secret)


def _unseal_from_tpm2() -> bytes | None:
    context = str(os.getenv("PORTAL_TPM2_CONTEXT_FILE") or "").strip()
    if not context:
        return None

    args = ["tpm2_unseal", "-c", context]
    auth = str(os.getenv("PORTAL_TPM2_AUTH") or "").strip()
    if auth:
        args.extend(["-p", auth])

    extra = str(os.getenv("PORTAL_TPM2_UNSEAL_ARGS") or "").strip()
    if extra:
        args.extend(shlex.split(extra))
    return _run_command(args)


def load_master_key() -> bytes:
    key_id = _keyctl_search()
    if key_id:
        return _normalize_master_key(_keyctl_pipe(key_id))

    unsealed = _unseal_from_tpm2()
    if unsealed is not None:
        _keyctl_add(unsealed)
        key_id = _keyctl_search()
        if key_id:
            return _normalize_master_key(_keyctl_pipe(key_id))

    raise RuntimeError(
        "Master key not found in Linux keyring. "
        "Load portal_master_key into keyctl @s first, or configure TPM2 unseal via PORTAL_TPM2_CONTEXT_FILE."
    )


def encode_encrypted_value(plain_text: str, *, master_key: bytes | None = None) -> str:
    key = master_key or load_master_key()
    nonce = os.urandom(12)
    cipher = AESGCM(key).encrypt(nonce, plain_text.encode("utf-8"), None)
    payload = _b64url_encode(nonce + cipher)
    return f"{ENC_PREFIX}{ENC_VERSION}:{payload}{ENC_SUFFIX}"


def decode_encrypted_value(cipher_text: str, *, master_key: bytes | None = None) -> str:
    text = str(cipher_text or "").strip()
    if not text.startswith(ENC_PREFIX) or not text.endswith(ENC_SUFFIX):
        raise RuntimeError("Ciphertext must use ENC(v1:...) format.")

    inner = text[len(ENC_PREFIX) : -len(ENC_SUFFIX)]
    try:
        version, payload = inner.split(":", 1)
    except ValueError as exc:
        raise RuntimeError("Ciphertext must use ENC(v1:...) format.") from exc
    if version != ENC_VERSION:
        raise RuntimeError(f"Unsupported ciphertext version: {version}")

    blob = _b64url_decode(payload)
    if len(blob) < 13:
        raise RuntimeError("Ciphertext payload is too short.")
    nonce = blob[:12]
    cipher = blob[12:]
    key = master_key or load_master_key()
    plain = AESGCM(key).decrypt(nonce, cipher, None)
    return plain.decode("utf-8")


def get_secret_value(key: str, *, secrets_file: Path | None = None) -> str:
    requested = str(key or "").strip()
    if not requested:
        raise RuntimeError("KEY is required.")
    if requested == "master_key":
        return _b64url_encode(load_master_key())

    secrets_path = secrets_file or Path(os.getenv("PORTAL_SECRETS_FILE") or DEFAULT_SECRETS_FILE)
    values = parse_simple_yaml(secrets_path)
    if requested not in values:
        raise RuntimeError(f"Secret key '{requested}' not found in {secrets_path}.")

    value = values[requested]
    return decode_encrypted_value(value) if value.startswith(ENC_PREFIX) else value


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="secretctl")
    parser.add_argument(
        "--secrets-file",
        default=os.getenv("PORTAL_SECRETS_FILE") or str(DEFAULT_SECRETS_FILE),
        help="Path to encrypted YAML secrets file.",
    )

    subparsers = parser.add_subparsers(dest="command", required=True)

    enc = subparsers.add_parser("enc", help="Encrypt plaintext into ENC(...) format.")
    enc.add_argument("text")

    dec = subparsers.add_parser("dec", help="Decrypt ENC(...) ciphertext.")
    dec.add_argument("ciphertext")

    get = subparsers.add_parser("get", help="Decrypt a value from secrets.enc.yaml by key.")
    get.add_argument("key")

    subparsers.add_parser("master-key", help="Print the active master key as base64url.")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    secrets_file = Path(args.secrets_file)

    if args.command == "enc":
        print(encode_encrypted_value(args.text))
        return 0
    if args.command == "dec":
        print(decode_encrypted_value(args.ciphertext))
        return 0
    if args.command == "get":
        print(get_secret_value(args.key, secrets_file=secrets_file))
        return 0
    if args.command == "master-key":
        print(_b64url_encode(load_master_key()))
        return 0

    parser.error(f"Unsupported command: {args.command}")
    return 2


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except RuntimeError as exc:
        print(f"secretctl: {exc}", file=sys.stderr)
        raise SystemExit(1)
