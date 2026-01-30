from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db
import models
import os
import uuid
from datetime import datetime
from services.storage import storage
from routers.auth import get_current_user

router = APIRouter(
    prefix="/upload",
    tags=["upload"]
)

@router.post("/image")
async def upload_image(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: models.User = Depends(get_current_user)
):
    try:
        # Validate file type
        if not file.content_type.startswith("image/"):
            raise HTTPException(status_code=400, detail="File must be an image")
        
        # Validate file extension
        file_ext = os.path.splitext(file.filename)[1].lower()
        if file_ext not in [".jpg", ".jpeg", ".png", ".gif", ".webp"]:
            raise HTTPException(status_code=400, detail="Invalid image format")

        # Generate unique filename
        filename = f"{uuid.uuid4()}{file_ext}"
        
        # Upload to Storage Provider
        stored_path = await storage.upload(file, filename)
        
        # Save Metadata
        file_meta = models.FileMetadata(
            original_name=file.filename,
            stored_name=filename,
            bucket=os.getenv("MINIO_BUCKET_NAME", "local") if os.getenv("STORAGE_TYPE") == "minio" else "local",
            size=file.size, # UploadFile might not have size set correctly if spooled?
            content_type=file.content_type,
            uploader_id=user.id,
            created_at=datetime.now().isoformat()
        )
        db.add(file_meta)
        await db.commit()

        # Return URL
        url = storage.get_url(stored_path)
        return {"url": url}

    except Exception as e:
        print(f"Upload failed: {e}")
        raise HTTPException(status_code=500, detail="Image upload failed")

