
import os
import shutil
from abc import ABC, abstractmethod
from typing import Optional, BinaryIO, Dict, Any
from minio import Minio
from datetime import timedelta
import logging

logger = logging.getLogger(__name__)

class StorageProvider(ABC):
    @abstractmethod
    async def upload(self, file_data: BinaryIO, filename: str, content_type: str, length: int) -> str:
        """Upload file stream and return stored path/key"""
        pass

    @abstractmethod
    def get_url(self, filename: str, expires_in: int = 3600, is_public: bool = False) -> str:
        """Get accessible URL. expires_in in seconds for presigned."""
        pass

    @abstractmethod
    async def delete(self, filename: str):
        """Delete file"""
        pass

    def get_stats(self) -> Dict[str, Any]:
        """Get storage statistics (used, total, percent)"""
        return {"used_bytes": 0, "total_bytes": 0, "used_percent": 0, "file_count": 0}

class LocalStorageProvider(StorageProvider):
    def __init__(self, upload_dir: str = "uploads"):
        self.upload_dir = upload_dir
        os.makedirs(self.upload_dir, exist_ok=True)
        # Base URL for local files (served via Nginx/Static)
        self.base_url = "/uploads"

    async def upload(self, file_data: BinaryIO, filename: str, content_type: str, length: int) -> str:
        file_path = os.path.join(self.upload_dir, filename)
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file_data, buffer)
        return filename

    def get_url(self, filename: str, expires_in: int = 3600, is_public: bool = False) -> str:
        # Local static files don't support expiration naturally
        return f"{self.base_url}/{filename}"

    async def delete(self, filename: str):
        file_path = os.path.join(self.upload_dir, filename)
        if os.path.exists(file_path):
            os.remove(file_path)

    def get_stats(self) -> Dict[str, Any]:
        """Get local storage stats by scanning upload directory"""
        total_size = 0
        file_count = 0
        for root, dirs, files in os.walk(self.upload_dir):
            for f in files:
                fp = os.path.join(root, f)
                if os.path.isfile(fp):
                    total_size += os.path.getsize(fp)
                    file_count += 1
        # For local storage, we don't have a fixed total - use disk space
        import shutil as sh
        disk_usage = sh.disk_usage(self.upload_dir)
        return {
            "used_bytes": total_size,
            "total_bytes": disk_usage.total,
            "used_percent": round((total_size / disk_usage.total) * 100, 1) if disk_usage.total > 0 else 0,
            "file_count": file_count
        }

class MinioStorageProvider(StorageProvider):
    def __init__(self):
        self.endpoint = os.getenv("MINIO_ENDPOINT", "minio:9000")
        self.access_key = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
        self.secret_key = os.getenv("MINIO_SECRET_KEY", "minioadmin")
        self.bucket = os.getenv("MINIO_BUCKET_NAME", "shiku-portal")
        self.secure = os.getenv("MINIO_SECURE", "False").lower() == "true"
        self.external_endpoint = os.getenv("MINIO_EXTERNAL_ENDPOINT")
        
        # Initialize MinIO Client
        self.client = Minio(
            self.endpoint,
            access_key=self.access_key,
            secret_key=self.secret_key,
            secure=self.secure
        )
        
        # Ensure bucket exists
        if not self.client.bucket_exists(self.bucket):
            try:
                self.client.make_bucket(self.bucket)
            except Exception as e:
                logger.warning(f"Could not check/create bucket: {e}")

    async def upload(self, file_data: BinaryIO, filename: str, content_type: str, length: int) -> str:
        # Sync call
        self.client.put_object(
            self.bucket,
            filename,
            file_data,
            length=length,
            content_type=content_type
        )
        return filename

    def get_url(self, filename: str, expires_in: int = 3600, is_public: bool = False) -> str:
        if is_public:
            # Use PUBLIC_BASE_URL if set (Strict Single Origin)
            public_base = os.getenv("PUBLIC_BASE_URL")
            if public_base:
                # Format: {PUBLIC_BASE_URL}/minio/{bucket}/{filename}
                # Remove trailing slash from base if present
                public_base = public_base.rstrip("/")
                return f"{public_base}/minio/{self.bucket}/{filename}"

            # Return stable public URL (http://endpoint/bucket/filename)
            # Use external endpoint if available, otherwise internal
            base_endpoint = self.external_endpoint if self.external_endpoint else self.endpoint
            
            # Determine protocol for external access
            external_proto = os.getenv("MINIO_EXTERNAL_PROTOCOL")
            if external_proto:
                protocol = external_proto
            else:
                protocol = "https" if self.secure else "http"
            
            return f"{protocol}://{base_endpoint}/{self.bucket}/{filename}"

        # Return Presigned URL
        try:
             url = self.client.get_presigned_url(
                 "GET",
                 self.bucket,
                 filename,
                 expires=timedelta(seconds=expires_in)
             )
             
             if self.external_endpoint:
                 # Replace internal endpoint with external endpoint in the URL
                 # internal self.endpoint might be 'minio:9000', url might be 'http://minio:9000/...'
                 if self.endpoint in url:
                     url = url.replace(self.endpoint, self.external_endpoint)
                     
             return url
        except Exception as e:
            logger.error(f"Failed to generate presigned URL: {e}")
            return ""

    async def delete(self, filename: str):
        self.client.remove_object(self.bucket, filename)

    def get_stats(self) -> Dict[str, Any]:
        """Get MinIO storage stats using Admin API for real disk capacity"""
        try:
            import json
            import hashlib
            import hmac
            from datetime import datetime
            import urllib.request
            import urllib.error
            
            total_size = 0
            file_count = 0
            # List all objects in bucket and sum sizes
            objects = self.client.list_objects(self.bucket, recursive=True)
            for obj in objects:
                total_size += obj.size
                file_count += 1
            
            # Try to get real disk capacity from MinIO Admin API
            total_bytes = 0
            try:
                # MinIO Prometheus metrics endpoint for disk info
                # This requires MINIO_PROMETHEUS_AUTH_TYPE=public or we use internal API
                admin_endpoint = f"http://{self.endpoint}/minio/admin/v3/info"
                
                # Build signed request using AWS Signature V4
                # For simplicity, we'll try the Prometheus metrics endpoint first
                metrics_url = f"http://{self.endpoint}/minio/v2/metrics/cluster"
                
                req = urllib.request.Request(metrics_url)
                req.add_header("Authorization", f"Basic {self._get_basic_auth()}")
                
                with urllib.request.urlopen(req, timeout=5) as response:
                    metrics_text = response.read().decode('utf-8')
                    # Parse Prometheus metrics for disk capacity
                    for line in metrics_text.split('\n'):
                        if line.startswith('minio_cluster_capacity_raw_total_bytes'):
                            # Format: minio_cluster_capacity_raw_total_bytes{...} 123456789
                            parts = line.split()
                            if len(parts) >= 2:
                                total_bytes = int(float(parts[-1]))
                                break
                
            except Exception as admin_err:
                logger.warning(f"Failed to get MinIO admin stats, using fallback: {admin_err}")
                # Fallback to env var
                total_bytes = int(os.getenv("MINIO_BUCKET_QUOTA_BYTES", str(10 * 1024 * 1024 * 1024)))
            
            if total_bytes == 0:
                total_bytes = int(os.getenv("MINIO_BUCKET_QUOTA_BYTES", str(10 * 1024 * 1024 * 1024)))
            
            free_bytes = max(0, total_bytes - total_size)
            used_percent = round((total_size / total_bytes) * 100, 1) if total_bytes > 0 else 0
            
            return {
                "used_bytes": total_size,
                "total_bytes": total_bytes,
                "free_bytes": free_bytes,
                "used_percent": min(used_percent, 100),
                "bucket_count": len(list(self.client.list_buckets())),
                "object_count": file_count
            }
        except Exception as e:
            logger.error(f"Failed to get MinIO stats: {e}")
            return {"used_bytes": 0, "total_bytes": 0, "free_bytes": 0, "used_percent": 0, "bucket_count": 0, "object_count": 0}

    def _get_basic_auth(self) -> str:
        """Generate Basic Auth header for MinIO metrics"""
        import base64
        credentials = f"{self.access_key}:{self.secret_key}"
        return base64.b64encode(credentials.encode()).decode()


# Factory
def get_storage_provider() -> StorageProvider:
    storage_type = os.getenv("STORAGE_TYPE", "local").lower()
    if storage_type == "minio":
        return MinioStorageProvider()
    return LocalStorageProvider()

storage = get_storage_provider()
