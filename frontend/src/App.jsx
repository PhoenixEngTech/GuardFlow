import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './Login';
import Tracking from './Tracking';
import VisionFlow from './VisionFlow';
import { 
  Shield, FolderOpen, Radio, Eye, LogOut, 
  Briefcase, Activity, AlertTriangle, CheckCircle, 
  Clock, Plus, RefreshCw, UserCheck, Search, X, Loader2
} from 'lucide-react';

function CaseDashboard({ cases, loading, error, fetchCases, userRole }) {
  return (
    <>
      {/* ANALYTICAL METRICS HUD BANNER */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-tactical-panel border border-tactical-border rounded-xl p-5 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Total Files</p>
            <h3 className="text-2xl font-bold text-white mt-1">{cases.length}</h3>
          </div>
          <div className="p-3 bg-blue-600/10 border border-blue-500/10 rounded-xl text-tactical-accent">
            <Briefcase className="w-5 h-5" />
          </div>
        </div>
        <div className="bg-tactical-panel border border-tactical-border rounded-xl p-5 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">GPS Tracks</p>
            <h3 className="text-2xl font-bold text-blue-400 mt-1">1</h3>
          </div>
          <div className="p-3 bg-indigo-600/10 border border-indigo-500/10 rounded-xl text-indigo-400">
            <Activity className="w-5 h-5" />
          </div>
        </div>
        <div className="bg-tactical-panel border border-tactical-border rounded-xl p-5 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">AI Watches</p>
            <h3 className="text-2xl font-bold text-yellow-500 mt-1">1</h3>
          </div>
          <div className="p-3 bg-yellow-600/10 border border-yellow-500/10 rounded-xl text-yellow-500">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>
        <div className="bg-tactical-panel border border-tactical-border rounded-xl p-5 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Resolved</p>
            <h3 className="text-2xl font-bold text-green-400 mt-1">0</h3>
          </div>
          <div className="p-3 bg-green-600/10 border border-green-500/10 rounded-xl text-green-400">
            <CheckCircle className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* CORE LOGS GRID SECTION */}
      <div className="bg-tactical-panel border border-tactical-border rounded-xl overflow-hidden shadow-xl">
        <div className="p-5 border-b border-tactical-border bg-tactical-panel/40 flex items-center justify-between">
          <h3 className="text-sm font-bold text-white tracking-wide uppercase">Case Registries Log</h3>
          <div className="relative w-64">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-500">
              <Search className="w-3.5 h-3.5" />
            </span>
            <input type="text" placeholder="Filter cases..." className="w-full bg-tactical-bg border border-tactical-border rounded-lg py-1.5 pl-9 pr-4 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-tactical-accent" />
          </div>
        </div>
        <div className="p-6">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center text-gray-400 gap-3">
              <RefreshCw className="w-6 h-6 animate-spin text-tactical-accent" />
              <span className="text-xs font-medium">Syncing database...</span>
            </div>
          ) : error ? (
            <div className="p-4 bg-red-950/20 border border-red-800/30 text-red-300 text-xs rounded-xl text-center">⚠️ Sync Error: {error}</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {cases.map((c) => (
                <div key={c.id} className="bg-tactical-bg border border-tactical-border rounded-xl p-5 hover:border-gray-600 transition-all flex flex-col justify-between space-y-4 relative overflow-hidden group">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-tactical-accent bg-blue-950/50 border border-blue-900/40 px-2.5 py-1 rounded-md tracking-wider">{c.case_number}</span>
                      <span className="text-[10px] font-semibold text-green-400 bg-green-950/40 border border-green-900/40 px-2 py-0.5 rounded-full capitalize flex items-center gap-1"><span className="w-1 h-1 rounded-full bg-green-400" />{c.status}</span>
                    </div>
                    <h4 className="text-md font-bold text-white pt-1 group-hover:text-tactical-accent transition-colors">{c.title}</h4>
                    <p className="text-xs text-gray-400 leading-relaxed line-clamp-2">{c.description || 'No tactical overview specified.'}</p>
                  </div>
                  <div className="pt-4 border-t border-tactical-border/60 flex items-center justify-between text-[11px] text-gray-500 font-medium">
                    <div className="flex items-center gap-1.5"><UserCheck className="w-3.5 h-3.5 text-gray-400" /><span className="truncate max-w-[120px]">Op: {c.assigned_operator_id?.substring(0, 8)}...</span></div>
                    <div className="flex items-center gap-1"><Clock className="w-3.5 h-3.5 text-gray-400" /><span>{new Date(c.created_at).toLocaleDateString()}</span></div>
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
  const { user, logout } = useAuth();
  const [currentView, setCurrentView] = useState('cases'); 
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [submitLoading, setSubmitLoading] = useState(false);
  const [formError, setFormError] = useState('');

  const fetchCases = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/v1/cases/');
      if (!response.ok) throw new Error('Failed to fetch database entries.');
      const data = await response.json();
      setCases(data);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchCases(); }, []);

  const handleCreateCase = async (e) => {
    e.preventDefault();
    setFormError('');
    setSubmitLoading(true);

    try {
      const response = await fetch('/api/v1/cases/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title,
          description: description,
          assigned_operator_id: user?.id || "b0800fe7-010a-436b-bdd7-a93e053cbe91"
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Failed to submit data entry.');

      alert(`Success! Case File ${data.case_number} recorded.`);
      setIsModalOpen(false);
      setTitle('');
      setDescription('');
      fetchCases(); 
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSubmitLoading(false);
    }
  };

  const userRole = user?.role || 'field_agent';

  return (
    <div className="min-h-screen bg-tactical-bg flex text-gray-100 font-sans relative">
      <aside className="w-64 bg-tactical-panel border-r border-tactical-border flex flex-col justify-between p-5">
        <div className="space-y-6">
          <div className="flex items-center gap-3 px-2 py-1">
            <div className="bg-blue-600/10 p-2 rounded-lg border border-blue-500/20"><Shield className="w-6 h-6 text-tactical-accent" /></div>
            <div><h2 className="text-md font-bold tracking-tight text-white">GuardFlow</h2><span className="text-xs text-gray-400 font-medium">Tshenolo PI Hub</span></div>
          </div>
          <nav className="space-y-1">
            <button onClick={() => setCurrentView('cases')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${currentView === 'cases' ? 'bg-blue-600 text-white shadow-md shadow-blue-500/10' : 'text-gray-400 hover:bg-tactical-border/30 hover:text-white'}`}>
              <FolderOpen className="w-4 h-4" /><span>Case Files</span>
            </button>
            <button onClick={() => setCurrentView('tracking')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${currentView === 'tracking' ? 'bg-blue-600 text-white shadow-md shadow-blue-500/10' : 'text-gray-400 hover:bg-tactical-border/30 hover:text-white'}`}>
              <Radio className="w-4 h-4" /><span>Tactical Telematics</span>
            </button>
            {userRole === 'admin' && (
              <button onClick={() => setCurrentView('vision')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${currentView === 'vision' ? 'bg-blue-600 text-white shadow-md shadow-blue-500/10' : 'text-gray-400 hover:bg-tactical-border/30 hover:text-white'}`}>
                <Eye className="w-4 h-4" /><span>VisionFlow AI</span>
              </button>
            )}
          </nav>
        </div>
        <div className="pt-4 border-t border-tactical-border space-y-3">
          <div className="flex items-center gap-3 px-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center font-bold text-xs text-white">{userRole.substring(0, 2).toUpperCase()}</div>
            <div className="truncate"><p className="text-xs font-semibold text-white truncate">TSHENOLO OPERATOR</p><p className="text-[10px] text-tactical-accent font-medium tracking-wider uppercase">{userRole}</p></div>
          </div>
          <button onClick={logout} className="w-full flex items-center justify-center gap-2 bg-red-950/20 border border-red-900/30 hover:bg-red-900/20 text-red-400 text-xs font-medium py-2 rounded-lg transition-colors"><LogOut className="w-3.5 h-3.5" /><span>Disconnect</span></button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b border-tactical-border bg-tactical-panel/40 backdrop-blur-sm px-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold text-white capitalize">
              {currentView === 'cases' ? 'Operational Registers' : currentView === 'tracking' ? 'Live Telematics Stream' : 'VisionFlow AI Surveillance'}
            </h1>
            <div className="flex items-center gap-1.5 bg-green-950/40 border border-green-800/30 text-green-400 px-2.5 py-0.5 rounded-full text-[11px] font-medium"><span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" /><span>Telemetry Active</span></div>
          </div>
          <div className="flex items-center gap-3">
            {currentView === 'cases' && (
              <>
                <button onClick={fetchCases} className="p-2 bg-tactical-panel border border-tactical-border rounded-lg text-gray-400 hover:text-white transition-colors"><RefreshCw className="w-4 h-4" /></button>
                {userRole === 'admin' && (
                  <button onClick={() => setIsModalOpen(true)} className="bg-tactical-accent hover:bg-blue-700 text-white text-xs font-semibold px-4 py-2 rounded-lg flex items-center gap-2 transition-colors shadow-lg">
                    <Plus className="w-3.5 h-3.5" /><span>New Case File</span>
                  </button>
                )}
              </>
            )}
          </div>
        </header>
        <div className="flex-1 overflow-y-auto p-8 space-y-6">
          {currentView === 'cases' ? <CaseDashboard cases={cases} loading={loading} error={error} fetchCases={fetchCases} userRole={userRole} /> : 
           currentView === 'tracking' ? <Tracking /> : <VisionFlow />}
        </div>
      </main>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-tactical-panel border border-tactical-border rounded-xl p-6 shadow-2xl relative">
            <button onClick={() => setIsModalOpen(false)} className="absolute top-4 right-4 text-gray-400 hover:text-white"><X className="w-4 h-4" /></button>
            <h3 className="text-md font-bold text-white uppercase tracking-wide mb-4">Initialize Investigative Case File</h3>
            {formError && <div className="mb-4 p-3 bg-red-950/40 border border-red-800/40 text-red-200 text-xs rounded-lg">{formError}</div>}
            <form onSubmit={handleCreateCase} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">Investigation Title</label>
                <input type="text" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Operation Gold Strike" className="w-full bg-tactical-bg border border-tactical-border rounded-lg py-2 px-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-tactical-accent" />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">Overview Parameters</label>
                <textarea required rows={4} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe suspect behaviors..." className="w-full bg-tactical-bg border border-tactical-border rounded-lg py-2 px-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-tactical-accent resize-none text-xs" />
              </div>
              <button type="submit" disabled={submitLoading} className="w-full bg-tactical-accent hover:bg-blue-700 text-white rounded-lg py-2 text-xs font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 mt-2 shadow-lg">
                {submitLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <span>Open Investigative Track</span>}
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
  return !token ? <Login /> : <MainConsole />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
