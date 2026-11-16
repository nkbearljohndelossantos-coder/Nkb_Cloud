import React, { useState, useEffect } from 'react';
import { Shield, Building2, User, Mail, Lock, CheckCircle2, AlertTriangle, ArrowRight, ArrowLeft, Loader2, Sparkles } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';

export default function RegisterView({ initialToken = '', onBackToLogin }) {
  const { register } = useAuth();
  const [token, setToken] = useState(initialToken);
  const [tokenStatus, setTokenStatus] = useState('VALIDATING'); // 'VALIDATING', 'VALID', 'INVALID'
  const [tokenError, setTokenError] = useState(null);
  const [inviteDetails, setInviteDetails] = useState(null);

  // Form Fields
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Submit states
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);
  const [success, setSuccess] = useState(false);

  // Validate token with server
  const validateToken = async (tok) => {
    if (!tok || !tok.trim()) {
      setTokenStatus('INVALID');
      setTokenError('No invitation token provided. Registration requires an invite link from an NKB Administrator.');
      return;
    }

    setTokenStatus('VALIDATING');
    setTokenError(null);

    try {
      const res = await api.get(`/auth/invite/${tok.trim()}`);
      if (res.data.valid) {
        setInviteDetails(res.data);
        setTokenStatus('VALID');
      } else {
        setTokenStatus('INVALID');
        setTokenError('Invitation link is invalid or expired.');
      }
    } catch (err) {
      setTokenStatus('INVALID');
      setTokenError(err.response?.data?.error || 'Invalid or expired invitation link. Please request a new invite from your administrator.');
    }
  };

  useEffect(() => {
    // If no initialToken was passed as prop, check URL query parameters
    let activeToken = initialToken;
    if (!activeToken) {
      const urlParams = new URLSearchParams(window.location.search);
      activeToken = urlParams.get('token') || urlParams.get('invite') || '';
    }
    setToken(activeToken);
    validateToken(activeToken);
  }, [initialToken]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError(null);

    if (password !== confirmPassword) {
      setFormError('Passwords do not match. Please verify.');
      return;
    }

    if (password.length < 6) {
      setFormError('Password must be at least 6 characters long.');
      return;
    }

    setSubmitting(true);

    try {
      await register({
        token,
        username,
        email,
        fullName,
        password
      });
      setSuccess(true);
      // AuthContext will automatically update user state, transitioning App to authenticated view
    } catch (err) {
      setFormError(err.response?.data?.error || err.message || 'Registration failed.');
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8 select-none">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center space-y-3">
        <img src="/logo.png" alt="NKB Cloud Logo" className="h-24 w-auto mx-auto object-contain drop-shadow-xl" />
        <h2 className="text-xl font-bold text-white tracking-wide">
          NKB Cloud Account Registration
        </h2>
        <p className="text-xs text-slate-400 font-medium">
          Authorized Registration Portal &bull; NKB Manufacturing
        </p>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-lg px-4">
        <div className="bg-white py-8 px-6 shadow-2xl rounded-xl sm:px-10 border border-slate-200">

          {/* Validating Invitation Token */}
          {tokenStatus === 'VALIDATING' && (
            <div className="py-12 text-center space-y-3">
              <Loader2 className="w-8 h-8 text-nkb-gold-500 animate-spin mx-auto" />
              <p className="text-sm font-semibold text-slate-700">Verifying invitation link...</p>
              <p className="text-xs text-slate-400">Connecting to NKB Cloud authentication authority</p>
            </div>
          )}

          {/* Invalid Invitation Token */}
          {tokenStatus === 'INVALID' && (
            <div className="space-y-6">
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-center space-y-2">
                <AlertTriangle className="w-8 h-8 text-red-600 mx-auto" />
                <h3 className="text-sm font-bold text-red-900">Invitation Link Required</h3>
                <p className="text-xs text-red-700 leading-relaxed">
                  {tokenError || 'Public open registration is restricted. You must have a valid invitation link shared by an NKB IT Administrator.'}
                </p>
              </div>

              <div className="space-y-3">
                <label className="block text-xs font-semibold text-slate-700">
                  Have an invite token? Paste it below:
                </label>
                <div className="flex space-x-2">
                  <input
                    type="text"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="Paste invite token here..."
                    className="flex-1 px-3 py-2 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-nkb-gold-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => validateToken(token)}
                    className="px-4 py-2 bg-nkb-navy-900 hover:bg-nkb-navy-800 text-white rounded text-xs font-semibold"
                  >
                    Verify
                  </button>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 text-center">
                <button
                  type="button"
                  onClick={onBackToLogin}
                  className="inline-flex items-center space-x-1.5 text-xs text-slate-600 hover:text-nkb-navy-900 font-semibold"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Return to Sign In</span>
                </button>
              </div>
            </div>
          )}

          {/* Valid Invitation Token: Show Pre-Set Role/Department & Registration Form */}
          {tokenStatus === 'VALID' && inviteDetails && (
            <form className="space-y-5" onSubmit={handleSubmit}>
              {/* Invitation Verified Badge */}
              <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="flex items-center space-x-2 text-amber-900 font-bold text-xs mb-2">
                  <Sparkles className="w-4 h-4 text-amber-600" />
                  <span>Admin Invitation Verified</span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-white p-2 rounded border border-amber-100 flex items-center space-x-2">
                    <Building2 className="w-4 h-4 text-slate-500 flex-shrink-0" />
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Department</span>
                      <span className="font-semibold text-slate-800 truncate block">
                        {inviteDetails.departmentName || 'General'}
                      </span>
                    </div>
                  </div>

                  <div className="bg-white p-2 rounded border border-amber-100 flex items-center space-x-2">
                    <Shield className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Assigned Role</span>
                      <span className="font-semibold text-emerald-700 truncate block">
                        {inviteDetails.roleName}
                      </span>
                    </div>
                  </div>
                </div>

                {inviteDetails.note && (
                  <p className="mt-2 text-[11px] text-amber-800 italic">
                    Note: "{inviteDetails.note}"
                  </p>
                )}
              </div>

              {formError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded text-xs flex items-center space-x-2">
                  <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Form Input Fields */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Full Name
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. John Doe"
                    className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-nkb-gold-500 focus:outline-none text-slate-800"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Username
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase().trim())}
                    placeholder="e.g. jdoe"
                    className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-nkb-gold-500 focus:outline-none text-slate-800"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Work Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value.toLowerCase().trim())}
                    placeholder="e.g. jdoe@nkbmanufacturing.com"
                    className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-nkb-gold-500 focus:outline-none text-slate-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                      placeholder="Min. 6 characters"
                      className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-nkb-gold-500 focus:outline-none text-slate-800"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Confirm Password
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="password"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Repeat password"
                      className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-nkb-gold-500 focus:outline-none text-slate-800"
                    />
                  </div>
                </div>
              </div>

              <div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-2.5 px-4 bg-nkb-navy-900 hover:bg-nkb-navy-800 text-white font-bold rounded text-xs shadow transition flex items-center justify-center space-x-2 disabled:opacity-50"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-nkb-gold-400" />
                      <span>Creating Account...</span>
                    </>
                  ) : (
                    <>
                      <span>Complete Registration & Sign In</span>
                      <ArrowRight className="w-4 h-4 text-nkb-gold-400" />
                    </>
                  )}
                </button>
              </div>

              <div className="pt-4 border-t border-slate-100 text-center">
                <button
                  type="button"
                  onClick={onBackToLogin}
                  className="text-xs text-slate-500 hover:text-slate-800 font-medium"
                >
                  Already have an account? <span className="text-nkb-gold-600 font-bold underline">Sign In</span>
                </button>
              </div>
            </form>
          )}

        </div>
      </div>
    </div>
  );
}
