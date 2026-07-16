import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { 
  Navigation, Signal, Battery, Gauge, Compass, X, Loader2,
  MapPin, Clock, Search, RefreshCw, ChevronRight, AlertCircle, Plus
} from 'lucide-react';

// Force an inline SVG tactical glowing tracker pulse dot to completely eliminate external CDN icon dependencies
const tacticalIcon = L.divIcon({
  className: 'custom-tactical-marker',
  html: `<div style="
    width: 16px; 
    height: 16px; 
    background-color: #00ebff; 
    border: 2px solid #ffffff; 
    border-radius: 50%; 
    box-shadow: 0 0 14px #00ebff, 0 0 25px #00ebff;
  "></div>`
});

// Intelligent viewport stabilizer: centers camera once but stops background pings from overriding user zoom levels
function ChangeMapView({ center }) {
  const map = useMap();
  const [hasCentered, setHasCentered] = useState(false);

  useEffect(() => {
    if (center && !hasCentered) {
      map.setView(center, 14, { animate: true });
      setHasCentered(true);
      map.invalidateSize();
    }
  }, [center, map, hasCentered]);

  // Reset focus lock if the user clicks a completely different vehicle target
  useEffect(() => {
    setHasCentered(false);
  }, [center]);

  return null;
}

export default function Tracking() {
  const [vehicles, setVehicles] = useState([]);
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [history, setHistory] = useState([]);
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [caseId, setCaseId] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [color, setColor] = useState('');
  const [licensePlate, setLicensePlate] = useState('');
  const [trackerId, setTrackerId] = useState('');
  const [submitLoading, setSubmitLoading] = useState(false);
  const [formError, setFormError] = useState('');
  const fetchActiveAssets = async () => {
    try {
      setLoading(true);
      setError('');
      const token = localStorage.getItem('token');
      
      const response = await fetch('/api/v1/tracking/vehicles', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) throw new Error('Failed to retrieve device list data entries.');
      const data = await response.json();
      setVehicles(data);
      if (data.length > 0 && !selectedVehicle) { 
        setSelectedVehicle(data[0]); 
      }
    } catch (err) { 
      setError(err.message); 
    } finally { 
      setLoading(false); 
    }
  };

  const fetchTrackingPath = async (vehicleId) => {
    if (!vehicleId) return;
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/v1/tracking/vehicles/${vehicleId}/history`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      if (!response.ok) throw new Error('Failed to synchronize coordinates.');
      const data = await response.json();
      setHistory(data);
    } catch (err) { 
      console.error('Telemetry interface stream gap:', err); 
    }
  };

  const fetchCasesDropdown = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/v1/cases/', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      if (response.ok) {
        const data = await response.json();
        setCases(data);
        if (data.length > 0) setCaseId(data[0].id);
      }
    } catch (err) { console.error(err); }
  };

  useEffect(() => {
    fetchActiveAssets();
    fetchCasesDropdown();
  }, []);

  useEffect(() => {
    if (selectedVehicle?.id) {
      fetchTrackingPath(selectedVehicle.id);
      const interval = setInterval(() => fetchTrackingPath(selectedVehicle.id), 4000);
      return () => clearInterval(interval);
    }
  }, [selectedVehicle]);
  const handleRegisterVehicle = async (e) => {
    e.preventDefault();
    setFormError('');
    setSubmitLoading(true);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/v1/tracking/vehicles/', {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({
          case_id: caseId,
          make: make,
          model: model,
          color: color,
          license_plate: licensePlate.toUpperCase().trim(),
          tracker_hardware_id: trackerId || null
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Surveillance deployment allocation failed.');

      alert(`Success! Asset ${licensePlate.toUpperCase()} initialized.`);
      setIsModalOpen(false);
      setMake(''); setModel(''); setColor(''); setLicensePlate(''); setTrackerId('');
      fetchActiveAssets();
    } catch (err) { setFormError(err.message); } 
    finally { setSubmitLoading(false); }
  };

  const latestPing = history && history.latitude ? history : null;
  const mapCenter = latestPing ? [latestPing.latitude, latestPing.longitude] : [-25.7479, 28.1878];

  return (
    <div className="flex h-full min-h-[calc(100vh-12rem)] bg-tactical-bg text-gray-100 rounded-xl overflow-hidden border border-tactical-border shadow-xl relative">
      
      {/* SURVEILLANCE FLEET SIDEBAR PANEL */}
      <div className="w-80 bg-tactical-panel/80 backdrop-blur-sm border-r border-tactical-border flex flex-col">
        <div className="p-4 border-b border-tactical-border space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">Surveillance Fleet</h3>
            <div className="flex items-center gap-1.5">
              <button onClick={fetchActiveAssets} className="p-1 hover:bg-tactical-border/40 rounded text-gray-400 hover:text-white transition-colors"><RefreshCw className="w-3.5 h-3.5" /></button>
              <button onClick={() => setIsModalOpen(true)} className="p-1 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"><Plus className="w-3.5 h-3.5" /></button>
            </div>
          </div>
          <div className="relative">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-500"><Search className="w-3.5 h-3.5" /></span>
            <input type="text" placeholder="Filter trackers..." className="w-full bg-tactical-bg border border-tactical-border rounded-lg py-1.5 pl-9 pr-4 text-xs text-white placeholder-gray-500 focus:outline-none" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {loading && vehicles.length === 0 ? (
            <div className="py-12 flex justify-center"><RefreshCw className="w-5 h-5 animate-spin text-tactical-accent" /></div>
          ) : error ? (
            <p className="text-xs text-red-400 p-3 text-center bg-red-950/20 rounded-lg border border-red-900/20">{error}</p>
          ) : (
            vehicles.map((v) => (
              <button key={v.id} onClick={() => setSelectedVehicle(v)} className={`w-full text-left p-3.5 rounded-xl border transition-all flex items-center justify-between group relative overflow-hidden ${selectedVehicle?.id === v.id ? 'bg-blue-600/10 border-tactical-accent text-white shadow-lg' : 'bg-tactical-bg/50 border-tactical-border text-gray-400 hover:border-gray-600 hover:text-white'}`}>
                <div className="space-y-1 z-10">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold tracking-wide text-white uppercase">{v.license_plate}</span>
                    <span className={`w-1.5 h-1.5 rounded-full ${selectedVehicle?.id === v.id ? 'bg-green-500 animate-pulse' : 'bg-gray-600'}`} />
                  </div>
                  <p className="text-[11px] text-gray-400">{v.make} {v.model}</p>
                </div>
                <ChevronRight className={`w-4 h-4 transition-all text-tactical-accent ${selectedVehicle?.id === v.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`} />
              </button>
            ))
          )}
        </div>
      </div>
      {/* RIGHT SIDE WORKSPACE WORKSTATION HEADER */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-px bg-tactical-border border-b border-tactical-border">
          <div className="bg-tactical-panel/60 p-4 flex items-center gap-3">
            <Gauge className="w-5 h-5 text-tactical-accent" />
            <div><p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Velocity</p><p className="text-md font-bold text-white mt-0.5">{latestPing ? latestPing.speed_kmh : '115.5'} <span className="text-xs text-gray-400">km/h</span></p></div>
          </div>
          <div className="bg-tactical-panel/60 p-4 flex items-center gap-3">
            <Compass className="w-5 h-5 text-indigo-400" />
            <div><p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Heading</p><p className="text-md font-bold text-white mt-0.5">{latestPing ? latestPing.heading_degrees : '180'}°</p></div>
          </div>
          <div className="bg-tactical-panel/60 p-4 flex items-center gap-3">
            <Battery className="w-5 h-5 text-green-400" />
            <div><p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Battery</p><p className="text-md font-bold text-white mt-0.5">{latestPing ? latestPing.battery_percentage : '94'}%</p></div>
          </div>
          <div className="bg-tactical-panel/60 p-4 flex items-center gap-3">
            <MapPin className="w-5 h-5 text-red-400" />
            <div><p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Coordinates</p><p className="text-xs font-semibold text-white mt-1 truncate max-w-[120px]">{mapCenter[0].toFixed(4)}, {mapCenter[1].toFixed(4)}</p></div>
          </div>
          <div className="bg-tactical-panel/60 p-4 flex items-center gap-3">
            <Clock className="w-5 h-5 text-yellow-500" />
            <div><p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Ingest Time</p><p className="text-xs font-semibold text-white mt-1">{latestPing ? new Date(latestPing.logged_at).toLocaleTimeString() : new Date().toLocaleTimeString()}</p></div>
          </div>
        </div>

        {/* INTEGRATED MAP VIEW BLOCK CANVASES */}
        <div className="flex-1 w-full relative z-10 block" style={{ minHeight: '580px', height: '100%', background: '#090D16' }}>
          <MapContainer 
            center={mapCenter} 
            zoom={14} 
            zoomControl={true}
            style={{ width: '100%', height: '100%', minHeight: '580px', background: '#090D16' }}
          >
           <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
            <ChangeMapView center={mapCenter} />
            <Marker position={mapCenter} icon={tacticalIcon}>
              <Popup><div className="text-slate-900 p-1 font-sans"><p className="font-bold text-xs uppercase tracking-wide">{selectedVehicle?.license_plate || 'SURVEILLANCE UNIT'}</p><p className="text-[10px] text-slate-500 mt-0.5">Status: Tracking Active</p></div></Popup>
            </Marker>
          </MapContainer>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-tactical-panel border border-tactical-border rounded-xl p-6 shadow-2xl relative">
            <button onClick={() => setIsModalOpen(false)} className="absolute top-4 right-4 text-gray-400 hover:text-white"><X className="w-4 h-4" /></button>
            <h3 className="text-md font-bold text-white uppercase tracking-wide mb-4">Initialize Surveillance Tracker Node</h3>
            {formError && <div className="mb-4 p-3 bg-red-950/40 border border-red-800/40 text-red-200 text-xs rounded-lg">{formError}</div>}
            <form onSubmit={handleRegisterVehicle} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">Link To Case File</label>
                <select value={caseId} onChange={(e) => setCaseId(e.target.value)} className="w-full bg-tactical-bg border border-tactical-border rounded-lg py-2 px-3 text-sm text-white focus:outline-none">
                  {cases.map((c) => (<option key={c.id} value={c.id}>{c.case_number} - {c.title}</option>))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">Vehicle Make</label>
                  <input type="text" required value={make} onChange={(e) => setMake(e.target.value)} placeholder="e.g. BMW" className="w-full bg-tactical-bg border border-tactical-border rounded-lg py-2 px-3 text-sm text-white focus:outline-none" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">Vehicle Model</label>
                  <input type="text" required value={model} onChange={(e) => setModel(e.target.value)} placeholder="e.g. 3 Series" className="w-full bg-tactical-bg border border-tactical-border rounded-lg py-2 px-3 text-sm text-white focus:outline-none" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">Color</label>
                  <input type="text" value={color} onChange={(e) => setColor(e.target.value)} placeholder="e.g. Black" className="w-full bg-tactical-bg border border-tactical-border rounded-lg py-2 px-3 text-sm text-white focus:outline-none" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">License Plate</label>
                  <input type="text" required value={licensePlate} onChange={(e) => setLicensePlate(e.target.value)} placeholder="e.g. GP123NW" className="w-full bg-tactical-bg border border-tactical-border rounded-lg py-2 px-3 text-sm text-white focus:outline-none uppercase" />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">Hardware Serial ID</label>
                <input type="text" value={trackerId} onChange={(e) => setTrackerId(e.target.value)} placeholder="e.g. TRK-NODE-990" className="w-full bg-tactical-bg border border-tactical-border rounded-lg py-2 px-3 text-sm text-white focus:outline-none" />
              </div>
              <button type="submit" disabled={submitLoading} className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-2 text-xs font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 mt-2 shadow-lg">
                {submitLoading ? <span>Processing...</span> : <span>Initialize Surveillance Target</span>}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
