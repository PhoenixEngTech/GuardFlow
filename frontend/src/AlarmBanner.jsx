import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, BellRing, Volume2, X } from 'lucide-react';
import { useAuth } from './context/AuthContext';

const API_URL = (
  import.meta.env.VITE_API_URL ||
  'https://guardflow-production.up.railway.app'
).replace(/\/$/, '');

function playAlarmTone() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(880, context.currentTime);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.18, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.7);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.72);
    oscillator.onended = () => context.close();
  } catch {
    // Browsers may block sound until the operator has interacted with the page.
  }
}

export default function AlarmBanner({ onOpenAlarmCentre }) {
  const { token, logout } = useAuth();
  const [alarms, setAlarms] = useState([]);
  const [dismissedId, setDismissedId] = useState(null);
  const knownIds = useRef(new Set());

  const fetchActive = useCallback(async () => {
    if (!token) return;
    try {
      const response = await fetch(`${API_URL}/api/v1/alarms/active?limit=50`, {
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
      });
      if (response.status === 401) {
        logout();
        return;
      }
      if (!response.ok) return;
      const data = await response.json();
      const list = Array.isArray(data) ? data : data?.items || [];
      setAlarms(list);

      for (const alarm of list) {
        if (!knownIds.current.has(alarm.id)) {
          knownIds.current.add(alarm.id);
          if (['critical', 'high'].includes(alarm.severity)) {
            playAlarmTone();
            if ('Notification' in window && Notification.permission === 'granted') {
              new Notification(`GuardFlow ${alarm.severity.toUpperCase()} alarm`, {
                body: `${alarm.title} — ${alarm.alarm_number}`,
                tag: alarm.id,
                requireInteraction: alarm.severity === 'critical',
              });
            }
          }
        }
      }
    } catch {
      // The main Alarm Centre displays connection errors; the global banner stays quiet.
    }
  }, [logout, token]);

  useEffect(() => {
    fetchActive();
    const interval = window.setInterval(fetchActive, 5000);
    return () => window.clearInterval(interval);
  }, [fetchActive]);

  const topAlarm = alarms.find((alarm) => alarm.id !== dismissedId);
  if (!topAlarm) return null;
  const critical = topAlarm.severity === 'critical';

  return (
    <div
      className={`fixed left-0 right-0 top-0 z-[2000] border-b shadow-2xl ${
        critical
          ? 'bg-red-700/95 border-red-300 animate-pulse'
          : 'bg-orange-700/95 border-orange-300'
      }`}
      role="alert"
    >
      <div className="max-w-[1600px] mx-auto px-4 py-2.5 flex items-center gap-3 text-white">
        <div className="p-1.5 rounded-lg bg-white/15">
          {critical ? <BellRing className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
        </div>
        <button
          type="button"
          onClick={() => onOpenAlarmCentre?.(topAlarm.id)}
          className="min-w-0 flex-1 text-left"
        >
          <span className="font-black uppercase tracking-wider text-xs">
            {topAlarm.severity} alarm · {alarms.length} open
          </span>
          <span className="ml-3 text-sm font-semibold">{topAlarm.title}</span>
          <span className="ml-2 text-xs opacity-80">{topAlarm.alarm_number}</span>
        </button>
        <button
          type="button"
          onClick={() => {
            if ('Notification' in window && Notification.permission === 'default') {
              Notification.requestPermission();
            }
            playAlarmTone();
          }}
          className="p-2 rounded-lg hover:bg-white/15"
          aria-label="Enable alarm sound and notifications"
        >
          <Volume2 className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => setDismissedId(topAlarm.id)}
          className="p-2 rounded-lg hover:bg-white/15"
          aria-label="Dismiss banner only"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
