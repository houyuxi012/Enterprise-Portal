# Admin Bootstrap Runbook

This runbook defines the supported operational path for the built-in `admin` account.

## Initial Bootstrap

Use this only for a brand new environment where the `users` table does not yet contain `admin`.

Set the bootstrap password before the first backend start:

```bash
cd "/Users/houyuxi/办公文件/code/Enterprise Portal/Next-Gen Enterprise Portal"
export INITIAL_ADMIN_PASSWORD='ngep#HYX'
docker compose up -d backend
```

Expected behavior:

- startup initializes RBAC baseline
- `init_admin()` creates `admin` only when it does not already exist
- the initial password is taken from `INITIAL_ADMIN_PASSWORD`
- `password_change_required=true` is set on the created account

Optional bootstrap metadata:

```bash
export INITIAL_ADMIN_NAME='Administrator'
export INITIAL_ADMIN_EMAIL='admin@local.invalid'
```

After the first successful login, change the password immediately through the normal password change flow.

## Forgotten Password Reset

Use the offline reset script when `admin` already exists but the current password is unknown.

From the host:

```bash
cd "/Users/houyuxi/办公文件/code/Enterprise Portal/Next-Gen Enterprise Portal"
docker compose exec backend python scripts/reset_admin_password.py --yes
```

Default reset behavior:

- resets `admin` password to `ngep#HYX`
- marks `password_change_required=true`
- clears lockout state
- restores `SYSTEM` + `local` login posture
- ensures `SuperAdmin` role binding
- revokes existing admin and portal sessions when cache backend is available

Override the temporary password if needed:

```bash
docker compose exec backend python scripts/reset_admin_password.py --yes --password 'AnotherTemp#2026'
```

## Guardrails

- Do not reintroduce `test_db` into the production startup chain.
- Do not hardcode bootstrap passwords in application code.
- Treat `INITIAL_ADMIN_PASSWORD` as a one-time deployment input, not a long-lived secret in versioned files.
