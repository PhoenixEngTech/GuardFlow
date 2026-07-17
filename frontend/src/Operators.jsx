import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  UserCog,
  UserRoundCheck,
  UserRoundX,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from './context/AuthContext';

const API_URL = (
  import.meta.env.VITE_API_URL ||
  'https://guardflow-production.up.railway.app'
).replace(/\/$/, '');

async function readResponse(response) {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return { detail: text };
  }
}

function formatDateTime(value) {
  if (!value) {
    return 'Not recorded';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Not recorded';
  }

  return date.toLocaleString();
}

function OperatorFormModal({
  mode,
  operator,
  saving,
  error,
  onClose,
  onSubmit,
}) {
  const isCreateMode = mode === 'create';

  const [username, setUsername] = useState(operator?.username || '');
  const [email, setEmail] = useState(operator?.email || '');
  const [role, setRole] = useState(operator?.role || 'dispatcher');
  const [isActive, setIsActive] = useState(operator?.is_active ?? true);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [validationError, setValidationError] = useState('');

  useEffect(() => {
    setUsername(operator?.username || '');
    setEmail(operator?.email || '');
    setRole(operator?.role || 'dispatcher');
    setIsActive(operator?.is_active ?? true);
    setPassword('');
    setValidationError('');
  }, [operator, mode]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setValidationError('');

    const cleanUsername = username.trim();
    const cleanEmail = email.trim().toLowerCase();

    if (cleanUsername.length < 3) {
      setValidationError('Username must contain at least 3 characters.');
      return;
    }

    if (!cleanEmail) {
      setValidationError('Email address is required.');
      return;
    }

    if (isCreateMode && password.length < 12) {
      setValidationError('Password must contain at least 12 characters.');
      return;
    }

    try {
      await onSubmit({
        username: cleanUsername,
        email: cleanEmail,
        role,
        is_active: isActive,
        ...(isCreateMode ? { password } : {}),
      });
    } catch {
      // The parent displays the API error.
    }
  };

  return (
    <div className="fixed inset-0 z-[1200] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-tactical-panel border border-tactical-border rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-6 py-5 border-b border-tactical-border flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-tactical-accent font-bold">
              Operator Management
            </p>
            <h2 className="text-lg font-bold text-white mt-1">
              {isCreateMode ? 'Create Operator' : 'Edit Operator'}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-tactical-border/40 transition-colors disabled:opacity-50"
            aria-label="Close operator form"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {(validationError || error) && (
            <div className="p-3 bg-red-950/30 border border-red-800/40 text-red-200 text-xs rounded-lg">
              {validationError || error}
            </div>
          )}

          <div>
            <label
              htmlFor="operator-username"
              className="block text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-2"
            >
              Username
            </label>
            <input
              id="operator-username"
              type="text"
              required
              disabled={saving}
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="e.g. field_agent_01"
              className="w-full bg-tactical-bg border border-tactical-border rounded-lg py-2.5 px-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-tactical-accent disabled:opacity-60"
            />
          </div>

          <div>
            <label
              htmlFor="operator-email"
              className="block text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-2"
            >
              Email Address
            </label>
            <input
              id="operator-email"
              type="email"
              required
              disabled={saving}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="operator@company.co.za"
              className="w-full bg-tactical-bg border border-tactical-border rounded-lg py-2.5 px-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-tactical-accent disabled:opacity-60"
            />
          </div>

          {isCreateMode && (
            <div>
              <label
                htmlFor="operator-password"
                className="block text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-2"
              >
                Temporary Password
              </label>

              <div className="relative">
                <input
                  id="operator-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={12}
                  disabled={saving}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Minimum 12 characters"
                  className="w-full bg-tactical-bg border border-tactical-border rounded-lg py-2.5 pl-3 pr-11 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-tactical-accent disabled:opacity-60"
                />

                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  disabled={saving}
                  className="absolute inset-y-0 right-0 px-3 text-gray-500 hover:text-white disabled:opacity-50"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>

              <p className="text-[10px] text-gray-500 mt-1.5">
                Share the temporary password securely and ask the operator to
                change it after first login.
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="operator-role"
                className="block text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-2"
              >
                Operator Role
              </label>
              <select
                id="operator-role"
                disabled={saving}
                value={role}
                onChange={(event) => setRole(event.target.value)}
                className="w-full bg-tactical-bg border border-tactical-border rounded-lg py-2.5 px-3 text-sm text-white focus:outline-none focus:border-tactical-accent disabled:opacity-60"
              >
                <option value="admin">Administrator</option>
                <option value="dispatcher">Dispatcher</option>
                <option value="investigator">Investigator</option>
              </select>
            </div>

            <div>
              <span className="block text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-2">
                Account Status
              </span>

              <label className="h-[42px] bg-tactical-bg border border-tactical-border rounded-lg px-3 flex items-center justify-between gap-3 cursor-pointer">
                <span className="text-sm text-white">
                  {isActive ? 'Active' : 'Inactive'}
                </span>

                <input
                  type="checkbox"
                  disabled={saving}
                  checked={isActive}
                  onChange={(event) => setIsActive(event.target.checked)}
                  className="w-4 h-4 accent-blue-600"
                />
              </label>
            </div>
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2.5 rounded-lg border border-tactical-border text-gray-300 hover:text-white hover:bg-tactical-border/30 text-xs font-semibold transition-colors disabled:opacity-50"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving operator...</span>
                </>
              ) : (
                <>
                  {isCreateMode ? (
                    <Plus className="w-3.5 h-3.5" />
                  ) : (
                    <Pencil className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {isCreateMode ? 'Create Operator' : 'Save Changes'}
                  </span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PasswordResetModal({
  operator,
  saving,
  error,
  onClose,
  onSubmit,
}) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [validationError, setValidationError] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    setValidationError('');

    if (newPassword.length < 12) {
      setValidationError('Password must contain at least 12 characters.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setValidationError('The two passwords do not match.');
      return;
    }

    try {
      await onSubmit(newPassword);
    } catch {
      // The parent displays the API error.
    }
  };

  return (
    <div className="fixed inset-0 z-[1200] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-tactical-panel border border-tactical-border rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-6 py-5 border-b border-tactical-border flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-yellow-400 font-bold">
              Security Control
            </p>
            <h2 className="text-lg font-bold text-white mt-1">
              Reset Operator Password
            </h2>
            <p className="text-xs text-gray-500 mt-1">
              {operator?.username}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-tactical-border/40 transition-colors disabled:opacity-50"
            aria-label="Close password reset"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {(validationError || error) && (
            <div className="p-3 bg-red-950/30 border border-red-800/40 text-red-200 text-xs rounded-lg">
              {validationError || error}
            </div>
          )}

          <div>
            <label
              htmlFor="new-operator-password"
              className="block text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-2"
            >
              New Password
            </label>

            <div className="relative">
              <input
                id="new-operator-password"
                type={showPassword ? 'text' : 'password'}
                required
                minLength={12}
                disabled={saving}
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder="Minimum 12 characters"
                className="w-full bg-tactical-bg border border-tactical-border rounded-lg py-2.5 pl-3 pr-11 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-tactical-accent disabled:opacity-60"
              />

              <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                disabled={saving}
                className="absolute inset-y-0 right-0 px-3 text-gray-500 hover:text-white disabled:opacity-50"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          <div>
            <label
              htmlFor="confirm-operator-password"
              className="block text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-2"
            >
              Confirm New Password
            </label>
            <input
              id="confirm-operator-password"
              type={showPassword ? 'text' : 'password'}
              required
              minLength={12}
              disabled={saving}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="w-full bg-tactical-bg border border-tactical-border rounded-lg py-2.5 px-3 text-sm text-white focus:outline-none focus:border-tactical-accent disabled:opacity-60"
            />
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2.5 rounded-lg border border-tactical-border text-gray-300 hover:text-white hover:bg-tactical-border/30 text-xs font-semibold transition-colors disabled:opacity-50"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2.5 rounded-lg bg-yellow-600 hover:bg-yellow-700 text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Resetting password...</span>
                </>
              ) : (
                <>
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>Reset Password</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Operators() {
  const { token, user, logout } = useAuth();

  const [operators, setOperators] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const [formMode, setFormMode] = useState(null);
  const [selectedOperator, setSelectedOperator] = useState(null);
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const [passwordOperator, setPasswordOperator] = useState(null);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState('');

  const request = useCallback(
    async (path, options = {}) => {
      const response = await fetch(`${API_URL}${path}`, {
        ...options,
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
          ...(options.body ? { 'Content-Type': 'application/json' } : {}),
          ...(options.headers || {}),
        },
      });

      const data = await readResponse(response);

      if (response.status === 401) {
        logout();
        throw new Error('Your session expired. Please sign in again.');
      }

      if (!response.ok) {
        throw new Error(
          data?.detail ||
            `GuardFlow request failed with ${response.status}.`
        );
      }

      return data;
    },
    [logout, token]
  );

  const fetchOperators = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const data = await request('/api/v1/operators/');
      setOperators(Array.isArray(data) ? data : []);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Unable to load operator profiles.'
      );
    } finally {
      setLoading(false);
    }
  }, [request]);

  useEffect(() => {
    fetchOperators();
  }, [fetchOperators]);

  const filteredOperators = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    if (!query) {
      return operators;
    }

    return operators.filter((operator) =>
      [
        operator.username,
        operator.email,
        operator.role,
        operator.id,
        operator.is_active ? 'active' : 'inactive',
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    );
  }, [operators, searchTerm]);

  const metrics = useMemo(() => {
    return {
      total: operators.length,
      active: operators.filter((operator) => operator.is_active).length,
      inactive: operators.filter((operator) => !operator.is_active).length,
      admins: operators.filter((operator) => operator.role === 'admin').length,
    };
  }, [operators]);

  const closeOperatorForm = () => {
    setFormMode(null);
    setSelectedOperator(null);
    setFormError('');
  };

  const openCreateForm = () => {
    setSelectedOperator(null);
    setFormError('');
    setFormMode('create');
  };

  const openEditForm = (operator) => {
    setSelectedOperator(operator);
    setFormError('');
    setFormMode('edit');
  };

  const handleOperatorSubmit = async (payload) => {
    setFormSaving(true);
    setFormError('');

    try {
      if (formMode === 'create') {
        await request('/api/v1/operators/', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      } else if (selectedOperator) {
        await request(`/api/v1/operators/${selectedOperator.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      }

      closeOperatorForm();
      await fetchOperators();
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : 'Unable to save the operator profile.';

      setFormError(message);
      throw requestError;
    } finally {
      setFormSaving(false);
    }
  };

  const openPasswordReset = (operator) => {
    setPasswordOperator(operator);
    setPasswordError('');
  };

  const closePasswordReset = () => {
    setPasswordOperator(null);
    setPasswordError('');
  };

  const handlePasswordReset = async (newPassword) => {
    if (!passwordOperator) {
      return;
    }

    setPasswordSaving(true);
    setPasswordError('');

    try {
      await request(
        `/api/v1/operators/${passwordOperator.id}/reset-password`,
        {
          method: 'POST',
          body: JSON.stringify({
            new_password: newPassword,
          }),
        }
      );

      closePasswordReset();
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : 'Unable to reset the operator password.';

      setPasswordError(message);
      throw requestError;
    } finally {
      setPasswordSaving(false);
    }
  };

  const metricCards = [
    {
      label: 'Total Operators',
      value: metrics.total,
      icon: Users,
      className: 'text-blue-400',
    },
    {
      label: 'Active Profiles',
      value: metrics.active,
      icon: UserRoundCheck,
      className: 'text-green-400',
    },
    {
      label: 'Inactive Profiles',
      value: metrics.inactive,
      icon: UserRoundX,
      className: 'text-red-400',
    },
    {
      label: 'Administrators',
      value: metrics.admins,
      icon: ShieldCheck,
      className: 'text-yellow-400',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {metricCards.map((metric) => {
          const Icon = metric.icon;

          return (
            <div
              key={metric.label}
              className="bg-tactical-panel border border-tactical-border rounded-xl p-5 flex items-center justify-between"
            >
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                  {metric.label}
                </p>
                <p className={`text-2xl font-bold mt-1 ${metric.className}`}>
                  {metric.value}
                </p>
              </div>

              <div className="p-3 bg-tactical-bg border border-tactical-border rounded-xl">
                <Icon className={`w-5 h-5 ${metric.className}`} />
              </div>
            </div>
          );
        })}
      </div>

      <section className="bg-tactical-panel border border-tactical-border rounded-xl overflow-hidden shadow-xl">
        <div className="p-5 border-b border-tactical-border flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              Operator Registry
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              Create, edit, activate and secure GuardFlow operator accounts.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative w-full sm:w-72">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-500">
                <Search className="w-3.5 h-3.5" />
              </span>
              <input
                type="text"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search operators..."
                className="w-full bg-tactical-bg border border-tactical-border rounded-lg py-2 pl-9 pr-4 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-tactical-accent"
              />
            </div>

            <button
              type="button"
              onClick={fetchOperators}
              disabled={loading}
              className="px-3 py-2 rounded-lg border border-tactical-border text-gray-400 hover:text-white hover:bg-tactical-border/30 flex items-center justify-center transition-colors disabled:opacity-50"
              aria-label="Refresh operators"
            >
              <RefreshCw
                className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}
              />
            </button>

            <button
              type="button"
              onClick={openCreateForm}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Operator</span>
            </button>
          </div>
        </div>

        <div className="p-5">
          {loading ? (
            <div className="py-14 flex flex-col items-center justify-center gap-3 text-gray-400">
              <Loader2 className="w-6 h-6 animate-spin text-tactical-accent" />
              <p className="text-xs">Loading operator profiles...</p>
            </div>
          ) : error ? (
            <div className="p-4 bg-red-950/20 border border-red-800/30 text-red-300 text-xs rounded-xl text-center">
              {error}
            </div>
          ) : filteredOperators.length === 0 ? (
            <div className="py-14 text-center text-gray-500">
              <UserCog className="w-9 h-9 mx-auto mb-3 text-gray-600" />
              <p className="text-sm font-medium">No operators found.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 2xl:grid-cols-2 gap-4">
              {filteredOperators.map((operator) => {
                const isCurrentOperator = operator.id === user?.id;

                return (
                  <article
                    key={operator.id}
                    className="bg-tactical-bg border border-tactical-border rounded-xl p-5 space-y-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-base font-bold text-white break-all">
                            {operator.username}
                          </h4>

                          {isCurrentOperator && (
                            <span className="text-[9px] uppercase font-bold tracking-wider text-blue-300 bg-blue-600/10 border border-blue-500/20 px-2 py-0.5 rounded-full">
                              Current session
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-gray-400 mt-1 break-all">
                          {operator.email}
                        </p>
                      </div>

                      <span
                        className={`text-[10px] uppercase font-bold px-2.5 py-1 rounded-full border ${
                          operator.is_active
                            ? 'text-green-400 bg-green-950/30 border-green-800/40'
                            : 'text-red-400 bg-red-950/30 border-red-800/40'
                        }`}
                      >
                        {operator.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="bg-tactical-panel/40 border border-tactical-border/70 rounded-lg p-3">
                        <p className="text-[9px] uppercase tracking-wider font-bold text-gray-500">
                          Role
                        </p>
                        <p className="text-xs font-semibold text-tactical-accent mt-1 capitalize">
                          {operator.role}
                        </p>
                      </div>

                      <div className="bg-tactical-panel/40 border border-tactical-border/70 rounded-lg p-3">
                        <p className="text-[9px] uppercase tracking-wider font-bold text-gray-500">
                          Created
                        </p>
                        <p className="text-xs text-gray-300 mt-1">
                          {formatDateTime(operator.created_at)}
                        </p>
                      </div>
                    </div>

                    <div className="bg-tactical-panel/30 border border-tactical-border/60 rounded-lg p-3">
                      <p className="text-[9px] uppercase tracking-wider font-bold text-gray-500">
                        Operator ID
                      </p>
                      <p className="text-[10px] font-mono text-gray-400 mt-1 break-all">
                        {operator.id}
                      </p>
                    </div>

                    <div className="pt-3 border-t border-tactical-border/60 flex flex-col sm:flex-row sm:justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => openPasswordReset(operator)}
                        className="px-3 py-2 rounded-lg border border-yellow-700/40 text-yellow-300 hover:bg-yellow-950/30 text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
                      >
                        <KeyRound className="w-3.5 h-3.5" />
                        <span>Reset Password</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => openEditForm(operator)}
                        className="px-3 py-2 rounded-lg bg-blue-600/10 border border-blue-500/30 text-blue-300 hover:bg-blue-600 hover:text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        <span>Edit Operator</span>
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {formMode && (
        <OperatorFormModal
          mode={formMode}
          operator={selectedOperator}
          saving={formSaving}
          error={formError}
          onClose={closeOperatorForm}
          onSubmit={handleOperatorSubmit}
        />
      )}

      {passwordOperator && (
        <PasswordResetModal
          operator={passwordOperator}
          saving={passwordSaving}
          error={passwordError}
          onClose={closePasswordReset}
          onSubmit={handlePasswordReset}
        />
      )}
    </div>
  );
}
