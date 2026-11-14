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
  Cloud,
  FolderOpen,
  Compass,
  Laptop,
  X
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { formatBytes } from '../utils/formatters';

export default function Sidebar({
  currentView,
  setCurrentView,
  currentCategory,
  setCurrentCategory,
  storageOverview,
  isOpen = false,
  onClose
}) {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'SUPER ADMIN';
  const isAdmin = user?.role === 'ADMIN' || isSuperAdmin;

  const handleNav = (id) => {
    setCurrentView(id);
    if (onClose) onClose();
  };

  const handleCategoryNav = (catId) => {
    setCurrentView('category');
    setCurrentCategory(catId);
    if (onClose) onClose();
  };

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
    <>
      {/* Mobile Drawer Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 md:hidden transition-opacity"
          onClick={onClose}
        />
      )}

      <aside className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-nkb-navy-900 text-slate-300 flex flex-col h-screen select-none border-r border-nkb-navy-800 flex-shrink-0 transition-transform duration-200 ease-in-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 md:static
      `}>
        {/* Brand Header */}
        <div className="p-4 border-b border-nkb-navy-800 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <img
              src="/logo.png"
              alt="NKB Cloud Logo"
              className="h-11 w-auto object-contain drop-shadow-md hover:scale-105 transition-transform"
            />
            <div>
              <div className="font-extrabold text-white text-base tracking-wide flex items-center leading-tight">
                NKB <span className="text-nkb-gold-400 ml-1">CLOUD</span>
              </div>
              <div className="text-[10px] text-slate-400 font-medium uppercase tracking-wider mt-0.5">
                NKB Manufacturing
              </div>
            </div>
          </div>

          {/* Mobile Close Button */}
          <button
            onClick={onClose}
            className="md:hidden p-1.5 text-slate-400 hover:text-white hover:bg-nkb-navy-800 rounded transition"
            title="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
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
                onClick={() => handleNav(item.id)}
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
                onClick={() => handleCategoryNav(cat.id)}
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
              onClick={() => handleNav('drive-browser')}
              className={`w-full flex items-center space-x-3 px-3 py-2 rounded text-xs font-medium transition-colors text-left ${
                currentView === 'drive-browser'
                  ? 'bg-nkb-navy-800 text-nkb-gold-400 font-semibold border-l-2 border-nkb-gold-500'
                  : 'text-slate-300 hover:bg-nkb-navy-800/60 hover:text-white'
              }`}
            >
              <FolderOpen className={`w-4 h-4 ${currentView === 'drive-browser' ? 'text-nkb-gold-400' : 'text-slate-400'}`} />
              <div className="flex-1 flex items-center justify-between">
                <span>Drive Browser</span>
                <span className="text-[9px] bg-nkb-gold-500/20 text-nkb-gold-400 font-mono px-1.5 py-0.2 rounded">
                  EXPLORER
                </span>
              </div>
            </button>

            <button
              onClick={() => handleNav('storage')}
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
              onClick={() => handleNav('devices')}
              className={`w-full flex items-center space-x-3 px-3 py-2 rounded text-xs font-medium transition-colors text-left ${
                currentView === 'devices'
                  ? 'bg-nkb-navy-800 text-nkb-gold-400 font-semibold border-l-2 border-nkb-gold-500'
                  : 'text-slate-300 hover:bg-nkb-navy-800/60 hover:text-white'
              }`}
            >
              <Server className={`w-4 h-4 ${currentView === 'devices' ? 'text-nkb-gold-400' : 'text-slate-400'}`} />
              <div className="flex-1 flex items-center justify-between">
                <span>Device Management</span>
                <span className="text-[9px] bg-sky-500/20 text-sky-300 font-mono px-1.5 py-0.2 rounded">
                  AGENTS
                </span>
              </div>
            </button>

            <button
              onClick={() => handleNav('users')}
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
                onClick={() => handleNav('audit')}
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
    </aside>
    </>
  );
}
