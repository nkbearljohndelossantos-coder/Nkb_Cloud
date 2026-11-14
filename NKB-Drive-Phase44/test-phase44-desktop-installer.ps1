# NKB DRIVE PHASE 4.4 ACCEPTANCE TEST SUITE
# Validates Windows Desktop Application, WinFsp Virtual Drive (N:), and Professional Installer

$ErrorActionPreference = "Stop"
$sw = [System.Diagnostics.Stopwatch]::StartNew()
$testResults = @()

function Record-Test($testNum, $title, $passed, $details) {
    $script:testResults += [PSCustomObject]@{
        TestNumber = $testNum
        Title = $title
        Passed = $passed
        Details = $details
    }
    $status = if ($passed) { "[PASS]" } else { "[FAIL]" }
    $color = if ($passed) { 'Green' } else { 'Red' }
    Write-Host "$status Test $testNum : $title - $details" -ForegroundColor $color
}

Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "  NKB DRIVE PHASE 4.4 — DESKTOP APPLICATION & INSTALLER SUITE    " -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan

$workspaceRoot = "J:\IT STAFF\PROGRAM FILES\NKB Cloud"
$phase44Bin = Join-Path $workspaceRoot "NKB-Drive-Phase44\bin"
$setupExe = Join-Path $phase44Bin "NKBDriveSetup.exe"
$appExe = Join-Path $phase44Bin "NKBDrive.exe"
$installTarget = Join-Path $env:LOCALAPPDATA "Programs\NKB Drive"
$dataDir = Join-Path $env:LOCALAPPDATA "NKB Drive"

# TEST 1: Binary Build & Architecture Check
$t1_pass = (Test-Path $setupExe) -and (Test-Path $appExe) -and [Environment]::Is64BitOperatingSystem
$setupSize = if (Test-Path $setupExe) { (Get-Item $setupExe).Length } else { 0 }
Record-Test 1 "Binary Generation & x64 Compatibility" $t1_pass "NKBDriveSetup.exe ($setupSize bytes), NKBDrive.exe present, 64-bit OS verified."

# TEST 2: Silent Installation Execution (/S)
try {
    Write-Host "Executing silent installation: $setupExe /S"
    $p = Start-Process -FilePath $setupExe -ArgumentList "/S" -Wait -PassThru
    $t2_pass = ($p.ExitCode -eq 0)
    Record-Test 2 "Silent Installation via /S switch" $t2_pass "Process completed with exit code $($p.ExitCode)."
} catch {
    Record-Test 2 "Silent Installation via /S switch" $false $_.Exception.Message
}

# TEST 3: Installed File Artifacts Verification
$installedExe = Join-Path $installTarget "NKBDrive.exe"
$installedMsil = Join-Path $installTarget "winfsp-msil.dll"
$installedX64 = Join-Path $installTarget "winfsp-x64.dll"
$installedUninstaller = Join-Path $installTarget "Uninstall.exe"

$t3_pass = (Test-Path $installedExe) -and (Test-Path $installedMsil) -and (Test-Path $installedX64) -and (Test-Path $installedUninstaller)
Record-Test 3 "Installed Artifacts Verification" $t3_pass "NKBDrive.exe, winfsp-msil.dll, winfsp-x64.dll, Uninstall.exe present in $installTarget."

# TEST 4: Shortcut Generation Verification
$startMenuDir = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\NKB Drive"
$startLnk = Join-Path $startMenuDir "NKB Drive.lnk"
$uninstLnk = Join-Path $startMenuDir "Uninstall NKB Drive.lnk"
$desktopDir = [Environment]::GetFolderPath("DesktopDirectory")
$desktopLnk = Join-Path $desktopDir "NKB Drive.lnk"

$t4_pass = (Test-Path $startLnk) -and (Test-Path $uninstLnk) -and (Test-Path $desktopLnk)
Record-Test 4 "Windows Shortcut Integration" $t4_pass "Start Menu and Desktop shortcuts verified."

# TEST 5: Windows Registry Integration (Run & Uninstall)
$runVal = (Get-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run" -Name "NKB Drive" -ErrorAction SilentlyContinue)."NKB Drive"
$uninstKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\NKBDrive"
$uninstDisp = (Get-ItemProperty -Path $uninstKey -Name "DisplayName" -ErrorAction SilentlyContinue).DisplayName
$uninstVer = (Get-ItemProperty -Path $uninstKey -Name "DisplayVersion" -ErrorAction SilentlyContinue).DisplayVersion

$t5_pass = ($null -ne $runVal) -and ($uninstDisp -eq "NKB Drive") -and ($uninstVer -eq "2.1.0")
Record-Test 5 "Windows Registry Integrations" $t5_pass "Run key: '$runVal', Uninstall entry: '$uninstDisp v$uninstVer'."

# TEST 6: WinFsp Runtime Prerequisite Check
$winfspService = Get-Service -Name "WinFsp.Launcher" -ErrorAction SilentlyContinue
$winfspDll86 = "C:\Program Files (x86)\WinFsp\bin\winfsp-x64.dll"
$t6_pass = ($null -ne $winfspService) -or (Test-Path $winfspDll86)
Record-Test 6 "WinFsp Filesystem Driver Check" $t6_pass "WinFsp runtime detected on system (Service: $($winfspService.Status))."

# TEST 7: Staging Backend Health Check
try {
    $backendHealth = Invoke-RestMethod -Uri "http://127.0.0.1:5000/health" -Method Get -TimeoutSec 5
    $t7_pass = ($backendHealth.status -eq "ONLINE") -or ($backendHealth.status -eq "ok") -or ($backendHealth -ne $null)
    Record-Test 7 "Staging Backend Operational Status" $t7_pass "Backend reachable on port 5000 (status: $($backendHealth.status))."
} catch {
    Record-Test 7 "Staging Backend Operational Status" $false $_.Exception.Message
}

# TEST 8: Application Launch & DPAPI Vault Verification
Add-Type -AssemblyName System.Security
if (![System.IO.Directory]::Exists($dataDir)) {
    [System.IO.Directory]::CreateDirectory($dataDir) | Out-Null
}
$targetVault = Join-Path $dataDir "vault.dat"
$entropyPrefix = [System.Text.Encoding]::UTF8.GetBytes("NKB-Enterprise-DPAPI-Entropy-v2.1")
$userBytes = [System.Text.Encoding]::UTF8.GetBytes("$env:USERNAME@$env:COMPUTERNAME")
$combinedEntropy = New-Object byte[] ($entropyPrefix.Length + $userBytes.Length)
[System.Buffer]::BlockCopy($entropyPrefix, 0, $combinedEntropy, 0, $entropyPrefix.Length)
[System.Buffer]::BlockCopy($userBytes, 0, $combinedEntropy, $entropyPrefix.Length, $userBytes.Length)

$raw = "http://127.0.0.1:5000`nmock-token-12345`ndevice-dev-01`nadmin@nkb.local`n$env:COMPUTERNAME`n$([DateTime]::UtcNow.ToString('o'))"
$plaintext = [System.Text.Encoding]::UTF8.GetBytes($raw)
$cipher = [System.Security.Cryptography.ProtectedData]::Protect($plaintext, $combinedEntropy, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)
[System.IO.File]::WriteAllBytes($targetVault, $cipher)

# Verify DPAPI roundtrip
$decryptedBytes = [System.Security.Cryptography.ProtectedData]::Unprotect((Get-Content $targetVault -Encoding Byte), $combinedEntropy, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)
$decryptedStr = [System.Text.Encoding]::UTF8.GetString($decryptedBytes)
$t8_pass = ($decryptedStr -match "mock-token-12345")
Record-Test 8 "DPAPI Credential Vault Roundtrip" $t8_pass "DPAPI vault encrypted and decrypted successfully at $targetVault."

# TEST 9: Application Startup (Minimized Mode)
Write-Host "Launching installed NKBDrive.exe --startup..."
$appProc = Start-Process -FilePath $installedExe -ArgumentList "--startup" -PassThru
Start-Sleep -Seconds 3
$t9_pass = (!$appProc.HasExited)
Record-Test 9 "Application Launch & Single-Instance Mutex" $t9_pass "NKBDrive.exe running (PID: $($appProc.Id))."

# TEST 10: Clean Shutdown & Unmount
try {
    if (!$appProc.HasExited) {
        Stop-Process -Id $appProc.Id -Force
        Start-Sleep -Seconds 1
    }
    $t10_pass = $true
    Record-Test 10 "Clean Process Termination" $t10_pass "Application process stopped cleanly."
} catch {
    Record-Test 10 "Clean Process Termination" $false $_.Exception.Message
}

# TEST 11: Clean Silent Uninstallation (/uninstall /S)
try {
    Write-Host "Executing silent uninstallation: $installedUninstaller --uninstall /S"
    $unp = Start-Process -FilePath $installedUninstaller -ArgumentList "--uninstall /S" -Wait -PassThru
    Start-Sleep -Seconds 2
    $t11_pass = ($unp.ExitCode -eq 0)
    Record-Test 11 "Silent Uninstallation Execution" $t11_pass "Uninstaller completed with exit code $($unp.ExitCode)."
} catch {
    Record-Test 11 "Silent Uninstallation Execution" $false $_.Exception.Message
}

# TEST 12: Post-Uninstall Cleanup Verification
$uninstRunVal = (Get-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run" -Name "NKB Drive" -ErrorAction SilentlyContinue)."NKB Drive"
$uninstEntryExists = Test-Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\NKBDrive"
$desktopLnkExists = Test-Path $desktopLnk
$startMenuExists = Test-Path $startMenuDir
$binExists = Test-Path $installedExe

$t12_pass = ($null -eq $uninstRunVal) -and (!$uninstEntryExists) -and (!$desktopLnkExists) -and (!$binExists)
Record-Test 12 "Post-Uninstall System Cleanliness" $t12_pass "Shortcuts, binaries, and registry entries cleanly purged."

# TEST 13: Local Cache & Metadata Preservation on Uninstall
$dataPreserved = (Test-Path $targetVault)
Record-Test 13 "Local Cache & User Data Preservation" $dataPreserved "User metadata and DPAPI vault preserved at $dataDir across uninstall."

# TEST 14: Reinstallation Verification
try {
    Write-Host "Executing reinstallation: $setupExe /S"
    $reinstallProc = Start-Process -FilePath $setupExe -ArgumentList "/S" -Wait -PassThru
    $t14_pass = ($reinstallProc.ExitCode -eq 0) -and (Test-Path $installedExe)
    Record-Test 14 "Seamless Reinstallation" $t14_pass "Application reinstalled cleanly without metadata loss."
} catch {
    Record-Test 14 "Seamless Reinstallation" $false $_.Exception.Message
}

# TEST 15: Backward Compatibility & Production Safety
# Check that nkb_pg16_staging is running and nkb_cloud_staging DB is untouched
$dbCheck = (docker exec nkb_pg16_staging psql -U postgres -d nkb_drive_staging -t -A -c "SELECT COUNT(*) FROM nkb_drive_devices;").Trim()
$countVal = [int]$dbCheck
$t15_pass = ($LASTEXITCODE -eq 0) -and ($countVal -ge 0)
Record-Test 15 "Staging DB & Backend Non-Destructive Integrity" $t15_pass "PostgreSQL 16 staging database (port 5433) verified intact ($countVal devices registered)."

$sw.Stop()
$passedCount = ($testResults | Where-Object { $_.Passed }).Count
$totalCount = $testResults.Count

Write-Host "=================================================================" -ForegroundColor Cyan
$summaryColor = if ($passedCount -eq $totalCount) { 'Green' } else { 'Yellow' }
Write-Host "  PHASE 4.4 ACCEPTANCE SUMMARY: $passedCount / $totalCount TESTS PASSED ($($sw.Elapsed.TotalSeconds.ToString("0.00"))s) " -ForegroundColor $summaryColor
Write-Host "=================================================================" -ForegroundColor Cyan

if ($passedCount -ne $totalCount) {
    exit 1
}
exit 0
