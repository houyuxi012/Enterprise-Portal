
import os
import shutil
from abc import ABC, abstractmethod
from typing import Optional
from fastapi import UploadFile
from minio import Minio
from datetime import timedelta
import logging

logger = logging.getLogger(__name__)

class StorageProvider(ABC):
    @abstractmethod
    async def upload(self, file: UploadFile, filename: str) -> str:
        """Upload file and return stored path/key"""
        pass

    @abstractmethod
    def get_url(self, filename: str) -> str:
        """Get accessible URL (public or presigned)"""
        pass

    @abstractmethod
    async def delete(self, filename: str):
        """Delete file"""
        pass

class LocalStorageProvider(StorageProvider):
    def __init__(self, upload_dir: str = "uploads"):
        self.upload_dir = upload_dir
        os.makedirs(self.upload_dir, exist_ok=True)
        # Base URL for local files (served via Nginx/Static)
        self.base_url = "/uploads"

    async def upload(self, file: UploadFile, filename: str) -> str:
        file_path = os.path.join(self.upload_dir, filename)
        # Reset file pointer if needed
        await file.seek(0)
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        return filename

    def get_url(self, filename: str) -> str:
        return f"{self.base_url}/{filename}"

    async def delete(self, filename: str):
        file_path = os.path.join(self.upload_dir, filename)
        if os.path.exists(file_path):
            os.remove(file_path)

class MinioStorageProvider(StorageProvider):
    def __init__(self):
        self.endpoint = os.getenv("MINIO_ENDPOINT", "minio:9000")
        self.access_key = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
        self.secret_key = os.getenv("MINIO_SECRET_KEY", "minioadmin")
        self.bucket = os.getenv("MINIO_BUCKET_NAME", "shiku-portal")
        self.secure = os.getenv("MINIO_SECURE", "False").lower() == "true"
        
        # Initialize MinIO Client
        self.client = Minio(
            self.endpoint,
            access_key=self.access_key,
            secret_key=self.secret_key,
            secure=self.secure
        )
        
        # Ensure bucket exists (Client side check fallback)
        if not self.client.bucket_exists(self.bucket):
            try:
                self.client.make_bucket(self.bucket)
                # Set public policy if needed, but 'createbuckets' container handles this better
            except Exception as e:
                logger.warning(f"Could not check/create bucket: {e}")

    async def upload(self, file: UploadFile, filename: str) -> str:
        # MinIO put_object expects known size or data stream
        # UploadFile.file IS a SpooledTemporaryFile or similar.
        # Get size
        await file.seek(0, os.SEEK_END)
        size = file.file.tell()
        await file.seek(0)
        
        # Sync call, should wrap in thread for high load, but ok for now
        self.client.put_object(
            self.bucket,
            filename,
            file.file,
            length=size,
            content_type=file.content_type
        )
        return filename

    def get_url(self, filename: str) -> str:
        # Return Presigned URL (valid for 7 days)
        # Or construct public URL if we know it's public
        # Using presigned is safer for general use
        try:
             url = self.client.get_presigned_url(
                 "GET",
                 self.bucket,
                 filename,
                 expires=timedelta(days=7)
             )
             return url
        except Exception as e:
            logger.error(f"Failed to generate presigned URL: {e}")
            return ""

    async def delete(self, filename: str):
        self.client.remove_object(self.bucket, filename)

# Factory
def get_storage_provider() -> StorageProvider:
    storage_type = os.getenv("STORAGE_TYPE", "local").lower()
    if storage_type == "minio":
        return MinioStorageProvider()
    return LocalStorageProvider()

storage = get_storage_provider()
