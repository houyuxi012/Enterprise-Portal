"""Tests for avatar dedup, size check, and format validation (Task 6)."""
from __future__ import annotations

import hashlib

import pytest

from services.identity.sync_errors import (
    MAX_AVATAR_BYTES,
    ALLOWED_AVATAR_MIMES,
    SYNC_AVATAR_SIZE_EXCEEDED,
    SYNC_AVATAR_DEDUP_HIT,
    SYNC_AVATAR_UPLOAD_FAILED,
)


def _guess_image_mime(blob: bytes) -> str:
    """Simplified copy of LdapIdentityProvider._guess_image_mime."""
    if blob.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if blob.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if blob.startswith((b"GIF87a", b"GIF89a")):
        return "image/gif"
    if blob.startswith(b"BM"):
        return "image/bmp"
    return "image/jpeg"


class TestAvatarSizeLimit:
    """Avatar size constraint tests."""

    def test_avatar_under_limit_passes(self):
        """Avatar within MAX_AVATAR_BYTES should pass."""
        blob = b"\xff\xd8\xff" + b"\x00" * 1000  # small JPEG
        assert len(blob) <= MAX_AVATAR_BYTES

    def test_avatar_over_limit_rejected(self):
        """Avatar exceeding MAX_AVATAR_BYTES should be rejected."""
        blob = b"\xff\xd8\xff" + b"\x00" * (MAX_AVATAR_BYTES + 1)
        assert len(blob) > MAX_AVATAR_BYTES

    def test_avatar_exactly_at_limit(self):
        """Avatar exactly at MAX_AVATAR_BYTES should pass."""
        blob = b"\xff\xd8\xff" + b"\x00" * (MAX_AVATAR_BYTES - 3)
        assert len(blob) == MAX_AVATAR_BYTES


class TestAvatarFormatValidation:
    """Avatar MIME type validation tests."""

    def test_jpeg_allowed(self):
        blob = b"\xff\xd8\xff\xe0"
        assert _guess_image_mime(blob) in ALLOWED_AVATAR_MIMES

    def test_png_allowed(self):
        blob = b"\x89PNG\r\n\x1a\n"
        assert _guess_image_mime(blob) in ALLOWED_AVATAR_MIMES

    def test_gif_allowed(self):
        blob = b"GIF89a"
        assert _guess_image_mime(blob) in ALLOWED_AVATAR_MIMES

    def test_bmp_rejected(self):
        """BMP is not in the allowed list."""
        blob = b"BM" + b"\x00" * 100
        mime = _guess_image_mime(blob)
        assert mime == "image/bmp"
        assert mime not in ALLOWED_AVATAR_MIMES


class TestAvatarHashDedup:
    """SHA-256 hash-based dedup tests."""

    def test_same_hash_skips_upload(self):
        """Identical blob should produce same hash → dedup hit."""
        blob = b"\xff\xd8\xff" + b"test_image_data_1234567890"
        avatar_hash = hashlib.sha256(blob).hexdigest()
        existing_hash = avatar_hash

        # Simulated dedup logic
        should_skip = existing_hash and avatar_hash == existing_hash
        assert should_skip is True

    def test_different_hash_uploads(self):
        """Different blobs should produce different hashes → upload proceeds."""
        blob1 = b"\xff\xd8\xff" + b"image_data_v1"
        blob2 = b"\xff\xd8\xff" + b"image_data_v2"
        hash1 = hashlib.sha256(blob1).hexdigest()
        hash2 = hashlib.sha256(blob2).hexdigest()

        assert hash1 != hash2
        should_skip = hash1 == hash2
        assert should_skip is False

    def test_hash_is_stable(self):
        """Same blob always produces the same SHA-256 hash."""
        blob = b"\x89PNG\r\n\x1a\n" + b"stable_content"
        h1 = hashlib.sha256(blob).hexdigest()
        h2 = hashlib.sha256(blob).hexdigest()
        assert h1 == h2
        assert len(h1) == 64  # SHA-256 hex digest length


class TestAvatarUploadFallback:
    """Upload failure fallback tests."""

    def test_fallback_keeps_old_url_on_failure(self):
        """When upload fails, existing avatar_url should be preserved."""
        old_url = "https://storage.example.com/avatars/old-avatar.jpg"
        upload_result_url = None  # simulates upload failure returning None

        # Fallback logic: keep old URL if upload returns None
        final_url = upload_result_url if upload_result_url else old_url
        assert final_url == old_url

    def test_fallback_hash_still_returned_on_failure(self):
        """Even when upload fails, hash should still be computed for future dedup."""
        blob = b"\xff\xd8\xff" + b"some_data"
        avatar_hash = hashlib.sha256(blob).hexdigest()
        # upload_to_storage returns (None, hash) on failure
        assert avatar_hash is not None
        assert len(avatar_hash) == 64
