# Secrets Manager Runbook

This runbook defines the supported local-secret-manager flow for Next-Gen Enterprise Portal.

The deployment target is Linux. The application no longer ships with default passwords, default `SECRET_KEY`, or default `MASTER_KEY`. Startup now fails if the required secrets are missing.

## Architecture

- Master key source: Linux keyring entry `portal_master_key`
- Fallback master key source: TPM2 sealed object via `tpm2_unseal`
- Encrypted source of truth: `/etc/portal/secrets.enc.yaml`
- Runtime delivery: `/run/secrets/*`
- Docker Compose integration: service containers consume `/run/secrets/*` or `_FILE` environment variables

## Prerequisites

Install the Linux packages on the host:

```bash
apt-get install -y keyutils tpm2-tools
```

Set the non-secret deployment inputs:

```bash
export POSTGRES_USER='portal'
export POSTGRES_DB='portal_db'
export MINIO_BUCKET_NAME='next-gen-enterprise-portal'
```

Optional runtime paths:

```bash
export PORTAL_SECRETS_FILE='/etc/portal/secrets.enc.yaml'
export PORTAL_RUNTIME_SECRETS_DIR='/run/secrets'
```

## Load Master Key Into Linux Keyring

Generate a 32-byte key and store it in the session keyring:

```bash
openssl rand -base64 32 | tr -d '\n' | keyctl padd user portal_master_key @s
```

Validate it:

```bash
./ops/scripts/secretctl master-key
```

The value returned by `secretctl master-key` is the active master key in base64url form. Treat it as highly sensitive material.

## TPM2 Auto-Unseal

If the host uses TPM2 sealed storage, export the TPM2 context path before bootstrapping:

```bash
export PORTAL_TPM2_CONTEXT_FILE='/etc/portal/tpm2/portal_master_key.ctx'
export PORTAL_TPM2_AUTH='...'
```

Behavior:

- `secretctl` first searches `keyctl search @s user portal_master_key`
- if not found, it executes `tpm2_unseal -c <context>`
- if unseal succeeds, it writes the unsealed value back into the Linux keyring
- if both steps fail, the command exits non-zero

## Initialize Secrets File

Create the encrypted source-of-truth file on first install:

```bash
./ops/scripts/bootstrap-secrets.sh --init-if-missing
```

This creates `/etc/portal/secrets.enc.yaml` with encrypted values for:

- `postgres_password`
- `redis_password`
- `jwt_secret`
- `minio_root_user`
- `minio_root_password`
- `grafana_admin_password`
- `bind_password_enc_keys`
- `bind_password_enc_active_kid`

If you need a one-time built-in admin password, add it explicitly:

```bash
echo "initial_admin_password: $(./ops/scripts/secretctl enc 'TempAdmin#2026')" | sudo tee -a /etc/portal/secrets.enc.yaml
```

## Render Runtime Secrets

Generate `/run/secrets/*` from `/etc/portal/secrets.enc.yaml`:

```bash
./ops/scripts/bootstrap-secrets.sh
```

The renderer outputs, at minimum:

- `postgres_password`
- `redis_password`
- `jwt_secret`
- `master_key`
- `bind_password_enc_keys`
- `bind_password_enc_active_kid`
- `backend_database_url`
- `backend_redis_url`
- `minio_access_key`
- `minio_secret_key`
- `grafana_admin_password`

## Start Compose

After `/run/secrets/*` is populated:

```bash
docker compose up -d
```

If `POSTGRES_USER`, `POSTGRES_DB`, `MINIO_BUCKET_NAME`, `SECRET_KEY`, `MASTER_KEY`, or runtime secret files are missing, startup fails immediately.

## Manual Secret Operations

Encrypt:

```bash
./ops/scripts/secretctl enc 'plain-text'
```

Decrypt:

```bash
./ops/scripts/secretctl dec 'ENC(...)'
```

Read a named secret from `/etc/portal/secrets.enc.yaml`:

```bash
./ops/scripts/secretctl get postgres_password
```

## Rotate Secrets

Rotate managed secrets and regenerate `/run/secrets/*`:

```bash
./ops/scripts/bootstrap-secrets.sh --rotate
```

The rotation flow:

- backs up the old `/etc/portal/secrets.enc.yaml`
- generates fresh random credentials
- rotates the bind-password keyring JSON and active `kid`
- rewrites encrypted values
- regenerates `/run/secrets/*`

After rotation, restart all services that use the changed secrets:

```bash
docker compose up -d --force-recreate db redis minio grafana backend
```

## Recovery

If the Linux keyring is empty after host reboot:

1. rehydrate `portal_master_key` into `keyctl`, or
2. export `PORTAL_TPM2_CONTEXT_FILE` so `secretctl` can auto-unseal, then
3. rerun `./ops/scripts/bootstrap-secrets.sh`

If `/etc/portal/secrets.enc.yaml` is lost but `/run/secrets/*` still exists, do not treat `/run/secrets/*` as a long-term source of truth. Restore from backup and rerun bootstrap.

## Guardrails

- Do not commit `/etc/portal/secrets.enc.yaml`
- Do not commit `/run/secrets/*`
- Do not reintroduce hardcoded passwords or `SECRET_KEY` / `MASTER_KEY` defaults
- Do not bypass keyring/TPM2 by checking plaintext master keys into repo-managed env files
