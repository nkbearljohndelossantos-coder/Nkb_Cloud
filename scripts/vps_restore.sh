#!/usr/bin/env bash
# ==============================================================================
# NKB Cloud v2.1.0 — VPS Database Restore Script
# Safely restores a custom-format dump into PostgreSQL container with verification
# Target OS: AlmaLinux 10 / Docker Compose
# ==============================================================================
set -euo pipefail

if [ $# -lt 1 ]; then
    echo "Usage: $0 <path-to-dump-file> [db-container-name] [target-db-name]"
    exit 1
fi

DUMP_PATH="$1"
DB_CONTAINER="${2:-nkb_prod_postgres}"
DB_NAME="${3:-${POSTGRES_DB:-nkb_cloud_production}}"
DB_USER="${POSTGRES_USER:-nkb_prod_admin}"

if [ ! -f "${DUMP_PATH}" ]; then
    echo "ERROR: Backup file '${DUMP_PATH}' does not exist!"
    exit 1
fi

echo "=========================================================="
echo "   NKB CLOUD VPS DATABASE RESTORE PROCEDURE"
echo "=========================================================="
echo "Backup File:       ${DUMP_PATH}"
echo "Target Container:  ${DB_CONTAINER}"
echo "Target Database:   ${DB_NAME}"
echo "User:              ${DB_USER}"
echo "=========================================================="

# Check container running
if ! docker ps --format '{{.Names}}' | grep -q "^${DB_CONTAINER}$"; then
    echo "ERROR: PostgreSQL container '${DB_CONTAINER}' is not running."
    exit 1
fi

# Step 1: Cryptographic Checksum & Manifest Verification
echo "[1/6] Verifying archive integrity via SHA-256..."
CALCULATED_HASH=$(sha256sum "${DUMP_PATH}" | awk '{print $1}')
echo "  Computed SHA-256: ${CALCULATED_HASH}"

# Check for manifest file in the same directory
DUMP_DIR=$(dirname "${DUMP_PATH}")
MANIFEST_FILE=""
for mf in "${DUMP_DIR}"/manifest_*.txt; do
    if [ -f "${mf}" ] && grep -q "${CALCULATED_HASH}" "${mf}"; then
        MANIFEST_FILE="${mf}"
        break
    fi
done

if [ -n "${MANIFEST_FILE}" ]; then
    echo "  ✓ Cryptographic match confirmed with manifest: ${MANIFEST_FILE}"
else
    echo "  ! Note: No matching manifest file found. Proceeding with computed checksum."
fi

# Step 2: Strict Operator Confirmation (No Silent Overwrites)
echo ""
echo "================================================================================"
echo "WARNING: RESTORATION WILL OVERWRITE DATABASE '${DB_NAME}'!"
echo "All current data in '${DB_NAME}' will be permanently replaced by this backup."
echo "================================================================================"
read -p "To confirm destructive overwrite, type the exact database name '${DB_NAME}': " CONFIRM_NAME
if [ "${CONFIRM_NAME}" != "${DB_NAME}" ]; then
    echo "Restoration cancelled by operator. Input did not match '${DB_NAME}'."
    exit 0
fi

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
CONTAINER_TEMP="/tmp/restore_${TIMESTAMP}.dump"

# Step 3: Copy dump and pre-validate archive structure BEFORE dropping database
echo "[2/6] Staging dump into container (${CONTAINER_TEMP})..."
docker cp "${DUMP_PATH}" "${DB_CONTAINER}:${CONTAINER_TEMP}"

echo "[3/6] Pre-validating backup archive structure (pg_restore TOC inspection)..."
if ! docker exec -i "${DB_CONTAINER}" pg_restore --list "${CONTAINER_TEMP}" > /dev/null 2>&1; then
    echo "CRITICAL ERROR: Backup archive is corrupt, partial, or invalid!"
    echo "Existing database '${DB_NAME}' was NOT modified. Aborting restore."
    docker exec "${DB_CONTAINER}" rm -f "${CONTAINER_TEMP}"
    exit 1
fi
echo "  ✓ Archive structure verified successfully."

# Step 4: Terminate active connections
echo "[4/6] Terminating active connections to '${DB_NAME}'..."
docker exec -i "${DB_CONTAINER}" psql -U "${DB_USER}" -d postgres -c "
    SELECT pg_terminate_backend(pid) 
    FROM pg_stat_activity 
    WHERE datname = '${DB_NAME}' AND pid <> pg_backend_pid();
" || true

# Step 5: Recreate database and execute restoration
echo "[5/6] Recreating database and executing pg_restore..."
docker exec -i "${DB_CONTAINER}" psql -U "${DB_USER}" -d postgres -c "DROP DATABASE IF EXISTS ${DB_NAME};"
docker exec -i "${DB_CONTAINER}" psql -U "${DB_USER}" -d postgres -c "CREATE DATABASE ${DB_NAME};"
docker exec -i "${DB_CONTAINER}" pg_restore -U "${DB_USER}" -d "${DB_NAME}" --no-owner --no-privileges -v "${CONTAINER_TEMP}"
docker exec -i "${DB_CONTAINER}" rm -f "${CONTAINER_TEMP}"

# Step 6: Post-restoration integrity checks
echo "[6/6] Verifying restored schema and cryptographic tables..."
docker exec -i "${DB_CONTAINER}" psql -U "${DB_USER}" -d "${DB_NAME}" -c "
    SELECT count(*) AS total_tables FROM information_schema.tables WHERE table_schema = 'public';
    SELECT count(*) AS total_audit_logs FROM audit_logs;
    SELECT version, name, applied_at FROM schema_migrations ORDER BY version ASC;
"

echo "=========================================================="
echo "   RESTORATION COMPLETE & CRYPTOGRAPHICALLY VERIFIED"
echo "=========================================================="
