import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  Download, 
  Terminal, 
  Copy, 
  Check, 
  Smartphone, 
  Monitor, 
  Laptop, 
  Server, 
  Clock, 
  X, 
  ExternalLink,
  QrCode,
  AlertTriangle
} from 'lucide-react';
import api from '../api/client';

export default function AgentOnboardingModal({ isOpen, onClose, deviceStatus, onEnrollmentComplete }) {
  const [platform, setPlatform] = useState('WINDOWS');
  const [enrollmentData, setEnrollmentData] = useState(null);
  const [copied, setCopied] = useState(false);
  const [loadingToken, setLoadingToken] = useState(false);
  const [localAgentDetected, setLocalAgentDetected] = useState(false);

  // Detect user OS
  useEffect(() => {
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes('mac') || ua.includes('darwin')) {
      setPlatform('MACOS');
    } else if (ua.includes('android')) {
      setPlatform('ANDROID');
    } else if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ios')) {
      setPlatform('IOS');
    } else if (ua.includes('linux')) {
      setPlatform('LINUX');
    } else {
      setPlatform('WINDOWS');
    }
  }, []);

  // Probe local loopback agent port 51248
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1500);

    fetch('http://127.0.0.1:51248/status', { signal: controller.signal })
      .then(res => res.json())
      .then(data => {
        if (isMounted && data && (data.status === 'ONLINE' || data.agentId)) {
          setLocalAgentDetected(true);
        }
      })
      .catch(() => {
        if (isMounted) setLocalAgentDetected(false);
      })
      .finally(() => clearTimeout(timeout));

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [isOpen]);

  // Fetch enrollment token for employee
  useEffect(() => {
    if (!isOpen) return;
    setLoadingToken(true);
    api.post('/devices/enrollment-token')
      .then(res => {
        setEnrollmentData(res.data);
      })
      .catch(err => {
        console.error('Failed to fetch enrollment token:', err);
      })
      .finally(() => setLoadingToken(false));
  }, [isOpen]);

  if (!isOpen) return null;

  const token = enrollmentData?.enrollmentToken || 'GENERATING_TOKEN...';
  const serverOrigin = window.location.origin;

  // Construct platform-specific install instructions
  const getInstallSnippet = () => {
    switch (platform) {
      case 'WINDOWS':
        return `# In Windows PowerShell (Run as Administrator):
$token = "${token}"
Invoke-Expression ((New-Object System.Net.WebClient).DownloadString("${serverOrigin}/api/devices/installers/windows"))`;
      case 'MACOS':
        return `# In macOS Terminal:
curl -sSL "${serverOrigin}/api/devices/installers/macos?token=${token}" | bash`;
      case 'LINUX':
        return `# In Linux Terminal (AlmaLinux / RHEL / Debian / Ubuntu):
curl -sSL "${serverOrigin}/api/devices/installers/linux" | bash -s -- --token="${token}" --server="${serverOrigin}"`;
      case 'ANDROID':
        return `nkbcloud://enroll?token=${encodeURIComponent(token)}&server=${encodeURIComponent(serverOrigin)}`;
      case 'IOS':
        return `nkbcloud://enroll?token=${encodeURIComponent(token)}&server=${encodeURIComponent(serverOrigin)}`;
      default:
        return '';
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(getInstallSnippet());
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const isAwaitingApproval = deviceStatus?.state === 'AWAITING_DEVICE_APPROVAL';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-nkb-navy-950 via-slate-900 to-nkb-navy-900 p-6 text-white flex justify-between items-start border-b border-nkb-gold-500/30">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-nkb-gold-500/20 text-nkb-gold-400 rounded-lg border border-nkb-gold-500/40">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
                NKB Storage Agent Onboarding
                {localAgentDetected && (
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 rounded-full font-mono">
                    Local Daemon Detected
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-300 mt-0.5">
                Secure device authorization & hardware-bound physical drive synchronization
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
        <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto text-slate-800 dark:text-slate-200">
          {/* Status Alert if Awaiting Approval */}
          {isAwaitingApproval ? (
            <div className="p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-700/50 rounded-lg flex items-start space-x-3 text-amber-900 dark:text-amber-200">
              <Clock className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="text-xs space-y-1">
                <p className="font-semibold">Device Enrolled — Awaiting Administrator Approval</p>
                <p className="text-slate-600 dark:text-slate-300">
                  Your device <strong>{deviceStatus?.primaryDevice?.machineName || 'Workstation'}</strong> has successfully submitted its cryptographic registration. 
                  In accordance with company security policy, an IT Administrator must approve your device before storage volumes can be accessed.
                </p>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/50 rounded-lg flex items-start space-x-3 text-blue-950 dark:text-blue-200">
              <AlertTriangle className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="text-xs space-y-1">
                <p className="font-semibold">Device Agent Not Registered</p>
                <p className="text-slate-600 dark:text-slate-300">
                  To sync files directly with company storage drives, resume large uploads, and access physical partitions, 
                  install the authorized NKB Storage Agent for your operating system.
                </p>
              </div>
            </div>
          )}

          {/* Platform Selector Tabs */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
              Select Your Device Platform:
            </label>
            <div className="grid grid-cols-5 gap-2">
              {[
                { id: 'WINDOWS', label: 'Windows', icon: Monitor },
                { id: 'MACOS', label: 'macOS', icon: Laptop },
                { id: 'LINUX', label: 'Linux', icon: Server },
                { id: 'ANDROID', label: 'Android', icon: Smartphone },
                { id: 'IOS', label: 'iOS / iPad', icon: Smartphone },
              ].map(tab => {
                const Icon = tab.icon;
                const isSelected = platform === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setPlatform(tab.id)}
                    className={`flex flex-col items-center justify-center p-2.5 rounded-lg border text-xs font-medium transition-all ${
                      isSelected
                        ? 'bg-nkb-gold-500/15 border-nkb-gold-500 text-nkb-navy-950 dark:text-nkb-gold-400 font-semibold shadow-sm'
                        : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <Icon className="w-4 h-4 mb-1" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Instructions by Platform */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {platform} Enterprise Installation Workflow
            </h4>

            {platform === 'WINDOWS' && (
              <div className="space-y-3 text-xs text-slate-600 dark:text-slate-300">
                <p>
                  <strong>Managed Deployment:</strong> If deployed via Microsoft Intune or Active Directory GPO, 
                  the agent is installed as Windows Service <code>NKBStorageAgent</code> with DPAPI encryption.
                </p>
                <p>
                  <strong>Manual Onboarding:</strong> Run the signed PowerShell onboarding command below in an elevated prompt:
                </p>
              </div>
            )}

            {platform === 'MACOS' && (
              <div className="space-y-3 text-xs text-slate-600 dark:text-slate-300">
                <p>
                  <strong>Apple MDM Deployment:</strong> Distributed as a signed PKG via Jamf, Intune, or Apple Business Manager. 
                  Credentials are automatically isolated in the Apple System Keychain with CryptoKit Ed25519 authentication.
                </p>
                <p>
                  <strong>Manual Onboarding:</strong> Run the following command in macOS Terminal:
                </p>
              </div>
            )}

            {platform === 'LINUX' && (
              <div className="space-y-3 text-xs text-slate-600 dark:text-slate-300">
                <p>
                  <strong>systemd Daemon:</strong> Automatically provisions the <code>nkb-agent</code> unprivileged system user, 
                  configures POSIX <code>0600</code> credentials, and enables <code>nkb-storage-agent.service</code>.
                </p>
                <p>
                  <strong>Terminal Execution:</strong> Run the zero-touch installation command:
                </p>
              </div>
            )}

            {(platform === 'ANDROID' || platform === 'IOS') && (
              <div className="space-y-3 text-xs text-slate-600 dark:text-slate-300">
                <p>
                  <strong>Mobile Enterprise App:</strong> Distributed privately via {platform === 'ANDROID' ? 'Managed Google Play' : 'Apple Business Manager'}. 
                  Uses {platform === 'ANDROID' ? 'Android Keystore (TEE/StrongBox)' : 'Apple Secure Enclave'} and biometric verification.
                </p>
                <div className="p-3 bg-slate-50 dark:bg-slate-800/80 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center gap-3">
                  <QrCode className="w-10 h-10 text-nkb-gold-500 flex-shrink-0" />
                  <div className="space-y-1">
                    <p className="font-semibold text-slate-800 dark:text-slate-200">Zero-Touch Mobile Deep Link</p>
                    <p className="text-[11px] text-slate-500">
                      Tap or scan the deep link on your smartphone to instantly register your device:
                    </p>
                    <a
                      href={getInstallSnippet()}
                      className="inline-flex items-center gap-1 text-[11px] font-mono text-nkb-gold-500 hover:underline break-all"
                    >
                      {getInstallSnippet()}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              </div>
            )}

            {/* Code / Command Snippet Box (for Desktop/Linux) */}
            {(platform === 'WINDOWS' || platform === 'MACOS' || platform === 'LINUX') && (
              <div className="relative">
                <pre className="p-3.5 bg-slate-950 text-slate-200 rounded-lg text-xs font-mono overflow-x-auto border border-slate-800 leading-relaxed">
                  {getInstallSnippet()}
                </pre>
                <button
                  onClick={handleCopy}
                  className="absolute top-2.5 right-2.5 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs flex items-center gap-1.5 border border-slate-700 transition-colors shadow-sm"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400 font-semibold">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Security Guarantee Note */}
          <div className="p-3 bg-slate-100 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] text-slate-500 dark:text-slate-400 space-y-1">
            <p className="font-semibold text-slate-700 dark:text-slate-300">Enterprise Security Guarantees:</p>
            <ul className="list-disc list-inside space-y-0.5">
              <li>No software is ever installed silently without OS elevation and user authorization.</li>
              <li>Mutual Ed25519 challenge-response ensures zero credential theft or replay attacks.</li>
              <li>Multiple authorized devices can be bound to your employee account.</li>
              <li>Access to physical company storage drives is blocked until an IT Administrator approves the device.</li>
            </ul>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="bg-slate-50 dark:bg-slate-800/60 p-4 border-t border-slate-200 dark:border-slate-800 flex justify-between items-center">
          <button
            onClick={() => {
              localStorage.setItem('nkb_onboarding_dismissed', 'true');
              onClose();
            }}
            className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          >
            Don't show again on this browser
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              Continue in Web-Only Mode
            </button>
            <button
              onClick={() => {
                if (onEnrollmentComplete) onEnrollmentComplete();
                onClose();
              }}
              className="px-4 py-2 text-xs font-semibold text-nkb-navy-950 bg-nkb-gold-500 hover:bg-nkb-gold-400 rounded-lg transition-colors shadow-sm"
            >
              Done / Check Status
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
