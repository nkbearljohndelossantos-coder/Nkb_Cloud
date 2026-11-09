# NKB Cloud - Windows Storage Agent Setup & Operation Guide

**Organization:** NKB Manufacturing  
**Component:** Windows Storage Agent (Outbound Background Service)

---

## 1. What is the Windows Storage Agent?

The **NKB Cloud Storage Agent** is a lightweight Windows background service that turns ordinary connected storage drives (USB external SSDs, USB HDDs, SATA hard drives, NVMe SSDs) into private cloud storage.

### Key Capabilities:
1. **Zero Port Forwarding**: The agent connects **outbound** to the NKB Cloud VPS via secure WebSocket (`wss://`). No public IP address, static IP, or router port forwarding is needed on the Windows computer.
2. **Permanent Hardware & Volume UUID Identity**: Drives are tracked by their permanent hardware serial numbers and Volume GUIDs (`VolumeSerialNumber`), never just their drive letters. If Windows shifts a drive from `E:` to `F:`, the agent automatically remaps the drive without data loss.
3. **Graceful Disconnect Handling**: If an external drive is unplugged, the agent reports it as `OFFLINE`. Files remain in the system catalog marked as *temporarily unavailable*. The system **NEVER** formats, wipes, or deletes files on disconnected drives.
4. **Reconnection Verification**: When the drive is reconnected, the agent matches its Volume UUID and verifies file integrity using SHA-256 checksums.

---

## 2. Requirements

- Windows 10, Windows 11, or Windows Server 2019/2022/2025.
- Node.js v18+ LTS installed.
- One or more connected storage drives:
  - External USB 3.0/3.2 SSD
  - External USB HDD
  - Internal SATA HDD/SSD
  - Internal NVMe M.2 SSD

---

## 3. Quick Setup Instructions

### Step 1: Open Storage Agent Folder
Navigate to:
```
J:\IT STAFF\PROGRAM FILES\NKB Cloud\storage-agent
```

### Step 2: Configure Environment
Copy `.env.example` to `.env`:
```ini
# Production VPS URL (WebSocket endpoint)
NKB_SERVER_URL=wss://cloud.nkbmanufacturing.com/ws/agent

# Or for local network test:
# NKB_SERVER_URL=ws://localhost:5000/ws/agent

# Security Pairing Token (Obtain from NKB Cloud Web App > Administration > Storage)
NKB_AGENT_TOKEN=nkb_agent_token_primary_2026

# Friendly Identifier for this PC
NKB_AGENT_NAME=NKB-STORAGE-PC-01
```

### Step 3: Test Run in Console
Open PowerShell or Command Prompt in `storage-agent`:
```bash
node index.js
```
You should see:
```
====================================================
  NKB CLOUD - WINDOWS STORAGE AGENT
  Agent Name : NKB-STORAGE-PC-01
  Server URL : wss://cloud.nkbmanufacturing.com/ws/agent
  Mode       : Outbound HTTPS/WSS (No open inbound ports)
====================================================
[StorageAgent] Connecting outbound to NKB Cloud Server...
[StorageAgent] Successfully connected to NKB Cloud Server.
[StorageAgent] Scanned connected drives: 2 devices, 2 volumes detected.
```

---

## 4. Installing as a Permanent Windows Service

To ensure the agent starts automatically on system boot and runs in the background without needing a browser or user login:

1. Right-click `install-service.bat`
2. Select **Run as administrator**
3. The script will register `NKBCloudStorageAgent` with Windows Service Control Manager (`services.msc`).
4. To verify: Open Windows Services (`services.msc`) and look for **NKB Cloud Background Storage Service**.

---

## 5. Storage Expansion & Multiple Drives

To add more storage to NKB Cloud:
1. Connect the new drive (e.g. plug in a new Samsung 2TB USB SSD).
2. The agent automatically detects the new volume during its periodic scan or when you click **Scan Connected Drives** in the Web App.
3. In the Web App under **Storage Drives**:
   - Assign a name (e.g. `NKB-SSD-02`).
   - Choose its purpose (`Primary`, `Documents`, `Archive`, `Additional`, or `Backup`).
   - Set priority.
4. NKB Cloud immediately adds the new capacity to the available pool.

---

## 6. Critical Drive Replacement Protocol

When replacing an older drive with a larger drive:
1. Connect the new replacement drive to the Windows host.
2. In the Web App, go to **Storage Drives > Replace / Migrate Drive**.
3. Select the **Source Drive** (e.g. `NKB-HDD-01`) and the **Target Drive** (e.g. `NKB-SSD-02`).
4. Click **Initiate Safe Migration**.
5. The agent will copy each file to the new drive, verify each file's SHA-256 checksum, and update the catalog pointers.
6. The old drive remains 100% intact until you verify and explicitly retire it.
