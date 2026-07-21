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
  Copy,
  KeyRound,
  Loader2,
  MapPin,
  Navigation,
  Play,
  Plus,
  Power,
  Radio,
  RefreshCw,
  Shield,
  Smartphone,
  Square,
  User,
  Users,
  X,
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


function toLocalDateTimeValue(date) {
  const timezoneOffset = date.getTimezoneOffset() * 60000;

  return new Date(date.getTime() - timezoneOffset)
    .toISOString()
    .slice(0, 16);
}


function createDefaultEndTime() {
  const endTime = new Date();
  endTime.setHours(endTime.getHours() + 8);
  return toLocalDateTimeValue(endTime);
}


function createDefaultDeviceId() {
  const timestamp = Date.now()
    .toString(36)
    .toUpperCase();

  const randomPart = Math.random()
    .toString(36)
    .slice(2, 6)
    .toUpperCase();

  return `GF-MOBILE-${timestamp}-${randomPart}`;
}


function Modal({
  title,
  subtitle,
  onClose,
  children,
  maxWidth = 'max-w-xl',
}) {
  return (
    <div className="fixed inset-0 z-[1400] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div
        className={`w-full ${maxWidth} max-h-[92vh] bg-tactical-panel border border-tactical-border rounded-2xl shadow-2xl overflow-hidden flex flex-col`}
      >
        <div className="px-5 py-4 border-b border-tactical-border flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-white">
              {title}
            </h2>

            {subtitle && (
              <p className="text-xs text-gray-500 mt-1">
                {subtitle}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-tactical-border/40"
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
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

  const canManageRegistry = [
    'master',
    'admin',
  ].includes(userRole);

  const canControlSessions = [
    'master',
    'admin',
    'dispatcher',
  ].includes(userRole);

  const canManageSOS = canControlSessions;

  const [liveSubjects, setLiveSubjects] =
    useState([]);

  const [sosAlerts, setSOSAlerts] =
    useState([]);

  const [subjects, setSubjects] =
    useState([]);

  const [devices, setDevices] =
    useState([]);

  const [sessions, setSessions] =
    useState([]);

  const [cases, setCases] =
    useState([]);

  const [operators, setOperators] =
    useState([]);

  const [selectedSessionId, setSelectedSessionId] =
    useState(null);

  const [loading, setLoading] =
    useState(true);

  const [registryLoading, setRegistryLoading] =
    useState(false);

  const [refreshing, setRefreshing] =
    useState(false);

  const [error, setError] =
    useState('');

  const [actionError, setActionError] =
    useState('');

  const [busyAlertId, setBusyAlertId] =
    useState(null);

  const [busyDeviceId, setBusyDeviceId] =
    useState(null);

  const [busySessionId, setBusySessionId] =
    useState(null);

  const [activeModal, setActiveModal] =
    useState(null);

  const [formSaving, setFormSaving] =
    useState(false);

  const [formError, setFormError] =
    useState('');

  const [credentials, setCredentials] =
    useState(null);

  const [copiedField, setCopiedField] =
    useState('');

  const [subjectType, setSubjectType] =
    useState('client');

  const [subjectDisplayName, setSubjectDisplayName] =
    useState('');

  const [subjectOperatorId, setSubjectOperatorId] =
    useState('');

  const [subjectPhoneNumber, setSubjectPhoneNumber] =
    useState('');

  const [
    subjectExternalReference,
    setSubjectExternalReference,
  ] = useState('');

  const [deviceSubjectId, setDeviceSubjectId] =
    useState('');

  const [deviceReadableId, setDeviceReadableId] =
    useState(createDefaultDeviceId);

  const [deviceName, setDeviceName] =
    useState('');

  const [devicePlatform, setDevicePlatform] =
    useState('android');

  const [deviceAppVersion, setDeviceAppVersion] =
    useState('1.0.0');

  const [sessionSubjectId, setSessionSubjectId] =
    useState('');

  const [sessionDeviceId, setSessionDeviceId] =
    useState('');

  const [sessionCaseId, setSessionCaseId] =
    useState('');

  const [sessionExpectedEnd, setSessionExpectedEnd] =
    useState(createDefaultEndTime);

  const [sessionConsentConfirmed, setSessionConsentConfirmed] =
    useState(false);

  const [sessionConsentReference, setSessionConsentReference] =
    useState('');


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
        const detail = Array.isArray(
          data?.detail
        )
          ? data.detail
              .map(
                (item) =>
                  item?.msg ||
                  JSON.stringify(item)
              )
              .join(' ')
          : data?.detail;

        throw new Error(
          detail ||
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


  const fetchRegistryData = useCallback(
    async ({
      showLoader = false,
    } = {}) => {
      if (
        !canManageRegistry &&
        !canControlSessions
      ) {
        return;
      }

      if (showLoader) {
        setRegistryLoading(true);
      }

      setActionError('');

      try {
        const sessionPromise = request(
          '/api/v1/mobile-tracking/sessions'
        );

        const casePromise = request(
          '/api/v1/cases/'
        );

        if (canManageRegistry) {
          const [
            subjectData,
            deviceData,
            sessionData,
            caseData,
            operatorData,
          ] = await Promise.all([
            request(
              '/api/v1/mobile-tracking/subjects'
            ),
            request(
              '/api/v1/mobile-tracking/devices'
            ),
            sessionPromise,
            casePromise,
            request(
              '/api/v1/operators/'
            ),
          ]);

          setSubjects(
            normaliseList(subjectData)
          );

          setDevices(
            normaliseList(deviceData)
          );

          setSessions(
            normaliseList(sessionData)
          );

          setCases(
            normaliseList(caseData)
          );

          setOperators(
            normaliseList(operatorData)
          );
        } else {
          const [
            sessionData,
            caseData,
          ] = await Promise.all([
            sessionPromise,
            casePromise,
          ]);

          setSessions(
            normaliseList(sessionData)
          );

          setCases(
            normaliseList(caseData)
          );
        }
      } catch (requestError) {
        setActionError(
          requestError instanceof Error
            ? requestError.message
            : 'Unable to load mobile registry information.'
        );
      } finally {
        setRegistryLoading(false);
      }
    },
    [
      canControlSessions,
      canManageRegistry,
      request,
    ]
  );


  const refreshAll = useCallback(
    async ({
      showLoader = false,
    } = {}) => {
      await Promise.all([
        fetchOperationsData({
          showLoader,
        }),
        fetchRegistryData({
          showLoader,
        }),
      ]);
    },
    [
      fetchOperationsData,
      fetchRegistryData,
    ]
  );


  useEffect(() => {
    refreshAll({
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
    refreshAll,
  ]);


  const subjectById = useMemo(
    () =>
      new Map(
        subjects.map(
          (subject) => [
            subject.id,
            subject,
          ]
        )
      ),
    [
      subjects,
    ]
  );


  const deviceById = useMemo(
    () =>
      new Map(
        devices.map(
          (device) => [
            device.id,
            device,
          ]
        )
      ),
    [
      devices,
    ]
  );


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


  const activeSubjects = useMemo(
    () =>
      subjects.filter(
        (subject) =>
          subject.is_active
      ),
    [
      subjects,
    ]
  );


  const activeDevices = useMemo(
    () =>
      devices.filter(
        (device) =>
          device.is_active
      ),
    [
      devices,
    ]
  );


  const openSessions = useMemo(
    () =>
      sessions.filter(
        (session) =>
          session.status === 'active' ||
          session.status === 'pending'
      ),
    [
      sessions,
    ]
  );


  const availableSessionDevices = useMemo(
    () =>
      activeDevices.filter(
        (device) =>
          device.subject_id ===
          sessionSubjectId
      ),
    [
      activeDevices,
      sessionSubjectId,
    ]
  );


  const selectedSessionSubject =
    subjectById.get(
      sessionSubjectId
    ) || null;


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


  const selectedLocation =
    selectedLiveSubject?.latest_location;


  const resetSubjectForm = () => {
    setSubjectType('client');
    setSubjectDisplayName('');
    setSubjectOperatorId('');
    setSubjectPhoneNumber('');
    setSubjectExternalReference('');
  };


  const resetDeviceForm = () => {
    setDeviceSubjectId(
      activeSubjects[0]?.id ||
      ''
    );

    setDeviceReadableId(
      createDefaultDeviceId()
    );

    setDeviceName('');
    setDevicePlatform('android');
    setDeviceAppVersion('1.0.0');
  };


  const resetSessionForm = () => {
    const firstSubject =
      activeSubjects[0] ||
      null;

    const firstSubjectId =
      firstSubject?.id ||
      '';

    const firstDevice =
      activeDevices.find(
        (device) =>
          device.subject_id ===
          firstSubjectId
      );

    setSessionSubjectId(
      firstSubjectId
    );

    setSessionDeviceId(
      firstDevice?.id ||
      ''
    );

    setSessionCaseId('');
    setSessionExpectedEnd(
      createDefaultEndTime()
    );

    setSessionConsentConfirmed(
      false
    );

    setSessionConsentReference('');
  };


  const openModal = (
    modalName
  ) => {
    setFormError('');

    if (modalName === 'subject') {
      resetSubjectForm();
    }

    if (modalName === 'device') {
      resetDeviceForm();
    }

    if (modalName === 'session') {
      resetSessionForm();
    }

    setActiveModal(modalName);
  };


  const closeModal = () => {
    if (formSaving) {
      return;
    }

    setActiveModal(null);
    setFormError('');
  };


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


  const createSubject =
    async (
      event
    ) => {
      event.preventDefault();
      setFormSaving(true);
      setFormError('');

      try {
        const cleanName =
          subjectDisplayName.trim();

        if (!cleanName) {
          throw new Error(
            'Enter the subject name.'
          );
        }

        if (
          subjectType === 'guard' &&
          !subjectOperatorId
        ) {
          throw new Error(
            'Select the GuardFlow operator linked to this guard.'
          );
        }

        await request(
          '/api/v1/mobile-tracking/subjects',
          {
            method: 'POST',
            body: JSON.stringify({
              subject_type:
                subjectType,
              display_name:
                cleanName,
              operator_id:
                subjectType === 'guard'
                  ? subjectOperatorId
                  : null,
              phone_number:
                subjectPhoneNumber
                  .trim() ||
                null,
              external_reference:
                subjectExternalReference
                  .trim() ||
                null,
              is_active: true,
            }),
          }
        );

        setActiveModal(null);
        await fetchRegistryData({
          showLoader: true,
        });
      } catch (requestError) {
        setFormError(
          requestError instanceof Error
            ? requestError.message
            : 'Unable to add the mobile subject.'
        );
      } finally {
        setFormSaving(false);
      }
    };


  const registerDevice =
    async (
      event
    ) => {
      event.preventDefault();
      setFormSaving(true);
      setFormError('');

      try {
        if (!deviceSubjectId) {
          throw new Error(
            'Select a subject for this phone.'
          );
        }

        const cleanDeviceId =
          deviceReadableId.trim();

        if (
          cleanDeviceId.length < 8
        ) {
          throw new Error(
            'The device ID must contain at least eight characters.'
          );
        }

        const result = await request(
          '/api/v1/mobile-tracking/devices',
          {
            method: 'POST',
            body: JSON.stringify({
              subject_id:
                deviceSubjectId,
              device_id:
                cleanDeviceId,
              device_name:
                deviceName.trim() ||
                null,
              platform:
                devicePlatform,
              app_version:
                deviceAppVersion
                  .trim() ||
                null,
              is_active: true,
            }),
          }
        );

        setActiveModal(null);

        setCredentials({
          title:
            'Phone Registered',
          message:
            'Save these credentials now. The mobile token will never be shown again.',
          deviceId:
            result.device_id,
          token:
            result.mobile_device_token,
          recordId:
            result.id,
        });

        await fetchRegistryData({
          showLoader: true,
        });
      } catch (requestError) {
        setFormError(
          requestError instanceof Error
            ? requestError.message
            : 'Unable to register the phone.'
        );
      } finally {
        setFormSaving(false);
      }
    };


  const startSession =
    async (
      event
    ) => {
      event.preventDefault();
      setFormSaving(true);
      setFormError('');

      try {
        if (!sessionSubjectId) {
          throw new Error(
            'Select the person who will be tracked.'
          );
        }

        if (!sessionDeviceId) {
          throw new Error(
            'Select the registered phone.'
          );
        }

        if (!sessionExpectedEnd) {
          throw new Error(
            'Choose when the tracking session must end.'
          );
        }

        const sessionType =
          selectedSessionSubject
            ?.subject_type === 'guard'
            ? 'guard_shift'
            : 'client_protection';

        if (
          sessionType ===
            'client_protection' &&
          !sessionConsentConfirmed
        ) {
          throw new Error(
            'Client consent must be confirmed before tracking starts.'
          );
        }

        if (
          sessionType ===
            'client_protection' &&
          !sessionConsentReference.trim()
        ) {
          throw new Error(
            'Enter an auditable client-consent reference.'
          );
        }

        const endTime = new Date(
          sessionExpectedEnd
        );

        if (
          Number.isNaN(
            endTime.getTime()
          )
        ) {
          throw new Error(
            'The selected end time is invalid.'
          );
        }

        await request(
          '/api/v1/mobile-tracking/sessions',
          {
            method: 'POST',
            body: JSON.stringify({
              subject_id:
                sessionSubjectId,
              device_id:
                sessionDeviceId,
              session_type:
                sessionType,
              case_id:
                sessionCaseId ||
                null,
              expected_end_at:
                endTime.toISOString(),
              consent_confirmed:
                sessionType ===
                  'client_protection'
                  ? sessionConsentConfirmed
                  : false,
              consent_reference:
                sessionType ===
                  'client_protection'
                  ? sessionConsentReference
                      .trim()
                  : null,
            }),
          }
        );

        setActiveModal(null);
        await refreshAll({
          showLoader: true,
        });
      } catch (requestError) {
        setFormError(
          requestError instanceof Error
            ? requestError.message
            : 'Unable to start the tracking session.'
        );
      } finally {
        setFormSaving(false);
      }
    };


  const endSession =
    async (
      session
    ) => {
      const subject =
        subjectById.get(
          session.subject_id
        );

      const confirmed =
        window.confirm(
          `End tracking for ${
            subject?.display_name ||
            'this subject'
          } now?`
        );

      if (!confirmed) {
        return;
      }

      setBusySessionId(
        session.id
      );

      setActionError('');

      try {
        await request(
          `/api/v1/mobile-tracking/sessions/${session.id}/end`,
          {
            method: 'POST',
            body: JSON.stringify({
              consent_revoked: false,
              reason:
                'Ended from the GuardFlow Mobile Command Centre.',
            }),
          }
        );

        await refreshAll({
          showLoader: true,
        });
      } catch (requestError) {
        setActionError(
          requestError instanceof Error
            ? requestError.message
            : 'Unable to end the tracking session.'
        );
      } finally {
        setBusySessionId(null);
      }
    };


  const toggleDevice =
    async (
      device
    ) => {
      if (
        device.is_active &&
        !window.confirm(
          `Disable ${device.device_name || device.device_id}? The phone will immediately lose access.`
        )
      ) {
        return;
      }

      setBusyDeviceId(
        device.id
      );

      setActionError('');

      try {
        await request(
          `/api/v1/mobile-tracking/devices/${device.id}`,
          {
            method: 'PATCH',
            body: JSON.stringify({
              is_active:
                !device.is_active,
            }),
          }
        );

        await refreshAll({
          showLoader: true,
        });
      } catch (requestError) {
        setActionError(
          requestError instanceof Error
            ? requestError.message
            : 'Unable to update the phone.'
        );
      } finally {
        setBusyDeviceId(null);
      }
    };


  const rotateDeviceToken =
    async (
      device
    ) => {
      const confirmed =
        window.confirm(
          `Rotate the token for ${device.device_name || device.device_id}? The previous token will stop working immediately.`
        );

      if (!confirmed) {
        return;
      }

      setBusyDeviceId(
        device.id
      );

      setActionError('');

      try {
        const result = await request(
          `/api/v1/mobile-tracking/devices/${device.id}/rotate-token`,
          {
            method: 'POST',
          }
        );

        setCredentials({
          title:
            'Phone Token Rotated',
          message:
            'Replace the token in the mobile app now. The previous token is already invalid.',
          deviceId:
            result.device_id,
          token:
            result.mobile_device_token,
          recordId:
            result.id,
        });

        await refreshAll({
          showLoader: true,
        });
      } catch (requestError) {
        setActionError(
          requestError instanceof Error
            ? requestError.message
            : 'Unable to rotate the phone token.'
        );
      } finally {
        setBusyDeviceId(null);
      }
    };


  const copyCredential =
    async (
      label,
      value
    ) => {
      try {
        await navigator.clipboard.writeText(
          value
        );

        setCopiedField(label);

        window.setTimeout(
          () => {
            setCopiedField('');
          },
          1500
        );
      } catch {
        setCopiedField('');
      }
    };


  useEffect(() => {
    if (
      !sessionSubjectId
    ) {
      setSessionDeviceId('');
      return;
    }

    const stillValid =
      availableSessionDevices.some(
        (device) =>
          device.id ===
          sessionDeviceId
      );

    if (!stillValid) {
      setSessionDeviceId(
        availableSessionDevices[0]
          ?.id ||
        ''
      );
    }
  }, [
    availableSessionDevices,
    sessionDeviceId,
    sessionSubjectId,
  ]);


  return (
    <div className="space-y-5">
      <section className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-tactical-panel border border-tactical-border rounded-xl p-4">
        <div>
          <p className="text-sm font-bold text-white uppercase tracking-wide">
            Mobile Operations
          </p>

          <p className="text-xs text-gray-500 mt-1">
            Register authorised phones, start time-limited sessions and respond to SOS alerts.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canManageRegistry && (
            <>
              <button
                type="button"
                onClick={() =>
                  openModal('subject')
                }
                className="px-3 py-2 rounded-lg border border-blue-500/30 bg-blue-600/10 text-blue-300 hover:bg-blue-600 hover:text-white text-xs font-bold flex items-center gap-2"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Subject
              </button>

              <button
                type="button"
                onClick={() =>
                  openModal('device')
                }
                disabled={
                  activeSubjects.length === 0
                }
                className="px-3 py-2 rounded-lg border border-blue-500/30 bg-blue-600/10 text-blue-300 hover:bg-blue-600 hover:text-white text-xs font-bold flex items-center gap-2 disabled:opacity-40"
              >
                <Smartphone className="w-3.5 h-3.5" />
                Register Phone
              </button>
            </>
          )}

          {canControlSessions && (
            <button
              type="button"
              onClick={() =>
                openModal('session')
              }
              disabled={
                activeSubjects.length === 0 ||
                activeDevices.length === 0
              }
              className="px-3 py-2 rounded-lg bg-green-700 hover:bg-green-600 text-white text-xs font-bold flex items-center gap-2 disabled:opacity-40"
            >
              <Play className="w-3.5 h-3.5" />
              Start Session
            </button>
          )}

          <button
            type="button"
            onClick={() =>
              refreshAll()
            }
            disabled={
              refreshing ||
              registryLoading
            }
            className="p-2 rounded-lg border border-tactical-border text-gray-400 hover:text-white disabled:opacity-50"
            aria-label="Refresh mobile operations"
          >
            <RefreshCw
              className={`w-4 h-4 ${
                refreshing ||
                registryLoading
                  ? 'animate-spin'
                  : ''
              }`}
            />
          </button>
        </div>
      </section>


      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          {
            label: 'Registered Subjects',
            value: subjects.length,
            icon: Users,
            iconClass:
              'text-blue-400',
          },
          {
            label: 'Registered Phones',
            value: devices.length,
            icon: Smartphone,
            iconClass:
              'text-green-400',
          },
          {
            label: 'Live Sessions',
            value: liveSubjects.length,
            icon: Radio,
            iconClass:
              'text-cyan-400',
          },
          {
            label: 'Active SOS',
            value: activeSOSCount,
            icon: AlertTriangle,
            iconClass:
              'text-red-400',
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


      {(error || actionError) && (
        <div className="space-y-2">
          {error && (
            <div className="p-4 bg-red-950/30 border border-red-800/40 rounded-xl text-sm text-red-200">
              {error}
            </div>
          )}

          {actionError && (
            <div className="p-4 bg-red-950/30 border border-red-800/40 rounded-xl text-sm text-red-200">
              {actionError}
            </div>
          )}
        </div>
      )}


      {(canManageRegistry ||
        canControlSessions) && (
        <section className="bg-tactical-panel border border-tactical-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-tactical-border">
            <p className="text-sm font-bold text-white uppercase tracking-wide">
              Registry & Authorised Sessions
            </p>

            <p className="text-[10px] text-gray-500 mt-1">
              Device access and tracking sessions are controlled from this protected registry.
            </p>
          </div>

          <div className="p-4 grid grid-cols-1 xl:grid-cols-3 gap-4">
            {canManageRegistry && (
              <div className="bg-tactical-bg border border-tactical-border rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-tactical-border flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-blue-400" />

                    <p className="text-xs font-bold text-white uppercase tracking-wider">
                      Subjects
                    </p>
                  </div>

                  <span className="text-[10px] text-gray-500">
                    {subjects.length}
                  </span>
                </div>

                <div className="p-3 space-y-2 max-h-80 overflow-y-auto">
                  {registryLoading &&
                  subjects.length === 0 ? (
                    <div className="py-10 flex justify-center">
                      <Loader2 className="w-5 h-5 animate-spin text-tactical-accent" />
                    </div>
                  ) : subjects.length === 0 ? (
                    <p className="py-8 text-xs text-gray-500 text-center">
                      No mobile subjects registered.
                    </p>
                  ) : (
                    subjects.map(
                      (subject) => (
                        <article
                          key={subject.id}
                          className="p-3 rounded-lg border border-tactical-border bg-tactical-panel/40"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-white truncate">
                                {
                                  subject.display_name
                                }
                              </p>

                              <p className="text-[10px] uppercase tracking-wider text-blue-400 mt-1">
                                {
                                  subject.subject_type
                                }
                              </p>
                            </div>

                            <span
                              className={`text-[9px] uppercase font-bold px-2 py-0.5 rounded-full ${
                                subject.is_active
                                  ? 'bg-green-950/50 text-green-300'
                                  : 'bg-red-950/50 text-red-300'
                              }`}
                            >
                              {subject.is_active
                                ? 'active'
                                : 'disabled'}
                            </span>
                          </div>

                          {subject.phone_number && (
                            <p className="text-[10px] text-gray-500 mt-2">
                              {
                                subject.phone_number
                              }
                            </p>
                          )}
                        </article>
                      )
                    )
                  )}
                </div>
              </div>
            )}


            {canManageRegistry && (
              <div className="bg-tactical-bg border border-tactical-border rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-tactical-border flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Smartphone className="w-4 h-4 text-green-400" />

                    <p className="text-xs font-bold text-white uppercase tracking-wider">
                      Phones
                    </p>
                  </div>

                  <span className="text-[10px] text-gray-500">
                    {devices.length}
                  </span>
                </div>

                <div className="p-3 space-y-2 max-h-80 overflow-y-auto">
                  {registryLoading &&
                  devices.length === 0 ? (
                    <div className="py-10 flex justify-center">
                      <Loader2 className="w-5 h-5 animate-spin text-tactical-accent" />
                    </div>
                  ) : devices.length === 0 ? (
                    <p className="py-8 text-xs text-gray-500 text-center">
                      No phones registered.
                    </p>
                  ) : (
                    devices.map(
                      (device) => {
                        const subject =
                          subjectById.get(
                            device.subject_id
                          );

                        const isBusy =
                          busyDeviceId ===
                          device.id;

                        return (
                          <article
                            key={device.id}
                            className="p-3 rounded-lg border border-tactical-border bg-tactical-panel/40"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-white truncate">
                                  {device.device_name ||
                                    device.device_id}
                                </p>

                                <p className="text-[10px] text-gray-500 mt-1 truncate">
                                  {subject?.display_name ||
                                    'Unknown subject'}
                                </p>
                              </div>

                              <span
                                className={`text-[9px] uppercase font-bold px-2 py-0.5 rounded-full ${
                                  device.status ===
                                  'online'
                                    ? 'bg-green-950/50 text-green-300'
                                    : device.status ===
                                        'disabled'
                                      ? 'bg-red-950/50 text-red-300'
                                      : 'bg-yellow-950/50 text-yellow-300'
                                }`}
                              >
                                {device.status}
                              </span>
                            </div>

                            <p className="text-[9px] font-mono text-gray-600 mt-2 break-all">
                              {device.device_id}
                            </p>

                            <div className="flex flex-wrap gap-2 mt-3">
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() =>
                                  rotateDeviceToken(
                                    device
                                  )
                                }
                                className="px-2.5 py-1.5 rounded-md border border-yellow-700/30 text-yellow-300 text-[10px] font-bold flex items-center gap-1.5 disabled:opacity-50"
                              >
                                <KeyRound className="w-3 h-3" />
                                Rotate Token
                              </button>

                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() =>
                                  toggleDevice(
                                    device
                                  )
                                }
                                className={`px-2.5 py-1.5 rounded-md border text-[10px] font-bold flex items-center gap-1.5 disabled:opacity-50 ${
                                  device.is_active
                                    ? 'border-red-700/30 text-red-300'
                                    : 'border-green-700/30 text-green-300'
                                }`}
                              >
                                {isBusy ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Power className="w-3 h-3" />
                                )}

                                {device.is_active
                                  ? 'Disable'
                                  : 'Enable'}
                              </button>
                            </div>
                          </article>
                        );
                      }
                    )
                  )}
                </div>
              </div>
            )}


            <div className="bg-tactical-bg border border-tactical-border rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-tactical-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Play className="w-4 h-4 text-cyan-400" />

                  <p className="text-xs font-bold text-white uppercase tracking-wider">
                    Active Sessions
                  </p>
                </div>

                <span className="text-[10px] text-gray-500">
                  {openSessions.length}
                </span>
              </div>

              <div className="p-3 space-y-2 max-h-80 overflow-y-auto">
                {registryLoading &&
                openSessions.length === 0 ? (
                  <div className="py-10 flex justify-center">
                    <Loader2 className="w-5 h-5 animate-spin text-tactical-accent" />
                  </div>
                ) : openSessions.length === 0 ? (
                  <p className="py-8 text-xs text-gray-500 text-center">
                    No tracking session is active.
                  </p>
                ) : (
                  openSessions.map(
                    (session) => {
                      const subject =
                        subjectById.get(
                          session.subject_id
                        );

                      const device =
                        deviceById.get(
                          session.device_id
                        );

                      const isBusy =
                        busySessionId ===
                        session.id;

                      return (
                        <article
                          key={session.id}
                          className="p-3 rounded-lg border border-cyan-900/30 bg-tactical-panel/40"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-white truncate">
                                {subject?.display_name ||
                                  session.subject_id}
                              </p>

                              <p className="text-[10px] text-gray-500 mt-1 truncate">
                                {device?.device_name ||
                                  device?.device_id ||
                                  session.device_id}
                              </p>
                            </div>

                            <span className="text-[9px] uppercase font-bold px-2 py-0.5 rounded-full bg-cyan-950/50 text-cyan-300">
                              {session.status}
                            </span>
                          </div>

                          <p className="text-[10px] text-gray-500 mt-2">
                            Ends:{' '}
                            {formatDateTime(
                              session.expected_end_at
                            )}
                          </p>

                          {canControlSessions && (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() =>
                                endSession(
                                  session
                                )
                              }
                              className="mt-3 px-2.5 py-1.5 rounded-md border border-red-700/30 text-red-300 text-[10px] font-bold flex items-center gap-1.5 disabled:opacity-50"
                            >
                              {isBusy ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Square className="w-3 h-3" />
                              )}

                              End Session
                            </button>
                          )}
                        </article>
                      );
                    }
                  )
                )}
              </div>
            </div>
          </div>
        </section>
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
                              liveSubjects.find(
                                (item) =>
                                  item.session?.id ===
                                  alert.session_id
                              )?.subject?.display_name ||
                              subjectById.get(
                                alert.subject_id
                              )?.display_name ||
                              'Unknown mobile client'
                            }
                          </p>

                          <p className="text-xs text-red-300 mt-1">
                            {
                              alert.message ||
                              'Emergency mobile SOS'
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


      {activeModal === 'subject' && (
        <Modal
          title="Add Mobile Subject"
          subtitle="Register a client or a GuardFlow guard before linking a phone."
          onClose={closeModal}
        >
          <form
            onSubmit={createSubject}
            className="space-y-4"
          >
            {formError && (
              <div className="p-3 rounded-lg bg-red-950/30 border border-red-800/40 text-red-200 text-xs">
                {formError}
              </div>
            )}

            <div>
              <label
                htmlFor="mobile-subject-type"
                className="block text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-2"
              >
                Subject Type
              </label>

              <select
                id="mobile-subject-type"
                value={subjectType}
                onChange={(event) => {
                  setSubjectType(
                    event.target.value
                  );

                  if (
                    event.target.value ===
                    'client'
                  ) {
                    setSubjectOperatorId(
                      ''
                    );
                  }
                }}
                disabled={formSaving}
                className="w-full bg-tactical-bg border border-tactical-border rounded-lg py-2.5 px-3 text-sm text-white"
              >
                <option value="client">
                  Client
                </option>

                <option value="guard">
                  Guard
                </option>
              </select>
            </div>

            <div>
              <label
                htmlFor="mobile-subject-name"
                className="block text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-2"
              >
                Full Name
              </label>

              <input
                id="mobile-subject-name"
                required
                minLength={2}
                value={subjectDisplayName}
                onChange={(event) =>
                  setSubjectDisplayName(
                    event.target.value
                  )
                }
                disabled={formSaving}
                placeholder="Person or client name"
                className="w-full bg-tactical-bg border border-tactical-border rounded-lg py-2.5 px-3 text-sm text-white"
              />
            </div>

            {subjectType === 'guard' && (
              <div>
                <label
                  htmlFor="mobile-subject-operator"
                  className="block text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-2"
                >
                  Linked Operator
                </label>

                <select
                  id="mobile-subject-operator"
                  required
                  value={subjectOperatorId}
                  onChange={(event) =>
                    setSubjectOperatorId(
                      event.target.value
                    )
                  }
                  disabled={formSaving}
                  className="w-full bg-tactical-bg border border-tactical-border rounded-lg py-2.5 px-3 text-sm text-white"
                >
                  <option value="">
                    Select operator
                  </option>

                  {operators
                    .filter(
                      (operator) =>
                        operator.is_active
                    )
                    .map(
                      (operator) => (
                        <option
                          key={operator.id}
                          value={operator.id}
                        >
                          {operator.username} — {operator.role}
                        </option>
                      )
                    )}
                </select>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="mobile-subject-phone"
                  className="block text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-2"
                >
                  Phone Number
                </label>

                <input
                  id="mobile-subject-phone"
                  value={subjectPhoneNumber}
                  onChange={(event) =>
                    setSubjectPhoneNumber(
                      event.target.value
                    )
                  }
                  disabled={formSaving}
                  placeholder="+27..."
                  className="w-full bg-tactical-bg border border-tactical-border rounded-lg py-2.5 px-3 text-sm text-white"
                />
              </div>

              <div>
                <label
                  htmlFor="mobile-subject-reference"
                  className="block text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-2"
                >
                  External Reference
                </label>

                <input
                  id="mobile-subject-reference"
                  value={
                    subjectExternalReference
                  }
                  onChange={(event) =>
                    setSubjectExternalReference(
                      event.target.value
                    )
                  }
                  disabled={formSaving}
                  placeholder="Client or employee reference"
                  className="w-full bg-tactical-bg border border-tactical-border rounded-lg py-2.5 px-3 text-sm text-white"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={formSaving}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-2.5 text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {formSaving && (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              )}

              Add Mobile Subject
            </button>
          </form>
        </Modal>
      )}


      {activeModal === 'device' && (
        <Modal
          title="Register Phone"
          subtitle="GuardFlow will generate a one-time authentication token for the mobile app."
          onClose={closeModal}
        >
          <form
            onSubmit={registerDevice}
            className="space-y-4"
          >
            {formError && (
              <div className="p-3 rounded-lg bg-red-950/30 border border-red-800/40 text-red-200 text-xs">
                {formError}
              </div>
            )}

            <div>
              <label
                htmlFor="mobile-device-subject"
                className="block text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-2"
              >
                Assigned Subject
              </label>

              <select
                id="mobile-device-subject"
                required
                value={deviceSubjectId}
                onChange={(event) =>
                  setDeviceSubjectId(
                    event.target.value
                  )
                }
                disabled={formSaving}
                className="w-full bg-tactical-bg border border-tactical-border rounded-lg py-2.5 px-3 text-sm text-white"
              >
                <option value="">
                  Select subject
                </option>

                {activeSubjects.map(
                  (subject) => (
                    <option
                      key={subject.id}
                      value={subject.id}
                    >
                      {subject.display_name} — {subject.subject_type}
                    </option>
                  )
                )}
              </select>
            </div>

            <div>
              <label
                htmlFor="mobile-readable-device-id"
                className="block text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-2"
              >
                Device ID
              </label>

              <div className="flex gap-2">
                <input
                  id="mobile-readable-device-id"
                  required
                  minLength={8}
                  value={deviceReadableId}
                  onChange={(event) =>
                    setDeviceReadableId(
                      event.target.value
                        .toUpperCase()
                    )
                  }
                  disabled={formSaving}
                  className="flex-1 min-w-0 bg-tactical-bg border border-tactical-border rounded-lg py-2.5 px-3 text-sm font-mono text-white"
                />

                <button
                  type="button"
                  onClick={() =>
                    setDeviceReadableId(
                      createDefaultDeviceId()
                    )
                  }
                  disabled={formSaving}
                  className="px-3 rounded-lg border border-tactical-border text-gray-300 text-xs font-bold"
                >
                  Regenerate
                </button>
              </div>
            </div>

            <div>
              <label
                htmlFor="mobile-device-name"
                className="block text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-2"
              >
                Phone Name
              </label>

              <input
                id="mobile-device-name"
                value={deviceName}
                onChange={(event) =>
                  setDeviceName(
                    event.target.value
                  )
                }
                disabled={formSaving}
                placeholder="Example: Tsido Samsung"
                className="w-full bg-tactical-bg border border-tactical-border rounded-lg py-2.5 px-3 text-sm text-white"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="mobile-device-platform"
                  className="block text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-2"
                >
                  Platform
                </label>

                <select
                  id="mobile-device-platform"
                  value={devicePlatform}
                  onChange={(event) =>
                    setDevicePlatform(
                      event.target.value
                    )
                  }
                  disabled={formSaving}
                  className="w-full bg-tactical-bg border border-tactical-border rounded-lg py-2.5 px-3 text-sm text-white"
                >
                  <option value="android">
                    Android
                  </option>

                  <option value="ios">
                    iOS
                  </option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="mobile-device-version"
                  className="block text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-2"
                >
                  App Version
                </label>

                <input
                  id="mobile-device-version"
                  value={deviceAppVersion}
                  onChange={(event) =>
                    setDeviceAppVersion(
                      event.target.value
                    )
                  }
                  disabled={formSaving}
                  className="w-full bg-tactical-bg border border-tactical-border rounded-lg py-2.5 px-3 text-sm text-white"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={
                formSaving ||
                !activeSubjects.length
              }
              className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-2.5 text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {formSaving && (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              )}

              Register Phone
            </button>
          </form>
        </Modal>
      )}


      {activeModal === 'session' && (
        <Modal
          title="Start Tracking Session"
          subtitle="Tracking is allowed only for the selected phone and only until the expected end time."
          onClose={closeModal}
        >
          <form
            onSubmit={startSession}
            className="space-y-4"
          >
            {formError && (
              <div className="p-3 rounded-lg bg-red-950/30 border border-red-800/40 text-red-200 text-xs">
                {formError}
              </div>
            )}

            <div>
              <label
                htmlFor="mobile-session-subject"
                className="block text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-2"
              >
                Subject
              </label>

              <select
                id="mobile-session-subject"
                required
                value={sessionSubjectId}
                onChange={(event) =>
                  setSessionSubjectId(
                    event.target.value
                  )
                }
                disabled={formSaving}
                className="w-full bg-tactical-bg border border-tactical-border rounded-lg py-2.5 px-3 text-sm text-white"
              >
                <option value="">
                  Select subject
                </option>

                {activeSubjects.map(
                  (subject) => (
                    <option
                      key={subject.id}
                      value={subject.id}
                    >
                      {subject.display_name} — {subject.subject_type}
                    </option>
                  )
                )}
              </select>
            </div>

            <div>
              <label
                htmlFor="mobile-session-device"
                className="block text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-2"
              >
                Registered Phone
              </label>

              <select
                id="mobile-session-device"
                required
                value={sessionDeviceId}
                onChange={(event) =>
                  setSessionDeviceId(
                    event.target.value
                  )
                }
                disabled={
                  formSaving ||
                  !sessionSubjectId
                }
                className="w-full bg-tactical-bg border border-tactical-border rounded-lg py-2.5 px-3 text-sm text-white disabled:opacity-50"
              >
                <option value="">
                  Select phone
                </option>

                {availableSessionDevices.map(
                  (device) => (
                    <option
                      key={device.id}
                      value={device.id}
                    >
                      {device.device_name ||
                        device.device_id}
                    </option>
                  )
                )}
              </select>
            </div>

            <div>
              <label
                htmlFor="mobile-session-case"
                className="block text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-2"
              >
                Case File
              </label>

              <select
                id="mobile-session-case"
                value={sessionCaseId}
                onChange={(event) =>
                  setSessionCaseId(
                    event.target.value
                  )
                }
                disabled={formSaving}
                className="w-full bg-tactical-bg border border-tactical-border rounded-lg py-2.5 px-3 text-sm text-white"
              >
                <option value="">
                  No linked case
                </option>

                {cases
                  .filter(
                    (caseFile) =>
                      caseFile.status ===
                      'open'
                  )
                  .map(
                    (caseFile) => (
                      <option
                        key={caseFile.id}
                        value={caseFile.id}
                      >
                        {caseFile.case_number} — {caseFile.title}
                      </option>
                    )
                  )}
              </select>
            </div>

            <div>
              <label
                htmlFor="mobile-session-end-time"
                className="block text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-2"
              >
                Expected End Time
              </label>

              <input
                id="mobile-session-end-time"
                type="datetime-local"
                required
                value={sessionExpectedEnd}
                onChange={(event) =>
                  setSessionExpectedEnd(
                    event.target.value
                  )
                }
                disabled={formSaving}
                className="w-full bg-tactical-bg border border-tactical-border rounded-lg py-2.5 px-3 text-sm text-white"
              />
            </div>

            {selectedSessionSubject
              ?.subject_type ===
              'client' && (
              <div className="space-y-4 rounded-xl border border-yellow-800/30 bg-yellow-950/10 p-4">
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={
                      sessionConsentConfirmed
                    }
                    onChange={(event) =>
                      setSessionConsentConfirmed(
                        event.target.checked
                      )
                    }
                    disabled={formSaving}
                    className="mt-0.5"
                  />

                  <span>
                    <span className="block text-xs font-bold text-yellow-200">
                      Client consent confirmed
                    </span>

                    <span className="block text-[10px] text-gray-500 mt-1">
                      Confirm that the client knowingly authorised this time-limited location session.
                    </span>
                  </span>
                </label>

                <div>
                  <label
                    htmlFor="mobile-session-consent-reference"
                    className="block text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-2"
                  >
                    Consent Reference
                  </label>

                  <input
                    id="mobile-session-consent-reference"
                    required
                    value={
                      sessionConsentReference
                    }
                    onChange={(event) =>
                      setSessionConsentReference(
                        event.target.value
                      )
                    }
                    disabled={formSaving}
                    placeholder="Signed form, contract or recorded consent reference"
                    className="w-full bg-tactical-bg border border-tactical-border rounded-lg py-2.5 px-3 text-sm text-white"
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={
                formSaving ||
                !sessionSubjectId ||
                !sessionDeviceId
              }
              className="w-full bg-green-700 hover:bg-green-600 text-white rounded-lg py-2.5 text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {formSaving && (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              )}

              Start Authorised Session
            </button>
          </form>
        </Modal>
      )}


      {credentials && (
        <Modal
          title={credentials.title}
          subtitle={credentials.message}
          onClose={() => {
            setCredentials(null);
            setCopiedField('');
          }}
          maxWidth="max-w-2xl"
        >
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-yellow-950/20 border border-yellow-800/40 text-yellow-100 text-xs leading-5">
              The plaintext token is displayed only once. Store it securely for provisioning the GuardFlow mobile app. Do not send it through an unsecured channel.
            </div>

            {[
              {
                label: 'Device ID',
                field: 'device',
                value: credentials.deviceId,
              },
              {
                label: 'Mobile Device Token',
                field: 'token',
                value: credentials.token,
              },
            ].map(
              ({
                label,
                field,
                value,
              }) => (
                <div
                  key={field}
                  className="rounded-xl border border-tactical-border bg-tactical-bg p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[10px] uppercase tracking-wider font-bold text-gray-500">
                      {label}
                    </p>

                    <button
                      type="button"
                      onClick={() =>
                        copyCredential(
                          field,
                          value
                        )
                      }
                      className="px-2.5 py-1.5 rounded-md border border-blue-500/30 text-blue-300 text-[10px] font-bold flex items-center gap-1.5"
                    >
                      <Copy className="w-3 h-3" />

                      {copiedField === field
                        ? 'Copied'
                        : 'Copy'}
                    </button>
                  </div>

                  <p className="mt-3 text-xs font-mono text-white break-all select-all">
                    {value}
                  </p>
                </div>
              )
            )}

            <div className="rounded-xl border border-tactical-border bg-tactical-bg p-4">
              <p className="text-[10px] uppercase tracking-wider font-bold text-gray-500">
                Internal Device Record
              </p>

              <p className="mt-2 text-[10px] font-mono text-gray-500 break-all">
                {credentials.recordId}
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setCredentials(null);
                setCopiedField('');
              }}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-2.5 text-xs font-bold"
            >
              I Have Saved the Credentials
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
