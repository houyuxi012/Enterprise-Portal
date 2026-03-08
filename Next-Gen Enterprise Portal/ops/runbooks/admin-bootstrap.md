# Admin Bootstrap Runbook

This runbook defines the supported operational path for the built-in `admin` account.

The built-in admin bootstrap now depends on the local Secret Manager flow documented in
[secrets-manager.md](/Users/houyuxi/办公文件/code/Enterprise%20Portal/Next-Gen%20Enterprise%20Portal/ops/runbooks/secrets-manager.md).
Do not inject `INITIAL_ADMIN_PASSWORD` from ad-hoc shell history or versioned `.env` files.

## Initial Bootstrap

Use this only for a brand new environment where the `users` table does not yet contain `admin`.

Prepare the one-time bootstrap password in `/etc/portal/secrets.enc.yaml`:

```bash
cd "/Users/houyuxi/办公文件/code/Enterprise Portal/Next-Gen Enterprise Portal"
printf "initial_admin_password: %s\n" "$(./ops/scripts/secretctl enc 'TempAdmin#2026')" | sudo tee -a /etc/portal/secrets.enc.yaml
export POSTGRES_USER='portal'
export POSTGRES_DB='portal_db'
export MINIO_BUCKET_NAME='next-gen-enterprise-portal'
./ops/scripts/bootstrap-secrets.sh
docker compose up -d backend
```

Expected behavior:

- startup initializes RBAC baseline
- `init_admin()` creates `admin` only when it does not already exist
- the initial password is taken from `initial_admin_password` in the encrypted secrets store
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
docker compose exec backend python scripts/reset_admin_password.py --yes --password 'TempAdmin#2026'
```

Default reset behavior after this change:

- requires the operator to pass an explicit temporary password
- marks `password_change_required=true`
- clears lockout state
- restores `SYSTEM` + `local` login posture
- ensures `SuperAdmin` role binding
- revokes existing admin and portal sessions when cache backend is available

Override the temporary password if needed:

```bash
docker compose exec backend python scripts/reset_admin_password.py --yes --password 'AnotherTemp#2026'
```

There is no built-in fallback reset password anymore. If `--password` is omitted, the script exits non-zero.

## Guardrails

- Do not reintroduce `test_db` into the production startup chain.
- Do not hardcode bootstrap passwords in application code.
- Treat the admin bootstrap password as a one-time encrypted deployment input, not a long-lived secret in versioned files.
