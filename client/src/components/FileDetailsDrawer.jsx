import React, { useState } from 'react';
import {
  X,
  HardDrive,
  ShieldCheck,
  Clock,
  User,
  Copy,
  Check,
  FileText,
  AlertTriangle,
  History
} from 'lucide-react';
import { formatBytes, formatDate, getFileIcon } from '../utils/formatters';

export default function FileDetailsDrawer({ file, onClose }) {
  if (!file) return null;

  const [copiedHash, setCopiedHash] = useState(false);
  const isOffline = file.status === 'UNAVAILABLE_DRIVE_OFFLINE';

  const handleCopyHash = () => {
    if (file.sha256_hash) {
      navigator.clipboard.writeText(file.sha256_hash);
      setCopiedHash(true);
      setTimeout(() => setCopiedHash(false), 2000);
    }
  };

  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-white border-l border-slate-200 shadow-2xl z-40 flex flex-col select-none animate-in slide-in-from-right duration-200">
      {/* Drawer Header */}
      <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
        <div className="flex items-center space-x-2">
          {getFileIcon(file.category, file.extension, "w-5 h-5")}
          <span className="font-bold text-xs text-nkb-navy-900 truncate max-w-[240px]">
            {file.name}
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1 text-slate-400 hover:text-slate-600 rounded hover:bg-slate-200/60"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Drawer Content */}
      <div className="flex-1 overflow-y-auto p-5 space-y-6 text-xs">
        {/* Drive Offline Warning if applicable */}
        {isOffline && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded text-amber-900 space-y-1">
            <div className="font-bold flex items-center space-x-1.5 text-xs text-amber-950">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <span>Storage Drive is Currently Offline</span>
            </div>
            <p className="text-[11px] text-amber-800">
              The external or internal drive housing this file has been temporarily detached. All file records and metadata remain preserved. Access will resume automatically upon reconnection.
            </p>
          </div>
        )}

        {/* General File Details */}
        <div className="space-y-3">
          <div className="font-bold text-slate-400 uppercase tracking-wider text-[10px]">
            File Specifications
          </div>
          <div className="space-y-2 bg-slate-50 p-3 rounded border border-slate-200">
            <div className="flex justify-between">
              <span className="text-slate-500">File Size:</span>
              <span className="font-mono font-semibold text-slate-800">{formatBytes(file.size_bytes)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Category:</span>
              <span className="font-semibold text-slate-800">{file.category}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Extension:</span>
              <span className="font-mono font-semibold text-slate-800">.{file.extension || 'bin'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Uploaded:</span>
              <span className="text-slate-700">{formatDate(file.created_at)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Owner:</span>
              <span className="text-slate-700 font-medium">{file.owner_name || 'NKB Staff'}</span>
            </div>
          </div>
        </div>

        {/* Physical Storage Assignment */}
        <div className="space-y-3">
          <div className="font-bold text-slate-400 uppercase tracking-wider text-[10px]">
            Physical Drive Assignment
          </div>
          <div className="space-y-2 bg-slate-50 p-3 rounded border border-slate-200">
            <div className="flex justify-between">
              <span className="text-slate-500">Assigned Drive:</span>
              <span className="font-bold text-nkb-navy-900">{file.volume_assigned_name || 'NKB-STORAGE-01'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Drive Status:</span>
              <span className={`font-semibold ${isOffline ? 'text-amber-600' : 'text-emerald-600'}`}>
                {file.volume_status || (isOffline ? 'OFFLINE' : 'ONLINE')}
              </span>
            </div>
            <div className="pt-2 border-t border-slate-200/60">
              <span className="text-slate-500 block mb-1">Permanent Volume UUID:</span>
              <span className="font-mono text-[10px] text-slate-700 block truncate" title={file.storage_volume_id}>
                {file.storage_volume_id}
              </span>
            </div>
          </div>
        </div>

        {/* Cryptographic SHA-256 Hash */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-bold text-slate-400 uppercase tracking-wider text-[10px]">
              SHA-256 Integrity Checksum
            </span>
            <button
              onClick={handleCopyHash}
              className="text-nkb-gold-600 hover:text-nkb-gold-700 font-semibold flex items-center space-x-1"
            >
              {copiedHash ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
              <span>{copiedHash ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
          <div className="p-2.5 bg-slate-100 rounded border border-slate-200 font-mono text-[10px] break-all text-slate-700 select-all">
            {file.sha256_hash}
          </div>
        </div>

        {/* Version History */}
        <div className="space-y-2">
          <div className="flex items-center space-x-1.5 font-bold text-slate-400 uppercase tracking-wider text-[10px]">
            <History className="w-3.5 h-3.5 text-slate-500" />
            <span>Version History</span>
          </div>
          <div className="border border-slate-200 rounded divide-y divide-slate-100">
            <div className="p-2.5 bg-slate-50 flex items-center justify-between">
              <div>
                <span className="font-bold text-slate-800">Version {file.current_version_num || 1} (Current)</span>
                <div className="text-[10px] text-slate-500">{formatDate(file.created_at)}</div>
              </div>
              <span className="font-mono text-slate-700 font-medium">{formatBytes(file.size_bytes)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
