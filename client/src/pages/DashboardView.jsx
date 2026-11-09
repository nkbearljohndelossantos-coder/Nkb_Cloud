import React from 'react';
import {
  HardDrive,
  Database,
  CheckCircle,
  AlertOctagon,
  FileText,
  Folder,
  Users,
  Activity,
  ArrowRight,
  Server,
  ShieldCheck,
  Cpu
} from 'lucide-react';
import { formatBytes, formatDate } from '../utils/formatters';

export default function DashboardView({ overview, volumes, recentActivities, onNavigateToStorage, onNavigateToDrive }) {
  const totalBytes = BigInt(overview?.totalStorageBytes || '0');
  const usedBytes = BigInt(overview?.usedStorageBytes || '0');
  const freeBytes = BigInt(overview?.freeStorageBytes || '0');
  const usagePct = overview?.usagePercentage || 0;

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 select-none">
      {/* Page Title */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-nkb-navy-900 tracking-tight">
            NKB Cloud Enterprise Storage
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Private Multi-Device Cloud Platform &bull; Hostinger VPS &bull; Windows Storage Host
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={onNavigateToStorage}
            className="flex items-center space-x-2 px-3 py-2 bg-nkb-navy-900 hover:bg-nkb-navy-800 text-white rounded text-xs font-semibold shadow-sm transition"
          >
            <Server className="w-3.5 h-3.5 text-nkb-gold-400" />
            <span>Manage Drives</span>
          </button>
          <button
            onClick={onNavigateToDrive}
            className="flex items-center space-x-2 px-3 py-2 border border-slate-300 hover:bg-slate-100 text-slate-700 rounded text-xs font-semibold transition"
          >
            <span>Open File Manager</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Widget Grid 1: Storage Capacities */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Total Storage */}
        <div className="bg-white p-5 rounded border border-slate-200">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Total Storage</span>
            <Database className="w-4 h-4 text-nkb-navy-900" />
          </div>
          <div className="text-2xl font-bold text-nkb-navy-900 mt-2 font-mono">
            {formatBytes(totalBytes)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Across {overview?.totalVolumes || 0} registered drive volumes
          </div>
        </div>

        {/* Used Storage */}
        <div className="bg-white p-5 rounded border border-slate-200">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Used Storage</span>
            <HardDrive className="w-4 h-4 text-nkb-gold-500" />
          </div>
          <div className="text-2xl font-bold text-nkb-gold-600 mt-2 font-mono">
            {formatBytes(usedBytes)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {usagePct}% allocated of total capacity
          </div>
        </div>

        {/* Available Storage */}
        <div className="bg-white p-5 rounded border border-slate-200">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Available Storage</span>
            <CheckCircle className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-emerald-700 mt-2 font-mono">
            {formatBytes(freeBytes)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Ready for chunked file writes
          </div>
        </div>

        {/* Connected Drives */}
        <div className="bg-white p-5 rounded border border-slate-200">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Drive Health & Status</span>
            <Server className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="flex items-baseline space-x-2 mt-2">
            <span className="text-2xl font-bold text-emerald-600 font-mono">
              {overview?.connectedDrives || 0}
            </span>
            <span className="text-xs text-slate-500 font-medium">Online</span>
            <span className="text-slate-300">/</span>
            <span className="text-lg font-bold text-slate-400 font-mono">
              {overview?.offlineDrives || 0}
            </span>
            <span className="text-xs text-slate-400 font-medium">Offline</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Zero NAS required &bull; Ordinary USB/SATA
          </div>
        </div>
      </div>

      {/* Widget Grid 2: File catalogue & Users */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded border border-slate-200 flex items-center space-x-4">
          <div className="p-3 bg-slate-100 rounded text-slate-700">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <div className="text-lg font-bold text-slate-800 font-mono">{overview?.totalFiles || 0}</div>
            <div className="text-xs text-slate-500">Total Catalogued Files</div>
          </div>
        </div>

        <div className="bg-white p-4 rounded border border-slate-200 flex items-center space-x-4">
          <div className="p-3 bg-slate-100 rounded text-slate-700">
            <Folder className="w-5 h-5" />
          </div>
          <div>
            <div className="text-lg font-bold text-slate-800 font-mono">{overview?.totalFolders || 0}</div>
            <div className="text-xs text-slate-500">Total Directories</div>
          </div>
        </div>

        <div className="bg-white p-4 rounded border border-slate-200 flex items-center space-x-4">
          <div className="p-3 bg-slate-100 rounded text-slate-700">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <div className="text-lg font-bold text-slate-800 font-mono">{overview?.activeUsers || 0}</div>
            <div className="text-xs text-slate-500">Active Authorized Users</div>
          </div>
        </div>

        <div className="bg-white p-4 rounded border border-slate-200 flex items-center space-x-4">
          <div className="p-3 bg-slate-100 rounded text-emerald-700">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="text-lg font-bold text-slate-800 font-mono">SHA-256</div>
            <div className="text-xs text-slate-500">Integrity Verification</div>
          </div>
        </div>
      </div>

      {/* Storage Breakdown & Connected Drives Table */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Drive Capacity Visuals */}
        <div className="bg-white p-6 rounded border border-slate-200 lg:col-span-1 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <h2 className="text-xs font-bold text-nkb-navy-900 uppercase tracking-wider">
              Total Storage Allocation
            </h2>
            <span className="text-xs font-bold font-mono text-nkb-gold-600">{usagePct}%</span>
          </div>

          <div className="w-full h-3 bg-slate-100 rounded overflow-hidden">
            <div className="h-full bg-nkb-gold-500 rounded" style={{ width: `${usagePct}%` }} />
          </div>

          <div className="space-y-3 pt-2 text-xs">
            <div className="flex justify-between items-center text-slate-600">
              <span className="flex items-center space-x-2">
                <span className="w-2.5 h-2.5 rounded-sm bg-nkb-gold-500 inline-block" />
                <span>Used Physical Storage</span>
              </span>
              <span className="font-mono font-medium text-slate-900">{formatBytes(usedBytes)}</span>
            </div>
            <div className="flex justify-between items-center text-slate-600">
              <span className="flex items-center space-x-2">
                <span className="w-2.5 h-2.5 rounded-sm bg-slate-200 inline-block" />
                <span>Free Expansion Space</span>
              </span>
              <span className="font-mono font-medium text-slate-900">{formatBytes(freeBytes)}</span>
            </div>
            <div className="flex justify-between items-center text-slate-600 pt-2 border-t border-slate-100">
              <span className="font-semibold text-slate-800">Total Registered</span>
              <span className="font-mono font-bold text-nkb-navy-900">{formatBytes(totalBytes)}</span>
            </div>
          </div>

          <div className="mt-4 p-3 bg-slate-50 border border-slate-200 rounded text-[11px] text-slate-600 space-y-1">
            <div className="font-semibold text-slate-800">Storage Expansion Protocol:</div>
            <div>Attach any USB or SATA HDD/SSD to the Windows host. The agent identifies it by Volume UUID automatically.</div>
          </div>
        </div>

        {/* Drives Quick Overview */}
        <div className="bg-white p-6 rounded border border-slate-200 lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <h2 className="text-xs font-bold text-nkb-navy-900 uppercase tracking-wider">
              Connected Storage Devices
            </h2>
            <button
              onClick={onNavigateToStorage}
              className="text-xs text-nkb-gold-600 hover:text-nkb-gold-700 font-semibold"
            >
              View Full Inventory &rarr;
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3 font-semibold">Drive Name</th>
                  <th className="py-2.5 px-3 font-semibold">Type & Letter</th>
                  <th className="py-2.5 px-3 font-semibold">Purpose</th>
                  <th className="py-2.5 px-3 font-semibold">Capacity</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {volumes && volumes.length > 0 ? (
                  volumes.slice(0, 5).map((vol) => (
                    <tr key={vol.id} className="hover:bg-slate-50/60">
                      <td className="py-3 px-3">
                        <div className="font-semibold text-slate-800">{vol.assignedName}</div>
                        <div className="text-[10px] text-slate-400 font-mono truncate max-w-[140px]">
                          {vol.volumeUuid}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-mono text-slate-700 font-medium">
                          {vol.currentDriveLetter} ({vol.filesystem})
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {vol.device?.mediaType} &bull; {vol.device?.busType}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <span className="text-[10px] bg-slate-100 text-slate-700 font-semibold px-2 py-0.5 rounded">
                          {vol.storagePurpose}
                        </span>
                      </td>
                      <td className="py-3 px-3 w-40">
                        <div className="flex justify-between text-[10px] text-slate-500 mb-1 font-mono">
                          <span>{formatBytes(vol.usedBytes)}</span>
                          <span>{formatBytes(vol.totalBytes)}</span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${vol.usagePercentage > 90 ? 'bg-red-500' : 'bg-nkb-gold-500'}`}
                            style={{ width: `${vol.usagePercentage}%` }}
                          />
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right">
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded inline-block ${
                            vol.status === 'ONLINE'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-red-50 text-red-700 border border-red-200'
                          }`}
                        >
                          {vol.status}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="5" className="py-6 text-center text-slate-400">
                      No storage drives registered yet. Connect Windows Storage Agent.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Recent Audit Activities */}
      <div className="bg-white p-6 rounded border border-slate-200 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center space-x-2">
            <Activity className="w-4 h-4 text-slate-600" />
            <h2 className="text-xs font-bold text-nkb-navy-900 uppercase tracking-wider">
              Recent System & File Activity Logs
            </h2>
          </div>
          <span className="text-[11px] text-slate-400">Real-time audit recording</span>
        </div>

        <div className="divide-y divide-slate-100 text-xs">
          {recentActivities && recentActivities.length > 0 ? (
            recentActivities.slice(0, 6).map((log) => (
              <div key={log.id} className="py-2.5 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <span className="font-mono text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">
                    {log.action}
                  </span>
                  <span className="text-slate-700 font-medium">
                    {log.user_name || 'System / Agent'}
                  </span>
                  <span className="text-slate-400 text-[11px]">
                    {log.entity_type} {log.entity_id ? `(${log.entity_id.substring(0, 8)}...)` : ''}
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 font-mono">
                  {formatDate(log.created_at)}
                </div>
              </div>
            ))
          ) : (
            <div className="py-4 text-center text-slate-400">
              No audit records logged yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
