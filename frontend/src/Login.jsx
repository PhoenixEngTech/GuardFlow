import React, { useState } from 'react';
import { useAuth } from './context/AuthContext';
import { Shield, Lock, User, Eye, EyeOff, Loader2 } from 'lucide-react';

export default function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const formData = new URLSearchParams();
    formData.append('username', username);
    formData.append('password', password);

           try {
      // PROXIED RELATIVE LINK: Bypasses raw IP numbers and domain names entirely
      const response = await fetch('/api/v1/login/access-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'Authentication execution failure.');
      }

      login(data.access_token, data.role);
      alert(`Access authorized as: ${data.role.toUpperCase()}`);
    } catch (err) {
      setError(err.message || 'Network communication timeout.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-tactical-bg flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-tactical-panel border border-tactical-border rounded-xl p-8 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-600 to-indigo-500" />
        
        <div className="flex flex-col items-center mb-8">
          <div className="bg-blue-600/10 p-3 rounded-lg border border-blue-500/20 mb-3">
            <Shield className="w-8 h-8 text-tactical-accent" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">GuardFlow Core</h1>
          <p className="text-sm text-gray-400 mt-1">Tshenolo PI Operational Gateway</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-950/40 border border-red-800/40 text-red-200 text-sm rounded-lg flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Operator Username</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-500">
                <User className="w-4 h-4" />
              </span>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter system username"
                className="w-full bg-tactical-bg border border-tactical-border rounded-lg py-2.5 pl-10 pr-4 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-tactical-accent transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Security Keyphrase</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-500">
                <Lock className="w-4 h-4" />
              </span>
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter secure passcode"
                className="w-full bg-tactical-bg border border-tactical-border rounded-lg py-2.5 pl-10 pr-10 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-tactical-accent transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-500 hover:text-gray-300"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-tactical-accent hover:bg-blue-700 text-white rounded-lg py-2.5 font-medium text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-2 shadow-lg shadow-blue-500/10"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Verifying Credentials...</span>
              </>
            ) : (
              <span>Authorize Connection</span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
