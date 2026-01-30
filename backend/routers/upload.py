from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db
import models
import os
import uuid
import io
import filetype
import logging
from datetime import datetime, timezone
from services.storage import storage
from routers.auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/upload",
    tags=["upload"]
)

# 5MB Limit
MAX_FILE_SIZE = 5 * 1024 * 1024

@router.post("/image")
async def upload_image(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: models.User = Depends(get_current_user)
):
    try:
        # 1. Read content to memory (safe for 5MB)
        content = await file.read()
        size = len(content)

        # 2. Size Validation
        if size > MAX_FILE_SIZE:
            raise HTTPException(status_code=400, detail=f"File too large. Max size is {MAX_FILE_SIZE/1024/1024}MB")

        # 3. Magic Number Validation (Real Format)
        kind = filetype.guess(content)
        if kind is None or not kind.mime.startswith("image/"):
            raise HTTPException(status_code=400, detail="Invalid file type. Must be a valid image.")

        # 4. Generate Filename (UUID + Real Extension)
        # Force extension based on detected type
        file_ext = f".{kind.extension}" 
        filename = f"{uuid.uuid4()}{file_ext}"
        
        # 5. Upload to Storage
        # Wrap bytes in IO stream
        file_stream = io.BytesIO(content)
        stored_path = await storage.upload(file_stream, filename, kind.mime, size)
        
        # 6. Save Metadata (DB Transaction with Consistency Rollback)
        try:
            file_meta = models.FileMetadata(
                original_name=file.filename,
                stored_name=filename,
                bucket=os.getenv("MINIO_BUCKET_NAME", "local") if os.getenv("STORAGE_TYPE") == "minio" else "local",
                size=size, 
                content_type=kind.mime,
                uploader_id=user.id,
                created_at=datetime.now(timezone.utc)
            )
            db.add(file_meta)
            await db.commit()
        except Exception as  db_err:
            await db.rollback()
            logger.error(f"DB Save failed, rolling back upload: {db_err}")
            # Compensation: Delete user uploaded file to ensure consistency
            await storage.delete(stored_path)
            raise db_err

        # 7. Return URL (Stable Public URL for Images)
        url = storage.get_url(stored_path, is_public=True)
        return {"url": url}

    except HTTPException as he:
        raise he
    except Exception as e:
        logger.exception("Upload failed unexpectedly")
        raise HTTPException(status_code=500, detail="Image upload failed")


