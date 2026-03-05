import base64
import secrets
import string
import uuid
from typing import Dict
from fastapi import APIRouter, HTTPException, Request, Response, status
from captcha.image import ImageCaptcha
from application.iam_app import cache

router = APIRouter(
    prefix="/captcha",
    tags=["captcha"],
)

image_captcha = ImageCaptcha(width=160, height=60, font_sizes=(42, 50, 56))
CAPTCHA_CODE_ALPHABET = string.ascii_uppercase + string.digits
CAPTCHA_RATE_LIMIT_WINDOW_SECONDS = 60
CAPTCHA_RATE_LIMIT_MAX_PER_IP = 30


def _captcha_rate_limit_cache_key(ip: str) -> str:
    return f"captcha:rate:{ip or 'unknown'}"


def _parse_counter(raw) -> int:
    if raw is None:
        return 0
    if isinstance(raw, bytes):
        raw = raw.decode("utf-8", errors="ignore")
    try:
        return max(0, int(raw))
    except (TypeError, ValueError):
        return 0


async def _check_rate_limit(ip: str):
    key = _captcha_rate_limit_cache_key(ip)
    raw_count = await cache.get(key, is_json=False)
    count = _parse_counter(raw_count)
    if count >= CAPTCHA_RATE_LIMIT_MAX_PER_IP:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many captcha requests. Please try again later.",
        )
    await cache.set(
        key,
        str(count + 1),
        ttl=CAPTCHA_RATE_LIMIT_WINDOW_SECONDS,
        is_json=False,
    )

@router.get("/generate")
async def generate_captcha(request: Request, response: Response) -> Dict[str, str]:
    ip = request.client.host if request.client else "unknown"
    await _check_rate_limit(ip)

    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"

    # Generate 4 character code
    code = "".join(secrets.choice(CAPTCHA_CODE_ALPHABET) for _ in range(4))
    
    # Generate image
    image = image_captcha.generate(code)
    b64_img = base64.b64encode(image.read()).decode("utf-8")
    
    captcha_id = str(uuid.uuid4())
    # Save code to Redis for 5 minutes (300 seconds)
    await cache.set(f"captcha:{captcha_id}", code.lower(), ttl=300, is_json=False)
    
    return {
        "captcha_id": captcha_id,
        "captcha_image": f"data:image/png;base64,{b64_img}"
    }

async def verify_captcha(captcha_id: str, captcha_code: str) -> bool:
    if not captcha_id or not captcha_code:
        return False
        
    stored_code = await cache.get(f"captcha:{captcha_id}", is_json=False)
    if not stored_code:
        return False
        
    # Consume it (burn after read)
    await cache.delete(f"captcha:{captcha_id}")
    
    # Decode if bytes (based on cache_manager behavior)
    if isinstance(stored_code, bytes):
        stored_code = stored_code.decode('utf-8')
        
    return stored_code.lower() == captcha_code.lower()
