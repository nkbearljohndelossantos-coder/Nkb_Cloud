import React, { useState } from 'react';
import { X, Copy, Check, Link, Users, Lock, Shield, Calendar } from 'lucide-react';
import api from '../api/client';

export default function ShareModal({ file, folder, onClose }) {
  const item = file || folder;
  const isFile = !!file;

  const [activeTab, setActiveTab] = useState('link'); // 'link' | 'user'
  const [permissionLevel, setPermissionLevel] = useState('VIEW');
  const [allowDownload, setAllowDownload] = useState(true);
  const [password, setPassword] = useState('');
  const [expiresInDays, setExpiresInDays] = useState('7');

  const [shareResult, setShareResult] = useState(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleGenerateShare = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await api.post('/shares', {
        fileId: isFile ? item.id : null,
        folderId: !isFile ? item.id : null,
        isPublicLink: true,
        permissionLevel,
        allowDownload,
        password: password.trim() ? password.trim() : null,
        expiresInDays: parseInt(expiresInDays) || null
      });

      setShareResult(res.data.share);
    } catch (err) {
      alert(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!shareResult?.shareToken) return;
    const fullUrl = `${window.location.origin}/share/${shareResult.shareToken}`;
    navigator.clipboard.writeText(fullUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-none flex items-center justify-center p-4 z-50 select-none">
      <div className="bg-white rounded border border-slate-200 max-w-md w-full p-6 space-y-5 shadow-xl">
        {/* Header */}
        <div className="flex justify-between items-center border-b border-slate-100 pb-3">
          <div>
            <h3 className="font-bold text-sm text-nkb-navy-900">
              Share "{item?.name}"
            </h3>
            <p className="text-[11px] text-slate-500">
              Google Drive-style secure sharing without exposing physical storage paths
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Share Link Generation Form */}
        <form onSubmit={handleGenerateShare} className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Access Permission</label>
            <select
              value={permissionLevel}
              onChange={(e) => setPermissionLevel(e.target.value)}
              className="w-full border border-slate-300 rounded px-3 py-2 text-xs focus:ring-1 focus:ring-nkb-gold-500 focus:outline-none"
            >
              <option value="VIEW">Viewer (Can preview authorized content)</option>
              <option value="EDIT">Editor (Can view, download, and update)</option>
              <option value="DOWNLOAD_ONLY">Download Only (Direct package download)</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Expires After</label>
              <select
                value={expiresInDays}
                onChange={(e) => setExpiresInDays(e.target.value)}
                className="w-full border border-slate-300 rounded px-3 py-2 text-xs focus:ring-1 focus:ring-nkb-gold-500 focus:outline-none"
              >
                <option value="1">1 Day</option>
                <option value="7">7 Days (Standard)</option>
                <option value="30">30 Days</option>
                <option value="90">90 Days</option>
                <option value="0">Never Expires</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Password (Optional)</label>
              <input
                type="password"
                placeholder="Optional link password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border border-slate-300 rounded px-3 py-2 text-xs focus:ring-1 focus:ring-nkb-gold-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex items-center space-x-2 pt-1">
            <input
              type="checkbox"
              id="allowDl"
              checked={allowDownload}
              onChange={(e) => setAllowDownload(e.target.checked)}
              className="rounded text-nkb-gold-500 focus:ring-nkb-gold-500"
            />
            <label htmlFor="allowDl" className="font-medium text-slate-700">
              Allow recipients to download physical file payload
            </label>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 bg-nkb-navy-900 hover:bg-nkb-navy-800 text-white font-bold rounded text-xs shadow-sm transition disabled:opacity-50"
          >
            {loading ? 'Generating Link...' : 'Create Secure Share Link'}
          </button>
        </form>

        {/* Result Link Display */}
        {shareResult && (
          <div className="p-3 bg-slate-50 border border-slate-200 rounded space-y-2 text-xs">
            <span className="font-semibold text-slate-800">Generated Share Link:</span>
            <div className="flex items-center space-x-2">
              <input
                type="text"
                readOnly
                value={`${window.location.origin}/share/${shareResult.shareToken}`}
                className="flex-1 bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs font-mono text-slate-700"
              />
              <button
                type="button"
                onClick={handleCopy}
                className="px-3 py-1.5 bg-nkb-gold-500 hover:bg-nkb-gold-600 text-nkb-navy-950 font-bold rounded text-xs flex items-center space-x-1"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied!' : 'Copy'}</span>
              </button>
            </div>
            <div className="text-[11px] text-slate-500">
              Physical path and drive letters are safely masked.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
