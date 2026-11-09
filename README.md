# NKB Cloud - Private Cloud Storage Platform

**Organization:** NKB Manufacturing  
**Product Type:** Self-hosted Google Drive Alternative  
**Architecture:** Hostinger VPS (AlmaLinux 10) + Windows Storage Agent + Expandable Multi-Storage HDD/SSD

---

## Key Highlights

- **Zero NAS Device Required**: Uses ordinary storage devices attached to a Windows computer or server (external USB SSD/HDD, internal SATA/NVMe SSD/HDD).
- **Zero Port Forwarding**: The Windows Storage Agent connects **outbound** via secure WebSocket/TLS to the VPS. No router configuration or public IP needed on the local Windows machine.
- **Hardware & Volume UUID Identity**: Drives are tracked by permanent Volume GUIDs and hardware serial numbers, independent of Windows drive letters.
- **Critical Drive Protection**: Disconnected drives are marked `OFFLINE` and preserved. Records and files are never wiped or deleted. Unavailable files resume immediately upon reconnection with SHA-256 integrity verification.
- **Google Drive-like Explorer**: My Drive, Shared With Me, Shared Drives, Recent, Starred, Trash/Recycle Bin, Categories (Documents, Photos, Videos, Audio, Archives), Search, Drag-and-Drop chunked upload, multi-format preview (Images, Video, Audio, PDF, Text/Code), Version History.
- **Enterprise RBAC**: Super Admin, Admin, Standard User, Viewer roles with departments, storage quotas, and audit logs.
- **Google Drive-style Sharing**: User sharing, department sharing, and secure password-protected links with expiration dates.

---

## Project Structure

```
NKB Cloud/
├── client/                     # React 18 + Vite + Tailwind CSS + Lucide Icons
│   ├── src/
│   │   ├── components/         # Topbar, Sidebar, Preview, Sharing, Details
│   │   ├── pages/              # Dashboard, FileManager, Storage, Users, Audit, Login
│   │   ├── context/            # AuthContext
│   │   └── api/                # Axios client
│   └── dist/                   # Production compiled client bundle
├── server/                     # Node.js + Express API + PostgreSQL Relay Hub
│   ├── config/                 # Dual DB engine (PostgreSQL + Embedded Fallback)
│   ├── controllers/            # Auth, Files, Storage, Shares, Admin
│   ├── middleware/             # JWT auth & RBAC
│   ├── services/               # WebSocket Storage Agent Relay Hub
│   ├── db/                     # PostgreSQL schema.sql and seed.sql
│   └── server.js               # Main API & WebSocket server
├── storage-agent/              # Windows Background Service
│   ├── src/
│   │   ├── disk-detector.js    # Windows WMI/PowerShell physical disk scanner
│   │   ├── file-engine.js      # Local chunked write, range read, SHA-256
│   │   └── agent-client.js     # Outbound WebSocket client
│   ├── install-service.bat     # Windows Service installer script
│   └── index.js
└── docs/                       # AlmaLinux 10 & Windows Agent deployment guides
```

---

## Default Administrator Credentials

- **Username / Email:** `admin@nkbmanufacturing.com`
- **Password:** `Admin@NKB2026!`
- **Role:** `SUPER ADMIN`

---

## Quick Start (Local Development)

### 1. Start Server
```bash
cd server
npm install
npm start
```
Server listens at: `http://localhost:5000`  
Storage Agent Relay Hub at: `ws://localhost:5000/ws/agent`

### 2. Start Windows Storage Agent
```bash
cd storage-agent
npm install
npm start
```
The agent automatically scans connected Windows drives and reports inventory to the server.

### 3. Start Client (Dev Mode or Pre-built)
The production bundle is already compiled in `client/dist` and served automatically by the server. To run the Vite hot-reloading dev server:
```bash
cd client
npm run dev
```
Client runs at: `http://localhost:5173`

---

## Production Deployment Guides

- **Hostinger VPS (AlmaLinux 10):** See [`docs/HOSTINGER_VPS_ALMALINUX10_DEPLOYMENT.md`](file:///j:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/docs/HOSTINGER_VPS_ALMALINUX10_DEPLOYMENT.md)
- **Windows Storage Agent:** See [`docs/WINDOWS_STORAGE_AGENT_GUIDE.md`](file:///j:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/docs/WINDOWS_STORAGE_AGENT_GUIDE.md)
