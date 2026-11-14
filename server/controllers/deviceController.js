import deviceService from '../services/deviceService.js';

/**
 * Returns current user's device installation and connection status
 */
export async function getMyDevice(req, res) {
  try {
    const status = await deviceService.getDeviceStatusForUser(req.user);
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * Generates an authenticated time-bounded enrollment token for the current user
 */
export async function generateEnrollmentToken(req, res) {
  try {
    const token = deviceService.generateEnrollmentToken(req.user);
    res.json({
      success: true,
      enrollmentToken: token,
      employeeName: req.user.full_name,
      departmentId: req.user.department_id,
      expiresInHours: 24,
      instructions: 'Run the NKB Storage Agent installer or execute the deployment script with this token.'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * Enrolls a workstation / device using an enrollment token
 * (Called by Storage Agent client or installer script)
 */
export async function enrollDevice(req, res) {
  try {
    const {
      enrollmentToken,
      machineName,
      osVersion,
      publicKey,
      agentVersion,
      hardwareFingerprint
    } = req.body;

    const ipAddress = req.ip || req.socket.remoteAddress || '127.0.0.1';

    const result = await deviceService.enrollDevice({
      enrollmentToken,
      machineName,
      osVersion,
      publicKey,
      agentVersion,
      ipAddress,
      hardwareFingerprint
    });

    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

/**
 * Returns an authenticated installer script (PowerShell for Windows, Shell/Swift for macOS)
 */
export async function getInstallerScript(req, res) {
  try {
    let user = req.user;
    if (!user && req.query.token) {
      try {
        const decoded = deviceService.verifyEnrollmentToken(req.query.token);
        user = { id: decoded.userId, full_name: decoded.un || 'Authorized Employee', email: decoded.email || 'employee@nkbcloud.com' };
      } catch (_) {}
    }
    if (!user) {
      user = { full_name: 'Authorized Employee', email: 'employee@nkbcloud.com' };
    }

    const token = req.query.token || deviceService.generateEnrollmentToken(user);
    const hostUrl = `${req.protocol}://${req.get('host')}`;
    const platform = (req.params.platform || req.query.platform || 'windows').toLowerCase();

    if (platform === 'linux') {
      const linuxScriptContent = `#!/usr/bin/env bash
# ==============================================================================
# NKB Cloud v2.1.0 -- Linux Storage Agent Automated Deployment Script
# Generated for: ${user.full_name} (${user.email})
# Server: ${hostUrl}
# ==============================================================================
set -euo pipefail

SERVER_URL="${hostUrl}"
ENROLLMENT_TOKEN="${token}"
CONFIG_DIR="/etc/nkb-cloud"
KEYS_DIR="/etc/nkb-cloud/keys"

echo "=========================================================="
echo "   NKB CLOUD -- LINUX STORAGE AGENT AUTOMATED INSTALLER"
echo "=========================================================="

if [ "$(id -u)" -ne 0 ]; then
    echo "ERROR: Please run this installer with sudo or as root."
    exit 1
fi

mkdir -p "$CONFIG_DIR" "$KEYS_DIR"
chmod 700 "$CONFIG_DIR" "$KEYS_DIR"

echo "[1/4] Generating device-isolated Ed25519 keypair in /etc/nkb-cloud/keys/..."
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
    OS_DESC="Linux (\${PRETTY_NAME:-$NAME})"
fi

echo "[2/4] Registering Linux endpoint with NKB Cloud ($MACHINE_NAME)..."
ENROLL_PAYLOAD=$(cat <<EOF
{
  "enrollmentToken": "$ENROLLMENT_TOKEN",
  "machineName": "$MACHINE_NAME",
  "osVersion": "$OS_DESC",
  "publicKey": $(echo "$PUB_PEM" | jq -s -R .),
  "agentVersion": "2.1.0"
}
EOF
)

ENROLL_RESP=$(curl -s -X POST "$SERVER_URL/api/devices/enroll" \\
    -H "Content-Type: application/json" \\
    -d "$ENROLL_PAYLOAD")

AGENT_ID=$(echo "$ENROLL_RESP" | jq -r '.agentId')
AGENT_TOKEN=$(echo "$ENROLL_RESP" | jq -r '.agentToken')
STATUS=$(echo "$ENROLL_RESP" | jq -r '.status')

echo "  -> Device enrolled with Agent ID: $AGENT_ID"
echo "  -> Current status: $STATUS (Awaiting Administrator Approval)"

echo "[3/4] Writing agent configuration to /etc/nkb-cloud/agent-config.json..."
cat <<EOF > "$CONFIG_DIR/agent-config.json"
{
  "serverUrl": "$SERVER_URL/ws/agent",
  "agentToken": "$AGENT_TOKEN",
  "agentId": "$AGENT_ID",
  "machineName": "$MACHINE_NAME",
  "keyPath": "$PRIV_KEY"
}
EOF
chmod 600 "$CONFIG_DIR/agent-config.json"

echo "[4/4] Linux agent enrolled successfully. The service will connect upon administrator approval."
`;
      res.setHeader('Content-Type', 'text/x-shellscript');
      res.setHeader('Content-Disposition', 'attachment; filename="deploy-nkb-agent.sh"');
      return res.send(linuxScriptContent);
    }

    if (platform === 'macos') {
      const macScriptContent = `#!/usr/bin/env bash
# ==============================================================================
# NKB Cloud v2.1.0 -- macOS Storage Agent Automated Deployment Script
# Generated for: ${user.full_name} (${user.email})
# Server: ${hostUrl}
# ==============================================================================
set -e

SERVER_URL="${hostUrl}"
ENROLLMENT_TOKEN="${token}"
AGENT_DIR="$HOME/Library/Application Support/NKBCloud/StorageAgent"
KEYS_DIR="$AGENT_DIR/keys"

echo "=========================================================="
echo "   NKB CLOUD -- MACOS STORAGE AGENT AUTOMATED INSTALLER"
echo "=========================================================="

mkdir -p "$KEYS_DIR"
chmod 700 "$KEYS_DIR"

echo "[1/4] Generating device-isolated Ed25519 keypair in Keychain/Secure Storage..."
PRIV_KEY="$KEYS_DIR/device_private.pem"
PUB_KEY="$KEYS_DIR/device_public.pem"

if [ ! -f "$PRIV_KEY" ]; then
    openssl genpkey -algorithm ED25519 -out "$PRIV_KEY" 2>/dev/null
    openssl pkey -in "$PRIV_KEY" -pubout -out "$PUB_KEY" 2>/dev/null
    chmod 600 "$PRIV_KEY"
fi

PUB_PEM=$(cat "$PUB_KEY")
MACHINE_NAME=$(scutil --get ComputerName 2>/dev/null || hostname -s)
OS_VERSION=$(sw_vers -productType 2>/dev/null || echo "macOS")" "$(sw_vers -productVersion 2>/dev/null || echo "")

echo "[2/4] Registering macOS workstation with NKB Cloud ($MACHINE_NAME)..."
ENROLL_PAYLOAD=$(cat <<EOF
{
  "enrollmentToken": "$ENROLLMENT_TOKEN",
  "machineName": "$MACHINE_NAME",
  "osVersion": "$OS_VERSION",
  "publicKey": $(echo "$PUB_PEM" | jq -s -R .),
  "agentVersion": "2.1.0"
}
EOF
)

ENROLL_RESP=$(curl -s -X POST "$SERVER_URL/api/devices/enroll" \\
    -H "Content-Type: application/json" \\
    -d "$ENROLL_PAYLOAD")

AGENT_ID=$(echo "$ENROLL_RESP" | jq -r '.agentId')
AGENT_TOKEN=$(echo "$ENROLL_RESP" | jq -r '.agentToken')
STATUS=$(echo "$ENROLL_RESP" | jq -r '.status')

echo "  -> Device enrolled with Agent ID: $AGENT_ID"
echo "  -> Current status: $STATUS (Awaiting Administrator Approval)"

echo "[3/4] Writing agent configuration..."
cat <<EOF > "$AGENT_DIR/agent-config.json"
{
  "serverUrl": "$SERVER_URL/ws/agent",
  "agentToken": "$AGENT_TOKEN",
  "agentId": "$AGENT_ID",
  "machineName": "$MACHINE_NAME",
  "keyPath": "$PRIV_KEY"
}
EOF

echo "[4/4] Installation Complete! The agent will connect upon administrator approval."
`;
      res.setHeader('Content-Type', 'text/x-shellscript');
      res.setHeader('Content-Disposition', 'attachment; filename="deploy-nkb-agent.sh"');
      return res.send(macScriptContent);
    }

    const scriptContent = `# ==============================================================================
# NKB Cloud v2.1.0 -- Storage Agent Automated Deployment Script
# Generated for: ${user.full_name} (${user.email})
# Server: ${hostUrl}
# ==============================================================================
$ServerUrl = "${hostUrl}"
if ($token -and (-not $EnrollmentToken)) {
    $EnrollmentToken = $token
}
if (-not $EnrollmentToken) {
    $EnrollmentToken = "${token}"
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   NKB CLOUD -- STORAGE AGENT AUTOMATED INSTALLER" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# Check Administrator Privileges
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Warning "NOTICE: Running in user space. Administrator elevation is recommended for Windows Service installation."
}

$InstallDir = Join-Path $env:ProgramFiles "NKB Cloud\\Storage Agent"
if (-not $isAdmin) {
    $InstallDir = Join-Path $env:LOCALAPPDATA "NKB Cloud\\Storage Agent"
}

Write-Host "[1/4] Preparing agent workspace: $InstallDir"
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $InstallDir "keys") | Out-Null

Write-Host "[2/4] Generating device-specific Ed25519 keypair..."
$PrivKeyPath = Join-Path $InstallDir "keys\\device_private.pem"
$PubKeyPath = Join-Path $InstallDir "keys\\device_public.pem"
$KeyGenScript = Join-Path $InstallDir "keygen.js"

$b64 = "Y29uc3QgY3J5cHRvID0gcmVxdWlyZSgnY3J5cHRvJyk7CmNvbnN0IGZzID0gcmVxdWlyZSgnZnMnKTsKCmNvbnN0IHByaXZQYXRoID0gcHJvY2Vzcy5hcmd2WzJdOwpjb25zdCBwdWJQYXRoID0gcHJvY2Vzcy5hcmd2WzNdOwoKaWYgKCFmcy5leGlzdHNTeW5jKHByaXZQYXRoKSkgewogIGNvbnN0IGsgPSBjcnlwdG8uZ2VuZXJhdGVLZXlQYWlyU3luYygnZWQyNTUxOScpOwogIGZzLndyaXRlRmlsZVN5bmMocHJpdlBhdGgsIGsucHJpdmF0ZUtleS5leHBvcnQoeyB0eXBlOiAncGtjczgnLCBmb3JtYXQ6ICdwZW0nIH0pKTsKICBmcy53cml0ZUZpbGVTeW5jKHB1YlBhdGgsIGsucHVibGljS2V5LmV4cG9ydCh7IHR5cGU6ICdzcGtpJywgZm9ybWF0OiAncGVtJyB9KSk7Cn0K"
[System.IO.File]::WriteAllBytes($KeyGenScript, [System.Convert]::FromBase64String($b64))
node $KeyGenScript $PrivKeyPath $PubKeyPath
Remove-Item -Path $KeyGenScript -Force -ErrorAction SilentlyContinue

$PubPem = Get-Content -Raw -Path $PubKeyPath

Write-Host "[3/4] Registering device with NKB Cloud Server..."
$Body = @{
    enrollmentToken = $EnrollmentToken
    machineName = $env:COMPUTERNAME
    osVersion = (Get-CimInstance Win32_OperatingSystem).Caption
    publicKey = $PubPem.Trim()
    agentVersion = "2.1.0"
} | ConvertTo-Json

try {
    $Response = Invoke-RestMethod -Uri "$ServerUrl/api/devices/enroll" -Method Post -Body $Body -ContentType "application/json"
    Write-Host "  -> Device registered: Agent ID $($Response.agentId)" -ForegroundColor Green
    Write-Host "  -> Device Status:    $($Response.status)" -ForegroundColor Yellow

    # Save Agent Configuration
    $Config = @{
        serverUrl = "$ServerUrl/ws/agent"
        agentToken = $Response.agentToken
        agentId = $Response.agentId
        machineName = $env:COMPUTERNAME
        keyPath = $PrivKeyPath
    } | ConvertTo-Json

    $ConfigPath = Join-Path $InstallDir "agent-config.json"
    Set-Content -Path $ConfigPath -Value $Config

    # Launch local agent daemon automatically if storage-agent exists
    $SourceAgentPath = "J:\\IT STAFF\\PROGRAM FILES\\NKB Cloud\\storage-agent\\index.js"
    if (Test-Path $SourceAgentPath) {
        Write-Host "  -> Launching Storage Agent daemon in background..." -ForegroundColor White
        Start-Process -FilePath "node.exe" -ArgumentList $SourceAgentPath -WindowStyle Hidden -ErrorAction SilentlyContinue
    }

    Write-Host "[4/4] Installation and Enrollment Complete!" -ForegroundColor Green
    Write-Host "Workstation enrolled successfully: $env:COMPUTERNAME" -ForegroundColor Cyan
    Write-Host "Agent will connect automatically upon Administrator Approval in Dashboard." -ForegroundColor Yellow
} catch {
    Write-Host "Enrollment notice: $($_.Exception.Message)" -ForegroundColor Red
}
`;

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="deploy-nkb-agent.ps1"');
    res.send(scriptContent);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * Returns configuration payload for mobile application enrollment (Android & iOS)
 */
export async function getMobileEnrollmentConfig(req, res) {
  try {
    const token = deviceService.generateEnrollmentToken(req.user);
    const hostUrl = `${req.protocol}://${req.get('host')}`;
    const deepLink = `nkbcloud://enroll?token=${encodeURIComponent(token)}&server=${encodeURIComponent(hostUrl)}`;

    res.json({
      success: true,
      serverUrl: hostUrl,
      enrollmentToken: token,
      employeeName: req.user.full_name,
      departmentId: req.user.department_id,
      deepLink,
      qrPayload: JSON.stringify({
        serverUrl: hostUrl,
        enrollmentToken: token,
        employeeName: req.user.full_name,
        departmentId: req.user.department_id,
        version: '2.1.0'
      }),
      instructions: 'Scan this QR code or click the deep link in the NKB Cloud Android or iOS mobile application to enroll this mobile device.'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * Handles device key rotation
 */
export async function rotateDeviceKey(req, res) {
  try {
    const { agentId } = req.params;
    const { newPublicKey, signature } = req.body;
    const result = await deviceService.rotateDeviceKey(agentId, newPublicKey, signature);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}
