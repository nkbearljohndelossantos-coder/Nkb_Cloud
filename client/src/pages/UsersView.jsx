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
  X
} from 'lucide-react';
import api from '../api/client';
import { formatBytes, formatDate } from '../utils/formatters';

export default function UsersView() {
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);

  // New User Modal State
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

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/users');
      setUsers(res.data.users);
      setRoles(res.data.roles);
      setDepartments(res.data.departments);
    } catch (err) {
      alert(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
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
            Enterprise role-based access control (RBAC), department allocation, and storage quotas.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={fetchUsers}
            className="p-2 border border-slate-300 hover:bg-slate-100 rounded text-slate-700 transition"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => setCreateModalOpen(true)}
            className="flex items-center space-x-2 px-3 py-2 bg-nkb-navy-900 hover:bg-nkb-navy-800 text-white font-bold rounded text-xs shadow-sm transition"
          >
            <UserPlus className="w-4 h-4 text-nkb-gold-400" />
            <span>Create New User</span>
          </button>
        </div>
      </div>

      {/* Users Table */}
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
                      <span className="font-semibold text-[10px] bg-nkb-gold-100 text-nkb-gold-700 px-2 py-0.5 rounded">
                        {u.role_name}
                      </span>
                    </td>

                    <td className="py-3 px-4 w-48">
                      <div className="flex justify-between text-[10px] text-slate-500 mb-1 font-mono">
                        <span>{formatBytes(used)}</span>
                        <span>{formatBytes(quota)}</span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-nkb-gold-500 rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </td>

                    <td className="py-3 px-4">
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                          u.status === 'ACTIVE'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-red-50 text-red-700 border border-red-200'
                        }`}
                      >
                        {u.status}
                      </span>
                    </td>

                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => handleOpenEdit(u)}
                        className="px-2.5 py-1 text-xs border border-slate-300 hover:bg-slate-100 rounded font-semibold text-slate-700 transition"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create User Modal */}
      {createModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded border border-slate-200 max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="font-bold text-sm text-nkb-navy-900">Create New User Account</h3>
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
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Username</label>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-xs focus:ring-1 focus:ring-nkb-gold-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-xs focus:ring-1 focus:ring-nkb-gold-500 focus:outline-none"
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
                    {roles.map(r => (
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
                    {departments.map(d => (
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
                  Create Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {editModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded border border-slate-200 max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="font-bold text-sm text-nkb-navy-900">
                Edit User: {editingUser?.username}
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
                    {roles.map(r => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
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
    </div>
  );
}
