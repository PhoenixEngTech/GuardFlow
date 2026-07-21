import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BellRing,
  Building2,
  CheckCircle2,
  Clock3,
  Copy,
  Flame,
  Home,
  KeyRound,
  Loader2,
  MapPin,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  Siren,
  Smartphone,
  Truck,
  UserRound,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useAuth } from './context/AuthContext';

const API_URL = (
  import.meta.env.VITE_API_URL ||
  'https://guardflow-production.up.railway.app'
).replace(/\/$/, '');

const alarmIcon = L.divIcon({
  className: 'guardflow-alarm-marker',
  html: '<div style="width:20px;height:20px;border-radius:50%;background:#ef4444;border:3px solid #fff;box-shadow:0 0 18px #ef4444"></div>',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

const OPEN_STATUSES = ['active', 'acknowledged', 'dispatched', 'responding'];
const SOURCE_LABELS = {
  mobile_sos: 'Mobile SOS', household: 'Household', business: 'Business',
  vehicle: 'Vehicle', railway: 'Railway', vision: 'VisionFlow', manual: 'Manual', system: 'System', radio: 'Radio Emergency',
};

function MoveMap({ position }) {
  const map = useMap();
  useEffect(() => {
    if (position) map.setView(position, 16, { animate: true });
  }, [map, position]);
  return null;
}

function normaliseList(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

function formatDateTime(value) {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not recorded' : date.toLocaleString();
}

function pretty(value) {
  return String(value || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function StatusPill({ value }) {
  const tones = {
    active: 'bg-red-950/60 text-red-300 border-red-800/50',
    acknowledged: 'bg-amber-950/60 text-amber-300 border-amber-800/50',
    dispatched: 'bg-blue-950/60 text-blue-300 border-blue-800/50',
    responding: 'bg-cyan-950/60 text-cyan-300 border-cyan-800/50',
    resolved: 'bg-green-950/60 text-green-300 border-green-800/50',
    closed: 'bg-slate-800 text-slate-300 border-slate-700',
    cancelled: 'bg-slate-800 text-slate-300 border-slate-700',
    false_alarm: 'bg-purple-950/60 text-purple-300 border-purple-800/50',
  };
  return <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase ${tones[value] || tones.closed}`}>{pretty(value)}</span>;
}

function SeverityPill({ value }) {
  const tones = {
    critical: 'bg-red-600 text-white border-red-300',
    high: 'bg-orange-950/70 text-orange-300 border-orange-700/50',
    medium: 'bg-amber-950/70 text-amber-300 border-amber-700/50',
    low: 'bg-blue-950/70 text-blue-300 border-blue-700/50',
  };
  return <span className={`px-2 py-0.5 rounded-full border text-[10px] font-black uppercase tracking-wider ${tones[value] || tones.medium}`}>{value}</span>;
}

function MetricCard({ label, value, icon: Icon, tone = 'text-white' }) {
  return (
    <div className="bg-tactical-panel border border-tactical-border rounded-xl p-4 flex items-center justify-between">
      <div><p className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">{label}</p><p className={`text-2xl font-black mt-1 ${tone}`}>{value ?? 0}</p></div>
      <div className="p-2.5 rounded-xl bg-blue-600/10 border border-blue-500/10"><Icon className={`w-5 h-5 ${tone}`} /></div>
    </div>
  );
}

function Field({ label, ...props }) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-1">{label}</span>
      <input {...props} className="w-full bg-tactical-bg border border-tactical-border rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-blue-500" />
    </label>
  );
}

function SelectField({ label, children, ...props }) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-1">{label}</span>
      <select {...props} className="w-full bg-tactical-bg border border-tactical-border rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-blue-500">{children}</select>
    </label>
  );
}

function AlarmDetails({ alarm, audit, units, busy, onAction, onClose }) {
  const position = Number.isFinite(Number(alarm?.latitude)) && Number.isFinite(Number(alarm?.longitude))
    ? [Number(alarm.latitude), Number(alarm.longitude)] : null;
  const [unitId, setUnitId] = useState(alarm?.response_unit_id || '');

  useEffect(() => setUnitId(alarm?.response_unit_id || ''), [alarm]);
  if (!alarm) return null;

  const actionButton = (action, label, className, needsUnit = false) => (
    <button
      type="button"
      disabled={busy || (needsUnit && !unitId)}
      onClick={() => onAction(action, needsUnit ? unitId : undefined)}
      className={`px-3 py-2 rounded-lg text-xs font-bold disabled:opacity-40 ${className}`}
    >
      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin inline mr-1" /> : null}{label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-[1600] bg-black/70 backdrop-blur-sm flex justify-end">
      <div className="w-full max-w-2xl h-full overflow-y-auto bg-tactical-panel border-l border-tactical-border shadow-2xl">
        <div className="sticky top-0 z-10 p-5 border-b border-tactical-border bg-tactical-panel/95 flex items-start justify-between gap-4">
          <div><div className="flex flex-wrap gap-2 mb-2"><SeverityPill value={alarm.severity} /><StatusPill value={alarm.status} /></div><h2 className="text-xl font-black text-white">{alarm.title}</h2><p className="text-xs text-gray-500 mt-1">{alarm.alarm_number} · {SOURCE_LABELS[alarm.source_type] || pretty(alarm.source_type)}</p></div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-5">
          <div className="grid grid-cols-2 gap-3 text-xs">
            {[
              ['Alarm type', pretty(alarm.alarm_type)], ['Triggered', formatDateTime(alarm.triggered_at)],
              ['Site', alarm.site?.site_name || 'Not linked'], ['Client', alarm.site?.client_name || 'Not linked'],
              ['Zone', alarm.zone ? `${alarm.zone.zone_number} — ${alarm.zone.name}` : 'Not linked'],
              ['Case', alarm.case_id || 'Not linked'], ['Vehicle', alarm.vehicle_id || 'Not linked'],
              ['Panel', alarm.panel?.panel_identifier || 'Not linked'],
            ].map(([label, value]) => <div key={label} className="bg-tactical-bg/60 border border-tactical-border rounded-lg p-3"><p className="text-[9px] uppercase tracking-wider text-gray-600 font-bold">{label}</p><p className="text-gray-200 mt-1 break-words">{value}</p></div>)}
          </div>

          {alarm.description && <div className="p-4 rounded-xl bg-tactical-bg/60 border border-tactical-border"><p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-2">Description</p><p className="text-sm text-gray-300 whitespace-pre-wrap">{alarm.description}</p></div>}

          {position && (
            <div className="h-64 rounded-xl overflow-hidden border border-tactical-border">
              <MapContainer center={position} zoom={16} className="h-full w-full" scrollWheelZoom>
                <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                <MoveMap position={position} />
                <Marker position={position} icon={alarmIcon}><Popup>{alarm.title}<br />{alarm.alarm_number}</Popup></Marker>
              </MapContainer>
            </div>
          )}

          {alarm.site_contacts?.length > 0 && (
            <div className="rounded-xl border border-tactical-border overflow-hidden">
              <div className="px-4 py-3 bg-tactical-bg/50 border-b border-tactical-border text-xs font-bold uppercase tracking-wider text-white">Keyholders</div>
              {alarm.site_contacts.map((contact) => <div key={contact.id} className="px-4 py-3 border-b last:border-b-0 border-tactical-border/60 flex items-center justify-between gap-3"><div><p className="text-sm font-semibold text-white">{contact.priority}. {contact.full_name}</p><p className="text-xs text-gray-500">{contact.relationship || 'Contact'} · {contact.phone_number}</p></div><UserRound className="w-4 h-4 text-gray-500" /></div>)}
            </div>
          )}

          <div className="rounded-xl border border-tactical-border p-4 space-y-3">
            <p className="text-xs font-bold uppercase tracking-wider text-white">Control-room workflow</p>
            {['acknowledged', 'dispatched'].includes(alarm.status) && (
              <SelectField label="Response unit" value={unitId} onChange={(e) => setUnitId(e.target.value)}>
                <option value="">Select armed-response unit</option>
                {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.unit_code} — {unit.name} ({unit.status})</option>)}
              </SelectField>
            )}
            <div className="flex flex-wrap gap-2">
              {alarm.status === 'active' && actionButton('acknowledge', 'Acknowledge', 'bg-amber-600 hover:bg-amber-500 text-white')}
              {alarm.status === 'acknowledged' && actionButton('dispatch', 'Dispatch Unit', 'bg-blue-600 hover:bg-blue-500 text-white', true)}
              {alarm.status === 'dispatched' && actionButton('respond', 'Unit Responding', 'bg-cyan-600 hover:bg-cyan-500 text-white')}
              {OPEN_STATUSES.includes(alarm.status) && actionButton('resolve', 'Resolve', 'bg-green-700 hover:bg-green-600 text-white')}
              {alarm.status === 'resolved' && actionButton('close', 'Close Record', 'bg-slate-600 hover:bg-slate-500 text-white')}
              {OPEN_STATUSES.includes(alarm.status) && actionButton('false-alarm', 'False Alarm', 'bg-purple-700 hover:bg-purple-600 text-white')}
              {OPEN_STATUSES.includes(alarm.status) && actionButton('cancel', 'Cancel', 'bg-slate-700 hover:bg-slate-600 text-white')}
            </div>
          </div>

          <div className="rounded-xl border border-tactical-border overflow-hidden">
            <div className="px-4 py-3 bg-tactical-bg/50 border-b border-tactical-border text-xs font-bold uppercase tracking-wider text-white">Immutable audit trail</div>
            {audit.length ? audit.map((item) => <div key={item.id} className="px-4 py-3 border-b last:border-b-0 border-tactical-border/60"><div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold text-gray-200">{pretty(item.action)}</p><p className="text-[10px] text-gray-600">{formatDateTime(item.created_at)}</p></div><p className="text-xs text-gray-500 mt-1">{item.from_status ? `${pretty(item.from_status)} → ` : ''}{item.to_status ? pretty(item.to_status) : ''}{item.notes ? ` · ${item.notes}` : ''}</p></div>) : <p className="p-4 text-xs text-gray-500">No audit entries.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AlarmCentre({ initialAlarmId = null }) {
  const { token, user, logout } = useAuth();
  const userRole = user?.role || '';
  const canManage = ['master', 'admin'].includes(userRole);
  const canDispatch = ['master', 'admin', 'dispatcher'].includes(userRole);
  const [tab, setTab] = useState('alarms');
  const [alarms, setAlarms] = useState([]);
  const [metrics, setMetrics] = useState({});
  const [sites, setSites] = useState([]);
  const [panels, setPanels] = useState([]);
  const [zones, setZones] = useState([]);
  const [units, setUnits] = useState([]);
  const [rules, setRules] = useState([]);
  const [selected, setSelected] = useState(null);
  const [audit, setAudit] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [severity, setSeverity] = useState('');
  const [source, setSource] = useState('');
  const [showManual, setShowManual] = useState(false);
  const [showSetup, setShowSetup] = useState('');
  const [integrationKey, setIntegrationKey] = useState('');

  const request = useCallback(async (path, options = {}) => {
    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        Accept: 'application/json', Authorization: `Bearer ${token}`,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}),
      },
    });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { detail: text }; }
    if (response.status === 401) { logout(); throw new Error('Your GuardFlow session expired.'); }
    if (!response.ok) throw new Error(data?.detail || `GuardFlow request failed (${response.status}).`);
    return data;
  }, [logout, token]);

  const refresh = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    setError('');
    try {
      const [alarmData, metricData, siteData, panelData, zoneData, unitData, ruleData] = await Promise.all([
        request('/api/v1/alarms/?limit=500'), request('/api/v1/alarms/metrics'),
        request('/api/v1/alarms/sites'), request('/api/v1/alarms/panels'),
        request('/api/v1/alarms/zones'), request('/api/v1/alarms/response-units'),
        request('/api/v1/alarms/rules'),
      ]);
      setAlarms(normaliseList(alarmData)); setMetrics(metricData || {}); setSites(normaliseList(siteData));
      setPanels(normaliseList(panelData)); setZones(normaliseList(zoneData)); setUnits(normaliseList(unitData)); setRules(normaliseList(ruleData));
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to load Alarm Centre.'); }
    finally { if (!quiet) setLoading(false); }
  }, [request]);

  useEffect(() => { refresh(); const id = window.setInterval(() => refresh({ quiet: true }), 5000); return () => window.clearInterval(id); }, [refresh]);
  useEffect(() => { if (initialAlarmId) openAlarm(initialAlarmId); }, [initialAlarmId]); // eslint-disable-line react-hooks/exhaustive-deps

  const openAlarm = async (alarmId) => {
    setBusy(true); setError('');
    try { const [detail, trail] = await Promise.all([request(`/api/v1/alarms/${alarmId}`), request(`/api/v1/alarms/${alarmId}/audit`)]); setSelected(detail); setAudit(normaliseList(trail)); }
    catch (err) { setError(err instanceof Error ? err.message : 'Unable to open alarm.'); }
    finally { setBusy(false); }
  };

  const action = async (actionName, responseUnitId) => {
    if (!selected) return;
    const notes = window.prompt(`Notes for ${pretty(actionName)}:`, '') ?? '';
    setBusy(true);
    try {
      await request(`/api/v1/alarms/${selected.id}/${actionName}`, { method: 'PATCH', body: JSON.stringify({ notes: notes || null, response_unit_id: responseUnitId || null }) });
      await refresh({ quiet: true }); await openAlarm(selected.id);
    } catch (err) { setError(err instanceof Error ? err.message : 'Alarm action failed.'); }
    finally { setBusy(false); }
  };

  const filtered = useMemo(() => alarms.filter((alarm) => {
    if (severity && alarm.severity !== severity) return false;
    if (source && alarm.source_type !== source) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [alarm.alarm_number, alarm.title, alarm.alarm_type, alarm.status].filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
  }), [alarms, search, severity, source]);

  const submitManual = async (event) => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      await request('/api/v1/alarms/manual', { method: 'POST', body: JSON.stringify({
        source_type: form.get('source_type'), alarm_type: form.get('alarm_type'), title: form.get('title'),
        description: form.get('description') || null, severity: form.get('severity'), site_id: form.get('site_id') || null,
        vehicle_id: form.get('vehicle_id') || null, case_id: form.get('case_id') || null,
      }) });
      setShowManual(false); await refresh();
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to create alarm.'); }
    finally { setBusy(false); }
  };

  const submitSite = async (event) => {
    event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true);
    try { await request('/api/v1/alarms/sites', { method: 'POST', body: JSON.stringify(Object.fromEntries(form.entries())) }); setShowSetup(''); await refresh(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Unable to create site.'); } finally { setBusy(false); }
  };

  const submitPanel = async (event) => {
    event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true);
    try { const data = await request('/api/v1/alarms/panels', { method: 'POST', body: JSON.stringify(Object.fromEntries(form.entries())) }); setIntegrationKey(data.integration_key); await refresh({ quiet: true }); }
    catch (err) { setError(err instanceof Error ? err.message : 'Unable to register panel.'); } finally { setBusy(false); }
  };

  const submitZone = async (event) => {
    event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true);
    try { await request('/api/v1/alarms/zones', { method: 'POST', body: JSON.stringify(Object.fromEntries(form.entries())) }); setShowSetup(''); await refresh(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Unable to create zone.'); } finally { setBusy(false); }
  };

  const submitUnit = async (event) => {
    event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true);
    try { await request('/api/v1/alarms/response-units', { method: 'POST', body: JSON.stringify(Object.fromEntries(form.entries())) }); setShowSetup(''); await refresh(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Unable to create response unit.'); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-5 text-gray-100">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
        <div><div className="flex items-center gap-2"><Siren className="w-6 h-6 text-red-400" /><h2 className="text-xl font-black text-white">Universal Alarm Centre</h2></div><p className="text-xs text-gray-500 mt-1">Vehicles · Mobile SOS · Households · Businesses · Railway · VisionFlow</p></div>
        <div className="flex flex-wrap gap-2">
          {canDispatch && <button type="button" onClick={() => setShowManual(true)} className="px-3 py-2 rounded-lg bg-red-700 hover:bg-red-600 text-white text-xs font-bold flex items-center gap-2"><Plus className="w-4 h-4" />Manual Alarm</button>}
          <button type="button" onClick={() => refresh()} className="p-2 rounded-lg border border-tactical-border text-gray-400 hover:text-white"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
        </div>
      </div>

      {error && <div className="p-3 rounded-xl bg-red-950/30 border border-red-800/40 text-red-300 text-xs">{error}</div>}

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <MetricCard label="Open alarms" value={metrics.total_open} icon={BellRing} tone="text-white" />
        <MetricCard label="Critical" value={metrics.critical} icon={Flame} tone="text-red-400" />
        <MetricCard label="High" value={metrics.high} icon={ShieldAlert} tone="text-orange-400" />
        <MetricCard label="Unacknowledged" value={metrics.unacknowledged} icon={Clock3} tone="text-amber-400" />
        <MetricCard label="Responding" value={metrics.responding} icon={Truck} tone="text-cyan-400" />
        <MetricCard label="Panels offline" value={metrics.panels_offline} icon={WifiOff} tone="text-purple-400" />
      </div>

      <div className="flex gap-1 p-1 rounded-xl bg-tactical-panel border border-tactical-border w-fit">
        {[['alarms', Siren, 'Alarm Feed'], ['sites', Building2, 'Protected Sites'], ['rules', ShieldCheck, 'Automation Rules']].map(([value, Icon, label]) => <button key={value} type="button" onClick={() => setTab(value)} className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-2 ${tab === value ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}><Icon className="w-4 h-4" />{label}</button>)}
      </div>

      {tab === 'alarms' && (
        <div className="bg-tactical-panel border border-tactical-border rounded-xl overflow-hidden">
          <div className="p-4 border-b border-tactical-border flex flex-col lg:flex-row gap-3 lg:items-center justify-between">
            <div className="relative flex-1 max-w-md"><Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-600" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search alarm number, type or title" className="w-full pl-9 pr-3 py-2 rounded-lg bg-tactical-bg border border-tactical-border text-sm text-white outline-none" /></div>
            <div className="flex gap-2"><select value={severity} onChange={(e) => setSeverity(e.target.value)} className="bg-tactical-bg border border-tactical-border rounded-lg px-3 py-2 text-xs text-white"><option value="">All severities</option><option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select><select value={source} onChange={(e) => setSource(e.target.value)} className="bg-tactical-bg border border-tactical-border rounded-lg px-3 py-2 text-xs text-white"><option value="">All sources</option>{Object.entries(SOURCE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>
          </div>
          {loading ? <div className="p-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-blue-400" /></div> : filtered.length === 0 ? <div className="p-12 text-center text-sm text-gray-500">No alarms match these filters.</div> : <div className="divide-y divide-tactical-border/60">{filtered.map((alarm) => <button type="button" key={alarm.id} onClick={() => openAlarm(alarm.id)} className="w-full text-left p-4 hover:bg-white/[0.025] grid grid-cols-1 md:grid-cols-[auto_1fr_auto] items-center gap-3"><div className={`w-11 h-11 rounded-xl border flex items-center justify-center ${alarm.severity === 'critical' ? 'bg-red-600/20 border-red-500/50 text-red-400' : 'bg-blue-600/10 border-blue-500/20 text-blue-400'}`}>{alarm.source_type === 'mobile_sos' ? <Smartphone className="w-5 h-5" /> : alarm.source_type === 'household' ? <Home className="w-5 h-5" /> : alarm.source_type === 'business' ? <Building2 className="w-5 h-5" /> : alarm.source_type === 'vehicle' ? <Truck className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}</div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-bold text-sm text-white truncate">{alarm.title}</p><SeverityPill value={alarm.severity} /><StatusPill value={alarm.status} /></div><p className="text-xs text-gray-500 mt-1">{alarm.alarm_number} · {SOURCE_LABELS[alarm.source_type] || pretty(alarm.source_type)} · {formatDateTime(alarm.triggered_at)}</p></div><div className="text-right text-xs text-gray-500">{alarm.latitude != null ? <><MapPin className="w-3.5 h-3.5 inline mr-1" />GPS available</> : 'No GPS'}</div></button>)}</div>}
        </div>
      )}

      {tab === 'sites' && (
        <div className="space-y-4">
          {canManage && <div className="flex flex-wrap gap-2"><button onClick={() => setShowSetup('site')} className="px-3 py-2 rounded-lg bg-blue-600 text-xs font-bold">+ Site</button><button onClick={() => { setShowSetup('panel'); setIntegrationKey(''); }} className="px-3 py-2 rounded-lg bg-blue-600 text-xs font-bold">+ Panel</button><button onClick={() => setShowSetup('zone')} className="px-3 py-2 rounded-lg bg-blue-600 text-xs font-bold">+ Zone</button><button onClick={() => setShowSetup('unit')} className="px-3 py-2 rounded-lg bg-blue-600 text-xs font-bold">+ Response Unit</button></div>}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">{sites.map((site) => { const sitePanels = panels.filter((p) => p.site_id === site.id); return <div key={site.id} className="bg-tactical-panel border border-tactical-border rounded-xl p-4"><div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><h3 className="font-bold text-white">{site.site_name}</h3><span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-950 text-blue-300 uppercase">{site.site_type}</span></div><p className="text-xs text-gray-500 mt-1">{site.client_name} · {site.account_number}</p><p className="text-xs text-gray-500 mt-1">{[site.address_line_1, site.suburb, site.city].filter(Boolean).join(', ')}</p></div>{site.armed_state.startsWith('armed') ? <ShieldCheck className="w-5 h-5 text-green-400" /> : <ShieldAlert className="w-5 h-5 text-amber-400" />}</div><div className="mt-4 space-y-2">{sitePanels.length ? sitePanels.map((panel) => <div key={panel.id} className="p-3 rounded-lg bg-tactical-bg/60 border border-tactical-border flex items-center justify-between"><div><p className="text-xs font-bold text-gray-200">{panel.panel_identifier}</p><p className="text-[10px] text-gray-600">{panel.manufacturer || 'Generic'} {panel.model || ''} · {panel.protocol}</p></div>{panel.status === 'online' ? <Wifi className="w-4 h-4 text-green-400" /> : <WifiOff className="w-4 h-4 text-red-400" />}</div>) : <p className="text-xs text-gray-600">No panel registered.</p>}</div></div>; })}</div>
        </div>
      )}

      {tab === 'rules' && <div className="bg-tactical-panel border border-tactical-border rounded-xl overflow-hidden divide-y divide-tactical-border/60">{rules.map((rule) => <div key={rule.id} className="p-4 flex items-center justify-between gap-3"><div><p className="text-sm font-bold text-white">{rule.name}</p><p className="text-xs text-gray-500 mt-1">{rule.source_type} · {rule.event_type} · cooldown {rule.cooldown_seconds}s</p></div><div className="flex gap-2"><SeverityPill value={rule.severity} /><span className={`text-[10px] uppercase font-bold ${rule.enabled ? 'text-green-400' : 'text-red-400'}`}>{rule.enabled ? 'Enabled' : 'Disabled'}</span></div></div>)}</div>}

      {showManual && <div className="fixed inset-0 z-[1500] bg-black/70 flex items-center justify-center p-4"><form onSubmit={submitManual} className="w-full max-w-lg bg-tactical-panel border border-tactical-border rounded-xl p-5 space-y-3"><div className="flex justify-between"><h3 className="font-black text-white">Create Manual Alarm</h3><button type="button" onClick={() => setShowManual(false)}><X className="w-5 h-5" /></button></div><div className="grid grid-cols-2 gap-3"><SelectField label="Source" name="source_type" defaultValue="manual"><option value="manual">Manual Panic</option><option value="vehicle">Vehicle</option><option value="railway">Railway</option><option value="system">System</option></SelectField><SelectField label="Severity" name="severity" defaultValue="high"><option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></SelectField></div><Field label="Alarm type" name="alarm_type" defaultValue="panic" required /><Field label="Title" name="title" placeholder="Armed robbery / medical emergency" required /><Field label="Description" name="description" /><SelectField label="Protected site (optional)" name="site_id"><option value="">None</option>{sites.map((site) => <option value={site.id} key={site.id}>{site.site_name} — {site.client_name}</option>)}</SelectField><div className="grid grid-cols-2 gap-3"><Field label="Vehicle ID (optional)" name="vehicle_id" /><Field label="Case ID (optional)" name="case_id" /></div><button disabled={busy} className="w-full py-2.5 rounded-lg bg-red-700 text-white text-sm font-bold">Raise Alarm</button></form></div>}

      {showSetup && <div className="fixed inset-0 z-[1500] bg-black/70 flex items-center justify-center p-4"><div className="w-full max-w-xl max-h-[90vh] overflow-y-auto bg-tactical-panel border border-tactical-border rounded-xl p-5"><div className="flex justify-between mb-4"><h3 className="font-black text-white">{pretty(showSetup)} Setup</h3><button type="button" onClick={() => { setShowSetup(''); setIntegrationKey(''); }}><X className="w-5 h-5" /></button></div>
        {showSetup === 'site' && <form onSubmit={submitSite} className="space-y-3"><div className="grid grid-cols-2 gap-3"><Field label="Account number" name="account_number" required /><SelectField label="Site type" name="site_type"><option value="household">Household</option><option value="business">Business</option><option value="industrial">Industrial</option><option value="railway">Railway</option></SelectField></div><Field label="Client name" name="client_name" required /><Field label="Site name" name="site_name" required /><Field label="Address" name="address_line_1" required /><div className="grid grid-cols-2 gap-3"><Field label="Suburb" name="suburb" /><Field label="City" name="city" /></div><button disabled={busy} className="w-full py-2.5 rounded-lg bg-blue-600 font-bold">Create Site</button></form>}
        {showSetup === 'panel' && <form onSubmit={submitPanel} className="space-y-3"><SelectField label="Site" name="site_id" required><option value="">Select site</option>{sites.map((site) => <option value={site.id} key={site.id}>{site.site_name}</option>)}</SelectField><Field label="Panel identifier" name="panel_identifier" placeholder="GF-PANEL-001" required /><div className="grid grid-cols-2 gap-3"><Field label="Manufacturer" name="manufacturer" /><Field label="Model" name="model" /></div><SelectField label="Protocol" name="protocol"><option value="json">GuardFlow JSON Gateway</option><option value="contact_id">Contact ID Receiver</option><option value="sia_dc09">SIA DC-09 Receiver</option><option value="mqtt">MQTT Gateway</option></SelectField>{integrationKey && <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-700/50"><p className="text-xs font-bold text-amber-300">Copy this one-time integration key now:</p><div className="flex gap-2 mt-2"><code className="flex-1 break-all text-xs text-white bg-black/30 p-2 rounded">{integrationKey}</code><button type="button" onClick={() => navigator.clipboard.writeText(integrationKey)} className="p-2"><Copy className="w-4 h-4" /></button></div></div>}<button disabled={busy} className="w-full py-2.5 rounded-lg bg-blue-600 font-bold">Register Panel</button></form>}
        {showSetup === 'zone' && <form onSubmit={submitZone} className="space-y-3"><SelectField label="Panel" name="panel_id" required><option value="">Select panel</option>{panels.map((panel) => <option value={panel.id} key={panel.id}>{panel.panel_identifier}</option>)}</SelectField><div className="grid grid-cols-2 gap-3"><Field label="Zone number" name="zone_number" required /><Field label="Zone name" name="name" required /></div><SelectField label="Zone type" name="zone_type"><option value="intrusion">Intrusion</option><option value="door">Door</option><option value="window">Window</option><option value="motion">Motion</option><option value="glass_break">Glass break</option><option value="panic">Panic</option><option value="fire">Fire / smoke</option><option value="tamper">Tamper</option></SelectField><button disabled={busy} className="w-full py-2.5 rounded-lg bg-blue-600 font-bold">Create Zone</button></form>}
        {showSetup === 'unit' && <form onSubmit={submitUnit} className="space-y-3"><Field label="Unit code" name="unit_code" placeholder="AR-01" required /><Field label="Unit name" name="name" placeholder="Brits Response One" required /><div className="grid grid-cols-2 gap-3"><Field label="Phone" name="phone_number" /><Field label="Vehicle registration" name="vehicle_registration" /></div><button disabled={busy} className="w-full py-2.5 rounded-lg bg-blue-600 font-bold">Create Unit</button></form>}
      </div></div>}

      <AlarmDetails alarm={selected} audit={audit} units={units} busy={busy} onAction={action} onClose={() => { setSelected(null); setAudit([]); }} />
    </div>
  );
}
