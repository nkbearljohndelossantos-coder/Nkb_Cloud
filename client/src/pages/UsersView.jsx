import React, { useState, useEffect } from 'react';
import {
  Users,
  UserPlus,
  Shield,
  Edit2,
  HardDrive,
  CheckCircle,
  XCircle,
  RefreshCw,
  X,
  Link as LinkIcon,
  Share2,
  Copy,
  Check,
  Clock,
  AlertCircle,
  Trash2,
  ExternalLink,
  Building2,
  Sparkles,
  Folder,
  Plus,
  CheckCircle2
} from 'lucide-react';
import api from '../api/client';
import { formatBytes, formatDate } from '../utils/formatters';

export default function UsersView() {
  const [activeTab, setActiveTab] = useState('users'); // 'users' or 'invites'
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);

  // New User Modal State (Manual creation)
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [roleId, setRoleId] = useState(3); // Standard User
  const [departmentId, setDepartmentId] = useState(2); // IT
  const [storageQuotaGB, setStorageQuotaGB] = useState(100);

  // Edit User Modal State
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [editFullName, setEditFullName] = useState('');
  const [editRoleId, setEditRoleId] = useState(3);
  const [editDepartmentId, setEditDepartmentId] = useState('');
  const [editStatus, setEditStatus] = useState('ACTIVE');
  const [editQuotaGB, setEditQuotaGB] = useState(100);

  // Invite Modal State (Share registration link)
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteRoleId, setInviteRoleId] = useState(3); // Standard User
  const [inviteDepartmentId, setInviteDepartmentId] = useState(7); // Marketing default (or first available)
  const [inviteExpiresInDays, setInviteExpiresInDays] = useState(7);
  const [inviteMaxUses, setInviteMaxUses] = useState(1);
  const [inviteNote, setInviteNote] = useState('');
  const [generatedInvite, setGeneratedInvite] = useState(null);
  const [copiedInviteId, setCopiedInviteId] = useState(null);
  const [generatingInvite, setGeneratingInvite] = useState(false);

  // Department Management State
  const [deptModalOpen, setDeptModalOpen] = useState(false);
  const [deptName, setDeptName] = useState('');
  const [deptCode, setDeptCode] = useState('');
  const [deptDescription, setDeptDescription] = useState('');
  const [deptCreateFolder, setDeptCreateFolder] = useState(true);
  const [savingDept, setSavingDept] = useState(false);

  // Edit Department State
  const [editDeptModalOpen, setEditDeptModalOpen] = useState(false);
  const [editingDept, setEditingDept] = useState(null);
  const [editDeptName, setEditDeptName] = useState('');
  const [editDeptCode, setEditDeptCode] = useState('');
  const [editDeptDescription, setEditDeptDescription] = useState('');

  const fetchDepartments = async () => {
    try {
      const res = await api.get('/departments');
      setDepartments(res.data.departments || []);
    } catch (err) {
      console.warn('Failed to load departments:', err.message);
    }
  };

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const [uRes, dRes] = await Promise.all([
        api.get('/admin/users'),
        api.get('/departments').catch(() => ({ data: { departments: [] } }))
      ]);
      setUsers(uRes.data.users);
      setRoles(uRes.data.roles);
      const fetchedDepts = dRes.data.departments?.length ? dRes.data.departments : uRes.data.departments || [];
      setDepartments(fetchedDepts);
      if (fetchedDepts.length > 0 && !inviteDepartmentId) {
        setInviteDepartmentId(fetchedDepts[0].id);
      }
    } catch (err) {
      alert(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchInvites = async () => {
    try {
      const res = await api.get('/admin/invites');
      setInvites(res.data.invites || []);
    } catch (err) {
      console.warn('[USERS VIEW] Could not fetch invites:', err.message);
    }
  };

  const handleCreateDepartment = async (e) => {
    e.preventDefault();
    if (!deptName.trim()) return;
    setSavingDept(true);
    try {
      await api.post('/departments', {
        name: deptName.trim(),
        code: deptCode.trim(),
        description: deptDescription.trim(),
        createFolder: deptCreateFolder
      });
      setDeptModalOpen(false);
      setDeptName('');
      setDeptCode('');
      setDeptDescription('');
      await fetchUsers();
    } catch (err) {
      alert(err.response?.data?.error || err.message);
    } finally {
      setSavingDept(false);
    }
  };

  const handleOpenEditDept = (dept) => {
    setEditingDept(dept);
    setEditDeptName(dept.name);
    setEditDeptCode(dept.code);
    setEditDeptDescription(dept.description || '');
    setEditDeptModalOpen(true);
  };

  const handleUpdateDepartment = async (e) => {
    e.preventDefault();
    if (!editDeptName.trim()) return;
    setSavingDept(true);
    try {
      await api.put(`/departments/${editingDept.id}`, {
        name: editDeptName.trim(),
        code: editDeptCode.trim(),
        description: editDeptDescription.trim()
      });
      setEditDeptModalOpen(false);
      await fetchUsers();
    } catch (err) {
      alert(err.response?.data?.error || err.message);
    } finally {
      setSavingDept(false);
    }
  };

  const handleDeleteDepartment = async (dept) => {
    if (!confirm(`Are you sure you want to delete department '${dept.name}'? Existing users will be marked as Unassigned.`)) {
      return;
    }
    try {
      await api.delete(`/departments/${dept.id}`);
      await fetchUsers();
    } catch (err) {
      alert(err.response?.data?.error || err.message);
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchInvites();
  }, []);

  const handleCreateUser = async (e) => {
    e.preventDefault();
    try {
      await api.post('/admin/users', {
        username,
        email,
        fullName,
        password,
        roleId: parseInt(roleId),
        departmentId: parseInt(departmentId),
        storageQuotaGB: parseInt(storageQuotaGB)
      });
      setCreateModalOpen(false);
      setUsername('');
      setEmail('');
      setFullName('');
      setPassword('');
      fetchUsers();
    } catch (err) {
      alert(err.response?.data?.error || err.message);
    }
  };

  const handleOpenEdit = (u) => {
    setEditingUser(u);
    setEditFullName(u.full_name);
    setEditRoleId(u.role_id);
    setEditDepartmentId(u.department_id || '');
    setEditStatus(u.status);
    setEditQuotaGB(Math.round(u.storage_quota_bytes / (1024 * 1024 * 1024)));
    setEditModalOpen(true);
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    try {
      await api.put(`/admin/users/${editingUser.id}`, {
        fullName: editFullName,
        roleId: parseInt(editRoleId),
        departmentId: editDepartmentId ? parseInt(editDepartmentId) : null,
        status: editStatus,
        storageQuotaGB: parseInt(editQuotaGB)
      });
      setEditModalOpen(false);
      fetchUsers();
    } catch (err) {
      alert(err.response?.data?.error || err.message);
    }
  };

  // Generate new registration invite link
  const handleGenerateInvite = async (e) => {
    e.preventDefault();
    setGeneratingInvite(true);
    try {
      const res = await api.post('/admin/invites', {
        roleId: parseInt(inviteRoleId),
        departmentId: inviteDepartmentId ? parseInt(inviteDepartmentId) : null,
        expiresInDays: parseInt(inviteExpiresInDays) || null,
        maxUses: parseInt(inviteMaxUses) || 1,
        note: inviteNote
      });

      const inv = res.data.invite;
      const origin = window.location.origin;
      const fullLink = `${origin}/register?token=${inv.token}`;
      setGeneratedInvite({ ...inv, fullLink });
      fetchInvites();
    } catch (err) {
      alert(err.response?.data?.error || err.message || 'Failed to generate invitation link');
    } finally {
      setGeneratingInvite(false);
    }
  };

  const copyToClipboard = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedInviteId(id);
    setTimeout(() => setCopiedInviteId(null), 2500);
  };

  const handleRevokeInvite = async (id) => {
    if (!confirm('Are you sure you want to deactivate this invitation link? Users will no longer be able to register with it.')) return;
    try {
      await api.put(`/admin/invites/${id}/revoke`);
      fetchInvites();
    } catch (err) {
      alert(err.response?.data?.error || err.message);
    }
  };

  const handleDeleteInvite = async (id) => {
    if (!confirm('Permanently delete this invitation record?')) return;
    try {
      await api.delete(`/admin/invites/${id}`);
      fetchInvites();
    } catch (err) {
      alert(err.response?.data?.error || err.message);
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6 select-none">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <Users className="w-5 h-5 text-nkb-gold-500" />
            <h1 className="text-xl font-bold text-nkb-navy-900 tracking-tight">
              User & Access Permission Management
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Enterprise role-based access control (RBAC), department allocation, and admin registration links.
          </p>
        </div>

        <div className="flex items-center space-x-2.5">
          <button
            onClick={() => { fetchUsers(); fetchInvites(); }}
            className="p-2 border border-slate-300 hover:bg-slate-100 rounded text-slate-700 transition"
            title="Refresh Directory"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          {/* Action: Add New Department */}
          <button
            onClick={() => {
              setDeptName('');
              setDeptCode('');
              setDeptDescription('');
              setDeptCreateFolder(true);
              setDeptModalOpen(true);
            }}
            className="flex items-center space-x-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded text-xs shadow-sm transition"
          >
            <Building2 className="w-4 h-4 text-emerald-200" />
            <span>+ Add Department</span>
          </button>

          {/* Primary Action: Share Registration Link */}
          <button
            onClick={() => {
              setGeneratedInvite(null);
              setInviteModalOpen(true);
            }}
            className="flex items-center space-x-2 px-3.5 py-2 bg-gradient-to-r from-nkb-gold-500 to-amber-500 hover:from-nkb-gold-600 hover:to-amber-600 text-nkb-navy-950 font-bold rounded text-xs shadow-sm transition"
          >
            <Share2 className="w-4 h-4 text-nkb-navy-950" />
            <span>Share Registration Link</span>
          </button>

          {/* Secondary Action: Direct User Creation */}
          <button
            onClick={() => setCreateModalOpen(true)}
            className="flex items-center space-x-2 px-3 py-2 bg-nkb-navy-900 hover:bg-nkb-navy-800 text-white font-bold rounded text-xs shadow-sm transition"
          >
            <UserPlus className="w-4 h-4 text-nkb-gold-400" />
            <span>Manual Add</span>
          </button>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex border-b border-slate-200 space-x-4 text-xs font-semibold">
        <button
          onClick={() => setActiveTab('users')}
          className={`pb-2.5 px-2 flex items-center space-x-2 transition border-b-2 ${
            activeTab === 'users'
              ? 'border-nkb-navy-900 text-nkb-navy-900 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Active Users ({users.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('departments')}
          className={`pb-2.5 px-2 flex items-center space-x-2 transition border-b-2 ${
            activeTab === 'departments'
              ? 'border-nkb-navy-900 text-nkb-navy-900 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>Departments ({departments.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('invites')}
          className={`pb-2.5 px-2 flex items-center space-x-2 transition border-b-2 ${
            activeTab === 'invites'
              ? 'border-nkb-navy-900 text-nkb-navy-900 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <LinkIcon className="w-4 h-4" />
          <span>Registration Invite Links ({invites.length})</span>
          {invites.filter(i => i.is_active).length > 0 && (
            <span className="px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded-full text-[10px] font-bold">
              {invites.filter(i => i.is_active).length} active
            </span>
          )}
        </button>
      </div>

      {/* TAB 1: USERS DIRECTORY */}
      {activeTab === 'users' && (
        <div className="bg-white rounded border border-slate-200 overflow-hidden shadow-sm">
          <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <h2 className="text-xs font-bold text-nkb-navy-900 uppercase tracking-wider">
              Directory ({users.length} accounts)
            </h2>
            <span className="text-[11px] text-slate-500">
              Enforcing NKB Manufacturing Security Policy
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-4 font-semibold">User</th>
                  <th className="py-2.5 px-4 font-semibold">Department</th>
                  <th className="py-2.5 px-4 font-semibold">Role</th>
                  <th className="py-2.5 px-4 font-semibold">Storage Quota</th>
                  <th className="py-2.5 px-4 font-semibold">Status</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => {
                  const used = u.used_storage_bytes || 0;
                  const quota = u.storage_quota_bytes || 1;
                  const pct = Math.min(100, Math.round((used / quota) * 100));

                  return (
                    <tr key={u.id} className="hover:bg-slate-50/60 transition">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">{u.full_name}</div>
                        <div className="text-[11px] text-slate-500 font-mono">{u.email}</div>
                      </td>

                      <td className="py-3 px-4 font-medium text-slate-700">
                        {u.department_name || 'Unassigned'}
                      </td>

                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold ${
                            u.role_name === 'SUPER ADMIN'
                              ? 'bg-purple-100 text-purple-800 border border-purple-200'
                              : u.role_name === 'ADMIN'
                              ? 'bg-blue-100 text-blue-800 border border-blue-200'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {u.role_name}
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        <div className="flex items-center space-x-2">
                          <HardDrive className="w-3.5 h-3.5 text-slate-400" />
                          <span className="text-[11px] text-slate-700">
                            {formatBytes(used)} / {formatBytes(quota)}
                          </span>
                        </div>
                        <div className="w-24 bg-slate-200 h-1.5 rounded-full mt-1 overflow-hidden">
                          <div
                            className={`h-full ${pct > 90 ? 'bg-red-500' : pct > 75 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        {u.status === 'ACTIVE' ? (
                          <span className="inline-flex items-center space-x-1 text-emerald-600 font-semibold text-[11px]">
                            <CheckCircle className="w-3.5 h-3.5" />
                            <span>Active</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center space-x-1 text-red-600 font-semibold text-[11px]">
                            <XCircle className="w-3.5 h-3.5" />
                            <span>{u.status}</span>
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => handleOpenEdit(u)}
                          className="p-1 hover:bg-slate-200 rounded text-slate-600 transition"
                          title="Edit User Role & Department"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: INVITATION LINKS */}
      {activeTab === 'invites' && (
        <div className="bg-white rounded border border-slate-200 overflow-hidden shadow-sm space-y-0">
          <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <div>
              <h2 className="text-xs font-bold text-nkb-navy-900 uppercase tracking-wider">
                Registration Invite Links ({invites.length} links generated)
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Share these secure links with team members so their department and privileges are automatically assigned upon signup.
              </p>
            </div>
            <button
              onClick={() => {
                setGeneratedInvite(null);
                setInviteModalOpen(true);
              }}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-nkb-navy-900 hover:bg-nkb-navy-800 text-white rounded text-xs font-bold transition shadow-sm"
            >
              <Share2 className="w-3.5 h-3.5 text-nkb-gold-400" />
              <span>Generate New Link</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            {invites.length === 0 ? (
              <div className="py-12 text-center space-y-3">
                <LinkIcon className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="text-xs font-semibold text-slate-600">No registration invite links generated yet.</p>
                <button
                  onClick={() => {
                    setGeneratedInvite(null);
                    setInviteModalOpen(true);
                  }}
                  className="px-3 py-1.5 bg-nkb-gold-500 text-nkb-navy-950 rounded text-xs font-bold shadow-sm"
                >
                  Create First Registration Link
                </button>
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-4 font-semibold">Department Preset</th>
                    <th className="py-2.5 px-4 font-semibold">Assigned Role</th>
                    <th className="py-2.5 px-4 font-semibold">Note / Label</th>
                    <th className="py-2.5 px-4 font-semibold">Registrations</th>
                    <th className="py-2.5 px-4 font-semibold">Expires</th>
                    <th className="py-2.5 px-4 font-semibold">Status</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {invites.map((inv) => {
                    const origin = window.location.origin;
                    const fullLink = `${origin}/register?token=${inv.token}`;
                    const isCopied = copiedInviteId === inv.id;
                    const isExpired = inv.expires_at && new Date(inv.expires_at) < new Date();
                    const isExhausted = inv.max_uses && inv.used_count >= inv.max_uses;

                    return (
                      <tr key={inv.id} className="hover:bg-slate-50/60 transition">
                        <td className="py-3 px-4">
                          <div className="flex items-center space-x-1.5 font-semibold text-slate-900">
                            <Building2 className="w-3.5 h-3.5 text-slate-400" />
                            <span>{inv.department_name || 'Unassigned'}</span>
                          </div>
                        </td>

                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold ${
                              inv.role_name === 'SUPER ADMIN'
                                ? 'bg-purple-100 text-purple-800'
                                : inv.role_name === 'ADMIN'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {inv.role_name}
                          </span>
                        </td>

                        <td className="py-3 px-4 text-slate-600">
                          {inv.note ? <span className="italic">"{inv.note}"</span> : <span className="text-slate-400">-</span>}
                        </td>

                        <td className="py-3 px-4">
                          <span className="font-mono font-medium text-slate-700">
                            {inv.used_count} / {inv.max_uses ? inv.max_uses : '∞'}
                          </span>
                        </td>

                        <td className="py-3 px-4 text-slate-500">
                          {inv.expires_at ? formatDate(inv.expires_at) : 'Never'}
                        </td>

                        <td className="py-3 px-4">
                          {!inv.is_active ? (
                            <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-bold">
                              Revoked
                            </span>
                          ) : isExpired ? (
                            <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-[10px] font-bold">
                              Expired
                            </span>
                          ) : isExhausted ? (
                            <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-[10px] font-bold">
                              Exhausted
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded text-[10px] font-bold">
                              Active
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-4 text-right space-x-1.5 whitespace-nowrap">
                          {inv.is_active && !isExpired && !isExhausted && (
                            <button
                              onClick={() => copyToClipboard(fullLink, inv.id)}
                              className={`px-2.5 py-1 rounded text-[11px] font-bold border transition inline-flex items-center space-x-1 ${
                                isCopied
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                                  : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300'
                              }`}
                              title="Copy Link"
                            >
                              {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                              <span>{isCopied ? 'Copied!' : 'Copy Link'}</span>
                            </button>
                          )}

                          {inv.is_active && (
                            <button
                              onClick={() => handleRevokeInvite(inv.id)}
                              className="px-2 py-1 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded text-[11px] font-semibold border border-transparent transition"
                              title="Deactivate Link"
                            >
                              Revoke
                            </button>
                          )}

                          <button
                            onClick={() => handleDeleteInvite(inv.id)}
                            className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: DEPARTMENTS DIRECTORY */}
      {activeTab === 'departments' && (
        <div className="space-y-4">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 bg-white rounded border border-slate-200 shadow-sm flex items-center space-x-3">
              <div className="p-2.5 bg-blue-50 text-blue-700 rounded-lg">
                <Building2 className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xl font-bold text-nkb-navy-900">{departments.length}</div>
                <div className="text-xs text-slate-500 font-medium">Total Active Departments</div>
              </div>
            </div>

            <div className="p-4 bg-white rounded border border-slate-200 shadow-sm flex items-center space-x-3">
              <div className="p-2.5 bg-emerald-50 text-emerald-700 rounded-lg">
                <Folder className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xl font-bold text-nkb-navy-900">
                  {departments.filter(d => (parseInt(d.folder_count || 0, 10) > 0)).length}
                </div>
                <div className="text-xs text-slate-500 font-medium">Departments with Workspace Folders</div>
              </div>
            </div>

            <div className="p-4 bg-white rounded border border-slate-200 shadow-sm flex items-center space-x-3">
              <div className="p-2.5 bg-amber-50 text-amber-700 rounded-lg">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xl font-bold text-nkb-navy-900">
                  {users.filter(u => u.department_id).length}
                </div>
                <div className="text-xs text-slate-500 font-medium">Employees Assigned to Departments</div>
              </div>
            </div>
          </div>

          {/* Departments Table */}
          <div className="bg-white rounded border border-slate-200 overflow-hidden shadow-sm">
            <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div>
                <h2 className="text-xs font-bold text-nkb-navy-900 uppercase tracking-wider flex items-center space-x-2">
                  <Building2 className="w-4 h-4 text-slate-600" />
                  <span>Company Departments & Workspace Directory</span>
                </h2>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Departments isolate file access and determine employee permissions in NKB Drive.
                </p>
              </div>
              <button
                onClick={() => {
                  setDeptName('');
                  setDeptCode('');
                  setDeptDescription('');
                  setDeptCreateFolder(true);
                  setDeptModalOpen(true);
                }}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded text-xs shadow-sm transition flex items-center space-x-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Department</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-600 uppercase text-[10px] font-bold border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-4 font-semibold">Department Name</th>
                    <th className="py-2.5 px-4 font-semibold">Code</th>
                    <th className="py-2.5 px-4 font-semibold">Description</th>
                    <th className="py-2.5 px-4 font-semibold">Members</th>
                    <th className="py-2.5 px-4 font-semibold">Workspace Drive Folder</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {departments.map((dept) => {
                    const memberCount = dept.member_count !== undefined 
                      ? parseInt(dept.member_count, 10) 
                      : users.filter(u => u.department_id === dept.id).length;
                    const hasFolder = parseInt(dept.folder_count || 0, 10) > 0;

                    return (
                      <tr key={dept.id} className="hover:bg-slate-50 transition">
                        <td className="py-3 px-4 font-bold text-nkb-navy-900 flex items-center space-x-2">
                          <div className="w-7 h-7 rounded bg-slate-100 text-slate-700 font-bold flex items-center justify-center border border-slate-200 flex-shrink-0 text-xs">
                            {dept.code?.slice(0, 2) || dept.name?.slice(0, 2)}
                          </div>
                          <span>{dept.name}</span>
                        </td>

                        <td className="py-3 px-4">
                          <span className="font-mono text-[11px] font-bold bg-slate-100 px-2 py-0.5 rounded border border-slate-200 text-slate-700">
                            {dept.code}
                          </span>
                        </td>

                        <td className="py-3 px-4 text-slate-600 max-w-xs truncate" title={dept.description}>
                          {dept.description || <span className="text-slate-400 italic">No description</span>}
                        </td>

                        <td className="py-3 px-4">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                            memberCount > 0 
                              ? 'bg-blue-50 text-blue-800 border-blue-200' 
                              : 'bg-slate-50 text-slate-500 border-slate-200'
                          }`}>
                            {memberCount} employee{memberCount !== 1 ? 's' : ''}
                          </span>
                        </td>

                        <td className="py-3 px-4">
                          {hasFolder ? (
                            <span className="inline-flex items-center space-x-1 px-2 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded text-[10px] font-semibold">
                              <Folder className="w-3 h-3 text-emerald-600" />
                              <span>Active Workspace</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center space-x-1 px-2 py-0.5 bg-slate-100 text-slate-500 border border-slate-200 rounded text-[10px]">
                              <span>No Dedicated Folder</span>
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-4 text-right space-x-2 whitespace-nowrap">
                          {/* Create Invite for this Department */}
                          <button
                            onClick={() => {
                              setInviteDepartmentId(dept.id);
                              setGeneratedInvite(null);
                              setInviteModalOpen(true);
                            }}
                            className="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded text-[11px] font-bold transition inline-flex items-center space-x-1"
                            title="Generate Registration Link for this Department"
                          >
                            <Share2 className="w-3 h-3" />
                            <span>Invite Member</span>
                          </button>

                          {/* Edit Department */}
                          <button
                            onClick={() => handleOpenEditDept(dept)}
                            className="p-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded transition"
                            title="Edit Department"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          {/* Delete Department */}
                          <button
                            onClick={() => handleDeleteDepartment(dept)}
                            className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition"
                            title="Delete Department"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1: SHARE REGISTRATION LINK (INVITE GENERATOR) */}
      {inviteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-5 animate-in fade-in duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <Share2 className="w-5 h-5 text-nkb-gold-500" />
                <h3 className="text-sm font-bold text-nkb-navy-900">
                  Generate Registration Invite Link
                </h3>
              </div>
              <button
                onClick={() => setInviteModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* If link was just generated, show copy card */}
            {generatedInvite ? (
              <div className="space-y-4">
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg space-y-2">
                  <div className="flex items-center space-x-2 text-emerald-900 font-bold text-xs">
                    <CheckCircle className="w-4 h-4 text-emerald-600" />
                    <span>Invitation Link Ready to Share!</span>
                  </div>
                  <p className="text-xs text-emerald-800">
                    Anyone who opens this link will register directly into{' '}
                    <strong>{generatedInvite.department_name}</strong> as an{' '}
                    <strong>{generatedInvite.role_name}</strong>.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[11px] font-bold text-slate-600 uppercase">
                    Registration Link
                  </label>
                  <div className="flex space-x-2">
                    <input
                      type="text"
                      readOnly
                      value={generatedInvite.fullLink}
                      className="flex-1 bg-slate-50 border border-slate-300 rounded px-3 py-2 text-xs font-mono text-slate-800 select-all"
                    />
                    <button
                      type="button"
                      onClick={() => copyToClipboard(generatedInvite.fullLink, 'modal')}
                      className="px-4 py-2 bg-nkb-navy-900 hover:bg-nkb-navy-800 text-white rounded text-xs font-bold flex items-center space-x-1.5 transition"
                    >
                      {copiedInviteId === 'modal' ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 text-nkb-gold-400" />
                          <span>Copy Link</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div className="bg-slate-50 p-3 rounded border border-slate-200 text-xs space-y-1">
                  <div className="flex justify-between text-slate-600">
                    <span>Assigned Department:</span>
                    <span className="font-bold text-slate-900">{generatedInvite.department_name}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Assigned Role:</span>
                    <span className="font-bold text-slate-900">{generatedInvite.role_name}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Max Registrations:</span>
                    <span className="font-bold text-slate-900">{generatedInvite.max_uses ? `${generatedInvite.max_uses} user` : 'Unlimited'}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Expiration:</span>
                    <span className="font-bold text-slate-900">{generatedInvite.expires_at ? formatDate(generatedInvite.expires_at) : 'Never'}</span>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 flex justify-between items-center">
                  <button
                    type="button"
                    onClick={() => setGeneratedInvite(null)}
                    className="text-xs text-nkb-gold-600 hover:text-nkb-gold-700 font-bold"
                  >
                    + Generate Another Link
                  </button>
                  <button
                    type="button"
                    onClick={() => setInviteModalOpen(false)}
                    className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded text-xs font-semibold"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              /* Generate Invite Form */
              <form onSubmit={handleGenerateInvite} className="space-y-4">
                <p className="text-xs text-slate-500">
                  Select the department and system privileges for this link. When the recipient completes registration, these settings are locked and applied automatically.
                </p>

                {/* 1. Department Preset */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Preset Department
                  </label>
                  <select
                    value={inviteDepartmentId}
                    onChange={(e) => setInviteDepartmentId(e.target.value)}
                    className="w-full border border-slate-300 rounded px-3 py-2 text-xs focus:ring-1 focus:ring-nkb-gold-500 focus:outline-none bg-white font-medium text-slate-800"
                  >
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({d.code})
                      </option>
                    ))}
                  </select>
                </div>

                {/* 2. Role Preset */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Preset Role / Privileges
                  </label>
                  <select
                    value={inviteRoleId}
                    onChange={(e) => setInviteRoleId(e.target.value)}
                    className="w-full border border-slate-300 rounded px-3 py-2 text-xs focus:ring-1 focus:ring-nkb-gold-500 focus:outline-none bg-white font-medium text-slate-800"
                  >
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} - {r.description || 'Standard system privileges'}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Select <strong>ADMIN</strong> if you want this user to manage their department's files, storage, and team accounts.
                  </p>
                </div>

                {/* 3. Link Options: Expiration & Max Uses */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Link Expiration
                    </label>
                    <select
                      value={inviteExpiresInDays}
                      onChange={(e) => setInviteExpiresInDays(e.target.value)}
                      className="w-full border border-slate-300 rounded px-3 py-2 text-xs focus:ring-1 focus:ring-nkb-gold-500 focus:outline-none bg-white text-slate-800"
                    >
                      <option value="1">24 Hours</option>
                      <option value="7">7 Days (Recommended)</option>
                      <option value="30">30 Days</option>
                      <option value="0">Never Expire</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Max Uses
                    </label>
                    <select
                      value={inviteMaxUses}
                      onChange={(e) => setInviteMaxUses(e.target.value)}
                      className="w-full border border-slate-300 rounded px-3 py-2 text-xs focus:ring-1 focus:ring-nkb-gold-500 focus:outline-none bg-white text-slate-800"
                    >
                      <option value="1">1 Person (Single-Use)</option>
                      <option value="5">Up to 5 Persons</option>
                      <option value="10">Up to 10 Persons</option>
                      <option value="100">Unlimited / Team</option>
                    </select>
                  </div>
                </div>

                {/* 4. Note / Purpose */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Optional Note / Description
                  </label>
                  <input
                    type="text"
                    value={inviteNote}
                    onChange={(e) => setInviteNote(e.target.value)}
                    placeholder="e.g. Marketing Content Lead or New QA Inspector"
                    className="w-full border border-slate-300 rounded px-3 py-2 text-xs focus:ring-1 focus:ring-nkb-gold-500 focus:outline-none text-slate-800"
                  />
                </div>

                <div className="pt-3 border-t border-slate-100 flex justify-end space-x-2">
                  <button
                    type="button"
                    onClick={() => setInviteModalOpen(false)}
                    className="px-4 py-2 border border-slate-300 rounded text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={generatingInvite}
                    className="px-4 py-2 bg-nkb-navy-900 hover:bg-nkb-navy-800 text-white rounded text-xs font-bold shadow-sm flex items-center space-x-1.5 disabled:opacity-50"
                  >
                    <Share2 className="w-3.5 h-3.5 text-nkb-gold-400" />
                    <span>{generatingInvite ? 'Generating...' : 'Create Invite Link'}</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* MODAL 2: DIRECT MANUAL USER CREATION */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-nkb-navy-900">Add User Account Directly</h3>
              <button onClick={() => setCreateModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-xs focus:ring-1 focus:ring-nkb-gold-500 focus:outline-none"
                  placeholder="e.g. John Doe"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Username</label>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase().trim())}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-xs focus:ring-1 focus:ring-nkb-gold-500 focus:outline-none"
                  placeholder="e.g. jdoe"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Work Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value.toLowerCase().trim())}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-xs focus:ring-1 focus:ring-nkb-gold-500 focus:outline-none"
                  placeholder="jdoe@nkbmanufacturing.com"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Initial Password</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-xs focus:ring-1 focus:ring-nkb-gold-500 focus:outline-none"
                  placeholder="••••••••••••"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Role</label>
                  <select
                    value={roleId}
                    onChange={(e) => setRoleId(e.target.value)}
                    className="w-full border border-slate-300 rounded px-3 py-2 text-xs focus:ring-1 focus:ring-nkb-gold-500 focus:outline-none"
                  >
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Department</label>
                  <select
                    value={departmentId}
                    onChange={(e) => setDepartmentId(e.target.value)}
                    className="w-full border border-slate-300 rounded px-3 py-2 text-xs focus:ring-1 focus:ring-nkb-gold-500 focus:outline-none"
                  >
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Storage Quota (GB)</label>
                <input
                  type="number"
                  min="5"
                  max="10000"
                  value={storageQuotaGB}
                  onChange={(e) => setStorageQuotaGB(e.target.value)}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-xs focus:ring-1 focus:ring-nkb-gold-500 focus:outline-none"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-nkb-navy-900 hover:bg-nkb-navy-800 text-white rounded text-xs font-semibold shadow-sm"
                >
                  Create User
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: EDIT USER ROLE & DEPARTMENT */}
      {editModalOpen && editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-nkb-navy-900">
                Edit User: {editingUser.username}
              </h3>
              <button onClick={() => setEditModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={editFullName}
                  onChange={(e) => setEditFullName(e.target.value)}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-xs focus:ring-1 focus:ring-nkb-gold-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Role</label>
                  <select
                    value={editRoleId}
                    onChange={(e) => setEditRoleId(e.target.value)}
                    className="w-full border border-slate-300 rounded px-3 py-2 text-xs focus:ring-1 focus:ring-nkb-gold-500 focus:outline-none"
                  >
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Department</label>
                  <select
                    value={editDepartmentId}
                    onChange={(e) => setEditDepartmentId(e.target.value)}
                    className="w-full border border-slate-300 rounded px-3 py-2 text-xs focus:ring-1 focus:ring-nkb-gold-500 focus:outline-none"
                  >
                    <option value="">Unassigned</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Account Status</label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-xs focus:ring-1 focus:ring-nkb-gold-500 focus:outline-none"
                >
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="SUSPENDED">SUSPENDED</option>
                  <option value="INACTIVE">INACTIVE</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Storage Quota (GB)</label>
                <input
                  type="number"
                  min="5"
                  max="10000"
                  value={editQuotaGB}
                  onChange={(e) => setEditQuotaGB(e.target.value)}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-xs focus:ring-1 focus:ring-nkb-gold-500 focus:outline-none"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setEditModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-nkb-navy-900 hover:bg-nkb-navy-800 text-white rounded text-xs font-semibold shadow-sm"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: ADD NEW DEPARTMENT */}
      {deptModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <Building2 className="w-5 h-5 text-emerald-600" />
                <h3 className="text-sm font-bold text-nkb-navy-900">
                  Add New Department
                </h3>
              </div>
              <button
                onClick={() => setDeptModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateDepartment} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Department Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Warehouse & Logistics, Accounting"
                  value={deptName}
                  onChange={(e) => {
                    const val = e.target.value;
                    setDeptName(val);
                    if (!deptCode) {
                      const words = val.trim().split(/\s+/);
                      const suggested = words.map(w => w[0]).join('').toUpperCase().slice(0, 5);
                      setDeptCode(suggested);
                    }
                  }}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-xs focus:ring-1 focus:ring-nkb-gold-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Department Code (Uppercase) <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  maxLength={10}
                  placeholder="e.g. WHL, ACC, HR"
                  value={deptCode}
                  onChange={(e) => setDeptCode(e.target.value.toUpperCase())}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-xs font-mono font-bold uppercase focus:ring-1 focus:ring-nkb-gold-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Description (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Department scope, functions, and responsibilities..."
                  value={deptDescription}
                  onChange={(e) => setDeptDescription(e.target.value)}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-xs focus:ring-1 focus:ring-nkb-gold-500 focus:outline-none resize-none"
                />
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <label className="flex items-start space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={deptCreateFolder}
                    onChange={(e) => setDeptCreateFolder(e.target.checked)}
                    className="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500"
                  />
                  <div className="text-xs">
                    <span className="font-semibold text-slate-800">Create Dedicated Drive Workspace Folder</span>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Automatically creates a root folder in NKB Drive for this department so members can immediately sync files.
                    </p>
                  </div>
                </label>
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDeptModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingDept || !deptName.trim()}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-bold shadow-sm disabled:opacity-50"
                >
                  {savingDept ? 'Creating...' : 'Create Department'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 5: EDIT DEPARTMENT */}
      {editDeptModalOpen && editingDept && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <Edit2 className="w-5 h-5 text-slate-700" />
                <h3 className="text-sm font-bold text-nkb-navy-900">
                  Edit Department: {editingDept.name}
                </h3>
              </div>
              <button
                onClick={() => setEditDeptModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUpdateDepartment} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Department Name
                </label>
                <input
                  type="text"
                  required
                  value={editDeptName}
                  onChange={(e) => setEditDeptName(e.target.value)}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-xs focus:ring-1 focus:ring-nkb-gold-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Department Code
                </label>
                <input
                  type="text"
                  required
                  maxLength={10}
                  value={editDeptCode}
                  onChange={(e) => setEditDeptCode(e.target.value.toUpperCase())}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-xs font-mono font-bold uppercase focus:ring-1 focus:ring-nkb-gold-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Description
                </label>
                <textarea
                  rows={2}
                  value={editDeptDescription}
                  onChange={(e) => setEditDeptDescription(e.target.value)}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-xs focus:ring-1 focus:ring-nkb-gold-500 focus:outline-none resize-none"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditDeptModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingDept || !editDeptName.trim()}
                  className="px-4 py-2 bg-nkb-navy-900 hover:bg-nkb-navy-800 text-white rounded text-xs font-bold shadow-sm disabled:opacity-50"
                >
                  {savingDept ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
