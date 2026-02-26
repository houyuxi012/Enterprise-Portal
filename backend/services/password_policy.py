import re
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import models

async def validate_password(db: AsyncSession, password: str, user: models.User = None):
    """
    Validates a password against the policies defined in the SystemConfig.
    Raises HTTPException (400) if any policy is violated.
    """
    if not password:
        raise HTTPException(status_code=400, detail="Password cannot be empty")

    # Fetch configuration
    result = await db.execute(select(models.SystemConfig))
    configs = {c.key: c.value for c in result.scalars().all()}

    # Parse rules
    min_length = int(configs.get("security_password_min_length", 8))
    require_upper = configs.get("security_password_require_uppercase", "false").lower() == "true"
    require_lower = configs.get("security_password_require_lowercase", "false").lower() == "true"
    require_numbers = configs.get("security_password_require_numbers", "false").lower() == "true"
    require_symbols = configs.get("security_password_require_symbols", "false").lower() == "true"
    check_user_info = configs.get("security_password_check_user_info", "false").lower() == "true"

    # Enforce Character Type Rules
    if len(password) < min_length:
        raise HTTPException(status_code=400, detail=f"密码长度不能少于 {min_length} 位")
    
    if require_upper and not re.search(r'[A-Z]', password):
        raise HTTPException(status_code=400, detail="密码必须包含大写字母")
        
    if require_lower and not re.search(r'[a-z]', password):
        raise HTTPException(status_code=400, detail="密码必须包含小写字母")
        
    if require_numbers and not re.search(r'\d', password):
        raise HTTPException(status_code=400, detail="密码必须包含数字")
        
    if require_symbols and not re.search(r'[!@#$%^&*(),.?":{}|<>\-_\+=\[\]/\\~`]', password):
        raise HTTPException(status_code=400, detail="密码必须包含特殊符号")

    # Enforce User Info Check (Basic string inclusion matching)
    if check_user_info and user:
        pwd_lower = password.lower()
        
        # 1. Check Username
        if user.username and user.username.lower() in pwd_lower:
            raise HTTPException(status_code=400, detail="安全策略要求: 密码不能包含用户名")
            
        # 2. Check Email (Prefix)
        if user.email:
            email_prefix = user.email.split('@')[0].lower()
            if email_prefix and email_prefix in pwd_lower:
                raise HTTPException(status_code=400, detail="安全策略要求: 密码不能包含邮箱前缀")
                
        # Future enhancement: If we eventually store full name or phone number, check those here too.

    return True

def generate_compliant_password(db_configs: dict) -> str:
    """
    Generates a random password that inherently satisfies the current active system config.
    Used for the /reset-password "auto generate" flow.
    """
    import secrets
    import string
    
    min_length = int(db_configs.get("security_password_min_length", 8))
    require_upper = db_configs.get("security_password_require_uppercase", "false").lower() == "true"
    require_lower = db_configs.get("security_password_require_lowercase", "false").lower() == "true"
    require_numbers = db_configs.get("security_password_require_numbers", "false").lower() == "true"
    require_symbols = db_configs.get("security_password_require_symbols", "false").lower() == "true"
    
    # Ensure a reasonable minimum size for generated passwords
    target_length = max(min_length, 8) 
    
    pool = ""
    result = []
    
    if require_upper:
        pool += string.ascii_uppercase
        result.append(secrets.choice(string.ascii_uppercase))
    if require_lower:
        pool += string.ascii_lowercase
        result.append(secrets.choice(string.ascii_lowercase))
    if require_numbers:
        pool += string.digits
        result.append(secrets.choice(string.digits))
    if require_symbols:
        symbols = "!@#$%^*_+"
        pool += symbols
        result.append(secrets.choice(symbols))
        
    # If no requirements, default to letters and digits
    if not pool:
        pool = string.ascii_letters + string.digits
        
    while len(result) < target_length:
        result.append(secrets.choice(pool))
        
    # Shuffle to ensure required chars aren't predictably at the beginning
    import random
    random.shuffle(result)
    
    return "".join(result)
