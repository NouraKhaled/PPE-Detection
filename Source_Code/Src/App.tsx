import { useState, useEffect, useRef, useCallback, type FormEvent } from 'react';
import {
  Shield,
  Power,
  CheckCircle,
  XCircle,
  Lock,
  Unlock,
  Wind,
  Thermometer,
  Bell,
  FileText,
  AlertTriangle,
  Download,
  User,
  LogOut,
  Settings,
  Activity as ActivityIcon,
  X,
} from 'lucide-react';
import { Login } from './components/Login';
import { Registration } from './components/Registration';
import { PasswordRecovery } from './components/PasswordRecovery';
import { ActivityLog, ActivityEntry } from './components/ActivityLog';
import { ConfirmActionModal } from './components/ConfirmActionModal';
// User type (no password stored on frontend)
interface User {
  username: string;
  role: 'supervisor';
  fullName: string;
  email: string;
}

const API_BASE = 'http://localhost:8766';

// Violation tracking
interface ViolationRecord {
  userId: string;
  userName: string;
  violationCount: number;
  lastViolationTime: Date | null;
  violations: {
    timestamp: Date;
    type: string;
    details: string;
  }[];
}

interface EventLogRow {
  eventId: number;
  timestamp: string;
  eventType: string;
  actionTaken: string | null;
  deviceLocation: string | null;
  userName: string | null;
  ppeStatus: string | null;
  details: string | null; // JSON string from backend
}

const LS_AUTH_USER_KEY = 'lab_safety_system_auth_user_v1';
const LS_VIOLATIONS_KEY = 'lab_safety_violations_v1';
const LS_ACTIVITIES_KEY = 'lab_safety_activities_v1';

function loadSessionFromStorage(): { username: string; email: string; role: string; fullName: string } | null {
  try {
    const raw = window.localStorage.getItem(LS_AUTH_USER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.username !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

function loadViolationsFromStorage(): ViolationRecord[] {
  try {
    const raw = window.localStorage.getItem(LS_VIOLATIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return parsed.map((v: any) => ({
      ...v,
      lastViolationTime: v.lastViolationTime ? new Date(v.lastViolationTime) : null,
      violations: v.violations.map((vv: any) => ({
        ...vv,
        timestamp: new Date(vv.timestamp),
      })),
    }));
  } catch {
    return [];
  }
}

function loadActivitiesFromStorage(): ActivityEntry[] {
  try {
    const raw = window.localStorage.getItem(LS_ACTIVITIES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return parsed.map((a: any) => ({
      ...a,
      timestamp: new Date(a.timestamp),
    }));
  } catch {
    return [];
  }
}

export default function App() {
  // Authentication state
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [showPasswordRecovery, setShowPasswordRecovery] = useState(false);
  const [showRegistration, setShowRegistration] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNotificationsPanel, setShowNotificationsPanel] = useState(false);
  const [violationToast, setViolationToast] = useState<{ action: string; details: string } | null>(null);
  const [showAccountSettings, setShowAccountSettings] = useState(false);
  const [settingsFullName, setSettingsFullName] = useState('');
  const [settingsEmail, setSettingsEmail] = useState('');
  const [settingsCurrentPassword, setSettingsCurrentPassword] = useState('');
  const [settingsNewPassword, setSettingsNewPassword] = useState('');
  const [settingsConfirmPassword, setSettingsConfirmPassword] = useState('');
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const notificationsRef = useRef<HTMLDivElement>(null);

  // Restore auth session from localStorage on startup
  useEffect(() => {
    const saved = loadSessionFromStorage();
    if (saved && saved.username) {
      const user: User = {
        username: saved.username,
        role: saved.role as User['role'],
        fullName: saved.fullName,
        email: saved.email,
      };
      setCurrentUser(user);
      setIsAuthenticated(true);
    }
  }, []);

  // Violation tracking
  const [violations, setViolations] = useState<ViolationRecord[]>(loadViolationsFromStorage);
  const VIOLATION_THRESHOLD = 3; // Threshold for warnings

  // Activity logging
  const [activities, setActivities] = useState<ActivityEntry[]>(loadActivitiesFromStorage);

  // Auto-save violations to localStorage whenever they change
  useEffect(() => {
    try {
      window.localStorage.setItem(LS_VIOLATIONS_KEY, JSON.stringify(violations));
    } catch { /* no-op */ }
  }, [violations]);

  // Auto-save activities to localStorage whenever they change
  useEffect(() => {
    try {
      window.localStorage.setItem(LS_ACTIVITIES_KEY, JSON.stringify(activities));
    } catch { /* no-op */ }
  }, [activities]);
  const [eventLogs, setEventLogs] = useState<EventLogRow[]>([]);

  // Load event logs from backend
  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/events?limit=50`);
        const data = await res.json();
        if (!cancelled && Array.isArray(data)) setEventLogs(data as EventLogRow[]);
      } catch {
        // ignore
      }
    };

    load();
    const id = window.setInterval(load, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [isAuthenticated]);

  // Confirmation modal state
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    action: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    action: () => {},
  });

  // System state — updated from the detection backend when connected
  const [systemActive, setSystemActive] = useState(true);
  const [ppeCompliance, setPPECompliance] = useState({
    labCoat: true, gloves: true, goggles: true, mask: false,
  });
  const [gasLevel, setGasLevel] = useState(0.02);
  const [temperature, setTemperature] = useState(23.5);
  const [valveOpen, setValveOpen] = useState(false);

  // ── Webcam + WebSocket state ──────────────────────────────
  const videoRef     = useRef<HTMLVideoElement>(null);
  const captureRef   = useRef<HTMLCanvasElement>(null);
  const overlayRef   = useRef<HTMLCanvasElement>(null);
  const streamRef    = useRef<MediaStream | null>(null);
  const wsRef        = useRef<WebSocket | null>(null);
  const rafRef       = useRef<number | null>(null);
  const sendingRef   = useRef(false);
  const fpsFrameRef  = useRef(0);
  const detFrameRef  = useRef(0);
  const [camActive,    setCamActive]    = useState(false);
  const [camError,     setCamError]     = useState<string | null>(null);
  const [camLoading,   setCamLoading]   = useState(false);
  const [wsConnected,  setWsConnected]  = useState(false);
  const [camFps,       setCamFps]       = useState(0);
  const [detFps,       setDetFps]       = useState(0);
  const [detCount,     setDetCount]     = useState(0);
  const prevComplianceRef = useRef(ppeCompliance);
  const WS_URL = 'ws://localhost:8765';


  // Add activity to log
  const addActivity = (
    action: string,
    details: string,
    type: ActivityEntry['type']
  ) => {
    const newActivity: ActivityEntry = {
      id: Date.now().toString(),
      timestamp: new Date(),
      user: currentUser?.fullName || 'System',
      action,
      details,
      type,
    };
    setActivities((prev) => [newActivity, ...prev]);
    if (type === 'alert') {
      setViolationToast({ action, details });
    }
  };

  useEffect(() => {
    if (!violationToast) return;
    const t = window.setTimeout(() => setViolationToast(null), 6000);
    return () => window.clearTimeout(t);
  }, [violationToast]);

  useEffect(() => {
    if (showAccountSettings && currentUser) {
      setSettingsFullName(currentUser.fullName);
      setSettingsEmail(currentUser.email);
      setSettingsCurrentPassword('');
      setSettingsNewPassword('');
      setSettingsConfirmPassword('');
      setSettingsError(null);
    }
  }, [showAccountSettings, currentUser]);

  useEffect(() => {
    if (!showNotificationsPanel) return;
    const handler = (e: MouseEvent) => {
      if (notificationsRef.current && !notificationsRef.current.contains(e.target as Node)) {
        setShowNotificationsPanel(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showNotificationsPanel]);

  // Handle login — calls backend API
  const handleLogin = async (username: string, password: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();

      if (data.success && data.user) {
        const user: User = data.user;
        setCurrentUser(user);
        setIsAuthenticated(true);
        setLoginError(null);
        setFailedAttempts(0);

        // Save session to localStorage
        try {
          window.localStorage.setItem(LS_AUTH_USER_KEY, JSON.stringify(user));
        } catch { /* no-op */ }

        // Initialize violation record if not exists
        if (!violations.find((v) => v.userId === user.username)) {
          setViolations((prev) => [
            ...prev,
            { userId: user.username, userName: user.fullName, violationCount: 0, lastViolationTime: null, violations: [] },
          ]);
        }

        const loginActivity: ActivityEntry = {
          id: Date.now().toString(),
          timestamp: new Date(),
          user: user.fullName,
          action: 'Logged in',
          details: `Successful login as ${user.role}`,
          type: 'login',
        };
        setActivities([loginActivity]);
      } else {
        setLoginError(data.message || 'Invalid username or password');
        setFailedAttempts((prev) => prev + 1);
        if (failedAttempts >= 2) {
          const suspiciousActivity: ActivityEntry = {
            id: Date.now().toString(),
            timestamp: new Date(),
            user: 'Unknown',
            action: 'Failed login attempt',
            details: `Multiple failed attempts for username: ${username}`,
            type: 'alert',
          };
          setActivities((prev) => [suspiciousActivity, ...prev]);
        }
      }
    } catch {
      setLoginError('Cannot connect to server. Make sure server.py is running.');
    }
  };

  // Handle registration — calls backend API
  const handleRegister = async (userData: {
    username: string;
    password: string;
    fullName: string;
    email: string;
    role?: 'supervisor' | 'technician' | 'security';
  }): Promise<{ success: boolean; message: string }> => {
    try {
      const res = await fetch(`${API_BASE}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...userData, role: 'supervisor' }),
      });
      const data = await res.json();

      if (data.success) {
        // Initialize violation record for new user
        setViolations((prev) => [
          ...prev,
          { userId: userData.username, userName: userData.fullName, violationCount: 0, lastViolationTime: null, violations: [] },
        ]);
        // Log registration activity
        const registrationActivity: ActivityEntry = {
          id: Date.now().toString(),
          timestamp: new Date(),
          user: 'System',
          action: 'New User Registered',
          details: `${userData.fullName} registered as ${userData.role}`,
          type: 'control',
        };
        setActivities((prev) => [registrationActivity, ...prev]);
      }
      return { success: data.success, message: data.message };
    } catch {
      return { success: false, message: 'Cannot connect to server. Make sure server.py is running.' };
    }
  };

  // Add violation to user record
  const addViolation = (violationType: string, details: string) => {
    if (!currentUser) return;

    const newViolation = {
      timestamp: new Date(),
      type: violationType,
      details,
    };

    setViolations((prev) =>
      prev.map((record) =>
        record.userId === currentUser.username
          ? {
              ...record,
              violationCount: record.violationCount + 1,
              lastViolationTime: new Date(),
              violations: [newViolation, ...record.violations],
            }
          : record
      )
    );

    // Check if user exceeded threshold
    const userRecord = violations.find((v) => v.userId === currentUser.username);
    if (userRecord && userRecord.violationCount + 1 >= VIOLATION_THRESHOLD) {
      addActivity(
        'Safety Threshold Exceeded',
        `${currentUser.fullName} has ${userRecord.violationCount + 1} violations (Threshold: ${VIOLATION_THRESHOLD})`,
        'alert'
      );
    }
  };

  // Handle logout
  const handleLogout = () => {
    if (currentUser) {
      addActivity('Logged out', 'User session ended', 'logout');
    }

    try {
      window.localStorage.removeItem(LS_AUTH_USER_KEY);
    } catch {
      /* no-op */
    }
    setIsAuthenticated(false);
    setCurrentUser(null);
    setShowUserMenu(false);
  };

  // Check role permissions
  const canControlSystem = () => {
    return currentUser?.role === 'supervisor' || currentUser?.role === 'technician';
  };

  const canAccessSettings = () => {
    return currentUser?.role === 'supervisor';
  };

  // Protected system toggle
  const handleSystemToggle = () => {
    if (!canControlSystem()) {
      alert('You do not have permission to control the system');
      return;
    }

    setConfirmModal({
      isOpen: true,
      title: 'Confirm System Control',
      message: `Are you sure you want to ${systemActive ? 'disable' : 'enable'} the monitoring system?`,
      action: () => {
        const newState = !systemActive;
        setSystemActive(newState);
        addActivity(
          newState ? 'System Activated' : 'System Deactivated',
          `Monitoring system ${newState ? 'enabled' : 'disabled'} by ${currentUser?.fullName}`,
          'control'
        );
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
      },
    });
  };

  // ── Poll real sensor data from Pi via server ──────────────
  const usingRealDetection = camActive;

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;

    const pollPiData = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/pi-status`);
        const data = await res.json();
        if (cancelled) return;

        // Update temperature from Pi
        if (data.temperature !== null && data.temperature !== undefined) {
          setTemperature((prev) => {
            if (data.temperature > 40 && prev <= 40) {
              addActivity('Temperature Warning', `Abnormal temperature: ${data.temperature.toFixed(1)}°C`, 'alert');
            }
            return data.temperature;
          });
        }

        // Update gas level from Pi
        if (data.gas_level !== null && data.gas_level !== undefined) {
          setGasLevel((prev) => {
            if (data.gas_level > 0.3 && prev <= 0.3) {
              addActivity('Gas Level Warning', `Hazardous gas detected: ${(data.gas_level * 100).toFixed(1)}%`, 'alert');
            }
            return data.gas_level;
          });
        }

        // Update valve state from Pi
        if (data.gas_valve) {
          setValveOpen(data.gas_valve === 'OPEN');
        }

      } catch {
        // server not reachable — keep last values
      }
    };

    pollPiData();
    const id = window.setInterval(pollPiData, 3000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [isAuthenticated]);

  // Keep PPE simulation only when no real detection active
  useEffect(() => {
    if (!systemActive || !isAuthenticated) return;
    const interval = setInterval(() => {

      // PPE simulation ONLY when no real detection source is active
      if (!usingRealDetection && Math.random() > 0.95) {
        setPPECompliance((prev) => {
          const newMask = Math.random() > 0.5;
          if (prev.mask !== newMask) {
            const violationType = newMask ? 'PPE Compliance Restored' : 'PPE Violation';
            const details = `Mask ${newMask ? 'detected' : 'not detected'}`;

            addActivity(
              violationType,
              details,
              newMask ? 'control' : 'alert'
            );

            if (!newMask) {
              addViolation('PPE Violation - Mask', details);
            }
          }
          return { ...prev, mask: newMask };
        });
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [systemActive, isAuthenticated, usingRealDetection]);

  // ── Draw bounding boxes ────────────────────────────────────
  const drawBoxes = useCallback((detections: any[]) => {
    const canvas = overlayRef.current;
    const video  = videoRef.current;
    if (!canvas || !video) return;
    canvas.width  = video.clientWidth;
    canvas.height = video.clientHeight;
    const scaleX = video.clientWidth  / (video.videoWidth  || 1);
    const scaleY = video.clientHeight / (video.videoHeight || 1);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    detections.forEach((det) => {
      const x1 = det.x1 * scaleX, y1 = det.y1 * scaleY;
      const x2 = det.x2 * scaleX, y2 = det.y2 * scaleY;
      const color = det.compliant === false ? '#ef4444' : '#22c55e';
      ctx.strokeStyle = color; ctx.lineWidth = 2.5;
      ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
      const text = `${det.label} ${Math.round((det.confidence ?? 0) * 100)}%`;
      ctx.font = 'bold 12px sans-serif';
      const tw = ctx.measureText(text).width;
      ctx.fillStyle = color;
      ctx.fillRect(x1, y1 - 22, tw + 10, 22);
      ctx.fillStyle = '#fff';
      ctx.fillText(text, x1 + 5, y1 - 6);
    });
  }, []);

  // ── WebSocket connect ──────────────────────────────────────
  const connectWS = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;
    ws.onopen  = () => setWsConnected(true);
    ws.onclose = () => setWsConnected(false);
    ws.onerror = () => setWsConnected(false);
    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        detFrameRef.current += 1;
        setDetCount(data?.detections?.length ?? 0);
        drawBoxes(data?.detections ?? []);

        // Build compliance from detected (positive PPE only) + missing
        const det = ((data?.detected ?? []) as string[]).map(s => s.toLowerCase());
        // PPE is compliant if it's in the "detected" (positive PPE) list from server
        // Note: model uses 'labcoat' (no underscore)
        const newCompliance = {
          labCoat: det.includes('labcoat'),
          gloves:  det.includes('gloves'),
          goggles: det.includes('goggles'),
          mask:    det.includes('mask'),
        };

        // Log changes compared to previous state (using ref to avoid stale closure)
        const prev = prevComplianceRef.current;
        const items = [
          { key: 'labCoat' as const, name: 'Lab Coat' },
          { key: 'gloves'  as const, name: 'Gloves' },
          { key: 'goggles' as const, name: 'Goggles' },
          { key: 'mask'    as const, name: 'Mask' },
        ];
        for (const item of items) {
          if (prev[item.key] && !newCompliance[item.key]) {
            addActivity('PPE Violation', `${item.name} no longer detected`, 'alert');
            addViolation(`PPE Violation - ${item.name}`, `${item.name} not detected by camera`);
          } else if (!prev[item.key] && newCompliance[item.key]) {
            addActivity('PPE Compliance Restored', `${item.name} detected`, 'control');
          }
        }

        prevComplianceRef.current = newCompliance;
        setPPECompliance(newCompliance);


      } catch { /* ignore */ }
    };
  }, [drawBoxes]);

  // ── Stream loop ────────────────────────────────────────────
  const streamLoop = useCallback(() => {
    const video  = videoRef.current;
    const canvas = captureRef.current;
    const ws     = wsRef.current;

    const videoReady = video && video.readyState >= 2
      && video.videoWidth > 0 && video.videoHeight > 0;

    if (videoReady && canvas && ws?.readyState === WebSocket.OPEN && !sendingRef.current) {
      // SPEED FIX: capture at half resolution to reduce blob size & transfer time
      canvas.width  = Math.round(video!.videoWidth  / 2);
      canvas.height = Math.round(video!.videoHeight / 2);
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video!, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          if (!blob) {
            console.warn('[CAM] toBlob returned null — canvas may be empty');
            return;
          }
          sendingRef.current = true;
          blob.arrayBuffer().then((buf) => {
            try {
              wsRef.current?.send(buf);
              fpsFrameRef.current += 1;
            } catch (err) {
              console.error('[WS] send failed:', err);
            } finally {
              sendingRef.current = false;
            }
          }).catch((err) => {
            console.error('[CAM] arrayBuffer failed:', err);
            sendingRef.current = false;
          });
        }, 'image/jpeg', 0.50);  // SPEED FIX: lowered from 0.80 → smaller blobs, faster transfer
      }
    }
    rafRef.current = requestAnimationFrame(streamLoop);
  }, []);

  // ── Start camera ───────────────────────────────────────────
  const startCamera = async () => {
    setCamError(null); setCamLoading(true);
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const logitech = devices.filter(d => d.kind === 'videoinput')
        .find(d => d.label.toLowerCase().includes('logitech'));
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: logitech ? { exact: logitech.deviceId } : undefined,
                 width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
      setCamActive(true);
      connectWS();
      rafRef.current = requestAnimationFrame(streamLoop);
    } catch (err: any) {
      if (err.name === 'NotAllowedError') setCamError('Permission denied — please allow the browser to access the camera');
      else if (err.name === 'NotFoundError') setCamError('Logitech camera not found');
      else setCamError('Unable to open the camera: ' + err.message);
    } finally { setCamLoading(false); }
  };

  // ── Stop camera ────────────────────────────────────────────
  const stopCamera = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    wsRef.current?.close();
    streamRef.current?.getTracks().forEach(t => t.stop());
    rafRef.current = null; wsRef.current = null; streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    if (overlayRef.current) overlayRef.current.getContext('2d')
      ?.clearRect(0, 0, overlayRef.current.width, overlayRef.current.height);
    setCamActive(false); setWsConnected(false); sendingRef.current = false;
    // Reset PPE to all missing when camera stops
    setPPECompliance({ labCoat: false, gloves: false, goggles: false, mask: false });
    addActivity('Camera Stopped', 'PPE detection reset — camera offline', 'control');
  };


  // ── FPS counter ────────────────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => {
      setCamFps(fpsFrameRef.current); setDetFps(detFrameRef.current);
      fpsFrameRef.current = 0; detFrameRef.current = 0;
    }, 1000);
    return () => clearInterval(t);
  }, []);

  // ── Stop cam when system goes offline ──────────────────────
  useEffect(() => { if (!systemActive && camActive) stopCamera(); }, [systemActive]);

  // ── Cleanup on unmount ─────────────────────────────────────
  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    wsRef.current?.close();
    streamRef.current?.getTracks().forEach(t => t.stop());
  }, []);

  const isFullyCompliant = Object.values(ppeCompliance).every(Boolean);

  useEffect(() => {
    const shouldOpen = isFullyCompliant && gasLevel < 0.3 && temperature < 40;
    if (valveOpen !== shouldOpen && systemActive) {
      setValveOpen(shouldOpen);
      if (isAuthenticated) {
        addActivity(
          shouldOpen ? 'Gas Valve Opened' : 'Gas Valve Closed',
          shouldOpen
            ? 'All safety conditions met - automatic valve control'
            : 'Safety violation detected - automatic valve closure',
          'control'
        );
      }
    }
  }, [isFullyCompliant, gasLevel, temperature, systemActive, isAuthenticated]);

  const gasWarning = gasLevel > 0.3;
  const tempWarning = temperature > 40;
  const compliancePercentage = (Object.values(ppeCompliance).filter(Boolean).length / 4) * 100;

  const exportEventLogsCsv = () => {
    const esc = (s: string | null | undefined) => {
      const v = s == null ? '' : String(s);
      return `"${v.replace(/"/g, '""')}"`;
    };
    const header = 'Timestamp,EventType,Status,DetectedPPE,Missing,Location,User';
    const rows = eventLogs.map((ev) => {
      let detected = '—';
      let missing = '—';
      try {
        const parsed = ev.details ? JSON.parse(ev.details) : null;
        if (parsed?.detected_items) detected = String(parsed.detected_items);
        if (parsed?.missing_ppe) missing = String(parsed.missing_ppe);
      } catch {
        /* ignore */
      }
      const status =
        ev.eventType === 'PPE_VIOLATION'
          ? 'Violation'
          : ev.eventType === 'PPE_CHECK'
            ? 'Check'
            : ev.eventType;
      return [
        esc(ev.timestamp),
        esc(ev.eventType),
        esc(status),
        esc(detected),
        esc(missing),
        esc(ev.deviceLocation),
        esc(ev.userName),
      ].join(',');
    });
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `event-logs-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const handleSaveAccountSettings = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!currentUser) return;
    setSettingsError(null);
    if (settingsNewPassword && settingsNewPassword !== settingsConfirmPassword) {
      setSettingsError('New passwords do not match');
      return;
    }
    setSettingsSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/update-profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: currentUser.username,
          currentPassword: settingsCurrentPassword,
          fullName: settingsFullName.trim(),
          email: settingsEmail.trim(),
          newPassword: settingsNewPassword || undefined,
        }),
      });
      const data = await res.json();
      if (data.success && data.user) {
        const updated: User = {
          username: data.user.username,
          role: data.user.role as User['role'],
          fullName: data.user.fullName,
          email: data.user.email,
        };
        setCurrentUser(updated);
        try {
          window.localStorage.setItem(LS_AUTH_USER_KEY, JSON.stringify(updated));
        } catch {
          /* no-op */
        }
        addActivity('Account settings updated', 'Profile information saved', 'settings');
        setShowAccountSettings(false);
      } else {
        setSettingsError(data.message || 'Could not update profile');
      }
    } catch {
      setSettingsError('Cannot connect to server. Is server.py running?');
    } finally {
      setSettingsSaving(false);
    }
  };

  // Show login screen if not authenticated
  if (!isAuthenticated) {
    if (showRegistration) {
      return (
        <Registration
          onRegister={handleRegister}
          onBackToLogin={() => setShowRegistration(false)}
        />
      );
    }

    return (
      <>
        <Login
          onLogin={handleLogin}
          onForgotPassword={() => setShowPasswordRecovery(true)}
          onCreateAccount={() => setShowRegistration(true)}
          error={loginError}
          failedAttempts={failedAttempts}
        />
        {showPasswordRecovery && (
          <PasswordRecovery onClose={() => setShowPasswordRecovery(false)} />
        )}
      </>
    );
  }

  const alertActivities = activities.filter((a) => a.type === 'alert');
  const alertActivityCount = alertActivities.length;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="bg-blue-600 p-2 rounded-lg">
                <Shield className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-blue-900">Intelligent Lab Safety System</h1>
                <p className="text-sm text-gray-600">King Faisal University - Chemistry Laboratory</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              {/* Notifications — alerts list + violation toast on new alerts */}
              <div className="relative" ref={notificationsRef}>
                <button
                  type="button"
                  onClick={() => setShowNotificationsPanel((p) => !p)}
                  aria-label={
                    alertActivityCount > 0
                      ? `Safety alerts, ${alertActivityCount} in log`
                      : 'Safety alerts, none'
                  }
                  aria-expanded={showNotificationsPanel}
                  aria-haspopup="dialog"
                  className="relative p-2 hover:bg-gray-100 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                >
                  <Bell className="w-6 h-6 text-gray-600" aria-hidden />
                  {alertActivityCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[1.25rem] h-5 px-1 bg-red-600 text-white text-xs rounded-full flex items-center justify-center tabular-nums">
                      {alertActivityCount > 99 ? '99+' : alertActivityCount}
                    </span>
                  )}
                </button>

                {showNotificationsPanel && (
                  <div
                    role="dialog"
                    aria-label="Recent safety alerts"
                    className="absolute right-0 mt-2 w-96 max-h-[min(24rem,70vh)] overflow-y-auto bg-white rounded-xl shadow-xl border border-gray-200 z-[60] py-3 px-0"
                  >
                    <div className="px-4 pb-2 border-b border-gray-100">
                      <p className="text-sm font-medium text-gray-900">Safety alerts</p>
                      <p className="text-xs text-gray-500">PPE and system warnings from this session</p>
                    </div>
                    <div className="px-2 pt-2 space-y-2">
                      {alertActivities.length === 0 ? (
                        <p className="px-2 py-6 text-center text-sm text-gray-500">No alerts yet</p>
                      ) : (
                        alertActivities.slice(0, 25).map((a) => (
                          <div
                            key={a.id}
                            className="px-3 py-2 rounded-lg bg-sky-50 border border-sky-100"
                          >
                            <p className="text-sm text-gray-900">
                              <span className="font-medium">{a.user}</span>
                              <span className="text-gray-400 mx-1">•</span>
                              <span>{a.action}</span>
                            </p>
                            <p className="text-xs text-gray-600 mt-0.5">{a.details}</p>
                            <p className="text-xs text-gray-400 mt-1">{a.timestamp.toLocaleString()}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* System Status */}
              <div className="text-right">
                <p className="text-sm text-gray-600">System Status</p>
                <p className={systemActive ? 'text-green-600' : 'text-red-600'}>
                  {systemActive ? 'ACTIVE' : 'OFFLINE'}
                </p>
              </div>

              {/* Power Button */}
              <button
                onClick={handleSystemToggle}
                disabled={!canControlSystem()}
                className={`p-3 rounded-lg transition-colors ${
                  !canControlSystem()
                    ? 'bg-gray-300 cursor-not-allowed'
                    : systemActive
                    ? 'bg-green-600 hover:bg-green-700'
                    : 'bg-gray-600 hover:bg-gray-700'
                }`}
                title={!canControlSystem() ? 'You do not have permission to control the system' : ''}
              >
                <Power className="w-6 h-6 text-white" />
              </button>

              {/* User Menu */}
              <div className="relative">
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="flex items-center gap-3 px-4 py-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <div className="text-right">
                    <p className="text-sm text-gray-900">{currentUser?.fullName}</p>
                    <p className="text-xs text-gray-600 capitalize">{currentUser?.role}</p>
                  </div>
                  <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center">
                    <User className="w-6 h-6 text-white" />
                  </div>
                </button>

                {showUserMenu && (
                  <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-xl border border-gray-200 py-2">
                    <div className="px-4 py-3 border-b border-gray-200">
                      <p className="text-sm text-gray-900">{currentUser?.fullName}</p>
                      <p className="text-xs text-gray-600">{currentUser?.email}</p>
                      <span className="inline-block mt-2 px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded capitalize">
                        {currentUser?.role}
                      </span>
                    </div>

                    {canAccessSettings() && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowAccountSettings(true);
                          setShowUserMenu(false);
                        }}
                        className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                      >
                        <Settings className="w-4 h-4" />
                        Settings
                      </button>
                    )}

                    <button
                      onClick={() => {
                        const activitySection = document.getElementById('activity-log');
                        activitySection?.scrollIntoView({ behavior: 'smooth' });
                        setShowUserMenu(false);
                      }}
                      className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                    >
                      <ActivityIcon className="w-4 h-4" />
                      View Activity Log
                    </button>

                    <div className="border-t border-gray-200 mt-2 pt-2">
                      <button
                        onClick={handleLogout}
                        className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                      >
                        <LogOut className="w-4 h-4" />
                        Sign Out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Status Banner */}
        <div
          className={`mb-6 p-4 rounded-lg border-2 ${
            isFullyCompliant && systemActive
              ? 'bg-green-50 border-green-500'
              : 'bg-red-50 border-red-500'
          }`}
        >
          <div className="flex items-center gap-3">
            <Shield
              className={`w-6 h-6 ${
                isFullyCompliant && systemActive ? 'text-green-600' : 'text-red-600'
              }`}
            />
            <div>
              <h2 className={isFullyCompliant && systemActive ? 'text-green-900' : 'text-red-900'}>
                {systemActive
                  ? isFullyCompliant
                    ? 'System Status: SAFE - All PPE Detected'
                    : 'System Status: VIOLATION - PPE Missing'
                  : 'System Status: OFFLINE'}
              </h2>
              <p
                className={`text-sm ${
                  isFullyCompliant && systemActive ? 'text-green-700' : 'text-red-700'
                }`}
              >
                {systemActive
                  ? isFullyCompliant
                    ? 'Gas valve is open. All safety requirements met.'
                    : 'Gas valve is closed. Please wear all required PPE.'
                  : 'Monitoring system is currently disabled.'}
              </p>
            </div>
          </div>
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {/* PPE Status Panel */}
          <div className="lg:col-span-2 bg-white rounded-xl shadow-md border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-gray-900">PPE Detection Status</h2>
              <div className="text-right">
                <p className="text-sm text-gray-600">Compliance Rate</p>
                <p
                  className={`text-2xl ${
                    compliancePercentage === 100 ? 'text-green-600' : 'text-red-600'
                  }`}
                >
                  {compliancePercentage.toFixed(0)}%
                </p>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="mb-6 bg-gray-200 rounded-full h-3 overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ${
                  compliancePercentage === 100 ? 'bg-green-600' : 'bg-red-600'
                }`}
                style={{ width: `${compliancePercentage}%` }}
              />
            </div>

            {/* PPE Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { name: 'Lab Coat', key: 'labCoat', icon: '🥼' },
                { name: 'Gloves', key: 'gloves', icon: '🧤' },
                { name: 'Goggles', key: 'goggles', icon: '🥽' },
                { name: 'Mask', key: 'mask', icon: '😷' },
              ].map((item) => {
                const isDetected = ppeCompliance[item.key as keyof typeof ppeCompliance];
                return (
                  <div
                    key={item.key}
                    className={`p-4 rounded-lg border-2 transition-all ${
                      systemActive
                        ? isDetected
                          ? 'bg-green-50 border-green-500'
                          : 'bg-red-50 border-red-500'
                        : 'bg-gray-50 border-gray-300'
                    }`}
                  >
                    <div className="flex flex-col items-center text-center gap-2">
                      <span className="text-4xl">{item.icon}</span>
                      <p className="text-sm text-gray-900">{item.name}</p>
                      <div className="flex items-center gap-1">
                        {systemActive ? (
                          isDetected ? (
                            <>
                              <CheckCircle className="w-4 h-4 text-green-600" />
                              <span className="text-xs text-green-700">Detected</span>
                            </>
                          ) : (
                            <>
                              <XCircle className="w-4 h-4 text-red-600" />
                              <span className="text-xs text-red-700">Missing</span>
                            </>
                          )
                        ) : (
                          <span className="text-xs text-gray-500">Offline</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ── Camera Feed (Logitech Webcam + YOLOv11 WebSocket) ── */}
            <div className="mt-6 bg-gray-900 rounded-xl overflow-hidden relative" style={{ aspectRatio: '16/9' }}>

              {/* Live video */}
              <video ref={videoRef}
                className={`w-full h-full object-cover ${camActive ? 'block' : 'hidden'}`}
                autoPlay playsInline muted />

              {/* Bounding boxes overlay */}
              <canvas ref={overlayRef}
                className="absolute inset-0 w-full h-full pointer-events-none"
                style={{ display: camActive ? 'block' : 'none' }} />

              {/* Hidden capture canvas */}
              <canvas ref={captureRef} className="hidden" />

              {/* Offline / loading / error screen */}
              {!camActive && (
                <div className="absolute inset-0 bg-gradient-to-br from-blue-900/20 to-purple-900/20 flex flex-col items-center justify-center gap-4">
                  {camLoading ? (
                    <>
                      <div className="w-16 h-16 border-4 border-white/30 border-t-white rounded-full animate-spin" />
                      <p className="text-white/80 text-sm">Opening Logitech camera...</p>
                    </>
                  ) : camError ? (
                    <>
                      <XCircle className="w-12 h-12 text-red-400" />
                      <p className="text-red-300 text-sm text-center px-6">{camError}</p>
                      <button onClick={startCamera} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition">
                        Retry
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="w-16 h-16 border-4 border-white/30 border-t-white rounded-full animate-spin" />
                      <p className="text-white/80 text-sm">
                        {systemActive ? 'Camera Feed: Monitoring Active' : 'Camera Feed: Offline'}
                      </p>
                      <p className="text-white/60 text-xs">YOLOv11 Real-Time Detection</p>
                    </>
                  )}
                </div>
              )}

              {/* LIVE badge */}
              {camActive && (
                <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-black/50 text-white text-xs px-3 py-1 rounded-full backdrop-blur-sm">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  LIVE
                </div>
              )}

              {/* WS status badge */}
              {camActive && (
                <div className={`absolute top-3 right-3 flex items-center gap-1.5 text-white text-xs px-3 py-1 rounded-full backdrop-blur-sm ${wsConnected ? 'bg-green-700/80' : 'bg-yellow-600/80'}`}>
                  {wsConnected ? '● Connected' : '○ Connecting...'}
                </div>
              )}

              {/* FPS + detections */}
              {camActive && (
                <div className="absolute bottom-10 left-3 flex gap-2">
                  <span className="bg-black/50 text-white text-xs px-3 py-1 rounded-full backdrop-blur-sm">📸 {camFps} fps</span>
                  {wsConnected && <span className="bg-black/50 text-white text-xs px-3 py-1 rounded-full backdrop-blur-sm">🤖 {detFps} det/s · {detCount} obj</span>}
                </div>
              )}

              {/* YOLOv11 badge */}
              {camActive && (
                <div className="absolute bottom-3 right-3 bg-blue-600/80 text-white text-xs px-3 py-1 rounded-full backdrop-blur-sm">YOLOv11</div>
              )}

              {/* Start / Stop button */}
              <button
                onClick={camActive ? stopCamera : startCamera}
                disabled={camLoading || !systemActive}
                className={`absolute bottom-3 left-3 flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition backdrop-blur-sm
                  ${!systemActive ? 'bg-gray-600/60 text-gray-400 cursor-not-allowed'
                    : camActive ? 'bg-red-600/80 hover:bg-red-700 text-white'
                    : 'bg-green-600/80 hover:bg-green-700 text-white'}`}
              >
                {camActive ? '⏹ Stop Camera' : '▶ Start Camera'}
              </button>
            </div>
          </div>

          {/* Gas Valve Control */}
          <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
            <h2 className="text-gray-900 mb-6">Gas Valve Control</h2>
            <div className="flex flex-col items-center justify-center space-y-6">
              <div
                className={`w-32 h-32 rounded-full flex items-center justify-center transition-all ${
                  systemActive
                    ? valveOpen
                      ? 'bg-green-100 border-4 border-green-500'
                      : 'bg-red-100 border-4 border-red-500'
                    : 'bg-gray-100 border-4 border-gray-400'
                }`}
              >
                {systemActive ? (
                  valveOpen ? (
                    <Unlock className="w-16 h-16 text-green-600" />
                  ) : (
                    <Lock className="w-16 h-16 text-red-600" />
                  )
                ) : (
                  <Lock className="w-16 h-16 text-gray-400" />
                )}
              </div>

              <div className="text-center">
                <p
                  className={`text-xl ${
                    systemActive
                      ? valveOpen
                        ? 'text-green-700'
                        : 'text-red-700'
                      : 'text-gray-600'
                  }`}
                >
                  {systemActive ? (valveOpen ? 'VALVE OPEN' : 'VALVE CLOSED') : 'SYSTEM OFFLINE'}
                </p>
                <p className="text-sm text-gray-600 mt-1">
                  {systemActive
                    ? valveOpen
                      ? 'Gas flow enabled'
                      : 'Gas flow disabled'
                    : 'Automated control inactive'}
                </p>
              </div>

              <div className="w-full p-4 bg-blue-50 rounded-lg border border-blue-200">
                <p className="text-sm text-blue-900 mb-2">Control Method</p>
                <p className="text-xs text-blue-700">Automated via Raspberry Pi 4 + Relay Module</p>
              </div>
            </div>
          </div>
        </div>

        {/* Environmental Monitoring & Alerts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Environmental Monitoring */}
          <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
            <h2 className="text-gray-900 mb-6">Environmental Monitoring</h2>

            {/* Gas Sensor */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Wind className={`w-5 h-5 ${gasWarning ? 'text-red-600' : 'text-blue-600'}`} />
                  <h3 className="text-gray-900">Gas Concentration</h3>
                </div>
                <div className="text-right">
                  <p className={`text-xl ${gasWarning ? 'text-red-600' : 'text-green-600'}`}>
                    {(gasLevel * 100).toFixed(2)}%
                  </p>
                  <p className="text-xs text-gray-500">MQ-2</p>
                </div>
              </div>

              <div className="h-4 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    gasWarning ? 'bg-red-500' : 'bg-blue-500'
                  }`}
                  style={{ width: `${Math.min(gasLevel * 100, 100)}%` }}
                />
              </div>

              {gasWarning && (
                <div className="mt-2 p-2 bg-red-50 rounded border border-red-300 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-600" />
                  <p className="text-xs text-red-700">Hazardous gas detected!</p>
                </div>
              )}
            </div>

            {/* Temperature Sensor */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Thermometer
                    className={`w-5 h-5 ${tempWarning ? 'text-red-600' : 'text-orange-600'}`}
                  />
                  <h3 className="text-gray-900">Temperature</h3>
                </div>
                <div className="text-right">
                  <p className={`text-xl ${tempWarning ? 'text-red-600' : 'text-green-600'}`}>
                    {temperature.toFixed(1)}°C
                  </p>
                  <p className="text-xs text-gray-500">DHT11</p>
                </div>
              </div>

              <div className="h-4 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    tempWarning ? 'bg-red-500' : 'bg-orange-500'
                  }`}
                  style={{ width: `${Math.min((temperature / 50) * 100, 100)}%` }}
                />
              </div>

              {tempWarning && (
                <div className="mt-2 p-2 bg-red-50 rounded border border-red-300 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-600" />
                  <p className="text-xs text-red-700">Abnormal temperature detected!</p>
                </div>
              )}
            </div>
          </div>

          {/* Alerts Panel */}
          <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Bell className="w-6 h-6 text-blue-600" />
                <h2 className="text-gray-900">System Alerts</h2>
              </div>
              <div className="flex items-center gap-2 px-3 py-1 bg-red-100 rounded-full">
                <div className="w-2 h-2 bg-red-600 rounded-full animate-pulse" />
                <span className="text-sm text-red-700">
                  {!isFullyCompliant && systemActive ? '1 Active' : '0 Active'}
                </span>
              </div>
            </div>

            <div className="space-y-3">
              {isFullyCompliant && systemActive ? (
                <div className="p-4 bg-green-50 rounded-lg border border-green-300 flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <div>
                    <p className="text-sm text-green-900">All Systems Normal</p>
                    <p className="text-xs text-green-700">No active alerts at this time</p>
                  </div>
                </div>
              ) : !systemActive ? (
                <div className="p-4 bg-gray-50 rounded-lg border border-gray-300 flex items-center gap-3">
                  <AlertTriangle className="w-5 h-5 text-gray-600" />
                  <div>
                    <p className="text-sm text-gray-900">System Offline</p>
                    <p className="text-xs text-gray-700">Monitoring is currently disabled</p>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-lg border bg-yellow-50 border-yellow-300">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-yellow-600" />
                    <div className="flex-1">
                      <p className="text-sm text-gray-900">
                        PPE Violation: {[
                          !ppeCompliance.labCoat && 'Lab Coat',
                          !ppeCompliance.gloves && 'Gloves',
                          !ppeCompliance.goggles && 'Goggles',
                          !ppeCompliance.mask && 'Mask',
                        ].filter(Boolean).join(', ')} not detected
                      </p>
                      <p className="text-xs text-gray-600 mt-1">{new Date().toLocaleString()}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <ActivityLog activities={activities} />

        {/* Event Logs */}
        <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6 mb-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <FileText className="w-6 h-6 text-blue-600" />
              <h2 className="text-gray-900">Event Logs</h2>
            </div>
            <button
              type="button"
              onClick={exportEventLogsCsv}
              aria-label="Download event logs as a CSV file"
              title="Download event logs as CSV"
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
            >
              <Download className="w-4 h-4 shrink-0" aria-hidden />
              <span className="text-sm">Export Logs</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 text-sm text-gray-600">#</th>
                  <th className="text-left py-3 px-4 text-sm text-gray-600">Timestamp</th>
                  <th className="text-left py-3 px-4 text-sm text-gray-600">Status</th>
                  <th className="text-left py-3 px-4 text-sm text-gray-600">Detected PPE</th>
                  <th className="text-left py-3 px-4 text-sm text-gray-600">Missing</th>
                </tr>
              </thead>
              <tbody>
                {eventLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-sm text-gray-400 italic">
                      No events yet. Start the system and camera to generate logs.
                    </td>
                  </tr>
                ) : (
                  eventLogs.map((ev, idx) => {
                    let detected = '—';
                    let missing = '—';
                    try {
                      const parsed = ev.details ? JSON.parse(ev.details) : null;
                      if (parsed?.detected_items) detected = parsed.detected_items;
                      if (parsed?.missing_ppe) missing = parsed.missing_ppe;
                    } catch {
                      // ignore
                    }
                    const status =
                      ev.eventType === 'PPE_VIOLATION'
                        ? 'Violation'
                        : ev.eventType === 'PPE_CHECK'
                          ? 'Check'
                          : ev.eventType;
                    return (
                      <tr key={ev.eventId} className="border-b border-gray-100">
                        <td className="py-3 px-4 text-sm text-gray-600">{eventLogs.length - idx}</td>
                        <td className="py-3 px-4 text-sm text-gray-700">{ev.timestamp}</td>
                          <td className="py-3 px-4 text-sm">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            status === 'Violation'
                              ? 'bg-red-100 text-red-700'
                              : status === 'Check'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-gray-100 text-gray-700'
                          }`}>{status}</span>
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-700">{detected}</td>
                        <td className="py-3 px-4 text-sm text-red-600">{missing}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {violationToast && (
        <div
          className="fixed top-20 left-1/2 -translate-x-1/2 z-[70] max-w-md w-[calc(100%-2rem)] pointer-events-auto"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="violation-toast-title"
          aria-describedby="violation-toast-desc"
        >
          <div className="bg-white rounded-xl shadow-2xl border-2 border-red-200 p-4 flex gap-3 items-start">
            <AlertTriangle className="w-8 h-8 text-red-600 shrink-0" aria-hidden />
            <div className="flex-1 min-w-0">
              <p id="violation-toast-title" className="font-semibold text-gray-900">
                {violationToast.action}
              </p>
              <p id="violation-toast-desc" className="text-sm text-gray-600 mt-1">
                {violationToast.details}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setViolationToast(null)}
              className="shrink-0 p-1 rounded-lg hover:bg-gray-100 text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Dismiss alert"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {showAccountSettings && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/40"
          role="dialog"
          aria-modal="true"
          aria-labelledby="account-settings-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowAccountSettings(false);
          }}
        >
          <div
            className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-gray-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-4">
              <h2 id="account-settings-title" className="text-lg text-gray-900">
                Account settings
              </h2>
              <button
                type="button"
                onClick={() => setShowAccountSettings(false)}
                className="p-1 rounded-lg hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                aria-label="Close settings"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <form onSubmit={handleSaveAccountSettings} className="space-y-4">
              <div>
                <label htmlFor="settings-fullname" className="block text-sm text-gray-700 mb-1">
                  Full name
                </label>
                <input
                  id="settings-fullname"
                  type="text"
                  value={settingsFullName}
                  onChange={(e) => setSettingsFullName(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div>
                <label htmlFor="settings-email" className="block text-sm text-gray-700 mb-1">
                  Email
                </label>
                <input
                  id="settings-email"
                  type="email"
                  value={settingsEmail}
                  onChange={(e) => setSettingsEmail(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div>
                <label htmlFor="settings-current-pw" className="block text-sm text-gray-700 mb-1">
                  Current password
                </label>
                <input
                  id="settings-current-pw"
                  type="password"
                  value={settingsCurrentPassword}
                  onChange={(e) => setSettingsCurrentPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div>
                <label htmlFor="settings-new-pw" className="block text-sm text-gray-700 mb-1">
                  New password (optional)
                </label>
                <input
                  id="settings-new-pw"
                  type="password"
                  value={settingsNewPassword}
                  onChange={(e) => setSettingsNewPassword(e.target.value)}
                  autoComplete="new-password"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div>
                <label htmlFor="settings-confirm-pw" className="block text-sm text-gray-700 mb-1">
                  Confirm new password
                </label>
                <input
                  id="settings-confirm-pw"
                  type="password"
                  value={settingsConfirmPassword}
                  onChange={(e) => setSettingsConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              {settingsError && (
                <p className="text-sm text-red-600" role="alert">
                  {settingsError}
                </p>
              )}
              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowAccountSettings(false)}
                  className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={settingsSaving}
                  className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {settingsSaving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Action Modal */}
      <ConfirmActionModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
        onConfirm={() => { confirmModal.action(); }}
        title={confirmModal.title}
        message={confirmModal.message}
        requirePassword={false}
      />
    </div>
  );
}
