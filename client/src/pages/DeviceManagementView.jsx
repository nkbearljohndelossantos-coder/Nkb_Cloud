import React, { useState, useEffect } from 'react';
import {
  Server,
  ShieldCheck,
  ShieldAlert,
  Laptop,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RotateCw,
  RefreshCw,
  Search,
  Lock,
  Download,
  Clock,
  User,
  Building2,
  FileText,
  Monitor,
  Smartphone,
  QrCode,
  Apple
} from 'lucide-react';
import api from '../api/client';
import { formatDate } from '../utils/formatters';

export default function DeviceManagementView() {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [platformFilter, setPlatformFilter] = useState('ALL');
  const [actionLoading, setActionLoading] = useState(null);
  const [auditModalDevice, setAuditModalDevice] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [deploymentModalOpen, setDeploymentModalOpen] = useState(false);
  const [deploymentTab, setDeploymentTab] = useState('windows'); // 'windows', 'macos', 'android', 'ios'
  const [enrollmentToken, setEnrollmentToken] = useState('');
  const [mobileConfig, setMobileConfig] = useState(null);

  const fetchDevices = async () => {
    try {
      setLoading(true);
      const res = await api.get('/admin/devices');
      setDevices(res.data || []);
    } catch (err) {
      console.error('Failed to fetch devices:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDevices();
    const interval = setInterval(fetchDevices, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleApprove = async (id) => {
    if (!window.confirm('Approve this device for authorized storage streaming?')) return;
    try {
      setActionLoading(id);
      await api.post(`/admin/devices/${id}/approve`);
      await fetchDevices();
    } catch (err) {
      alert(`Approval failed: ${err.response?.data?.error || err.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleSuspend = async (id) => {
    const reason = window.prompt('Enter reason for device suspension:');
    if (reason === null) return;
    try {
      setActionLoading(id);
      await api.post(`/admin/devices/${id}/suspend`, { reason });
      await fetchDevices();
    } catch (err) {
      alert(`Suspension failed: ${err.response?.data?.error || err.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleReactivate = async (id) => {
    if (!window.confirm('Reactivate this suspended storage agent device?')) return;
    try {
      setActionLoading(id);
      await api.post(`/admin/devices/${id}/reactivate`);
      await fetchDevices();
    } catch (err) {
      alert(`Reactivation failed: ${err.response?.data?.error || err.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleRevoke = async (id) => {
    const reason = window.prompt('WARNING: Permanent device revocation. Enter reason:');
    if (!reason) return;
    try {
      setActionLoading(id);
      await api.post(`/admin/devices/${id}/revoke`, { reason });
      await fetchDevices();
    } catch (err) {
      alert(`Revocation failed: ${err.response?.data?.error || err.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleRequestUpdate = async (id) => {
    try {
      setActionLoading(id);
      await api.post(`/admin/devices/${id}/request-update`, { targetVersion: '2.1.0' });
      alert('Software update dispatched to agent.');
      await fetchDevices();
    } catch (err) {
      alert(`Update request failed: ${err.response?.data?.error || err.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleViewAudit = async (device) => {
    setAuditModalDevice(device);
    setAuditLoading(true);
    try {
      const res = await api.get(`/admin/devices/${device.id}/audit`);
      setAuditLogs(res.data || []);
    } catch (err) {
      console.error('Failed to load device audit history:', err);
    } finally {
      setAuditLoading(false);
    }
  };

  const handleGenerateScript = async (tab = 'windows') => {
    try {
      setDeploymentTab(tab);
      const [tokRes, mobRes] = await Promise.all([
        api.post('/devices/generate-enrollment-token'),
        api.get('/devices/mobile-config').catch(() => ({ data: null }))
      ]);
      setEnrollmentToken(tokRes.data.enrollmentToken);
      setMobileConfig(mobRes.data);
      setDeploymentModalOpen(true);
    } catch (err) {
      alert(`Failed to generate token: ${err.message}`);
    }
  };

  const getPlatformBadge = (platform) => {
    switch ((platform || '').toUpperCase()) {
      case 'WINDOWS':
        return { label: 'Windows', bg: 'bg-blue-50 text-blue-700 border-blue-200', Icon: Monitor };
      case 'MACOS':
        return { label: 'macOS', bg: 'bg-purple-50 text-purple-700 border-purple-200', Icon: Laptop };
      case 'LINUX':
        return { label: 'Linux', bg: 'bg-amber-50 text-amber-800 border-amber-200', Icon: Server };
      case 'ANDROID':
        return { label: 'Android', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200', Icon: Smartphone };
      case 'IOS':
        return { label: 'iOS', bg: 'bg-indigo-50 text-indigo-700 border-indigo-200', Icon: Smartphone };
      default:
        return { label: 'Endpoint', bg: 'bg-slate-50 text-slate-700 border-slate-200', Icon: Server };
    }
  };

  const filteredDevices = devices.filter((d) => {
    const matchSearch =
      (d.machineName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (d.employeeName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (d.departmentName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (d.keyFingerprint || '').toLowerCase().includes(searchQuery.toLowerCase());

    const matchStatus = statusFilter === 'ALL' || d.status === statusFilter || (statusFilter === 'PENDING' && d.persistedStatus === 'PENDING');
    const matchPlatform = platformFilter === 'ALL' || (d.platform && d.platform.toUpperCase() === platformFilter);
    return matchSearch && matchStatus && matchPlatform;
  });

  const onlineCount = devices.filter((d) => d.status === 'ONLINE').length;
  const pendingCount = devices.filter((d) => d.persistedStatus === 'PENDING').length;
  const suspendedCount = devices.filter((d) => d.persistedStatus === 'SUSPENDED').length;
  const revokedCount = devices.filter((d) => d.persistedStatus === 'REVOKED').length;

  const windowsCount = devices.filter((d) => !d.platform || d.platform === 'WINDOWS').length;
  const macCount = devices.filter((d) => d.platform === 'MACOS').length;
  const linuxCount = devices.filter((d) => d.platform === 'LINUX').length;
  const mobileCount = devices.filter((d) => d.platform === 'ANDROID' || d.platform === 'IOS').length;

  return (
    <div className="flex-1 flex flex-col bg-slate-50 overflow-y-auto">
      {/* Top Banner */}
      <div className="bg-white border-b border-slate-200 px-8 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-800 flex items-center space-x-2">
              <Server className="w-6 h-6 text-nkb-navy-900" />
              <span>Storage Agent & Device Enrollment</span>
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Enterprise endpoint lifecycle: Zero-trust Ed25519 authentication, Intune deployment, and device governance
            </p>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={() => handleGenerateScript('windows')}
              className="flex items-center space-x-2 px-3 py-2 bg-nkb-navy-900 text-white rounded text-xs font-semibold hover:bg-nkb-navy-800 shadow-sm transition"
            >
              <Download className="w-4 h-4 text-nkb-gold-400" />
              <span>Deploy Workstation Agent</span>
            </button>
            <button
              onClick={() => handleGenerateScript('android')}
              className="flex items-center space-x-2 px-3 py-2 bg-emerald-700 text-white rounded text-xs font-semibold hover:bg-emerald-800 shadow-sm transition"
            >
              <QrCode className="w-4 h-4 text-emerald-200" />
              <span>Enroll Mobile Device</span>
            </button>
            <button
              onClick={fetchDevices}
              className="flex items-center space-x-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-medium transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Metric Cards */}
        <div className="grid grid-cols-4 gap-4 mt-6">
          <div className="bg-slate-50 border border-slate-200 rounded p-4 flex items-center justify-between">
            <div>
              <div className="text-[11px] font-semibold text-slate-500 uppercase">Cross-Platform Fleet</div>
              <div className="text-2xl font-bold text-slate-800 mt-0.5">{devices.length}</div>
              <div className="text-[10px] text-slate-400 mt-1">
                {windowsCount} Win • {macCount} Mac • {mobileCount} Mobile
              </div>
            </div>
            <Laptop className="w-8 h-8 text-slate-400" />
          </div>

          <div className="bg-emerald-50/60 border border-emerald-200 rounded p-4 flex items-center justify-between">
            <div>
              <div className="text-[11px] font-semibold text-emerald-700 uppercase">Online & Streaming</div>
              <div className="text-2xl font-bold text-emerald-800 mt-0.5">{onlineCount}</div>
            </div>
            <CheckCircle2 className="w-8 h-8 text-emerald-500" />
          </div>

          <div className="bg-amber-50/60 border border-amber-200 rounded p-4 flex items-center justify-between">
            <div>
              <div className="text-[11px] font-semibold text-amber-700 uppercase">Pending Approval</div>
              <div className="text-2xl font-bold text-amber-800 mt-0.5">{pendingCount}</div>
            </div>
            <AlertTriangle className="w-8 h-8 text-amber-500" />
          </div>

          <div className="bg-red-50/60 border border-red-200 rounded p-4 flex items-center justify-between">
            <div>
              <div className="text-[11px] font-semibold text-red-700 uppercase">Suspended / Revoked</div>
              <div className="text-2xl font-bold text-red-800 mt-0.5">{suspendedCount + revokedCount}</div>
            </div>
            <XCircle className="w-8 h-8 text-red-500" />
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="p-8 space-y-6">
        {/* Controls: Search and Filter */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-4 rounded border border-slate-200 shadow-sm">
          <div className="flex items-center space-x-3 w-full lg:w-80">
            <Search className="w-4 h-4 text-slate-400 ml-2" />
            <input
              type="text"
              placeholder="Search hostname, employee, department..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-xs bg-transparent focus:outline-none text-slate-800 placeholder-slate-400"
            />
          </div>

          {/* Platform Filters */}
          <div className="flex items-center space-x-1.5 flex-wrap">
            <span className="text-xs text-slate-500 font-medium mr-1">Platform:</span>
            {['ALL', 'WINDOWS', 'MACOS', 'LINUX', 'ANDROID', 'IOS'].map((pf) => (
              <button
                key={pf}
                onClick={() => setPlatformFilter(pf)}
                className={`px-2.5 py-1 text-xs rounded font-medium transition ${
                  platformFilter === pf
                    ? 'bg-nkb-navy-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {pf}
              </button>
            ))}
          </div>

          {/* Status Filters */}
          <div className="flex items-center space-x-1.5 flex-wrap">
            <span className="text-xs text-slate-500 font-medium mr-1">Status:</span>
            {['ALL', 'ONLINE', 'OFFLINE', 'PENDING', 'SUSPENDED', 'REVOKED'].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-2.5 py-1 text-xs rounded font-medium transition ${
                  statusFilter === st
                    ? 'bg-nkb-navy-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>

        {/* Devices Table */}
        <div className="bg-white rounded border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-800">Authorized Company Computers</h2>
            <span className="text-xs text-slate-500">{filteredDevices.length} endpoint(s) listed</span>
          </div>

          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                <th className="py-3 px-6">Workstation / Hostname</th>
                <th className="py-3 px-4">Employee Owner</th>
                <th className="py-3 px-4">Department</th>
                <th className="py-3 px-4">OS & Version</th>
                <th className="py-3 px-4">Public Key Fingerprint</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Last Heartbeat</th>
                <th className="py-3 px-6 text-right">Administrative Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {loading && devices.length === 0 ? (
                <tr>
                  <td colSpan="8" className="py-8 text-center text-slate-400">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-nkb-navy-900" />
                    <span>Loading endpoint inventory...</span>
                  </td>
                </tr>
              ) : filteredDevices.length === 0 ? (
                <tr>
                  <td colSpan="8" className="py-8 text-center text-slate-400">
                    No matching endpoint devices found.
                  </td>
                </tr>
              ) : (
                filteredDevices.map((dev) => {
                  const isOnline = dev.status === 'ONLINE';
                  const isPending = dev.persistedStatus === 'PENDING';
                  const isSuspended = dev.persistedStatus === 'SUSPENDED';
                  const isRevoked = dev.persistedStatus === 'REVOKED';

                  return (
                    <tr key={dev.id} className="hover:bg-slate-50/60 transition">
                      {/* Hostname & Platform */}
                      <td className="py-3.5 px-6 font-semibold text-slate-800">
                        <div className="flex items-center space-x-2.5">
                          {(() => {
                            const badge = getPlatformBadge(dev.platform);
                            const IconComponent = badge.Icon;
                            return <IconComponent className="w-4 h-4 text-slate-500 flex-shrink-0" />;
                          })()}
                          <div>
                            <div className="flex items-center space-x-1.5">
                              <span>{dev.machineName}</span>
                              <span className={`text-[9px] px-1.5 py-0.2 rounded border font-medium ${getPlatformBadge(dev.platform).bg}`}>
                                {getPlatformBadge(dev.platform).label}
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono font-normal">ID: {dev.id.substring(0, 8)}...</div>
                          </div>
                        </div>
                      </td>

                      {/* Employee Owner */}
                      <td className="py-3.5 px-4 text-slate-700">
                        <div className="flex items-center space-x-1.5">
                          <User className="w-3.5 h-3.5 text-slate-400" />
                          <span className="font-medium">{dev.employeeName}</span>
                        </div>
                        {dev.employeeEmail && (
                          <div className="text-[11px] text-slate-400 ml-5">{dev.employeeEmail}</div>
                        )}
                      </td>

                      {/* Department */}
                      <td className="py-3.5 px-4 text-slate-600">
                        <div className="flex items-center space-x-1.5">
                          <Building2 className="w-3.5 h-3.5 text-slate-400" />
                          <span>{dev.departmentName}</span>
                        </div>
                      </td>

                      {/* OS & Version */}
                      <td className="py-3.5 px-4 text-slate-600">
                        <div>{dev.osVersion}</div>
                        <div className="text-[10px] text-slate-400">v{dev.version || '2.1.0'}</div>
                      </td>

                      {/* Key Fingerprint */}
                      <td className="py-3.5 px-4 font-mono text-[11px] text-slate-600">
                        <span className="bg-slate-100 px-2 py-0.5 rounded border border-slate-200" title={dev.keyFingerprint}>
                          {dev.keyFingerprint ? `${dev.keyFingerprint.substring(0, 16)}...` : 'None'}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">
                        {isOnline ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-100 text-emerald-800">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5 animate-pulse" />
                            Online
                          </span>
                        ) : isPending ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-100 text-amber-800">
                            Awaiting Approval
                          </span>
                        ) : isSuspended ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-100 text-amber-800">
                            Suspended
                          </span>
                        ) : isRevoked ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-red-100 text-red-800">
                            Revoked
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-600">
                            Offline
                          </span>
                        )}
                      </td>

                      {/* Last Heartbeat */}
                      <td className="py-3.5 px-4 text-slate-500 text-[11px]">
                        {dev.lastHeartbeat ? formatDate(dev.lastHeartbeat) : 'Never'}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-6 text-right space-x-2">
                        {isPending && (
                          <button
                            onClick={() => handleApprove(dev.id)}
                            disabled={actionLoading === dev.id}
                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded text-[11px] transition shadow-xs"
                          >
                            Approve
                          </button>
                        )}

                        {!isPending && !isRevoked && (
                          <>
                            {isSuspended ? (
                              <button
                                onClick={() => handleReactivate(dev.id)}
                                disabled={actionLoading === dev.id}
                                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded text-[11px] transition"
                              >
                                Reactivate
                              </button>
                            ) : (
                              <button
                                onClick={() => handleSuspend(dev.id)}
                                disabled={actionLoading === dev.id}
                                className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 font-medium rounded text-[11px] transition"
                              >
                                Suspend
                              </button>
                            )}

                            <button
                              onClick={() => handleRequestUpdate(dev.id)}
                              disabled={actionLoading === dev.id}
                              title="Dispatch software update to agent"
                              className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px] transition"
                            >
                              Update
                            </button>

                            <button
                              onClick={() => handleRevoke(dev.id)}
                              disabled={actionLoading === dev.id}
                              className="px-2 py-1 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded text-[11px] transition"
                            >
                              Revoke
                            </button>
                          </>
                        )}

                        <button
                          onClick={() => handleViewAudit(dev)}
                          className="px-2 py-1 text-slate-500 hover:text-slate-800 text-[11px] underline"
                        >
                          Audit
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Deployment Modal */}
      {deploymentModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-xl w-full p-6 border border-slate-200">
            <h3 className="text-base font-bold text-slate-800 flex items-center space-x-2">
              <Download className="w-5 h-5 text-nkb-navy-900" />
              <span>Cross-Platform Agent Deployment & Enrollment</span>
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Enroll corporate computers and mobile devices with zero-trust cryptographic isolation.
            </p>

            {/* Platform Selector Tabs */}
            <div className="flex border-b border-slate-200 mt-4 text-xs font-semibold">
              <button
                onClick={() => setDeploymentTab('windows')}
                className={`pb-2 px-3 flex items-center space-x-1.5 border-b-2 transition ${
                  deploymentTab === 'windows'
                    ? 'border-nkb-navy-900 text-nkb-navy-900'
                    : 'border-transparent text-slate-400 hover:text-slate-700'
                }`}
              >
                <Monitor className="w-4 h-4" />
                <span>Windows 10/11</span>
              </button>

              <button
                onClick={() => setDeploymentTab('macos')}
                className={`pb-2 px-3 flex items-center space-x-1.5 border-b-2 transition ${
                  deploymentTab === 'macos'
                    ? 'border-nkb-navy-900 text-nkb-navy-900'
                    : 'border-transparent text-slate-400 hover:text-slate-700'
                }`}
              >
                <Laptop className="w-4 h-4" />
                <span>macOS (Swift)</span>
              </button>

              <button
                onClick={() => setDeploymentTab('linux')}
                className={`pb-2 px-3 flex items-center space-x-1.5 border-b-2 transition ${
                  deploymentTab === 'linux'
                    ? 'border-nkb-navy-900 text-nkb-navy-900'
                    : 'border-transparent text-slate-400 hover:text-slate-700'
                }`}
              >
                <Server className="w-4 h-4" />
                <span>Linux (systemd)</span>
              </button>

              <button
                onClick={() => setDeploymentTab('android')}
                className={`pb-2 px-3 flex items-center space-x-1.5 border-b-2 transition ${
                  deploymentTab === 'android'
                    ? 'border-nkb-navy-900 text-nkb-navy-900'
                    : 'border-transparent text-slate-400 hover:text-slate-700'
                }`}
              >
                <Smartphone className="w-4 h-4" />
                <span>Android (Kotlin)</span>
              </button>

              <button
                onClick={() => setDeploymentTab('ios')}
                className={`pb-2 px-3 flex items-center space-x-1.5 border-b-2 transition ${
                  deploymentTab === 'ios'
                    ? 'border-nkb-navy-900 text-nkb-navy-900'
                    : 'border-transparent text-slate-400 hover:text-slate-700'
                }`}
              >
                <Smartphone className="w-4 h-4" />
                <span>iPhone / iOS</span>
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-700 uppercase">One-Time Enrollment Token</label>
                <div className="mt-1 p-2 bg-slate-50 border border-slate-200 rounded font-mono text-[11px] text-slate-800 break-all select-all">
                  {enrollmentToken}
                </div>
              </div>

              {/* Windows Tab */}
              {deploymentTab === 'windows' && (
                <div>
                  <label className="text-[11px] font-semibold text-slate-700 uppercase">PowerShell Quick-Deployment Command</label>
                  <div className="mt-1 p-3 bg-slate-900 rounded font-mono text-[11px] text-emerald-400 select-all overflow-x-auto">
                    irm {window.location.origin}/api/devices/installer-script | iex
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500">
                    Runs Windows Service daemon with NSSM and generates isolated Ed25519 keypair.
                  </div>
                </div>
              )}

              {/* macOS Tab */}
              {deploymentTab === 'macos' && (
                <div>
                  <label className="text-[11px] font-semibold text-slate-700 uppercase">Terminal Quick-Deployment Command</label>
                  <div className="mt-1 p-3 bg-slate-900 rounded font-mono text-[11px] text-emerald-400 select-all overflow-x-auto">
                    curl -s "{window.location.origin}/api/devices/installer-script?platform=macos" | bash
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500">
                    Configures native Swift agent with Apple Keychain protection and launchd daemon.
                  </div>
                </div>
              )}

              {/* Linux Tab */}
              {deploymentTab === 'linux' && (
                <div>
                  <label className="text-[11px] font-semibold text-slate-700 uppercase">Linux Quick-Deployment Command (systemd)</label>
                  <div className="mt-1 p-3 bg-slate-900 rounded font-mono text-[11px] text-emerald-400 select-all overflow-x-auto">
                    curl -s "{window.location.origin}/api/devices/installer-script?platform=linux" | sudo bash
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500">
                    Installs systemd background daemon, generates isolated Ed25519 keypair in /etc/nkb-cloud/keys, and registers storage volumes.
                  </div>
                </div>
              )}

              {/* Android & iOS Mobile Tabs */}
              {(deploymentTab === 'android' || deploymentTab === 'ios') && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded space-y-2">
                  <div className="flex items-center space-x-2 text-xs font-semibold text-slate-800">
                    <QrCode className="w-4 h-4 text-emerald-600" />
                    <span>Mobile App Enrollment (Deep Link / QR)</span>
                  </div>
                  <div className="text-xs text-slate-600">
                    Open the NKB Cloud {deploymentTab === 'android' ? 'Android' : 'iOS'} App on your device and tap <strong>Enroll Device</strong> or use this deep link:
                  </div>
                  <div className="p-2 bg-white border border-slate-200 rounded font-mono text-[11px] text-slate-800 break-all select-all">
                    nkbcloud://enroll?token={encodeURIComponent(enrollmentToken)}&server={encodeURIComponent(window.location.origin)}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Protected by {deploymentTab === 'android' ? 'Android Keystore' : 'Apple Secure Enclave'} with Biometric Face/Fingerprint unlock.
                  </div>
                </div>
              )}

              <div className="p-3 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800 space-y-1">
                <div className="font-semibold flex items-center space-x-1.5">
                  <ShieldCheck className="w-4 h-4 text-amber-600" />
                  <span>Zero-Trust Security Guarantee</span>
                </div>
                <div>Private cryptographic signing keys are generated locally on each endpoint device and are NEVER transmitted over the network or saved to cloud servers.</div>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setDeploymentModalOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Audit History Modal */}
      {auditModalDevice && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full p-6 border border-slate-200 max-h-[80vh] flex flex-col">
            <h3 className="text-base font-bold text-slate-800 flex items-center space-x-2">
              <FileText className="w-5 h-5 text-nkb-navy-900" />
              <span>Device Cryptographic Audit Ledger: {auditModalDevice.machineName}</span>
            </h3>

            <div className="flex-1 overflow-y-auto mt-4 space-y-2">
              {auditLoading ? (
                <div className="py-6 text-center text-xs text-slate-400">Loading audit trail...</div>
              ) : auditLogs.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-400">No audit events recorded for this device.</div>
              ) : (
                auditLogs.map((log) => (
                  <div key={log.id} className="p-3 bg-slate-50 border border-slate-200 rounded text-xs space-y-1">
                    <div className="flex items-center justify-between font-semibold text-slate-800">
                      <span>{log.action}</span>
                      <span className="text-[11px] text-slate-400 font-normal">{formatDate(log.created_at)}</span>
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Actor: {log.full_name || log.username || 'System'}
                    </div>
                    {log.details && (
                      <pre className="mt-1 p-2 bg-slate-100 rounded text-[10px] font-mono text-slate-700 overflow-x-auto">
                        {typeof log.details === 'object' ? JSON.stringify(log.details, null, 2) : log.details}
                      </pre>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setAuditModalDevice(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
