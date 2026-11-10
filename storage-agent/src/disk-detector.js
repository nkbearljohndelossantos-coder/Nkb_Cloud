import { execFile } from 'child_process';
import util from 'util';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const execFilePromise = util.promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class WindowsDiskDetector {
  constructor() {
    this.cachedDrives = new Map();
    this.psScriptPath = path.join(__dirname, 'detect-disks.ps1');
  }

  // Generate immutable composite physical drive fingerprint
  // Conforms to Stage 2 composite identity architecture
  computeCompositeIdentity(hardwareSerial, volumeGuid, partitionOffset, diskSize) {
    const raw = [
      (hardwareSerial || 'UNKNOWN_SERIAL').trim().toUpperCase(),
      (volumeGuid || 'UNKNOWN_GUID').trim().toLowerCase(),
      String(partitionOffset || 0),
      String(diskSize || 0)
    ].join('::');

    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  // Read-only native Windows hardware and volume enumeration
  // Strictly read-only: does not modify, format, write, or index user files
  async scanDrives() {
    try {
      const { stdout } = await execFilePromise('powershell.exe', [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        this.psScriptPath
      ], {
        windowsHide: true,
        maxBuffer: 10 * 1024 * 1024
      });

      if (!stdout || !stdout.trim()) {
        throw new Error('PowerShell hardware detection returned empty output');
      }

      const parsed = JSON.parse(stdout.trim());
      if (!parsed.success) {
        throw new Error(parsed.error || 'PowerShell script reported failure');
      }

      const rawDevices = Array.isArray(parsed.devices) ? parsed.devices : [];
      const rawVolumes = Array.isArray(parsed.volumes) ? parsed.volumes : [];

      // 1. Map physical devices (Layer 1)
      const devices = rawDevices.map((dev) => {
        const serial = (dev.hardwareSerial && dev.hardwareSerial.trim() !== '') ? dev.hardwareSerial.trim() : 'UNKNOWN';
        const uniqueId = (dev.diskUniqueId && dev.diskUniqueId.trim() !== '') ? dev.diskUniqueId.trim() : 'UNKNOWN';

        return {
          diskNumber: dev.diskNumber,
          deviceIndex: dev.deviceIndex,
          hardwareSerial: serial,
          diskUniqueId: uniqueId,
          vendor: dev.vendor || 'UNKNOWN',
          model: dev.model || `Disk ${dev.diskNumber}`,
          busType: (dev.busType || 'UNKNOWN').toUpperCase(),
          mediaType: (dev.mediaType || 'UNKNOWN').toUpperCase(),
          totalCapacityBytes: Number(dev.totalCapacityBytes) || 0,
          operationalStatus: dev.operationalStatus || 'UNKNOWN',
          healthStatus: dev.healthStatus || 'UNKNOWN',
          partitionCount: Number(dev.partitionCount) || 0,
          connectionType: dev.connectionType || 'UNKNOWN',
          classification: dev.classification || 'Fixed',
          partitionStyle: dev.partitionStyle || 'UNKNOWN',
          lastSeenAt: parsed.timestamp || new Date().toISOString()
        };
      });

      // 2. Map logical volumes and partitions (Layer 2)
      const volumes = rawVolumes.map((vol) => {
        const parentDevice = devices.find(d => d.diskNumber === vol.diskNumber) || null;
        const hwSerial = parentDevice ? parentDevice.hardwareSerial : (vol.hardwareSerial || 'UNKNOWN');
        const diskCapacity = parentDevice ? parentDevice.totalCapacityBytes : Number(vol.totalBytes || 0);

        const volGuid = (vol.volumeGuid && vol.volumeGuid !== 'NOT_AVAILABLE') ? vol.volumeGuid : `VOL-PART-${vol.diskNumber}-${vol.partitionNumber}`;
        const compositeIdentity = this.computeCompositeIdentity(
          hwSerial,
          volGuid,
          vol.partitionOffset,
          diskCapacity
        );

        const driveLetter = vol.driveLetter || null;
        const mountPoint = vol.mountPoint || (driveLetter ? `${driveLetter}\\` : `Partition-${vol.diskNumber}-${vol.partitionNumber}`);

        // Safe designated mount path for NKB Cloud root if volume is lettered
        const safeMountPath = driveLetter
          ? path.join(driveLetter, '\\', 'NKB_Storage_Root')
          : mountPoint;

        return {
          diskIndex: vol.diskIndex,
          diskNumber: vol.diskNumber,
          partitionNumber: vol.partitionNumber,
          partitionOffset: Number(vol.partitionOffset) || 0,
          partitionSize: Number(vol.partitionSize) || 0,
          partitionType: vol.partitionType || 'Basic',
          compositeIdentity,
          volumeUuid: volGuid,
          volumeGuid: volGuid,
          hardwareSerial: hwSerial,
          driveLetter,
          label: vol.volumeLabel || (driveLetter ? `Volume ${driveLetter}` : `Partition ${vol.partitionNumber}`),
          volumeLabel: vol.volumeLabel || '',
          fileSystem: (vol.filesystem || 'UNKNOWN').toUpperCase(),
          filesystem: (vol.filesystem || 'UNKNOWN').toUpperCase(),
          mountPath: safeMountPath,
          mountPoint,
          totalBytes: Number(vol.totalBytes) || 0,
          freeBytes: Number(vol.freeBytes) || 0,
          usedBytes: Number(vol.usedBytes) || 0,
          healthStatus: vol.healthStatus || 'Healthy',
          operationalStatus: vol.operationalStatus || 'OK',
          status: 'ONLINE'
        };
      });

      return { devices, volumes, timestamp: parsed.timestamp };
    } catch (err) {
      console.error('[WindowsDiskDetector] Hardware enumeration error:', err.message);
      // NEVER invent fake simulated storage. Report error and empty list.
      return {
        devices: [],
        volumes: [],
        error: err.message,
        timestamp: new Date().toISOString()
      };
    }
  }
}
