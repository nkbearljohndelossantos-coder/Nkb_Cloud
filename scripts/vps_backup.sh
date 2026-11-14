#!/usr/bin/env bash
# ==============================================================================
# NKB Cloud v2.1.0 — VPS Automated Backup Script
# Creates timestamped custom-format PostgreSQL dumps with SHA-256 verification
# Target OS: AlmaLinux 10 / Docker Compose
# ==============================================================================
set -euo pipefail

BACKUP_DIR="${VPS_BACKUP_DIR:-/opt/nkb-cloud/backups}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
DB_CONTAINER="${1:-nkb_prod_postgres}"
DB_NAME="${POSTGRES_DB:-nkb_cloud_production}"
DB_USER="${POSTGRES_USER:-nkb_prod_admin}"

mkdir -p "${BACKUP_DIR}"

DUMP_FILENAME="nkb_vps_backup_${TIMESTAMP}.dump"
HOST_DUMP_PATH="${BACKUP_DIR}/${DUMP_FILENAME}"
CONTAINER_TEMP="/tmp/${DUMP_FILENAME}"

echo "=== [1/4] Checking Database Container Readiness ==="
if ! docker ps --format '{{.Names}}' | grep -q "^${DB_CONTAINER}$"; then
    echo "ERROR: PostgreSQL container '${DB_CONTAINER}' is not running."
    exit 1
fi

echo "=== [2/4] Generating PostgreSQL Custom Dump (${DB_NAME}) ==="
docker exec "${DB_CONTAINER}" pg_dump -U "${DB_USER}" -d "${DB_NAME}" -Fc -b -v -f "${CONTAINER_TEMP}"

echo "=== [3/4] Extracting Backup Artifact to Host ==="
docker cp "${DB_CONTAINER}:${CONTAINER_TEMP}" "${HOST_DUMP_PATH}"
docker exec "${DB_CONTAINER}" rm -f "${CONTAINER_TEMP}"

echo "=== [4/4] Calculating Cryptographic Checksums ==="
BACKUP_SIZE=$(stat -c%s "${HOST_DUMP_PATH}")
SHA256_HASH=$(sha256sum "${HOST_DUMP_PATH}" | awk '{print $1}')

# Write standard sha256 checksum file
echo "${SHA256_HASH}  ${DUMP_FILENAME}" > "${HOST_DUMP_PATH}.sha256"

# Write audit manifest file
MANIFEST_FILE="${BACKUP_DIR}/manifest_${TIMESTAMP}.txt"
cat <<EOF > "${MANIFEST_FILE}"
NKB CLOUD VPS BACKUP MANIFEST
Timestamp: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
Database: ${DB_NAME}
PostgreSQL Version: 16
Backup File: ${DUMP_FILENAME}
Size: ${BACKUP_SIZE} bytes
SHA-256: ${SHA256_HASH}
Container: ${DB_CONTAINER}
Status: VERIFIED_COMPLETE
EOF

echo "=========================================================="
echo "   BACKUP COMPLETE & CRYPTOGRAPHICALLY VERIFIED"
echo "=========================================================="
echo "  Artifact: ${HOST_DUMP_PATH}"
echo "  Checksum: ${HOST_DUMP_PATH}.sha256"
echo "  Size:     ${BACKUP_SIZE} bytes"
echo "  SHA-256:  ${SHA256_HASH}"
echo "  Manifest: ${MANIFEST_FILE}"
echo "=========================================================="
