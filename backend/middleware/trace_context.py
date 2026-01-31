"""
TraceContext Middleware

Extracts or generates a trace_id for each request and makes it available
throughout the request lifecycle via contextvars.

The trace_id is sourced from:
1. Nginx's X-Request-ID header (if present)
2. A newly generated UUID (fallback)
"""
import uuid
from contextvars import ContextVar
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

# Global context variable for trace_id
trace_id_var: ContextVar[str] = ContextVar("trace_id", default="")


class TraceContextMiddleware(BaseHTTPMiddleware):
    """
    Middleware to extract/generate trace_id and propagate it through the request.
    """
    
    async def dispatch(self, request: Request, call_next):
        # Priority: X-Request-ID from Nginx, else generate new UUID
        trace_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        trace_id_var.set(trace_id)
        
        response = await call_next(request)
        
        # Echo back the trace_id in response headers
        response.headers["X-Request-ID"] = trace_id
        return response


def get_trace_id() -> str:
    """
    Get the current request's trace_id.
    Returns empty string if called outside of a request context.
    """
    return trace_id_var.get()
