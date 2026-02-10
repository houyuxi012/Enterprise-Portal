# Enterprise Versioning Strategy

## 1. Version Format (SemVer + Metadata)

We adhere to [Semantic Versioning 2.0.0](https://semver.org/) extended with build metadata.

Format: `MAJOR.MINOR.PATCH-[CHANNEL].[BUILD_NUMBER]`

### Components
- **MAJOR**: Incompatible API changes.
- **MINOR**: Backward-compatible functionality.
- **PATCH**: Backward-compatible bug fixes.
- **CHANNEL**: Release channel (`stable`, `beta`, `dev`, `nightly`).
- **BUILD_NUMBER**: CI/CD build identifier (timestamp or job ID) for traceability.

**Example:** `2.5.0-beta.2026021101`

---

## 2. Component Versioning

| Component | Version Source | Description |
|-----------|----------------|-------------|
| **Product** | `VERSION` env | The overall product release version. |
| **Backend API** | `api_version` | Current API definition version (e.g., `v1`). |
| **Database** | `db_schema_version` | Schema migration version (e.g., `1.0.2`). |

---

## 3. Automation Workflow

The `scripts/gen_version.sh` script is the single source of truth for build artifacts. It generates `backend/VERSION.json`.

### CI/CD Integration
```bash
# Production Build
export VERSION="2.5.0"
export CHANNEL="stable"
export BUILD_NUMBER="${CI_JOB_ID}"
./scripts/gen_version.sh

# Nightly Build
export VERSION="2.6.0"
export CHANNEL="nightly"
./scripts/gen_version.sh
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
