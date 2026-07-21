import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Battery,
  CheckCircle,
  Clock,
  Copy,
  KeyRound,
  Loader2,
  MapPin,
  MessageSquare,
  Navigation,
  Plus,
  Radio,
  RefreshCw,
  Send,
  Shield,
  Truck,
  Users,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { useAuth } from './context/AuthContext';

const API_URL = (
  import.meta.env.VITE_API_URL ||
  'https://guardflow-production.up.railway.app'
).replace(/\/$/, '');

const STATUS_TONES = {
  low: 'text-gray-300 bg-gray-900/50 border-gray-700/50',
  medium: 'text-yellow-400 bg-yellow-950/40 border-yellow-800/40',
  high: 'text-orange-400 bg-orange-950/40 border-orange-800/40',
  critical: 'text-red-400 bg-red-950/50 border-red-700/50',
  online: 'text-green-400 bg-green-950/40 border-green-800/40',
  busy: 'text-blue-400 bg-blue-950/40 border-blue-800/40',
  emergency: 'text-red-400 bg-red-950/50 border-red-700/50',
  offline: 'text-gray-400 bg-gray-900/50 border-gray-700/50',
  disabled: 'text-orange-400 bg-orange-950/40 border-orange-800/40',
  queued: 'text-yellow-400 bg-yellow-950/40 border-yellow-800/40',
  sent: 'text-blue-400 bg-blue-950/40 border-blue-800/40',
  accepted: 'text-cyan-400 bg-cyan-950/40 border-cyan-800/40',
  en_route: 'text-indigo-400 bg-indigo-950/40 border-indigo-800/40',
  on_scene: 'text-purple-400 bg-purple-950/40 border-purple-800/40',
  clear: 'text-green-400 bg-green-950/40 border-green-800/40',
  cancelled: 'text-gray-400 bg-gray-900/50 border-gray-700/50',
  failed: 'text-red-400 bg-red-950/40 border-red-800/40',
};

function pretty(value) {
  return String(value || 'unknown')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatDateTime(value) {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not recorded' : date.toLocaleString();
}

function StatusPill({ value }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${
        STATUS_TONES[value] || STATUS_TONES.offline
      }`}
    >
      {pretty(value)}
    </span>
  );
}

function MetricCard({ label, value, icon: Icon, tone = 'text-white' }) {
  return (
    <div className="bg-tactical-panel border border-tactical-border rounded-xl p-4 flex items-center justify-between">
      <div>
        <p className="text-[10px] uppercase tracking-[0.16em] text-gray-500 font-black">
          {label}
        </p>
        <p className={`text-2xl font-black mt-1 ${tone}`}>{value}</p>
      </div>
      <div className="w-11 h-11 rounded-xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center">
        <Icon className={`w-5 h-5 ${tone}`} />
      </div>
    </div>
  );
}

function Field({ label, name, type = 'text', required = false, placeholder = '', defaultValue = '' }) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-wider text-gray-500 font-black mb-1.5">
        {label}
      </span>
      <input
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        defaultValue={defaultValue}
        className="w-full bg-tactical-bg border border-tactical-border rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500"
      />
    </label>
  );
}

function SelectField({ label, name, required = false, defaultValue = '', children }) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-wider text-gray-500 font-black mb-1.5">
        {label}
      </span>
      <select
        name={name}
        required={required}
        defaultValue={defaultValue}
        className="w-full bg-tactical-bg border border-tactical-border rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500"
      >
        {children}
      </select>
    </label>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-[1600] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-tactical-panel border border-tactical-border rounded-2xl shadow-2xl">
        <div className="sticky top-0 bg-tactical-panel border-b border-tactical-border px-5 py-4 flex items-center justify-between z-10">
          <h3 className="font-black text-white">{title}</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export default function RadioDispatch() {
  const { token, user, logout } = useAuth();
  const role = user?.role || '';
  const canManage = ['master', 'admin'].includes(role);
  const canDispatch = ['master', 'admin', 'dispatcher'].includes(role);

  const [metrics, setMetrics] = useState({
    total_radios: 0,
    online_radios: 0,
    offline_radios: 0,
    emergency_radios: 0,
    open_dispatches: 0,
    online_gateways: 0,
  });
  const [devices, setDevices] = useState([]);
  const [dispatches, setDispatches] = useState([]);
  const [talkgroups, setTalkgroups] = useState([]);
  const [gateways, setGateways] = useState([]);
  const [events, setEvents] = useState([]);
  const [tab, setTab] = useState('radios');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState('');
  const [gatewayKey, setGatewayKey] = useState(null);

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
      const text = await response.text();
      let data = null;
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = { detail: text };
        }
      }
      if (response.status === 401) {
        logout();
        throw new Error('Your GuardFlow session expired. Please sign in again.');
      }
      if (!response.ok) {
        throw new Error(data?.detail || `Radio request failed (${response.status}).`);
      }
      return data;
    },
    [logout, token]
  );

  const fetchData = useCallback(
    async ({ initial = false } = {}) => {
      initial ? setLoading(true) : setRefreshing(true);
      setError('');
      try {
        const [metricData, deviceData, dispatchData, talkgroupData, gatewayData, eventData] =
          await Promise.all([
            request('/api/v1/radios/metrics'),
            request('/api/v1/radios/devices'),
            request('/api/v1/radios/dispatches?limit=300'),
            request('/api/v1/radios/talkgroups'),
            request('/api/v1/radios/gateways'),
            request('/api/v1/radios/events?limit=100'),
          ]);
        setMetrics(metricData || {});
        setDevices(Array.isArray(deviceData) ? deviceData : []);
        setDispatches(Array.isArray(dispatchData) ? dispatchData : []);
        setTalkgroups(Array.isArray(talkgroupData) ? talkgroupData : []);
        setGateways(Array.isArray(gatewayData) ? gatewayData : []);
        setEvents(Array.isArray(eventData) ? eventData : []);
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : 'Unable to load radio operations.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [request]
  );

  useEffect(() => {
    fetchData({ initial: true });
    const intervalId = window.setInterval(() => fetchData(), 10000);
    return () => window.clearInterval(intervalId);
  }, [fetchData]);

  const filteredDevices = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return devices;
    return devices.filter((device) =>
      [device.callsign, device.radio_identifier, device.vehicle_registration, device.vendor, device.model]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    );
  }, [devices, search]);

  const submit = async (path, form, onSuccess) => {
    setBusy(true);
    setError('');
    try {
      const result = await request(path, {
        method: 'POST',
        body: JSON.stringify(form),
      });
      if (onSuccess) onSuccess(result);
      await fetchData();
      return result;
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Radio action failed.');
      return null;
    } finally {
      setBusy(false);
    }
  };

  const submitDevice = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const result = await submit('/api/v1/radios/devices', {
      radio_identifier: form.get('radio_identifier'),
      callsign: form.get('callsign'),
      network_type: form.get('network_type'),
      vendor: form.get('vendor') || null,
      model: form.get('model') || null,
      serial_number: form.get('serial_number') || null,
      imei: form.get('imei') || null,
      gateway_id: form.get('gateway_id') || null,
      primary_talkgroup_id: form.get('primary_talkgroup_id') || null,
      assigned_operator_id: form.get('assigned_operator_id') || null,
      assigned_response_unit_id: form.get('assigned_response_unit_id') || null,
      vehicle_registration: form.get('vehicle_registration') || null,
      capabilities_json: { gps: true, emergency_button: true, text_dispatch: true },
      metadata_json: {},
    });
    if (result) setModal('');
  };

  const submitTalkgroup = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const result = await submit('/api/v1/radios/talkgroups', {
      code: form.get('code'),
      name: form.get('name'),
      network_type: form.get('network_type'),
      external_group_id: form.get('external_group_id') || null,
      priority: Number(form.get('priority') || 5),
      description: form.get('description') || null,
    });
    if (result) setModal('');
  };

  const submitGateway = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const result = await submit('/api/v1/radios/gateways', {
      gateway_identifier: form.get('gateway_identifier'),
      name: form.get('name'),
      gateway_type: form.get('gateway_type'),
      vendor: form.get('vendor') || null,
      model: form.get('model') || null,
      capabilities_json: {
        gps: form.get('gps') === 'on',
        emergency_button: form.get('emergency_button') === 'on',
        text_dispatch: form.get('text_dispatch') === 'on',
        voice_logging: form.get('voice_logging') === 'on',
      },
      metadata_json: {},
    });
    if (result?.integration_key) {
      setGatewayKey({
        key: result.integration_key,
        identifier: result.gateway.gateway_identifier,
      });
      setModal('gateway-key');
    }
  };

  const submitDispatch = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const destinationType = form.get('destination_type');
    const result = await submit('/api/v1/radios/dispatches', {
      alarm_id: form.get('alarm_id') || null,
      case_id: form.get('case_id') || null,
      title: form.get('title'),
      message: form.get('message'),
      priority: form.get('priority'),
      radio_id: destinationType === 'radio' ? form.get('radio_id') || null : null,
      talkgroup_id: destinationType === 'talkgroup' ? form.get('talkgroup_id') || null : null,
      response_unit_id: form.get('response_unit_id') || null,
      latitude: form.get('latitude') ? Number(form.get('latitude')) : null,
      longitude: form.get('longitude') ? Number(form.get('longitude')) : null,
    });
    if (result) setModal('');
  };

  const transitionDispatch = async (dispatchId, nextStatus) => {
    setBusy(true);
    setError('');
    try {
      await request(`/api/v1/radios/dispatches/${dispatchId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      await fetchData();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to update dispatch.');
    } finally {
      setBusy(false);
    }
  };

  const tabs = [
    ['radios', Radio, 'Live Radios'],
    ['dispatches', Send, 'Dispatch Queue'],
    ['talkgroups', Users, 'Talk Groups'],
    ['gateways', Wifi, 'Gateways'],
    ['events', Activity, 'Event Log'],
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Radio className="w-5 h-5 text-cyan-400" />
            <h2 className="text-lg font-black text-white">Radio Dispatch Centre</h2>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            PoC/LTE · DMR · TETRA/MCX · Analogue RoIP · GPS · Emergency · Dispatch
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canDispatch && (
            <button
              type="button"
              onClick={() => setModal('dispatch')}
              className="px-3 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-black flex items-center gap-2"
            >
              <Send className="w-4 h-4" /> Dispatch
            </button>
          )}
          {canManage && (
            <>
              <button type="button" onClick={() => setModal('device')} className="px-3 py-2 rounded-lg bg-blue-600 text-white text-xs font-black flex items-center gap-2">
                <Plus className="w-4 h-4" /> Radio
              </button>
              <button type="button" onClick={() => setModal('talkgroup')} className="px-3 py-2 rounded-lg border border-tactical-border text-gray-300 text-xs font-black flex items-center gap-2">
                <Users className="w-4 h-4" /> Group
              </button>
              <button type="button" onClick={() => setModal('gateway')} className="px-3 py-2 rounded-lg border border-tactical-border text-gray-300 text-xs font-black flex items-center gap-2">
                <KeyRound className="w-4 h-4" /> Gateway
              </button>
            </>
          )}
          <button type="button" onClick={() => fetchData()} disabled={refreshing} className="p-2 rounded-lg border border-tactical-border text-gray-400 hover:text-white">
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-950/30 border border-red-800/40 text-red-200 text-xs">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 xl:grid-cols-6 gap-3">
        <MetricCard label="Total Radios" value={metrics.total_radios || 0} icon={Radio} />
        <MetricCard label="Online" value={metrics.online_radios || 0} icon={Wifi} tone="text-green-400" />
        <MetricCard label="Offline" value={metrics.offline_radios || 0} icon={WifiOff} tone="text-gray-400" />
        <MetricCard label="Emergencies" value={metrics.emergency_radios || 0} icon={AlertTriangle} tone="text-red-400" />
        <MetricCard label="Open Dispatches" value={metrics.open_dispatches || 0} icon={Truck} tone="text-cyan-400" />
        <MetricCard label="Gateways Online" value={metrics.online_gateways || 0} icon={Shield} tone="text-purple-400" />
      </div>

      <div className="flex flex-wrap gap-1 bg-tactical-panel border border-tactical-border rounded-xl p-1 w-fit">
        {tabs.map(([value, Icon, label]) => (
          <button
            type="button"
            key={value}
            onClick={() => setTab(value)}
            className={`px-3 py-2 rounded-lg text-xs font-black flex items-center gap-2 ${
              tab === value ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            <Icon className="w-3.5 h-3.5" /> {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-16 flex justify-center">
          <Loader2 className="w-7 h-7 animate-spin text-cyan-400" />
        </div>
      ) : tab === 'radios' ? (
        <div className="space-y-3">
          <div className="relative max-w-md">
            <Radio className="absolute left-3 top-2.5 w-4 h-4 text-gray-600" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search callsign, radio ID or vehicle" className="w-full bg-tactical-panel border border-tactical-border rounded-lg pl-10 pr-3 py-2.5 text-sm text-white outline-none" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-3">
            {filteredDevices.map((device) => (
              <article key={device.id} className={`bg-tactical-panel border rounded-xl p-4 ${device.emergency_state === 'active' ? 'border-red-600/70 shadow-lg shadow-red-950/30' : 'border-tactical-border'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className={`w-11 h-11 rounded-xl border flex items-center justify-center ${device.status === 'emergency' ? 'bg-red-600/20 border-red-500/50 text-red-400' : 'bg-cyan-600/10 border-cyan-500/20 text-cyan-400'}`}>
                      <Radio className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-black text-white truncate">{device.callsign}</h3>
                      <p className="text-[11px] text-gray-500 mt-0.5 truncate">{device.radio_identifier} · {pretty(device.network_type)}</p>
                    </div>
                  </div>
                  <StatusPill value={device.status} />
                </div>
                <div className="grid grid-cols-2 gap-2 mt-4 text-[11px]">
                  <div className="bg-tactical-bg rounded-lg p-2.5 border border-tactical-border/70">
                    <p className="text-gray-600 uppercase text-[9px] font-black">Location</p>
                    <p className="text-gray-300 mt-1 truncate"><MapPin className="w-3 h-3 inline mr-1" />{device.latitude != null ? `${Number(device.latitude).toFixed(5)}, ${Number(device.longitude).toFixed(5)}` : 'Awaiting GPS'}</p>
                  </div>
                  <div className="bg-tactical-bg rounded-lg p-2.5 border border-tactical-border/70">
                    <p className="text-gray-600 uppercase text-[9px] font-black">Battery</p>
                    <p className="text-gray-300 mt-1"><Battery className="w-3 h-3 inline mr-1" />{device.battery_percentage != null ? `${device.battery_percentage}%` : 'Unknown'}</p>
                  </div>
                </div>
                <div className="mt-3 text-[10px] text-gray-600 flex items-center justify-between gap-2">
                  <span>{device.vendor || 'Vendor not set'} {device.model || ''}</span>
                  <span>{formatDateTime(device.last_seen_at)}</span>
                </div>
              </article>
            ))}
            {filteredDevices.length === 0 && <div className="col-span-full py-14 text-center text-sm text-gray-500">No radio devices match this view.</div>}
          </div>
        </div>
      ) : tab === 'dispatches' ? (
        <div className="bg-tactical-panel border border-tactical-border rounded-xl overflow-hidden">
          <div className="divide-y divide-tactical-border/60">
            {dispatches.map((dispatch) => (
              <article key={dispatch.id} className="p-4 grid grid-cols-1 xl:grid-cols-[1fr_auto] gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-black text-white">{dispatch.title}</h3>
                    <StatusPill value={dispatch.status} />
                    <StatusPill value={dispatch.priority} />
                  </div>
                  <p className="text-xs text-gray-400 mt-2 whitespace-pre-wrap">{dispatch.message}</p>
                  <p className="text-[10px] text-gray-600 mt-2">{dispatch.dispatch_number} · {formatDateTime(dispatch.created_at)}</p>
                </div>
                {canDispatch && !['clear', 'cancelled', 'failed'].includes(dispatch.status) && (
                  <div className="flex flex-wrap items-center gap-2 self-center">
                    {dispatch.status === 'queued' && <button disabled={busy} onClick={() => transitionDispatch(dispatch.id, 'sent')} className="px-2.5 py-1.5 text-[10px] font-black rounded bg-blue-600 text-white">Mark Sent</button>}
                    {['sent'].includes(dispatch.status) && <button disabled={busy} onClick={() => transitionDispatch(dispatch.id, 'accepted')} className="px-2.5 py-1.5 text-[10px] font-black rounded bg-cyan-600 text-white">Accepted</button>}
                    {['sent', 'accepted'].includes(dispatch.status) && <button disabled={busy} onClick={() => transitionDispatch(dispatch.id, 'en_route')} className="px-2.5 py-1.5 text-[10px] font-black rounded bg-indigo-600 text-white">En Route</button>}
                    {['sent', 'accepted', 'en_route'].includes(dispatch.status) && <button disabled={busy} onClick={() => transitionDispatch(dispatch.id, 'on_scene')} className="px-2.5 py-1.5 text-[10px] font-black rounded bg-purple-600 text-white">On Scene</button>}
                    <button disabled={busy} onClick={() => transitionDispatch(dispatch.id, 'clear')} className="px-2.5 py-1.5 text-[10px] font-black rounded bg-green-700 text-white">Clear</button>
                  </div>
                )}
              </article>
            ))}
            {dispatches.length === 0 && <div className="py-14 text-center text-sm text-gray-500">No radio dispatches have been created.</div>}
          </div>
        </div>
      ) : tab === 'talkgroups' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
          {talkgroups.map((group) => (
            <article key={group.id} className="bg-tactical-panel border border-tactical-border rounded-xl p-4">
              <div className="flex items-center justify-between"><div><h3 className="text-sm font-black text-white">{group.name}</h3><p className="text-xs text-cyan-400 mt-1">{group.code}</p></div><Users className="w-5 h-5 text-blue-400" /></div>
              <p className="text-xs text-gray-500 mt-3">{pretty(group.network_type)} · Priority {group.priority}</p>
              <p className="text-xs text-gray-400 mt-2">{group.description || 'No operational description.'}</p>
            </article>
          ))}
          {talkgroups.length === 0 && <div className="col-span-full py-14 text-center text-sm text-gray-500">No talk groups registered.</div>}
        </div>
      ) : tab === 'gateways' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
          {gateways.map((gateway) => (
            <article key={gateway.id} className="bg-tactical-panel border border-tactical-border rounded-xl p-4">
              <div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-black text-white">{gateway.name}</h3><p className="text-xs text-gray-500 mt-1">{gateway.gateway_identifier}</p></div><StatusPill value={gateway.status} /></div>
              <p className="text-xs text-gray-400 mt-3">{gateway.vendor || 'Vendor-neutral'} {gateway.model || ''}</p>
              <p className="text-[10px] uppercase font-black text-cyan-400 mt-3">{pretty(gateway.gateway_type)} gateway</p>
              <p className="text-[10px] text-gray-600 mt-2">Last heartbeat: {formatDateTime(gateway.last_seen_at)}</p>
            </article>
          ))}
          {gateways.length === 0 && <div className="col-span-full py-14 text-center text-sm text-gray-500">No radio gateways registered.</div>}
        </div>
      ) : (
        <div className="bg-tactical-panel border border-tactical-border rounded-xl overflow-hidden divide-y divide-tactical-border/60">
          {events.map((event) => (
            <div key={event.id} className="p-4 flex items-start gap-3">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center border ${event.event_type === 'emergency' ? 'bg-red-600/20 border-red-500/50 text-red-400' : 'bg-blue-600/10 border-blue-500/20 text-blue-400'}`}>
                {event.event_type === 'emergency' ? <AlertTriangle className="w-4 h-4" /> : <Activity className="w-4 h-4" />}
              </div>
              <div><p className="text-sm font-black text-white">{pretty(event.event_type)}</p><p className="text-xs text-gray-400 mt-1">{event.message || event.external_event_id}</p><p className="text-[10px] text-gray-600 mt-1">{formatDateTime(event.occurred_at)}</p></div>
            </div>
          ))}
          {events.length === 0 && <div className="py-14 text-center text-sm text-gray-500">No gateway events received.</div>}
        </div>
      )}

      {modal === 'device' && (
        <Modal title="Register Radio Device" onClose={() => setModal('')}>
          <form onSubmit={submitDevice} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3"><Field label="Radio identifier" name="radio_identifier" placeholder="POC-0001 / DMR-ID" required /><Field label="Callsign" name="callsign" placeholder="RESPONSE-01" required /></div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3"><SelectField label="Network" name="network_type" defaultValue="poc"><option value="poc">PoC / LTE</option><option value="dmr">DMR</option><option value="tetra">TETRA</option><option value="mcx">MCX</option><option value="analog_roip">Analogue RoIP</option><option value="other">Other</option></SelectField><Field label="Vendor" name="vendor" placeholder="Hytera / Motorola / other" /><Field label="Model" name="model" /></div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3"><SelectField label="Gateway" name="gateway_id"><option value="">Not linked yet</option>{gateways.map((gateway) => <option key={gateway.id} value={gateway.id}>{gateway.name}</option>)}</SelectField><SelectField label="Primary talk group" name="primary_talkgroup_id"><option value="">None</option>{talkgroups.map((group) => <option key={group.id} value={group.id}>{group.code} — {group.name}</option>)}</SelectField></div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3"><Field label="Serial number" name="serial_number" /><Field label="IMEI (PoC/LTE)" name="imei" /><Field label="Vehicle registration" name="vehicle_registration" /></div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3"><Field label="Operator ID (optional)" name="assigned_operator_id" /><Field label="Response unit ID (optional)" name="assigned_response_unit_id" /></div>
            <button disabled={busy} className="w-full py-2.5 rounded-lg bg-blue-600 text-white text-sm font-black">Register Radio</button>
          </form>
        </Modal>
      )}

      {modal === 'talkgroup' && (
        <Modal title="Create Radio Talk Group" onClose={() => setModal('')}>
          <form onSubmit={submitTalkgroup} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3"><Field label="Group code" name="code" placeholder="ARMED-RESPONSE" required /><Field label="Group name" name="name" placeholder="Armed Response National" required /></div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3"><SelectField label="Network" name="network_type" defaultValue="poc"><option value="poc">PoC / LTE</option><option value="dmr">DMR</option><option value="tetra">TETRA</option><option value="mcx">MCX</option><option value="analog_roip">Analogue RoIP</option><option value="other">Other</option></SelectField><Field label="Vendor group ID" name="external_group_id" /><Field label="Priority 1–10" name="priority" type="number" defaultValue="5" /></div>
            <Field label="Description" name="description" placeholder="Operational purpose and coverage area" />
            <button disabled={busy} className="w-full py-2.5 rounded-lg bg-blue-600 text-white text-sm font-black">Create Talk Group</button>
          </form>
        </Modal>
      )}

      {modal === 'gateway' && (
        <Modal title="Register Radio Gateway" onClose={() => setModal('')}>
          <form onSubmit={submitGateway} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3"><Field label="Gateway identifier" name="gateway_identifier" placeholder="GF-RADIO-GW-01" required /><Field label="Gateway name" name="name" placeholder="Brits PoC Dispatch Gateway" required /></div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3"><SelectField label="Gateway type" name="gateway_type" defaultValue="poc"><option value="poc">PoC / LTE API</option><option value="dmr">DMR Dispatch Server</option><option value="tetra">TETRA Gateway</option><option value="mcx">MCX Gateway</option><option value="analog_roip">Analogue RoIP</option><option value="other">Other</option></SelectField><Field label="Vendor" name="vendor" /><Field label="Model / platform" name="model" /></div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-gray-300">{[['gps', 'GPS'], ['emergency_button', 'Emergency'], ['text_dispatch', 'Text Dispatch'], ['voice_logging', 'Voice Logs']].map(([name, label]) => <label key={name} className="bg-tactical-bg border border-tactical-border rounded-lg p-3 flex items-center gap-2"><input type="checkbox" name={name} defaultChecked={name !== 'voice_logging'} /> {label}</label>)}</div>
            <button disabled={busy} className="w-full py-2.5 rounded-lg bg-blue-600 text-white text-sm font-black">Create Secure Gateway</button>
          </form>
        </Modal>
      )}

      {modal === 'gateway-key' && gatewayKey && (
        <Modal title="Gateway Integration Key" onClose={() => { setModal(''); setGatewayKey(null); }}>
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-yellow-950/25 border border-yellow-800/40 text-yellow-200 text-xs">This key is shown once. Store it securely in the approved radio gateway. Never place it in frontend code or commit it to Git.</div>
            <div><p className="text-[10px] uppercase font-black text-gray-500">Gateway</p><p className="text-sm text-white mt-1">{gatewayKey.identifier}</p></div>
            <div><p className="text-[10px] uppercase font-black text-gray-500">Integration key</p><div className="mt-1 flex gap-2"><code className="flex-1 break-all bg-tactical-bg border border-tactical-border rounded-lg p-3 text-xs text-green-300">{gatewayKey.key}</code><button type="button" onClick={() => navigator.clipboard.writeText(gatewayKey.key)} className="px-3 border border-tactical-border rounded-lg text-gray-300"><Copy className="w-4 h-4" /></button></div></div>
            <button type="button" onClick={() => { setModal(''); setGatewayKey(null); }} className="w-full py-2.5 rounded-lg bg-green-700 text-white font-black text-sm"><CheckCircle className="w-4 h-4 inline mr-2" />I Stored the Key</button>
          </div>
        </Modal>
      )}

      {modal === 'dispatch' && (
        <Modal title="Dispatch to Radio or Talk Group" onClose={() => setModal('')}>
          <form onSubmit={submitDispatch} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3"><SelectField label="Destination type" name="destination_type" defaultValue="radio"><option value="radio">Individual Radio</option><option value="talkgroup">Talk Group</option></SelectField><SelectField label="Priority" name="priority" defaultValue="high"><option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></SelectField></div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3"><SelectField label="Individual radio" name="radio_id"><option value="">Select radio</option>{devices.map((device) => <option key={device.id} value={device.id}>{device.callsign} — {device.radio_identifier}</option>)}</SelectField><SelectField label="Talk group" name="talkgroup_id"><option value="">Select group</option>{talkgroups.map((group) => <option key={group.id} value={group.id}>{group.code} — {group.name}</option>)}</SelectField></div>
            <Field label="Dispatch title" name="title" placeholder="Respond to panic alarm" required />
            <label className="block"><span className="block text-[10px] uppercase tracking-wider text-gray-500 font-black mb-1.5">Operational message</span><textarea name="message" required rows="4" placeholder="Address, threat, access instructions and required response." className="w-full bg-tactical-bg border border-tactical-border rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500" /></label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3"><Field label="Alarm ID (optional)" name="alarm_id" /><Field label="Case ID (optional)" name="case_id" /></div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3"><Field label="Response unit ID" name="response_unit_id" /><Field label="Latitude" name="latitude" type="number" /><Field label="Longitude" name="longitude" type="number" /></div>
            <button disabled={busy} className="w-full py-2.5 rounded-lg bg-cyan-600 text-white text-sm font-black"><Send className="w-4 h-4 inline mr-2" />Queue Dispatch</button>
          </form>
        </Modal>
      )}
    </div>
  );
}
