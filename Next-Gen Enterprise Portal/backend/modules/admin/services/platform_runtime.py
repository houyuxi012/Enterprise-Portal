import json
import ipaddress
import logging
import os
import re
import socket
import ssl
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict
from urllib.parse import urlparse

from cryptography import x509


logger = logging.getLogger(__name__)

_DOMAIN_RE = re.compile(
    r"^(?:\*\.)?[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$"
)


class PlatformRuntimeApplyError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def _as_bool(value: Any, default: bool = False) -> bool:
    if value is None:
        return default
    text = str(value).strip().lower()
    if text == "":
        return default
    return text in {"1", "true", "yes", "on", "enabled"}


def _ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def _write_text(path: Path, content: str, mode: int) -> None:
    _ensure_parent(path)
    path.write_text(content, encoding="utf-8")
    os.chmod(path, mode)


def _write_json(path: Path, payload: Dict[str, Any]) -> None:
    _ensure_parent(path)
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def _normalize_pem(content: str) -> str:
    return f"{content.strip()}\n"


def _restore_default_ssl_files(
    cert_path: Path,
    key_path: Path,
    default_cert_path: Path,
    default_key_path: Path,
) -> None:
    try:
        default_cert = default_cert_path.read_text(encoding="utf-8")
        default_key = default_key_path.read_text(encoding="utf-8")
    except FileNotFoundError as exc:
        raise PlatformRuntimeApplyError(
            "SSL_DEFAULT_CERT_MISSING",
            "默认证书文件缺失，无法回退到默认证书",
        ) from exc

    cert_pem = _normalize_pem(default_cert)
    key_pem = _normalize_pem(default_key)
    _validate_ssl_certificate(cert_pem)
    _validate_ssl_key(key_pem)
    _write_text(cert_path, cert_pem, mode=0o644)
    _write_text(key_path, key_pem, mode=0o600)


def _validate_server_name(domain: str) -> str:
    candidate = str(domain or "").strip()
    if not candidate:
        return "_"
    if not _DOMAIN_RE.fullmatch(candidate):
        raise PlatformRuntimeApplyError(
            "PLATFORM_DOMAIN_INVALID",
            "平台域名格式不合法",
        )
    return candidate


def _validate_ssl_certificate(cert_pem: str) -> None:
    try:
        ssl.PEM_cert_to_DER_cert(cert_pem)
    except Exception as exc:
        raise PlatformRuntimeApplyError(
            "SSL_CERT_INVALID",
            "SSL 证书内容不合法，请使用有效 PEM 证书",
        ) from exc


def _validate_ssl_key(key_pem: str) -> None:
    text = key_pem.strip()
    key_headers = (
        "-----BEGIN PRIVATE KEY-----",
        "-----BEGIN RSA PRIVATE KEY-----",
        "-----BEGIN EC PRIVATE KEY-----",
    )
    if not any(text.startswith(header) for header in key_headers):
        raise PlatformRuntimeApplyError(
            "SSL_KEY_INVALID",
            "SSL 私钥内容不合法，请使用有效 PEM 私钥",
        )
    if "-----END" not in text:
        raise PlatformRuntimeApplyError(
            "SSL_KEY_INVALID",
            "SSL 私钥内容不完整",
        )


def _extract_host_from_url(raw: str) -> str:
    value = str(raw or "").strip()
    if not value:
        return ""
    parsed = urlparse(value)
    host = (parsed.hostname or "").strip()
    return host.lower()


def _normalize_server_names(
    platform_domain: str,
    public_base_url: str,
    admin_base_url: str,
) -> list[str]:
    candidates = [
        str(platform_domain or "").strip().lower(),
        _extract_host_from_url(public_base_url),
        _extract_host_from_url(admin_base_url),
    ]
    deduped: list[str] = []
    for candidate in candidates:
        if not candidate:
            continue
        validated = _validate_server_name(candidate).lower()
        if validated not in deduped:
            deduped.append(validated)
    if not deduped:
        return ["_"]
    return deduped


def _dns_name_matches(pattern: str, hostname: str) -> bool:
    p = pattern.lower().strip()
    h = hostname.lower().strip()
    if not p or not h:
        return False
    if p == h:
        return True
    if p.startswith("*."):
        suffix = p[1:]  # ".example.com"
        if h.endswith(suffix):
            prefix = h[: -len(suffix)]
            return "." not in prefix and prefix != ""
    return False


def _validate_certificate_matches_hosts(cert_pem: str, hosts: list[str]) -> None:
    if not hosts:
        return
    try:
        cert = x509.load_pem_x509_certificate(cert_pem.encode("utf-8"))
    except Exception as exc:
        raise PlatformRuntimeApplyError(
            "SSL_CERT_INVALID",
            "SSL 证书内容不合法，请使用有效 PEM 证书",
        ) from exc

    dns_names: list[str] = []
    ip_names: list[str] = []
    try:
        san = cert.extensions.get_extension_for_class(x509.SubjectAlternativeName).value
        dns_names = [name.lower() for name in san.get_values_for_type(x509.DNSName)]
        ip_names = [str(addr) for addr in san.get_values_for_type(x509.IPAddress)]
    except x509.ExtensionNotFound:
        dns_names = []
        ip_names = []

    unmatched: list[str] = []
    for host in hosts:
        try:
            ipaddress.ip_address(host)
            if host not in ip_names:
                unmatched.append(host)
            continue
        except ValueError:
            pass

        if any(_dns_name_matches(pattern, host) for pattern in dns_names):
            continue
        unmatched.append(host)

    if unmatched:
        raise PlatformRuntimeApplyError(
            "SSL_CERT_DOMAIN_MISMATCH",
            "证书域名与平台域名不匹配，请确保证书 SAN 包含: " + ", ".join(unmatched),
        )


def test_ntp_connectivity(server: str, port: int, timeout_seconds: float = 3.0) -> Dict[str, Any]:
    host = str(server or "").strip()
    if not host:
        raise PlatformRuntimeApplyError(
            "NTP_SERVER_REQUIRED",
            "NTP 服务器不能为空",
        )
    if port < 1 or port > 65535:
        raise PlatformRuntimeApplyError(
            "NTP_PORT_INVALID",
            "NTP 端口范围必须在 1-65535",
        )

    packet = bytearray(48)
    packet[0] = 0x1B  # LI=0, VN=3, Mode=3(client)

    try:
        addresses = socket.getaddrinfo(host, port, type=socket.SOCK_DGRAM)
    except socket.gaierror as exc:
        raise PlatformRuntimeApplyError(
            "NTP_DNS_RESOLVE_FAILED",
            f"NTP 服务器地址解析失败: {host}",
        ) from exc

    last_error: Exception | None = None
    for family, socktype, proto, _, sockaddr in addresses:
        try:
            with socket.socket(family, socktype, proto) as sock:
                sock.settimeout(timeout_seconds)
                start = time.monotonic()
                sock.sendto(packet, sockaddr)
                response, _ = sock.recvfrom(512)
                latency_ms = int((time.monotonic() - start) * 1000)
                if len(response) < 48:
                    raise PlatformRuntimeApplyError(
                        "NTP_RESPONSE_INVALID",
                        "NTP 服务器响应格式无效",
                    )
                mode = response[0] & 0x07
                if mode not in (4, 5):
                    raise PlatformRuntimeApplyError(
                        "NTP_RESPONSE_INVALID",
                        "NTP 服务器响应模式无效",
                    )
                return {
                    "server": host,
                    "port": port,
                    "latency_ms": latency_ms,
                    "stratum": int(response[1]),
                }
        except PlatformRuntimeApplyError:
            raise
        except Exception as exc:
            last_error = exc
            continue

    if isinstance(last_error, socket.timeout):
        raise PlatformRuntimeApplyError(
            "NTP_TIMEOUT",
            f"NTP 连通性测试超时（{timeout_seconds}s）",
        ) from last_error
    raise PlatformRuntimeApplyError(
        "NTP_CONNECTIVITY_FAILED",
        "NTP 连通性测试失败，请检查地址、端口与网络策略",
    ) from last_error


def apply_platform_runtime(config_map: Dict[str, str]) -> Dict[str, Any]:
    nginx_root = Path(os.getenv("PLATFORM_NGINX_ROOT", "/app/ops/nginx"))
    cert_path = Path(
        os.getenv(
            "PLATFORM_SSL_CERT_FILE",
            str(nginx_root / "certs" / "hyx_ngep.cer"),
        )
    )
    key_path = Path(
        os.getenv(
            "PLATFORM_SSL_KEY_FILE",
            str(nginx_root / "certs" / "hyx_ngep.key"),
        )
    )
    default_cert_path = Path(
        os.getenv(
            "PLATFORM_SSL_DEFAULT_CERT_FILE",
            str(nginx_root / "certs" / "default" / "hyx_ngep.cer"),
        )
    )
    default_key_path = Path(
        os.getenv(
            "PLATFORM_SSL_DEFAULT_KEY_FILE",
            str(nginx_root / "certs" / "default" / "hyx_ngep.key"),
        )
    )
    server_name_path = Path(
        os.getenv(
            "PLATFORM_SERVER_NAME_FILE",
            str(nginx_root / "conf.d" / "platform_server_name.conf"),
        )
    )
    snmp_runtime_path = Path(
        os.getenv("PLATFORM_SNMP_RUNTIME_FILE", "/app/runtime/platform/snmp.json")
    )
    ntp_runtime_path = Path(
        os.getenv("PLATFORM_NTP_RUNTIME_FILE", "/app/runtime/platform/ntp.json")
    )

    platform_domain = str(config_map.get("platform_domain") or "").strip()
    platform_public_base_url = str(config_map.get("platform_public_base_url") or "").strip()
    platform_admin_base_url = str(config_map.get("platform_admin_base_url") or "").strip()
    server_names = _normalize_server_names(
        platform_domain=platform_domain,
        public_base_url=platform_public_base_url,
        admin_base_url=platform_admin_base_url,
    )
    ssl_enabled = _as_bool(config_map.get("platform_ssl_enabled"), default=False)
    cert_content = str(config_map.get("platform_ssl_certificate") or "").strip()
    key_content = str(config_map.get("platform_ssl_private_key") or "").strip()
    custom_ssl_enabled = ssl_enabled and bool(cert_content) and bool(key_content)

    applied_at = datetime.now(timezone.utc)

    server_name_line = f"server_name {' '.join(server_names)};\n"
    _write_text(server_name_path, server_name_line, mode=0o644)

    ssl_applied = False
    if custom_ssl_enabled:
        cert_pem = _normalize_pem(cert_content)
        key_pem = _normalize_pem(key_content)
        _validate_ssl_certificate(cert_pem)
        _validate_ssl_key(key_pem)
        _validate_certificate_matches_hosts(cert_pem, [name for name in server_names if name != "_"])
        _write_text(cert_path, cert_pem, mode=0o644)
        _write_text(key_path, key_pem, mode=0o600)
        ssl_applied = True
    else:
        # When custom SSL is disabled or cert/key is cleared, fall back to bundled default cert/key.
        _restore_default_ssl_files(
            cert_path=cert_path,
            key_path=key_path,
            default_cert_path=default_cert_path,
            default_key_path=default_key_path,
        )

    snmp_enabled = _as_bool(config_map.get("platform_snmp_enabled"), default=False)
    snmp_host = str(config_map.get("platform_snmp_host") or "").strip()
    snmp_port = int(str(config_map.get("platform_snmp_port") or "162"))
    snmp_version = str(config_map.get("platform_snmp_version") or "v2c").strip().lower()
    snmp_community = str(config_map.get("platform_snmp_community") or "").strip()
    if snmp_enabled and not snmp_host:
        raise PlatformRuntimeApplyError(
            "SNMP_HOST_REQUIRED",
            "启用 SNMP 时，目标地址不能为空",
        )
    _write_json(
        snmp_runtime_path,
        {
            "enabled": snmp_enabled,
            "host": snmp_host,
            "port": snmp_port,
            "version": snmp_version,
            "community_configured": bool(snmp_community),
            "updated_at": applied_at.isoformat(),
        },
    )

    ntp_enabled = _as_bool(config_map.get("platform_ntp_enabled"), default=False)
    ntp_server = str(config_map.get("platform_ntp_server") or "").strip()
    ntp_port = int(str(config_map.get("platform_ntp_port") or "123"))
    ntp_sync_interval_minutes = int(
        str(config_map.get("platform_ntp_sync_interval_minutes") or "60")
    )
    if ntp_enabled and not ntp_server:
        raise PlatformRuntimeApplyError(
            "NTP_SERVER_REQUIRED",
            "启用 NTP 时，NTP 服务器不能为空",
        )
    _write_json(
        ntp_runtime_path,
        {
            "enabled": ntp_enabled,
            "server": ntp_server,
            "port": ntp_port,
            "sync_interval_minutes": ntp_sync_interval_minutes,
            "updated_at": applied_at.isoformat(),
        },
    )

    hook_command = str(os.getenv("PLATFORM_APPLY_HOOK") or "").strip()
    hook_timeout_seconds = int(str(os.getenv("PLATFORM_APPLY_HOOK_TIMEOUT", "20")))
    auto_reload_enabled = _as_bool(os.getenv("PLATFORM_AUTO_RELOAD"), default=False)
    hook_status = "not_configured"
    hook_output = ""
    reload_required = True

    if hook_command:
        try:
            completed = subprocess.run(
                hook_command,
                shell=True,
                capture_output=True,
                text=True,
                timeout=hook_timeout_seconds,
            )
            output = (completed.stdout or "") + ("\n" + completed.stderr if completed.stderr else "")
            hook_output = output.strip()[:1000]
            if completed.returncode == 0:
                hook_status = "success"
                reload_required = False
            else:
                hook_status = "failed"
                reload_required = True
        except subprocess.TimeoutExpired:
            hook_status = "timeout"
            hook_output = "apply hook timeout"
            reload_required = True
        except Exception as exc:
            hook_status = "error"
            hook_output = str(exc)[:1000]
            reload_required = True
            logger.warning("Platform apply hook execution failed: %s", exc)
    elif auto_reload_enabled:
        hook_status = "auto_watch"
        hook_output = "frontend watcher will reload nginx automatically"
        reload_required = False

    return {
        "status": "success",
        "message": "平台配置已应用到运行时文件",
        "applied_at": applied_at.isoformat(),
        "server_name": " ".join(server_names),
        "ssl_enabled": custom_ssl_enabled,
        "ssl_applied": ssl_applied,
        "ssl_mode": "custom" if custom_ssl_enabled else "default",
        "snmp_enabled": snmp_enabled,
        "ntp_enabled": ntp_enabled,
        "reload_required": reload_required,
        "hook_status": hook_status,
        "hook_output": hook_output,
        "paths": {
            "server_name_file": str(server_name_path),
            "ssl_cert_file": str(cert_path),
            "ssl_key_file": str(key_path),
            "snmp_runtime_file": str(snmp_runtime_path),
            "ntp_runtime_file": str(ntp_runtime_path),
        },
    }
