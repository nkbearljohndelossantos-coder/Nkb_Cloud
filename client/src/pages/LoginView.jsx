import React, { useState } from 'react';
import { Cloud, Lock, Mail, ShieldAlert, ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function LoginView() {
  const { login } = useAuth();
  const [identifier, setIdentifier] = useState('admin@nkbmanufacturing.com');
  const [password, setPassword] = useState('Admin@NKB2026!');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await login(identifier, password);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Login failed. Please verify credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8 select-none">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center space-y-3">
        <img src="/logo.png" alt="NKB Cloud Logo" className="h-28 w-auto mx-auto object-contain drop-shadow-xl" />
        <p className="text-xs text-slate-400 font-medium">
          Private Cloud Storage & File Management Platform &bull; NKB Manufacturing
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4">
        <div className="bg-white py-8 px-6 shadow-xl rounded-lg sm:px-10 border border-slate-200">
          <form className="space-y-5" onSubmit={handleSubmit}>
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded text-xs flex items-center space-x-2">
                <ShieldAlert className="w-4 h-4 text-red-600 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Username or Work Email
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="admin@nkbmanufacturing.com"
                  className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-nkb-gold-500 focus:outline-none text-slate-800"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-nkb-gold-500 focus:outline-none text-slate-800"
                />
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 bg-nkb-navy-900 hover:bg-nkb-navy-800 text-white font-bold rounded text-xs shadow transition flex items-center justify-center space-x-2 disabled:opacity-50"
              >
                <span>{loading ? 'Authenticating...' : 'Sign In to NKB Cloud'}</span>
                {!loading && <ArrowRight className="w-4 h-4 text-nkb-gold-400" />}
              </button>
            </div>
          </form>

          <div className="mt-6 pt-5 border-t border-slate-100 text-center">
            <p className="text-[11px] text-slate-500">
              Default Super Admin credentials are pre-filled for first login.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
