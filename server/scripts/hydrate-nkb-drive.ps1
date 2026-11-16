param(
    [string]$ServerUrl = "https://nkbcloud.nkbmanufacturing.com",
    [string]$Email = "admin@nkbmanufacturing.com",
    [string]$Password = "Admin@NKB2026!"
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Security

Write-Host "[1/5] Authenticating with $ServerUrl as $Email..."
$loginBody = @{
    identifier = $Email
    password = $Password
} | ConvertTo-Json

$loginRes = Invoke-RestMethod -Uri "$ServerUrl/api/auth/login" -Method Post -ContentType "application/json" -Body $loginBody
$token = $loginRes.token
if (-not $token) {
    throw "Login failed: No token returned."
}
Write-Host "      Logged in! User: $($loginRes.user.fullName) ($($loginRes.user.role))"

Write-Host "[2/5] Registering device..."
$machine = $env:COMPUTERNAME
$fp = "HW-" + [System.Guid]::NewGuid().ToString("N").Substring(0, 12).ToUpper()

$regBody = @{
    machineName = $machine
    hardwareFingerprint = $fp
    osVersion = "Windows 11 x64"
    clientVersion = "2.1.0"
} | ConvertTo-Json

$headers = @{
    Authorization = "Bearer $token"
}

$regRes = Invoke-RestMethod -Uri "$ServerUrl/api/v1/drive/devices/register" -Method Post -ContentType "application/json" -Headers $headers -Body $regBody
$deviceId = $regRes.device.id
Write-Host "      Device Registered! ID: $deviceId"

Write-Host "[3/5] Writing encrypted DPAPI vault.dat..."
$workDir = Join-Path $env:LOCALAPPDATA "NKB Drive"
if (-not (Test-Path $workDir)) {
    New-Item -ItemType Directory -Path $workDir -Force | Out-Null
}

$nowIso = (Get-Date).ToUniversalTime().ToString("o")
$serialized = "$ServerUrl`n$token`n$deviceId`n$Email`n$machine`n$nowIso"

$plainBytes = [System.Text.Encoding]::UTF8.GetBytes($serialized)
$prefix = [System.Text.Encoding]::UTF8.GetBytes("NKB-Enterprise-DPAPI-Entropy-v2.1")
$userBytes = [System.Text.Encoding]::UTF8.GetBytes("$env:USERNAME@$env:COMPUTERNAME")

$entropy = New-Object byte[] ($prefix.Length + $userBytes.Length)
[System.Buffer]::BlockCopy($prefix, 0, $entropy, 0, $prefix.Length)
[System.Buffer]::BlockCopy($userBytes, 0, $entropy, $prefix.Length, $userBytes.Length)

$cipher = [System.Security.Cryptography.ProtectedData]::Protect($plainBytes, $entropy, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)
$vaultFile = Join-Path $workDir "vault.dat"
[System.IO.File]::WriteAllBytes($vaultFile, $cipher)
Write-Host "      DPAPI Vault saved at $vaultFile"

Write-Host "[4/5] Fetching directory tree from cloud..."
$treeHeaders = @{
    Authorization = "Bearer $token"
    "x-device-id" = $deviceId
}
$treeRes = Invoke-RestMethod -Uri "$ServerUrl/api/v1/drive/tree" -Method Get -Headers $treeHeaders
$folderCount = $treeRes.rootFolders.Count
$fileCount = $treeRes.files.Count
Write-Host "      Tree received: $folderCount folders, $fileCount files."

# Save tree to temporary JSON file for python SQLite insertion
$treeJsonPath = Join-Path $workDir "temp_tree.json"
$treeRes | ConvertTo-Json -Depth 10 | Set-Content -Path $treeJsonPath -Encoding UTF8

Write-Host "[5/5] Hydrating local SQLite database (metadata.db)..."
$pyScript = @"
import sqlite3, json, os, sys
from datetime import datetime

work_dir = os.path.join(os.environ['LOCALAPPDATA'], 'NKB Drive')
db_path = os.path.join(work_dir, 'metadata.db')
tree_path = os.path.join(work_dir, 'temp_tree.json')

with open(tree_path, 'r', encoding='utf-8-sig') as f:
    tree = json.load(f)

conn = sqlite3.connect(db_path)
cur = conn.cursor()

# Update device_state
now_str = datetime.utcnow().isoformat() + 'Z'
cur.execute('''
    INSERT INTO device_state (id, device_id, machine_name, hardware_fingerprint, approval_status, target_drive_letter, last_sync_at)
    VALUES (1, ?, ?, ?, 'APPROVED', 'N:', ?)
    ON CONFLICT(id) DO UPDATE SET
        device_id=excluded.device_id,
        machine_name=excluded.machine_name,
        hardware_fingerprint=excluded.hardware_fingerprint,
        approval_status=excluded.approval_status,
        last_sync_at=excluded.last_sync_at
''', ('$deviceId', '$machine', '$fp', now_str))

# Upsert root folders
folders = tree.get('rootFolders', [])
for f in folders:
    fid = f.get('id')
    name = f.get('name')
    path = f.get('virtualPath') or ('\\\\' + name)
    cur.execute('''
        INSERT INTO local_files (file_id, relative_path, name, size_bytes, sha256, sync_state, server_updated_at, local_updated_at)
        VALUES (?, ?, ?, 0, 'DIRECTORY', 'SYNCED', ?, ?)
        ON CONFLICT(file_id) DO UPDATE SET
            relative_path=excluded.relative_path,
            name=excluded.name,
            sync_state='SYNCED',
            server_updated_at=excluded.server_updated_at,
            local_updated_at=excluded.local_updated_at
    ''', (fid, path, name, now_str, now_str))

# Upsert files
files = tree.get('files', [])
for f in files:
    fid = f.get('id')
    name = f.get('name')
    path = f.get('virtualPath') or ('\\\\' + name)
    size = f.get('sizeBytes') or f.get('size_bytes') or 0
    sha = f.get('sha256') or ''
    cur.execute('''
        INSERT INTO local_files (file_id, relative_path, name, size_bytes, sha256, sync_state, server_updated_at, local_updated_at)
        VALUES (?, ?, ?, ?, ?, 'ONLINE_ONLY', ?, ?)
        ON CONFLICT(file_id) DO UPDATE SET
            relative_path=excluded.relative_path,
            name=excluded.name,
            size_bytes=excluded.size_bytes,
            sha256=excluded.sha256,
            sync_state='ONLINE_ONLY',
            server_updated_at=excluded.server_updated_at,
            local_updated_at=excluded.local_updated_at
    ''', (fid, path, name, size, sha, now_str, now_str))

conn.commit()

cur.execute('SELECT COUNT(*) FROM local_files')
total_rows = cur.fetchone()[0]
print(f'SQLite database updated! Total entries in local_files: {total_rows}')

conn.close()

if os.path.exists(tree_path):
    os.remove(tree_path)
"@

$pyScriptPath = Join-Path $workDir "populate.py"
[System.IO.File]::WriteAllText($pyScriptPath, $pyScript)

python $pyScriptPath

Remove-Item -Path $pyScriptPath -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host " NKB DRIVE INITIAL HYDRATION COMPLETED SUCCESSFULLY!" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
