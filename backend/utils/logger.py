import logging
import datetime
import traceback
from sqlalchemy.orm import Session
from database import SessionLocal
import models
import asyncio

class DBHandler(logging.Handler):
    """
    Custom logging handler to write system logs to the database.
    """
    def emit(self, record):
        try:
            # Skip filtered modules to avoid recursion or noise
            # 'uvicorn.access' is handled by headers/middleware usually, but if we want internal errors we keep it
            # We must skip 'sqlalchemy.engine' to avoid recursion loop if logging DB queries
            if record.name.startswith("sqlalchemy"):
                return

            log_entry = self.format(record)
            
            # Determine module/source
            module = record.name
            
            # Helper to run async db insert in sync context if needed, 
            # but usually logging.Handler.emit is called synchronously.
            # Using SessionLocal directly is blocking, which is fine for standard logging,
            # but for high throughput async apps, we might want to offload this.
            # For this 'Enterprise Portal', standard blocking insert is acceptable for system events.
            
            try:
                with SessionLocal() as db:
                    # Map standard levels to our string levels
                    level = record.levelname # INFO, WARNING, ERROR, etc.
                    
                    # Capture Exception Traceback if available
                    message = log_entry
                    if record.exc_info:
                        message += "\n" + "".join(traceback.format_exception(*record.exc_info))

                    log = models.SystemLog(
                        level=level,
                        module=module,
                        message=message,
                        timestamp=datetime.datetime.now().isoformat()
                    )
                    db.add(log)
                    db.commit()
            except Exception as e:
                # If DB logging fails, fallback to stderr so we don't lose the error
                print(f"!!! DB LOGGING FAILED: {e} !!!")
                print(log_entry)

        except Exception:
            self.handleError(record)

def setup_db_logging():
    """
    Configure the root logger to use DBHandler.
    """
    db_handler = DBHandler()
    formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
    db_handler.setFormatter(formatter)
    db_handler.setLevel(logging.INFO) # Capture INFO and above
    
    # Add to root logger
    logging.getLogger().addHandler(db_handler)
    
    # Ensure uvicorn errors are captured
    logging.getLogger("uvicorn.error").addHandler(db_handler)
    logging.getLogger("uvicorn.access").addHandler(db_handler) # Optional: if we want access logs here too, but we have middleware
    
    # Ensure specific app loggers are captured
    logging.getLogger("ai_engine").setLevel(logging.INFO)
