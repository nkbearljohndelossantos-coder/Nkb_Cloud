import React from 'react';
import {
  HardDrive,
  Folder,
  Share2,
  Users,
  Clock,
  Star,
  Trash2,
  FileText,
  Image,
  Video,
  Music,
  Archive,
  Server,
  Settings,
  ShieldCheck,
  LayoutDashboard,
  Cloud
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { formatBytes } from '../utils/formatters';

export default function Sidebar({ currentView, setCurrentView, currentCategory, setCurrentCategory, storageOverview }) {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'SUPER ADMIN';
  const isAdmin = user?.role === 'ADMIN' || isSuperAdmin;

  const usedBytes = user?.usedStorageBytes || 0;
  const quotaBytes = user?.storageQuotaBytes || (100 * 1024 * 1024 * 1024);
  const usedPercent = Math.min(100, Math.round((usedBytes / quotaBytes) * 100));

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'drive', label: 'My Drive', icon: HardDrive },
    { id: 'shared-with-me', label: 'Shared with me', icon: Share2 },
    { id: 'shared-drives', label: 'Shared Drives', icon: Folder },
    { id: 'recent', label: 'Recent', icon: Clock },
    { id: 'starred', label: 'Starred', icon: Star },
    { id: 'trash', label: 'Trash / Recycle Bin', icon: Trash2 },
  ];

  const categories = [
    { id: 'DOCUMENTS', label: 'Documents', icon: FileText },
    { id: 'PHOTOS', label: 'Photos & Images', icon: Image },
    { id: 'VIDEOS', label: 'Videos', icon: Video },
    { id: 'AUDIO', label: 'Audio', icon: Music },
    { id: 'ARCHIVES', label: 'Archives & Backups', icon: Archive },
  ];

  return (
    <aside className="w-64 bg-nkb-navy-900 text-slate-300 flex flex-col h-screen select-none border-r border-nkb-navy-800 flex-shrink-0">
      {/* Brand Header */}
      <div className="p-4 border-b border-nkb-navy-800 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded bg-nkb-gold-500 flex items-center justify-center text-nkb-navy-950 font-bold shadow-sm">
            <Cloud className="w-5 h-5 text-nkb-navy-950" />
          </div>
          <div>
            <div className="font-bold text-white text-base tracking-wide flex items-center">
              NKB <span className="text-nkb-gold-400 ml-1">CLOUD</span>
            </div>
            <div className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">
              NKB Manufacturing
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Links */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        {/* Core Drive Navigation */}
        <div className="space-y-1">
          <div className="px-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
            Storage Views
          </div>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setCurrentView(item.id);
                  setCurrentCategory(null);
                }}
                className={`w-full flex items-center space-x-3 px-3 py-2 rounded text-xs font-medium transition-colors text-left ${
                  isActive
                    ? 'bg-nkb-navy-800 text-nkb-gold-400 font-semibold border-l-2 border-nkb-gold-500'
                    : 'text-slate-300 hover:bg-nkb-navy-800/60 hover:text-white'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-nkb-gold-400' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* Categories Section */}
        <div className="space-y-1">
          <div className="px-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
            Categories
          </div>
          {categories.map((cat) => {
            const Icon = cat.icon;
            const isActive = currentView === 'category' && currentCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => {
                  setCurrentView('category');
                  setCurrentCategory(cat.id);
                }}
                className={`w-full flex items-center space-x-3 px-3 py-2 rounded text-xs font-medium transition-colors text-left ${
                  isActive
                    ? 'bg-nkb-navy-800 text-nkb-gold-400 font-semibold border-l-2 border-nkb-gold-500'
                    : 'text-slate-300 hover:bg-nkb-navy-800/60 hover:text-white'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-nkb-gold-400' : 'text-slate-400'}`} />
                <span>{cat.label}</span>
              </button>
            );
          })}
        </div>

        {/* Administration Links (if Admin or Super Admin) */}
        {isAdmin && (
          <div className="space-y-1 pt-2 border-t border-nkb-navy-800/80">
            <div className="px-3 text-[11px] font-semibold text-nkb-gold-400 uppercase tracking-wider mb-2 flex items-center justify-between">
              <span>Administration</span>
              <span className="text-[9px] bg-nkb-gold-500/20 text-nkb-gold-300 px-1.5 py-0.5 rounded">ADMIN</span>
            </div>

            <button
              onClick={() => {
                setCurrentView('storage');
                setCurrentCategory(null);
              }}
              className={`w-full flex items-center space-x-3 px-3 py-2 rounded text-xs font-medium transition-colors text-left ${
                currentView === 'storage'
                  ? 'bg-nkb-navy-800 text-nkb-gold-400 font-semibold border-l-2 border-nkb-gold-500'
                  : 'text-slate-300 hover:bg-nkb-navy-800/60 hover:text-white'
              }`}
            >
              <HardDrive className={`w-4 h-4 ${currentView === 'storage' ? 'text-nkb-gold-400' : 'text-slate-400'}`} />
              <div className="flex-1 flex items-center justify-between">
                <span>Storage & Hardware</span>
                {storageOverview?.connectedDrives !== undefined && (
                  <span className="text-[10px] bg-emerald-950 text-emerald-400 font-mono px-1.5 py-0.2 rounded">
                    {storageOverview.connectedDrives} Online
                  </span>
                )}
              </div>
            </button>

            <button
              onClick={() => {
                setCurrentView('users');
                setCurrentCategory(null);
              }}
              className={`w-full flex items-center space-x-3 px-3 py-2 rounded text-xs font-medium transition-colors text-left ${
                currentView === 'users'
                  ? 'bg-nkb-navy-800 text-nkb-gold-400 font-semibold border-l-2 border-nkb-gold-500'
                  : 'text-slate-300 hover:bg-nkb-navy-800/60 hover:text-white'
              }`}
            >
              <Users className={`w-4 h-4 ${currentView === 'users' ? 'text-nkb-gold-400' : 'text-slate-400'}`} />
              <span>User Accounts</span>
            </button>

            {isSuperAdmin && (
              <button
                onClick={() => {
                  setCurrentView('audit');
                  setCurrentCategory(null);
                }}
                className={`w-full flex items-center space-x-3 px-3 py-2 rounded text-xs font-medium transition-colors text-left ${
                  currentView === 'audit'
                    ? 'bg-nkb-navy-800 text-nkb-gold-400 font-semibold border-l-2 border-nkb-gold-500'
                    : 'text-slate-300 hover:bg-nkb-navy-800/60 hover:text-white'
                }`}
              >
                <ShieldCheck className={`w-4 h-4 ${currentView === 'audit' ? 'text-nkb-gold-400' : 'text-slate-400'}`} />
                <span>Audit Trail</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Storage Quota Card in Footer */}
      <div className="p-4 border-t border-nkb-navy-800 bg-nkb-navy-950/60">
        <div className="flex items-center justify-between text-xs mb-1.5">
          <span className="text-slate-300 font-medium">Personal Storage</span>
          <span className="text-nkb-gold-400 font-semibold">{usedPercent}%</span>
        </div>
        <div className="w-full h-1.5 bg-nkb-navy-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-nkb-gold-500 rounded-full"
            style={{ width: `${usedPercent}%` }}
          />
        </div>
        <div className="mt-2 text-[11px] text-slate-400 flex justify-between">
          <span>{formatBytes(usedBytes)} used</span>
          <span>{formatBytes(quotaBytes)} quota</span>
        </div>
      </div>
    </aside>
  );
}
