
from fastapi import APIRouter, Depends, HTTPException, Query, Request, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from typing import Any, Dict, List, Optional
import modules.models as models
import modules.schemas as schemas
from core.database import get_db
from modules.iam.routers.auth import get_current_user
from core.dependencies import PermissionChecker
import datetime
import ast
import json
import os
import logging
import re
import httpx
from application.admin_app import (
    AuditService,
    LicenseService,
    LogQuery,
    get_log_repository,
    invalidate_forwarding_cache,
)
from modules.admin.services.log_forwarding_security import (
    has_log_forwarding_secret,
    resolve_log_forwarding_secret_for_storage,
)
from pydantic import BaseModel, Field

router = APIRouter(
    prefix="/logs",
    tags=["logs"],
    responses={404: {"description": "Not found"}},
)

app_event_router = APIRouter(
    prefix="/logs",
    tags=["logs"],
    responses={404: {"description": "Not found"}},
)

logger = logging.getLogger(__name__)


class BusinessActionCreate(BaseModel):
    action: str = Field(..., min_length=2, max_length=80)
    target: Optional[str] = Field(default=None, max_length=255)
    detail: Optional[str] = Field(default=None, max_length=1000)


def _loki_headers() -> dict[str, str]:
    return {"X-Scope-OrgID": os.getenv("LOKI_TENANT_ID", "enterprise-portal")}


def _parse_log_types_field(raw_value) -> List[str]:
    default_types = ["BUSINESS", "SYSTEM", "ACCESS"]
    if raw_value is None:
        return default_types

    parsed = raw_value
    if isinstance(raw_value, str):
        text = raw_value.strip()
        if not text:
            return default_types
        try:
            parsed = json.loads(text)
        except Exception:
            try:
                parsed = ast.literal_eval(text)
            except Exception:
                cleaned = text.strip("{}")
                parsed = [part.strip().strip('"').strip("'") for part in cleaned.split(",") if part.strip()]

    if isinstance(parsed, str):
        parsed = [parsed]

    if isinstance(parsed, (list, tuple, set)):
        normalized = [str(item).upper().strip() for item in parsed if str(item).strip()]
        return normalized or default_types

    return default_types


def _get_client_ip(request: Optional[Request]) -> str:
    if request is None:
        return "unknown"
    x_real_ip = request.headers.get("X-Real-IP")
    x_forwarded_for = request.headers.get("X-Forwarded-For", "").split(",")[0].strip()
    return x_real_ip or x_forwarded_for or (request.client.host if request.client else "unknown")


def _serialize_log_forwarding_config(cfg: models.LogForwardingConfig) -> dict[str, object]:
    return {
        "id": cfg.id,
        "type": cfg.type,
        "endpoint": cfg.endpoint,
        "port": cfg.port,
        "enabled": cfg.enabled,
        "log_types": _parse_log_types_field(cfg.log_types),
        "has_secret_token": has_log_forwarding_secret(cfg.secret_token),
    }


CLIENT_ACTION_PATTERN = re.compile(r"^[A-Za-z0-9_.:-]{2,80}$")


def _normalize_client_action(raw_action: str, *, prefix: str) -> str:
    action = (raw_action or "").strip()
    if not CLIENT_ACTION_PATTERN.fullmatch(action):
        raise HTTPException(
            status_code=400,
            detail="Invalid action format. Allowed: letters, digits, _, ., :, -",
        )
    normalized = action.upper()
    normalized = normalized.replace("-", "_").replace(".", "_").replace(":", "_")
    normalized = re.sub(r"[^A-Z0-9_]", "_", normalized)
    normalized = re.sub(r"_+", "_", normalized).strip("_")
    if not normalized:
        raise HTTPException(status_code=400, detail="Invalid action.")
    return f"{prefix}{normalized}"[:120]


def _sanitize_client_target(raw_target: Optional[str]) -> Optional[str]:
    if not raw_target:
        return None
    return raw_target.strip()[:255] or None


def _sanitize_client_detail(raw_detail: Optional[str]) -> Optional[str]:
    if not raw_detail:
        return None
    compact = " ".join(raw_detail.split())
    return compact[:1000] or None


async def _require_log_forwarding_license(
    db: AsyncSession = Depends(get_db),
) -> None:
    await LicenseService.require_feature(db, "log.forwarding")


async def _require_ai_audit_license(
    db: AsyncSession = Depends(get_db),
) -> None:
    await LicenseService.require_feature(db, "ai.audit")


async def _record_log_query_audit(
    db: AsyncSession,
    request: Request,
    current_user: models.User,
    audit_action: str,
    target: str,
    detail: str,
    domain: str,
    background_tasks: BackgroundTasks | None = None,
):
    """
    Audit who queried logs, with filters and result count.
    This is best-effort and should never break read APIs.
    """
    try:
        AuditService.schedule_business_action(
            background_tasks=background_tasks,
            user_id=current_user.id,
            username=current_user.username,
            action=audit_action,
            target=target,
            detail=detail,
            ip_address=_get_client_ip(request),
            trace_id=request.headers.get("X-Request-ID") if request else None,
            domain=domain,
        )
    except Exception as e:
        logger.warning(f"Failed to persist log query audit ({audit_action}): {e}")


def _to_epoch_ms(ts_value: Any) -> int:
    if not ts_value:
        return 0
    if isinstance(ts_value, datetime.datetime):
        dt = ts_value if ts_value.tzinfo else ts_value.replace(tzinfo=datetime.timezone.utc)
        return int(dt.timestamp() * 1000)
    try:
        text = str(ts_value).replace("T", " ").replace("Z", "")
        dt = datetime.datetime.fromisoformat(text)
        if not dt.tzinfo:
            dt = dt.replace(tzinfo=datetime.timezone.utc)
        return int(dt.timestamp() * 1000)
    except Exception:
        return 0


def _canonical_log_source(source: Optional[str]) -> str:
    raw = (source or "").strip().lower().replace("+", ",")
    if not raw:
        return "db"
    normalized: List[str] = []
    for part in raw.split(","):
        token = part.strip()
        if not token:
            continue
        if token in {"database"}:
            token = "db"
        if token not in normalized:
            normalized.append(token)
    return ",".join(normalized) or "db"


def _merge_log_sources(*sources: Optional[str]) -> str:
    merged: List[str] = []
    for source in sources:
        canonical = _canonical_log_source(source)
        for part in canonical.split(","):
            token = part.strip()
            if token and token not in merged:
                merged.append(token)
    return ",".join(merged) or "db"


def _normalize_system_log_key(record: Dict[str, Any]) -> tuple[str, str, str, str, str, str]:
    ts = record.get("timestamp")
    if isinstance(ts, datetime.datetime):
        dt = ts if ts.tzinfo else ts.replace(tzinfo=datetime.timezone.utc)
        ts_key = dt.astimezone(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    else:
        ts_key = str(ts).replace("T", " ").replace("Z", "").split(".")[0][:19] if ts else ""
    return (
        ts_key,
        str(record.get("module") or ""),
        str(record.get("request_path") or ""),
        str(record.get("method") or ""),
        str(record.get("status_code") or ""),
        str(record.get("ip_address") or ""),
    )


def _build_ai_audit_record_from_db(log: models.AIAuditLog) -> Dict[str, Any]:
    ts_epoch = int(log.ts.timestamp() * 1000) if log.ts else 0
    return {
        "id": log.id,
        "event_id": log.event_id,
        "ts": log.ts,
        "actor_type": log.actor_type,
        "actor_id": log.actor_id,
        "actor_ip": log.actor_ip,
        "action": log.action,
        "provider": log.provider,
        "model": log.model,
        "status": log.status,
        "latency_ms": log.latency_ms,
        "tokens_in": log.tokens_in,
        "tokens_out": log.tokens_out,
        "input_policy_result": log.input_policy_result,
        "output_policy_result": log.output_policy_result,
        "policy_hits": log.policy_hits,
        "prompt_hash": log.prompt_hash,
        "output_hash": log.output_hash,
        "prompt_preview": log.prompt_preview,
        "error_code": log.error_code,
        "error_reason": log.error_reason,
        "meta_info": log.meta_info,
        "source": "db",
        "_epoch": ts_epoch,
    }


async def _query_ai_audit_loki_records(
    *,
    fetch_limit: int,
    start_time: Optional[str] = None,
    end_time: Optional[str] = None,
    actor_id: Optional[int] = None,
    provider: Optional[str] = None,
    model: Optional[str] = None,
    status: Optional[str] = None,
    event_id: Optional[str] = None,
) -> Dict[str, Dict[str, Any]]:
    loki_logs_map: Dict[str, Dict[str, Any]] = {}
    loki_url = os.getenv("LOKI_PUSH_URL", "http://loki:3100")
    if not loki_url:
        return loki_logs_map

    try:
        async with httpx.AsyncClient() as client:
            query_str = '{job="enterprise-portal",source="ai_audit"}'
            params: Dict[str, str | int] = {"query": query_str, "limit": fetch_limit}
            if start_time:
                try:
                    s_dt = datetime.datetime.fromisoformat(start_time.replace("Z", "+00:00"))
                    params["start"] = str(int(s_dt.timestamp() * 1e9))
                except Exception:
                    pass
            if end_time:
                try:
                    e_dt = datetime.datetime.fromisoformat(end_time.replace("Z", "+00:00"))
                    params["end"] = str(int(e_dt.timestamp() * 1e9))
                except Exception:
                    pass

            resp = await client.get(
                f"{loki_url}/loki/api/v1/query_range",
                params=params,
                timeout=5.0,
                headers=_loki_headers(),
            )
            if resp.status_code != 200:
                return loki_logs_map

            data = resp.json()
            loki_id = 100000
            for stream in data.get("data", {}).get("result", []):
                for value in stream.get("values", []):
                    try:
                        log_data = json.loads(value[1])
                    except json.JSONDecodeError:
                        continue

                    current_event_id = log_data.get("event_id", "")
                    if not current_event_id:
                        continue
                    if event_id and current_event_id != event_id:
                        continue
                    if actor_id and log_data.get("actor_id") != actor_id:
                        continue
                    if provider and log_data.get("provider") != provider:
                        continue
                    if model and model not in str(log_data.get("model") or ""):
                        continue
                    if status and log_data.get("status") != status:
                        continue

                    loki_ts_ns = int(value[0])
                    ts_val = datetime.datetime.fromtimestamp(loki_ts_ns / 1e9, tz=datetime.timezone.utc)
                    ts_epoch = int(loki_ts_ns / 1e6)
                    loki_logs_map[current_event_id] = {
                        "id": loki_id,
                        "event_id": current_event_id,
                        "ts": ts_val,
                        "actor_type": log_data.get("actor_type", "user"),
                        "actor_id": log_data.get("actor_id"),
                        "actor_ip": log_data.get("actor_ip"),
                        "action": log_data.get("action", "CHAT"),
                        "provider": log_data.get("provider"),
                        "model": log_data.get("model"),
                        "status": log_data.get("status", "SUCCESS"),
                        "latency_ms": log_data.get("latency_ms"),
                        "tokens_in": log_data.get("tokens_in"),
                        "tokens_out": log_data.get("tokens_out"),
                        "input_policy_result": log_data.get("input_policy_result"),
                        "output_policy_result": log_data.get("output_policy_result"),
                        "policy_hits": log_data.get("policy_hits"),
                        "error_code": log_data.get("error_code"),
                        "error_reason": log_data.get("error_reason"),
                        "meta_info": log_data.get("meta_info"),
                        "source": "loki",
                        "_epoch": ts_epoch,
                    }
                    loki_id += 1
    except Exception as e:
        logging.warning(f"Loki AI audit query failed: {e}")

    return loki_logs_map

# --- System Logs ---

@router.get("/system", response_model=List[schemas.SystemLog])
async def read_system_logs(
    request: Request,
    background_tasks: BackgroundTasks,
    level: Optional[str] = None,
    module: Optional[str] = None,
    exclude_module: Optional[str] = None,
    source: str = Query("all", pattern="^(db|loki|all)$"),
    limit: int = 100,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(PermissionChecker("portal.logs.system.read"))
):
    fetch_limit = limit + offset
    db_logs_map: Dict[tuple[str, str, str, str, str, str], Dict[str, Any]] = {}
    loki_logs_map: Dict[tuple[str, str, str, str, str, str], Dict[str, Any]] = {}

    if source in ("db", "all"):
        query = select(models.SystemLog).order_by(desc(models.SystemLog.id))
        if level:
            query = query.filter(models.SystemLog.level == level)
        if module:
            query = query.filter(models.SystemLog.module == module)
        if exclude_module:
            query = query.filter(models.SystemLog.module != exclude_module)

        result = await db.execute(query.limit(fetch_limit))
        logs = result.scalars().all()
        for log in logs:
            record = {
                "id": log.id,
                "level": log.level,
                "module": log.module,
                "message": log.message,
                "timestamp": log.timestamp,
                "ip_address": log.ip_address,
                "request_path": log.request_path,
                "method": log.method,
                "status_code": log.status_code,
                "response_time": log.response_time,
                "request_size": log.request_size,
                "user_agent": log.user_agent,
                "source": "db",
                "_epoch": _to_epoch_ms(log.timestamp),
            }
            db_logs_map[_normalize_system_log_key(record)] = record

    if source in ("loki", "all"):
        loki_base_url = os.getenv("LOKI_BASE_URL", "http://loki:3100")
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    f"{loki_base_url}/loki/api/v1/query_range",
                    params={
                        "query": '{job="enterprise-portal",log_type="SYSTEM"}',
                        "limit": fetch_limit,
                    },
                    timeout=5.0,
                    headers=_loki_headers(),
                )
                if resp.status_code == 200:
                    data = resp.json()
                    loki_id = 100000
                    for stream in data.get("data", {}).get("result", []):
                        for value in stream.get("values", []):
                            try:
                                log_data = json.loads(value[1])
                            except json.JSONDecodeError:
                                continue

                            module_name = log_data.get("module") or log_data.get("source") or "SYSTEM"
                            if level and log_data.get("level") != level:
                                continue
                            if module and module_name != module:
                                continue
                            if exclude_module and module_name == exclude_module:
                                continue

                            loki_ts_ns = int(value[0])
                            ts_val = datetime.datetime.fromtimestamp(loki_ts_ns / 1e9, tz=datetime.timezone.utc)
                            latency_ms = log_data.get("latency_ms")
                            request_path = log_data.get("request_path") or log_data.get("path")
                            method_name = log_data.get("method")
                            status_code_val = log_data.get("status_code")
                            message_text = (
                                log_data.get("message")
                                or log_data.get("detail")
                                or f"{method_name or '-'} {request_path or '-'} - {status_code_val or '-'}"
                            )
                            record = {
                                "id": loki_id,
                                "level": log_data.get("level", "INFO"),
                                "module": module_name,
                                "message": message_text,
                                "timestamp": ts_val,
                                "ip_address": log_data.get("ip_address"),
                                "request_path": request_path,
                                "method": method_name,
                                "status_code": status_code_val,
                                "response_time": (latency_ms / 1000.0) if latency_ms is not None else None,
                                "request_size": log_data.get("request_size"),
                                "user_agent": log_data.get("user_agent"),
                                "source": "loki",
                                "_epoch": int(loki_ts_ns / 1e6),
                            }
                            loki_logs_map[_normalize_system_log_key(record)] = record
                            loki_id += 1
        except Exception as e:
            logging.warning(f"System log Loki query failed: {e}")

    if source == "all":
        results: List[Dict[str, Any]] = []
        all_keys = set(db_logs_map.keys()) | set(loki_logs_map.keys())
        for key in all_keys:
            if key in db_logs_map and key in loki_logs_map:
                record = db_logs_map[key].copy()
                record["source"] = _merge_log_sources(record.get("source"), loki_logs_map[key].get("source"))
                results.append(record)
            elif key in db_logs_map:
                results.append(db_logs_map[key])
            else:
                results.append(loki_logs_map[key])
    elif source == "db":
        results = list(db_logs_map.values())
    else:
        results = list(loki_logs_map.values())

    results.sort(key=lambda item: item.get("_epoch", 0), reverse=True)
    logs = []
    for item in results[offset : offset + limit]:
        item.pop("_epoch", None)
        logs.append(item)

    await _record_log_query_audit(
        db=db,
        request=request,
        current_user=current_user,
        audit_action="READ_SYSTEM_LOGS",
        target="系统日志",
        detail=(
            f"level={level or '*'}, module={module or '*'}, "
            f"exclude_module={exclude_module or '-'}, source={source}, limit={limit}, "
            f"offset={offset}, result_count={len(logs)}"
        ),
        domain="SYSTEM",
        background_tasks=background_tasks,
    )
    return logs

# --- Business Logs ---

@router.get("/business", response_model=List[schemas.BusinessLog])
async def read_business_logs(
    request: Request,
    background_tasks: BackgroundTasks,
    operator: Optional[str] = None,
    action: Optional[str] = None,
    domain: str = "BUSINESS", # Default filter by domain
    source: Optional[str] = Query("db", description="Log source: db, loki, or all"),
    limit: int = 100,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    # RBAC: Only authorized users can read business logs
    current_user: models.User = Depends(PermissionChecker("portal.logs.business.read"))
):
    """
    Query business logs from specified source (default domain=BUSINESS).
    """
    db_logs_map = {}
    loki_logs_map = {}
    
    # helper: convert timestamp to epoch_ms for sorting
    def to_epoch_ms(ts_value) -> int:
        if not ts_value:
            return 0
        if isinstance(ts_value, datetime.datetime):
            dt = ts_value if ts_value.tzinfo else ts_value.replace(tzinfo=datetime.timezone.utc)
            return int(dt.timestamp() * 1000)
        try:
            # Handle ISO8601 variations (with/without Z, space, T)
            # Simple normalization first
            s = str(ts_value).replace("T", " ").replace("Z", "")
            # Truncate fractional seconds for parsing if needed, or handle generically
            # Using dateutil or basic datetime
            # Fallback to simple string sort if parsing fails? No, requirement is epoch ms.
            dt = datetime.datetime.fromisoformat(s)
            return int(dt.timestamp() * 1000)
        except Exception:
            return 0 

    # Helper: normalize key for deduplication (minute-level precision)
    def normalize_key(ts, op, act, target):
        ts_str = str(ts).replace('T', ' ').split('.')[0][:16] if ts else ""
        return (ts_str, op or "", act or "", target or "")
    
    # Strategy: Fetch (limit + offset) from BOTH sources to ensure we cover the "window"
    # Then merge, sort globally, and slice [offset:offset+limit]
    fetch_limit = limit + offset
    
    # Query from DB
    if source in ("db", "all"):
        query = select(models.BusinessLog).order_by(desc(models.BusinessLog.timestamp))
        
        # Domain Filter (P0: Hard Isolation)
        query = query.filter(models.BusinessLog.domain == domain)
        
        # P1: Exclude IAM-related actions, these belong to IAM Audit page
        iam_actions = ["用户登录", "UPDATE_USER", "CREATE_USER", "DELETE_USER", "RESET_PASSWORD"]
        query = query.filter(~models.BusinessLog.action.in_(iam_actions))

        if operator:
            query = query.filter(models.BusinessLog.operator.contains(operator))
        if action:
            query = query.filter(models.BusinessLog.action == action)
        
        # NOTE: Fetching up to fetch_limit from DB
        db_result = await db.execute(query.limit(fetch_limit))
        db_logs = db_result.scalars().all()
        for log in db_logs:
            log_dict = {
                "id": log.id,
                "operator": log.operator,
                "action": log.action,
                "target": log.target,
                "ip_address": log.ip_address,
                "status": log.status,
                "detail": log.detail,
                "timestamp": log.timestamp,
                "source": "db",
                "_epoch": to_epoch_ms(log.timestamp) # Cache for sort
            }
            key = normalize_key(log.timestamp, log.operator, log.action, log.target)
            db_logs_map[key] = log_dict
    
    # Query from Loki
    if source in ("loki", "all"):
        import os
        import httpx
        # Split BASE URL (P1: Stability)
        loki_base_url = os.getenv("LOKI_BASE_URL", "http://loki:3100")
            
        try:
            async with httpx.AsyncClient() as client:
                query_str = f'{{job="enterprise-portal",log_type="{domain}"}}'
                resp = await client.get(
                    f"{loki_base_url}/loki/api/v1/query_range",
                    params={"query": query_str, "limit": fetch_limit}, # Fetch enough to cover offset
                    timeout=5.0,
                    headers=_loki_headers()
                )
                if resp.status_code == 200:
                    import json
                    data = resp.json()
                    loki_id = 10000
                    for stream in data.get("data", {}).get("result", []):
                        for value in stream.get("values", []):
                            try:
                                log_data = json.loads(value[1])
                                ts = log_data.get("timestamp", "")
                                op = log_data.get("username", "")
                                act = log_data.get("action", "")
                                target = log_data.get("target", "")

                                if operator and operator not in op:
                                    continue
                                if action and act != action:
                                    continue
                                
                                log_dict = {
                                    "id": loki_id,
                                    "operator": op,
                                    "action": act,
                                    "target": target,
                                    "ip_address": log_data.get("ip_address", ""),
                                    "status": log_data.get("status", "SUCCESS"),
                                    "detail": log_data.get("detail", ""),
                                    "timestamp": ts,
                                    "source": "loki",
                                    "_epoch": to_epoch_ms(ts)
                                }
                                key = normalize_key(ts, op, act, target)
                                loki_logs_map[key] = log_dict
                                loki_id += 1
                            except json.JSONDecodeError:
                                pass
        except Exception as e:
            import logging
            logging.warning(f"Loki query failed: {e}")
    
    # Merge and deduplicate (DB priority, with merge indicator)
    results = []
    if source == "all":
        all_keys = set(db_logs_map.keys()) | set(loki_logs_map.keys())
        for key in all_keys:
            if key in db_logs_map:
                record = db_logs_map[key].copy()
                # Mark as merged if also exists in Loki
                if key in loki_logs_map:
                    record["source"] = _merge_log_sources(record.get("source"), loki_logs_map[key].get("source"))
                results.append(record)
            else:
                results.append(loki_logs_map[key])
    elif source == "db":
        results = list(db_logs_map.values())
    else:
        results = list(loki_logs_map.values())
    
    # Sort by epoch desc (P1: Stable Sort)
    results.sort(key=lambda x: x.get("_epoch", 0), reverse=True)
    
    # Remove temporary helper key before returning
    final_results = []
    for r in results:
        r.pop("_epoch", None)
        final_results.append(r)

    page = final_results[offset : offset + limit]
    await _record_log_query_audit(
        db=db,
        request=request,
        current_user=current_user,
        audit_action="READ_BUSINESS_LOGS",
        target="业务日志",
        detail=(
            f"domain={domain}, source={source}, operator={operator or '*'}, "
            f"action={action or '*'}, limit={limit}, offset={offset}, "
            f"result_count={len(page)}"
        ),
        domain="SYSTEM",
        background_tasks=background_tasks,
    )
    return page

@router.post("/business", response_model=schemas.BusinessLog)
async def create_business_log(
    request: Request,
    log: BusinessActionCreate,
    db: AsyncSession = Depends(get_db),
    # Allowing internal calls or authenticated users to log actions
    current_user: models.User = Depends(get_current_user),
):
    trace_id = request.headers.get("X-Request-ID") if request else None
    client_ip = _get_client_ip(request)
    normalized_action = _normalize_client_action(log.action, prefix="ADMIN_CLIENT_")
    db_log = await AuditService.log_business_action(
        db=db,
        user_id=current_user.id if current_user else 0,
        username=current_user.username if current_user else "unknown",
        action=normalized_action,
        target=_sanitize_client_target(log.target) or "",
        status="SUCCESS",
        detail=_sanitize_client_detail(log.detail),
        ip_address=client_ip,
        trace_id=trace_id,
        domain="BUSINESS",
    )
    if db_log is None:
        raise HTTPException(status_code=500, detail="Failed to create business log")
    await db.commit()
    await db.refresh(db_log)
    return db_log


@app_event_router.post("/business", response_model=schemas.BusinessLog)
async def create_business_log_for_portal(
    log: BusinessActionCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Portal-facing lightweight event log endpoint.
    Used by frontend app telemetry-style behavior logs.
    """
    trace_id = request.headers.get("X-Request-ID")
    client_ip = _get_client_ip(request)
    normalized_action = _normalize_client_action(log.action, prefix="PORTAL_CLIENT_")
    db_log = await AuditService.log_business_action(
        db=db,
        user_id=current_user.id,
        username=current_user.username,
        action=normalized_action,
        target=_sanitize_client_target(log.target) or "",
        status="SUCCESS",
        detail=_sanitize_client_detail(log.detail),
        ip_address=client_ip,
        trace_id=trace_id,
        domain="BUSINESS",
    )
    if db_log is None:
        raise HTTPException(status_code=500, detail="Failed to create business log")
    await db.commit()
    await db.refresh(db_log)
    return db_log

# --- Log Forwarding ---

@router.get("/config", response_model=List[schemas.LogForwardingConfig])
async def read_log_configs(
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(_require_log_forwarding_license),
    current_user: models.User = Depends(PermissionChecker("portal.logs.forwarding.admin"))
):
    result = await db.execute(select(models.LogForwardingConfig))
    configs = [
        cfg
        for cfg in result.scalars().all()
        if (cfg.type or "").upper().strip() == "SYSLOG"
    ]
    await _record_log_query_audit(
        db=db,
        request=request,
        current_user=current_user,
        audit_action="READ_LOG_FORWARDING_CONFIG",
        target="日志转发配置",
        detail=f"result_count={len(configs)}",
        domain="SYSTEM",
        background_tasks=background_tasks,
    )
    return [
        _serialize_log_forwarding_config(cfg)
        for cfg in configs
    ]

@router.post("/config", response_model=schemas.LogForwardingConfig)
async def create_log_config(
    request: Request,
    background_tasks: BackgroundTasks,
    config: schemas.LogForwardingConfigCreate,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(_require_log_forwarding_license),
    current_user: models.User = Depends(PermissionChecker("portal.logs.forwarding.admin"))
):
    normalized_type = (config.type or "").upper().strip()
    if normalized_type != "SYSLOG":
        raise HTTPException(status_code=400, detail="Only SYSLOG forwarding is supported")

    normalized_log_types = _parse_log_types_field(config.log_types)
    payload = config.model_dump()
    payload["type"] = normalized_type
    payload["log_types"] = json.dumps(
        normalized_log_types,
        ensure_ascii=False
    )
    payload["secret_token"] = resolve_log_forwarding_secret_for_storage(config.secret_token)
    db_config = models.LogForwardingConfig(**payload)
    db.add(db_config)
    await db.commit()
    await db.refresh(db_config)
    AuditService.schedule_business_action(
        background_tasks=background_tasks,
        user_id=current_user.id,
        username=current_user.username,
        action="CREATE_LOG_FORWARDING_CONFIG",
        target="日志转发配置",
        detail=f"type={db_config.type}, endpoint={db_config.endpoint}, enabled={db_config.enabled}, log_types={normalized_log_types}",
        ip_address=_get_client_ip(request),
        trace_id=request.headers.get("X-Request-ID"),
        domain="SYSTEM",
    )
    invalidate_forwarding_cache()
    return _serialize_log_forwarding_config(db_config)

@router.delete("/config/{config_id}")
async def delete_log_config(
    config_id: int,
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(_require_log_forwarding_license),
    current_user: models.User = Depends(PermissionChecker("portal.logs.forwarding.admin"))
):
    result = await db.execute(select(models.LogForwardingConfig).filter(models.LogForwardingConfig.id == config_id))
    db_config = result.scalars().first()
    if not db_config:
        raise HTTPException(status_code=404, detail="Config not found")
    config_snapshot = {
        "type": db_config.type,
        "endpoint": db_config.endpoint,
        "port": db_config.port,
        "enabled": db_config.enabled,
    }
    await db.delete(db_config)
    await db.commit()
    AuditService.schedule_business_action(
        background_tasks=background_tasks,
        user_id=current_user.id,
        username=current_user.username,
        action="DELETE_LOG_FORWARDING_CONFIG",
        target="日志转发配置",
        detail=f"config_id={config_id}, snapshot={config_snapshot}",
        ip_address=_get_client_ip(request),
        trace_id=request.headers.get("X-Request-ID"),
        domain="SYSTEM",
    )
    invalidate_forwarding_cache()
    return {"message": "Config deleted"}

# --- Access Logs (Loki Only) ---

@router.get("/access")
async def read_access_logs(
    request: Request,
    background_tasks: BackgroundTasks,
    path: Optional[str] = None,
    status_code: Optional[int] = None,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(PermissionChecker("portal.logs.system.read"))
):
    """
    Query access logs from Loki only.
    Access logs are NOT stored in the database.
    Uses LogRepository for unified abstraction.
    """
    repo = get_log_repository()
    if not repo:
        await _record_log_query_audit(
            db=db,
            request=request,
            current_user=current_user,
            audit_action="READ_ACCESS_LOGS",
            target="访问日志",
            detail=f"path={path or '*'}, status_code={status_code or '*'}, limit={limit}, result_count=0, reason=no_repository",
            domain="SYSTEM",
            background_tasks=background_tasks,
        )
        return []
    
    query = LogQuery(
        log_type="ACCESS",
        path=path,
        status_code=status_code,
        limit=limit
    )
    
    results = await repo.read(query)
    formatted_results = [
        {
            "id": idx + 1,
            "timestamp": log.get("timestamp", ""),
            "trace_id": log.get("trace_id", ""),
            "method": log.get("method", ""),
            "path": log.get("path", ""),
            "status_code": log.get("status_code", 0),
            "ip_address": log.get("ip_address", ""),
            "user_agent": log.get("user_agent", ""),
            "latency_ms": log.get("latency_ms", 0),
        }
        for idx, log in enumerate(results[:limit])
    ]
    await _record_log_query_audit(
        db=db,
        request=request,
        current_user=current_user,
        audit_action="READ_ACCESS_LOGS",
        target="访问日志",
        detail=f"path={path or '*'}, status_code={status_code or '*'}, limit={limit}, result_count={len(formatted_results)}",
        domain="SYSTEM",
        background_tasks=background_tasks,
    )
    return formatted_results


# --- AI Audit Logs ---

@router.get("/ai-audit", response_model=List[schemas.AIAuditLog])
async def read_ai_audit_logs(
    request: Request,
    background_tasks: BackgroundTasks,
    start_time: Optional[str] = None,
    end_time: Optional[str] = None,
    actor_id: Optional[int] = None,
    provider: Optional[str] = None,
    model: Optional[str] = None,
    status: Optional[str] = None,
    source: str = Query("db", description="Log source: db, loki, or all"),
    limit: int = 100,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(_require_ai_audit_license),
    current_user: models.User = Depends(PermissionChecker("portal.ai_audit.read"))
):
    """
    Query AI audit logs from specified source.
    - source=db: Query from PostgreSQL (default)
    - source=loki: Query from Loki
    - source=all: Merge results from both, deduplicate by event_id
    """
    db_logs_map: Dict[str, Dict[str, Any]] = {}
    loki_logs_map: Dict[str, Dict[str, Any]] = {}
    
    # Strategy: Fetch (limit + offset) from BOTH sources
    fetch_limit = limit + offset

    # Query from DB
    if source in ("db", "all"):
        query = select(models.AIAuditLog).order_by(desc(models.AIAuditLog.ts))
        
        if start_time:
            try:
                start_dt = datetime.datetime.fromisoformat(start_time.replace("Z", "+00:00"))
                query = query.filter(models.AIAuditLog.ts >= start_dt)
            except ValueError:
                pass
        
        if end_time:
            try:
                end_dt = datetime.datetime.fromisoformat(end_time.replace("Z", "+00:00"))
                query = query.filter(models.AIAuditLog.ts <= end_dt)
            except ValueError:
                pass
        
        if actor_id:
            query = query.filter(models.AIAuditLog.actor_id == actor_id)
        if provider:
            query = query.filter(models.AIAuditLog.provider == provider)
        if model:
            query = query.filter(models.AIAuditLog.model.contains(model))
        if status:
            query = query.filter(models.AIAuditLog.status == status)
        
        # Fetch limit + offset
        db_result = await db.execute(query.limit(fetch_limit))
        db_logs = db_result.scalars().all()
        for log in db_logs:
            db_logs_map[log.event_id] = _build_ai_audit_record_from_db(log)
    
    # Query from Loki (if enabled)
    if source in ("loki", "all"):
        loki_logs_map = await _query_ai_audit_loki_records(
            fetch_limit=fetch_limit,
            start_time=start_time,
            end_time=end_time,
            actor_id=actor_id,
            provider=provider,
            model=model,
            status=status,
        )
    
    # Merge and deduplicate
    if source == "all":
        results = []
        all_keys = set(db_logs_map.keys()) | set(loki_logs_map.keys())
        for key in all_keys:
            in_db = key in db_logs_map
            in_loki = key in loki_logs_map
            if in_db and in_loki:
                log = db_logs_map[key].copy()
                log["source"] = _merge_log_sources(log.get("source"), loki_logs_map[key].get("source"))
                results.append(log)
            elif in_db:
                results.append(db_logs_map[key])
            else:
                results.append(loki_logs_map[key])
    elif source == "db":
        results = list(db_logs_map.values())
    else:
        results = list(loki_logs_map.values())
        
    # Sort by epoch desc
    results.sort(key=lambda x: x.get("_epoch", 0), reverse=True)
    
    # Cleanup helper key
    final_results = []
    for r in results:
        r.pop("_epoch", None)
        final_results.append(r)
    
    page = final_results[offset : offset + limit]
    await _record_log_query_audit(
        db=db,
        request=request,
        current_user=current_user,
        audit_action="READ_AI_AUDIT_LOGS",
        target="AI审计日志",
        detail=(
            f"source={source}, actor_id={actor_id or '*'}, provider={provider or '*'}, "
            f"model={model or '*'}, status={status or '*'}, start_time={start_time or '-'}, "
            f"end_time={end_time or '-'}, limit={limit}, offset={offset}, "
            f"result_count={len(page)}"
        ),
        domain="SYSTEM",
        background_tasks=background_tasks,
    )
    return page




@router.get("/ai-audit/{event_id}", response_model=schemas.AIAuditLog)
async def get_ai_audit_detail(
    event_id: str,
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(_require_ai_audit_license),
    current_user: models.User = Depends(PermissionChecker("portal.ai_audit.read"))
):
    """Get detailed AI audit log by event_id"""
    result = await db.execute(
        select(models.AIAuditLog).filter(models.AIAuditLog.event_id == event_id)
    )
    log = result.scalars().first()
    if not log:
        loki_records = await _query_ai_audit_loki_records(fetch_limit=50, event_id=event_id)
        loki_log = loki_records.get(event_id)
        if loki_log:
            loki_log.pop("_epoch", None)
            await _record_log_query_audit(
                db=db,
                request=request,
                current_user=current_user,
                audit_action="READ_AI_AUDIT_DETAIL",
                target="AI审计日志",
                detail=f"event_id={event_id}, result=found, source=loki",
                domain="SYSTEM",
                background_tasks=background_tasks,
            )
            return loki_log
        await _record_log_query_audit(
            db=db,
            request=request,
            current_user=current_user,
            audit_action="READ_AI_AUDIT_DETAIL",
            target="AI审计日志",
            detail=f"event_id={event_id}, result=not_found",
            domain="SYSTEM",
            background_tasks=background_tasks,
        )
        raise HTTPException(status_code=404, detail="AI audit log not found")
    await _record_log_query_audit(
        db=db,
        request=request,
        current_user=current_user,
        audit_action="READ_AI_AUDIT_DETAIL",
        target="AI审计日志",
        detail=f"event_id={event_id}, result=found, source=db",
        domain="SYSTEM",
        background_tasks=background_tasks,
    )
    return log


@router.get("/ai-audit/stats/summary")
async def get_ai_audit_stats(
    request: Request,
    background_tasks: BackgroundTasks,
    days: int = 7,
    source: str = Query("all", pattern="^(db|loki|all)$"),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(_require_ai_audit_license),
    current_user: models.User = Depends(PermissionChecker("portal.ai_audit.read"))
):
    """Get AI audit statistics summary"""
    now = datetime.datetime.now(datetime.timezone.utc)
    cutoff = now - datetime.timedelta(days=days)
    prev_cutoff_start = cutoff - datetime.timedelta(days=days)
    prev_cutoff_end = cutoff

    async def _build_db_period_map(
        start: datetime.datetime,
        end: datetime.datetime,
    ) -> Dict[str, Dict[str, Any]]:
        period_query = (
            select(models.AIAuditLog)
            .where(models.AIAuditLog.ts >= start, models.AIAuditLog.ts < end)
            .order_by(desc(models.AIAuditLog.ts))
        )
        period_result = await db.execute(period_query)
        return {
            row.event_id: _build_ai_audit_record_from_db(row)
            for row in period_result.scalars().all()
            if row.event_id
        }

    async def _build_period_map(
        start: datetime.datetime,
        end: datetime.datetime,
    ) -> Dict[str, Dict[str, Any]]:
        db_map: Dict[str, Dict[str, Any]] = {}
        loki_map: Dict[str, Dict[str, Any]] = {}

        if source in ("db", "all"):
            db_map = await _build_db_period_map(start, end)
        if source in ("loki", "all"):
            loki_map = await _query_ai_audit_loki_records(
                fetch_limit=10000,
                start_time=start.isoformat(),
                end_time=end.isoformat(),
            )

        if source == "db":
            return db_map
        if source == "loki":
            return loki_map

        merged: Dict[str, Dict[str, Any]] = dict(loki_map)
        for event_key, record in db_map.items():
            if event_key in merged:
                merged_record = record.copy()
                merged_record["source"] = _merge_log_sources(record.get("source"), merged[event_key].get("source"))
                merged[event_key] = merged_record
            else:
                merged[event_key] = record
        return merged

    current_logs = list((await _build_period_map(cutoff, now)).values())
    previous_logs = list((await _build_period_map(prev_cutoff_start, prev_cutoff_end)).values())

    total = len(current_logs)
    success_count = sum(1 for item in current_logs if item.get("status") == "SUCCESS")
    blocked_count = sum(1 for item in current_logs if item.get("status") == "BLOCKED")
    error_count = total - success_count - blocked_count

    latency_values = [int(item["latency_ms"]) for item in current_logs if item.get("latency_ms") is not None]
    avg_latency = round(sum(latency_values) / len(latency_values), 2) if latency_values else 0

    total_tokens_in = sum(int(item.get("tokens_in") or 0) for item in current_logs)
    total_tokens_out = sum(int(item.get("tokens_out") or 0) for item in current_logs)

    model_totals: Dict[str, Dict[str, Any]] = {}
    for item in current_logs:
        model_name = item.get("model") or "unknown"
        entry = model_totals.setdefault(
            model_name,
            {"model": model_name, "requests": 0, "tokens_in": 0, "tokens_out": 0, "total_tokens": 0},
        )
        entry["requests"] += 1
        entry["tokens_in"] += int(item.get("tokens_in") or 0)
        entry["tokens_out"] += int(item.get("tokens_out") or 0)
        entry["total_tokens"] = entry["tokens_in"] + entry["tokens_out"]
    model_breakdown = sorted(model_totals.values(), key=lambda item: item["total_tokens"], reverse=True)[:50]

    daily_totals: Dict[str, Dict[str, Any]] = {}
    for item in current_logs:
        ts = item.get("ts")
        if not isinstance(ts, datetime.datetime):
            continue
        day_key = ts.astimezone(datetime.timezone.utc).date().isoformat()
        day_entry = daily_totals.setdefault(day_key, {"date": day_key, "tokens_in": 0, "tokens_out": 0, "total_tokens": 0})
        day_entry["tokens_in"] += int(item.get("tokens_in") or 0)
        day_entry["tokens_out"] += int(item.get("tokens_out") or 0)
        day_entry["total_tokens"] = day_entry["tokens_in"] + day_entry["tokens_out"]
    daily_trend = [daily_totals[key] for key in sorted(daily_totals.keys())]

    total_tokens_prev = sum(
        int(item.get("tokens_in") or 0) + int(item.get("tokens_out") or 0)
        for item in previous_logs
    )

    trend_percentage = 0.0
    if total_tokens_prev > 0:
        current_total = total_tokens_in + total_tokens_out
        trend_percentage = ((current_total - total_tokens_prev) / total_tokens_prev) * 100

    stats_payload = {
        "period_days": days,
        "total_requests": total,
        "success_count": success_count,
        "blocked_count": blocked_count,
        "error_count": error_count,
        "success_rate": round(success_count / total * 100, 2) if total > 0 else 0,
        "avg_latency_ms": avg_latency,
        "total_tokens_in": total_tokens_in,
        "total_tokens_out": total_tokens_out,
        "total_tokens": total_tokens_in + total_tokens_out,
        "model_breakdown": model_breakdown,
        "daily_trend": daily_trend,
        "total_tokens_prev": total_tokens_prev,
        "trend_percentage": round(trend_percentage, 1)
    }
    await _record_log_query_audit(
        db=db,
        request=request,
        current_user=current_user,
        audit_action="READ_AI_AUDIT_STATS",
        target="AI审计统计",
        detail=f"days={days}, source={source}, total_requests={total}, total_tokens={stats_payload['total_tokens']}",
        domain="SYSTEM",
        background_tasks=background_tasks,
    )
    return stats_payload
