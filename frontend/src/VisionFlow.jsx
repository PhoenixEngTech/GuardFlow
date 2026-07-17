import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import {
  Battery, Gauge, Compass, X, Loader2, MapPin, Clock,
  Search, RefreshCw, ChevronRight, Plus, Radio
} from 'lucide-react';
import { useAuth } from './context/AuthContext';

const API_URL = (
  import.meta.env.VITE_API_URL ||
  'https://guardflow-production.up.railway.app'
).replace(/\/$/, '');

const tacticalIcon = L.divIcon({
  className: 'custom-tactical-marker',
  html: `<div style="width:16px;height:16px;background:#00ebff;border:2px solid #fff;border-radius:50%;box-shadow:0 0 14px #00ebff,0 0 25px #00ebff"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

async function readResponse(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { detail: text };
  }
}

function normaliseList(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  return data ? [data] : [];
}

function ChangeMapView({ center, focusKey }) {
  const map = useMap();
  const lastFocusKey = useRef(null);

  useEffect(() => {
    if (!center || !focusKey || lastFocusKey.current === focusKey) return;
    map.setView(center, 14, { animate: true });
    lastFocusKey.current = focusKey;
    window.setTimeout(() => map.invalidateSize(), 50);
  }, [center, focusKey, map]);

  return null;
}

export default function Tracking() {
  const { token, logout } = useAuth();
  const [vehicles, setVehicles] = useState([]);
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [history, setHistory] = useState([]);
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [caseId, setCaseId] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [color, setColor] = useState('');
  const [licensePlate, setLicensePlate] = useState('');
  const [trackerId, setTrackerId] = useState('');
  const [submitLoading, setSubmitLoading] = useState(false);
  const [formError, setFormError] = useState('');

  const request = useCallback(async (path, options = {}) => {
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
      throw new Error('Session expired. Please sign in again.');
    }
    if (!response.ok) {
      throw new Error(data?.detail || `GuardFlow request failed (${response.status}).`);
    }
    return data;
  }, [logout, token]);

  const fetchActiveAssets = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const vehicleList = normaliseList(await request('/api/v1/tracking/vehicles'));
      setVehicles(vehicleList);
      setSelectedVehicle((current) =>
        vehicleList.find((vehicle) => vehicle.id === current?.id) ||
        vehicleList[0] ||
        null
      );
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to retrieve vehicles.');
    } finally {
      setLoading(false);
    }
  }, [request]);

  const fetchTrackingPath = useCallback(async (vehicleId, showSpinner = false) => {
    if (!vehicleId) {
      setHistory([]);
      return;
    }
    if (showSpinner) setHistoryLoading(true);
    try {
      setHistory(normaliseList(
        await request(`/api/v1/tracking/vehicles/${vehicleId}/history`)
      ));
    } catch (requestError) {
      console.error('Telemetry stream error:', requestError);
    } finally {
      if (showSpinner) setHistoryLoading(false);
    }
  }, [request]);

  const fetchCasesDropdown = useCallback(async () => {
    try {
      const caseList = normaliseList(await request('/api/v1/cases/'));
      setCases(caseList);
      setCaseId((current) =>
        caseList.some((caseFile) => caseFile.id === current)
          ? current
          : caseList[0]?.id || ''
      );
    } catch (requestError) {
      console.error('Case dropdown error:', requestError);
    }
  }, [request]);

  useEffect(() => {
    fetchActiveAssets();
    fetchCasesDropdown();
  }, [fetchActiveAssets, fetchCasesDropdown]);

  useEffect(() => {
    const vehicleId = selectedVehicle?.id;
    if (!vehicleId) {
      setHistory([]);
      return undefined;
    }
    fetchTrackingPath(vehicleId, true);
    const intervalId = window.setInterval(() => fetchTrackingPath(vehicleId), 10000);
    return () => window.clearInterval(intervalId);
  }, [fetchTrackingPath, selectedVehicle?.id]);

  const filteredVehicles = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return vehicles;
    return vehicles.filter((vehicle) =>
      [vehicle.license_plate, vehicle.make, vehicle.model, vehicle.color, vehicle.tracker_hardware_id]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    );
  }, [searchTerm, vehicles]);

  const latestPing = useMemo(() => {
    if (!history.length) return null;
    return history.reduce((latest, current) => {
      if (!latest) return current;
      const latestTime = new Date(latest.logged_at || latest.created_at || 0).getTime();
      const currentTime = new Date(current.logged_at || current.created_at || 0).getTime();
      return Number.isFinite(currentTime) && currentTime > latestTime ? current : latest;
    }, null);
  }, [history]);

  const latitude = Number(latestPing?.latitude);
  const longitude = Number(latestPing?.longitude);
  const hasLiveCoordinates = Number.isFinite(latitude) && Number.isFinite(longitude);
  const mapCenter = hasLiveCoordinates ? [latitude, longitude] : [-25.7479, 28.1878];

  const handleRegisterVehicle = async (event) => {
    event.preventDefault();
    setFormError('');
    setSubmitLoading(true);
    try {
      if (!caseId) throw new Error('Create or select a case file first.');
      await request('/api/v1/tracking/vehicles/', {
        method: 'POST',
        body: JSON.stringify({
          case_id: caseId,
          make: make.trim(),
          model: model.trim(),
          color: color.trim() || null,
          license_plate: licensePlate.toUpperCase().trim(),
          tracker_hardware_id: trackerId.trim() || null,
        }),
      });
      setIsModalOpen(false);
      setMake('');
      setModel('');
      setColor('');
      setLicensePlate('');
      setTrackerId('');
      await fetchActiveAssets();
    } catch (requestError) {
      setFormError(requestError instanceof Error ? requestError.message : 'Unable to register vehicle.');
    } finally {
      setSubmitLoading(false);
    }
  };

  const metric = (value, suffix = '') =>
    value === null || value === undefined || value === '' ? '--' : `${value}${suffix}`;

  const lastIngestTime = latestPing?.logged_at ? new Date(latestPing.logged_at) : null;

  return (
    <div className="flex flex-col xl:flex-row min-h-[calc(100vh-12rem)] bg-tactical-bg text-gray-100 rounded-xl overflow-hidden border border-tactical-border shadow-xl relative">
      <div className="w-full xl:w-80 bg-tactical-panel/80 border-b xl:border-b-0 xl:border-r border-tactical-border flex flex-col max-h-[360px] xl:max-h-none">
        <div className="p-4 border-b border-tactical-border space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">Surveillance Fleet</h3>
            <div className="flex items-center gap-1.5">
              <button onClick={fetchActiveAssets} className="p-1 text-gray-400">
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => setIsModalOpen(true)} className="p-1 bg-blue-600 text-white rounded">
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-2 w-3.5 h-3.5 text-gray-500" />
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Filter trackers..."
              className="w-full bg-tactical-bg border border-tactical-border rounded-lg py-1.5 pl-9 pr-4 text-xs text-white"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {loading && !vehicles.length ? (
            <div className="py-12 flex justify-center">
              <RefreshCw className="w-5 h-5 animate-spin text-tactical-accent" />
            </div>
          ) : error ? (
            <p className="text-xs text-red-400 p-3 text-center bg-red-950/20 rounded-lg">{error}</p>
          ) : !filteredVehicles.length ? (
            <div className="py-10 text-center text-gray-500">
              <Radio className="w-8 h-8 mx-auto mb-2 text-gray-600" />
              <p className="text-xs">No tracked vehicles found.</p>
            </div>
          ) : (
            filteredVehicles.map((vehicle) => (
              <button
                key={vehicle.id}
                onClick={() => setSelectedVehicle(vehicle)}
                className={`w-full text-left p-3.5 rounded-xl border flex items-center justify-between ${
                  selectedVehicle?.id === vehicle.id
                    ? 'bg-blue-600/10 border-tactical-accent'
                    : 'bg-tactical-bg/50 border-tactical-border'
                }`}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white uppercase">
                      {vehicle.license_plate || 'UNREGISTERED'}
                    </span>
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      selectedVehicle?.id === vehicle.id ? 'bg-green-500 animate-pulse' : 'bg-gray-600'
                    }`} />
                  </div>
                  <p className="text-[11px] text-gray-400 mt-1">
                    {[vehicle.make, vehicle.model].filter(Boolean).join(' ') || 'Vehicle details unavailable'}
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-tactical-accent" />
              </button>
            ))
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-px bg-tactical-border border-b border-tactical-border">
          {[
            [Gauge, 'Velocity', `${metric(latestPing?.speed_kmh)} km/h`, 'text-tactical-accent'],
            [Compass, 'Heading', metric(latestPing?.heading_degrees, '°'), 'text-indigo-400'],
            [Battery, 'Battery', metric(latestPing?.battery_percentage, '%'), 'text-green-400'],
            [MapPin, 'Coordinates', hasLiveCoordinates ? `${latitude.toFixed(4)}, ${longitude.toFixed(4)}` : 'Awaiting telemetry', 'text-red-400'],
            [Clock, 'Ingest Time', lastIngestTime && !Number.isNaN(lastIngestTime.getTime()) ? lastIngestTime.toLocaleTimeString() : 'No signal', 'text-yellow-500'],
          ].map(([Icon, label, value, iconClass]) => (
            <div key={label} className="bg-tactical-panel/60 p-4 flex items-center gap-3">
              <Icon className={`w-5 h-5 ${iconClass}`} />
              <div>
                <p className="text-[10px] uppercase font-bold text-gray-400">{label}</p>
                <p className="text-xs md:text-sm font-bold text-white mt-1">{value}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="flex-1 w-full relative" style={{ minHeight: '580px', background: '#090D16' }}>
          {historyLoading && (
            <div className="absolute z-[600] top-4 right-4 bg-tactical-panel/90 border border-tactical-border rounded-lg px-3 py-2 text-xs flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Loading telemetry
            </div>
          )}
          <MapContainer center={mapCenter} zoom={14} style={{ width: '100%', height: '100%', minHeight: '580px' }}>
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution="&copy; OpenStreetMap contributors"
            />
            <ChangeMapView center={mapCenter} focusKey={selectedVehicle?.id || 'default'} />
            <Marker position={mapCenter} icon={tacticalIcon}>
              <Popup>
                <strong>{selectedVehicle?.license_plate || 'SURVEILLANCE UNIT'}</strong>
                <br />
                {hasLiveCoordinates ? 'Tracking active' : 'Awaiting tracker signal'}
              </Popup>
            </Marker>
          </MapContainer>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-tactical-panel border border-tactical-border rounded-xl p-6 relative">
            <button onClick={() => setIsModalOpen(false)} className="absolute top-4 right-4 text-gray-400">
              <X className="w-4 h-4" />
            </button>
            <h3 className="font-bold text-white uppercase tracking-wide mb-4">Initialise Surveillance Tracker</h3>
            {formError && (
              <div className="mb-4 p-3 bg-red-950/40 border border-red-800/40 text-red-200 text-xs rounded-lg">
                {formError}
              </div>
            )}
            <form onSubmit={handleRegisterVehicle} className="space-y-4">
              <select
                value={caseId}
                onChange={(event) => setCaseId(event.target.value)}
                required
                className="w-full bg-tactical-bg border border-tactical-border rounded-lg py-2 px-3 text-sm text-white"
              >
                {!cases.length ? (
                  <option value="">No case files available</option>
                ) : (
                  cases.map((caseFile) => (
                    <option key={caseFile.id} value={caseFile.id}>
                      {caseFile.case_number} - {caseFile.title}
                    </option>
                  ))
                )}
              </select>
              <div className="grid grid-cols-2 gap-3">
                <input required value={make} onChange={(event) => setMake(event.target.value)} placeholder="Vehicle make" className="bg-tactical-bg border border-tactical-border rounded-lg py-2 px-3 text-sm text-white" />
                <input required value={model} onChange={(event) => setModel(event.target.value)} placeholder="Vehicle model" className="bg-tactical-bg border border-tactical-border rounded-lg py-2 px-3 text-sm text-white" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input value={color} onChange={(event) => setColor(event.target.value)} placeholder="Colour" className="bg-tactical-bg border border-tactical-border rounded-lg py-2 px-3 text-sm text-white" />
                <input required value={licensePlate} onChange={(event) => setLicensePlate(event.target.value)} placeholder="Licence plate" className="bg-tactical-bg border border-tactical-border rounded-lg py-2 px-3 text-sm text-white uppercase" />
              </div>
              <input value={trackerId} onChange={(event) => setTrackerId(event.target.value)} placeholder="Hardware serial ID" className="w-full bg-tactical-bg border border-tactical-border rounded-lg py-2 px-3 text-sm text-white" />
              <button
                type="submit"
                disabled={submitLoading || !cases.length}
                className="w-full bg-blue-600 text-white rounded-lg py-2.5 text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {submitLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {submitLoading ? 'Registering vehicle...' : 'Initialise Surveillance Target'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
