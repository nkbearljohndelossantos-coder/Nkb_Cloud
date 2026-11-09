import React, { useState } from 'react';
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
  Archive
} from 'lucide-react';
import api from '../api/client';
import { formatBytes, formatDate } from '../utils/formatters';

export default function StorageManagementView({ volumes, onRefresh, agentConnected, storageOverview }) {
  const [scanning, setScanning] = useState(false);
  const [selectedVolume, setSelectedVolume] = useState(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [replaceModalOpen, setReplaceModalOpen] = useState(false);
  const [verifyStatus, setVerifyStatus] = useState(null);

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

  // 1. Hardware scan
  const handleScanDrives = async () => {
    setScanning(true);
    try {
      await api.post('/storage/scan');
      await onRefresh();
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
      setVerifyStatus(`Verification Finished: ${res.data.verifiedCount} valid files verified, ${res.data.corruptedCount} corrupted.`);
      onRefresh();
    } catch (err) {
      setVerifyStatus(`Verification error: ${err.response?.data?.error || err.message}`);
    }
  };

  // 6. Safe Drive Replacement Wizard (Requirement 4)
  // Step 1: Plan migration
  const handlePlanMigration = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post('/storage/migrations/initiate', {
        sourceVolumeId: replaceSourceId,
        targetVolumeId: replaceTargetId
      });
      setMigrationPlan(res.data.migration);
    } catch (err) {
      alert(err.response?.data?.error || err.message);
    }
  };

  // Step 2: Approve & Execute Migration
  const handleApproveMigration = async () => {
    if (!migrationPlan) return;
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

  // Step 3: Retire source drive safely
  const handleRetireSource = async () => {
    if (!migrationPlan) return;
    try {
      const res = await api.post(`/storage/migrations/${migrationPlan.id}/retire`);
      alert(res.data.message);
      setReplaceModalOpen(false);
      setMigrationPlan(null);
      setMigrationDone(null);
      onRefresh();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6 select-none">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <Server className="w-5 h-5 text-nkb-gold-500" />
            <h1 className="text-xl font-bold text-nkb-navy-900 tracking-tight">
              Physical Storage Devices & Composite Identity
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Zero NAS required &bull; Ordinary USB SSD/HDD, SATA, and NVMe drives &bull; Permanent composite fingerprints
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={handleScanDrives}
            disabled={scanning || !agentConnected}
            className="flex items-center space-x-2 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-semibold transition disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${scanning ? 'animate-spin' : ''}`} />
            <span>{scanning ? 'Scanning Hardware...' : 'Scan Connected Drives'}</span>
          </button>

          <button
            onClick={() => setReplaceModalOpen(true)}
            className="flex items-center space-x-2 px-3 py-2 bg-nkb-navy-900 hover:bg-nkb-navy-800 text-white rounded text-xs font-semibold shadow-sm transition"
          >
            <ArrowRightLeft className="w-3.5 h-3.5 text-nkb-gold-400" />
            <span>Safe Drive Replacement Wizard</span>
          </button>
        </div>
      </div>

      {/* Critical Non-Negotiable Disclaimers */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Drive Protection Banner */}
        <div className="p-4 bg-amber-50 border border-amber-200 rounded text-xs text-amber-900 space-y-1">
          <div className="font-bold flex items-center space-x-2 text-amber-950">
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
            <span>Zero-Wipe Drive Disconnection Rule:</span>
          </div>
          <p className="text-[11px] text-amber-800 leading-relaxed">
            When a drive is disconnected, it is marked <strong className="font-semibold">OFFLINE</strong>. All catalog records, file structures, and metadata remain strictly intact. The system will NEVER automatically format or initialize any drive.
          </p>
        </div>

        {/* Independent Backup Disclaimer (Requirement 14) */}
        <div className="p-4 bg-slate-100 border border-slate-300 rounded text-xs text-slate-800 space-y-1">
          <div className="font-bold flex items-center space-x-2 text-slate-900">
            <Archive className="w-4 h-4 text-slate-700 flex-shrink-0" />
            <span>Data Protection & Backup Policy Notice:</span>
          </div>
          <p className="text-[11px] text-slate-600 leading-relaxed">
            Pooling multiple physical HDDs/SSDs provides storage expansion, <strong className="font-semibold text-slate-900">not a backup</strong>. For disaster protection, designate an independent drive with Purpose <strong className="font-semibold text-slate-900">"BACKUP"</strong>.
          </p>
        </div>
      </div>

      {/* Storage Placement Policy Selector (Requirement 7) */}
      <div className="bg-white p-4 rounded border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
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

      {/* Verification status pill */}
      {verifyStatus && (
        <div className="p-3 bg-blue-50 border border-blue-200 text-blue-800 rounded text-xs flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <FileCheck2 className="w-4 h-4 text-blue-600" />
            <span>{verifyStatus}</span>
          </div>
          <button onClick={() => setVerifyStatus(null)} className="text-blue-600 hover:text-blue-900">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Drives Grid */}
      <div className="bg-white rounded border border-slate-200 overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <h2 className="text-xs font-bold text-nkb-navy-900 uppercase tracking-wider">
            Registered Physical Volumes ({volumes.length})
          </h2>
          <span className="text-[11px] text-slate-500 font-mono">
            Composite Identity Active (SHA-256 Fingerprints)
          </span>
        </div>

        <div className="divide-y divide-slate-100">
          {volumes.map((vol) => (
            <div key={vol.id} className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-6 hover:bg-slate-50/50 transition">
              {/* Left Column */}
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
                        : vol.status === 'RETIRED'
                        ? 'bg-slate-100 text-slate-600 border border-slate-200'
                        : 'bg-red-50 text-red-700 border border-red-200'
                    }`}
                  >
                    {vol.status}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 font-medium">
                  <span>Current Letter: <strong className="text-slate-800 font-mono">{vol.currentDriveLetter}</strong></span>
                  <span>Filesystem: <strong className="text-slate-800">{vol.filesystem}</strong></span>
                  <span>Bus: <strong className="text-slate-800">{vol.device?.busType}</strong></span>
                  <span>Media: <strong className="text-slate-800">{vol.device?.mediaType}</strong></span>
                  <span>Purpose: <strong className="text-slate-800">{vol.storagePurpose}</strong></span>
                  <span>Priority: <strong className="text-slate-800">{vol.priority}</strong></span>
                </div>

                <div className="text-[11px] text-slate-500 font-mono flex items-center space-x-2 pt-1">
                  <span title={vol.compositeIdentity}>Composite Fingerprint: {vol.compositeIdentity ? `${vol.compositeIdentity.substring(0, 16)}...` : 'N/A'}</span>
                  <span>&bull;</span>
                  <span>Hardware Serial: {vol.device?.hardwareSerial}</span>
                </div>
              </div>

              {/* Middle Column */}
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

              {/* Right Column */}
              <div className="flex items-center space-x-2 flex-shrink-0">
                <button
                  onClick={() => handleVerifyVolume(vol.id, vol.assignedName)}
                  title="Verify SHA-256 hashes of files on this physical disk"
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
                <label className="block font-semibold text-slate-700 mb-1">Assigned Name</label>
                <input
                  type="text"
                  value={assignedName}
                  onChange={(e) => setAssignedName(e.target.value)}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-xs focus:ring-1 focus:ring-nkb-gold-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Storage Purpose</label>
                <select
                  value={storagePurpose}
                  onChange={(e) => setStoragePurpose(e.target.value)}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-xs focus:ring-1 focus:ring-nkb-gold-500 focus:outline-none"
                >
                  <option value="PRIMARY">PRIMARY (General storage pool)</option>
                  <option value="DOCUMENTS">DOCUMENTS (Engineering & office files)</option>
                  <option value="ARCHIVE">ARCHIVE (Cold storage / historical records)</option>
                  <option value="ADDITIONAL">ADDITIONAL (Expansion capacity)</option>
                  <option value="BACKUP">BACKUP (Dedicated isolated backup target)</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Storage Priority (Lower = higher preference)</label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-xs focus:ring-1 focus:ring-nkb-gold-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center space-x-2 pt-2">
                <input
                  type="checkbox"
                  id="isDefaultCheck"
                  checked={isDefault}
                  onChange={(e) => setIsDefault(e.target.checked)}
                  className="rounded text-nkb-gold-500 focus:ring-nkb-gold-500"
                />
                <label htmlFor="isDefaultCheck" className="font-semibold text-slate-700">
                  Set as Default Storage Target for New Uploads
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

      {/* Safe Drive Replacement Wizard Modal (Requirement 4) */}
      {replaceModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded border border-slate-200 max-w-lg w-full p-6 space-y-4 shadow-xl">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2">
                <ArrowRightLeft className="w-4 h-4 text-nkb-gold-500" />
                <h3 className="font-bold text-sm text-nkb-navy-900">
                  Safe Storage Replacement & Verification Wizard
                </h3>
              </div>
              <button
                onClick={() => {
                  setReplaceModalOpen(false);
                  setMigrationPlan(null);
                  setMigrationDone(null);
                }}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Stage 1: Form to Plan */}
            {!migrationPlan && !migrationDone && (
              <form onSubmit={handlePlanMigration} className="space-y-4 text-xs">
                <p className="text-slate-600">
                  Plan safe file migration from an old drive to a new expansion drive. Every file will be transferred and validated with SHA-256 before the old drive can be safely retired.
                </p>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Source Drive (To be replaced)</label>
                  <select
                    value={replaceSourceId}
                    onChange={(e) => setReplaceSourceId(e.target.value)}
                    required
                    className="w-full border border-slate-300 rounded px-3 py-2 text-xs focus:ring-1 focus:ring-nkb-gold-500 focus:outline-none"
                  >
                    <option value="">Select source drive...</option>
                    {volumes.map(v => (
                      <option key={v.id} value={v.id}>
                        {v.assignedName} ({v.currentDriveLetter}) - {formatBytes(v.usedBytes)} used
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Target Replacement Drive</label>
                  <select
                    value={replaceTargetId}
                    onChange={(e) => setReplaceTargetId(e.target.value)}
                    required
                    className="w-full border border-slate-300 rounded px-3 py-2 text-xs focus:ring-1 focus:ring-nkb-gold-500 focus:outline-none"
                  >
                    <option value="">Select target drive...</option>
                    {volumes.map(v => (
                      <option key={v.id} value={v.id} disabled={v.id === replaceSourceId}>
                        {v.assignedName} ({v.currentDriveLetter}) - {formatBytes(v.freeBytes)} free
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

            {/* Stage 2: Administrator Approval Step */}
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

            {/* Stage 3 & 4: Verification & Safe Retirement Approval */}
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
