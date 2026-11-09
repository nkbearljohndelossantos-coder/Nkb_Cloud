import React, { useState, useEffect } from 'react';
import { ShieldCheck, RefreshCw, Activity, Search } from 'lucide-react';
import api from '../api/client';
import { formatDate } from '../utils/formatters';

export default function AuditLogsView() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterText, setFilterText] = useState('');

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/audit-logs');
      setLogs(res.data.logs);
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const filtered = logs.filter(l => {
    if (!filterText) return true;
    const txt = filterText.toLowerCase();
    return (
      (l.action && l.action.toLowerCase().includes(txt)) ||
      (l.user_name && l.user_name.toLowerCase().includes(txt)) ||
      (l.entity_type && l.entity_type.toLowerCase().includes(txt))
    );
  });

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6 select-none">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <ShieldCheck className="w-5 h-5 text-nkb-gold-500" />
            <h1 className="text-xl font-bold text-nkb-navy-900 tracking-tight">
              Enterprise Audit Trail & Security Logs
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Complete cryptographic audit trail of user access, storage operations, and sharing events.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <input
            type="text"
            placeholder="Filter logs by action, user, or entity..."
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            className="border border-slate-300 rounded px-3 py-1.5 text-xs focus:ring-1 focus:ring-nkb-gold-500 focus:outline-none w-64"
          />
          <button
            onClick={fetchLogs}
            className="p-2 border border-slate-300 hover:bg-slate-100 rounded text-slate-700 transition"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="bg-white rounded border border-slate-200 overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <h2 className="text-xs font-bold text-nkb-navy-900 uppercase tracking-wider">
            Recorded Events ({filtered.length})
          </h2>
          <span className="text-[11px] text-slate-500 font-mono">
            Tamper-Resistant Storage Journal
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-4 font-semibold">Timestamp</th>
                <th className="py-2.5 px-4 font-semibold">Action</th>
                <th className="py-2.5 px-4 font-semibold">Initiator</th>
                <th className="py-2.5 px-4 font-semibold">Target Entity</th>
                <th className="py-2.5 px-4 font-semibold">Network IP</th>
                <th className="py-2.5 px-4 font-semibold">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50/60 font-mono text-[11px]">
                  <td className="py-3 px-4 text-slate-500 font-mono">
                    {formatDate(log.created_at)}
                  </td>
                  <td className="py-3 px-4">
                    <span className="bg-slate-100 text-slate-800 font-bold px-2 py-0.5 rounded">
                      {log.action}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-sans font-semibold text-slate-800">
                    {log.user_name || 'System / Agent'}
                  </td>
                  <td className="py-3 px-4 text-slate-600">
                    {log.entity_type} {log.entity_id ? `(${log.entity_id.substring(0, 8)})` : ''}
                  </td>
                  <td className="py-3 px-4 text-slate-500">
                    {log.ip_address || '127.0.0.1'}
                  </td>
                  <td className="py-3 px-4 text-slate-400 truncate max-w-xs" title={JSON.stringify(log.details)}>
                    {typeof log.details === 'object' ? JSON.stringify(log.details) : log.details || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
