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
          normaliseList(sosData);

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

                <p className="text-2xl font-bold text-white