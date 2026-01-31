
import time
import json
import traceback
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp
from starlette.requests import Request
from starlette.responses import Response
from starlette.concurrency import iterate_in_threadpool
from sqlalchemy.orm import Session
from database import SessionLocal
import models
import datetime
import logging

class SystemLoggingMiddleware(BaseHTTPMiddleware):
    def __init__(self, app: ASGIApp):
        super().__init__(app)

    async def dispatch(self, request: Request, call_next):
        start_time = time.time()
        
        # Skip logging for static files or OPTIONS
        # Skip logging for static files, OPTIONS, or polling endpoints (to avoid noise)
        if (request.url.path.startswith("/uploads") or 
            request.method == "OPTIONS" or 
            request.url.path in ["/api/system/resources", "/api/dashboard/stats"]):
            return await call_next(request)

        try:
            response = await call_next(request)
            process_time = time.time() - start_time
            
            # Log successful requests (INFO) or Client Errors (WARN)
            await self.log_request(request, response, process_time)
            
            return response
            
        except Exception as e:
            # Log Server Errors (ERROR)
            await self.log_error(request, e)
            raise e

    async def log_request(self, request: Request, response: Response, process_time: float):
        try:
            level = logging.INFO
            if response.status_code >= 400:
                level = logging.WARN
            if response.status_code >= 500:
                level = logging.ERROR

            # Extract detailed access info
            log_data = {
                "type": "ACCESS_LOG",
                "ip": request.client.host if request.client else "unknown",
                "method": request.method,
                "path": request.url.path,
                "status": response.status_code,
                "duration": float(f"{process_time:.3f}"),
                "ua": request.headers.get("user-agent", "")
            }
            
            # Use standard logger which now outputs JSON
            logger = logging.getLogger("api.access")
            logger.log(level, json.dumps(log_data))
            
            # Persist to Database (SystemLog)
            try:
                # Use a new session for logging to not interfere with request session
                async with SessionLocal() as db:
                     # Map level to string
                    level_str = "INFO"
                    if response.status_code >= 400: level_str = "WARN"
                    if response.status_code >= 500: level_str = "ERROR"

                    sys_log = models.SystemLog(
                        level=level_str,
                        module="api.access",
                        message=f"{request.method} {request.url.path} - {response.status_code}",
                        timestamp=datetime.datetime.now().isoformat(),
                        ip_address=log_data["ip"],
                        request_path=log_data["path"],
                        method=log_data["method"],
                        status_code=log_data["status"],
                        response_time=log_data["duration"],
                        user_agent=log_data["ua"]
                    )
                    db.add(sys_log)
                    await db.commit()
            except Exception as e:
                # Fallback if DB fails, don't break request
                print(f"Failed to write system log to DB: {e}")

        except Exception:
            pass 

    async def log_error(self, request: Request, e: Exception):
        try:
            logger = logging.getLogger("api.error")
            logger.error(f"API Exception: {str(e)}", exc_info=True)
        except Exception:
            pass
