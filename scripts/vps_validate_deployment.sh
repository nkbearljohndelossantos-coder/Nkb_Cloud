#!/usr/bin/env bash
# ==============================================================================
# NKB Cloud v2.1.0 — VPS Deployment Health & Security Validation Script
# Automated post-deployment smoke test suite
# Target OS: AlmaLinux 10
# ==============================================================================
set -euo pipefail

BASE_URL="${1:-https://localhost}"
CURL_OPTS="-k -s -o /dev/null -w %{http_code}"

echo "=========================================================="
echo "   NKB CLOUD VPS DEPLOYMENT VALIDATION"
echo "   Target Base URL: ${BASE_URL}"
echo "=========================================================="

FAILED=0

check() {
    local name="$1"
    local expected_code="$2"
    local actual_code="$3"
    if [ "${actual_code}" -eq "${expected_code}" ]; then
        echo "  [PASS] ${name} (HTTP ${actual_code})"
    else
        echo "  [FAIL] ${name} (Expected: ${expected_code}, Got: ${actual_code})"
        FAILED=$((FAILED + 1))
    fi
}

echo "[1/6] Probing Frontend SPA Entrypoint..."
CODE=$(curl ${CURL_OPTS} "${BASE_URL}/")
check "Frontend Root Access" 200 "${CODE}"

echo "[2/6] Probing Backend Health Endpoint..."
HEALTH_BODY=$(curl -k -s "${BASE_URL}/api/health" || curl -k -s "${BASE_URL}/health")
if echo "${HEALTH_BODY}" | grep -q "NKB Cloud"; then
    echo "  [PASS] Health Endpoint Payload Verified"
else
    echo "  [FAIL] Health Endpoint Payload Mismatch: ${HEALTH_BODY}"
    FAILED=$((FAILED + 1))
fi

echo "[3/6] Probing Unauthenticated Protected Route..."
CODE=$(curl ${CURL_OPTS} "${BASE_URL}/api/files")
# Should be 401 Unauthorized or 503 if maintenance gate active
if [ "${CODE}" -eq 401 ] || [ "${CODE}" -eq 503 ]; then
    echo "  [PASS] Protected Route Correctly Blocked (HTTP ${CODE})"
else
    echo "  [FAIL] Protected Route Fail-Open! (HTTP ${CODE})"
    FAILED=$((FAILED + 1))
fi

echo "[4/6] Probing Security Headers..."
HEADERS=$(curl -k -s -I "${BASE_URL}/")
for header in "X-Frame-Options" "X-Content-Type-Options" "Referrer-Policy"; do
    if echo "${HEADERS}" | grep -qi "${header}"; then
        echo "  [PASS] Security Header Present: ${header}"
    else
        echo "  [WARN] Missing Security Header: ${header}"
    fi
done

echo "[5/6] Probing WebSocket Ingress (/ws/agent)..."
WS_CODE=$(curl ${CURL_OPTS} -H "Upgrade: websocket" -H "Connection: Upgrade" -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" -H "Sec-WebSocket-Version: 13" "${BASE_URL}/ws/agent")
# Expect HTTP 101 Switching Protocols or HTTP 400/403/503 (Gate/Auth rejection)
if [ "${WS_CODE}" -eq 101 ] || [ "${WS_CODE}" -eq 400 ] || [ "${WS_CODE}" -eq 403 ] || [ "${WS_CODE}" -eq 503 ]; then
    echo "  [PASS] WebSocket Route Handled Appropriately (HTTP ${WS_CODE})"
else
    echo "  [FAIL] WebSocket Ingress Broken (HTTP ${WS_CODE})"
    FAILED=$((FAILED + 1))
fi

echo "[6/6] Verifying Container Runtime..."
for container in "nkb_prod_postgres" "nkb_prod_backend" "nkb_prod_frontend" "nkb_prod_nginx"; do
    if docker ps --format '{{.Names}}' | grep -q "^${container}$"; then
        echo "  [PASS] Container Active: ${container}"
    else
        echo "  [FAIL] Container Not Running: ${container}"
        FAILED=$((FAILED + 1))
    fi
done

echo "=========================================================="
if [ ${FAILED} -eq 0 ]; then
    echo ">>> ALL VALIDATION CHECKS PASSED: DEPLOYMENT HEALTHY <<<"
    exit 0
else
    echo ">>> VALIDATION FAILED WITH ${FAILED} ERROR(S) <<<"
    exit 1
fi
