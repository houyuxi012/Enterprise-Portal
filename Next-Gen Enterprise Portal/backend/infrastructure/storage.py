
import os
import hmac
import hashlib
import base64
import shutil
from abc import ABC, abstractmethod
from typing import Optional, BinaryIO, Dict, Any, Generator
from minio import Minio
import logging
from core.runtime_secrets import get_env, get_required_env

logger = logging.getLogger(__name__)

# ── File Token helpers (HMAC-SHA256 signed, URL-safe) ────────────────────

def _get_token_secret() -> bytes:
    """Return the HMAC signing key for file tokens."""
    raw = get_required_env("SECRET_KEY")
    return raw.encode("utf-8")


def generate_file_token(filename: str) -> str:
    """Generate an opaque, non-guessable token for a stored filename.

    Format: ``{filename_b64url}.{hmac_b64url}``

    * The caller never sees the raw object key in the URL.
    * The HMAC prevents forgery (can't just base64-encode an arbitrary key).
    """
    name_bytes = filename.encode("utf-8")
    name_b64 = base64.urlsafe_b64encode(name_bytes).decode("ascii").rstrip("=")
    sig = hmac.new(_get_token_secret(), name_bytes, hashlib.sha256).digest()
    sig_b64 = base64.urlsafe_b64encode(sig).decode("ascii").rstrip("=")
    return f"{name_b64}.{sig_b64}"


def resolve_file_token(token: str) -> Optional[str]:
    """Verify an opaque file token and return the real filename, or *None*."""
    parts = token.split(".", 1)
    if len(parts) != 2:
        return None
    name_b64, sig_b64 = parts

    # Restore base64 padding
    name_b64_padded = name_b64 + "=" * (-len(name_b64) % 4)
    sig_b64_padded = sig_b64 + "=" * (-len(sig_b64) % 4)

    try:
        name_bytes = base64.urlsafe_b64decode(name_b64_padded)
        sig_bytes = base64.urlsafe_b64decode(sig_b64_padded)
    except Exception:
        return None

    expected = hmac.new(_get_token_secret(), name_bytes, hashlib.sha256).digest()
    if not hmac.compare_digest(sig_bytes, expected):
        return None
    return name_bytes.decode("utf-8")


# ── Storage Providers ────────────────────────────────────────────────────

class StorageProvider(ABC):
    @abstractmethod
    async def upload(self, file_data: BinaryIO, filename: str, content_type: str, length: int) -> str:
        """Upload file stream and return stored path/key"""
        pass

    @abstractmethod
    def get_url(self, filename: str, expires_in: int = 3600, is_public: bool = False) -> str:
        """Get an accessible proxy URL for a file."""
        pass

    @abstractmethod
    async def delete(self, filename: str):
        """Delete file"""
        pass

    def get_object_stream(self, filename: str):
        """Return a (data_stream, content_type, content_length) tuple for proxy download.

        The stream must be closed by the caller (or used inside a ``with`` block).
        """
        raise NotImplementedError

    def get_stats(self) -> Dict[str, Any]:
        """Get storage statistics (used, total, percent)"""
        return {"used_bytes": 0, "total_bytes": 0, "used_percent": 0, "file_count": 0}

class LocalStorageProvider(StorageProvider):
    def __init__(self, upload_dir: str = "uploads"):
        self.upload_dir = upload_dir
        os.makedirs(self.upload_dir, exist_ok=True)

    async def upload(self, file_data: BinaryIO, filename: str, content_type: str, length: int) -> str:
        file_path = os.path.join(self.upload_dir, filename)
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file_data, buffer)
        return filename

    def get_url(self, filename: str, expires_in: int = 3600, is_public: bool = False) -> str:
        # Local storage: return proxy download URL (same as MinIO path)
        token = generate_file_token(filename)
        return f"/api/v1/files/{token}"

    async def delete(self, filename: str):
        file_path = os.path.join(self.upload_dir, filename)
        if os.path.exists(file_path):
            os.remove(file_path)

    def get_object_stream(self, filename: str):
        """Return local file as stream."""
        import mimetypes
        file_path = os.path.join(self.upload_dir, filename)
        if not os.path.exists(file_path):
            return None, None, 0
        content_type = mimetypes.guess_type(file_path)[0] or "application/octet-stream"
        size = os.path.getsize(file_path)
        return open(file_path, "rb"), content_type, size

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
        self.endpoint = get_required_env("MINIO_ENDPOINT")
        self.access_key = get_required_env("MINIO_ACCESS_KEY")
        self.secret_key = get_required_env("MINIO_SECRET_KEY")
        self.bucket = get_required_env("MINIO_BUCKET_NAME")
        self.secure = os.getenv("MINIO_SECURE", "False").lower() == "true"
        
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
        """Return backend proxy URL — no external MinIO exposure.

        All callers (public images, view_file, avatar, etc.) receive
        ``/api/v1/files/{token}`` which is served by the authenticated
        proxy endpoint.
        """
        token = generate_file_token(filename)
        return f"/api/v1/files/{token}"

    def get_object_stream(self, filename: str):
        """Stream an object from MinIO for proxy download.

        Returns ``(response, content_type, content_length)``.
        The caller MUST call ``response.close()`` / ``response.release_conn()``
        when finished.
        """
        try:
            response = self.client.get_object(self.bucket, filename)
            content_type = response.headers.get("Content-Type", "application/octet-stream")
            content_length = int(response.headers.get("Content-Length", 0))
            return response, content_type, content_length
        except Exception as e:
            logger.error(f"Failed to stream object {filename}: {e}")
            return None, None, 0

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
                metrics_url = f"http://{self.endpoint}/minio/v2/metrics/cluster"
                
                req = urllib.request.Request(metrics_url)
                req.add_header("Authorization", f"Basic {self._get_basic_auth()}")
                
                with urllib.request.urlopen(req, timeout=5) as response:
                    metrics_text = response.read().decode('utf-8')
                    for line in metrics_text.split('\n'):
                        if line.startswith('minio_cluster_capacity_raw_total_bytes'):
                            parts = line.split()
                            if len(parts) >= 2:
                                total_bytes = int(float(parts[-1]))
                                break
                
            except Exception as admin_err:
                logger.warning(f"Failed to get MinIO admin stats, using fallback: {admin_err}")
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
    storage_type = get_env("STORAGE_TYPE", default="local").lower()
    if storage_type == "minio":
        return MinioStorageProvider()
    return LocalStorageProvider()

storage = get_storage_provider()
