import React, { useState, useEffect } from 'react';
import { X, Copy, Check, Link, Users, User, Lock, Shield, Calendar, Trash2, Building2, AlertCircle, Search } from 'lucide-react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function ShareModal({ file, folder, onClose, onShareUpdated }) {
  const item = file || folder;
  const isFile = !!file;
  const { user } = useAuth();
  const isOutsideCompany = Boolean(user?.isOutsideCompany);

  const [activeTab, setActiveTab] = useState('internal'); // 'internal' | 'link'
  const [shareTargetType, setShareTargetType] = useState('department'); // 'department' | 'user'
  
  // Department & Users data
  const [departments, setDepartments] = useState([]);
  const [selectedDeptId, setSelectedDeptId] = useState('');
  
  const [usersList, setUsersList] = useState([]);
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [userSearch, setUserSearch] = useState('');

  // Permission selection: 'CONTRIBUTOR' (Read/Write) or 'VIEWER' (Read Only)
  const [permissionType, setPermissionType] = useState('CONTRIBUTOR'); // 'CONTRIBUTOR' | 'VIEWER'
  const [sharingNote, setSharingNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeShares, setActiveShares] = useState([]);
  const [loadingShares, setLoadingShares] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  // Public link sharing state
  const [linkPermission, setLinkPermission] = useState('VIEWER');
  const [allowDownload, setAllowDownload] = useState(true);
  const [password, setPassword] = useState('');
  const [expiresInDays, setExpiresInDays] = useState('7');
  const [shareResult, setShareResult] = useState(null);
  const [copied, setCopied] = useState(false);
  const [linkLoading, setLinkLoading] = useState(false);

  // Load departments, shareable users, and existing shares on mount
  useEffect(() => {
    fetchDepartments();
    fetchShareableUsers();
    fetchActiveShares();
  }, [item?.id]);

  const fetchDepartments = async () => {
    try {
      const res = await api.get('/departments');
      const depts = res.data.departments || [];
      setDepartments(depts);
      if (depts.length > 0 && !selectedDeptId) {
        setSelectedDeptId(String(depts[0].id));
      }
    } catch (err) {
      console.error('Failed to load departments:', err);
    }
  };

  const fetchShareableUsers = async () => {
    try {
      const res = await api.get('/users/shareable');
      setUsersList(res.data.users || []);
    } catch (err) {
      console.error('Failed to load shareable users:', err);
    }
  };

  const fetchActiveShares = async () => {
    if (!item?.id) return;
    setLoadingShares(true);
    try {
      const params = isFile ? { fileId: item.id } : { folderId: item.id };
      const res = await api.get('/shares/item', { params });
      setActiveShares(res.data.shares || []);
    } catch (err) {
      console.error('Failed to load active shares:', err);
    } finally {
      setLoadingShares(false);
    }
  };

  const handleToggleUserSelect = (uid) => {
    setSelectedUserIds(prev => 
      prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]
    );
  };

  const handleShareInternal = async (e) => {
    e.preventDefault();
    setLoading(true);
    setSuccessMsg('');

    try {
      if (shareTargetType === 'department') {
        if (!selectedDeptId) return;
        await api.post('/shares', {
          fileId: isFile ? item.id : null,
          folderId: !isFile ? item.id : null,
          sharedWithDepartmentId: parseInt(selectedDeptId, 10),
          permissionLevel: permissionType,
          allowDownload: true,
          sharingNote: sharingNote.trim() || null
        });
        setSuccessMsg('Folder successfully shared with the entire department!');
      } else {
        if (selectedUserIds.length === 0) {
          alert('Please select at least one employee account to share with.');
          setLoading(false);
          return;
        }
        await api.post('/shares', {
          fileId: isFile ? item.id : null,
          folderId: !isFile ? item.id : null,
          sharedWithUserIds: selectedUserIds,
          permissionLevel: permissionType,
          allowDownload: true,
          sharingNote: sharingNote.trim() || null
        });
        setSuccessMsg(`Folder successfully shared with ${selectedUserIds.length} selected account(s)!`);
        setSelectedUserIds([]);
      }

      setSharingNote('');
      await fetchActiveShares();
      if (onShareUpdated) onShareUpdated();
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      alert(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRevokeShare = async (shareId) => {
    if (!confirm('Are you sure you want to revoke this share access?')) return;
    try {
      await api.delete(`/shares/${shareId}`);
      await fetchActiveShares();
      if (onShareUpdated) onShareUpdated();
    } catch (err) {
      alert(err.response?.data?.error || err.message);
    }
  };

  const handleGenerateLink = async (e) => {
    e.preventDefault();
    if (isOutsideCompany) {
      alert('Public share link generation is restricted outside the company network.');
      return;
    }
    setLinkLoading(true);

    try {
      const res = await api.post('/shares', {
        fileId: isFile ? item.id : null,
        folderId: !isFile ? item.id : null,
        isPublicLink: true,
        permissionLevel: linkPermission,
        allowDownload,
        password: password.trim() ? password.trim() : null,
        expiresInDays: parseInt(expiresInDays) || null
      });

      setShareResult(res.data.share);
      await fetchActiveShares();
    } catch (err) {
      alert(err.response?.data?.error || err.message);
    } finally {
      setLinkLoading(false);
    }
  };

  const handleCopy = () => {
    if (isOutsideCompany) {
      alert('RESTRICTED: Copying to clipboard is disabled outside company network (Anti-Exfiltration Policy).');
      return;
    }
    if (!shareResult?.shareToken) return;
    const fullUrl = `${window.location.origin}/share/${shareResult.shareToken}`;
    navigator.clipboard.writeText(fullUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const filteredUsers = usersList.filter(u => {
    if (!userSearch) return true;
    const term = userSearch.toLowerCase();
    return (
      (u.full_name && u.full_name.toLowerCase().includes(term)) ||
      (u.email && u.email.toLowerCase().includes(term)) ||
      (u.department_name && u.department_name.toLowerCase().includes(term))
    );
  });

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-none flex items-center justify-center p-4 z-50 select-none">
      <div className="bg-white rounded-lg border border-slate-200 max-w-lg w-full p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex justify-between items-center border-b border-slate-100 pb-3">
          <div>
            <h3 className="font-bold text-sm text-nkb-navy-900 flex items-center space-x-2">
              <Building2 className="w-4 h-4 text-nkb-gold-500" />
              <span>Share "{item?.name}"</span>
            </h3>
            <p className="text-[11px] text-slate-500">
              {isFile ? 'Share file with company departments or specific accounts' : 'Assign folder access to departments or individual employee accounts'}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-200 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('internal')}
            className={`flex items-center space-x-1.5 py-2 px-4 font-semibold border-b-2 transition ${
              activeTab === 'internal'
                ? 'border-nkb-gold-500 text-nkb-navy-900'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Company Sharing (Department / Accounts)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('link')}
            className={`flex items-center space-x-1.5 py-2 px-4 font-semibold border-b-2 transition ${
              activeTab === 'link'
                ? 'border-nkb-gold-500 text-nkb-navy-900'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Link className="w-3.5 h-3.5" />
            <span>Public Link</span>
          </button>
        </div>

        {/* TAB 1: INTERNAL DEPARTMENT & ACCOUNT SHARING */}
        {activeTab === 'internal' && (
          <div className="space-y-4 text-xs">
            {successMsg && (
              <div className="p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded flex items-center space-x-2 text-[11px] font-medium">
                <Check className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                <span>{successMsg}</span>
              </div>
            )}

            <form onSubmit={handleShareInternal} className="space-y-3 bg-slate-50 p-3.5 rounded border border-slate-200">
              {/* Target Mode Selector */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">Share Target</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setShareTargetType('department')}
                    className={`py-2 px-3 rounded border text-left font-semibold flex items-center space-x-2 transition ${
                      shareTargetType === 'department'
                        ? 'bg-nkb-gold-50/60 border-nkb-gold-500 text-nkb-navy-950 ring-1 ring-nkb-gold-400'
                        : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <Building2 className="w-4 h-4 text-nkb-gold-600" />
                    <div>
                      <div className="text-xs">Entire Department</div>
                      <div className="text-[10px] text-slate-400 font-normal">All department accounts</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShareTargetType('user')}
                    className={`py-2 px-3 rounded border text-left font-semibold flex items-center space-x-2 transition ${
                      shareTargetType === 'user'
                        ? 'bg-nkb-gold-50/60 border-nkb-gold-500 text-nkb-navy-950 ring-1 ring-nkb-gold-400'
                        : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <User className="w-4 h-4 text-nkb-gold-600" />
                    <div>
                      <div className="text-xs">Specific Accounts</div>
                      <div className="text-[10px] text-slate-400 font-normal">Choose individual users</div>
                    </div>
                  </button>
                </div>
              </div>

              {/* Department Dropdown */}
              {shareTargetType === 'department' ? (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Select Department</label>
                  <select
                    value={selectedDeptId}
                    onChange={(e) => setSelectedDeptId(e.target.value)}
                    className="w-full border border-slate-300 rounded px-3 py-2 text-xs bg-white focus:ring-1 focus:ring-nkb-gold-500 focus:outline-none"
                  >
                    {departments.map((dept) => (
                      <option key={dept.id} value={dept.id}>
                        {dept.name} ({dept.code})
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-slate-400 mt-1">
                    Every employee account in this department will see this folder in their "My Drive".
                  </p>
                </div>
              ) : (
                /* Specific Users Multi-Select */
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Select Accounts ({selectedUserIds.length} selected)
                  </label>
                  <div className="relative mb-2">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                    <input
                      type="text"
                      placeholder="Search accounts by name, email, or department..."
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 border border-slate-300 rounded text-xs bg-white focus:ring-1 focus:ring-nkb-gold-500 focus:outline-none"
                    />
                  </div>
                  <div className="max-h-36 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded bg-white p-1">
                    {filteredUsers.length === 0 ? (
                      <div className="p-2 text-center text-slate-400 text-[11px]">No accounts found</div>
                    ) : (
                      filteredUsers.map((u) => {
                        const isSelected = selectedUserIds.includes(u.id);
                        return (
                          <div
                            key={u.id}
                            onClick={() => handleToggleUserSelect(u.id)}
                            className={`p-2 flex items-center justify-between cursor-pointer rounded transition ${
                              isSelected ? 'bg-nkb-gold-50/70 text-nkb-navy-950 font-medium' : 'hover:bg-slate-50 text-slate-700'
                            }`}
                          >
                            <div className="truncate pr-2">
                              <div className="font-semibold text-xs truncate">{u.full_name || u.username}</div>
                              <div className="text-[10px] text-slate-400 truncate">{u.email} &bull; {u.department_name || 'No Dept'}</div>
                            </div>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {}} // Handled by parent div
                              className="rounded text-nkb-gold-500 focus:ring-nkb-gold-500 flex-shrink-0"
                            />
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {/* Permission Level Selector (Read/Write vs Read Only) */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">Access Rights & Permission</label>
                <div className="grid grid-cols-2 gap-2">
                  <div
                    onClick={() => setPermissionType('CONTRIBUTOR')}
                    className={`p-2.5 rounded border cursor-pointer transition ${
                      permissionType === 'CONTRIBUTOR'
                        ? 'bg-emerald-50/60 border-emerald-500 text-emerald-950 ring-1 ring-emerald-400'
                        : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex items-center space-x-1.5 font-bold text-xs text-emerald-700">
                      <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                      <span>Read / Write</span>
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1 leading-tight">
                      Can view, download, upload files, paste files, and create folders.
                    </div>
                  </div>

                  <div
                    onClick={() => setPermissionType('VIEWER')}
                    className={`p-2.5 rounded border cursor-pointer transition ${
                      permissionType === 'VIEWER'
                        ? 'bg-blue-50/60 border-blue-500 text-blue-950 ring-1 ring-blue-400'
                        : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex items-center space-x-1.5 font-bold text-xs text-blue-700">
                      <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                      <span>Read Only</span>
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1 leading-tight">
                      Can preview and download files only. Cannot upload, write, or paste.
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Sharing Note (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Storage share for Q4 audit and production files"
                  value={sharingNote}
                  onChange={(e) => setSharingNote(e.target.value)}
                  className="w-full border border-slate-300 rounded px-3 py-1.5 text-xs bg-white focus:ring-1 focus:ring-nkb-gold-500 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={loading || (shareTargetType === 'department' ? !selectedDeptId : selectedUserIds.length === 0)}
                className="w-full py-2 bg-nkb-navy-900 hover:bg-nkb-navy-800 text-white font-bold rounded text-xs shadow-sm transition disabled:opacity-50 flex items-center justify-center space-x-1.5"
              >
                <Users className="w-3.5 h-3.5 text-nkb-gold-400" />
                <span>
                  {loading 
                    ? 'Saving Share...' 
                    : shareTargetType === 'department' 
                      ? 'Share to Department Accounts' 
                      : `Share to ${selectedUserIds.length} Selected Account(s)`}
                </span>
              </button>
            </form>

            {/* Active Shares List (Both Departments and Accounts) */}
            <div className="space-y-2">
              <h4 className="font-semibold text-slate-700 text-[11px] uppercase tracking-wider flex items-center justify-between">
                <span>Active Shares on this Folder ({activeShares.length})</span>
                {loadingShares && <span className="text-[10px] text-slate-400">Loading...</span>}
              </h4>

              {activeShares.length === 0 ? (
                <div className="p-3 bg-white rounded border border-slate-200 text-center text-slate-400 text-[11px]">
                  No active shares yet. Only the folder owner can view this folder.
                </div>
              ) : (
                <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded bg-white">
                  {activeShares.map((sh) => {
                    const isDept = !!sh.department_name;
                    const isReadWrite = ['CONTRIBUTOR', 'EDITOR', 'EDIT'].includes(sh.permission_level);
                    return (
                      <div key={sh.id} className="p-2.5 flex items-center justify-between hover:bg-slate-50 transition">
                        <div className="space-y-0.5 truncate pr-2">
                          <div className="flex items-center space-x-2">
                            {isDept ? (
                              <span className="font-semibold text-slate-800 flex items-center space-x-1">
                                <Building2 className="w-3 h-3 text-slate-500" />
                                <span>Dept: {sh.department_name}</span>
                              </span>
                            ) : (
                              <span className="font-semibold text-slate-800 flex items-center space-x-1">
                                <User className="w-3 h-3 text-slate-500" />
                                <span>{sh.user_name || sh.user_email || 'Account'}</span>
                              </span>
                            )}
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${
                              isReadWrite 
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-300' 
                                : 'bg-blue-50 text-blue-800 border-blue-300'
                            }`}>
                              {isReadWrite ? 'Read / Write' : 'Read Only'}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-400 truncate">
                            {isDept ? `All ${sh.department_name} accounts` : sh.user_email} &bull; Shared by {sh.shared_by_name || 'Admin'}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRevokeShare(sh.id)}
                          className="p-1 text-slate-400 hover:text-red-600 rounded hover:bg-red-50 transition flex-shrink-0"
                          title="Revoke share access"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: PUBLIC LINK SHARE */}
        {activeTab === 'link' && (
          <form onSubmit={handleGenerateLink} className="space-y-4 text-xs">
            {isOutsideCompany ? (
              <div className="p-3 bg-amber-50 border border-amber-300 rounded text-amber-900 text-xs flex items-center space-x-2">
                <Shield className="w-4 h-4 text-amber-600 flex-shrink-0" />
                <span>
                  <strong>Restricted Outside Company Network:</strong> Creating public links is blocked when accessing outside corporate network to prevent data exfiltration.
                </span>
              </div>
            ) : null}

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Access Permission</label>
              <select
                value={linkPermission}
                disabled={isOutsideCompany}
                onChange={(e) => setLinkPermission(e.target.value)}
                className="w-full border border-slate-300 rounded px-3 py-2 text-xs focus:ring-1 focus:ring-nkb-gold-500 focus:outline-none disabled:bg-slate-100"
              >
                <option value="VIEWER">Read Only (Can preview and download)</option>
                <option value="EDITOR">Read / Write (Can view, download, and update)</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Expires After</label>
                <select
                  value={expiresInDays}
                  disabled={isOutsideCompany}
                  onChange={(e) => setExpiresInDays(e.target.value)}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-xs focus:ring-1 focus:ring-nkb-gold-500 focus:outline-none disabled:bg-slate-100"
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
                  disabled={isOutsideCompany}
                  placeholder="Optional link password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-xs focus:ring-1 focus:ring-nkb-gold-500 focus:outline-none disabled:bg-slate-100"
                />
              </div>
            </div>

            <div className="flex items-center space-x-2 pt-1">
              <input
                type="checkbox"
                id="allowDl"
                disabled={isOutsideCompany}
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
              disabled={linkLoading || isOutsideCompany}
              className="w-full py-2 bg-nkb-navy-900 hover:bg-nkb-navy-800 text-white font-bold rounded text-xs shadow-sm transition disabled:opacity-50"
            >
              {linkLoading ? 'Generating Link...' : 'Create Secure Share Link'}
            </button>

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
                    disabled={isOutsideCompany}
                    className="px-3 py-1.5 bg-nkb-gold-500 hover:bg-nkb-gold-600 text-nkb-navy-950 font-bold rounded text-xs flex items-center space-x-1 disabled:opacity-50"
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
          </form>
        )}
      </div>
    </div>
  );
}
