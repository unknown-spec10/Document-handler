import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  User,
  Lock,
  LogOut,
  Loader2,
  AlertCircle,
  FolderOpen,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  UserPlus,
  X,
  Mail,
  Phone,
  Hash,
  BarChart2,
  Clock,
  Trash2,
  Download,
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
  Sun,
  Moon,
  Shield,
  Settings,
  Database,
  HardDrive,
  Server,
  RefreshCw,
  DownloadCloud,
} from 'lucide-react';
import client from '../api/client';
import { downloadCSV } from '../utils/policyUtils';
import {
  validateVehicleReg,
  validateName,
  validatePhone,
  validateEmail
} from '../utils/validators';
import NotificationCenter, { TopAlertBanner } from '../components/NotificationCenter';

// ─── Tab definitions ──────────────────────────────────────────────────────────
const TABS = [
  { id: 'overview',   label: 'Overview',        Icon: BarChart2   },
  { id: 'expiring',   label: 'Expiring Soon',   Icon: Clock       },
  { id: 'retention',  label: 'Retention',       Icon: Trash2      },
  { id: 'search',     label: 'Vehicle Search',  Icon: Search      },
  { id: 'settings',   label: 'Settings & Backup', Icon: Settings  },
];

// ─── Helper ───────────────────────────────────────────────────────────────────
function navigateToUser(regNo) {
  window.history.pushState({}, '', `/admin/user/${regNo}`);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export default function AdminDashboard() {
  // ── Auth state ──────────────────────────────────────────────────────────────
  const [isAdmin,       setIsAdmin]       = useState(false);
  const [username,      setUsername]      = useState('');
  const [password,      setPassword]      = useState('');
  const [showPassword,  setShowPassword]  = useState(false);
  const [loginLoading,  setLoginLoading]  = useState(false);
  const [loginError,    setLoginError]    = useState('');
  const [sessionLoading, setSessionLoading] = useState(true);

  const getTabFromPath = (path) => {
    if (path === '/admin/search') return 'search';
    if (path === '/admin/expiring') return 'expiring';
    if (path === '/admin/retention') return 'retention';
    if (path === '/admin/settings') return 'settings';
    return 'overview';
  };

  // ── Tab state ───────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState(getTabFromPath(window.location.pathname));
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // ── Theme state ─────────────────────────────────────────────────────────────
  const [isDark, setIsDark] = useState(() => {
    const stored = localStorage.getItem('pm-theme');
    if (stored) return stored === 'dark';
    return true; // default dark
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    localStorage.setItem('pm-theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  // ── Overview stats state ────────────────────────────────────────────────────
  const [stats,        setStats]        = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);

  // ── Expiring Soon state ─────────────────────────────────────────────────────
  const [expiringPolicies, setExpiringPolicies] = useState([]);
  const [expiringTotal,    setExpiringTotal]    = useState(0);
  const [expiringOffset,   setExpiringOffset]   = useState(0);
  const [expiringLoading,  setExpiringLoading]  = useState(false);
  const [daysFilter,       setDaysFilter]       = useState(30);
  const EXPIRING_LIMIT = 20;

  // ── Retention/Cleanup state ─────────────────────────────────────────────────
  const [cleanupResult,      setCleanupResult]      = useState('');
  const [cleanupLoading,     setCleanupLoading]     = useState(false);
  const [confirmPurgeInput,  setConfirmPurgeInput]  = useState('');
  const [confirmDialogOpen,  setConfirmDialogOpen]  = useState(false);
  const [hasScanned,         setHasScanned]         = useState(false);
  const [scannedCount,       setScannedCount]       = useState(0);
  const [purgeSuccess,       setPurgeSuccess]       = useState(false);
  const [purgedCount,        setPurgedCount]        = useState(0);

  // ── Search state ────────────────────────────────────────────────────────────
  const [searchQuery,     setSearchQuery]     = useState('');
  const [users,           setUsers]           = useState([]);
  const [searchLoading,   setSearchLoading]   = useState(false);
  const [total,           setTotal]           = useState(0);
  const [limit]                               = useState(20);
  const [offset,          setOffset]          = useState(0);

  // ── System Alerts state ─────────────────────────────────────────────────────
  const [alerts,            setAlerts]            = useState([]);
  const [unackAlertsCount,  setUnackAlertsCount]  = useState(0);
  const [ackLoading,        setAckLoading]        = useState(null);

  // ── Settings & Backup state ─────────────────────────────────────────────────
  const [settings,          setSettings]          = useState({
    backup_schedule_hour: 2,
    backup_schedule_minute: 0,
    disk_space_threshold_percent: 85.0,
    backup_retention_days: 7,
    backup_retention_weeks: 4,
    backup_s3_prefix: 'backups/postgres/',
    s3_bucket: '',
    aws_region: '',
    kms_encrypted: false,
    has_dedicated_backup_credentials: false
  });
  const [settingsLoading,   setSettingsLoading]   = useState(false);
  const [settingsSaving,    setSettingsSaving]    = useState(false);
  const [settingsSavedMsg,  setSettingsSavedMsg]  = useState('');

  const [backupTriggering,  setBackupTriggering]  = useState(false);
  const [backupResult,      setBackupResult]      = useState(null);
  const [backupError,       setBackupError]       = useState('');

  const [systemHealth,      setSystemHealth]      = useState(null);
  const [healthLoading,     setHealthLoading]     = useState(false);

  const [storageLogs,       setStorageLogs]       = useState([]);
  const [storageLogsTotal,  setStorageLogsTotal]  = useState(0);
  const [storageLogsOffset, setStorageLogsOffset] = useState(0);
  const [storageLogsLoading,setStorageLogsLoading]= useState(false);

  // ── Add User Modal state ────────────────────────────────────────────────────
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [newUserReg,       setNewUserReg]       = useState('');
  const [newUserName,      setNewUserName]      = useState('');
  const [newUserPhone,     setNewUserPhone]     = useState('');
  const [newUserEmail,     setNewUserEmail]     = useState('');
  const [newUserLoading,   setNewUserLoading]   = useState(false);
  const [newUserError,     setNewUserError]     = useState('');
  const [newUserFieldErrors, setNewUserFieldErrors] = useState({});
  const [checkingNewUserVehicle, setCheckingNewUserVehicle] = useState(false);

  // ── Update Modal & Freeze State ──────────────────────────────────────────────
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateStatusText, setUpdateStatusText] = useState('');
  const [updateProgressSec, setUpdateProgressSec] = useState(0);

  const handleTriggerUpdate = async () => {
    setShowUpdateModal(false);
    setIsUpdating(true);
    setUpdateStatusText('Pulling latest Docker release in background...');
    setUpdateProgressSec(0);

    try {
      await client.post('/api/admin/system/update');
    } catch (err) {
      console.warn('Update trigger request dispatched:', err);
    }

    const timer = setInterval(() => {
      setUpdateProgressSec((prev) => prev + 1);
    }, 1000);

    let attempts = 0;
    const maxAttempts = 35;
    const pollInterval = setInterval(async () => {
      attempts++;
      setUpdateStatusText(`Restarting application service... (${attempts})`);
      try {
        const res = await fetch('/api/health');
        if (res.ok) {
          const data = await res.json();
          if (data && data.status === 'healthy') {
            clearInterval(pollInterval);
            clearInterval(timer);
            setUpdateStatusText('Update completed successfully! Reloading...');
            setTimeout(() => {
              window.location.reload();
            }, 1200);
          }
        }
      } catch {
        // Container recreation drop
      }

      if (attempts >= maxAttempts) {
        clearInterval(pollInterval);
        clearInterval(timer);
        setUpdateStatusText('Update completed. Refreshing page...');
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      }
    }, 2500);
  };

  // Live validator for new user registration number
  useEffect(() => {
    if (!showAddUserModal) return;
    const cleaned = newUserReg.trim().toUpperCase();
    if (!cleaned) {
      setNewUserFieldErrors((prev) => ({ ...prev, vehicleRegNo: null }));
      return;
    }
    const formatError = validateVehicleReg(cleaned);
    setNewUserFieldErrors((prev) => ({ ...prev, vehicleRegNo: formatError }));
    
    if (formatError) return;

    setCheckingNewUserVehicle(true);
    const delayDebounce = setTimeout(async () => {
      try {
        const response = await client.get(`/api/users/check-vehicle?reg_no=${encodeURIComponent(cleaned)}`);
        if (response.data.status === 'exists' || response.data.status === 'not available') {
          setNewUserFieldErrors((prev) => ({
            ...prev,
            vehicleRegNo: 'A user with this vehicle registration already exists.'
          }));
        }
      } catch (err) {
        console.error('Failed to check vehicle uniqueness:', err);
      } finally {
        setCheckingNewUserVehicle(false);
      }
    }, 500);

    return () => clearTimeout(delayDebounce);
  }, [newUserReg, showAddUserModal]);

  // Live validations for name, phone, email in Create User Form
  useEffect(() => {
    if (!showAddUserModal) return;
    if (newUserName) {
      setNewUserFieldErrors((prev) => ({ ...prev, name: validateName(newUserName) }));
    } else {
      setNewUserFieldErrors((prev) => ({ ...prev, name: null }));
    }
  }, [newUserName, showAddUserModal]);

  useEffect(() => {
    if (!showAddUserModal) return;
    if (newUserPhone) {
      setNewUserFieldErrors((prev) => ({ ...prev, phone: validatePhone(newUserPhone) }));
    } else {
      setNewUserFieldErrors((prev) => ({ ...prev, phone: null }));
    }
  }, [newUserPhone, showAddUserModal]);

  useEffect(() => {
    if (!showAddUserModal) return;
    if (newUserEmail) {
      setNewUserFieldErrors((prev) => ({ ...prev, email: validateEmail(newUserEmail) }));
    } else {
      setNewUserFieldErrors((prev) => ({ ...prev, email: null }));
    }
  }, [newUserEmail, showAddUserModal]);

  // ── Format date helper ──────────────────────────────────────────────────────
  const formatDate = (dateStr) =>
    new Date(dateStr).toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
    });

  // ── Auth handlers ───────────────────────────────────────────────────────────
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError('');
    try {
      const response = await client.post('/api/auth/admin-login', { username, password });
      if (response.data.status === 'success') {
        setIsAdmin(true);
        setUsername('');
        setPassword('');
      }
    } catch (err) {
      setLoginError(err.response?.data?.detail || 'Invalid admin credentials.');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = async () => {
    try { await client.post('/api/auth/logout'); } catch (err) { console.error(err); }
    finally {
      setIsAdmin(false);
      setUsers([]);
      setSearchQuery('');
      setDaysFilter(30);
      setStats(null);
      setExpiringPolicies([]);
      setCleanupResult('');
      setHasScanned(false);
      setScannedCount(0);
      setPurgeSuccess(false);
      setPurgedCount(0);
    }
  };

  // ── Add User ────────────────────────────────────────────────────────────────
  const handleCreateUser = async (e) => {
    e.preventDefault();
    setNewUserError('');

    const regError = validateVehicleReg(newUserReg);
    const nameError = validateName(newUserName);
    const phoneError = validatePhone(newUserPhone);
    const emailError = validateEmail(newUserEmail);

    const errors = {
      vehicleRegNo: regError,
      name: nameError,
      phone: phoneError,
      email: emailError,
    };
    setNewUserFieldErrors(errors);

    if (regError || nameError || phoneError || emailError) {
      setNewUserError('Please correct the validation errors in the form.');
      return;
    }

    if (checkingNewUserVehicle) {
      setNewUserError('Verifying vehicle registration details. Please wait...');
      return;
    }

    // Uniqueness validation check
    try {
      const response = await client.get(`/api/users/check-vehicle?reg_no=${encodeURIComponent(newUserReg.trim().toUpperCase())}`);
      if (response.data.status === 'exists') {
        setNewUserFieldErrors((prev) => ({ ...prev, vehicleRegNo: 'A user with this vehicle registration already exists.' }));
        setNewUserError('A user with this vehicle registration already exists.');
        return;
      }
    } catch (err) {
      console.error('Failed to verify vehicle during admin user create:', err);
    }

    setNewUserLoading(true);
    try {
      const response = await client.post('/api/admin/user/create', {
        vehicle_reg_no: newUserReg.trim().toUpperCase(),
        name: newUserName.trim(),
        phone_number: newUserPhone.replace(/[\s\-()]/g, ''),
        email: newUserEmail.trim() || null,
      });
      if (response.data.status === 'success') {
        setNewUserReg('');
        setNewUserName('');
        setNewUserPhone('');
        setNewUserEmail('');
        setNewUserFieldErrors({});
        setNewUserError('');
        setShowAddUserModal(false);
        performSearch(searchQuery, offset);
      }
    } catch (err) {
      setNewUserError(err.response?.data?.detail || 'Failed to create user profile.');
    } finally {
      setNewUserLoading(false);
    }
  };

  // ── Session Check on Mount ──────────────────────────────────────────────────
  useEffect(() => {
    const checkSession = async () => {
      try {
        await client.get('/api/admin/stats');
        setIsAdmin(true);
      } catch (err) {
        console.warn('No active admin session found:', err.message);
      } finally {
        setSessionLoading(false);
      }
    };
    checkSession();
  }, []);

  // Listen to path changes from browser history navigation
  useEffect(() => {
    const handlePathChange = () => {
      setActiveTab(getTabFromPath(window.location.pathname));
    };
    window.addEventListener('popstate', handlePathChange);
    return () => window.removeEventListener('popstate', handlePathChange);
  }, []);

  // ── Overview: fetch stats ───────────────────────────────────────────────────
  const fetchStats = async () => {
    setStatsLoading(true);
    try {
      const response = await client.get('/api/admin/stats');
      setStats(response.data);
    } catch (err) {
      console.error('Stats error:', err);
    } finally {
      setStatsLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin && activeTab === 'overview') {
      fetchStats();
    }
  }, [isAdmin, activeTab]);

  // ── Expiring Soon: fetch ────────────────────────────────────────────────────
  const fetchExpiring = async (pageOffset = 0) => {
    setExpiringLoading(true);
    try {
      const response = await client.get(
        `/api/admin/expiring?limit=${EXPIRING_LIMIT}&offset=${pageOffset}&days=${daysFilter}`
      );
      setExpiringPolicies(response.data.policies ?? response.data.users ?? []);
      setExpiringTotal(response.data.total ?? 0);
    } catch (err) {
      console.error('Expiring fetch error:', err);
    } finally {
      setExpiringLoading(false);
    }
  };

  // Reset expiring offset on daysFilter changes
  useEffect(() => { setExpiringOffset(0); }, [daysFilter]);

  useEffect(() => {
    if (isAdmin && activeTab === 'expiring') {
      fetchExpiring(expiringOffset);
    }
  }, [isAdmin, activeTab, expiringOffset, daysFilter]);

  // ── Retention: dry-run / purge ──────────────────────────────────────────────
  const runDryRun = async () => {
    setCleanupLoading(true);
    setCleanupResult('');
    setPurgeSuccess(false);
    try {
      const response = await client.post('/api/admin/retention/cleanup?dry_run=true');
      const msg = response.data.message ?? '';
      setCleanupResult(msg);

      const match = msg.match(/Found (\d+)/);
      const count = match ? parseInt(match[1], 10) : 0;
      setScannedCount(count);
      setHasScanned(true);
    } catch (err) {
      setCleanupResult(err.response?.data?.detail || 'Dry-run failed.');
      setScannedCount(0);
      setHasScanned(false);
    } finally {
      setCleanupLoading(false);
    }
  };

  const runPurge = async () => {
    setCleanupLoading(true);
    try {
      const response = await client.post('/api/admin/retention/cleanup?dry_run=false', null, {
        headers: { 'X-Confirm': 'YES_DELETE_PERMANENTLY' },
      });
      const msg = response.data.message ?? '';
      setCleanupResult(msg);

      const match = msg.match(/purged (\d+)/);
      const count = match ? parseInt(match[1], 10) : 0;
      setPurgedCount(count);
      setPurgeSuccess(true);
      setHasScanned(false);

      // Invalidate stats
      fetchStats();
    } catch (err) {
      setCleanupResult(err.response?.data?.detail || 'Purge failed.');
    } finally {
      setCleanupLoading(false);
      setConfirmDialogOpen(false);
      setConfirmPurgeInput('');
    }
  };

  // ── Search ──────────────────────────────────────────────────────────────────
  const performSearch = async (query = '', pageOffset = 0) => {
    setSearchLoading(true);
    try {
      const response = await client.get(
        `/api/admin/search?reg_no=${encodeURIComponent(query)}&limit=${limit}&offset=${pageOffset}`
      );
      setUsers(response.data.users ?? []);
      setTotal(response.data.total ?? 0);
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      setSearchLoading(false);
    }
  };

  // Reset offset on search changes
  useEffect(() => { setOffset(0); }, [searchQuery]);

  // Trigger search on search/offset change (and initial load)
  useEffect(() => {
    if (isAdmin && activeTab === 'search') {
      const t = setTimeout(() => {
        performSearch(searchQuery, offset);
      }, 300);
      return () => clearTimeout(t);
    }
  }, [offset, isAdmin, searchQuery, activeTab]);

  // ── Alerts fetch & acknowledge ──────────────────────────────────────────────
  const fetchAlerts = async () => {
    try {
      const response = await client.get('/api/admin/alerts');
      setAlerts(response.data.alerts || []);
      setUnackAlertsCount(response.data.unacknowledged_count || 0);
    } catch (err) {
      console.error('Alerts error:', err);
    }
  };

  const handleAcknowledgeAlert = async (alertId) => {
    setAckLoading(alertId);
    try {
      await client.post(`/api/admin/alerts/${alertId}/ack`);
      fetchAlerts();
    } catch (err) {
      console.error('Failed to ack alert:', err);
    } finally {
      setAckLoading(null);
    }
  };

  // Poll alerts every 30 seconds when admin is active
  useEffect(() => {
    if (!isAdmin) return;
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 30000);
    return () => clearInterval(interval);
  }, [isAdmin]);

  // ── Settings & Backup fetch / update ────────────────────────────────────────
  const fetchSettings = async () => {
    setSettingsLoading(true);
    try {
      const res = await client.get('/api/admin/settings');
      setSettings(res.data);
    } catch (err) {
      console.error('Fetch settings error:', err);
    } finally {
      setSettingsLoading(false);
    }
  };

  const fetchHealth = async () => {
    setHealthLoading(true);
    try {
      const res = await client.get('/api/admin/system-health');
      setSystemHealth(res.data);
    } catch (err) {
      console.error('Fetch health error:', err);
    } finally {
      setHealthLoading(false);
    }
  };

  const fetchStorageLogs = async (pageOffset = 0) => {
    setStorageLogsLoading(true);
    try {
      const res = await client.get(`/api/admin/storage-logs?limit=15&offset=${pageOffset}`);
      setStorageLogs(res.data.logs || []);
      setStorageLogsTotal(res.data.total || 0);
    } catch (err) {
      console.error('Fetch storage logs error:', err);
    } finally {
      setStorageLogsLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin && activeTab === 'settings') {
      fetchSettings();
      fetchHealth();
      fetchStorageLogs(storageLogsOffset);
    }
  }, [isAdmin, activeTab, storageLogsOffset]);

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setSettingsSaving(true);
    setSettingsSavedMsg('');
    try {
      const res = await client.put('/api/admin/settings', {
        backup_schedule_hour: parseInt(settings.backup_schedule_hour, 10),
        backup_schedule_minute: parseInt(settings.backup_schedule_minute, 10),
        disk_space_threshold_percent: parseFloat(settings.disk_space_threshold_percent),
        backup_retention_days: parseInt(settings.backup_retention_days, 10),
        backup_retention_weeks: parseInt(settings.backup_retention_weeks, 10),
        backup_s3_prefix: settings.backup_s3_prefix
      });
      setSettings(res.data);
      setSettingsSavedMsg('Settings saved and backup schedule updated successfully.');
      setTimeout(() => setSettingsSavedMsg(''), 4000);
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to save settings');
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleTriggerManualBackup = async () => {
    if (!window.confirm('Trigger an immediate S3 database snapshot now?')) return;
    setBackupTriggering(true);
    setBackupResult(null);
    setBackupError('');
    try {
      const res = await client.post('/api/admin/backup/trigger');
      setBackupResult(res.data);
      fetchHealth();
      fetchAlerts();
      fetchStorageLogs(0);
    } catch (err) {
      setBackupError(err.response?.data?.detail || err.message || 'Backup failed');
      fetchAlerts();
    } finally {
      setBackupTriggering(false);
    }
  };

  // ── Tab switch helper ───────────────────────────────────────────────────────
  const switchTab = (id) => {
    setActiveTab(id);
    const newPath = id === 'overview' ? '/admin' : `/admin/${id}`;
    window.history.pushState({}, '', newPath);
  };

  // ─── LOADING SCREEN ────────────────────────────────────────────────────────
  if (sessionLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-4 text-slate-400">
        <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
        <p className="text-xs font-bold tracking-widest uppercase text-blue-400 animate-pulse">Verifying Admin Session...</p>
      </div>
    );
  }

  // ─── LOGIN SCREEN ──────────────────────────────────────────────────────────
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm"
        >
          {/* Brand */}
          <div className="flex flex-col items-center mb-8 text-center">
            <div className="w-12 h-12 bg-blue-600/10 border border-blue-600/30 rounded-xl flex items-center justify-center text-blue-400 mb-4 shadow-lg shadow-blue-950/40">
              <Shield className="w-6 h-6" />
            </div>
            <h1 className="text-xl font-bold text-white uppercase tracking-wider">Policy Manager</h1>
            <p className="mt-1 text-xs text-blue-400 font-medium">Enterprise Insurance & KYC Repository</p>
            <p className="mt-0.5 text-[11px] text-slate-500">Secure Administrative Console · Authenticate to continue</p>
          </div>

          {/* Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-md shadow-xl p-6">
            {loginError && (
              <div className="flex items-center gap-2.5 p-3 mb-5 text-xs text-rose-400 bg-rose-950/20 border border-rose-900/30 rounded">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{loginError}</span>
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Username
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
                    <User className="w-4 h-4" />
                  </span>
                  <input
                    type="text"
                    required
                    placeholder="admin"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-700 text-white placeholder-slate-600 rounded text-sm outline-none focus:border-blue-500 transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
                    <Lock className="w-4 h-4" />
                  </span>
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-9 pr-10 py-2 bg-slate-950 border border-slate-700 text-white placeholder-slate-600 rounded text-sm outline-none focus:border-blue-500 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loginLoading}
                className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none border border-blue-700"
              >
                {loginLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <span>Login Securely</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          </div>
        </motion.div>
      </div>
    );
  }

  const filteredExpiringPolicies = expiringPolicies.filter((policy) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const regMatch = policy.vehicle_reg_no?.toLowerCase().includes(q);
    const nameMatch = policy.name?.toLowerCase().includes(q);
    const typeMatch = policy.doc_type?.replace(/_/g, ' ').toLowerCase().includes(q) || policy.doc_type?.toLowerCase().includes(q);
    return regMatch || nameMatch || typeMatch;
  });

  // ─── ADMIN DASHBOARD ──────────────────────────────────────────────────────
  return (
    <div className={`flex h-screen overflow-hidden antialiased ${isDark ? 'bg-slate-900 text-slate-200' : 'bg-slate-100 text-slate-800'}`}>

      {/* ── Sidebar ── */}
      <aside className={`flex flex-col justify-between flex-shrink-0 z-20 border-r transition-all duration-300 ${sidebarCollapsed ? 'w-16' : 'w-64'} ${isDark ? 'bg-slate-950 border-slate-800 text-slate-300' : 'bg-slate-900 border-slate-700 text-slate-300'}`}>
        <div>
          {/* Brand */}
          <div className={`h-14 flex items-center border-b border-slate-800 bg-slate-950 transition-all duration-300 ${sidebarCollapsed ? 'px-0 justify-center' : 'px-5 justify-between'}`}>
            {!sidebarCollapsed && (
              <div className="flex flex-col min-w-0 pr-2">
                <span className="text-white font-bold tracking-wider text-sm flex items-center gap-2 uppercase truncate">
                  <Shield className="w-4 h-4 text-blue-500 shrink-0" />
                  Policy Manager
                </span>
                <span className="text-[10px] text-slate-400 font-medium tracking-normal truncate pl-6">
                  Enterprise Document Vault
                </span>
              </div>
            )}
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
              title={sidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
            >
              {sidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </button>
          </div>

          {/* Nav */}
          <nav className="px-3 space-y-1 mt-4">
            {TABS.map(({ id, label, Icon }) => {
              const isActive = activeTab === id;
              const badge = id === 'expiring' && expiringTotal > 0
                ? expiringTotal
                : id === 'retention' && stats?.pending_cleanup > 0
                ? stats.pending_cleanup
                : id === 'settings' && unackAlertsCount > 0
                ? unackAlertsCount
                : null;
              const isAlertBadge = id === 'settings' && unackAlertsCount > 0;
              return (
                <button
                  key={id}
                  onClick={() => switchTab(id)}
                  className={`w-full flex items-center rounded text-xs font-medium transition-all duration-200 cursor-pointer relative ${
                    sidebarCollapsed ? 'justify-center py-3 px-0' : 'justify-between px-3 py-2'
                  } ${
                    isActive
                      ? 'bg-slate-800 text-white border border-slate-700'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-white border border-transparent'
                  }`}
                  title={sidebarCollapsed ? label : undefined}
                >
                  <span className="flex items-center gap-2">
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    {!sidebarCollapsed && <span>{label}</span>}
                  </span>
                  {!sidebarCollapsed && badge !== null && (
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono border ${
                      isAlertBadge
                        ? 'bg-red-500/20 text-red-400 border-red-500/30 font-bold animate-pulse'
                        : 'bg-amber-500/20 text-amber-400 border-amber-500/20'
                    }`}>
                      {badge}
                    </span>
                  )}
                  {sidebarCollapsed && badge !== null && (
                    <span className={`absolute top-1.5 right-1.5 w-2 h-2 rounded-full border border-slate-950 animate-pulse ${
                      isAlertBadge ? 'bg-red-500' : 'bg-amber-500'
                    }`} />
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Logout */}
        <div className={`p-4 border-t border-slate-800 transition-all duration-300 ${sidebarCollapsed ? 'flex justify-center px-0' : ''}`}>
          <button
            onClick={handleLogout}
            className={`text-xs text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors flex items-center cursor-pointer ${
              sidebarCollapsed ? 'p-2 justify-center' : 'w-full text-left px-3 py-2 gap-2'
            }`}
            title={sidebarCollapsed ? "Terminate Session" : undefined}
          >
            <LogOut className="w-3.5 h-3.5 shrink-0" />
            {!sidebarCollapsed && <span>Terminate Session</span>}
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className={`flex-1 flex flex-col h-screen overflow-hidden ${isDark ? 'bg-slate-900' : 'bg-slate-100'}`}>

        {/* ── Persistent System Failure / Warning Banner ── */}
        <TopAlertBanner isDark={isDark} onSwitchTab={switchTab} />

        {/* ── Header ── */}
        <header className={`h-14 border-b flex items-center justify-between px-6 sticky top-0 z-10 flex-shrink-0 transition-colors duration-200 ${isDark ? 'bg-slate-950 border-slate-800' : 'bg-white border-slate-200'}`}>
          <div className="flex-1 max-w-md">
            <div className="relative">
              <input
                type="text"
                placeholder="Search Registration (e.g. MH12AB1234)"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  if (activeTab !== 'search' && activeTab !== 'expiring') switchTab('search');
                }}
                onFocus={() => {
                  if (activeTab !== 'search' && activeTab !== 'expiring') switchTab('search');
                }}
                className={`w-full pl-9 pr-3 py-1.5 border rounded text-xs outline-none focus:border-blue-500 font-mono uppercase placeholder-slate-400 transition-colors ${
                  isDark
                    ? 'bg-slate-900 border-slate-700 text-slate-100'
                    : 'bg-slate-50 border-slate-300 text-slate-900'
                }`}
              />
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-3.5 w-3.5 text-slate-400" />
              </div>
              {searchLoading && activeTab === 'search' && (
                <span className="absolute inset-y-0 right-3 flex items-center">
                  <Loader2 className="h-3.5 w-3.5 text-blue-400 animate-spin" />
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Notification Center Popover */}
            <NotificationCenter
              isDark={isDark}
              onNavigateToUser={navigateToUser}
              onSwitchTab={switchTab}
            />

            {/* Update App Button */}
            <button
              onClick={() => setShowUpdateModal(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-600/15 hover:bg-emerald-600/25 text-emerald-400 border border-emerald-500/30 rounded text-xs font-medium transition-colors cursor-pointer"
              title="Pull latest update from Docker Hub"
            >
              <DownloadCloud className="w-3.5 h-3.5" />
              <span>Update App</span>
            </button>

            <button
              onClick={() => setShowAddUserModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium transition-colors border border-blue-700 shadow-sm cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5" />
              Add User
            </button>
            <div className={`h-4 w-px ${isDark ? 'bg-slate-700' : 'bg-slate-300'}`} />
            <button
              onClick={() => setIsDark(!isDark)}
              className={`p-1.5 rounded transition-colors cursor-pointer ${isDark ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'}`}
              title="Toggle theme"
            >
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </header>

        {/* ── Content ── */}
        <div className="flex-1 overflow-y-auto p-6">

          {/* ════════════════════════ OVERVIEW TAB ═════════════════════════ */}
          {activeTab === 'overview' && (
            <motion.div
              key="overview"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-5xl mx-auto space-y-6"
            >
              <div>
                <h1 className={`text-xl font-semibold mb-1 ${isDark ? 'text-white' : 'text-slate-900'}`}>System Overview</h1>
                <p className="text-xs text-slate-500">Live policy lifecycle and database statistics.</p>
              </div>

              {statsLoading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className={`h-24 rounded-md border animate-pulse ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-200 border-slate-300'}`} />
                  ))}
                </div>
              ) : stats ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                  <div className={`p-4 rounded-md border border-t-2 border-t-blue-500 shadow-sm ${isDark ? 'bg-slate-950 border-slate-800' : 'bg-white border-slate-200'}`}>
                    <h3 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Total Users</h3>
                    <div className={`text-2xl font-mono font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>{stats.total_users ?? '—'}</div>
                    <p className="text-[10px] text-slate-500 mt-1">Registered vehicle profiles</p>
                  </div>
                  <div className={`p-4 rounded-md border border-t-2 border-t-indigo-500 shadow-sm ${isDark ? 'bg-slate-950 border-slate-800' : 'bg-white border-slate-200'}`}>
                    <h3 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Total Policies</h3>
                    <div className={`text-2xl font-mono font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>{stats.total_policies ?? '—'}</div>
                    <p className="text-[10px] text-slate-500 mt-1">Active policy records</p>
                  </div>
                  <div className={`p-4 rounded-md border border-t-2 border-t-amber-500 shadow-sm ${isDark ? 'bg-slate-950 border-slate-800' : 'bg-white border-slate-200'}`}>
                    <h3 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Expiring (30 Days)</h3>
                    <div className={`text-2xl font-mono font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>{stats.expiring_this_month ?? '—'}</div>
                    <p className="text-[10px] text-slate-500 mt-1">Ending within next 30 days</p>
                  </div>
                  <div className={`p-4 rounded-md border border-t-2 border-t-rose-500 shadow-sm ${isDark ? 'bg-slate-950 border-slate-800' : 'bg-white border-slate-200'}`}>
                    <h3 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Already Expired</h3>
                    <div className={`text-2xl font-mono font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>{stats.already_expired ?? '—'}</div>
                    <p className="text-[10px] text-slate-500 mt-1">Passed their end dates</p>
                  </div>
                  <div className={`p-4 rounded-md border border-t-2 border-t-orange-500 shadow-sm ${isDark ? 'bg-slate-950 border-slate-800' : 'bg-white border-slate-200'}`}>
                    <h3 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Pending Cleanup</h3>
                    <div className={`text-2xl font-mono font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>{stats.pending_cleanup ?? '—'}</div>
                    <p className="text-[10px] text-slate-500 mt-1">5+ yr expired documents</p>
                  </div>
                </div>
              ) : (
                <div className={`p-12 text-center rounded-md border ${isDark ? 'bg-slate-950 border-slate-800' : 'bg-white border-slate-200'}`}>
                  <BarChart2 className="w-12 h-12 mx-auto mb-3 text-slate-700" />
                  <p className="font-semibold text-slate-500">Could not load statistics</p>
                  <button onClick={fetchStats} className="mt-3 text-xs text-blue-400 hover:text-blue-300 font-bold">Retry</button>
                </div>
              )}
            </motion.div>
          )}

          {/* ════════════════════════ EXPIRING SOON TAB ════════════════════ */}
          {activeTab === 'expiring' && (
            <motion.div
              key="expiring"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-5xl mx-auto space-y-4"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h1 className={`text-xl font-semibold mb-0.5 ${isDark ? 'text-white' : 'text-slate-900'}`}>Expiring Soon</h1>
                  <p className="text-xs text-slate-500">
                    {searchQuery ? (
                      <>
                        Found <span className="text-blue-400 font-bold">{filteredExpiringPolicies.length}</span> matching search (out of <span className="font-semibold">{expiringTotal}</span> total)
                      </>
                    ) : (
                      <>
                        Policies expiring within the next preset window — <span className="text-blue-400 font-bold">{expiringTotal}</span> found
                      </>
                    )}
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  <div className="flex items-center gap-2">
                    <label className={`text-xs font-bold whitespace-nowrap ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Window:</label>
                    <select
                      value={daysFilter}
                      onChange={(e) => setDaysFilter(Number(e.target.value))}
                      className={`px-3 py-1.5 border rounded text-xs font-medium outline-none focus:border-blue-500 cursor-pointer ${
                        isDark ? 'bg-slate-950 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-800'
                      }`}
                    >
                      <option value="30">Expiring in 1 Month</option>
                      <option value="60">Expiring in 2 Months</option>
                      <option value="90">Expiring in 3 Months</option>
                      <option value="180">Expiring in 6 Months</option>
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={() => downloadCSV(filteredExpiringPolicies, ['vehicle_reg_no', 'name', 'doc_type', 'policy_end_date'], 'expiring-policies.csv')}
                    disabled={filteredExpiringPolicies.length === 0}
                    className={`flex items-center justify-center gap-1.5 px-3 py-1.5 border rounded text-xs font-medium transition-all disabled:opacity-40 disabled:pointer-events-none cursor-pointer ${
                      isDark ? 'bg-slate-950 border-slate-700 text-slate-300 hover:bg-slate-800' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <Download className="w-3.5 h-3.5" />
                    Export CSV
                  </button>
                </div>
              </div>

              <div className={`rounded-md border shadow-sm overflow-hidden ${isDark ? 'bg-slate-950 border-slate-800' : 'bg-white border-slate-200'}`}>
                {expiringLoading ? (
                  <div className="p-12 flex items-center justify-center">
                    <Loader2 className="w-7 h-7 animate-spin text-blue-400" />
                  </div>
                ) : filteredExpiringPolicies.length === 0 ? (
                  <div className="p-16 text-center text-slate-500 flex flex-col items-center">
                    <CheckCircle2 className="w-14 h-14 text-slate-700 mb-3" />
                    <p className="font-semibold text-slate-400">No expiring policies found</p>
                    <p className="text-xs text-slate-600 mt-1">All policies are in good standing.</p>
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className={`border-b ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                          <tr>
                            <th className="px-4 py-2.5 font-semibold text-slate-500">Vehicle Reg No</th>
                            <th className="px-4 py-2.5 font-semibold text-slate-500">Name</th>
                            <th className="px-4 py-2.5 font-semibold text-slate-500">Policy Type</th>
                            <th className="px-4 py-2.5 font-semibold text-slate-500">Ends On</th>
                            <th className="px-4 py-2.5 font-semibold text-slate-500 text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className={`divide-y ${isDark ? 'divide-slate-800/60' : 'divide-slate-100'}`}>
                          {filteredExpiringPolicies.map((policy, idx) => (
                            <tr key={idx} className={`transition-colors ${isDark ? 'hover:bg-slate-900' : 'hover:bg-slate-50'}`}>
                              <td className="px-4 py-3 font-mono font-medium text-blue-400">{policy.vehicle_reg_no}</td>
                              <td className={`px-4 py-3 font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>{policy.name || 'Incomplete'}</td>
                              <td className={`px-4 py-3 ${isDark ? 'text-slate-400' : 'text-slate-500'} capitalize`}>{policy.doc_type?.replace(/_/g, ' ') || '—'}</td>
                              <td className="px-4 py-3 font-mono text-amber-500 font-semibold">
                                {policy.policy_end_date
                                  ? new Date(policy.policy_end_date + 'T00:00:00Z').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
                                  : '—'}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <button
                                  type="button"
                                  onClick={() => navigateToUser(policy.vehicle_reg_no)}
                                  className={`inline-flex items-center gap-1 text-xs text-blue-400 hover:text-white font-medium px-2.5 py-1.5 border rounded transition-all cursor-pointer ${
                                    isDark ? 'bg-slate-900 border-slate-700 hover:bg-blue-600 hover:border-blue-500' : 'bg-white border-slate-300 hover:bg-blue-600 hover:border-blue-500'
                                  }`}
                                >
                                  <span>View</span>
                                  <ChevronRight className="w-3 h-3" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className={`px-4 py-3 flex justify-between items-center border-t text-[10px] ${isDark ? 'bg-slate-900 border-slate-800 text-slate-500' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
                      <span>Showing {expiringPolicies.length} of <span className="text-blue-400 font-bold">{expiringTotal}</span> policies</span>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          disabled={expiringOffset === 0}
                          onClick={() => setExpiringOffset((p) => Math.max(0, p - EXPIRING_LIMIT))}
                          className={`px-2 py-1 border rounded disabled:opacity-40 disabled:pointer-events-none cursor-pointer ${isDark ? 'bg-slate-950 border-slate-700' : 'bg-white border-slate-300'}`}
                        >Prev</button>
                        <span className="px-2 py-1 flex items-center">
                          Page {Math.floor(expiringOffset / EXPIRING_LIMIT) + 1} of {Math.max(1, Math.ceil(expiringTotal / EXPIRING_LIMIT))}
                        </span>
                        <button
                          type="button"
                          disabled={expiringOffset + EXPIRING_LIMIT >= expiringTotal}
                          onClick={() => setExpiringOffset((p) => p + EXPIRING_LIMIT)}
                          className={`px-2 py-1 border rounded disabled:opacity-40 disabled:pointer-events-none cursor-pointer ${isDark ? 'bg-slate-950 border-slate-700' : 'bg-white border-slate-300'}`}
                        >Next</button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          )}

          {/* ════════════════════════ RETENTION TAB ════════════════════════ */}
          {activeTab === 'retention' && (
            <motion.div
              key="retention"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-3xl mx-auto space-y-6"
            >
              <div>
                <h1 className={`text-xl font-semibold mb-1 ${isDark ? 'text-white' : 'text-slate-900'}`}>Retention Jobs</h1>
                <p className="text-xs text-slate-500">Manage automated S3 storage cleanup for expired documents.</p>
              </div>

              <div className={`p-6 rounded-md border shadow-sm space-y-6 ${isDark ? 'bg-slate-950 border-slate-800' : 'bg-white border-slate-200'}`}>

                {/* Initial scan state */}
                {!hasScanned && !purgeSuccess && !cleanupLoading && (
                  <div className="flex flex-col items-center text-center py-6 px-4">
                    <div className={`w-14 h-14 rounded-xl flex items-center justify-center mb-4 ${isDark ? 'bg-blue-950/30 border border-blue-800/30' : 'bg-blue-50 border border-blue-200'}`}>
                      <Trash2 className="w-6 h-6 text-blue-400" />
                    </div>
                    <h3 className={`text-sm font-semibold mb-1.5 ${isDark ? 'text-white' : 'text-slate-900'}`}>Scan Required</h3>
                    <p className={`text-xs max-w-md mb-6 leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      Check for documents that have exceeded the 5-year retention window. No files will be modified during the scan.
                    </p>
                    <button
                      onClick={runDryRun}
                      className="flex items-center justify-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium transition-colors border border-blue-700 cursor-pointer"
                    >
                      <Search className="w-4 h-4" />
                      Dry Run Scan
                    </button>
                  </div>
                )}

                {/* Scanning progress */}
                {cleanupLoading && (
                  <div className="flex flex-col items-center text-center py-10">
                    <Loader2 className="w-10 h-10 animate-spin text-blue-500 mb-4" />
                    <p className="text-xs font-semibold text-blue-400 uppercase tracking-widest">Scanning storage records...</p>
                    <p className="text-[10px] text-slate-500 mt-1">This may take a moment.</p>
                  </div>
                )}

                {/* Scan results */}
                {hasScanned && !cleanupLoading && (
                  <div className="space-y-4">
                    {scannedCount > 0 ? (
                      <div className={`p-5 rounded-md border flex flex-col sm:flex-row items-center justify-between gap-4 ${isDark ? 'bg-amber-950/20 border-amber-900/30' : 'bg-amber-50 border-amber-200'}`}>
                        <div className="flex items-start gap-3">
                          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                          <div>
                            <h4 className={`text-sm font-semibold mb-1 ${isDark ? 'text-white' : 'text-slate-900'}`}>Found {scannedCount} expired files</h4>
                            <p className="text-xs text-slate-400 max-w-lg">These documents are past their retention dates and ready for permanent deletion.</p>
                          </div>
                        </div>
                        <div className="flex gap-3 shrink-0">
                          <button onClick={runDryRun} className={`px-4 py-2 border rounded text-xs font-medium transition-colors cursor-pointer ${isDark ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'}`}>
                            Scan Again
                          </button>
                          <button
                            onClick={() => setConfirmDialogOpen(true)}
                            className="flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded text-xs font-medium transition-colors border border-rose-700 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                            Execute Purge
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className={`p-6 rounded-md border flex flex-col items-center text-center py-8 ${isDark ? 'bg-emerald-950/20 border-emerald-900/30' : 'bg-emerald-50 border-emerald-200'}`}>
                        <CheckCircle2 className="w-10 h-10 text-emerald-400 mb-3" />
                        <h4 className={`text-sm font-semibold mb-1 ${isDark ? 'text-white' : 'text-slate-900'}`}>Storage fully optimized!</h4>
                        <p className="text-xs text-slate-400 max-w-md mb-4">No expired documents were found.</p>
                        <button onClick={runDryRun} className={`px-4 py-2 border rounded text-xs font-medium cursor-pointer ${isDark ? 'bg-slate-800 border-slate-700 text-slate-300' : 'bg-white border-slate-300 text-slate-700'}`}>
                          Rescan
                        </button>
                      </div>
                    )}

                    {cleanupResult && (
                      <details className={`rounded-md border overflow-hidden ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                        <summary className={`flex items-center justify-between p-3 cursor-pointer text-xs font-medium ${isDark ? 'bg-slate-900 text-slate-400 hover:bg-slate-800' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}>
                          Show Technical Scan Logs
                        </summary>
                        <div className={`p-3 font-mono text-[10px] whitespace-pre-wrap leading-relaxed ${isDark ? 'bg-slate-950 text-slate-400' : 'bg-white text-slate-600'}`}>
                          {cleanupResult}
                        </div>
                      </details>
                    )}
                  </div>
                )}

                {/* Purge success */}
                {purgeSuccess && !cleanupLoading && (
                  <div className={`p-6 rounded-md border flex flex-col items-center text-center py-8 ${isDark ? 'bg-blue-950/20 border-blue-900/30' : 'bg-blue-50 border-blue-200'}`}>
                    <CheckCircle2 className="w-10 h-10 text-blue-400 mb-3" />
                    <h4 className={`text-sm font-semibold mb-1 ${isDark ? 'text-white' : 'text-slate-900'}`}>Cleanup complete!</h4>
                    <p className="text-xs text-slate-400 max-w-sm mb-4">
                      Permanently purged <span className="text-blue-400 font-bold">{purgedCount}</span> records and their S3 objects.
                    </p>
                    <button onClick={runDryRun} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium border border-blue-700 cursor-pointer">
                      Scan Again
                    </button>
                  </div>
                )}

                {/* Policy note */}
                <div className={`flex items-start gap-3 p-4 rounded border text-xs leading-normal ${isDark ? 'bg-slate-900 border-slate-800 text-slate-500' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-blue-500" />
                  <p>
                    <strong>Retention Policy Rule:</strong> Documents are subject to cleanup only if they are marked as soft-deleted OR if they are older versions (non-latest) AND their expiration date is more than 5 years ago. Active latest policies are always retained.
                  </p>
                </div>
              </div>

              {/* Confirm Purge Dialog */}
              <AnimatePresence>
                {confirmDialogOpen && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm">
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className={`w-full max-w-md p-6 rounded-md border shadow-2xl flex flex-col gap-5 relative ${isDark ? 'bg-slate-900 border-rose-900/40' : 'bg-white border-rose-200'}`}
                    >
                      <button
                        type="button"
                        onClick={() => { setConfirmDialogOpen(false); setConfirmPurgeInput(''); }}
                        className={`absolute top-4 right-4 p-1.5 rounded border transition-colors cursor-pointer ${isDark ? 'bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-white border-slate-800' : 'bg-slate-100 hover:bg-slate-200 text-slate-500 border-slate-300'}`}
                      >
                        <X className="w-4 h-4" />
                      </button>

                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-rose-500/10 rounded flex items-center justify-center text-rose-400 shrink-0">
                          <AlertTriangle className="w-5 h-5" />
                        </div>
                        <div>
                          <h3 className={`text-base font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>Confirm Permanent Purge</h3>
                          <p className="text-[10px] text-rose-400 font-semibold mt-0.5 uppercase tracking-wider">This action is irreversible</p>
                        </div>
                      </div>

                      <p className={`text-sm leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                        You are about to permanently delete <span className="text-rose-400 font-bold">{scannedCount} expired documents</span> from S3 storage and the database. This cannot be undone.
                      </p>

                      <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                          Type <span className="text-rose-400 font-mono">CONFIRM</span> to enable the purge button
                        </label>
                        <input
                          type="text"
                          value={confirmPurgeInput}
                          onChange={(e) => setConfirmPurgeInput(e.target.value)}
                          placeholder="CONFIRM"
                          className={`w-full px-4 py-2.5 border rounded outline-none focus:border-rose-500 transition-all font-mono text-sm ${isDark ? 'bg-slate-950 border-slate-800 text-white placeholder-slate-700' : 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400'}`}
                        />
                      </div>

                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={() => { setConfirmDialogOpen(false); setConfirmPurgeInput(''); }}
                          className={`flex-1 py-2.5 rounded text-sm font-medium transition-all cursor-pointer ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'}`}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={runPurge}
                          disabled={confirmPurgeInput !== 'CONFIRM' || cleanupLoading}
                          className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded text-sm font-medium transition-all disabled:opacity-40 disabled:pointer-events-none border border-rose-700 cursor-pointer"
                        >
                          {cleanupLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                          Purge Now
                        </button>
                      </div>
                    </motion.div>
                  </div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {/* ════════════════════════ SEARCH TAB ═══════════════════════════ */}
          {activeTab === 'search' && (
            <motion.div
              key="search"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-5xl mx-auto space-y-4"
            >
              <div className="flex justify-between items-end">
                <div>
                  <h1 className={`text-xl font-semibold mb-0.5 ${isDark ? 'text-white' : 'text-slate-900'}`}>Vehicle Registry</h1>
                  <p className="text-xs text-slate-500">Search, filter, and manage policyholder documents.</p>
                </div>
                <span className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                  Total records: <span className="text-blue-400 font-bold">{total}</span>
                </span>
              </div>

              <div className={`rounded-md border shadow-sm overflow-hidden ${isDark ? 'bg-slate-950 border-slate-800' : 'bg-white border-slate-200'}`}>
                {users.length === 0 ? (
                  <div className="p-16 text-center text-slate-500 flex flex-col items-center justify-center">
                    <FolderOpen className="w-16 h-16 text-slate-700 mb-4" />
                    <p className="font-semibold text-slate-400">No submissions found</p>
                    <p className="text-xs text-slate-600 mt-1">
                      {searchQuery ? 'No records match the current filter criteria.' : 'No users have uploaded policy records yet.'}
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className={`border-b ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                          <tr>
                            <th className="px-4 py-2.5 font-semibold text-slate-500">Vehicle Reg No</th>
                            <th className="px-4 py-2.5 font-semibold text-slate-500">Owner Name</th>
                            <th className="px-4 py-2.5 font-semibold text-slate-500">Phone Number</th>
                            <th className="px-4 py-2.5 font-semibold text-slate-500">Email Address</th>
                            <th className="px-4 py-2.5 font-semibold text-slate-500">Joined Date</th>
                            <th className="px-4 py-2.5 font-semibold text-slate-500 text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className={`divide-y ${isDark ? 'divide-slate-800/60' : 'divide-slate-100'}`}>
                          {users.map((user) => (
                            <tr
                              key={user.vehicle_reg_no}
                              onClick={() => navigateToUser(user.vehicle_reg_no)}
                              className={`transition-colors cursor-pointer group ${isDark ? 'hover:bg-slate-900' : 'hover:bg-slate-50'}`}
                            >
                              <td className="px-4 py-3 font-mono font-medium text-blue-400">{user.vehicle_reg_no}</td>
                              <td className={`px-4 py-3 font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>{user.name || 'Incomplete'}</td>
                              <td className={`px-4 py-3 font-mono ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{user.phone_number || '—'}</td>
                              <td className={`px-4 py-3 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{user.email || 'N/A'}</td>
                              <td className={`px-4 py-3 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{formatDate(user.created_at)}</td>
                              <td className="px-4 py-3 text-right">
                                <button
                                  type="button"
                                  className={`inline-flex items-center gap-1 text-xs text-blue-400 hover:text-white font-medium px-2.5 py-1.5 border rounded transition-all ${isDark ? 'bg-slate-900 border-slate-700 hover:bg-blue-600 hover:border-blue-500' : 'bg-white border-slate-300 hover:bg-blue-600 hover:border-blue-500'}`}
                                >
                                  <span>Manage</span>
                                  <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className={`px-4 py-3 flex justify-between items-center border-t text-[10px] ${isDark ? 'bg-slate-900 border-slate-800 text-slate-500' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
                      <span>Showing {users.length} of <span className="text-blue-400 font-bold">{total}</span> users</span>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          disabled={offset === 0}
                          onClick={() => setOffset((prev) => Math.max(0, prev - limit))}
                          className={`px-2 py-1 border rounded disabled:opacity-40 disabled:pointer-events-none cursor-pointer ${isDark ? 'bg-slate-950 border-slate-700' : 'bg-white border-slate-300'}`}
                        >Prev</button>
                        <span className="px-2 py-1 flex items-center">Page {Math.floor(offset / limit) + 1} of {Math.max(1, Math.ceil(total / limit))}</span>
                        <button
                          type="button"
                          disabled={offset + limit >= total}
                          onClick={() => setOffset((prev) => prev + limit)}
                          className={`px-2 py-1 border rounded disabled:opacity-40 disabled:pointer-events-none cursor-pointer ${isDark ? 'bg-slate-950 border-slate-700' : 'bg-white border-slate-300'}`}
                        >Next</button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          )}

          {/* ════════════════════════ SETTINGS & BACKUP TAB ═════════════════ */}
          {activeTab === 'settings' && (
            <motion.div
              key="settings"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-5xl mx-auto space-y-6"
            >
              <div className="flex justify-between items-end">
                <div>
                  <h1 className={`text-xl font-semibold mb-0.5 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                    System Settings & Backup Orchestration
                  </h1>
                  <p className="text-xs text-slate-500">
                    Manage automated PostgreSQL S3 snapshots, customize retention policies, and monitor storage integrity.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => { fetchSettings(); fetchHealth(); fetchStorageLogs(storageLogsOffset); fetchAlerts(); }}
                  className={`flex items-center gap-1 text-xs px-2.5 py-1.5 border rounded transition-colors cursor-pointer ${
                    isDark ? 'bg-slate-900 border-slate-700 text-slate-300 hover:text-white' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${healthLoading ? 'animate-spin' : ''}`} />
                  <span>Refresh Status</span>
                </button>
              </div>

              {/* ── Top Status Cards Grid ── */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Host Disk Health */}
                <div className={`p-4 rounded-md border shadow-sm flex flex-col justify-between ${isDark ? 'bg-slate-950 border-slate-800' : 'bg-white border-slate-200'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-slate-400 flex items-center gap-1.5 uppercase tracking-wider">
                      <HardDrive className="w-3.5 h-3.5 text-blue-400" />
                      Host Disk Usage
                    </span>
                    <span className={`text-xs font-mono font-bold ${
                      (systemHealth?.disk?.percent_used || 0) > (settings.disk_space_threshold_percent || 85)
                        ? 'text-red-400'
                        : (systemHealth?.disk?.percent_used || 0) > 70
                        ? 'text-amber-400'
                        : 'text-emerald-400'
                    }`}>
                      {systemHealth?.disk ? `${systemHealth.disk.percent_used}%` : 'Checking...'}
                    </span>
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-2 mb-2 overflow-hidden">
                    <div
                      className={`h-2 rounded-full transition-all duration-500 ${
                        (systemHealth?.disk?.percent_used || 0) > (settings.disk_space_threshold_percent || 85)
                          ? 'bg-red-500'
                          : (systemHealth?.disk?.percent_used || 0) > 70
                          ? 'bg-amber-500'
                          : 'bg-emerald-500'
                      }`}
                      style={{ width: `${Math.min(100, systemHealth?.disk?.percent_used || 0)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[11px] text-slate-500">
                    <span>Used: {systemHealth?.disk?.used_gb ?? '—'} GB</span>
                    <span>Free: {systemHealth?.disk?.free_gb ?? '—'} GB</span>
                    <span>Total: {systemHealth?.disk?.total_gb ?? '—'} GB</span>
                  </div>
                </div>

                {/* S3 Cloud Storage Status */}
                <div className={`p-4 rounded-md border shadow-sm flex flex-col justify-between ${isDark ? 'bg-slate-950 border-slate-800' : 'bg-white border-slate-200'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-slate-400 flex items-center gap-1.5 uppercase tracking-wider">
                      <Server className="w-3.5 h-3.5 text-purple-400" />
                      Cloud Storage (AWS S3)
                    </span>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                      systemHealth?.s3_status === 'connected'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'bg-red-500/20 text-red-400 border border-red-500/30'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${systemHealth?.s3_status === 'connected' ? 'bg-emerald-400' : 'bg-red-400'}`} />
                      {systemHealth?.s3_status === 'connected' ? 'Connected' : 'Error'}
                    </span>
                  </div>
                  <div className="text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Bucket:</span>
                      <span className="font-mono text-slate-300 font-medium">{settings.s3_bucket || '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Region:</span>
                      <span className="font-mono text-slate-300">{settings.aws_region || '—'}</span>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-slate-800/60 text-[10px] text-slate-500 flex justify-between">
                    <span>WORM Object Lock: Enabled</span>
                    <span>Enc: {settings.kms_encrypted ? 'SSE-KMS' : 'SSE-S3 (AES-256)'}</span>
                  </div>
                </div>

                {/* Manual On-Demand Backup */}
                <div className={`p-4 rounded-md border shadow-sm flex flex-col justify-between ${isDark ? 'bg-slate-950 border-slate-800' : 'bg-white border-slate-200'}`}>
                  <div>
                    <span className="text-xs font-semibold text-slate-400 flex items-center gap-1.5 uppercase tracking-wider mb-1">
                      <Database className="w-3.5 h-3.5 text-blue-400" />
                      Manual Database Snapshot
                    </span>
                    <p className="text-[11px] text-slate-500 mb-3">
                      Execute an immediate live dump from Postgres Docker to S3.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleTriggerManualBackup}
                    disabled={backupTriggering}
                    className="w-full py-2 px-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-sm"
                  >
                    {backupTriggering ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Streaming pg_dump to S3...</span>
                      </>
                    ) : (
                      <>
                        <Download className="w-3.5 h-3.5" />
                        <span>Backup Database Now</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* ── Live Backup Notification Banner ── */}
              {backupResult && (
                <div className="p-3 bg-emerald-500/15 border border-emerald-500/30 rounded-md text-xs text-emerald-300 flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold">Snapshot Created & Verified: </span>
                      <span className="font-mono text-[11px] text-slate-200">{backupResult.details?.s3_key}</span>
                      <div className="text-[10px] text-slate-400 mt-0.5 space-x-2">
                        <span>Size: {Math.round((backupResult.details?.size_bytes || 0) / 1024)} KB</span>
                        <span>•</span>
                        <span>SHA256: {backupResult.details?.checksum_sha256?.substring(0, 16)}...</span>
                        <span>•</span>
                        <span>Object Lock: {backupResult.details?.object_lock_applied ? 'Enforced' : 'IAM Protected'}</span>
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setBackupResult(null)}
                    className="text-slate-400 hover:text-white cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {backupError && (
                <div className="p-3 bg-red-500/15 border border-red-500/30 rounded-md text-xs text-red-300 flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold">Backup Failed: </span>
                      <span>{backupError}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setBackupError('')}
                    className="text-slate-400 hover:text-white cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* ── Operational Settings Form ── */}
              <div className={`p-5 rounded-md border shadow-sm ${isDark ? 'bg-slate-950 border-slate-800' : 'bg-white border-slate-200'}`}>
                <div className="border-b pb-3 mb-4 flex items-center justify-between border-slate-800">
                  <div>
                    <h2 className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                      Operational Tuning Settings
                    </h2>
                    <p className="text-xs text-slate-500">
                      Configure schedule frequencies and retention windows without modifying server files.
                    </p>
                  </div>
                  {settingsSavedMsg && (
                    <span className="text-xs text-emerald-400 flex items-center gap-1 font-medium animate-fadeIn">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {settingsSavedMsg}
                    </span>
                  )}
                </div>

                <form onSubmit={handleSaveSettings} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Schedule Time */}
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">
                        Daily Backup Time (UTC)
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <input
                            type="number"
                            min="0"
                            max="23"
                            value={settings.backup_schedule_hour}
                            onChange={(e) => setSettings({ ...settings, backup_schedule_hour: e.target.value })}
                            className={`w-full px-3 py-1.5 border rounded text-xs outline-none focus:border-blue-500 font-mono ${
                              isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                            }`}
                          />
                          <span className="text-[10px] text-slate-500 mt-0.5 block">Hour (0-23)</span>
                        </div>
                        <div>
                          <input
                            type="number"
                            min="0"
                            max="59"
                            value={settings.backup_schedule_minute}
                            onChange={(e) => setSettings({ ...settings, backup_schedule_minute: e.target.value })}
                            className={`w-full px-3 py-1.5 border rounded text-xs outline-none focus:border-blue-500 font-mono ${
                              isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                            }`}
                          />
                          <span className="text-[10px] text-slate-500 mt-0.5 block">Minute (0-59)</span>
                        </div>
                      </div>
                    </div>

                    {/* Disk Threshold */}
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">
                        Disk Usage Alert Threshold (%)
                      </label>
                      <input
                        type="number"
                        min="10"
                        max="99"
                        step="0.5"
                        value={settings.disk_space_threshold_percent}
                        onChange={(e) => setSettings({ ...settings, disk_space_threshold_percent: e.target.value })}
                        className={`w-full px-3 py-1.5 border rounded text-xs outline-none focus:border-blue-500 font-mono ${
                          isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                        }`}
                      />
                      <span className="text-[10px] text-slate-500 mt-0.5 block">
                        Snapshots abort and alert when disk exceeds this %
                      </span>
                    </div>

                    {/* S3 Prefix */}
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">
                        S3 Storage Folder / Prefix
                      </label>
                      <input
                        type="text"
                        value={settings.backup_s3_prefix}
                        onChange={(e) => setSettings({ ...settings, backup_s3_prefix: e.target.value })}
                        className={`w-full px-3 py-1.5 border rounded text-xs outline-none focus:border-blue-500 font-mono ${
                          isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                        }`}
                      />
                      <span className="text-[10px] text-slate-500 mt-0.5 block">
                        Dedicated directory isolated from documents
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                    {/* Retention Daily */}
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">
                        Daily Snapshots Retention Count
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="90"
                        value={settings.backup_retention_days}
                        onChange={(e) => setSettings({ ...settings, backup_retention_days: e.target.value })}
                        className={`w-full px-3 py-1.5 border rounded text-xs outline-none focus:border-blue-500 font-mono ${
                          isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                        }`}
                      />
                      <span className="text-[10px] text-slate-500 mt-0.5 block">
                        Keeps all daily snapshots within this many days (default: 7)
                      </span>
                    </div>

                    {/* Retention Weekly */}
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">
                        Weekly (Sunday) Retention Count
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="52"
                        value={settings.backup_retention_weeks}
                        onChange={(e) => setSettings({ ...settings, backup_retention_weeks: e.target.value })}
                        className={`w-full px-3 py-1.5 border rounded text-xs outline-none focus:border-blue-500 font-mono ${
                          isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                        }`}
                      />
                      <span className="text-[10px] text-slate-500 mt-0.5 block">
                        Retains Sunday snapshots up to this many weeks (default: 4)
                      </span>
                    </div>
                  </div>

                  <div className="pt-2 flex justify-end">
                    <button
                      type="submit"
                      disabled={settingsSaving}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
                    >
                      {settingsSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      Save Operational Settings
                    </button>
                  </div>
                </form>
              </div>

              {/* ── Security Architecture Card ── */}
              <div className={`p-4 rounded-md border text-xs ${isDark ? 'bg-slate-950/60 border-slate-800 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>
                <div className="flex items-center gap-2 mb-2 text-slate-300 font-semibold">
                  <Shield className="w-4 h-4 text-emerald-400" />
                  <span>Secure Infrastructure Security Model (.env Driven)</span>
                </div>
                <p className="text-[11px] mb-3 leading-relaxed">
                  System secrets and security credentials are strictly immutable at runtime and securely injected via <code className="text-blue-400 font-mono">.env</code>.
                  Compromised application credentials cannot delete or overwrite existing S3 snapshot objects.
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[11px]">
                  <div className={`p-2.5 rounded border ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
                    <span className="text-slate-500 block mb-0.5">Database Source</span>
                    <span className="font-mono text-slate-200 font-semibold">Docker (dms-postgres:5433)</span>
                  </div>
                  <div className={`p-2.5 rounded border ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
                    <span className="text-slate-500 block mb-0.5">S3 IAM Policy</span>
                    <span className="font-mono text-emerald-400 font-semibold">
                      {settings.has_dedicated_backup_credentials ? 'Scoped IAM Key' : 'App IAM Key'}
                    </span>
                  </div>
                  <div className={`p-2.5 rounded border ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
                    <span className="text-slate-500 block mb-0.5">Encryption Standard</span>
                    <span className="font-mono text-slate-200 font-semibold">{settings.kms_encrypted ? 'SSE-KMS' : 'SSE-S3 (AES-256)'}</span>
                  </div>
                  <div className={`p-2.5 rounded border ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
                    <span className="text-slate-500 block mb-0.5">WORM Protection</span>
                    <span className="font-mono text-emerald-400 font-semibold">S3 Object Lock Mode</span>
                  </div>
                </div>
              </div>

              {/* ── Storage Activity Log Table ── */}
              <div className={`rounded-md border shadow-sm overflow-hidden ${isDark ? 'bg-slate-950 border-slate-800' : 'bg-white border-slate-200'}`}>
                <div className={`px-4 py-3 border-b flex justify-between items-center ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                  <div>
                    <h3 className={`text-xs font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                      Storage Write Operations Audit Log
                    </h3>
                    <p className="text-[10px] text-slate-500">
                      Non-blocking physical write logs tracking uploads, deletes, and backup snapshots.
                    </p>
                  </div>
                  <span className="text-[10px] text-slate-500">
                    Total Writes: <span className="font-mono text-blue-400 font-bold">{storageLogsTotal}</span>
                  </span>
                </div>

                {storageLogs.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-500">
                    No write operations logged yet.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className={`border-b ${isDark ? 'bg-slate-900 border-slate-800 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>
                        <tr>
                          <th className="px-3 py-2 font-semibold">Timestamp</th>
                          <th className="px-3 py-2 font-semibold">Operation</th>
                          <th className="px-3 py-2 font-semibold">Target Path</th>
                          <th className="px-3 py-2 font-semibold">Size</th>
                          <th className="px-3 py-2 font-semibold">Checksum (SHA256)</th>
                          <th className="px-3 py-2 font-semibold">Triggered By</th>
                          <th className="px-3 py-2 font-semibold text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody className={`divide-y text-[11px] ${isDark ? 'divide-slate-800/60' : 'divide-slate-100'}`}>
                        {storageLogs.map((log) => (
                          <tr key={log.id} className={isDark ? 'hover:bg-slate-900/40' : 'hover:bg-slate-50'}>
                            <td className="px-3 py-2 text-slate-400 font-mono">
                              {new Date(log.timestamp).toLocaleString()}
                            </td>
                            <td className="px-3 py-2 font-semibold">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                                log.operation === 'BACKUP_SNAPSHOT'
                                  ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                                  : log.operation === 'UPLOAD'
                                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                  : log.operation === 'PURGE_RETENTION'
                                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                  : 'bg-slate-700 text-slate-300'
                              }`}>
                                {log.operation}
                              </span>
                            </td>
                            <td className="px-3 py-2 font-mono text-slate-300 truncate max-w-[200px]" title={log.target_path}>
                              {log.target_path}
                            </td>
                            <td className="px-3 py-2 font-mono text-slate-400">
                              {log.size_bytes ? `${Math.round(log.size_bytes / 1024)} KB` : '—'}
                            </td>
                            <td className="px-3 py-2 font-mono text-slate-500 truncate max-w-[120px]" title={log.checksum_sha256}>
                              {log.checksum_sha256 ? `${log.checksum_sha256.substring(0, 10)}...` : '—'}
                            </td>
                            <td className="px-3 py-2 text-slate-400 font-mono">
                              {log.triggered_by}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                log.status === 'SUCCESS' ? 'text-emerald-400' : 'text-red-400'
                              }`}>
                                {log.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {storageLogsTotal > 15 && (
                  <div className={`px-4 py-2 flex justify-between items-center border-t text-[10px] ${isDark ? 'bg-slate-900 border-slate-800 text-slate-500' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
                    <span>Showing {storageLogs.length} of {storageLogsTotal} log entries</span>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        disabled={storageLogsOffset === 0}
                        onClick={() => setStorageLogsOffset((prev) => Math.max(0, prev - 15))}
                        className={`px-2 py-0.5 border rounded disabled:opacity-40 cursor-pointer ${isDark ? 'bg-slate-950 border-slate-700' : 'bg-white border-slate-300'}`}
                      >Prev</button>
                      <button
                        type="button"
                        disabled={storageLogsOffset + 15 >= storageLogsTotal}
                        onClick={() => setStorageLogsOffset((prev) => prev + 15)}
                        className={`px-2 py-0.5 border rounded disabled:opacity-40 cursor-pointer ${isDark ? 'bg-slate-950 border-slate-700' : 'bg-white border-slate-300'}`}
                      >Next</button>
                    </div>
                  </div>
                )}
              </div>

              {/* ── System Alerts History Table ── */}
              <div className={`rounded-md border shadow-sm overflow-hidden ${isDark ? 'bg-slate-950 border-slate-800' : 'bg-white border-slate-200'}`}>
                <div className={`px-4 py-3 border-b flex justify-between items-center ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                  <div>
                    <h3 className={`text-xs font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                      System Alerts & Failure History
                    </h3>
                    <p className="text-[10px] text-slate-500">
                      Persistent log of critical warnings, disk threshold alerts, and backup exceptions.
                    </p>
                  </div>
                  <span className={`text-[10px] font-semibold ${unackAlertsCount > 0 ? 'text-red-400' : 'text-slate-500'}`}>
                    Unacknowledged: {unackAlertsCount}
                  </span>
                </div>

                {alerts.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-500">
                    No system alerts recorded. System running smoothly.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className={`border-b ${isDark ? 'bg-slate-900 border-slate-800 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>
                        <tr>
                          <th className="px-3 py-2 font-semibold">Timestamp</th>
                          <th className="px-3 py-2 font-semibold">Type</th>
                          <th className="px-3 py-2 font-semibold">Severity</th>
                          <th className="px-3 py-2 font-semibold">Message</th>
                          <th className="px-3 py-2 font-semibold">Status</th>
                          <th className="px-3 py-2 font-semibold text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className={`divide-y text-[11px] ${isDark ? 'divide-slate-800/60' : 'divide-slate-100'}`}>
                        {alerts.map((alt) => (
                          <tr key={alt.id} className={!alt.is_acknowledged ? (isDark ? 'bg-red-950/20' : 'bg-red-50/50') : undefined}>
                            <td className="px-3 py-2 text-slate-400 font-mono">
                              {new Date(alt.created_at).toLocaleString()}
                            </td>
                            <td className="px-3 py-2 font-mono font-medium text-slate-300">
                              {alt.alert_type}
                            </td>
                            <td className="px-3 py-2">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                alt.severity === 'CRITICAL' ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-amber-500/20 text-amber-400'
                              }`}>
                                {alt.severity}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-slate-200">
                              {alt.message}
                            </td>
                            <td className="px-3 py-2">
                              {alt.is_acknowledged ? (
                                <span className="text-[10px] text-slate-500">
                                  Ack by {alt.acknowledged_by} ({new Date(alt.acknowledged_at).toLocaleTimeString()})
                                </span>
                              ) : (
                                <span className="text-[10px] text-red-400 font-semibold animate-pulse">
                                  Active (Unacknowledged)
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right">
                              {!alt.is_acknowledged && (
                                <button
                                  type="button"
                                  onClick={() => handleAcknowledgeAlert(alt.id)}
                                  disabled={ackLoading === alt.id}
                                  className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-[10px] font-semibold cursor-pointer"
                                >
                                  {ackLoading === alt.id ? 'Saving...' : 'Acknowledge'}
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </motion.div>
          )}



        </div>
      </main>

      {/* ── Add User Modal ── */}
      <AnimatePresence>
        {showAddUserModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={`w-full max-w-md p-6 rounded-md border shadow-2xl flex flex-col gap-5 relative ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}
            >
              <button
                type="button"
                onClick={() => { setShowAddUserModal(false); setNewUserError(''); }}
                className={`absolute top-4 right-4 p-1.5 rounded border transition-colors cursor-pointer ${isDark ? 'bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-white border-slate-800' : 'bg-slate-100 hover:bg-slate-200 text-slate-500 border-slate-300'}`}
              >
                <X className="w-4 h-4" />
              </button>

              <div>
                <h3 className={`text-base font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>Register New Policyholder</h3>
                <p className="text-xs text-slate-500 mt-0.5">Create a verified user profile and assign documents</p>
              </div>

              {newUserError && (
                <div className="flex items-center gap-2.5 p-3 text-xs text-rose-400 bg-rose-950/10 border border-rose-900/20 rounded">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{newUserError}</span>
                </div>
              )}

              <form onSubmit={handleCreateUser} className="space-y-4 text-xs font-semibold">
                {[
                  { label: 'Vehicle Registration Number *', key: 'vehicleRegNo', type: 'text', value: newUserReg, setter: setNewUserReg, icon: <Hash className="w-4 h-4" />, placeholder: 'MH12AB1234' },
                  { label: 'Full Name *', key: 'name', type: 'text', value: newUserName, setter: setNewUserName, icon: <User className="w-4 h-4" />, placeholder: 'Jane Doe' },
                  { label: 'Phone Number *', key: 'phone', type: 'tel', value: newUserPhone, setter: setNewUserPhone, icon: <Phone className="w-4 h-4" />, placeholder: '+919876543210' },
                  { label: 'Email Address (Optional)', key: 'email', type: 'email', value: newUserEmail, setter: setNewUserEmail, icon: <Mail className="w-4 h-4" />, placeholder: 'jane@example.com' },
                ].map(({ label, key, type, value, setter, icon, placeholder }) => (
                  <div key={key}>
                    <label className={`block mb-1.5 uppercase tracking-wider text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{label}</label>
                    <div className="relative">
                      <span className={`absolute inset-y-0 left-0 flex items-center pl-3 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{icon}</span>
                      <input
                        type={type}
                        required={key === 'vehicleRegNo' || key === 'name' || key === 'phone'}
                        placeholder={placeholder}
                        value={value}
                        onChange={(e) => setter(e.target.value)}
                        className={`w-full pl-10 pr-3 py-2.5 border rounded outline-none focus:border-blue-500 transition-all font-medium text-xs ${
                          newUserFieldErrors[key]
                            ? 'border-rose-500'
                            : isDark ? 'bg-slate-950 border-slate-800 text-white placeholder-slate-600' : 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400'
                        }`}
                      />
                      {key === 'vehicleRegNo' && checkingNewUserVehicle && (
                        <span className="absolute inset-y-0 right-3 flex items-center">
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />
                        </span>
                      )}
                    </div>
                    {newUserFieldErrors[key] && (
                      <p className="text-rose-400 text-[10px] mt-1 font-semibold flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        {newUserFieldErrors[key]}
                      </p>
                    )}
                  </div>
                ))}

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={newUserLoading}
                    className="w-full flex items-center justify-center gap-1.5 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium shadow transition-all active:scale-[0.98] disabled:opacity-50 border border-blue-700 cursor-pointer"
                  >
                    {newUserLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <UserPlus className="w-4 h-4" />
                        <span>Register Profile</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Update Confirmation Modal ── */}
      <AnimatePresence>
        {showUpdateModal && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className={`w-full max-w-md rounded-xl border p-6 shadow-2xl space-y-4 ${
                isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-900'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
                  <DownloadCloud className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-semibold">Update Policy Manager</h3>
                  <p className="text-xs text-slate-400">Download and apply the latest application version</p>
                </div>
              </div>

              <div className={`p-3.5 rounded-lg border text-xs space-y-2 ${
                isDark ? 'bg-slate-950 border-slate-800 text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-700'
              }`}>
                <p>• The system will pull the latest <strong>Docker Hub</strong> release in the background.</p>
                <p>• The application will freeze for <strong>15–30 seconds</strong> while the container refreshes.</p>
                <p className="text-emerald-400 font-medium">• All documents, databases, and configuration remain 100% safe.</p>
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowUpdateModal(false)}
                  className={`px-4 py-2 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                    isDark ? 'border-slate-700 hover:bg-slate-800 text-slate-300' : 'border-slate-300 hover:bg-slate-100 text-slate-700'
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleTriggerUpdate}
                  className="px-4 py-2 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-600 shadow-sm transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <DownloadCloud className="w-4 h-4" />
                  Update Now
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Fullscreen Interactive Update Freeze Overlay ── */}
      <AnimatePresence>
        {isUpdating && (
          <div className="fixed inset-0 z-[100] bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center">
            <div className="relative mb-6">
              <div className="w-20 h-20 rounded-full border-4 border-emerald-500/20 border-t-emerald-500 animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center">
                <RefreshCw className="w-8 h-8 text-emerald-400 animate-pulse" />
              </div>
            </div>

            <h2 className="text-xl font-bold text-white mb-2 tracking-tight">
              Updating Policy Manager
            </h2>
            <p className="text-sm text-slate-300 max-w-sm mb-4">
              {updateStatusText || 'Downloading latest image and restarting services...'}
            </p>

            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900 border border-slate-800 text-xs font-mono text-slate-400">
              <Clock className="w-3.5 h-3.5 text-emerald-400" />
              <span>Elapsed: {updateProgressSec}s</span>
            </div>

            <p className="text-xs text-slate-500 mt-6 max-w-xs">
              Please do not close or refresh this tab. Your database state and documents will be fully preserved.
            </p>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
