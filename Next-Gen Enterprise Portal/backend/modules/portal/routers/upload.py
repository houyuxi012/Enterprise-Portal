from fastapi import APIRouter, BackgroundTasks, UploadFile, File, HTTPException, Depends, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from core.database import get_db
import modules.models as models
import os
import uuid
import io
import filetype
import logging
from datetime import datetime, timezone
from application.portal_app import AuditService, resolve_file_token, storage
from modules.iam.routers.auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/upload",
    tags=["upload"]
)

# 5MB Limit
MAX_FILE_SIZE = 5 * 1024 * 1024

@router.post("/image")
async def upload_image(
    request: Request,
    background_tasks: BackgroundTasks,
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

        # 7. Return URL (proxied via backend, no direct MinIO exposure)
        url = storage.get_url(stored_path, is_public=True)
        ip = request.client.host if request.client else "unknown"
        AuditService.schedule_business_action(
            background_tasks=background_tasks,
            user_id=user.id,
            username=user.username,
            action="UPLOAD_IMAGE",
            target=filename,
            detail=f"original={file.filename}, size={size}, mime={kind.mime}",
            ip_address=ip,
            domain="BUSINESS",
        )
        return {"url": url}

    except Exception as e:
        if isinstance(e, HTTPException):
            raise
        logger.exception("Upload failed unexpectedly")
        raise HTTPException(status_code=500, detail="Image upload failed")


# ── Proxy file download (replaces both direct MinIO access and presigned URLs) ──

_FILE_ROUTER = APIRouter(tags=["files"])


def _iter_stream(response, chunk_size: int = 64 * 1024):
    """Yield chunks from a MinIO/urllib3 response, then close it."""
    try:
        while True:
            data = response.read(chunk_size)
            if not data:
                break
            yield data
    finally:
        response.close()
        response.release_conn()


@_FILE_ROUTER.get("/files/{token}")
async def proxy_file_download(
    token: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """Authenticated proxy download.

    The *token* is an HMAC-signed, opaque identifier produced by
    ``storage.get_url()``.  It hides the real object key from the
    client and cannot be forged.
    """
    real_filename = resolve_file_token(token)
    if not real_filename:
        raise HTTPException(status_code=404, detail="File not found")

    stream, content_type, content_length = storage.get_object_stream(real_filename)
    if stream is None:
        raise HTTPException(status_code=404, detail="File not found in storage")

    headers = {}
    if content_length:
        headers["Content-Length"] = str(content_length)

    # Determine safe display name (use basename only, strip internal path)
    display_name = os.path.basename(real_filename)
    headers["Content-Disposition"] = f'inline; filename="{display_name}"'
    # Aggressive caching for immutable file-hash URLs
    headers["Cache-Control"] = "private, max-age=86400, immutable"

    return StreamingResponse(
        _iter_stream(stream),
        media_type=content_type,
        headers=headers,
    )


@router.get("/files/{filename}/view")
async def view_file(
    filename: str,
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    user: models.User = Depends(get_current_user)
):
    """
    Authenticated endpoint to view files (legacy path, kept for backward compat).
    """
    ip = request.client.host if request.client else "unknown"

    stream, content_type, content_length = storage.get_object_stream(filename)
    if stream is None:
        AuditService.schedule_business_action(
            background_tasks=background_tasks,
            user_id=user.id,
            username=user.username,
            action="VIEW_FILE",
            target=filename,
            status="FAIL",
            detail="file_not_found",
            ip_address=ip,
            domain="BUSINESS",
        )
        raise HTTPException(status_code=404, detail="File not found")

    AuditService.schedule_business_action(
        background_tasks=background_tasks,
        user_id=user.id,
        username=user.username,
        action="VIEW_FILE",
        target=filename,
        detail="mode=proxy_stream",
        ip_address=ip,
        domain="BUSINESS",
    )

    headers = {}
    if content_length:
        headers["Content-Length"] = str(content_length)

    return StreamingResponse(
        _iter_stream(stream),
        media_type=content_type,
        headers=headers,
    )
