import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  KeyboardAvoidingView,
  Image,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Battery from 'expo-battery';
import * as Device from 'expo-device';
import * as Location from 'expo-location';
import * as SecureStore from 'expo-secure-store';
import * as TaskManager from 'expo-task-manager';

const API_URL = 'https://guardflow-production.up.railway.app';
const LOCATION_TASK_NAME = 'guardflow-authorised-location';

const STORAGE_KEYS = {
  deviceId: 'guardflow.device-id',
  deviceToken: 'guardflow.mobile-token',
  sessionId: 'guardflow.session-id',
};

const COLORS = {
  background: '#050A14',
  panel: '#0B1220',
  panelSoft: '#111B2E',
  border: '#1E2C44',
  blue: '#168CFF',
  blueDark: '#0B5FC6',
  cyan: '#52C7FF',
  green: '#22C55E',
  amber: '#F59E0B',
  red: '#EF4444',
  text: '#F8FAFC',
  muted: '#94A3B8',
  dim: '#64748B',
};

class GuardFlowApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'GuardFlowApiError';
    this.status = status;
  }
}

async function readResponse(response) {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return { detail: text };
  }
}

async function getStoredCredentials() {
  const [deviceId, deviceToken] = await Promise.all([
    SecureStore.getItemAsync(STORAGE_KEYS.deviceId),
    SecureStore.getItemAsync(STORAGE_KEYS.deviceToken),
  ]);

  if (!deviceId || !deviceToken) return null;

  return {
    deviceId,
    deviceToken,
  };
}

async function storeCredentials(deviceId, deviceToken) {
  await Promise.all([
    SecureStore.setItemAsync(STORAGE_KEYS.deviceId, deviceId),
    SecureStore.setItemAsync(STORAGE_KEYS.deviceToken, deviceToken),
  ]);
}

async function clearStoredCredentials() {
  await Promise.all([
    SecureStore.deleteItemAsync(STORAGE_KEYS.deviceId),
    SecureStore.deleteItemAsync(STORAGE_KEYS.deviceToken),
    SecureStore.deleteItemAsync(STORAGE_KEYS.sessionId),
  ]);
}

function authHeaders(credentials) {
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'X-GuardFlow-Device-ID': credentials.deviceId,
    'X-GuardFlow-Mobile-Token': credentials.deviceToken,
  };
}

async function mobileRequest(path, credentials, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    method: options.method || 'GET',
    headers: {
      ...authHeaders(credentials),
      ...(options.headers || {}),
    },
    ...(options.body !== undefined
      ? { body: JSON.stringify(options.body) }
      : {}),
  });

  const data = await readResponse(response);

  if (!response.ok) {
    throw new GuardFlowApiError(
      data?.detail || `GuardFlow request failed (${response.status}).`,
      response.status
    );
  }

  return data;
}

function normaliseCoordinate(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

async function buildLocationPayload(location, sessionId) {
  const batteryLevel = await Battery.getBatteryLevelAsync().catch(() => -1);
  const coords = location?.coords || {};
  const speedMetresPerSecond = normaliseCoordinate(coords.speed);
  const heading = normaliseCoordinate(coords.heading);

  return {
    session_id: sessionId,
    latitude: Number(coords.latitude),
    longitude: Number(coords.longitude),
    accuracy_metres: normaliseCoordinate(coords.accuracy),
    altitude_metres: normaliseCoordinate(coords.altitude),
    speed_kmh:
      speedMetresPerSecond !== null && speedMetresPerSecond >= 0
        ? speedMetresPerSecond * 3.6
        : null,
    heading_degrees:
      heading !== null && heading >= 0 && heading <= 360 ? heading : null,
    battery_percentage:
      batteryLevel >= 0 ? Math.round(batteryLevel * 100) : null,
    recorded_at: new Date(location?.timestamp || Date.now()).toISOString(),
  };
}

async function stopLocationTaskAndForgetSession() {
  try {
    const started = await Location.hasStartedLocationUpdatesAsync(
      LOCATION_TASK_NAME
    );

    if (started) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
    }
  } catch {
    // The operating system may already have stopped the service.
  }

  await SecureStore.deleteItemAsync(STORAGE_KEYS.sessionId).catch(() => {});
}

if (!TaskManager.isTaskDefined(LOCATION_TASK_NAME)) {
  TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
    if (error) return;

    const locations = Array.isArray(data?.locations) ? data.locations : [];
    if (!locations.length) return;

    const credentials = await getStoredCredentials();
    const sessionId = await SecureStore.getItemAsync(STORAGE_KEYS.sessionId);

    if (!credentials || !sessionId) {
      await stopLocationTaskAndForgetSession();
      return;
    }

    for (const location of locations) {
      try {
        const payload = await buildLocationPayload(location, sessionId);

        await mobileRequest('/api/v1/mobile/locations', credentials, {
          method: 'POST',
          body: payload,
        });
      } catch (requestError) {
        if (
          requestError instanceof GuardFlowApiError &&
          [401, 403, 404, 409].includes(requestError.status)
        ) {
          await stopLocationTaskAndForgetSession();
          return;
        }
      }
    }
  });
}

function confirmAction(title, message, confirmText = 'Continue') {
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      {
        text: 'Cancel',
        style: 'cancel',
        onPress: () => resolve(false),
      },
      {
        text: confirmText,
        onPress: () => resolve(true),
      },
    ]);
  });
}

function formatDateTime(value) {
  if (!value) return 'Not set';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not set';

  return date.toLocaleString();
}

function StatusPill({ label, tone = 'neutral' }) {
  const toneStyle = {
    green: styles.pillGreen,
    amber: styles.pillAmber,
    red: styles.pillRed,
    blue: styles.pillBlue,
    neutral: styles.pillNeutral,
  }[tone];

  return (
    <View style={[styles.pill, toneStyle]}>
      <Text style={styles.pillText}>{label}</Text>
    </View>
  );
}

function PrimaryButton({ title, onPress, disabled, loading, tone = 'blue' }) {
  const toneStyle = {
    blue: styles.buttonBlue,
    green: styles.buttonGreen,
    red: styles.buttonRed,
    neutral: styles.buttonNeutral,
  }[tone];

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        toneStyle,
        (disabled || loading) && styles.buttonDisabled,
        pressed && !disabled && !loading && styles.buttonPressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color="#FFFFFF" />
      ) : (
        <Text style={styles.buttonText}>{title}</Text>
      )}
    </Pressable>
  );
}

function InfoRow({ label, value, valueTone }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text
        numberOfLines={2}
        style={[
          styles.infoValue,
          valueTone === 'green' && styles.textGreen,
          valueTone === 'amber' && styles.textAmber,
          valueTone === 'red' && styles.textRed,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

export default function App() {
  const liveBatteryLevel = Battery.useBatteryLevel();

  const [booting, setBooting] = useState(true);
  const [credentials, setCredentials] = useState(null);
  const [deviceIdInput, setDeviceIdInput] = useState('');
  const [tokenInput, setTokenInput] = useState('');
  const [deviceRecord, setDeviceRecord] = useState(null);
  const [session, setSession] = useState(null);
  const [trackingActive, setTrackingActive] = useState(false);
  const [busyAction, setBusyAction] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [noticeMessage, setNoticeMessage] = useState('');
  const [lastSyncAt, setLastSyncAt] = useState(null);

  const phoneName = useMemo(() => {
    const manufacturer = Device.manufacturer || Device.brand || '';
    const model = Device.modelName || Device.deviceName || 'Android phone';
    return `${manufacturer} ${model}`.trim();
  }, []);

  const batteryLabel = useMemo(() => {
    if (!Number.isFinite(liveBatteryLevel) || liveBatteryLevel < 0) return '--';
    return `${Math.round(liveBatteryLevel * 100)}%`;
  }, [liveBatteryLevel]);

  const refreshTrackingState = useCallback(async () => {
    try {
      const started = await Location.hasStartedLocationUpdatesAsync(
        LOCATION_TASK_NAME
      );
      setTrackingActive(started);
      return started;
    } catch {
      setTrackingActive(false);
      return false;
    }
  }, []);

  const syncWithServer = useCallback(
    async (activeCredentials, { quiet = false } = {}) => {
      if (!activeCredentials) return null;

      if (!quiet) setBusyAction('sync');
      setErrorMessage('');

      try {
        const heartbeat = await mobileRequest(
          '/api/v1/mobile/heartbeat',
          activeCredentials,
          { method: 'POST' }
        );

        setDeviceRecord(heartbeat);

        try {
          const currentSession = await mobileRequest(
            '/api/v1/mobile/session',
            activeCredentials
          );

          setSession(currentSession);
          await SecureStore.setItemAsync(
            STORAGE_KEYS.sessionId,
            currentSession.id
          );
          setNoticeMessage('Authorised session synchronised.');
          setLastSyncAt(new Date());
          return currentSession;
        } catch (sessionError) {
          if (
            sessionError instanceof GuardFlowApiError &&
            sessionError.status === 404
          ) {
            setSession(null);
            await SecureStore.deleteItemAsync(STORAGE_KEYS.sessionId);

            const running = await refreshTrackingState();
            if (running) {
              await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
              setTrackingActive(false);
            }

            setNoticeMessage(
              'Phone connected. Waiting for an authorised tracking session.'
            );
            setLastSyncAt(new Date());
            return null;
          }

          throw sessionError;
        }
      } catch (requestError) {
        setErrorMessage(
          requestError instanceof Error
            ? requestError.message
            : 'Unable to connect to GuardFlow.'
        );
        return null;
      } finally {
        if (!quiet) setBusyAction('');
      }
    },
    [refreshTrackingState]
  );

  useEffect(() => {
    let mounted = true;

    async function initialise() {
      try {
        const storedCredentials = await getStoredCredentials();

        if (!mounted) return;

        if (storedCredentials) {
          setCredentials(storedCredentials);
          setDeviceIdInput(storedCredentials.deviceId);
          await syncWithServer(storedCredentials, { quiet: true });
        }

        await refreshTrackingState();
      } catch (initialiseError) {
        if (mounted) {
          setErrorMessage(
            initialiseError instanceof Error
              ? initialiseError.message
              : 'GuardFlow Mobile could not initialise.'
          );
        }
      } finally {
        if (mounted) setBooting(false);
      }
    }

    initialise();

    return () => {
      mounted = false;
    };
  }, [refreshTrackingState, syncWithServer]);

  useEffect(() => {
    if (!credentials) return undefined;

    const intervalId = setInterval(() => {
      syncWithServer(credentials, { quiet: true });
    }, 60000);

    const appStateSubscription = AppState.addEventListener(
      'change',
      (nextState) => {
        if (nextState === 'active') {
          refreshTrackingState();
          syncWithServer(credentials, { quiet: true });
        }
      }
    );

    return () => {
      clearInterval(intervalId);
      appStateSubscription.remove();
    };
  }, [credentials, refreshTrackingState, syncWithServer]);

  const activatePhone = async () => {
    const cleanDeviceId = deviceIdInput.trim();
    const cleanToken = tokenInput.trim();

    if (!cleanDeviceId || !cleanToken) {
      setErrorMessage('Enter the registered device ID and one-time mobile token.');
      return;
    }

    setBusyAction('activate');
    setErrorMessage('');
    setNoticeMessage('');

    const newCredentials = {
      deviceId: cleanDeviceId,
      deviceToken: cleanToken,
    };

    try {
      const heartbeat = await mobileRequest(
        '/api/v1/mobile/heartbeat',
        newCredentials,
        { method: 'POST' }
      );

      await storeCredentials(cleanDeviceId, cleanToken);
      setCredentials(newCredentials);
      setDeviceRecord(heartbeat);
      setTokenInput('');
      setNoticeMessage('Phone activated securely.');
      await syncWithServer(newCredentials, { quiet: true });
    } catch (requestError) {
      setErrorMessage(
        requestError instanceof Error
          ? requestError.message
          : 'Phone activation failed.'
      );
    } finally {
      setBusyAction('');
    }
  };

  const startTracking = async () => {
    if (!credentials) return;

    setBusyAction('start');
    setErrorMessage('');
    setNoticeMessage('');

    try {
      let activeSession = session;

      if (!activeSession) {
        activeSession = await syncWithServer(credentials, { quiet: true });
      }

      if (!activeSession) {
        throw new Error(
          'No authorised session is active. Start a session in the GuardFlow command centre, then tap Sync.'
        );
      }

      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!servicesEnabled) {
        throw new Error('Turn on Location Services on this phone and try again.');
      }

      const foregroundPermission =
        await Location.requestForegroundPermissionsAsync();

      if (foregroundPermission.status !== 'granted') {
        throw new Error('Precise foreground location permission is required.');
      }

      const proceed = await confirmAction(
        'Allow background location',
        'GuardFlow needs â€œAllow all the timeâ€ location access so your authorised protection session continues when the screen is locked. A permanent Android notification will show while sharing is active.',
        'Open permission settings'
      );

      if (!proceed) {
        throw new Error('Background location permission was not requested.');
      }

      const backgroundPermission =
        await Location.requestBackgroundPermissionsAsync();

      if (backgroundPermission.status !== 'granted') {
        throw new Error(
          'Background location was not granted. Choose â€œAllow all the timeâ€ in Android settings.'
        );
      }

      await SecureStore.setItemAsync(STORAGE_KEYS.sessionId, activeSession.id);

      const alreadyStarted = await Location.hasStartedLocationUpdatesAsync(
        LOCATION_TASK_NAME
      );

      if (!alreadyStarted) {
        await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
          accuracy: Location.Accuracy.High,
          timeInterval: 10000,
          distanceInterval: 10,
          deferredUpdatesInterval: 10000,
          foregroundService: {
            notificationTitle: 'GuardFlow protection active',
            notificationBody:
              'Your location is being shared for an authorised GuardFlow session.',
            notificationColor: COLORS.blue,
            killServiceOnDestroy: false,
          },
          pausesUpdatesAutomatically: false,
          showsBackgroundLocationIndicator: true,
        });
      }

      const currentLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const payload = await buildLocationPayload(
        currentLocation,
        activeSession.id
      );

      await mobileRequest('/api/v1/mobile/locations', credentials, {
        method: 'POST',
        body: payload,
      });

      setTrackingActive(true);
      setNoticeMessage('Secure location sharing is active.');
      setLastSyncAt(new Date());
    } catch (trackingError) {
      await refreshTrackingState();
      setErrorMessage(
        trackingError instanceof Error
          ? trackingError.message
          : 'Unable to start secure tracking.'
      );
    } finally {
      setBusyAction('');
    }
  };

  const stopTracking = async () => {
    const confirmed = await confirmAction(
      'Stop location sharing?',
      'GuardFlow will stop receiving location updates from this phone. The command-centre session record will remain available for audit.',
      'Stop sharing'
    );

    if (!confirmed) return;

    setBusyAction('stop');
    setErrorMessage('');

    try {
      const started = await Location.hasStartedLocationUpdatesAsync(
        LOCATION_TASK_NAME
      );

      if (started) {
        await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
      }

      await SecureStore.deleteItemAsync(STORAGE_KEYS.sessionId);
      setTrackingActive(false);
      setNoticeMessage('Location sharing stopped on this phone.');
    } catch (stopError) {
      setErrorMessage(
        stopError instanceof Error
          ? stopError.message
          : 'Unable to stop location sharing.'
      );
    } finally {
      setBusyAction('');
    }
  };

  const triggerSOS = async () => {
    if (!credentials || !session) {
      setErrorMessage('An authorised active session is required before SOS can be sent.');
      return;
    }

    const confirmed = await confirmAction(
      'Send emergency SOS?',
      'Your current GPS position will be sent immediately to the GuardFlow command centre.',
      'SEND SOS'
    );

    if (!confirmed) return;

    setBusyAction('sos');
    setErrorMessage('');

    try {
      const foregroundPermission = await Location.getForegroundPermissionsAsync();

      if (foregroundPermission.status !== 'granted') {
        const requestedPermission =
          await Location.requestForegroundPermissionsAsync();

        if (requestedPermission.status !== 'granted') {
          throw new Error('Location permission is required to send an SOS position.');
        }
      }

      const currentLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      await mobileRequest('/api/v1/mobile/sos', credentials, {
        method: 'POST',
        body: {
          session_id: session.id,
          latitude: currentLocation.coords.latitude,
          longitude: currentLocation.coords.longitude,
          accuracy_metres: normaliseCoordinate(
            currentLocation.coords.accuracy
          ),
          message: `Emergency SOS from ${phoneName}`,
          triggered_at: new Date(
            currentLocation.timestamp || Date.now()
          ).toISOString(),
        },
      });

      Alert.alert(
        'SOS sent',
        'The GuardFlow command centre received your emergency alert and GPS position.'
      );
      setNoticeMessage('Emergency SOS sent successfully.');
    } catch (sosError) {
      setErrorMessage(
        sosError instanceof Error
          ? sosError.message
          : 'Unable to send the SOS alert.'
      );
    } finally {
      setBusyAction('');
    }
  };

  const removeCredentials = async () => {
    const confirmed = await confirmAction(
      'Remove this phone activation?',
      'This removes the private GuardFlow token from this phone. The device remains registered in the command centre and will require token rotation before reconnecting.',
      'Remove activation'
    );

    if (!confirmed) return;

    setBusyAction('remove');
    setErrorMessage('');

    try {
      const started = await Location.hasStartedLocationUpdatesAsync(
        LOCATION_TASK_NAME
      );

      if (started) {
        await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
      }

      await clearStoredCredentials();
      setCredentials(null);
      setDeviceRecord(null);
      setSession(null);
      setTrackingActive(false);
      setDeviceIdInput('');
      setTokenInput('');
      setNoticeMessage('');
    } finally {
      setBusyAction('');
    }
  };

  if (booting) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" />
        <View style={styles.loadingScreen}>
          <Image
            source={require('./assets/guardflow-logo.png')}
            style={styles.brandLogo}
            resizeMode="contain"
          />
          <ActivityIndicator color={COLORS.cyan} size="large" />
          <Text style={styles.loadingText}>Securing GuardFlow Mobileâ€¦</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!credentials) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.flex}
        >
          <ScrollView
            contentContainerStyle={styles.activationContainer}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.brandBlock}>
              <Image
                source={require('./assets/guardflow-logo.png')}
                style={styles.brandLogo}
                resizeMode="contain"
              />
              <Text style={styles.brandTitle}>GuardFlow Mobile</Text>
              <Text style={styles.brandSubtitle}>
                Secure Protection & Emergency Companion â€¢ v1.0.4
              </Text>
            </View>

            <View style={styles.panel}>
              <Text style={styles.sectionEyebrow}>SECURE ACTIVATION</Text>
              <Text style={styles.sectionTitle}>Connect this phone</Text>
              <Text style={styles.sectionCopy}>
                Enter the device ID and one-time token issued by the GuardFlow
                command centre. The token is encrypted on this phone and is never
                displayed again.
              </Text>

              <Text style={styles.inputLabel}>Registered device ID</Text>
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={setDeviceIdInput}
                placeholder="Example: tsido-samsung-001"
                placeholderTextColor={COLORS.dim}
                style={styles.input}
                value={deviceIdInput}
              />

              <Text style={styles.inputLabel}>One-time mobile token</Text>
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={setTokenInput}
                placeholder="Paste the private token"
                placeholderTextColor={COLORS.dim}
                secureTextEntry
                style={styles.input}
                value={tokenInput}
              />

              {errorMessage ? (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>{errorMessage}</Text>
                </View>
              ) : null}

              <PrimaryButton
                disabled={!deviceIdInput.trim() || !tokenInput.trim()}
                loading={busyAction === 'activate'}
                onPress={activatePhone}
                title="Activate This Phone"
              />
            </View>

            <View style={styles.privacyCard}>
              <Text style={styles.privacyTitle}>Privacy by design</Text>
              <Text style={styles.privacyText}>
                Location is sent only after an authorised session exists and you
                explicitly start sharing. Android shows a permanent notification
                while background tracking is active.
              </Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  const sessionActive = session?.status === 'active';
  const deviceOnline = deviceRecord?.status === 'online';

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.dashboardContainer}>
        <View style={styles.dashboardHeader}>
          <View>
            <Text style={styles.dashboardEyebrow}>GUARDFLOW MOBILE</Text>
            <Text style={styles.dashboardTitle}>Protection Status</Text>
          </View>
          <StatusPill
            label={deviceOnline ? 'CONNECTED' : 'CHECKING'}
            tone={deviceOnline ? 'green' : 'amber'}
          />
        </View>

        {errorMessage ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : null}

        {noticeMessage ? (
          <View style={styles.noticeBox}>
            <Text style={styles.noticeText}>{noticeMessage}</Text>
          </View>
        ) : null}

        <View style={styles.panel}>
          <View style={styles.panelHeaderRow}>
            <View>
              <Text style={styles.sectionEyebrow}>REGISTERED PHONE</Text>
              <Text style={styles.sectionTitle}>{phoneName}</Text>
            </View>
            <View style={styles.batteryBadge}>
              <Text style={styles.batteryLabel}>BATTERY</Text>
              <Text style={styles.batteryValue}>{batteryLabel}</Text>
            </View>
          </View>

          <InfoRow
            label="Device ID"
            value={credentials.deviceId}
            valueTone="green"
          />
          <InfoRow
            label="Server status"
            value={deviceRecord?.status || 'Checking'}
            valueTone={deviceOnline ? 'green' : 'amber'}
          />
          <InfoRow
            label="Last synchronised"
            value={lastSyncAt ? lastSyncAt.toLocaleTimeString() : 'Not yet'}
          />
        </View>

        <View style={styles.panel}>
          <View style={styles.panelHeaderRow}>
            <View style={styles.flex}>
              <Text style={styles.sectionEyebrow}>AUTHORISED SESSION</Text>
              <Text style={styles.sectionTitle}>
                {sessionActive ? 'Protection session active' : 'Awaiting session'}
              </Text>
            </View>
            <StatusPill
              label={sessionActive ? 'ACTIVE' : 'NONE'}
              tone={sessionActive ? 'blue' : 'neutral'}
            />
          </View>

          {sessionActive ? (
            <>
              <InfoRow
                label="Session type"
                value={String(session.session_type || '')
                  .replace(/_/g, ' ')
                  .toUpperCase()}
              />
              <InfoRow
                label="Authorised until"
                value={formatDateTime(session.expected_end_at)}
              />
              <InfoRow
                label="Consent reference"
                value={session.consent_reference || 'Not applicable'}
              />
            </>
          ) : (
            <Text style={styles.emptyText}>
              Start an authorised session for this phone in the GuardFlow command
              centre, then tap Sync Session.
            </Text>
          )}

          <PrimaryButton
            loading={busyAction === 'sync'}
            onPress={() => syncWithServer(credentials)}
            title="Sync Session"
            tone="neutral"
          />
        </View>

        <View style={styles.panel}>
          <View style={styles.panelHeaderRow}>
            <View style={styles.flex}>
              <Text style={styles.sectionEyebrow}>LOCATION SHARING</Text>
              <Text style={styles.sectionTitle}>
                {trackingActive ? 'Secure tracking is active' : 'Tracking is stopped'}
              </Text>
            </View>
            <StatusPill
              label={trackingActive ? 'SHARING' : 'OFF'}
              tone={trackingActive ? 'green' : 'neutral'}
            />
          </View>

          <Text style={styles.sectionCopy}>
            Location updates are protected by the phoneâ€™s private device token and
            accepted only during the active authorised session.
          </Text>

          {trackingActive ? (
            <PrimaryButton
              loading={busyAction === 'stop'}
              onPress={stopTracking}
              title="Stop Location Sharing"
              tone="neutral"
            />
          ) : (
            <PrimaryButton
              disabled={!sessionActive}
              loading={busyAction === 'start'}
              onPress={startTracking}
              title="Start Secure Tracking"
              tone="green"
            />
          )}
        </View>

        <View style={styles.sosPanel}>
          <Text style={styles.sosEyebrow}>EMERGENCY ASSISTANCE</Text>
          <Text style={styles.sosTitle}>Need immediate help?</Text>
          <Text style={styles.sosCopy}>
            SOS sends your current GPS position directly to the GuardFlow command
            centre. You will always confirm before it is sent.
          </Text>
          <PrimaryButton
            disabled={!sessionActive}
            loading={busyAction === 'sos'}
            onPress={triggerSOS}
            title="SEND EMERGENCY SOS"
            tone="red"
          />
        </View>

        <Pressable
          disabled={busyAction === 'remove'}
          onPress={removeCredentials}
          style={styles.removeButton}
        >
          <Text style={styles.removeButtonText}>Remove phone activation</Text>
        </Pressable>

        <Text style={styles.footerText}>
          GuardFlow Mobile | Authorised tracking only
          {"\n"}Powered By: Phoenix EngTech
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loadingScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
    padding: 24,
  },
  loadingText: {
    color: COLORS.muted,
    fontSize: 14,
    fontWeight: '600',
  },
  activationContainer: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingVertical: 32,
    justifyContent: 'center',
    gap: 20,
  },
  dashboardContainer: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 40,
    gap: 14,
  },
  brandBlock: {
    alignItems: 'center',
    marginBottom: 8,
  },
  brandLogo: {
    width: 190,
    height: 105,
    marginBottom: 14,
  },
  logoMark: {
    width: 68,
    height: 68,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.blueDark,
    borderWidth: 1,
    borderColor: COLORS.cyan,
    marginBottom: 14,
  },
  logoShield: {
    color: COLORS.text,
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 1,
  },
  brandTitle: {
    color: COLORS.text,
    fontSize: 28,
    fontWeight: '900',
  },
  brandSubtitle: {
    color: COLORS.cyan,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.7,
    marginTop: 6,
    textAlign: 'center',
  },
  dashboardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginBottom: 2,
  },
  dashboardEyebrow: {
    color: COLORS.cyan,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  dashboardTitle: {
    color: COLORS.text,
    fontSize: 26,
    fontWeight: '900',
    marginTop: 3,
  },
  panel: {
    backgroundColor: COLORS.panel,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 18,
    padding: 18,
    gap: 14,
  },
  sosPanel: {
    backgroundColor: '#241015',
    borderWidth: 1,
    borderColor: '#66212B',
    borderRadius: 18,
    padding: 18,
    gap: 12,
  },
  panelHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  sectionEyebrow: {
    color: COLORS.cyan,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.3,
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 19,
    fontWeight: '800',
    marginTop: 4,
  },
  sectionCopy: {
    color: COLORS.muted,
    fontSize: 13,
    lineHeight: 20,
  },
  inputLabel: {
    color: '#CBD5E1',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  input: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    color: COLORS.text,
    fontSize: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  button: {
    minHeight: 50,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    marginTop: 2,
  },
  buttonBlue: {
    backgroundColor: COLORS.blueDark,
  },
  buttonGreen: {
    backgroundColor: '#15803D',
  },
  buttonRed: {
    backgroundColor: '#B91C1C',
  },
  buttonNeutral: {
    backgroundColor: COLORS.panelSoft,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  buttonDisabled: {
    opacity: 0.42,
  },
  buttonPressed: {
    transform: [{ scale: 0.985 }],
    opacity: 0.9,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.25,
  },
  errorBox: {
    backgroundColor: '#2A1015',
    borderWidth: 1,
    borderColor: '#7F1D1D',
    borderRadius: 12,
    padding: 12,
  },
  errorText: {
    color: '#FCA5A5',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
  },
  noticeBox: {
    backgroundColor: '#0B2521',
    borderWidth: 1,
    borderColor: '#14532D',
    borderRadius: 12,
    padding: 12,
  },
  noticeText: {
    color: '#86EFAC',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
  },
  privacyCard: {
    backgroundColor: '#081423',
    borderWidth: 1,
    borderColor: '#173B5D',
    borderRadius: 16,
    padding: 16,
  },
  privacyTitle: {
    color: COLORS.cyan,
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 6,
  },
  privacyText: {
    color: COLORS.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  infoRow: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 14,
  },
  infoLabel: {
    color: COLORS.dim,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  infoValue: {
    flex: 1,
    color: '#CBD5E1',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'right',
  },
  textGreen: {
    color: '#86EFAC',
  },
  textAmber: {
    color: '#FCD34D',
  },
  textRed: {
    color: '#FCA5A5',
  },
  pill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
  },
  pillGreen: {
    backgroundColor: '#0B2521',
    borderColor: '#166534',
  },
  pillAmber: {
    backgroundColor: '#291C08',
    borderColor: '#92400E',
  },
  pillRed: {
    backgroundColor: '#2A1015',
    borderColor: '#991B1B',
  },
  pillBlue: {
    backgroundColor: '#08233F',
    borderColor: '#0B5FC6',
  },
  pillNeutral: {
    backgroundColor: COLORS.panelSoft,
    borderColor: COLORS.border,
  },
  pillText: {
    color: COLORS.text,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  batteryBadge: {
    minWidth: 68,
    backgroundColor: COLORS.panelSoft,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignItems: 'center',
  },
  batteryLabel: {
    color: COLORS.dim,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.7,
  },
  batteryValue: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '900',
    marginTop: 2,
  },
  emptyText: {
    color: COLORS.muted,
    fontSize: 13,
    lineHeight: 20,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 13,
  },
  sosEyebrow: {
    color: '#FDA4AF',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  sosTitle: {
    color: '#FFF1F2',
    fontSize: 21,
    fontWeight: '900',
  },
  sosCopy: {
    color: '#FECDD3',
    fontSize: 13,
    lineHeight: 20,
  },
  removeButton: {
    alignItems: 'center',
    paddingVertical: 14,
  },
  removeButtonText: {
    color: COLORS.dim,
    fontSize: 12,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  footerText: {
    color: '#475569',
    fontSize: 10,
    lineHeight: 16,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
});
