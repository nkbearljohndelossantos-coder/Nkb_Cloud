# NKB CLOUD v2.1.0 — MACOS STORAGE AGENT INSTALLATION & RUNBOOK

**Target Audience:** Mac System Administrators, Jamf Pro Engineers, and macOS Users  
**Supported Platforms:** macOS 13.0 (Ventura), macOS 14.0 (Sonoma), macOS 15.0 (Sequoia)  
**Supported Hardware:** Apple Silicon (M1/M2/M3/M4) and Intel x86_64 MacBooks & Desktops  
**Component:** Native Swift Storage Agent daemon (`nkb-storage-agent`)  
**Source Location:** [`macos-agent/`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/macos-agent/)  

---

## 1. PRE-REQUISITES

- Apple Mac workstation or laptop with administrator privileges.
- Network access to `https://cloud.nkb.local` (Port 443) and `wss://cloud.nkb.local/ws/agent`.
- Outbound loopback port `51248` open on `127.0.0.1` for local browser presence detection.

---

## 2. AUTOMATED FLEET DEPLOYMENT (JAMF PRO / KANDJI)

For enterprise Mac management, deploy the agent as an installer package (`.pkg`) or shell script policy.

### Step 1: Create Deployment Policy in Jamf Pro
1. Navigate to **Computers > Policies > New Policy**.
2. Name the policy: `NKB Cloud — Deploy macOS Storage Agent`.
3. Under **Scripts**, add the automated deployment payload:
   ```bash
   #!/bin/bash
   curl -s "https://cloud.nkb.local/api/devices/installer-script?platform=macos" | bash
   ```
4. Set execution frequency to **Once per computer** at **Recurring Check-in**.
5. Scope the policy to **All Managed MacBooks**.

### Step 2: What the Script Does Automatically
1. Creates secure directories: `~/Library/Application Support/NKBCloud/StorageAgent/keys/`.
2. Generates a device-isolated Ed25519 keypair and securely records the private key in the **macOS Keychain**.
3. Registers the Mac's computer name, hardware serial, and public key with NKB Cloud.
4. Generates `agent-config.json`.
5. Installs and loads the `launchd` background daemon (`~/Library/LaunchAgents/com.nkb.storageagent.plist`).
6. Starts the local loopback detection server on `http://127.0.0.1:51248`.

---

## 3. MANUAL INSTALLATION (CLI)

For individual technicians or developer workstations:

### Step 1: Execute Installation Script
Open **Terminal.app** and run:

```bash
curl -s "https://cloud.nkb.local/api/devices/installer-script?platform=macos" | bash
```

### Output Example:
```
==========================================================
   NKB CLOUD — MACOS STORAGE AGENT AUTOMATED INSTALLER
==========================================================
[1/4] Generating device-isolated Ed25519 keypair in Keychain/Secure Storage...
[2/4] Registering macOS workstation with NKB Cloud (MacBook-Pro-M3)...
  -> Device enrolled with Agent ID: 4a2b1c8d-3e5f-4a7b-8c9d-0e1f2a3b4c5d
  -> Current status: PENDING (Awaiting Administrator Approval)
[3/4] Writing agent configuration...
[4/4] Installation Complete! The agent will connect upon administrator approval.
```

---

## 4. ADMINISTRATOR APPROVAL & CONNECTION

1. The IT Administrator opens the **Device Management Dashboard** (`/admin/devices`) in the NKB Cloud web portal.
2. The MacBook appears with a purple/slate **macOS** badge and status **`PENDING APPROVAL`**.
3. Click **Approve**.
4. The Mac agent detects the approval, initiates the Ed25519 mutual authentication handshake over WebSocket (`/ws/agent`), and transitions to **`ONLINE`**!

---

## 5. LOCAL FOLDER SYNCHRONIZATION

The macOS agent creates a local synchronization directory at:
```
~/NKBCloud/Sync/
```
- Files dragged or saved into this directory are detected by the agent's `FSEvents` engine and synchronized with the company cloud.
- External drives or APFS volumes attached to the Mac are automatically detected by `VolumeMonitor.swift` and reported in the hardware inventory.

---

## 6. SERVICE MANAGEMENT & TROUBLESHOOTING

### Check Agent Running Status
```bash
launchctl list | grep com.nkb.storageagent
```

### View Agent Logs
```bash
tail -f /tmp/nkb-storage-agent.log
```

### Test Loopback Status
```bash
curl http://127.0.0.1:51248/status
```
Expected response:
```json
{
  "installed": true,
  "agentVersion": "2.1.0",
  "platform": "macOS",
  "machineName": "MacBook-Pro-M3",
  "status": "ONLINE",
  "authenticated": true,
  "loopbackPort": 51248
}
```
