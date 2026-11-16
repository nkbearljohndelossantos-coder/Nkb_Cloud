import React, { useState } from 'react';
import {
  Search,
  Bell,
  LogOut,
  User,
  Shield,
  Activity,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  HelpCircle,
  Menu,
  Download,
  HardDrive
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Topbar({ searchQuery, setSearchQuery, onRefresh, agentConnected, storageOverview, onToggleMobileMenu, onOpenDownloadModal }) {
  const { user, logout } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-4 md:px-6 flex items-center justify-between z-10 select-none">
      {/* Mobile Menu Toggle Button */}
      <button
        onClick={onToggleMobileMenu}
        className="md:hidden mr-3 p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md focus:outline-none"
        title="Open navigation menu"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Global Search Input */}
      <div className="flex-1 max-w-xl">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search all files, folders, documents in NKB Cloud..."
            className="w-full bg-slate-100/80 border border-slate-200 rounded-md pl-10 pr-4 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-nkb-gold-500 focus:bg-white text-slate-800 placeholder-slate-400 transition"
          />
        </div>
      </div>

      {/* Right Controls: Agent Status, Refresh, User Profile */}
      <div className="flex items-center space-x-2 md:space-x-4 ml-4 md:ml-6">
        {/* Storage Agent Connection Indicator */}
        <div
          title={
            agentConnected
              ? 'NKB Storage Host Agent is connected and streaming I/O'
              : 'NKB Storage Host is currently offline. Drives are temporarily unavailable.'
          }
          className={`hidden sm:flex items-center space-x-2 px-3 py-1.5 rounded border text-xs font-medium cursor-default transition ${
            agentConnected
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-amber-50 border-amber-200 text-amber-800'
          }`}
        >
          {agentConnected ? (
            <>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Storage Agent Online</span>
            </>
          ) : (
            <>
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
              <span>Storage Agent Offline</span>
            </>
          )}
        </div>

        {/* Download Desktop App Button */}
        <button
          onClick={onOpenDownloadModal}
          title="Download NKB Drive App (Windows & Mac)"
          className="hidden sm:flex items-center space-x-1.5 px-3 py-1.5 bg-nkb-gold-50 hover:bg-nkb-gold-100/80 text-nkb-navy-950 border border-nkb-gold-300 rounded text-xs font-semibold shadow-xs transition"
        >
          <Download className="w-3.5 h-3.5 text-nkb-gold-600" />
          <span>Download App</span>
        </button>

        {/* Refresh Button */}
        <button
          onClick={onRefresh}
          title="Refresh view"
          className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded border border-transparent hover:border-slate-200 transition"
        >
          <RefreshCw className="w-4 h-4" />
        </button>

        {/* User Profile Dropdown */}
        <div className="relative">
          <button
            onClick={() => setProfileOpen(!profileOpen)}
            className="flex items-center space-x-2 p-1.5 rounded hover:bg-slate-100 transition"
          >
            <div className="w-8 h-8 rounded bg-nkb-navy-900 text-nkb-gold-400 font-semibold flex items-center justify-center text-xs border border-nkb-navy-800">
              {user?.fullName?.charAt(0) || 'U'}
            </div>
            <div className="text-left hidden md:block">
              <div className="text-xs font-semibold text-slate-800 leading-none">
                {user?.fullName}
              </div>
              <div className="text-[10px] text-slate-500 font-medium mt-0.5">
                {user?.role}
              </div>
            </div>
          </button>

          {profileOpen && (
            <div className="absolute right-0 mt-2 w-64 bg-white border border-slate-200 rounded-md shadow-lg py-2 z-50">
              <div className="px-4 py-3 border-b border-slate-100">
                <div className="font-semibold text-xs text-slate-800">{user?.fullName}</div>
                <div className="text-[11px] text-slate-500 truncate">{user?.email}</div>
                <div className="mt-2 flex items-center space-x-1.5">
                  <span className="text-[10px] font-semibold bg-nkb-gold-100 text-nkb-gold-600 px-2 py-0.5 rounded">
                    {user?.role}
                  </span>
                  {user?.department && (
                    <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                      {user.department}
                    </span>
                  )}
                </div>
              </div>

              <div className="py-1">
                <button
                  onClick={() => {
                    setProfileOpen(false);
                    logout();
                  }}
                  className="w-full flex items-center space-x-2 px-4 py-2 text-xs text-red-600 hover:bg-red-50 transition text-left"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sign out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
