#!/usr/bin/env python3
import asyncio
import os
import sys

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.abspath(os.path.join(CURRENT_DIR, "..", "Next-Gen Enterprise Portal", "backend"))
if not os.path.exists(os.path.join(BACKEND_DIR, "models.py")):
    BACKEND_DIR = "/app"
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

import models
from database import SessionLocal
from services.crypto_keyring import BindPasswordKeyring

def _aad(directory_id: int) -> bytes:
    return b"bind_password:" + str(int(directory_id)).encode("utf-8")

async def main() -> int:
    async with SessionLocal() as db:
        # Check if test directory already exists
        from sqlalchemy import select
        existing = await db.execute(
            select(models.DirectoryConfig).filter(models.DirectoryConfig.name == "Test OpenLDAP")
        )
        if existing.scalars().first():
            print("Test OpenLDAP directory configuration already exists. Skipping.")
            return 0
            
        print("Creating Test OpenLDAP directory configuration...")
        
        # Create unencrypted config first to get ID
        new_dir = models.DirectoryConfig(
            name="Test OpenLDAP",
            type="ldap",
            host="host.docker.internal",
            port=389,
            use_ssl=False,
            start_tls=False,
            bind_dn="cn=admin,dc=baiduinc,dc=com",
            base_dn="dc=baiduinc,dc=com",
            user_filter="(&(objectClass=inetOrgPerson)(uid={username}))",
            username_attr="uid",
            email_attr="mail",
            display_name_attr="cn",
            mobile_attr="mobile",
            avatar_attr="jpegPhoto",
            enabled=True,
            sync_mode="manual",
            remark="测试用 OpenLDAP 数据源 (由 seed_test_ldap.py 自动创建)"
        )
        db.add(new_dir)
        await db.commit()
        await db.refresh(new_dir)
        
        # Encrypt the bind password using the new directory ID
        try:
            cipher = BindPasswordKeyring.encrypt_bind_password("admin", aad=_aad(new_dir.id))
            new_dir.bind_password_ciphertext = cipher
            await db.commit()
            print(f"Successfully created Test OpenLDAP configuration! ID: {new_dir.id}")
            return 0
        except Exception as e:
            print(f"Error encrypting password: {e}")
            await db.delete(new_dir)
            await db.commit()
            return 1

if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
