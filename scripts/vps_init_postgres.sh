#!/usr/bin/env bash
# ==============================================================================
# NKB Cloud v2.1.0 — VPS PostgreSQL Schema & Migration Initializer
# Target OS: AlmaLinux 10 / Docker Compose
# ==============================================================================
set -euo pipefail

echo "=========================================================="
echo "   NKB CLOUD v2.1.0 — VPS DATABASE INITIALIZER"
echo "=========================================================="

DB_CONTAINER="${1:-nkb_prod_postgres}"
DB_NAME="${POSTGRES_DB:-nkb_cloud_production}"
DB_USER="${POSTGRES_USER:-nkb_prod_admin}"
FORCE_FLAG="${2:-}"

echo "[1/5] Checking PostgreSQL container status ($DB_CONTAINER)..."
if ! docker ps --format '{{.Names}}' | grep -q "^${DB_CONTAINER}$"; then
    echo "ERROR: PostgreSQL container '${DB_CONTAINER}' is not running."
    exit 1
fi

echo "[2/5] Awaiting database readiness..."
docker exec "${DB_CONTAINER}" pg_isready -U "${DB_USER}" -d "${DB_NAME}" -t 30

echo "[3/5] Verifying database safety boundaries & existing schema state..."
# Check if migration tracking table exists
docker exec -i "${DB_CONTAINER}" psql -U "${DB_USER}" -d "${DB_NAME}" -v ON_ERROR_STOP=1 -c "
    CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(50) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
"

# Check if tables already exist in public schema (excluding schema_migrations)
EXISTING_TABLE_COUNT=$(docker exec -i "${DB_CONTAINER}" psql -U "${DB_USER}" -d "${DB_NAME}" -t -A -c "
    SELECT count(*) FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name != 'schema_migrations';
")

APPLIED_MIGRATIONS_COUNT=$(docker exec -i "${DB_CONTAINER}" psql -U "${DB_USER}" -d "${DB_NAME}" -t -A -c "
    SELECT count(*) FROM schema_migrations;
")

echo "  Existing user/system tables: ${EXISTING_TABLE_COUNT}"
echo "  Recorded applied migrations: ${APPLIED_MIGRATIONS_COUNT}"

if [ "${EXISTING_TABLE_COUNT}" -gt 0 ] && [ "${APPLIED_MIGRATIONS_COUNT}" -eq 0 ] && [ "${FORCE_FLAG}" != "--allow-untracked-existing" ]; then
    echo "================================================================================"
    echo "SAFETY HALT: Database '${DB_NAME}' already contains ${EXISTING_TABLE_COUNT} existing tables,"
    echo "but schema_migrations has no tracked history."
    echo "Running migrations against an existing unmanaged database could lead to data corruption."
    echo "To override after manual verification, pass: $0 <container> --allow-untracked-existing"
    echo "================================================================================"
    exit 1
fi

echo "[4/5] Evaluating and applying Schema Migrations 001 through 007..."
MIGRATION_DIR="server/db/migrations"
MIGRATIONS=(
    "001_initial_schema.sql"
    "002_v2.1.0_identity_security_dlp.sql"
    "003_add_missing_stage1_tables.sql"
    "004_audit_log_protection.sql"
    "005_audit_chain_concurrency_and_privilege_hardening.sql"
    "006_stage2_security_hardening.sql"
    "007_enterprise_departments_sharing_audit.sql"
)

# STRICT GUARD: Ensure Migration 008 does not exist
if compgen -G "${MIGRATION_DIR}/*008*" > /dev/null; then
    echo "SECURITY ERROR: Migration 008 detected in repository! Migration 008 is STRICTLY PROHIBITED."
    exit 1
fi

for mig in "${MIGRATIONS[@]}"; do
    version=$(echo "${mig}" | cut -d'_' -f1)
    
    # Assert version constraint (001-007 only)
    if [ "${version}" -gt "007" ]; then
        echo "SECURITY ERROR: Attempted to run unauthorized migration version ${version}!"
        exit 1
    fi

    mig_path="${MIGRATION_DIR}/${mig}"
    if [ ! -f "${mig_path}" ]; then
        echo "ERROR: Migration file ${mig_path} not found!"
        exit 1
    fi

    # Check if migration is already recorded in schema_migrations
    IS_APPLIED=$(docker exec -i "${DB_CONTAINER}" psql -U "${DB_USER}" -d "${DB_NAME}" -t -A -c "
        SELECT 1 FROM schema_migrations WHERE version = '${version}';
    ")

    if [ "${IS_APPLIED}" = "1" ]; then
        echo "  [ALREADY APPLIED] Migration ${version} (${mig}) — skipping."
        continue
    fi

    echo "  [APPLYING] Migration ${version}: ${mig}..."
    docker exec -i "${DB_CONTAINER}" psql -U "${DB_USER}" -d "${DB_NAME}" -v ON_ERROR_STOP=1 < "${mig_path}"
    
    # Record migration in tracking table
    docker exec -i "${DB_CONTAINER}" psql -U "${DB_USER}" -d "${DB_NAME}" -v ON_ERROR_STOP=1 -c "
        INSERT INTO schema_migrations (version, name, applied_at)
        VALUES ('${version}', '${mig}', CURRENT_TIMESTAMP)
        ON CONFLICT (version) DO NOTHING;
    "
    echo "  ✓ Migration ${version} successfully applied and recorded."
done

echo "[5/5] Final verification of schema_migrations ledger..."
docker exec -i "${DB_CONTAINER}" psql -U "${DB_USER}" -d "${DB_NAME}" -c "
    SELECT version, name, applied_at FROM schema_migrations ORDER BY version ASC;
"

echo "=========================================================="
echo "   DATABASE INITIALIZATION COMPLETE: MIGRATIONS 001-007"
echo "=========================================================="
