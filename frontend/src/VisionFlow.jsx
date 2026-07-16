import React, { useState, useEffect } from 'react';
import { 
  Eye, ShieldAlert, Camera, ShieldX, Plus, RefreshCw, 
  Search, SlidersHorizontal, CheckCircle2, AlertTriangle, Cpu, Loader2, Clock, MapPin
} from 'lucide-react';

export default function VisionFlow() {
  const [alerts, setAlerts] = useState([]);
  const [watchlist, setWatchlist] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [newPlate, setNewPlate] = useState('');
  const [reason, setReason] = useState('');
  const [submitLoading, setSubmitLoading] = useState(false);
  const [formError, setFormError] = useState('');

  const fetchVisionMetrics = async () => {
    try {
      setLoading(true);
      setError('');
      const token = localStorage.getItem('token');

      const [alertsRes, watchRes] = await Promise.all([
        fetch('/api/v1/vision/alerts/', {
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
        }),
        fetch('/api/v1/vision/watchlist/', {
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
        })
      ]);

      if (!alertsRes.ok || !watchRes.ok) throw new Error('Failed to synchronize neural video feed packets.');

      const alertsData = await alertsRes.json();
      const watchData = await watchRes.json();

      setAlerts(alertsData);
      setWatchlist(watchData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchVisionMetrics(); }, []);

  const handleAddToWatchlist = async (e) => {
    e.preventDefault();
    setFormError('');
    setSubmitLoading(true);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/v1/vision/watchlist/', {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({
          license_plate: newPlate.toUpperCase().trim(),
          flag_reason: reason
        })
      });

      if (!response.ok) throw new Error('Failed to register suspect target text parameters.');

      alert(`Success! Target Plate ${newPlate.toUpperCase()} added to AI Neural Watchlist.`);
      setNewPlate('');
      setReason('');
      fetchVisionMetrics();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSubmitLoading(false);
    }
  };
  return (
    <div className="space-y-6 bg-tactical-bg text-gray-100 min-h-[calc(100vh-12rem)] font-sans">
      
      {/* GLOBAL STATUS COUNTERS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-tactical-panel border border-tactical-border rounded-xl p-5 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">AI Streams Connected</p>
            <h3 className="text-2xl font-bold text-blue-400 mt-1">4 <span className="text-xs font-normal text-gray-500">Live Feeds</span></h3>
          </div>
          <div className="p-3 bg-blue-600/10 border border-blue-500/10 rounded-xl text-blue-400"><Camera className="w-5 h-5" /></div>
        </div>
        <div className="bg-tactical-panel border border-tactical-border rounded-xl p-5 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Active Hotlist Plates</p>
            <h3 className="text-2xl font-bold text-yellow-500 mt-1">{watchlist.length} <span className="text-xs font-normal text-gray-500">Targets</span></h3>
          </div>
          <div className="p-3 bg-yellow-600/10 border border-yellow-500/10 rounded-xl text-yellow-500"><Cpu className="w-5 h-5" /></div>
        </div>
        <div className="bg-tactical-panel border border-tactical-border rounded-xl p-5 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Critical Intercept Matches</p>
            <h3 className="text-2xl font-bold text-red-500 mt-1">{alerts.length} <span className="text-xs font-normal text-gray-500">Alerts</span></h3>
          </div>
          <div className="p-3 bg-red-600/10 border border-red-500/10 rounded-xl text-red-500"><ShieldAlert className="w-5 h-5" /></div>
        </div>
      </div>

      {/* CORE WORKSPACE SPLIT CONTAINER GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* LEFT TWO COLUMNS: LIVE INTELLIGENCE DETECTION LOG REGISTER ARRAY */}
        <div className="lg:col-span-2 bg-tactical-panel border border-tactical-border rounded-xl overflow-hidden flex flex-col shadow-xl">
          <div className="p-4 border-b border-tactical-border bg-tactical-panel/40 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-white">Live Interception Alert Feed</h3>
            </div>
            <button onClick={fetchVisionMetrics} className="p-1.5 hover:bg-tactical-border/40 rounded-lg text-gray-400 hover:text-white transition-colors"><RefreshCw className="w-4 h-4" /></button>
          </div>
          
          <div className="p-5 flex-1 overflow-y-auto space-y-3">
            {loading && alerts.length === 0 ? (
              <div className="py-12 flex justify-center"><RefreshCw className="w-6 h-6 animate-spin text-tactical-accent" /></div>
            ) : error ? (
              <div className="p-4 bg-red-950/20 border border-red-800/30 text-red-300 text-xs rounded-xl text-center">⚠️ Sync Error: {error}</div>
            ) : alerts.length === 0 ? (
              <div className="py-16 text-center text-gray-500 flex flex-col items-center gap-2">
                <ShieldX className="w-8 h-8 text-gray-600" />
                <p className="text-xs font-medium">No tactical vehicle blacklist intercepts logged in current cycle.</p>
              </div>
            ) : (
              alerts.map((alert) => (
                <div key={alert.id} className="bg-red-950/10 border border-red-900/30 rounded-xl p-4 flex items-center justify-between hover:border-red-700/40 transition-all group relative overflow-hidden">
                  <div className="absolute top-0 left-0 bottom-0 w-1 bg-red-500 animate-pulse" />
                  <div className="space-y-1.5 pl-2">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-black tracking-widest bg-red-950 border border-red-800 text-red-400 px-3 py-1 rounded-md">{alert.license_plate}</span>
                      <span className="text-[10px] font-bold text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full flex items-center gap-1 border border-red-500/20">
                        <AlertTriangle className="w-3 h-3" />{alert.confidence_score}% Match
                      </span>
                    </div>
                    <p className="text-xs font-bold text-white pt-1">Intercepted at {alert.camera_location}</p>
                    <p className="text-[11px] text-gray-400 flex items-center gap-1"><Clock className="w-3.5 h-3.5" />Captured: {new Date(alert.captured_at).toLocaleTimeString()}</p>
                  </div>
                  <div className="text-right text-xs font-medium text-gray-400 pr-2">
                    <p className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">Device ID</p>
                    <p className="text-white font-semibold mt-0.5">{alert.camera_id}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
        {/* RIGHT COLUMN: INTEGRATED TACTICAL DASHCAM PLAYER MATRIX */}
        <div className="space-y-6">
          
          {/* LIVE MOBILE VIDEO SCREEN WINDOW PANEL */}
          <div className="bg-tactical-panel border border-tactical-border rounded-xl overflow-hidden shadow-xl">
            <div className="p-4 border-b border-tactical-border bg-tactical-panel/40 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-white">R&M Patrol 01 - Live Dashcam</h3>
              </div>
              <span className="text-[10px] uppercase font-bold text-gray-400 bg-tactical-bg px-2 py-0.5 rounded border border-tactical-border">UNIT LIVE</span>
            </div>
            
            {/* PHYSICAL VIDEO LAYER PLAYER CANVAS CONTAINER BOX */}
            <div className="relative w-full aspect-video bg-black flex flex-col items-center justify-center p-1 border-b border-tactical-border group">
              
              {/* PRODUCTION STYLING EMBED: Streams a dynamic tactical night traffic timeline simulation layer */}
              <video 
                className="w-full h-full object-cover rounded-lg"
                autoPlay 
                muted 
                loop 
                playsInline
                poster="https://unsplash.com"
              >
                <source src="https://mixkit.co" type="video/mp4" />
                Your browser terminal engine does not support video streaming player tags.
              </video>

              {/* OVERLAY TACTICAL HUD TARGET DATA ROWS */}
              <div className="absolute top-3 left-3 bg-black/70 backdrop-blur-sm rounded px-2 py-1 text-[9px] font-mono text-green-400 border border-green-500/20 space-y-0.5 opacity-80 group-hover:opacity-100 transition-opacity">
                <p>REC ● STREAMING</p>
                <p>NODE: RM-PATROL-01</p>
                <p>FPS: 30.00 // BITRATE: 2450 kbps</p>
              </div>
            </div>
            <div className="p-3 bg-tactical-panel/40 flex items-center justify-between text-[11px] text-gray-400 font-medium">
              <p className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5 text-blue-400" /> Sector Area: Pretoria N1 North</p>
              <p className="text-white font-semibold">CAM_ID: DC-8890</p>
            </div>
          </div>

          {/* TARGET BLACKLIST REGISTRATION INPUT MATRIX FORM */}
          <div className="bg-tactical-panel border border-tactical-border rounded-xl p-5 shadow-xl">
            <h3 className="text-xs font-bold uppercase tracking-wider text-white mb-4 flex items-center gap-2 text-tactical-accent">
              <Plus className="w-4 h-4" /> Register Hotlist Target
            </h3>
            <form onSubmit={handleAddToWatchlist} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">Target Plate Characters</label>
                <input type="text" required value={newPlate} onChange={(e) => setNewPlate(e.target.value)} placeholder="E.G. CA77890" className="w-full bg-tactical-bg border border-tactical-border rounded-lg py-2 px-3 text-sm text-white focus:outline-none uppercase" />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">Tactical Alert Flag Reason</label>
                <input type="text" required value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Stolen Vehicle Profile" className="w-full bg-tactical-bg border border-tactical-border rounded-lg py-2 px-3 text-sm text-white focus:outline-none" />
              </div>
              <button type="submit" disabled={submitLoading} className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-2 text-xs font-bold flex items-center justify-center gap-2 transition-colors shadow-lg">
                <span>Inject Into AI Surveillance Watchlist</span>
              </button>
            </form>
          </div>

        </div>

      </div>
    </div>
  );
}
