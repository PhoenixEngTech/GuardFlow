import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './Login';
import Tracking from './Tracking';
import VisionFlow from './VisionFlow';
import {
  Activity,
  AlertTriangle,
  Briefcase,
  CheckCircle,
  Clock,
  Eye,
  FolderOpen,
  Loader2,
  LogOut,
  Pencil,
  Plus,
  Save,
  Radio,
  RefreshCw,
  Search,
  Shield,
  UserCheck,
  X,
} from 'lucide-react';

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

function normaliseList(data) {
  if (Array.isArray(data)) {
    return data;
  }

  if (Array.isArray(data?.items)) {
    return data.items;
  }

  return [];
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

function CaseDetailModal({
  caseFile,
  loading,
  error,
  canEdit,
  saving,
  onClose,
  onRetry,
  onSave,
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editStatus, setEditStatus] = useState('open');
  const [editOperatorId, setEditOperatorId] = useState('');
  const [editError, setEditError] = useState('');

  useEffect(() => {
    if (!caseFile) {
      return;
    }

    setEditTitle(caseFile.title || '');
    setEditDescription(caseFile.description || '');
    setEditStatus(caseFile.status || 'open');
    setEditOperatorId(caseFile.assigned_operator_id || '');
    setEditError('');
    setIsEditing(false);
  }, [caseFile]);

  const cancelEditing = () => {
    setEditTitle(caseFile?.title || '');
    setEditDescription(caseFile?.description || '');
    setEditStatus(caseFile?.status || 'open');
    setEditOperatorId(caseFile?.assigned_operator_id || '');
    setEditError('');
    setIsEditing(false);
  };

  const handleSave = async (event) => {
    event.preventDefault();
    setEditError('');

    const cleanTitle = editTitle.trim();

    if (!cleanTitle) {
      setEditError('Case title cannot be empty.');
      return;
    }

    try {
      await onSave({
        title: cleanTitle,
        description: editDescription.trim() || null,
        status: editStatus,
        assigned_operator_id: editOperatorId.trim() || null,
      });

      setIsEditing(false);
    } catch (requestError) {
      setEditError(
        requestError instanceof Error
          ? requestError.message
          : 'Unable to update the case file.'
      );
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-3xl max-h-[92vh] bg-tactical-panel border border-tactical-border rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        <div className="px-6 py-5 border-b border-tactical-border bg-tactical-panel/70 flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.22em] text-tactical-accent font-bold">
              Investigative Case File
            </p>

            <h2 className="text-xl font-bold text-white mt-1">
              {caseFile?.title || 'Loading case record...'}
            </h2>

            {caseFile?.case_number && (
              <p className="text-xs text-gray-400 mt-1">
                {caseFile.case_number}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-tactical-border/40 transition-colors disabled:opacity-50"
            aria-label="Close case details"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto">
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center gap-3 text-gray-400">
              <Loader2 className="w-7 h-7 animate-spin text-tactical-accent" />
              <p className="text-sm">Loading full case record...</p>
            </div>
          ) : error ? (
            <div className="py-12 text-center">
              <div className="max-w-md mx-auto p-4 bg-red-950/20 border border-red-800/30 text-red-300 text-sm rounded-xl">
                {error}
              </div>

              <button
                type="button"
                onClick={onRetry}
                className="mt-4 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors"
              >
                Retry
              </button>
            </div>
          ) : caseFile && isEditing ? (
            <form onSubmit={handleSave} className="space-y-5">
              {editError && (
                <div className="p-3 bg-red-950/30 border border-red-800/40 text-red-200 text-xs rounded-lg">
                  {editError}
                </div>
              )}

              <div>
                <label
                  htmlFor="edit-case-title"
                  className="block text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-2"
                >
                  Case Title
                </label>

                <input
                  id="edit-case-title"
                  type="text"
                  required
                  disabled={saving}
                  value={editTitle}
                  onChange={(event) => setEditTitle(event.target.value)}
                  className="w-full bg-tactical-bg border border-tactical-border rounded-lg py-2.5 px-3 text-sm text-white focus:outline-none focus:border-tactical-accent disabled:opacity-60"
                />
              </div>

              <div>
                <label
                  htmlFor="edit-case-description"
                  className="block text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-2"
                >
                  Operational Description
                </label>

                <textarea
                  id="edit-case-description"
                  rows={5}
                  disabled={saving}
                  value={editDescription}
                  onChange={(event) =>
                    setEditDescription(event.target.value)
                  }
                  className="w-full bg-tactical-bg border border-tactical-border rounded-lg py-2.5 px-3 text-sm text-white focus:outline-none focus:border-tactical-accent resize-none disabled:opacity-60"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="edit-case-status"
                    className="block text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-2"
                  >
                    Current Status
                  </label>

                  <select
                    id="edit-case-status"
                    disabled={saving}
                    value={editStatus}
                    onChange={(event) => setEditStatus(event.target.value)}
                    className="w-full bg-tactical-bg border border-tactical-border rounded-lg py-2.5 px-3 text-sm text-white focus:outline-none focus:border-tactical-accent disabled:opacity-60"
                  >
                    <option value="open">Open</option>
                    <option value="assigned">Assigned</option>
                    <option value="active">Active</option>
                    <option value="investigating">Investigating</option>
                    <option value="suspended">Suspended</option>
                    <option value="resolved">Resolved</option>
                    <option value="closed">Closed</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="edit-operator-id"
                    className="block text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-2"
                  >
                    Assigned Operator ID
                  </label>

                  <input
                    id="edit-operator-id"
                    type="text"
                    disabled={saving}
                    value={editOperatorId}
                    onChange={(event) =>
                      setEditOperatorId(event.target.value)
                    }
                    placeholder="Leave blank to unassign"
                    className="w-full bg-tactical-bg border border-tactical-border rounded-lg py-2.5 px-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-tactical-accent disabled:opacity-60"
                  />
                </div>
              </div>

              <p className="text-[11px] text-gray-500">
                Operator selection will become a searchable dropdown when the
                operator-management module is added. For now, enter a valid
                operator ID such as admin-001, or leave it blank to unassign.
              </p>

              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={cancelEditing}
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
                      <span>Saving changes...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5" />
                      <span>Save Case Changes</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          ) : caseFile ? (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-xs font-bold text-tactical-accent bg-blue-950/50 border border-blue-900/40 px-3 py-1.5 rounded-md tracking-wider">
                    {caseFile.case_number}
                  </span>

                  <span className="text-[11px] font-semibold text-green-400 bg-green-950/40 border border-green-900/40 px-2.5 py-1 rounded-full capitalize">
                    {caseFile.status || 'open'}
                  </span>
                </div>

                {canEdit && (
                  <button
                    type="button"
                    onClick={() => setIsEditing(true)}
                    className="px-3 py-2 rounded-lg bg-blue-600/10 border border-blue-500/30 text-blue-300 hover:bg-blue-600 hover:text-white text-xs font-bold flex items-center gap-2 transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    <span>Edit Case</span>
                  </button>
                )}
              </div>

              <section>
                <p className="text-[10px] uppercase tracking-wider font-bold text-gray-500 mb-2">
                  Operational Description
                </p>

                <div className="bg-tactical-bg border border-tactical-border rounded-xl p-4">
                  <p className="text-sm text-gray-300 leading-6 whitespace-pre-wrap">
                    {caseFile.description ||
                      'No operational description has been recorded for this case.'}
                  </p>
                </div>
              </section>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-tactical-bg border border-tactical-border rounded-xl p-4">
                  <p className="text-[10px] uppercase tracking-wider font-bold text-gray-500">
                    Assigned Operator
                  </p>

                  <div className="flex items-center gap-2 mt-2">
                    <UserCheck className="w-4 h-4 text-tactical-accent" />
                    <p className="text-sm font-semibold text-white break-all">
                      {caseFile.assigned_operator_id || 'Unassigned'}
                    </p>
                  </div>
                </div>

                <div className="bg-tactical-bg border border-tactical-border rounded-xl p-4">
                  <p className="text-[10px] uppercase tracking-wider font-bold text-gray-500">
                    Date Created
                  </p>

                  <div className="flex items-center gap-2 mt-2">
                    <Clock className="w-4 h-4 text-yellow-400" />
                    <p className="text-sm font-semibold text-white">
                      {formatDateTime(caseFile.created_at)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-tactical-bg border border-tactical-border rounded-xl p-4">
                <p className="text-[10px] uppercase tracking-wider font-bold text-gray-500">
                  Internal Record ID
                </p>

                <p className="text-xs font-mono text-gray-300 mt-2 break-all">
                  {caseFile.id}
                </p>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function CaseDashboard({
  cases,
  loading,
  error,
  onOpenCase,
}) {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredCases = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    if (!query) {
      return cases;
    }

    return cases.filter((caseFile) =>
      [
        caseFile.case_number,
        caseFile.title,
        caseFile.description,
        caseFile.status,
        caseFile.assigned_operator_id,
      ]
        .filter(Boolean)
        .some((value) =>
          String(value).toLowerCase().includes(query)
        )
    );
  }, [cases, searchTerm]);

  const metrics = useMemo(() => {
    const resolvedStatuses = new Set([
      'resolved',
      'closed',
      'completed',
      'archived',
    ]);

    const activeStatuses = new Set([
      'active',
      'in_progress',
      'investigating',
      'assigned',
    ]);

    const resolved = cases.filter((caseFile) =>
      resolvedStatuses.has(
        String(caseFile.status || '').toLowerCase()
      )
    ).length;

    const active = cases.filter((caseFile) =>
      activeStatuses.has(
        String(caseFile.status || '').toLowerCase()
      )
    ).length;

    return {
      total: cases.length,
      open: Math.max(cases.length - resolved, 0),
      active,
      resolved,
    };
  }, [cases]);

  const metricCards = [
    {
      label: 'Total Files',
      value: metrics.total,
      icon: Briefcase,
      valueClass: 'text-white',
      iconClass: 'text-tactical-accent',
      iconBackground: 'bg-blue-600/10 border-blue-500/10',
    },
    {
      label: 'Open Cases',
      value: metrics.open,
      icon: AlertTriangle,
      valueClass: 'text-yellow-400',
      iconClass: 'text-yellow-400',
      iconBackground:
        'bg-yellow-600/10 border-yellow-500/10',
    },
    {
      label: 'Active',
      value: metrics.active,
      icon: Activity,
      valueClass: 'text-blue-400',
      iconClass: 'text-blue-400',
      iconBackground: 'bg-blue-600/10 border-blue-500/10',
    },
    {
      label: 'Resolved',
      value: metrics.resolved,
      icon: CheckCircle,
      valueClass: 'text-green-400',
      iconClass: 'text-green-400',
      iconBackground:
        'bg-green-600/10 border-green-500/10',
    },
  ];

  return (
    <>
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

                <h3
                  className={`text-2xl font-bold mt-1 ${metric.valueClass}`}
                >
                  {metric.value}
                </h3>
              </div>

              <div
                className={`p-3 border rounded-xl ${metric.iconBackground} ${metric.iconClass}`}
              >
                <Icon className="w-5 h-5" />
              </div>
            </div>
          );
        })}
      </div>

      <div className="bg-tactical-panel border border-tactical-border rounded-xl overflow-hidden shadow-xl">
        <div className="p-5 border-b border-tactical-border bg-tactical-panel/40 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-white tracking-wide uppercase">
            Case Registries Log
          </h3>

          <div className="relative w-full md:w-72">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-500">
              <Search className="w-3.5 h-3.5" />
            </span>

            <input
              type="text"
              value={searchTerm}
              onChange={(event) =>
                setSearchTerm(event.target.value)
              }
              placeholder="Filter cases..."
              className="w-full bg-tactical-bg border border-tactical-border rounded-lg py-2 pl-9 pr-4 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-tactical-accent"
            />
          </div>
        </div>

        <div className="p-5">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center text-gray-400 gap-3">
              <RefreshCw className="w-6 h-6 animate-spin text-tactical-accent" />
              <span className="text-xs font-medium">
                Synchronising case records...
              </span>
            </div>
          ) : error ? (
            <div className="p-4 bg-red-950/20 border border-red-800/30 text-red-300 text-xs rounded-xl text-center">
              Sync error: {error}
            </div>
          ) : filteredCases.length === 0 ? (
            <div className="py-14 text-center text-gray-500">
              <FolderOpen className="w-9 h-9 mx-auto mb-3 text-gray-600" />
              <p className="text-sm font-medium">
                No matching case files found.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 2xl:grid-cols-2 gap-4">
              {filteredCases.map((caseFile) => {
                const createdAt = caseFile.created_at
                  ? new Date(caseFile.created_at)
                  : null;

                const displayDate =
                  createdAt &&
                  !Number.isNaN(createdAt.getTime())
                    ? createdAt.toLocaleDateString()
                    : 'Not recorded';

                return (
                  <button
                    type="button"
                    key={caseFile.id}
                    onClick={() => onOpenCase(caseFile.id)}
                    className="w-full text-left bg-tactical-bg border border-tactical-border rounded-xl p-5 hover:border-tactical-accent/70 hover:bg-blue-950/10 transition-all flex flex-col justify-between space-y-4 relative overflow-hidden group cursor-pointer"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs font-bold text-tactical-accent bg-blue-950/50 border border-blue-900/40 px-2.5 py-1 rounded-md tracking-wider">
                          {caseFile.case_number ||
                            'UNNUMBERED'}
                        </span>

                        <span className="text-[10px] font-semibold text-green-400 bg-green-950/40 border border-green-900/40 px-2 py-0.5 rounded-full capitalize">
                          {caseFile.status || 'open'}
                        </span>
                      </div>

                      <h4 className="text-md font-bold text-white pt-1 group-hover:text-tactical-accent transition-colors">
                        {caseFile.title || 'Untitled case file'}
                      </h4>

                      <p className="text-xs text-gray-400 leading-relaxed">
                        {caseFile.description ||
                          'No operational overview has been recorded.'}
                      </p>
                    </div>

                    <div className="pt-4 border-t border-tactical-border/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-[11px] text-gray-500 font-medium">
                      <div className="flex items-center gap-1.5">
                        <UserCheck className="w-3.5 h-3.5 text-gray-400" />
                        <span className="truncate max-w-[200px]">
                          Operator:{' '}
                          {caseFile.assigned_operator_id ||
                            'Unassigned'}
                        </span>
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-gray-400" />
                          <span>{displayDate}</span>
                        </div>

                        <span className="text-tactical-accent font-bold">
                          Open file →
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function MainConsole() {
  const { token, user, logout } = useAuth();

  const [currentView, setCurrentView] = useState('cases');
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [selectedCase, setSelectedCase] = useState(null);
  const [selectedCaseId, setSelectedCaseId] = useState(null);
  const [caseDetailLoading, setCaseDetailLoading] =
    useState(false);
  const [caseDetailError, setCaseDetailError] =
    useState('');
  const [caseUpdateLoading, setCaseUpdateLoading] =
    useState(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [submitLoading, setSubmitLoading] =
    useState(false);
  const [formError, setFormError] = useState('');

  const authenticatedRequest = useCallback(
    async (path, options = {}) => {
      const response = await fetch(`${API_URL}${path}`, {
        ...options,
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
          ...(options.body
            ? { 'Content-Type': 'application/json' }
            : {}),
          ...(options.headers || {}),
        },
      });

      const data = await readResponse(response);

      if (response.status === 401) {
        logout();
        throw new Error(
          'Your session expired. Please sign in again.'
        );
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

  const fetchCases = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const data = await authenticatedRequest(
        '/api/v1/cases/'
      );

      setCases(normaliseList(data));
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Unable to retrieve case files.'
      );
    } finally {
      setLoading(false);
    }
  }, [authenticatedRequest]);

  useEffect(() => {
    fetchCases();
  }, [fetchCases]);

  const openCaseDetails = useCallback(
    async (caseId) => {
      setSelectedCaseId(caseId);
      setSelectedCase(null);
      setCaseDetailError('');
      setCaseDetailLoading(true);

      try {
        const data = await authenticatedRequest(
          `/api/v1/cases/${caseId}`
        );

        setSelectedCase(data);
      } catch (requestError) {
        setCaseDetailError(
          requestError instanceof Error
            ? requestError.message
            : 'Unable to load the case record.'
        );
      } finally {
        setCaseDetailLoading(false);
      }
    },
    [authenticatedRequest]
  );

  const closeCaseDetails = () => {
    setSelectedCase(null);
    setSelectedCaseId(null);
    setCaseDetailError('');
    setCaseDetailLoading(false);
    setCaseUpdateLoading(false);
  };

  const updateCaseDetails = async (updates) => {
    if (!selectedCaseId) {
      throw new Error('No case file is currently selected.');
    }

    setCaseUpdateLoading(true);

    try {
      const updatedCase = await authenticatedRequest(
        `/api/v1/cases/${selectedCaseId}`,
        {
          method: 'PATCH',
          body: JSON.stringify(updates),
        }
      );

      setSelectedCase(updatedCase);
      setCases((currentCases) =>
        currentCases.map((caseFile) =>
          caseFile.id === updatedCase.id
            ? updatedCase
            : caseFile
        )
      );

      return updatedCase;
    } finally {
      setCaseUpdateLoading(false);
    }
  };

  const handleCreateCase = async (event) => {
    event.preventDefault();
    setFormError('');
    setSubmitLoading(true);

    try {
      await authenticatedRequest('/api/v1/cases/', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          assigned_operator_id: user?.id || null,
        }),
      });

      setIsModalOpen(false);
      setTitle('');
      setDescription('');
      await fetchCases();
    } catch (requestError) {
      setFormError(
        requestError instanceof Error
          ? requestError.message
          : 'Unable to create the case file.'
      );
    } finally {
      setSubmitLoading(false);
    }
  };

  const userRole = user?.role || 'field_agent';

  const viewTitle =
    currentView === 'cases'
      ? 'Operational Registers'
      : currentView === 'tracking'
        ? 'Live Telematics Stream'
        : 'VisionFlow AI Surveillance';

  return (
    <div className="min-h-screen bg-tactical-bg flex flex-col lg:flex-row text-gray-100 font-sans relative">
      <aside className="w-full lg:w-64 bg-tactical-panel border-b lg:border-b-0 lg:border-r border-tactical-border flex lg:flex-col justify-between p-4 lg:p-5 gap-4">
        <div className="space-y-4 lg:space-y-6 flex-1">
          <div className="flex items-center gap-3 px-2 py-1">
            <div className="bg-blue-600/10 p-2 rounded-lg border border-blue-500/20">
              <Shield className="w-6 h-6 text-tactical-accent" />
            </div>

            <div>
              <h2 className="text-md font-bold tracking-tight text-white">
                GuardFlow
              </h2>

              <span className="text-xs text-gray-400 font-medium">
                Operational Intelligence
              </span>
            </div>
          </div>

          <nav className="grid grid-cols-3 lg:grid-cols-1 gap-1">
            <button
              type="button"
              onClick={() => setCurrentView('cases')}
              className={`w-full flex items-center justify-center lg:justify-start gap-2 lg:gap-3 px-3 py-2.5 rounded-lg text-xs lg:text-sm font-medium transition-colors ${
                currentView === 'cases'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/10'
                  : 'text-gray-400 hover:bg-tactical-border/30 hover:text-white'
              }`}
            >
              <FolderOpen className="w-4 h-4" />
              <span>Case Files</span>
            </button>

            <button
              type="button"
              onClick={() => setCurrentView('tracking')}
              className={`w-full flex items-center justify-center lg:justify-start gap-2 lg:gap-3 px-3 py-2.5 rounded-lg text-xs lg:text-sm font-medium transition-colors ${
                currentView === 'tracking'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/10'
                  : 'text-gray-400 hover:bg-tactical-border/30 hover:text-white'
              }`}
            >
              <Radio className="w-4 h-4" />
              <span>Telematics</span>
            </button>

            {userRole === 'admin' && (
              <button
                type="button"
                onClick={() => setCurrentView('vision')}
                className={`w-full flex items-center justify-center lg:justify-start gap-2 lg:gap-3 px-3 py-2.5 rounded-lg text-xs lg:text-sm font-medium transition-colors ${
                  currentView === 'vision'
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-500/10'
                    : 'text-gray-400 hover:bg-tactical-border/30 hover:text-white'
                }`}
              >
                <Eye className="w-4 h-4" />
                <span>VisionFlow</span>
              </button>
            )}
          </nav>
        </div>

        <div className="pt-0 lg:pt-4 lg:border-t border-tactical-border">
          <button
            type="button"
            onClick={logout}
            className="flex items-center justify-center gap-2 bg-red-950/20 border border-red-900/30 hover:bg-red-900/20 text-red-400 text-xs font-medium px-3 lg:px-0 lg:w-full py-2 rounded-lg transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Disconnect</span>
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0">
        <header className="min-h-16 border-b border-tactical-border bg-tactical-panel/40 backdrop-blur-sm px-4 md:px-8 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-lg font-semibold text-white">
              {viewTitle}
            </h1>

            <div className="flex items-center gap-1.5 bg-green-950/40 border border-green-800/30 text-green-400 px-2.5 py-0.5 rounded-full text-[11px] font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              <span>API Connected</span>
            </div>
          </div>

          {currentView === 'cases' && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={fetchCases}
                className="p-2 bg-tactical-panel border border-tactical-border rounded-lg text-gray-400 hover:text-white transition-colors"
                aria-label="Refresh case files"
              >
                <RefreshCw className="w-4 h-4" />
              </button>

              {userRole === 'admin' && (
                <button
                  type="button"
                  onClick={() => setIsModalOpen(true)}
                  className="bg-tactical-accent hover:bg-blue-700 text-white text-xs font-semibold px-4 py-2 rounded-lg flex items-center gap-2 transition-colors shadow-lg"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>New Case File</span>
                </button>
              )}
            </div>
          )}
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6">
          {currentView === 'cases' ? (
            <CaseDashboard
              cases={cases}
              loading={loading}
              error={error}
              onOpenCase={openCaseDetails}
            />
          ) : currentView === 'tracking' ? (
            <Tracking />
          ) : (
            <VisionFlow />
          )}
        </div>
      </main>

      {selectedCaseId && (
        <CaseDetailModal
          caseFile={selectedCase}
          loading={caseDetailLoading}
          error={caseDetailError}
          canEdit={userRole === 'admin'}
          saving={caseUpdateLoading}
          onClose={closeCaseDetails}
          onRetry={() => openCaseDetails(selectedCaseId)}
          onSave={updateCaseDetails}
        />
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-tactical-panel border border-tactical-border rounded-xl p-6 shadow-2xl relative">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white"
              aria-label="Close case form"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="text-md font-bold text-white uppercase tracking-wide mb-4">
              Initialise Investigative Case File
            </h3>

            {formError && (
              <div className="mb-4 p-3 bg-red-950/40 border border-red-800/40 text-red-200 text-xs rounded-lg">
                {formError}
              </div>
            )}

            <form
              onSubmit={handleCreateCase}
              className="space-y-4"
            >
              <div>
                <label
                  htmlFor="case-title"
                  className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5"
                >
                  Investigation Title
                </label>

                <input
                  id="case-title"
                  type="text"
                  required
                  disabled={submitLoading}
                  value={title}
                  onChange={(event) =>
                    setTitle(event.target.value)
                  }
                  placeholder="e.g. Operation Gold Strike"
                  className="w-full bg-tactical-bg border border-tactical-border rounded-lg py-2 px-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-tactical-accent disabled:opacity-60"
                />
              </div>

              <div>
                <label
                  htmlFor="case-description"
                  className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5"
                >
                  Operational Overview
                </label>

                <textarea
                  id="case-description"
                  required
                  rows={4}
                  disabled={submitLoading}
                  value={description}
                  onChange={(event) =>
                    setDescription(event.target.value)
                  }
                  placeholder="Describe the investigation..."
                  className="w-full bg-tactical-bg border border-tactical-border rounded-lg py-2 px-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-tactical-accent resize-none disabled:opacity-60"
                />
              </div>

              <button
                type="submit"
                disabled={submitLoading}
                className="w-full bg-tactical-accent hover:bg-blue-700 text-white rounded-lg py-2.5 text-xs font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 mt-2 shadow-lg"
              >
                {submitLoading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Creating case file...</span>
                  </>
                ) : (
                  <span>Open Investigative Track</span>
                )}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function AppContent() {
  const { token } = useAuth();

  return token ? <MainConsole /> : <Login />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
