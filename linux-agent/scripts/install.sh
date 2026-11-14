#!/usr/bin/env bash
# ==============================================================================
# NKB Cloud v2.1.0 — Enterprise Linux Storage Agent Automated Installer
# Supported: Ubuntu 20.04/22.04/24.04, Debian 11/12, RHEL 8/9, Rocky/AlmaLinux 9/10
# ==============================================================================
set -euo pipefail

SERVER_URL="${1:-https://cloud.nkb.local}"
ENROLLMENT_TOKEN="${2:-}"

echo "=========================================================="
echo "   NKB CLOUD — LINUX STORAGE AGENT ENTERPRISE INSTALLER"
echo "=========================================================="

if [ "$(id -u)" -ne 0 ]; then
    echo "ERROR: Root or sudo privileges are required for systemd service installation."
    exit 1
fi

INSTALL_DIR="/opt/nkb-cloud/storage-agent"
CONFIG_DIR="/etc/nkb-cloud"
KEYS_DIR="/etc/nkb-cloud/keys"

echo "[1/5] Creating restricted directory structure..."
mkdir -p "$INSTALL_DIR" "$CONFIG_DIR" "$KEYS_DIR"
chmod 700 "$CONFIG_DIR" "$KEYS_DIR"

echo "[2/5] Generating device-isolated Ed25519 keypair..."
PRIV_KEY="$KEYS_DIR/device_private.pem"
PUB_KEY="$KEYS_DIR/device_public.pem"

if [ ! -f "$PRIV_KEY" ]; then
    openssl genpkey -algorithm ED25519 -out "$PRIV_KEY" 2>/dev/null
    openssl pkey -in "$PRIV_KEY" -pubout -out "$PUB_KEY" 2>/dev/null
    chmod 600 "$PRIV_KEY"
    chmod 644 "$PUB_KEY"
fi

PUB_PEM=$(cat "$PUB_KEY")
MACHINE_NAME=$(hostname -f 2>/dev/null || hostname)
OS_DESC="Linux"
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS_DESC="Linux (${PRETTY_NAME:-$NAME})"
fi

if [ -n "$ENROLLMENT_TOKEN" ]; then
    echo "[3/5] Enrolling Linux endpoint with NKB Cloud ($MACHINE_NAME)..."
    PAYLOAD=$(jq -n \
        --arg token "$ENROLLMENT_TOKEN" \
        --arg machine "$MACHINE_NAME" \
        --arg os "$OS_DESC" \
        --arg pub "$PUB_PEM" \
        --arg ver "2.1.0" \
        '{enrollmentToken: $token, machineName: $machine, osVersion: $os, publicKey: $pub, agentVersion: $ver}')

    RESP=$(curl -s -X POST "$SERVER_URL/api/devices/enroll" \
        -H "Content-Type: application/json" \
        -d "$PAYLOAD")

    AGENT_ID=$(echo "$RESP" | jq -r '.agentId')
    AGENT_TOKEN=$(echo "$RESP" | jq -r '.agentToken')
    STATUS=$(echo "$RESP" | jq -r '.status')

    echo "  -> Device enrolled with Agent ID: $AGENT_ID"
    echo "  -> Device Status: $STATUS (Awaiting Administrator Approval)"

    echo "[4/5] Writing configuration to $CONFIG_DIR/agent-config.json..."
    jq -n \
        --arg srv "$SERVER_URL/ws/agent" \
        --arg id "$AGENT_ID" \
        --arg tok "$AGENT_TOKEN" \
        --arg name "$MACHINE_NAME" \
        --arg key "$PRIV_KEY" \
        '{serverUrl: $srv, agentId: $id, agentToken: $tok, machineName: $name, keyPath: $key}' \
        > "$CONFIG_DIR/agent-config.json"
    chmod 600 "$CONFIG_DIR/agent-config.json"
fi

echo "[5/5] Installing and enabling systemd unit..."
cp systemd/nkb-storage-agent.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now nkb-storage-agent.service

echo "=========================================================="
echo "INSTALLATION COMPLETE: NKB Storage Agent active on $MACHINE_NAME"
echo "Status probe active on http://127.0.0.1:51248/status"
echo "=========================================================="
