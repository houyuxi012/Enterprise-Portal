
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
            async with SessionLocal() as db:
                level = "INFO"
                if response.status_code >= 400:
                    level = "WARN"
                if response.status_code >= 500:
                    level = "ERROR"

                log = models.SystemLog(
                    level=level,
                    module="API",
                    message=f"{request.method} {request.url.path} - {response.status_code} - {process_time:.3f}s",
                    timestamp=datetime.datetime.now().isoformat()
                )
                db.add(log)
                await db.commit()
        except Exception:
            # print(f"Logging Error: {traceback.format_exc()}")
            pass 

    async def log_error(self, request: Request, e: Exception):
        try:
            async with SessionLocal() as db:
                log = models.SystemLog(
                    level="ERROR",
                    module="API_EXCEPTION",
                    message=f"{request.method} {request.url.path} - Exception: {str(e)}\n{traceback.format_exc()}",
                    timestamp=datetime.datetime.now().isoformat()
                )
                db.add(log)
                await db.commit()
        except Exception:
            pass
