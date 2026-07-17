import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './Login';
import Tracking from './Tracking';
import VisionFlow from './VisionFlow';
import {
  Shield, FolderOpen, Radio, Eye, LogOut, Briefcase, Activity,
  AlertTriangle, CheckCircle, Clock, Plus, RefreshCw, UserCheck,
  Search, X, Loader2
} from 'lucide-react';

const API_URL = (
  import.meta.env.VITE_API_URL ||
  'https://guardflow-production.up.railway.app'
).replace(/\/$/, '');

async function readResponse(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { detail: text };
  }
}

function CaseDashboard({ cases, loading, error }) {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredCases = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return cases;
    return cases.filter((caseFile) =>
      [caseFile.case_number, caseFile.title, caseFile.description, caseFile.status]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    );
  }, [cases, searchTerm]);

  const resolved = cases.filter((caseFile) =>
    ['resolved', 'closed', 'completed'].includes(
      String(caseFile.status || '').toLowerCase()
    )
  ).length;

  const active = cases.filter((caseFile) =>
    ['active', 'in_progress', 'investigating'].includes(
      String(caseFile.status || '').toLowerCase()
    )
  ).length;

  const metrics = [
    { label: 'Total Files', value: cases.length, icon: Briefcase, className: 'text-white' },
    { label: 'Open Cases', value: Math.max(cases.length - resolved, 0), icon: AlertTriangle, className: 'text-yellow-400' },
    { label: 'Active', value: active, icon: Activity, className: 'text-blue-400' },
    { label: 'Resolved', value: resolved, icon: CheckCircle, className: 'text-green-400' },
  ];

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {metrics.map(({ label, value, icon: Icon, className }) => (
          <div key={label} className="bg-tactical-panel border border-tactical-border rounded-xl p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">{label}</p>
              <h3 className={`text-2xl font-bold mt-1 ${className}`}>{value}</h3>
            </div>
            <div className="p-3 bg-blue-600/10 border border-blue-500/10 rounded-xl">
              <Icon className={`w-5 h-5 ${className}`} />
            </div>
          </div>
        ))}
      </div>

      <div className="bg-tactical-panel border border-tactical-border rounded-xl overflow-hidden shadow-xl">
        <div className="p-5 border-b border-tactical-border bg-tactical-panel/40 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-white tracking-wide uppercase">Case Registries Log</h3>
          <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-gray-500" />
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Filter cases..."
              className="w-full bg-tactical-bg border border-tactical-border rounded-lg py-2 pl-9 pr-4 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-tactical-accent"
            />
          </div>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center text-gray-400 gap-3">
              <RefreshCw className="w-6 h-6 animate-spin text-tactical-accent" />
              <span className="text-xs">Synchronising case records...</span>
            </div>
          ) : error ? (
            <div className="p-4 bg-red-950/20 border border-red-800/30 text-red-300 text-xs rounded-xl text-center">
              Sync error: {error}
            </div>
          ) : filteredCases.length === 0 ? (
            <div className="py-14 text-center text-gray-500">
              <FolderOpen className="w-9 h-9 mx-auto mb-3 text-gray-600" />
              <p className="text-sm">No matching case files found.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 2xl:grid-cols-2 gap-4">
              {filteredCases.map((caseFile) => (
                <div key={caseFile.id} className="bg-tactical-bg border border-tactical-border rounded-xl p-5 hover:border-gray-600 transition-all space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-bold text-tactical-accent bg-blue-950/50 border border-blue-900/40 px-2.5 py-1 rounded-md">
                        {caseFile.case_number || 'UNNUMBERED'}
                      </span>
                      <span className="text-[10px] text-green-400 bg-green-950/40 border border-green-900/40 px-2 py-0.5 rounded-full capitalize">
                        {caseFile.status || 'open'}
                      </span>
                    </div>
                    <h4 className="text-md font-bold text-white">{caseFile.title || 'Untitled case file'}</h4>
                    <p className="text-xs text-gray-400 leading-relaxed">
                      {caseFile.description || 'No operational overview recorded.'}
                    </p>
                  </div>
                  <div className="pt-4 border-t border-tactical-border/60 flex flex-col sm:flex-row justify-between gap-2 text-[11px] text-gray-500">
                    <div className="flex items-center gap-1.5">
                      <UserCheck className="w-3.5 h-3.5" />
                      <span>
                        Operator: {caseFile.assigned_operator_id
                          ? String(caseFile.assigned_operator_id).slice(0, 12)
                          : 'Unassigned'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      <span>
                        {caseFile.created_at
                          ? new Date(caseFile.created_at).toLocaleDateString()
                          : 'Not recorded'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
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
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [submitLoading, setSubmitLoading] = useState(false);
  const [formError, setFormError] = useState('');

  const fetchCases = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API_URL}/api/v1/cases/`, {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await readResponse(response);
      if (response.status === 401) {
        logout();
        throw new Error('Session expired. Please sign in again.');
      }
      if (!response.ok) throw new Error(data?.detail || 'Failed to retrieve case files.');
      setCases(Array.isArray(data) ? data : data?.items || []);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to retrieve case files.');
    } finally {
      setLoading(false);
    }
  }, [logout, token]);

  useEffect(() => {
    fetchCases();
  }, [fetchCases]);

  const handleCreateCase = async (event) => {
    event.preventDefault();
    setFormError('');
    setSubmitLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/v1/cases/`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          assigned_operator_id: user?.id || null,
        }),
      });
      const data = await readResponse(response);
      if (response.status === 401) {
        logout();
        throw new Error('Session expired. Please sign in again.');
      }
      if (!response.ok) throw new Error(data?.detail || 'Failed to create the case file.');
      setIsModalOpen(false);
      setTitle('');
      setDescription('');
      await fetchCases();
    } catch (requestError) {
      setFormError(requestError instanceof Error ? requestError.message : 'Unable to create the case file.');
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
    <div className="min-h-screen bg-tactical-bg flex flex-col lg:flex-row text-gray-100 font-sans">
      <aside className="w-full lg:w-64 bg-tactical-panel border-b lg:border-b-0 lg:border-r border-tactical-border flex lg:flex-col justify-between p-4 lg:p-5 gap-4">
        <div className="space-y-4 lg:space-y-6 flex-1">
          <div className="flex items-center gap-3 px-2">
            <div className="bg-blue-600/10 p-2 rounded-lg border border-blue-500/20">
              <Shield className="w-6 h-6 text-tactical-accent" />
            </div>
            <div>
              <h2 className="font-bold text-white">GuardFlow</h2>
              <span className="text-xs text-gray-400">Operational Intelligence</span>
            </div>
          </div>

          <nav className="grid grid-cols-3 lg:grid-cols-1 gap-1">
            {[
              ['cases', FolderOpen, 'Case Files'],
              ['tracking', Radio, 'Telematics'],
              ...(userRole === 'admin' ? [['vision', Eye, 'VisionFlow']] : []),
            ].map(([view, Icon, label]) => (
              <button
                key={view}
                onClick={() => setCurrentView(view)}
                className={`w-full flex items-center justify-center lg:justify-start gap-2 px-3 py-2.5 rounded-lg text-xs lg:text-sm font-medium ${
                  currentView === view
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-400 hover:bg-tactical-border/30 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{label}</span>
              </button>
            ))}
          </nav>
        </div>

        <button
          onClick={logout}
          className="flex items-center justify-center gap-2 bg-red-950/20 border border-red-900/30 text-red-400 text-xs font-medium px-3 lg:w-full py-2 rounded-lg"
        >
          <LogOut className="w-3.5 h-3.5" />
          Disconnect
        </button>
      </aside>

      <main className="flex-1 flex flex-col min-w-0">
        <header className="min-h-16 border-b border-tactical-border bg-tactical-panel/40 px-4 md:px-8 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold text-white">{viewTitle}</h1>
            <div className="text-green-400 text-[11px] bg-green-950/40 border border-green-800/30 px-2.5 py-0.5 rounded-full">
              API Connected
            </div>
          </div>

          {currentView === 'cases' && (
            <div className="flex items-center gap-3">
              <button onClick={fetchCases} className="p-2 border border-tactical-border rounded-lg text-gray-400">
                <RefreshCw className="w-4 h-4" />
              </button>
              {userRole === 'admin' && (
                <button
                  onClick={() => setIsModalOpen(true)}
                  className="bg-tactical-accent text-white text-xs font-semibold px-4 py-2 rounded-lg flex items-center gap-2"
                >
                  <Plus className="w-3.5 h-3.5" />
                  New Case File
                </button>
              )}
            </div>
          )}
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6">
          {currentView === 'cases' ? (
            <CaseDashboard cases={cases} loading={loading} error={error} />
          ) : currentView === 'tracking' ? (
            <Tracking />
          ) : (
            <VisionFlow />
          )}
        </div>
      </main>

      {isModalOpen && (
        <div className="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-tactical-panel border border-tactical-border rounded-xl p-6 relative">
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute top-4 right-4 text-gray-400"
            >
              <X className="w-4 h-4" />
            </button>
            <h3 className="font-bold text-white uppercase tracking-wide mb-4">
              Initialise Investigative Case File
            </h3>
            {formError && (
              <div className="mb-4 p-3 bg-red-950/40 border border-red-800/40 text-red-200 text-xs rounded-lg">
                {formError}
              </div>
            )}
            <form onSubmit={handleCreateCase} className="space-y-4">
              <input
                required
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Investigation title"
                className="w-full bg-tactical-bg border border-tactical-border rounded-lg py-2 px-3 text-sm text-white"
              />
              <textarea
                required
                rows={4}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Operational overview"
                className="w-full bg-tactical-bg border border-tactical-border rounded-lg py-2 px-3 text-sm text-white resize-none"
              />
              <button
                type="submit"
                disabled={submitLoading}
                className="w-full bg-tactical-accent text-white rounded-lg py-2.5 text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {submitLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {submitLoading ? 'Creating case...' : 'Open Investigative Track'}
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
