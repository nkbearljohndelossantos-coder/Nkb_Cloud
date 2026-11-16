import React from 'react';
import { 
  X, 
  Download, 
  Monitor, 
  Laptop, 
  HardDrive, 
  CheckCircle2, 
  ShieldCheck, 
  ExternalLink,
  FolderTree,
  Lock
} from 'lucide-react';

export default function DownloadAppModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm animate-fade-in select-none">
      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-nkb-navy-950 via-slate-900 to-nkb-navy-900 p-6 text-white flex justify-between items-start border-b border-nkb-gold-500/30">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-nkb-gold-500/20 text-nkb-gold-400 rounded-lg border border-nkb-gold-500/40">
              <HardDrive className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
                Download NKB Drive
                <span className="text-[10px] bg-nkb-gold-500/20 text-nkb-gold-400 border border-nkb-gold-500/40 px-2 py-0.5 rounded-full font-mono">
                  v2.1.0 Enterprise
                </span>
              </h3>
              <p className="text-xs text-slate-300 mt-0.5">
                Mount NKB Cloud directly to your computer as a virtual drive letter (N:)
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto text-slate-800 dark:text-slate-200">
          
          {/* Permission & Security Badge */}
          <div className="p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 rounded-lg flex items-start space-x-3 text-amber-950 dark:text-amber-200">
            <ShieldCheck className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="text-xs space-y-1">
              <p className="font-semibold">Role-Based Folder Access & Scoping</p>
              <p className="text-slate-600 dark:text-slate-300">
                When you log in to NKB Drive, your virtual drive (N:) strictly mirrors your assigned department folders and files from My Drive. Only folders authorized for your account are displayed.
              </p>
            </div>
          </div>

          {/* Download Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            
            {/* Windows Card */}
            <div className="p-5 border-2 border-slate-200 dark:border-slate-800 hover:border-nkb-gold-500 rounded-xl bg-slate-50/50 dark:bg-slate-800/40 flex flex-col justify-between transition-all group">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="p-2.5 bg-sky-500/10 text-sky-600 dark:text-sky-400 rounded-lg">
                    <Monitor className="w-6 h-6" />
                  </div>
                  <span className="text-[10px] bg-sky-100 dark:bg-sky-900/60 text-sky-700 dark:text-sky-300 px-2 py-0.5 rounded font-mono font-semibold">
                    WINDOWS x64
                  </span>
                </div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-nkb-gold-600 dark:group-hover:text-nkb-gold-400 transition-colors">
                  NKB Drive for Windows
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Windows 10 / 11 (64-bit). Mounts as <code className="font-mono text-nkb-gold-600 dark:text-nkb-gold-400 font-bold">N:</code> in File Explorer. Includes WinFsp virtual FS driver.
                </p>
                <div className="mt-3 text-[11px] text-slate-400 dark:text-slate-500 space-y-1">
                  <div>&bull; Installer: <span className="font-mono font-medium">NKBDriveSetup.exe</span></div>
                  <div>&bull; File size: <span className="font-mono font-medium">~1.18 MB</span></div>
                </div>
              </div>

              <div className="mt-5">
                <a
                  href="/downloads/NKBDriveSetup.exe"
                  download="NKBDriveSetup.exe"
                  className="w-full inline-flex items-center justify-center space-x-2 py-2.5 px-4 bg-nkb-navy-900 hover:bg-nkb-navy-800 dark:bg-nkb-gold-500 dark:hover:bg-nkb-gold-600 text-white dark:text-nkb-navy-950 font-bold rounded-lg text-xs shadow-md transition-all active:scale-[0.98]"
                >
                  <Download className="w-4 h-4" />
                  <span>Download for Windows</span>
                </a>
              </div>
            </div>

            {/* macOS Card */}
            <div className="p-5 border-2 border-slate-200 dark:border-slate-800 hover:border-nkb-gold-500 rounded-xl bg-slate-50/50 dark:bg-slate-800/40 flex flex-col justify-between transition-all group">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="p-2.5 bg-purple-500/10 text-purple-600 dark:text-purple-400 rounded-lg">
                    <Laptop className="w-6 h-6" />
                  </div>
                  <span className="text-[10px] bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300 px-2 py-0.5 rounded font-mono font-semibold">
                    APPLE SILICON & INTEL
                  </span>
                </div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-nkb-gold-600 dark:group-hover:text-nkb-gold-400 transition-colors">
                  NKB Drive for macOS
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  macOS 13+ (Ventura, Sonoma, Sequoia). Integrates directly with Apple Finder sidebar and Keychain.
                </p>
                <div className="mt-3 text-[11px] text-slate-400 dark:text-slate-500 space-y-1">
                  <div>&bull; Package: <span className="font-mono font-medium">NKBDrive-macOS.zip</span></div>
                  <div>&bull; Native Swift 5.9+ FileProvider</div>
                </div>
              </div>

              <div className="mt-5">
                <a
                  href="/downloads/NKBDrive-macOS.zip"
                  download="NKBDrive-macOS.zip"
                  className="w-full inline-flex items-center justify-center space-x-2 py-2.5 px-4 bg-slate-800 hover:bg-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 text-white font-bold rounded-lg text-xs shadow-md transition-all active:scale-[0.98]"
                >
                  <Download className="w-4 h-4" />
                  <span>Download for macOS</span>
                </a>
              </div>
            </div>

          </div>

          {/* Quick Setup Instructions */}
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800">
            <h5 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-3">
              Quick Setup Guide
            </h5>
            <ol className="text-xs text-slate-600 dark:text-slate-400 space-y-2 list-decimal list-inside">
              <li>
                <strong className="text-slate-800 dark:text-slate-200">Run the installer:</strong> Download and launch the setup application on your workstation.
              </li>
              <li>
                <strong className="text-slate-800 dark:text-slate-200">Sign in:</strong> Enter your NKB Cloud email and password (the same account you use here).
              </li>
              <li>
                <strong className="text-slate-800 dark:text-slate-200">Access Virtual Drive N:</strong> Once authenticated, your drive opens immediately in File Explorer / Finder with your allowed department folders.
              </li>
            </ol>
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 rounded-lg text-xs font-semibold transition"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
}
