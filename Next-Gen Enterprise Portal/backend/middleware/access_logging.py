"""
Access Logging Middleware

Records HTTP request/response data and pushes to Loki only (not DB).
This is for access layer logs: gateway / nginx / HTTP requests.

Logs include:
- Path
- Status code
- IP
- User-Agent
- Request latency
"""
import time
import asyncio
from datetime import datetime
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from middleware.trace_context import get_trace_id


class AccessLoggingMiddleware(BaseHTTPMiddleware):
    """
    Middleware to log all HTTP requests to Loki (access logs only).
    These logs are NOT written to the database.
    Uses LogRepository for unified log abstraction.
    """
    
    # Paths to skip logging (health checks, static files, etc.)
    SKIP_PATHS = {"/health", "/ready", "/metrics", "/favicon.ico"}
    
    async def dispatch(self, request: Request, call_next):
        # Skip logging for certain paths
        if request.url.path in self.SKIP_PATHS:
            return await call_next(request)
        
        start_time = time.time()
        
        # Get client IP
        client_ip = request.headers.get("X-Real-IP") or \
                    request.headers.get("X-Forwarded-For", "").split(",")[0].strip() or \
                    (request.client.host if request.client else "unknown")
        
        # Execute request
        response = await call_next(request)
        
        # Calculate latency
        latency_ms = int((time.time() - start_time) * 1000)
        
        # Get trace_id from context
        trace_id = get_trace_id()
        
        # Determine status
        status = "SUCCESS" if 200 <= response.status_code < 400 else "FAIL"
        level = "INFO" if response.status_code < 400 else ("WARN" if response.status_code < 500 else "ERROR")
        
        # Use LogRepository for unified logging
        try:
            from services.log_repository import get_log_repository, LogEntry
            from services.log_forwarder import emit_log_fire_and_forget
            repo = get_log_repository()
            if repo:
                log_entry = LogEntry(
                    trace_id=trace_id,
                    request_id=trace_id,
                    timestamp=datetime.utcnow().isoformat() + "Z",
                    level=level,
                    log_type="ACCESS",
                    source="access",
                    action="HTTP_REQUEST",
                    status=status,
                    path=request.url.path,
                    method=request.method,
                    status_code=response.status_code,
                    ip_address=client_ip,
                    user_agent=request.headers.get("User-Agent", ""),
                    latency_ms=latency_ms,
                )
                # Fire-and-forget (ACCESS logs go to Loki only via repository)
                asyncio.create_task(repo.write(log_entry))

                emit_log_fire_and_forget(
                    "ACCESS",
                    {
                        "trace_id": trace_id,
                        "path": request.url.path,
                        "method": request.method,
                        "status_code": response.status_code,
                        "status": status,
                        "ip_address": client_ip,
                        "user_agent": request.headers.get("User-Agent", ""),
                        "latency_ms": latency_ms,
                        "timestamp": datetime.utcnow().isoformat() + "Z",
                    }
                )
        except Exception as e:
            import logging
            logging.warning(f"AccessLoggingMiddleware log failed: {e}")
        
        return response
