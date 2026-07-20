import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
} from 'react-leaflet';

import 'leaflet/dist/leaflet.css';

import L from 'leaflet';

import {
  AlertTriangle,
  Battery,
  CheckCircle,
  Clock,
  Loader2,
  MapPin,
  Navigation,
  Radio,
  RefreshCw,
  Shield,
  Smartphone,
  User,
} from 'lucide-react';

import { useAuth } from './context/AuthContext';


const API_URL = (
  import.meta.env.VITE_API_URL ||
  'https://guardflow-production.up.railway.app'
).replace(/\/$/, '');


const liveMarkerIcon = L.divIcon({
  className: 'guardflow-mobile-marker',
  html: `
    <div
      style="
        width:18px;
        height:18px;
        background:#22c55e;
        border:3px solid #ffffff;
        border-radius:50%;
        box-shadow:
          0 0 12px #22c55e,
          0 0 25px rgba(34,197,94,0.75);
      "
    ></div>
  `,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});


async function readResponse(response) {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return {
      detail: text,
    };
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


function formatCoordinates(latitude, longitude) {
  const parsedLatitude = Number(latitude);
  const parsedLongitude = Number(longitude);

  if (
    !Number.isFinite(parsedLatitude) ||
    !Number.isFinite(parsedLongitude)
  ) {
    return 'Awaiting GPS';
  }

  return (
    `${parsedLatitude.toFixed(5)}, ` +
    `${parsedLongitude.toFixed(5)}`
  );
}


function FitLiveMarkers({
  positions,
}) {
  const map = useMap();

  const positionKey = positions
    .map(
      (position) =>
        `${position[0]}:${position[1]}`
    )
    .join('|');

  useEffect(() => {
    if (!positions.length) {
      return;
    }

    if (positions.length === 1) {
      map.setView(
        positions[0],
        15,
        {
          animate: true,
        }
      );

      window.setTimeout(
        () => map.invalidateSize(),
        50
      );

      return;
    }

    const bounds = L.latLngBounds(
      positions
    );

    map.fitBounds(
      bounds,
      {
        padding: [40, 40],
        maxZoom: 15,
        animate: true,
      }
    );

    window.setTimeout(
      () => map.invalidateSize(),
      50
    );
  }, [
    map,
    positionKey,
    positions,
  ]);

  return null;
}


export default function MobileCommandCentre() {
  const {
    token,
    user,
    logout,
  } = useAuth();

  const userRole = user?.role || '';

  const canManageSOS = [
    'master',
    'admin',
    'dispatcher',
  ].includes(userRole);

  const [liveSubjects, setLiveSubjects] =
    useState([]);

  const [sosAlerts, setSOSAlerts] =
    useState([]);

  const [selectedSessionId, setSelectedSessionId] =
    useState(null);

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [error, setError] =
    useState('');

  const [busyAlertId, setBusyAlertId] =
    useState(null);


  const request = useCallback(
    async (
      path,
      options = {}
    ) => {
      const response = await fetch(
        `${API_URL}${path}`,
        {
          ...options,
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${token}`,
            ...(options.body
              ? {
                  'Content-Type':
                    'application/json',
                }
              : {}),
            ...(options.headers || {}),
          },
        }
      );

      const data = await readResponse(
        response
      );

      if (response.status === 401) {
        logout();

        throw new Error(
          'Your GuardFlow session expired. Please sign in again.'
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
    [
      logout,
      token,
    ]
  );


  const fetchOperationsData = useCallback(
    async ({
      showLoader = false,
    } = {}) => {
      if (showLoader) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      setError('');

      try {
        const [
          liveData,
          sosData,
        ] = await Promise.all([
          request(
            '/api/v1/mobile-tracking/live'
          ),
          request(
            '/api/v1/mobile-tracking/sos'
          ),
        ]);

        const liveList =
          normaliseList(liveData);

        const sosList =
          normaliseList(sosData).filter(
            (alert) =>
              alert.status === 'active' ||
              alert.status === 'acknowledged'
          );

        setLiveSubjects(liveList);
        setSOSAlerts(sosList);

        setSelectedSessionId(
          (currentSessionId) => {
            const currentStillExists =
              liveList.some(
                (item) =>
                  item.session?.id ===
                  currentSessionId
              );

            if (currentStillExists) {
              return currentSessionId;
            }

            return (
              liveList[0]?.session?.id ||
              null
            );
          }
        );
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'Unable to load mobile tracking operations.'
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [
      request,
    ]
  );


  useEffect(() => {
    fetchOperationsData({
      showLoader: true,
    });

    const intervalId =
      window.setInterval(
        () => {
          fetchOperationsData();
        },
        10000
      );

    return () => {
      window.clearInterval(
        intervalId
      );
    };
  }, [
    fetchOperationsData,
  ]);


  const selectedLiveSubject =
    useMemo(
      () =>
        liveSubjects.find(
          (item) =>
            item.session?.id ===
            selectedSessionId
        ) ||
        liveSubjects[0] ||
        null,
      [
        liveSubjects,
        selectedSessionId,
      ]
    );


  const livePositions =
    useMemo(
      () =>
        liveSubjects
          .map((item) => {
            const latitude = Number(
              item.latest_location?.latitude
            );

            const longitude = Number(
              item.latest_location?.longitude
            );

            if (
              !Number.isFinite(latitude) ||
              !Number.isFinite(longitude)
            ) {
              return null;
            }

            return {
              item,
              position: [
                latitude,
                longitude,
              ],
            };
          })
          .filter(Boolean),
      [
        liveSubjects,
      ]
    );


  const markerPositions =
    useMemo(
      () =>
        livePositions.map(
          (entry) =>
            entry.position
        ),
      [
        livePositions,
      ]
    );


  const mapCenter =
    livePositions[0]?.position ||
    [
      -25.7479,
      28.1878,
    ];


  const activeSOSCount =
    sosAlerts.filter(
      (alert) =>
        alert.status === 'active'
    ).length;


  const acknowledgedSOSCount =
    sosAlerts.filter(
      (alert) =>
        alert.status ===
        'acknowledged'
    ).length;


  const onlineDeviceCount =
    liveSubjects.filter(
      (item) =>
        item.device_status === 'online'
    ).length;


  const actionSOSAlert =
    async (
      alertId,
      action
    ) => {
      setBusyAlertId(alertId);
      setError('');

      try {
        await request(
          `/api/v1/mobile-tracking/sos/${alertId}/action`,
          {
            method: 'POST',
            body: JSON.stringify({
              action,
            }),
          }
        );

        await fetchOperationsData();
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'Unable to update the SOS alert.'
        );
      } finally {
        setBusyAlertId(null);
      }
    };


  const selectedLocation =
    selectedLiveSubject?.latest_location;


  return (
    <div className="space-y-5">
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          {
            label: 'Live Subjects',
            value: liveSubjects.length,
            icon: User,
            iconClass:
              'text-blue-400',
          },
          {
            label: 'Online Phones',
            value: onlineDeviceCount,
            icon: Smartphone,
            iconClass:
              'text-green-400',
          },
          {
            label: 'Active SOS',
            value: activeSOSCount,
            icon: AlertTriangle,
            iconClass:
              'text-red-400',
          },
          {
            label: 'Acknowledged',
            value:
              acknowledgedSOSCount,
            icon: CheckCircle,
            iconClass:
              'text-yellow-400',
          },
        ].map(
          ({
            label,
            value,
            icon: Icon,
            iconClass,
          }) => (
            <div
              key={label}
              className="bg-tactical-panel border border-tactical-border rounded-xl p-5 flex items-center justify-between"
            >
              <div>
                <p className="text-[10px] uppercase tracking-wider font-bold text-gray-500">
                  {label}
                </p>

                <p className="text-2xl font-bold text-white mt-1">
                  {value}
                </p>
              </div>

              <div className="w-11 h-11 rounded-xl bg-tactical-bg border border-tactical-border flex items-center justify-center">
                <Icon
                  className={`w-5 h-5 ${iconClass}`}
                />
              </div>
            </div>
          )
        )}
      </section>


      {error && (
        <div className="p-4 bg-red-950/30 border border-red-800/40 rounded-xl text-sm text-red-200">
          {error}
        </div>
      )}


      <section className="flex flex-col xl:flex-row min-h-[650px] bg-tactical-bg border border-tactical-border rounded-xl overflow-hidden shadow-xl">
        <aside className="w-full xl:w-80 bg-tactical-panel/80 border-b xl:border-b-0 xl:border-r border-tactical-border flex flex-col max-h-[390px] xl:max-h-none">
          <div className="p-4 border-b border-tactical-border flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-white">
                Mobile Units
              </p>

              <p className="text-[10px] text-gray-500 mt-1">
                Consent-based live sessions
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                fetchOperationsData()
              }
              disabled={refreshing}
              className="p-2 rounded-lg border border-tactical-border text-gray-400 hover:text-white disabled:opacity-50"
              aria-label="Refresh mobile operations"
            >
              <RefreshCw
                className={`w-4 h-4 ${
                  refreshing
                    ? 'animate-spin'
                    : ''
                }`}
              />
            </button>
          </div>


          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {loading ? (
              <div className="py-16 flex flex-col items-center justify-center gap-3 text-gray-400">
                <Loader2 className="w-6 h-6 animate-spin text-tactical-accent" />

                <p className="text-xs">
                  Loading mobile operations...
                </p>
              </div>
            ) : liveSubjects.length === 0 ? (
              <div className="py-16 text-center text-gray-500">
                <Radio className="w-8 h-8 mx-auto mb-3 text-gray-600" />

                <p className="text-xs">
                  No authorised mobile tracking sessions are active.
                </p>
              </div>
            ) : (
              liveSubjects.map(
                (item) => {
                  const isSelected =
                    item.session?.id ===
                    selectedLiveSubject
                      ?.session?.id;

                  return (
                    <button
                      key={
                        item.session.id
                      }
                      type="button"
                      onClick={() =>
                        setSelectedSessionId(
                          item.session.id
                        )
                      }
                      className={`w-full text-left p-4 rounded-xl border transition-colors ${
                        isSelected
                          ? 'bg-blue-600/10 border-tactical-accent'
                          : 'bg-tactical-bg/60 border-tactical-border hover:border-blue-500/40'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-white truncate">
                            {
                              item.subject
                                ?.display_name ||
                              'Unnamed subject'
                            }
                          </p>

                          <p className="text-[10px] uppercase tracking-wider text-blue-400 font-semibold mt-1">
                            {
                              item.subject
                                ?.subject_type ||
                              'subject'
                            }
                          </p>
                        </div>

                        <span
                          className={`w-2.5 h-2.5 mt-1 rounded-full ${
                            item.device_status ===
                            'online'
                              ? 'bg-green-500 animate-pulse'
                              : 'bg-gray-600'
                          }`}
                        />
                      </div>

                      <div className="mt-3 space-y-1">
                        <p className="text-[11px] text-gray-400">
                          {formatCoordinates(
                            item
                              .latest_location
                              ?.latitude,
                            item
                              .latest_location
                              ?.longitude
                          )}
                        </p>

                        <p className="text-[10px] text-gray-600 break-all">
                          Session:{' '}
                          {item.session.id}
                        </p>
                      </div>
                    </button>
                  );
                }
              )
            )}
          </div>
        </aside>


        <div className="flex-1 flex flex-col min-w-0">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-tactical-border border-b border-tactical-border">
            {[
              {
                label: 'Coordinates',
                value:
                  formatCoordinates(
                    selectedLocation
                      ?.latitude,
                    selectedLocation
                      ?.longitude
                  ),
                icon: MapPin,
                iconClass:
                  'text-red-400',
              },
              {
                label: 'Battery',
                value:
                  selectedLocation
                    ?.battery_percentage !==
                    null &&
                  selectedLocation
                    ?.battery_percentage !==
                    undefined
                    ? `${selectedLocation.battery_percentage}%`
                    : '--',
                icon: Battery,
                iconClass:
                  'text-green-400',
              },
              {
                label: 'Speed',
                value:
                  selectedLocation
                    ?.speed_kmh !==
                    null &&
                  selectedLocation
                    ?.speed_kmh !==
                    undefined
                    ? `${selectedLocation.speed_kmh} km/h`
                    : '--',
                icon: Navigation,
                iconClass:
                  'text-blue-400',
              },
              {
                label: 'Last GPS',
                value:
                  formatDateTime(
                    selectedLocation
                      ?.recorded_at
                  ),
                icon: Clock,
                iconClass:
                  'text-yellow-400',
              },
            ].map(
              ({
                label,
                value,
                icon: Icon,
                iconClass,
              }) => (
                <div
                  key={label}
                  className="bg-tactical-panel/70 p-4 flex items-center gap-3"
                >
                  <Icon
                    className={`w-5 h-5 shrink-0 ${iconClass}`}
                  />

                  <div className="min-w-0">
                    <p className="text-[9px] uppercase tracking-wider font-bold text-gray-500">
                      {label}
                    </p>

                    <p className="text-xs font-semibold text-white mt-1 truncate">
                      {value}
                    </p>
                  </div>
                </div>
              )
            )}
          </div>


          <div
            className="flex-1 relative"
            style={{
              minHeight: '520px',
              background: '#090D16',
            }}
          >
            <MapContainer
              center={mapCenter}
              zoom={13}
              style={{
                width: '100%',
                height: '100%',
                minHeight: '520px',
              }}
            >
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution="&copy; OpenStreetMap contributors"
              />

              <FitLiveMarkers
                positions={markerPositions}
              />

              {livePositions.map(
                ({
                  item,
                  position,
                }) => (
                  <Marker
                    key={
                      item.session.id
                    }
                    position={position}
                    icon={liveMarkerIcon}
                    eventHandlers={{
                      click: () =>
                        setSelectedSessionId(
                          item.session.id
                        ),
                    }}
                  >
                    <Popup>
                      <strong>
                        {
                          item.subject
                            ?.display_name ||
                          'Unnamed subject'
                        }
                      </strong>

                      <br />

                      {
                        item.subject
                          ?.subject_type ||
                        'subject'
                      }

                      <br />

                      Device:{' '}
                      {
                        item.device_status ||
                        'unknown'
                      }
                    </Popup>
                  </Marker>
                )
              )}
            </MapContainer>

            {!livePositions.length &&
              !loading && (
                <div className="absolute inset-0 z-[500] pointer-events-none flex items-center justify-center">
                  <div className="bg-tactical-panel/95 border border-tactical-border rounded-xl px-5 py-4 text-center shadow-xl">
                    <MapPin className="w-7 h-7 mx-auto text-gray-600" />

                    <p className="text-sm font-semibold text-white mt-2">
                      Awaiting live GPS
                    </p>

                    <p className="text-xs text-gray-500 mt-1">
                      No authorised phone has submitted a location.
                    </p>
                  </div>
                </div>
              )}
          </div>
        </div>
      </section>


      <section className="bg-tactical-panel border border-tactical-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-tactical-border flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-red-600/10 border border-red-500/20 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4 text-red-400" />
            </div>

            <div>
              <p className="text-sm font-bold text-white uppercase tracking-wide">
                Mobile SOS Queue
              </p>

              <p className="text-[10px] text-gray-500 mt-1">
                Active and acknowledged emergency alerts
              </p>
            </div>
          </div>

          <Shield className="w-5 h-5 text-blue-400" />
        </div>


        <div className="p-5">
          {sosAlerts.length === 0 ? (
            <div className="py-12 text-center text-gray-500">
              <CheckCircle className="w-8 h-8 mx-auto mb-3 text-green-600" />

              <p className="text-sm font-medium text-gray-300">
                No open mobile SOS alerts
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {sosAlerts.map(
                (alert) => {
                  const isBusy =
                    busyAlertId ===
                    alert.id;

                  return (
                    <article
                      key={alert.id}
                      className="bg-tactical-bg border border-red-900/30 rounded-xl p-4"
                    >
                      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`text-[10px] uppercase tracking-wider font-bold px-2.5 py-1 rounded-full ${
                                alert.status ===
                                'active'
                                  ? 'bg-red-950/60 text-red-300 border border-red-800/50'
                                  : 'bg-yellow-950/50 text-yellow-300 border border-yellow-800/40'
                              }`}
                            >
                              {
                                alert.status
                              }
                            </span>

                            <span className="text-[10px] text-gray-500">
                              {
                                formatDateTime(
                                  alert.triggered_at
                                )
                              }
                            </span>
                          </div>

                          <p className="text-sm font-semibold text-white mt-3">
                            {
                              alert.message ||
                              'Mobile SOS alert'
                            }
                          </p>

                          <p className="text-xs text-gray-400 mt-2">
                            {formatCoordinates(
                              alert.latitude,
                              alert.longitude
                            )}
                          </p>

                          <p className="text-[10px] font-mono text-gray-600 mt-2 break-all">
                            Alert ID:{' '}
                            {alert.id}
                          </p>
                        </div>


                        {canManageSOS && (
                          <div className="flex flex-wrap items-center gap-2 shrink-0">
                            {alert.status ===
                              'active' && (
                              <button
                                type="button"
                                disabled={
                                  isBusy
                                }
                                onClick={() =>
                                  actionSOSAlert(
                                    alert.id,
                                    'acknowledge'
                                  )
                                }
                                className="px-3 py-2 rounded-lg border border-yellow-700/40 bg-yellow-950/30 text-yellow-300 hover:bg-yellow-900/40 text-xs font-bold disabled:opacity-50"
                              >
                                Acknowledge
                              </button>
                            )}

                            {[
                              'active',
                              'acknowledged',
                            ].includes(
                              alert.status
                            ) && (
                              <button
                                type="button"
                                disabled={
                                  isBusy
                                }
                                onClick={() =>
                                  actionSOSAlert(
                                    alert.id,
                                    'resolve'
                                  )
                                }
                                className="px-3 py-2 rounded-lg bg-green-700 hover:bg-green-600 text-white text-xs font-bold flex items-center gap-2 disabled:opacity-50"
                              >
                                {isBusy && (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                )}

                                Resolve
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </article>
                  );
                }
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
