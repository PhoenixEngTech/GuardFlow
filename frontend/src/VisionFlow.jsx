import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Camera,
  CheckCircle2,
  CircleOff,
  Clock,
  Database,
  Edit3,
  Eye,
  Gauge,
  Loader2,
  MapPin,
  Plus,
  RadioTower,
  RefreshCw,
  ScanLine,
  Search,
  Server,
  ShieldAlert,
  Tag,
  Video,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { useAuth } from './context/AuthContext';

const API_URL = (
  import.meta.env.VITE_API_URL ||
  'https://guardflow-production.up.railway.app'
).replace(/\/$/, '');

const EMPTY_CAMERA_FORM = {
  name: '',
  manufacturer: '',
  model: '',
  serial_number: '',
  location_name: '',
  latitude: '',
  longitude: '',
  connection_type: 'rtsp',
  host: '',
  port: '554',
  stream_path: '',
  credential_reference: '',
  gateway_stream_url: '',
  is_active: true,
};

const EMPTY_WATCHLIST_FORM = {
  case_id: '',
  license_plate: '',
  flag_reason: '',
  risk_level: 'medium',
};

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

function formatDate(value) {
  if (!value) return 'Not available';

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return 'Not available';
  }

  return parsed.toLocaleString();
}

function confidencePercentage(value) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return '--';
  }

  const percentage = numericValue <= 1
    ? numericValue * 100
    : numericValue;

  return `${Math.min(percentage, 100).toFixed(1)}%`;
}

function statusClasses(status) {
  switch (status) {
    case 'online':
      return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300';
    case 'offline':
      return 'border-red-500/30 bg-red-500/10 text-red-300';
    case 'error':
      return 'border-orange-500/30 bg-orange-500/10 text-orange-300';
    case 'disabled':
      return 'border-gray-500/30 bg-gray-500/10 text-gray-300';
    default:
      return 'border-yellow-500/30 bg-yellow-500/10 text-yellow-300';
  }
}

function riskClasses(riskLevel) {
  switch (riskLevel) {
    case 'critical':
      return 'border-red-500/40 bg-red-500/15 text-red-300';
    case 'high':
      return 'border-orange-500/40 bg-orange-500/15 text-orange-300';
    case 'low':
      return 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300';
    default:
      return 'border-yellow-500/40 bg-yellow-500/15 text-yellow-300';
  }
}

function getCameraStatusIcon(status) {
  switch (status) {
    case 'online':
      return Wifi;
    case 'offline':
    case 'error':
      return WifiOff;
    case 'disabled':
      return CircleOff;
    default:
      return RadioTower;
  }
}

function CameraFeed({ camera }) {
  const hasGatewayFeed = Boolean(camera.gateway_stream_url);
  const isOnline = camera.status === 'online' && camera.is_active;

  if (hasGatewayFeed && isOnline) {
    return (
      <div className="relative h-56 bg-black overflow-hidden">
        <video
          key={camera.gateway_stream_url}
          controls
          muted
          playsInline
          preload="metadata"
          className="h-full w-full object-cover bg-black"
        >
          <source src={camera.gateway_stream_url} />
          Your browser could not open this gateway stream.
        </video>

        <div className="absolute left-3 top-3 flex items-center gap-2 rounded-full border border-emerald-500/30 bg-black/70 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-300">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
          Live
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-56 items-center justify-center overflow-hidden bg-[#070b12]">
      <div className="absolute inset-0 opacity-20">
        <div className="h-full w-full bg-[linear-gradient(rgba(0,235,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(0,235,255,0.08)_1px,transparent_1px)] bg-[size:24px_24px]" />
      </div>

      <div className="relative z-10 max-w-xs px-5 text-center">
        {camera.status === 'offline' || camera.status === 'error' ? (
          <WifiOff className="mx-auto mb-3 h-10 w-10 text-red-400" />
        ) : camera.status === 'disabled' ? (
          <CircleOff className="mx-auto mb-3 h-10 w-10 text-gray-500" />
        ) : (
          <Video className="mx-auto mb-3 h-10 w-10 text-tactical-accent/70" />
        )}

        <p className="text-sm font-bold text-white">
          {camera.status === 'disabled'
            ? 'Camera disabled'
            : camera.status === 'offline'
              ? 'Camera offline'
              : camera.status === 'error'
                ? 'Stream error'
                : 'Gateway feed pending'}
        </p>

        <p className="mt-1 text-xs leading-5 text-gray-500">
          {hasGatewayFeed
            ? 'The gateway will display video when the camera reports online.'
            : 'Add the browser-safe HLS or WebRTC gateway URL after deployment.'}
        </p>
      </div>
    </div>
  );
}

export default function VisionFlow() {
  const { token, logout } = useAuth();

  const [cameras, setCameras] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [watchlist, setWatchlist] = useState([]);
  const [cases, setCases] = useState([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const [cameraSearch, setCameraSearch] = useState('');
  const [cameraStatusFilter, setCameraStatusFilter] = useState('all');

  const [isCameraModalOpen, setIsCameraModalOpen] = useState(false);
  const [editingCamera, setEditingCamera] = useState(null);
  const [cameraForm, setCameraForm] = useState(EMPTY_CAMERA_FORM);
  const [cameraSubmitting, setCameraSubmitting] = useState(false);
  const [cameraFormError, setCameraFormError] = useState('');

  const [isWatchlistModalOpen, setIsWatchlistModalOpen] = useState(false);
  const [watchlistForm, setWatchlistForm] = useState(EMPTY_WATCHLIST_FORM);
  const [watchlistSubmitting, setWatchlistSubmitting] = useState(false);
  const [watchlistFormError, setWatchlistFormError] = useState('');

  const request = useCallback(async (path, options = {}) => {
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
      throw new Error('Session expired. Please sign in again.');
    }

    if (!response.ok) {
      const detail = Array.isArray(data?.detail)
        ? data.detail
            .map((item) => item?.msg || String(item))
            .join(' ')
        : data?.detail;

      throw new Error(
        detail ||
        `GuardFlow request failed (${response.status}).`
      );
    }

    return data;
  }, [logout, token]);

  const fetchDashboard = useCallback(async (showInitialLoader = false) => {
    if (showInitialLoader) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    setError('');

    const results = await Promise.allSettled([
      request('/api/v1/cameras/'),
      request('/api/v1/vision/alerts/'),
      request('/api/v1/vision/watchlist/'),
      request('/api/v1/cases/'),
    ]);

    const [
      camerasResult,
      alertsResult,
      watchlistResult,
      casesResult,
    ] = results;

    const requestErrors = [];

    if (camerasResult.status === 'fulfilled') {
      setCameras(normaliseList(camerasResult.value));
    } else {
      requestErrors.push(
        camerasResult.reason?.message ||
        'Unable to retrieve cameras.'
      );
    }

    if (alertsResult.status === 'fulfilled') {
      setAlerts(normaliseList(alertsResult.value));
    } else {
      requestErrors.push(
        alertsResult.reason?.message ||
        'Unable to retrieve VisionFlow alerts.'
      );
    }

    if (watchlistResult.status === 'fulfilled') {
      setWatchlist(normaliseList(watchlistResult.value));
    } else {
      requestErrors.push(
        watchlistResult.reason?.message ||
        'Unable to retrieve the watchlist.'
      );
    }

    if (casesResult.status === 'fulfilled') {
      const caseList = normaliseList(casesResult.value);
      setCases(caseList);

      setWatchlistForm((current) => ({
        ...current,
        case_id: caseList.some(
          (caseFile) => caseFile.id === current.case_id
        )
          ? current.case_id
          : caseList[0]?.id || '',
      }));
    } else {
      requestErrors.push(
        casesResult.reason?.message ||
        'Unable to retrieve case files.'
      );
    }

    if (requestErrors.length) {
      setError([...new Set(requestErrors)].join(' '));
    }

    setLoading(false);
    setRefreshing(false);
  }, [request]);

  useEffect(() => {
    fetchDashboard(true);

    const intervalId = window.setInterval(() => {
      fetchDashboard(false);
    }, 15000);

    return () => window.clearInterval(intervalId);
  }, [fetchDashboard]);

  const cameraMetrics = useMemo(() => {
    const active = cameras.filter(
      (camera) => camera.is_active
    ).length;

    const online = cameras.filter(
      (camera) =>
        camera.is_active &&
        camera.status === 'online'
    ).length;

    const offline = cameras.filter(
      (camera) =>
        camera.is_active &&
        ['offline', 'error'].includes(camera.status)
    ).length;

    return {
      total: cameras.length,
      active,
      online,
      offline,
    };
  }, [cameras]);

  const filteredCameras = useMemo(() => {
    const query = cameraSearch.trim().toLowerCase();

    return cameras.filter((camera) => {
      const matchesStatus =
        cameraStatusFilter === 'all' ||
        camera.status === cameraStatusFilter;

      if (!matchesStatus) return false;
      if (!query) return true;

      return [
        camera.name,
        camera.manufacturer,
        camera.model,
        camera.serial_number,
        camera.location_name,
        camera.host,
        camera.connection_type,
      ]
        .filter(Boolean)
        .some((value) =>
          String(value).toLowerCase().includes(query)
        );
    });
  }, [cameraSearch, cameraStatusFilter, cameras]);

  const openCreateCameraModal = () => {
    setEditingCamera(null);
    setCameraForm(EMPTY_CAMERA_FORM);
    setCameraFormError('');
    setIsCameraModalOpen(true);
  };

  const openEditCameraModal = (camera) => {
    setEditingCamera(camera);
    setCameraForm({
      name: camera.name || '',
      manufacturer: camera.manufacturer || '',
      model: camera.model || '',
      serial_number: camera.serial_number || '',
      location_name: camera.location_name || '',
      latitude:
        camera.latitude === null ||
        camera.latitude === undefined
          ? ''
          : String(camera.latitude),
      longitude:
        camera.longitude === null ||
        camera.longitude === undefined
          ? ''
          : String(camera.longitude),
      connection_type:
        camera.connection_type || 'rtsp',
      host: camera.host || '',
      port: String(camera.port || 554),
      stream_path: camera.stream_path || '',
      credential_reference:
        camera.credential_reference || '',
      gateway_stream_url:
        camera.gateway_stream_url || '',
      is_active: Boolean(camera.is_active),
    });
    setCameraFormError('');
    setIsCameraModalOpen(true);
  };

  const closeCameraModal = () => {
    if (cameraSubmitting) return;

    setIsCameraModalOpen(false);
    setEditingCamera(null);
    setCameraForm(EMPTY_CAMERA_FORM);
    setCameraFormError('');
  };

  const updateCameraForm = (field, value) => {
    setCameraForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleCameraSubmit = async (event) => {
    event.preventDefault();
    setCameraFormError('');
    setCameraSubmitting(true);

    try {
      const payload = {
        name: cameraForm.name.trim(),
        manufacturer:
          cameraForm.manufacturer.trim() || null,
        model: cameraForm.model.trim() || null,
        serial_number:
          cameraForm.serial_number.trim() || null,
        location_name:
          cameraForm.location_name.trim(),
        latitude:
          cameraForm.latitude === ''
            ? null
            : Number(cameraForm.latitude),
        longitude:
          cameraForm.longitude === ''
            ? null
            : Number(cameraForm.longitude),
        connection_type:
          cameraForm.connection_type,
        host: cameraForm.host.trim(),
        port: Number(cameraForm.port),
        stream_path:
          cameraForm.stream_path.trim() || null,
        credential_reference:
          cameraForm.credential_reference.trim() || null,
        gateway_stream_url:
          cameraForm.gateway_stream_url.trim() || null,
        is_active: cameraForm.is_active,
      };

      if (
        payload.latitude !== null &&
        !Number.isFinite(payload.latitude)
      ) {
        throw new Error(
          'Latitude must be a valid number.'
        );
      }

      if (
        payload.longitude !== null &&
        !Number.isFinite(payload.longitude)
      ) {
        throw new Error(
          'Longitude must be a valid number.'
        );
      }

      if (
        !Number.isInteger(payload.port) ||
        payload.port < 1 ||
        payload.port > 65535
      ) {
        throw new Error(
          'Port must be between 1 and 65535.'
        );
      }

      await request(
        editingCamera
          ? `/api/v1/cameras/${editingCamera.id}`
          : '/api/v1/cameras/',
        {
          method: editingCamera ? 'PATCH' : 'POST',
          body: JSON.stringify(payload),
        }
      );

      closeCameraModal();
      await fetchDashboard(false);
    } catch (requestError) {
      setCameraFormError(
        requestError instanceof Error
          ? requestError.message
          : 'Unable to save the camera.'
      );
    } finally {
      setCameraSubmitting(false);
    }
  };

  const toggleCameraActiveState = async (camera) => {
    setError('');

    try {
      await request(
        `/api/v1/cameras/${camera.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            is_active: !camera.is_active,
          }),
        }
      );

      await fetchDashboard(false);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Unable to update the camera.'
      );
    }
  };

  const openWatchlistModal = () => {
    setWatchlistForm((current) => ({
      ...EMPTY_WATCHLIST_FORM,
      case_id:
        current.case_id ||
        cases[0]?.id ||
        '',
    }));
    setWatchlistFormError('');
    setIsWatchlistModalOpen(true);
  };

  const closeWatchlistModal = () => {
    if (watchlistSubmitting) return;

    setIsWatchlistModalOpen(false);
    setWatchlistFormError('');
  };

  const updateWatchlistForm = (field, value) => {
    setWatchlistForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleWatchlistSubmit = async (event) => {
    event.preventDefault();
    setWatchlistFormError('');
    setWatchlistSubmitting(true);

    try {
      if (!watchlistForm.case_id) {
        throw new Error(
          'Create or select a case file first.'
        );
      }

      await request('/api/v1/vision/watchlist/', {
        method: 'POST',
        body: JSON.stringify({
          case_id: watchlistForm.case_id,
          license_plate:
            watchlistForm.license_plate
              .toUpperCase()
              .trim(),
          flag_reason:
            watchlistForm.flag_reason.trim(),
          risk_level:
            watchlistForm.risk_level,
        }),
      });

      closeWatchlistModal();
      await fetchDashboard(false);
    } catch (requestError) {
      setWatchlistFormError(
        requestError instanceof Error
          ? requestError.message
          : 'Unable to add the watchlist target.'
      );
    } finally {
      setWatchlistSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[520px] items-center justify-center rounded-xl border border-tactical-border bg-tactical-bg">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-tactical-accent" />
          <p className="mt-3 text-xs font-bold uppercase tracking-[0.2em] text-gray-500">
            Initialising VisionFlow
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 text-gray-100">
      <section className="overflow-hidden rounded-xl border border-tactical-border bg-tactical-panel/70 shadow-xl">
        <div className="flex flex-col gap-4 border-b border-tactical-border p-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-tactical-accent">
              <ScanLine className="h-5 w-5" />
              <span className="text-[10px] font-bold uppercase tracking-[0.25em]">
                Vision Intelligence
              </span>
            </div>

            <h1 className="mt-2 text-xl font-bold text-white">
              VisionFlow Command Centre
            </h1>

            <p className="mt-1 max-w-2xl text-sm text-gray-400">
              Manage authorised camera sources, live gateway feeds,
              ANPR detections and case-linked watchlist targets.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => fetchDashboard(false)}
              disabled={refreshing}
              className="inline-flex items-center gap-2 rounded-lg border border-tactical-border bg-tactical-bg px-3 py-2 text-xs font-bold text-gray-300 transition hover:border-tactical-accent/50 hover:text-white disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>

            <button
              type="button"
              onClick={openWatchlistModal}
              className="inline-flex items-center gap-2 rounded-lg border border-orange-500/30 bg-orange-500/10 px-3 py-2 text-xs font-bold text-orange-200 transition hover:bg-orange-500/20"
            >
              <ShieldAlert className="h-4 w-4" />
              Add Watchlist Target
            </button>

            <button
              type="button"
              onClick={openCreateCameraModal}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-blue-500"
            >
              <Plus className="h-4 w-4" />
              Register Camera
            </button>
          </div>
        </div>

        {error && (
          <div className="mx-5 mt-5 flex items-start gap-3 rounded-lg border border-red-800/40 bg-red-950/30 p-3 text-sm text-red-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        <div className="grid gap-px bg-tactical-border sm:grid-cols-2 xl:grid-cols-4">
          {[
            {
              label: 'Registered Cameras',
              value: cameraMetrics.total,
              icon: Camera,
              className: 'text-tactical-accent',
            },
            {
              label: 'Active Sources',
              value: cameraMetrics.active,
              icon: RadioTower,
              className: 'text-indigo-300',
            },
            {
              label: 'Online Feeds',
              value: cameraMetrics.online,
              icon: Wifi,
              className: 'text-emerald-300',
            },
            {
              label: 'ANPR Alerts',
              value: alerts.length,
              icon: ShieldAlert,
              className: 'text-orange-300',
            },
          ].map((metric) => {
            const Icon = metric.icon;

            return (
              <div
                key={metric.label}
                className="flex items-center gap-4 bg-tactical-panel/90 p-5"
              >
                <div className="rounded-xl border border-tactical-border bg-tactical-bg p-3">
                  <Icon className={`h-5 w-5 ${metric.className}`} />
                </div>

                <div>
                  <p className="text-2xl font-bold text-white">
                    {metric.value}
                  </p>
                  <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                    {metric.label}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-xl border border-tactical-border bg-tactical-panel/60 shadow-xl">
        <div className="flex flex-col gap-3 border-b border-tactical-border p-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-white">
              <Video className="h-4 w-4 text-tactical-accent" />
              Camera Grid
            </h2>
            <p className="mt-1 text-xs text-gray-500">
              RTSP and ONVIF sources appear here after registration.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-500" />
              <input
                value={cameraSearch}
                onChange={(event) =>
                  setCameraSearch(event.target.value)
                }
                placeholder="Search cameras..."
                className="w-full rounded-lg border border-tactical-border bg-tactical-bg py-2 pl-9 pr-3 text-xs text-white outline-none transition focus:border-tactical-accent sm:w-64"
              />
            </div>

            <select
              value={cameraStatusFilter}
              onChange={(event) =>
                setCameraStatusFilter(event.target.value)
              }
              className="rounded-lg border border-tactical-border bg-tactical-bg px-3 py-2 text-xs text-white outline-none focus:border-tactical-accent"
            >
              <option value="all">All statuses</option>
              <option value="pending">Pending</option>
              <option value="online">Online</option>
              <option value="offline">Offline</option>
              <option value="error">Error</option>
              <option value="disabled">Disabled</option>
            </select>
          </div>
        </div>

        {!filteredCameras.length ? (
          <div className="flex min-h-[320px] items-center justify-center p-6">
            <div className="max-w-md text-center">
              <Camera className="mx-auto h-12 w-12 text-gray-600" />
              <h3 className="mt-4 text-base font-bold text-white">
                No camera sources registered
              </h3>
              <p className="mt-2 text-sm leading-6 text-gray-500">
                GuardFlow is ready for authorised Hikvision, Dahua,
                Uniview or other RTSP/ONVIF camera sources. Real
                streams will appear only after a client deployment.
              </p>
              <button
                type="button"
                onClick={openCreateCameraModal}
                className="mt-5 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-blue-500"
              >
                <Plus className="h-4 w-4" />
                Register First Camera
              </button>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 p-4 xl:grid-cols-2 2xl:grid-cols-3">
            {filteredCameras.map((camera) => {
              const StatusIcon = getCameraStatusIcon(
                camera.status
              );

              return (
                <article
                  key={camera.id}
                  className="overflow-hidden rounded-xl border border-tactical-border bg-tactical-bg/60"
                >
                  <CameraFeed camera={camera} />

                  <div className="space-y-4 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-bold text-white">
                          {camera.name}
                        </h3>
                        <p className="mt-1 flex items-center gap-1.5 text-xs text-gray-500">
                          <MapPin className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">
                            {camera.location_name}
                          </span>
                        </p>
                      </div>

                      <span
                        className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${statusClasses(camera.status)}`}
                      >
                        <StatusIcon className="h-3 w-3" />
                        {camera.status}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="rounded-lg border border-tactical-border bg-tactical-panel/40 p-3">
                        <p className="text-[9px] font-bold uppercase tracking-wider text-gray-600">
                          Device
                        </p>
                        <p className="mt-1 truncate font-medium text-gray-300">
                          {[camera.manufacturer, camera.model]
                            .filter(Boolean)
                            .join(' ') || 'Not specified'}
                        </p>
                      </div>

                      <div className="rounded-lg border border-tactical-border bg-tactical-panel/40 p-3">
                        <p className="text-[9px] font-bold uppercase tracking-wider text-gray-600">
                          Protocol
                        </p>
                        <p className="mt-1 font-medium uppercase text-gray-300">
                          {camera.connection_type}
                        </p>
                      </div>

                      <div className="rounded-lg border border-tactical-border bg-tactical-panel/40 p-3">
                        <p className="text-[9px] font-bold uppercase tracking-wider text-gray-600">
                          Source
                        </p>
                        <p className="mt-1 truncate font-medium text-gray-300">
                          {camera.host}:{camera.port}
                        </p>
                      </div>

                      <div className="rounded-lg border border-tactical-border bg-tactical-panel/40 p-3">
                        <p className="text-[9px] font-bold uppercase tracking-wider text-gray-600">
                          Last Seen
                        </p>
                        <p className="mt-1 truncate font-medium text-gray-300">
                          {camera.last_seen_at
                            ? formatDate(camera.last_seen_at)
                            : 'Never'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between border-t border-tactical-border pt-3">
                      <button
                        type="button"
                        onClick={() =>
                          toggleCameraActiveState(camera)
                        }
                        className={`rounded-lg border px-3 py-2 text-[10px] font-bold uppercase tracking-wider transition ${
                          camera.is_active
                            ? 'border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20'
                            : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
                        }`}
                      >
                        {camera.is_active
                          ? 'Disable'
                          : 'Enable'}
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          openEditCameraModal(camera)
                        }
                        className="inline-flex items-center gap-2 rounded-lg border border-tactical-border bg-tactical-panel/50 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-300 transition hover:border-tactical-accent/50 hover:text-white"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                        Configure
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <section className="overflow-hidden rounded-xl border border-tactical-border bg-tactical-panel/60 shadow-xl">
          <div className="flex items-center justify-between border-b border-tactical-border p-4">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-white">
                <Activity className="h-4 w-4 text-orange-300" />
                Live ANPR Alerts
              </h2>
              <p className="mt-1 text-xs text-gray-500">
                Genuine detections received from VisionFlow workers.
              </p>
            </div>

            <span className="rounded-full border border-orange-500/30 bg-orange-500/10 px-2.5 py-1 text-xs font-bold text-orange-300">
              {alerts.length}
            </span>
          </div>

          {!alerts.length ? (
            <div className="flex min-h-[280px] items-center justify-center p-6 text-center">
              <div>
                <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500/60" />
                <p className="mt-3 text-sm font-bold text-white">
                  No ANPR alerts
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  No real camera detections have been received.
                </p>
              </div>
            </div>
          ) : (
            <div className="max-h-[520px] divide-y divide-tactical-border overflow-y-auto">
              {alerts.map((alert) => (
                <article
                  key={alert.id}
                  className="p-4 transition hover:bg-tactical-bg/40"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-black uppercase tracking-wider text-white">
                          {alert.license_plate}
                        </span>
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${riskClasses(alert.risk_level)}`}
                        >
                          {alert.risk_level}
                        </span>
                      </div>

                      <p className="mt-2 flex items-center gap-2 text-xs text-gray-400">
                        <Camera className="h-3.5 w-3.5 text-tactical-accent" />
                        {alert.camera_location || alert.camera_id}
                      </p>

                      <p className="mt-1 flex items-center gap-2 text-xs text-gray-500">
                        <Clock className="h-3.5 w-3.5" />
                        {formatDate(alert.captured_at)}
                      </p>
                    </div>

                    <div className="rounded-lg border border-tactical-border bg-tactical-bg px-3 py-2 text-right">
                      <p className="text-[9px] font-bold uppercase tracking-wider text-gray-600">
                        Confidence
                      </p>
                      <p className="mt-1 text-sm font-bold text-tactical-accent">
                        {confidencePercentage(
                          alert.confidence_score
                        )}
                      </p>
                    </div>
                  </div>

                  {Number.isFinite(Number(alert.latitude)) &&
                    Number.isFinite(Number(alert.longitude)) && (
                      <p className="mt-3 flex items-center gap-2 rounded-lg border border-tactical-border bg-tactical-bg/60 px-3 py-2 text-[11px] text-gray-400">
                        <MapPin className="h-3.5 w-3.5 text-red-400" />
                        {Number(alert.latitude).toFixed(5)},
                        {' '}
                        {Number(alert.longitude).toFixed(5)}
                      </p>
                    )}
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="overflow-hidden rounded-xl border border-tactical-border bg-tactical-panel/60 shadow-xl">
          <div className="flex items-center justify-between border-b border-tactical-border p-4">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-white">
                <ShieldAlert className="h-4 w-4 text-red-300" />
                Plate Watchlist
              </h2>
              <p className="mt-1 text-xs text-gray-500">
                Case-linked targets monitored by ANPR workers.
              </p>
            </div>

            <button
              type="button"
              onClick={openWatchlistModal}
              className="rounded-lg border border-tactical-border bg-tactical-bg p-2 text-gray-400 transition hover:border-tactical-accent/50 hover:text-white"
              aria-label="Add watchlist target"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          {!watchlist.length ? (
            <div className="flex min-h-[280px] items-center justify-center p-6 text-center">
              <div>
                <Database className="mx-auto h-10 w-10 text-gray-600" />
                <p className="mt-3 text-sm font-bold text-white">
                  Watchlist is empty
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  Add an authorised plate linked to a case file.
                </p>
              </div>
            </div>
          ) : (
            <div className="max-h-[520px] divide-y divide-tactical-border overflow-y-auto">
              {watchlist.map((target) => (
                <article
                  key={target.id}
                  className="p-4 transition hover:bg-tactical-bg/40"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-black uppercase tracking-wider text-white">
                        {target.license_plate}
                      </p>

                      <p className="mt-2 flex items-start gap-2 text-xs leading-5 text-gray-400">
                        <Tag className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-600" />
                        <span>
                          {target.flag_reason ||
                            target.reason_flagged}
                        </span>
                      </p>

                      <p className="mt-2 flex items-center gap-2 text-[11px] text-gray-600">
                        <Clock className="h-3.5 w-3.5" />
                        Added {formatDate(target.created_at)}
                      </p>
                    </div>

                    <span
                      className={`rounded-full border px-2 py-1 text-[9px] font-bold uppercase tracking-wider ${riskClasses(target.risk_level)}`}
                    >
                      {target.risk_level}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      {isCameraModalOpen && (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-tactical-border bg-tactical-panel shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-tactical-border bg-tactical-panel px-5 py-4">
              <div>
                <h3 className="font-bold text-white">
                  {editingCamera
                    ? 'Configure Camera Source'
                    : 'Register Camera Source'}
                </h3>
                <p className="mt-1 text-xs text-gray-500">
                  Store only a protected credential reference.
                  Never enter camera passwords here.
                </p>
              </div>

              <button
                type="button"
                onClick={closeCameraModal}
                className="rounded-lg border border-tactical-border p-2 text-gray-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form
              onSubmit={handleCameraSubmit}
              className="space-y-5 p-5"
            >
              {cameraFormError && (
                <div className="flex items-start gap-3 rounded-lg border border-red-800/40 bg-red-950/30 p-3 text-sm text-red-200">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>{cameraFormError}</p>
                </div>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-1.5">
                  <span className="text-xs font-bold text-gray-400">
                    Camera name *
                  </span>
                  <input
                    required
                    minLength={2}
                    maxLength={100}
                    value={cameraForm.name}
                    onChange={(event) =>
                      updateCameraForm(
                        'name',
                        event.target.value
                      )
                    }
                    placeholder="North Gate Camera 01"
                    className="w-full rounded-lg border border-tactical-border bg-tactical-bg px-3 py-2.5 text-sm text-white outline-none focus:border-tactical-accent"
                  />
                </label>

                <label className="space-y-1.5">
                  <span className="text-xs font-bold text-gray-400">
                    Location *
                  </span>
                  <input
                    required
                    minLength={2}
                    maxLength={150}
                    value={cameraForm.location_name}
                    onChange={(event) =>
                      updateCameraForm(
                        'location_name',
                        event.target.value
                      )
                    }
                    placeholder="Client Site - North Gate"
                    className="w-full rounded-lg border border-tactical-border bg-tactical-bg px-3 py-2.5 text-sm text-white outline-none focus:border-tactical-accent"
                  />
                </label>

                <label className="space-y-1.5">
                  <span className="text-xs font-bold text-gray-400">
                    Manufacturer
                  </span>
                  <input
                    maxLength={50}
                    value={cameraForm.manufacturer}
                    onChange={(event) =>
                      updateCameraForm(
                        'manufacturer',
                        event.target.value
                      )
                    }
                    placeholder="Hikvision"
                    className="w-full rounded-lg border border-tactical-border bg-tactical-bg px-3 py-2.5 text-sm text-white outline-none focus:border-tactical-accent"
                  />
                </label>

                <label className="space-y-1.5">
                  <span className="text-xs font-bold text-gray-400">
                    Model
                  </span>
                  <input
                    maxLength={100}
                    value={cameraForm.model}
                    onChange={(event) =>
                      updateCameraForm(
                        'model',
                        event.target.value
                      )
                    }
                    placeholder="DS-2CD..."
                    className="w-full rounded-lg border border-tactical-border bg-tactical-bg px-3 py-2.5 text-sm text-white outline-none focus:border-tactical-accent"
                  />
                </label>

                <label className="space-y-1.5">
                  <span className="text-xs font-bold text-gray-400">
                    Serial number
                  </span>
                  <input
                    maxLength={100}
                    value={cameraForm.serial_number}
                    onChange={(event) =>
                      updateCameraForm(
                        'serial_number',
                        event.target.value
                      )
                    }
                    placeholder="Device serial"
                    className="w-full rounded-lg border border-tactical-border bg-tactical-bg px-3 py-2.5 text-sm text-white outline-none focus:border-tactical-accent"
                  />
                </label>

                <label className="space-y-1.5">
                  <span className="text-xs font-bold text-gray-400">
                    Connection type *
                  </span>
                  <select
                    required
                    value={cameraForm.connection_type}
                    onChange={(event) =>
                      updateCameraForm(
                        'connection_type',
                        event.target.value
                      )
                    }
                    className="w-full rounded-lg border border-tactical-border bg-tactical-bg px-3 py-2.5 text-sm text-white outline-none focus:border-tactical-accent"
                  >
                    <option value="rtsp">RTSP</option>
                    <option value="onvif">ONVIF</option>
                    <option value="http">HTTP</option>
                    <option value="hls">HLS</option>
                    <option value="webrtc">WebRTC</option>
                  </select>
                </label>

                <label className="space-y-1.5 md:col-span-2">
                  <span className="text-xs font-bold text-gray-400">
                    Host or device IP *
                  </span>
                  <input
                    required
                    maxLength={255}
                    value={cameraForm.host}
                    onChange={(event) =>
                      updateCameraForm(
                        'host',
                        event.target.value
                      )
                    }
                    placeholder="192.168.1.20 or camera.client.local"
                    className="w-full rounded-lg border border-tactical-border bg-tactical-bg px-3 py-2.5 text-sm text-white outline-none focus:border-tactical-accent"
                  />
                </label>

                <label className="space-y-1.5">
                  <span className="text-xs font-bold text-gray-400">
                    Port *
                  </span>
                  <input
                    required
                    type="number"
                    min="1"
                    max="65535"
                    value={cameraForm.port}
                    onChange={(event) =>
                      updateCameraForm(
                        'port',
                        event.target.value
                      )
                    }
                    className="w-full rounded-lg border border-tactical-border bg-tactical-bg px-3 py-2.5 text-sm text-white outline-none focus:border-tactical-accent"
                  />
                </label>

                <label className="space-y-1.5">
                  <span className="text-xs font-bold text-gray-400">
                    Stream path
                  </span>
                  <input
                    maxLength={255}
                    value={cameraForm.stream_path}
                    onChange={(event) =>
                      updateCameraForm(
                        'stream_path',
                        event.target.value
                      )
                    }
                    placeholder="/Streaming/Channels/101"
                    className="w-full rounded-lg border border-tactical-border bg-tactical-bg px-3 py-2.5 text-sm text-white outline-none focus:border-tactical-accent"
                  />
                </label>

                <label className="space-y-1.5">
                  <span className="text-xs font-bold text-gray-400">
                    Latitude
                  </span>
                  <input
                    type="number"
                    step="any"
                    min="-90"
                    max="90"
                    value={cameraForm.latitude}
                    onChange={(event) =>
                      updateCameraForm(
                        'latitude',
                        event.target.value
                      )
                    }
                    placeholder="-25.7479"
                    className="w-full rounded-lg border border-tactical-border bg-tactical-bg px-3 py-2.5 text-sm text-white outline-none focus:border-tactical-accent"
                  />
                </label>

                <label className="space-y-1.5">
                  <span className="text-xs font-bold text-gray-400">
                    Longitude
                  </span>
                  <input
                    type="number"
                    step="any"
                    min="-180"
                    max="180"
                    value={cameraForm.longitude}
                    onChange={(event) =>
                      updateCameraForm(
                        'longitude',
                        event.target.value
                      )
                    }
                    placeholder="28.1878"
                    className="w-full rounded-lg border border-tactical-border bg-tactical-bg px-3 py-2.5 text-sm text-white outline-none focus:border-tactical-accent"
                  />
                </label>

                <label className="space-y-1.5 md:col-span-2">
                  <span className="text-xs font-bold text-gray-400">
                    Credential reference
                  </span>
                  <input
                    maxLength={100}
                    value={cameraForm.credential_reference}
                    onChange={(event) =>
                      updateCameraForm(
                        'credential_reference',
                        event.target.value
                      )
                    }
                    placeholder="client-site/north-gate-camera"
                    className="w-full rounded-lg border border-tactical-border bg-tactical-bg px-3 py-2.5 text-sm text-white outline-none focus:border-tactical-accent"
                  />
                  <p className="text-[11px] leading-5 text-gray-600">
                    This is a reference to a protected secret. Do
                    not paste a username, password or RTSP URL
                    containing credentials.
                  </p>
                </label>

                <label className="space-y-1.5 md:col-span-2">
                  <span className="text-xs font-bold text-gray-400">
                    Browser gateway URL
                  </span>
                  <input
                    maxLength={500}
                    value={cameraForm.gateway_stream_url}
                    onChange={(event) =>
                      updateCameraForm(
                        'gateway_stream_url',
                        event.target.value
                      )
                    }
                    placeholder="https://gateway.example.com/live/camera-id/index.m3u8"
                    className="w-full rounded-lg border border-tactical-border bg-tactical-bg px-3 py-2.5 text-sm text-white outline-none focus:border-tactical-accent"
                  />
                  <p className="text-[11px] leading-5 text-gray-600">
                    Add this after the GuardFlow streaming gateway
                    converts RTSP into HLS or WebRTC.
                  </p>
                </label>
              </div>

              <label className="flex items-center justify-between gap-4 rounded-lg border border-tactical-border bg-tactical-bg/70 p-4">
                <div>
                  <p className="text-sm font-bold text-white">
                    Camera active
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    Active cameras are monitored by the gateway
                    worker.
                  </p>
                </div>

                <input
                  type="checkbox"
                  checked={cameraForm.is_active}
                  onChange={(event) =>
                    updateCameraForm(
                      'is_active',
                      event.target.checked
                    )
                  }
                  className="h-4 w-4 accent-blue-600"
                />
              </label>

              <div className="flex justify-end gap-3 border-t border-tactical-border pt-4">
                <button
                  type="button"
                  onClick={closeCameraModal}
                  disabled={cameraSubmitting}
                  className="rounded-lg border border-tactical-border px-4 py-2.5 text-xs font-bold text-gray-300 hover:text-white disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={cameraSubmitting}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-blue-500 disabled:opacity-50"
                >
                  {cameraSubmitting && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  {cameraSubmitting
                    ? 'Saving camera...'
                    : editingCamera
                      ? 'Save Configuration'
                      : 'Register Camera'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isWatchlistModalOpen && (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-xl border border-tactical-border bg-tactical-panel shadow-2xl">
            <div className="flex items-center justify-between border-b border-tactical-border px-5 py-4">
              <div>
                <h3 className="font-bold text-white">
                  Add Plate to Watchlist
                </h3>
                <p className="mt-1 text-xs text-gray-500">
                  Every target must be linked to an authorised case.
                </p>
              </div>

              <button
                type="button"
                onClick={closeWatchlistModal}
                className="rounded-lg border border-tactical-border p-2 text-gray-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form
              onSubmit={handleWatchlistSubmit}
              className="space-y-4 p-5"
            >
              {watchlistFormError && (
                <div className="flex items-start gap-3 rounded-lg border border-red-800/40 bg-red-950/30 p-3 text-sm text-red-200">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>{watchlistFormError}</p>
                </div>
              )}

              <label className="block space-y-1.5">
                <span className="text-xs font-bold text-gray-400">
                  Case file *
                </span>
                <select
                  required
                  value={watchlistForm.case_id}
                  onChange={(event) =>
                    updateWatchlistForm(
                      'case_id',
                      event.target.value
                    )
                  }
                  className="w-full rounded-lg border border-tactical-border bg-tactical-bg px-3 py-2.5 text-sm text-white outline-none focus:border-tactical-accent"
                >
                  {!cases.length ? (
                    <option value="">
                      No case files available
                    </option>
                  ) : (
                    cases.map((caseFile) => (
                      <option
                        key={caseFile.id}
                        value={caseFile.id}
                      >
                        {caseFile.case_number} - {caseFile.title}
                      </option>
                    ))
                  )}
                </select>
              </label>

              <label className="block space-y-1.5">
                <span className="text-xs font-bold text-gray-400">
                  Licence plate *
                </span>
                <input
                  required
                  maxLength={15}
                  value={watchlistForm.license_plate}
                  onChange={(event) =>
                    updateWatchlistForm(
                      'license_plate',
                      event.target.value
                    )
                  }
                  placeholder="GP 12 ABC"
                  className="w-full rounded-lg border border-tactical-border bg-tactical-bg px-3 py-2.5 text-sm uppercase text-white outline-none focus:border-tactical-accent"
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-xs font-bold text-gray-400">
                  Risk level *
                </span>
                <select
                  required
                  value={watchlistForm.risk_level}
                  onChange={(event) =>
                    updateWatchlistForm(
                      'risk_level',
                      event.target.value
                    )
                  }
                  className="w-full rounded-lg border border-tactical-border bg-tactical-bg px-3 py-2.5 text-sm text-white outline-none focus:border-tactical-accent"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </label>

              <label className="block space-y-1.5">
                <span className="text-xs font-bold text-gray-400">
                  Reason flagged *
                </span>
                <textarea
                  required
                  maxLength={500}
                  rows={4}
                  value={watchlistForm.flag_reason}
                  onChange={(event) =>
                    updateWatchlistForm(
                      'flag_reason',
                      event.target.value
                    )
                  }
                  placeholder="Describe the authorised operational reason."
                  className="w-full resize-none rounded-lg border border-tactical-border bg-tactical-bg px-3 py-2.5 text-sm text-white outline-none focus:border-tactical-accent"
                />
              </label>

              <div className="flex justify-end gap-3 border-t border-tactical-border pt-4">
                <button
                  type="button"
                  onClick={closeWatchlistModal}
                  disabled={watchlistSubmitting}
                  className="rounded-lg border border-tactical-border px-4 py-2.5 text-xs font-bold text-gray-300 hover:text-white disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={
                    watchlistSubmitting ||
                    !cases.length
                  }
                  className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-orange-500 disabled:opacity-50"
                >
                  {watchlistSubmitting && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  {watchlistSubmitting
                    ? 'Adding target...'
                    : 'Add Watchlist Target'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
