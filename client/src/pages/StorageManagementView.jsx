import React, { useState, useEffect } from 'react';
import {
  Server,
  HardDrive,
  RefreshCw,
  Plus,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Settings2,
  ArrowRightLeft,
  Info,
  Check,
  X,
  FileCheck2,
  Trash2,
  Cpu,
  Layers,
  Archive,
  Usb,
  ShieldAlert,
  Database,
  Search,
  ExternalLink,
  Clock,
  Eye,
  FolderOpen
} from 'lucide-react';
import api from '../api/client';
import { formatBytes, formatDate } from '../utils/formatters';

export default function StorageManagementView({ volumes, onRefresh, agentConnected, storageOverview, onNavigateToDriveBrowser }) {
  // Navigation tabs within Storage
  const [activeTab, setActiveTab] = useState('physical-drives'); // 'physical-drives' | 'volumes' | 'migration' | 'observations'
  const [scanning, setScanning] = useState(false);
  const [selectedVolume, setSelectedVolume] = useState(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [replaceModalOpen, setReplaceModalOpen] = useState(false);
  const [verifyStatus, setVerifyStatus] = useState(null);

  // Hardware inventory state
  const [hardwareData, setHardwareData] = useState({
    devices: [],
    summary: {},
    observations: [],
    conflicts: [],
    timestamp: null
  });
  const [loadingHardware, setLoadingHardware] = useState(false);

  // Edit volume form state
  const [assignedName, setAssignedName] = useState('');
  const [storagePurpose, setStoragePurpose] = useState('GENERAL');
  const [priority, setPriority] = useState(1);
  const [isDefault, setIsDefault] = useState(false);

  // Placement policy state
  const [placementPolicy, setPlacementPolicy] = useState(storageOverview?.storagePlacementPolicy || 'PRIORITY_POOL');

  // Replace drive migration state
  const [replaceSourceId, setReplaceSourceId] = useState('');
  const [replaceTargetId, setReplaceTargetId] = useState('');
  const [migrationPlan, setMigrationPlan] = useState(null);
  const [migrationRunning, setMigrationRunning] = useState(false);
  const [migrationDone, setMigrationDone] = useState(null);

  // Fetch real hardware inventory from backend
  const fetchHardwareInventory = async () => {
    setLoadingHardware(true);
    try {
      const res = await api.get('/storage/hardware');
      if (res.data && res.data.success) {
        setHardwareData(res.data);
      }
    } catch (err) {
      console.error('[StorageManagement] Failed to fetch hardware inventory:', err);
    } finally {
      setLoadingHardware(false);
    }
  };

  useEffect(() => {
    fetchHardwareInventory();
  }, []);

  // 1. Hardware scan via Storage Agent
  const handleScanDrives = async () => {
    setScanning(true);
    try {
      await api.post('/storage/scan');
      await Promise.all([onRefresh(), fetchHardwareInventory()]);
    } catch (err) {
      alert(err.response?.data?.error || err.message);
    } finally {
      setScanning(false);
    }
  };

  // 2. Open edit modal
  const handleOpenEdit = (vol) => {
    setSelectedVolume(vol);
    setAssignedName(vol.assignedName);
    setStoragePurpose(vol.storagePurpose);
    setPriority(vol.priority);
    setIsDefault(vol.isDefault);
    setEditModalOpen(true);
  };

  // 3. Save volume config
  const handleSaveConfig = async (e) => {
    e.preventDefault();
    try {
      await api.put(`/storage/volumes/${selectedVolume.id}`, {
        assignedName,
        storagePurpose,
        priority: parseInt(priority),
        isDefault
      });
      setEditModalOpen(false);
      onRefresh();
    } catch (err) {
      alert(err.response?.data?.error || err.message);
    }
  };

  // 4. Update Placement Policy
  const handleUpdatePolicy = async (newPolicy) => {
    setPlacementPolicy(newPolicy);
    try {
      await api.post('/storage/policies', { policy: newPolicy });
      onRefresh();
    } catch (err) {
      alert(err.message);
    }
  };

  // 5. Verify SHA-256 hashes across volume
  const handleVerifyVolume = async (volId, name) => {
    setVerifyStatus(`Computing and verifying SHA-256 checksums on ${name}...`);
    try {
      const res = await api.post(`/storage/volumes/${volId}/verify`);
      const { verifiedFiles, mismatchedFiles, totalBytes } = res.data;
      if (mismatchedFiles === 0) {
        setVerifyStatus(`Integrity Verified: 100% match across ${verifiedFiles} files (${formatBytes(totalBytes)}). Zero hash collisions.`);
      } else {
        setVerifyStatus(`INTEGRITY WARNING: ${mismatchedFiles} hash mismatch(es) detected on ${name}! Check audit logs.`);
      }
    } catch (err) {
      setVerifyStatus(`Verification failed: ${err.response?.data?.error || err.message}`);
    }
  };

  // 6. Safe Drive Replacement & Migration
  const handleStartMigrationModal = () => {
    setReplaceSourceId('');
    setReplaceTargetId('');
    setMigrationPlan(null);
    setMigrationDone(null);
    setReplaceModalOpen(true);
  };

  const handleGeneratePlan = async (e) => {
    e.preventDefault();
    if (!replaceSourceId || !replaceTargetId) {
      alert('Please select both a source drive and a target drive.');
      return;
    }
    if (replaceSourceId === replaceTargetId) {
      alert('Source and target drives cannot be the same drive.');
      return;
    }

    try {
      const res = await api.post('/storage/migrations/initiate', {
        sourceVolumeId: replaceSourceId,
        targetVolumeId: replaceTargetId
      });
      setMigrationPlan(res.data.migrationPlan);
    } catch (err) {
      alert(err.response?.data?.error || err.message);
    }
  };

  const handleApproveMigration = async () => {
    setMigrationRunning(true);
    try {
      const res = await api.post(`/storage/migrations/${migrationPlan.id}/approve`);
      setMigrationDone(res.data);
      onRefresh();
    } catch (err) {
      alert(err.response?.data?.error || err.message);
    } finally {
      setMigrationRunning(false);
    }
  };

  const handleRetireSource = async () => {
    if (!confirm('Are you sure you want to retire this drive? It will be marked RETIRED and no new files will be placed on it. Existing files remain intact.')) {
      return;
    }
    try {
      await api.post(`/storage/migrations/${migrationPlan.id}/retire`, {
        action: 'MARK_RETIRED'
      });
      alert('Source drive retired successfully. Drive status updated to RETIRED.');
      setReplaceModalOpen(false);
      setMigrationPlan(null);
      setMigrationDone(null);
      onRefresh();
    } catch (err) {
      alert(err.response?.data?.error || err.message);
    }
  };

  // Confidence pill helper
  const renderConfidenceBadge = (confidence) => {
    switch (confidence) {
      case 'VERIFIED':
        return (
          <span className="inline-flex items-center space-x-1 text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            <span>VERIFIED IDENTITY</span>
          </span>
        );
      case 'PARTIALLY_IDENTIFIED':
        return (
          <span className="inline-flex items-center space-x-1 text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
            <Info className="w-3 h-3 text-amber-600" />
            <span>PARTIALLY IDENTIFIED</span>
          </span>
        );
      case 'MANUAL_VERIFICATION_REQUIRED':
        return (
          <span className="inline-flex items-center space-x-1 text-[10px] font-semibold px-2 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200">
            <AlertTriangle className="w-3 h-3 text-purple-600" />
            <span>MANUAL VERIFICATION REQUIRED</span>
          </span>
        );
      case 'IDENTITY_MISMATCH':
        return (
          <span className="inline-flex items-center space-x-1 text-[10px] font-semibold px-2 py-0.5 rounded bg-red-50 text-red-700 border border-red-200">
            <ShieldAlert className="w-3 h-3 text-red-600" />
            <span>IDENTITY MISMATCH</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center space-x-1 text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
            <span>{confidence || 'UNKNOWN'}</span>
          </span>
        );
    }
  };

  // Media type icon helper
  const getDeviceIcon = (busType, mediaType) => {
    const b = (busType || '').toUpperCase();
    const m = (mediaType || '').toUpperCase();
    if (b.includes('USB')) {
      return <Usb className="w-5 h-5 text-indigo-600" />;
    }
    if (b.includes('NVME') || m.includes('SSD')) {
      return <Cpu className="w-5 h-5 text-emerald-600" />;
    }
    return <HardDrive className="w-5 h-5 text-nkb-gold-500" />;
  };

  const devicesList = hardwareData.devices || [];

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6 select-none">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-nkb-navy-900 tracking-tight flex items-center space-x-2">
            <Server className="w-5 h-5 text-nkb-gold-500" />
            <span>Physical Storage & Hardware Inventory</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Windows Storage Host &bull; Native CIM / WMI & Storage Cmdlets &bull; Strict Read-Only Inventory
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={handleScanDrives}
            disabled={scanning}
            className="flex items-center space-x-2 px-3 py-2 bg-white hover:bg-slate-50 border border-slate-300 rounded text-xs font-semibold text-slate-700 shadow-sm transition disabled:opacity-60"
            title="Perform live read-only hardware enumeration on the Windows storage host"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-600 ${scanning ? 'animate-spin' : ''}`} />
            <span>{scanning ? 'Scanning Windows Disks...' : 'Refresh Drives'}</span>
          </button>

          <button
            onClick={handleStartMigrationModal}
            className="flex items-center space-x-2 px-3 py-2 bg-nkb-navy-900 hover:bg-nkb-navy-800 text-white rounded text-xs font-semibold shadow-sm transition"
          >
            <ArrowRightLeft className="w-3.5 h-3.5 text-nkb-gold-400" />
            <span>Safe Drive Replacement</span>
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center space-x-2 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('physical-drives')}
          className={`flex items-center space-x-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition ${
            activeTab === 'physical-drives'
              ? 'border-nkb-navy-900 text-nkb-navy-900'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <HardDrive className="w-4 h-4 text-nkb-gold-500" />
          <span>Actual Physical Drives ({devicesList.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('volumes')}
          className={`flex items-center space-x-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition ${
            activeTab === 'volumes'
              ? 'border-nkb-navy-900 text-nkb-navy-900'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Database className="w-4 h-4 text-blue-600" />
          <span>Logical Volumes & Pooling ({volumes.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('observations')}
          className={`flex items-center space-x-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition ${
            activeTab === 'observations'
              ? 'border-nkb-navy-900 text-nkb-navy-900'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <FileCheck2 className="w-4 h-4 text-emerald-600" />
          <span>Observations & Conflicts ({(hardwareData.observations || []).length})</span>
        </button>
      </div>

      {/* TAB 1: ACTUAL PHYSICAL DRIVES */}
      {activeTab === 'physical-drives' && (
        <div className="space-y-6">
          {/* Summary Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
                <span>Total Physical Disks</span>
                <HardDrive className="w-4 h-4 text-nkb-navy-900" />
              </div>
              <div className="text-2xl font-bold text-nkb-navy-900 mt-2 font-mono">
                {devicesList.length}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                {devicesList.filter(d => d.status === 'ONLINE').length} Online &bull; {devicesList.filter(d => d.status !== 'ONLINE').length} Offline
              </div>
            </div>

            <div className="bg-white p-4 rounded border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
                <span>Total Physical Capacity</span>
                <Database className="w-4 h-4 text-nkb-gold-500" />
              </div>
              <div className="text-2xl font-bold text-nkb-gold-600 mt-2 font-mono">
                {formatBytes(hardwareData.summary?.totalCapacityBytes || 0)}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                Across all detected physical drives
              </div>
            </div>

            <div className="bg-white p-4 rounded border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
                <span>Mounted Volumes / Partitions</span>
                <Layers className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="text-2xl font-bold text-emerald-700 mt-2 font-mono">
                {hardwareData.summary?.totalVolumes || volumes.length}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                {hardwareData.summary?.onlineVolumes || 0} active filesystem mounts
              </div>
            </div>

            <div className="bg-white p-4 rounded border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
                <span>Storage Host Status</span>
                <Server className="w-4 h-4 text-blue-600" />
              </div>
              <div className="flex items-center space-x-2 mt-2">
                <span className={`w-2.5 h-2.5 rounded-full ${agentConnected ? 'bg-emerald-500' : 'bg-red-500'}`} />
                <span className="text-sm font-bold text-slate-800">
                  {agentConnected ? 'Agent Connected' : 'Agent Offline'}
                </span>
              </div>
              <div className="text-[11px] text-slate-500 mt-1 font-mono">
                {hardwareData.timestamp ? `Last: ${formatDate(hardwareData.timestamp)}` : 'Windows 11 Host'}
              </div>
            </div>
          </div>

          {/* Safety Notice Banner */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded text-xs text-slate-700 flex items-start space-x-3">
            <Info className="w-4 h-4 text-nkb-navy-900 mt-0.5 flex-shrink-0" />
            <div className="space-y-1">
              <div className="font-semibold text-slate-900">Read-Only Hardware Enumeration Policy:</div>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                NKB Cloud enumerates physical drives, media types (NVMe/SATA/USB), and partition layouts using Windows CIM storage APIs.
                The system operates strictly in <strong className="font-semibold text-slate-900">READ-ONLY</strong> mode: no drives are ever formatted, initialized, partitioned, or modified.
              </p>
            </div>
          </div>

          {/* Physical Drives Card Hierarchy */}
          <div className="space-y-6">
            {devicesList.map((dev, idx) => {
              const devVolumes = dev.volumes || [];
              const isOnline = dev.status === 'ONLINE';

              return (
                <div
                  key={dev.id || idx}
                  className="bg-white rounded border border-slate-200 shadow-sm overflow-hidden"
                >
                  {/* Card Header */}
                  <div className="p-4 bg-slate-50/80 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div className="flex items-center space-x-3">
                      <div className="p-2 bg-white rounded border border-slate-200 shadow-2xs">
                        {getDeviceIcon(dev.busType, dev.mediaType)}
                      </div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-sm text-nkb-navy-900 font-mono">
                            {dev.model}
                          </span>
                          <span className="text-[11px] bg-slate-200 text-slate-700 font-semibold px-2 py-0.5 rounded font-mono">
                            {dev.vendor}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5 flex items-center space-x-2">
                          <span>Physical Disk</span>
                          <span>&bull;</span>
                          <span className="font-mono">{dev.busType}</span>
                          <span>&bull;</span>
                          <span className="font-mono">{dev.mediaType}</span>
                          <span>&bull;</span>
                          <span className="font-mono font-semibold text-slate-800">
                            {formatBytes(dev.totalCapacityBytes)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {renderConfidenceBadge(dev.identityConfidence)}

                      <span
                        className={`text-[10px] font-semibold px-2.5 py-1 rounded ${
                          isOnline
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-slate-100 text-slate-600 border border-slate-200'
                        }`}
                      >
                        {dev.status}
                      </span>

                      <span
                        className={`text-[10px] font-semibold px-2.5 py-1 rounded ${
                          (dev.healthStatus || '').toUpperCase() === 'HEALTHY' || (dev.healthStatus || '').toUpperCase() === 'GOOD'
                            ? 'bg-blue-50 text-blue-700 border border-blue-200'
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}
                      >
                        Health: {dev.healthStatus || 'Healthy'}
                      </span>
                    </div>
                  </div>

                  {/* Physical Disk Technical Specifications (ERP Spec Block) */}
                  <div className="p-5 border-b border-slate-100 bg-white">
                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-3">
                      Hardware Identity & Bus Specifications
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 text-xs">
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase">Connection</span>
                        <span className="font-semibold text-slate-800">{dev.busType} ({dev.mediaType})</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase">Physical Capacity</span>
                        <span className="font-mono font-semibold text-nkb-navy-900">{formatBytes(dev.totalCapacityBytes)}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase">Hardware Serial</span>
                        <span className="font-mono text-slate-700 select-all" title={dev.hardwareSerial}>
                          {dev.hardwareSerial && dev.hardwareSerial.length > 20 ? `${dev.hardwareSerial.substring(0, 20)}...` : dev.hardwareSerial}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase">Unique Device ID</span>
                        <span className="font-mono text-slate-700 truncate block max-w-[140px]" title={dev.diskUniqueIdEvidence}>
                          {dev.diskUniqueIdEvidence || 'NOT AVAILABLE'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase">Partitions Detected</span>
                        <span className="font-mono font-semibold text-slate-800">{devVolumes.length} partition(s)</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase">Last Detected</span>
                        <span className="text-slate-600">{formatDate(dev.lastSeenAt)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Associated Volumes & Partitions Sub-Table */}
                  <div className="p-5 bg-slate-50/40">
                    <div className="flex items-center justify-between mb-3">
                      <div className="text-xs font-bold text-nkb-navy-900 uppercase tracking-wider flex items-center space-x-2">
                        <Layers className="w-3.5 h-3.5 text-slate-500" />
                        <span>Mounted Volumes & Filesystem Partitions ({devVolumes.length})</span>
                      </div>
                      <span className="text-[11px] text-slate-400">
                        Physical Disk Capacity: <strong className="text-slate-700 font-mono">{formatBytes(dev.totalCapacityBytes)}</strong>
                      </span>
                    </div>

                    {devVolumes.length === 0 ? (
                      <div className="p-4 bg-white rounded border border-slate-200 text-center text-xs text-slate-500">
                        No filesystem partitions currently registered on this physical disk.
                      </div>
                    ) : (
                      <div className="bg-white rounded border border-slate-200 overflow-hidden shadow-2xs divide-y divide-slate-100">
                        {devVolumes.map((vol) => {
                          const vTotal = BigInt(vol.totalBytes || '0');
                          const vUsed = BigInt(vol.usedBytes || '0');
                          const vFree = BigInt(vol.freeBytes || '0');
                          const vPct = vTotal > 0n ? Math.round(Number((vUsed * 100n) / vTotal)) : 0;
                          const hasLetter = vol.currentDriveLetter && vol.currentDriveLetter.trim() !== '';

                          return (
                            <div key={vol.id} className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-slate-50/60 transition">
                              {/* Left: Drive Letter & Label */}
                              <div className="space-y-1 min-w-[220px]">
                                <div className="flex items-center space-x-2">
                                  {hasLetter ? (
                                    <span className="px-2 py-0.5 bg-nkb-navy-900 text-white rounded font-mono font-bold text-xs">
                                      {vol.currentDriveLetter}
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 bg-slate-200 text-slate-700 rounded text-[10px] font-medium font-mono">
                                      Unlettered Partition
                                    </span>
                                  )}
                                  <span className="font-bold text-xs text-slate-800">
                                    {vol.label || vol.assignedName || 'Volume'}
                                  </span>
                                  {vol.isDefault && (
                                    <span className="text-[9px] bg-nkb-gold-100 text-nkb-gold-700 font-semibold px-1.5 py-0.5 rounded">
                                      DEFAULT POOL
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                                  <span>Filesystem: <strong className="text-slate-700">{vol.filesystem || 'NTFS'}</strong></span>
                                  <span>&bull;</span>
                                  <span>Status: <strong className="text-emerald-700">{vol.status}</strong></span>
                                  <span>&bull;</span>
                                  <span className="font-mono text-[10px] text-slate-400 truncate max-w-[200px]" title={vol.volumeGuid}>
                                    GUID: {vol.volumeGuid ? `${vol.volumeGuid.substring(0, 16)}...` : 'N/A'}
                                  </span>
                                </div>
                              </div>

                              {/* Middle: Capacity Bar */}
                              <div className="w-full lg:w-64 space-y-1">
                                <div className="flex justify-between text-xs text-slate-600 font-medium">
                                  <span>Used: {formatBytes(vUsed)}</span>
                                  <span>Total: {formatBytes(vTotal)}</span>
                                </div>
                                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full ${vPct > 90 ? 'bg-red-500' : 'bg-nkb-gold-500'}`}
                                    style={{ width: `${vPct}%` }}
                                  />
                                </div>
                                <div className="flex justify-between text-[10px] text-slate-400">
                                  <span>{vPct}% used</span>
                                  <span>{formatBytes(vFree)} free</span>
                                </div>
                              </div>

                              {/* Right: Actions */}
                              <div className="flex items-center space-x-2 flex-shrink-0">
                                {onNavigateToDriveBrowser && (
                                  <button
                                    onClick={() => onNavigateToDriveBrowser(vol.id)}
                                    className="px-2.5 py-1 bg-nkb-gold-500 hover:bg-nkb-gold-400 text-nkb-navy-950 rounded text-xs font-bold shadow-2xs transition flex items-center space-x-1"
                                    title="Browse actual directory and files on this drive"
                                  >
                                    <FolderOpen className="w-3.5 h-3.5" />
                                    <span>Browse</span>
                                  </button>
                                )}

                                <button
                                  onClick={() => handleVerifyVolume(vol.id, vol.assignedName || vol.currentDriveLetter)}
                                  className="px-2.5 py-1 border border-slate-300 hover:bg-slate-100 text-slate-700 rounded text-xs font-medium transition flex items-center space-x-1"
                                  title="Verify SHA-256 hashes of all stored files on this volume"
                                >
                                  <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
                                  <span>Verify</span>
                                </button>

                                <button
                                  onClick={() => handleOpenEdit(vol)}
                                  className="px-2.5 py-1 bg-nkb-navy-900 hover:bg-nkb-navy-800 text-white rounded text-xs font-semibold shadow-2xs transition flex items-center space-x-1"
                                >
                                  <Settings2 className="w-3.5 h-3.5 text-nkb-gold-400" />
                                  <span>Configure</span>
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: LOGICAL VOLUMES & POOLING */}
      {activeTab === 'volumes' && (
        <div className="space-y-6">
          {/* Storage Placement Policy Selector */}
          <div className="bg-white p-4 rounded border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-nkb-gold-100 text-nkb-gold-700 rounded">
                <Layers className="w-4 h-4" />
              </div>
              <div>
                <div className="font-bold text-xs text-nkb-navy-900">Configurable Storage Placement Policy</div>
                <div className="text-[11px] text-slate-500">Determines how newly uploaded files are allocated across multiple connected drives</div>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              {['PRIORITY_POOL', 'DEFAULT_DRIVE', 'SELECT_PER_UPLOAD'].map((p) => (
                <button
                  key={p}
                  onClick={() => handleUpdatePolicy(p)}
                  className={`px-3 py-1.5 rounded text-xs font-semibold transition ${
                    placementPolicy === p
                      ? 'bg-nkb-navy-900 text-nkb-gold-400 border border-nkb-navy-900'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
                  }`}
                >
                  {p === 'PRIORITY_POOL' && 'Priority Pool'}
                  {p === 'DEFAULT_DRIVE' && 'Default Drive'}
                  {p === 'SELECT_PER_UPLOAD' && 'Folder Specified'}
                </button>
              ))}
            </div>
          </div>

          {/* Volumes Grid */}
          <div className="bg-white rounded border border-slate-200 overflow-hidden shadow-sm">
            <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <h2 className="text-xs font-bold text-nkb-navy-900 uppercase tracking-wider">
                Active Logical Storage Volumes ({volumes.length})
              </h2>
              <span className="text-[11px] text-slate-500 font-mono">
                Composite Identity Active (SHA-256 Fingerprints)
              </span>
            </div>

            <div className="divide-y divide-slate-100">
              {volumes.map((vol) => (
                <div key={vol.id} className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-6 hover:bg-slate-50/50 transition">
                  <div className="space-y-1.5 flex-1 min-w-[240px]">
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-sm text-slate-900">{vol.assignedName}</span>
                      {vol.isDefault && (
                        <span className="text-[10px] bg-nkb-gold-100 text-nkb-gold-700 font-semibold px-2 py-0.5 rounded">
                          DEFAULT TARGET
                        </span>
                      )}
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                          vol.status === 'ONLINE'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-slate-100 text-slate-600 border border-slate-200'
                        }`}
                      >
                        {vol.status}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 font-medium">
                      <span>Drive Letter: <strong className="text-slate-800 font-mono">{vol.currentDriveLetter || 'None'}</strong></span>
                      <span>Filesystem: <strong className="text-slate-800">{vol.filesystem}</strong></span>
                      <span>Bus: <strong className="text-slate-800">{vol.device?.busType || 'Unknown'}</strong></span>
                      <span>Media: <strong className="text-slate-800">{vol.device?.mediaType || 'Unknown'}</strong></span>
                      <span>Purpose: <strong className="text-slate-800">{vol.storagePurpose}</strong></span>
                      <span>Priority: <strong className="text-slate-800">{vol.priority}</strong></span>
                    </div>

                    <div className="text-[11px] text-slate-500 font-mono flex items-center space-x-2 pt-1">
                      <span title={vol.compositeIdentity}>Composite Fingerprint: {vol.compositeIdentity ? `${vol.compositeIdentity.substring(0, 16)}...` : 'N/A'}</span>
                      <span>&bull;</span>
                      <span>Hardware Serial: {vol.device?.hardwareSerial || 'N/A'}</span>
                    </div>
                  </div>

                  <div className="w-full lg:w-72 space-y-1.5 flex-shrink-0">
                    <div className="flex justify-between text-xs text-slate-600 font-medium">
                      <span>Used: {formatBytes(vol.usedBytes)}</span>
                      <span>Total: {formatBytes(vol.totalBytes)}</span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${vol.usagePercentage > 90 ? 'bg-red-500' : 'bg-nkb-gold-500'}`}
                        style={{ width: `${vol.usagePercentage}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[11px] text-slate-400">
                      <span>{vol.usagePercentage}% allocated</span>
                      <span>{formatBytes(vol.freeBytes)} free</span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 flex-shrink-0">
                    {onNavigateToDriveBrowser && (
                      <button
                        onClick={() => onNavigateToDriveBrowser(vol.id)}
                        className="px-3 py-1.5 bg-nkb-gold-500 hover:bg-nkb-gold-400 text-nkb-navy-950 rounded text-xs font-bold shadow-sm transition flex items-center space-x-1.5"
                        title="Browse actual directory and files on this volume"
                      >
                        <FolderOpen className="w-3.5 h-3.5" />
                        <span>Browse Files</span>
                      </button>
                    )}

                    <button
                      onClick={() => handleVerifyVolume(vol.id, vol.assignedName)}
                      className="px-3 py-1.5 border border-slate-300 hover:bg-slate-100 text-slate-700 rounded text-xs font-medium transition flex items-center space-x-1.5"
                    >
                      <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
                      <span>Verify Hashes</span>
                    </button>

                    <button
                      onClick={() => handleOpenEdit(vol)}
                      className="px-3 py-1.5 bg-nkb-navy-900 hover:bg-nkb-navy-800 text-white rounded text-xs font-semibold shadow-sm transition flex items-center space-x-1.5"
                    >
                      <Settings2 className="w-3.5 h-3.5 text-nkb-gold-400" />
                      <span>Configure</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: OBSERVATIONS & CONFLICTS AUDIT */}
      {activeTab === 'observations' && (
        <div className="space-y-6">
          {/* Conflicts Section */}
          <div className="bg-white rounded border border-slate-200 overflow-hidden shadow-sm">
            <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <h2 className="text-xs font-bold text-nkb-navy-900 uppercase tracking-wider flex items-center space-x-2">
                <ShieldAlert className="w-4 h-4 text-red-600" />
                <span>Identity Conflicts ({(hardwareData.conflicts || []).length})</span>
              </h2>
              <span className="text-[11px] text-slate-500 font-mono">
                Automated Identity Mismatch Protection
              </span>
            </div>

            {(hardwareData.conflicts || []).length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2 opacity-80" />
                <div className="font-semibold text-slate-700">Zero Identity Conflicts Detected</div>
                <p className="text-[11px] text-slate-500 mt-1">All physical drives and volume UUIDs match verified database signatures.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {(hardwareData.conflicts || []).map((c) => (
                  <div key={c.id} className="p-4 space-y-1 text-xs">
                    <div className="flex items-center space-x-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-800">
                        {c.conflict_reason}
                      </span>
                      <span className="text-slate-500">{formatDate(c.detected_at)}</span>
                    </div>
                    <div className="font-mono text-[11px] text-slate-700">
                      Previous: {JSON.stringify(c.previous_snapshot)}
                    </div>
                    <div className="font-mono text-[11px] text-slate-700">
                      Current: {JSON.stringify(c.current_snapshot)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Observations Section */}
          <div className="bg-white rounded border border-slate-200 overflow-hidden shadow-sm">
            <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <h2 className="text-xs font-bold text-nkb-navy-900 uppercase tracking-wider flex items-center space-x-2">
                <Clock className="w-4 h-4 text-blue-600" />
                <span>Hardware Observations Log ({(hardwareData.observations || []).length})</span>
              </h2>
              <span className="text-[11px] text-slate-500 font-mono">
                Recent Drive Reconciliation Observations
              </span>
            </div>

            <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto">
              {(hardwareData.observations || []).slice(0, 30).map((obs) => (
                <div key={obs.id} className="p-3 text-xs flex items-center justify-between hover:bg-slate-50 transition">
                  <div className="space-y-0.5">
                    <div className="font-semibold text-slate-800 flex items-center space-x-2">
                      {renderConfidenceBadge(obs.computed_confidence)}
                      <span>{obs.reconciliation_verdict}</span>
                    </div>
                    {obs.observed_drive_letter && (
                      <div className="text-[11px] text-slate-500 font-mono">
                        Drive Letter: {obs.observed_drive_letter} &bull; Volume GUID: {obs.observed_volume_guid || 'N/A'}
                      </div>
                    )}
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono flex-shrink-0">
                    {formatDate(obs.observed_at)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Verification Status Banner */}
      {verifyStatus && (
        <div className="p-4 bg-blue-50 border border-blue-200 text-blue-800 rounded text-xs flex items-center justify-between shadow-sm">
          <div className="flex items-center space-x-2">
            <FileCheck2 className="w-4 h-4 text-blue-600 flex-shrink-0" />
            <span>{verifyStatus}</span>
          </div>
          <button onClick={() => setVerifyStatus(null)} className="text-blue-600 hover:text-blue-900 font-bold">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Edit Volume Configuration Modal */}
      {editModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded border border-slate-200 max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="font-bold text-sm text-nkb-navy-900">
                Configure Volume: {selectedVolume?.assignedName}
              </h3>
              <button onClick={() => setEditModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveConfig} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-600 font-semibold mb-1">Assigned Name</label>
                <input
                  type="text"
                  value={assignedName}
                  onChange={(e) => setAssignedName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-nkb-gold-500"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">Storage Purpose</label>
                <select
                  value={storagePurpose}
                  onChange={(e) => setStoragePurpose(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-nkb-gold-500"
                >
                  <option value="GENERAL">GENERAL (All file types)</option>
                  <option value="PRIMARY">PRIMARY (Default project files)</option>
                  <option value="DOCUMENTS">DOCUMENTS (PDFs, Office files)</option>
                  <option value="ARCHIVE">ARCHIVE (Infrequently accessed files)</option>
                  <option value="BACKUP">BACKUP (Independent cold backup destination)</option>
                  <option value="ADDITIONAL">ADDITIONAL (Expansion capacity)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">Priority (1 = Highest)</label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-nkb-gold-500"
                  required
                />
              </div>

              <div className="flex items-center space-x-2 pt-2">
                <input
                  type="checkbox"
                  id="isDefault"
                  checked={isDefault}
                  onChange={(e) => setIsDefault(e.target.checked)}
                  className="rounded text-nkb-navy-900 focus:ring-nkb-gold-500"
                />
                <label htmlFor="isDefault" className="text-slate-700 font-medium cursor-pointer">
                  Set as Default Storage Volume
                </label>
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setEditModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-nkb-navy-900 hover:bg-nkb-navy-800 text-white rounded text-xs font-semibold shadow-sm"
                >
                  Save Configuration
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Safe Drive Migration Modal */}
      {replaceModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded border border-slate-200 max-w-lg w-full p-6 space-y-4 shadow-xl">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="font-bold text-sm text-nkb-navy-900 flex items-center space-x-2">
                <ArrowRightLeft className="w-4 h-4 text-nkb-gold-500" />
                <span>Safe Drive Replacement & Non-Destructive Migration</span>
              </h3>
              <button
                onClick={() => setReplaceModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {!migrationPlan && !migrationDone && (
              <form onSubmit={handleGeneratePlan} className="space-y-4 text-xs">
                <p className="text-slate-600 leading-relaxed">
                  Migrates all files from a failing or retiring physical drive to a healthy replacement drive.
                  Every file chunk is verified via cryptographic SHA-256 before pointer updates. The source drive remains completely untouched.
                </p>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    Source Drive to Replace (Old Drive)
                  </label>
                  <select
                    value={replaceSourceId}
                    onChange={(e) => setReplaceSourceId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-nkb-gold-500"
                    required
                  >
                    <option value="">-- Select Source Drive --</option>
                    {volumes.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.assignedName} ({v.currentDriveLetter || 'No Letter'}) - {formatBytes(v.usedBytes)} used
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    Target Replacement Drive (New Drive)
                  </label>
                  <select
                    value={replaceTargetId}
                    onChange={(e) => setReplaceTargetId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-nkb-gold-500"
                    required
                  >
                    <option value="">-- Select Target Drive --</option>
                    {volumes.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.assignedName} ({v.currentDriveLetter || 'No Letter'}) - {formatBytes(v.freeBytes)} free
                      </option>
                    ))}
                  </select>
                </div>

                <div className="pt-3 border-t border-slate-100 flex justify-end space-x-2">
                  <button
                    type="button"
                    onClick={() => setReplaceModalOpen(false)}
                    className="px-4 py-2 border border-slate-300 rounded text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-nkb-navy-900 hover:bg-nkb-navy-800 text-white rounded text-xs font-semibold shadow-sm"
                  >
                    Generate Migration Plan
                  </button>
                </div>
              </form>
            )}

            {migrationPlan && !migrationDone && (
              <div className="space-y-4 text-xs">
                <div className="p-3 bg-blue-50 border border-blue-200 rounded text-blue-900 space-y-2">
                  <div className="font-bold">Migration Plan Verification:</div>
                  <div className="flex justify-between">
                    <span>Source Drive:</span>
                    <strong className="font-mono">{migrationPlan.sourceVolume}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Target Drive:</span>
                    <strong className="font-mono">{migrationPlan.targetVolume}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Total Files to Transfer:</span>
                    <strong className="font-mono">{migrationPlan.totalFiles} files</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Total Payload Size:</span>
                    <strong className="font-mono">{formatBytes(migrationPlan.totalBytes)}</strong>
                  </div>
                </div>

                <p className="text-slate-600">
                  Explicit Super Admin authorization is required to start chunk copying. The source drive will not be modified.
                </p>

                <div className="pt-3 border-t border-slate-100 flex justify-end space-x-2">
                  <button
                    type="button"
                    disabled={migrationRunning}
                    onClick={() => setMigrationPlan(null)}
                    className="px-4 py-2 border border-slate-300 rounded text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={migrationRunning}
                    onClick={handleApproveMigration}
                    className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded text-xs font-bold shadow-sm"
                  >
                    {migrationRunning ? 'Executing & Verifying Hashes...' : 'Authorize & Start Migration'}
                  </button>
                </div>
              </div>
            )}

            {migrationDone && (
              <div className="space-y-4 text-xs">
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded text-emerald-900 space-y-2">
                  <div className="font-bold flex items-center space-x-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    <span>Migration 100% Completed & Verified</span>
                  </div>
                  <p>{migrationDone.message}</p>
                  <div className="text-[11px] font-mono text-emerald-800">
                    Verified Bytes: {formatBytes(migrationDone.verifiedBytes)}
                  </div>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded text-slate-700 space-y-1">
                  <div className="font-semibold text-slate-900">Step 4: Manual Retirement Approval</div>
                  <p className="text-[11px]">
                    You may now safely retire the source drive. The drive will be marked RETIRED. Existing files on the physical disk are preserved untouched.
                  </p>
                </div>

                <div className="pt-3 border-t border-slate-100 flex justify-end space-x-2">
                  <button
                    type="button"
                    onClick={() => {
                      setReplaceModalOpen(false);
                      setMigrationPlan(null);
                      setMigrationDone(null);
                    }}
                    className="px-4 py-2 border border-slate-300 rounded text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Keep Old Drive Active
                  </button>
                  <button
                    type="button"
                    onClick={handleRetireSource}
                    className="px-4 py-2 bg-nkb-navy-900 hover:bg-nkb-navy-800 text-white rounded text-xs font-bold shadow-sm"
                  >
                    Approve Drive Retirement
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
