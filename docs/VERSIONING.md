# Enterprise Versioning Strategy

## 1. Version Format

We adhere to [Semantic Versioning 2.0.0](https://semver.org/) extended with build metadata and channel info.

Format: `MAJOR.MINOR.PATCH-[CHANNEL].[BUILD_ID]`

### Components
- **MAJOR**: Incompatible API changes.
- **MINOR**: Backward-compatible functionality.
- **PATCH**: Backward-compatible bug fixes.
- **CHANNEL**: Release channel (`stable`, `beta`, `dev`, `nightly`).
- **BUILD_ID**: Globally unique build identifier (Format: `YYYYMMDDHHMMSS`).

**Example:** `2.5.0-beta.20260211163045`

### Extended Metadata
- **Product ID**: `enterprise-portal`
- **Release ID**: `R{DATE}-{BUILD_ID}` (e.g., `R20260211-...`)
- **Dirty Flag**: Indicates if the build was generated from a source tree with uncommitted changes.

---

## 2. Component Versioning

| Component | Version Source | Description |
|-----------|----------------|-------------|
| **Product** | `VERSION` env | The overall product release version. |
| **Backend API** | `api_version` | Current API definition version (e.g., `v1`). |
| **Database** | `db_schema_version` | Schema migration version (e.g., `1.0.2` or Alembic revision). |

---

## 3. Automation Workflow

The `scripts/gen_version.sh` script is the single source of truth.

### Usage
```bash
# Development (Default)
./scripts/gen_version.sh

# Production / CI
export VERSION="2.5.0"
export CHANNEL="stable"
export BUILD_NUMBER="${CI_JOB_ID}"
./scripts/gen_version.sh
```

### Generated Artifact (`backend/VERSION.json`)
```json
{
  "product": "Next-Gen Enterprise Portal",
  "product_id": "enterprise-portal",
  "version": "2.5.0-beta.20260211...",
  "semver": "2.5.0",
  "channel": "beta",
  "git_sha": "03b2953",
  "dirty": false,
  "build_id": "20260211...",
  "release_id": "R20260211-...",
  "api_version": "v1",
  "db_schema_version": "1.0.2"
}
```

---

## 4. Upgrade Audit

The system automatically detects upgrades at startup:
1. Reads `backend/VERSION.json`.
2. Compares with `sys_version` in the database (`system_config` table).
3. If changed:
   - Records a `SYSTEM_UPDATE` audit log (Severity: Business/System).
   - Updates `sys_version` in DB.

### Audit Log Example
```json
{
  "action": "SYSTEM_UPDATE",
  "detail": "Version upgraded from 2.4.9 to 2.5.0-beta.2026021101",
  "operator": "system_upgrade",
  "source": "SYSTEM"
}
```
