import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bell,
  AlertTriangle,
  Clock,
  CheckCircle2,
  ExternalLink,
  ChevronRight,
  ShieldAlert,
  Loader2,
  X,
  Filter
} from 'lucide-react';
import client from '../api/client';
import { formatDocType } from '../utils/policyUtils';

const DURATION_FILTERS = [
  { label: '1 Month', days: 30 },
  { label: '2 Months', days: 60 },
  { label: '3 Months', days: 90 },
  { label: '6 Months', days: 180 },
];

export default function NotificationCenter({
  isDark = true,
  onNavigateToUser = null,
  onSwitchTab = null,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState('all'); // 'all' | 'warnings' | 'expiring'
  const [selectedDuration, setSelectedDuration] = useState(30);

  // Alerts state
  const [alerts, setAlerts] = useState([]);
  const [unackAlertsCount, setUnackAlertsCount] = useState(0);
  const [ackLoadingId, setAckLoadingId] = useState(null);

  // Expiring policies state
  const [expiringPolicies, setExpiringPolicies] = useState([]);
  const [expiringTotal, setExpiringTotal] = useState(0);
  const [expiringLoading, setExpiringLoading] = useState(false);

  const containerRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isOpen]);

  // Fetch System Alerts
  const fetchAlerts = async () => {
    try {
      const res = await client.get('/api/admin/alerts');
      setAlerts(res.data.alerts || []);
      setUnackAlertsCount(res.data.unacknowledged_count || 0);
    } catch (err) {
      console.warn('Failed to fetch system alerts:', err.message);
    }
  };

  // Fetch Expiring Policies
  const fetchExpiring = async (days) => {
    setExpiringLoading(true);
    try {
      const res = await client.get(`/api/admin/expiring?limit=15&offset=0&days=${days}`);
      setExpiringPolicies(res.data.policies || []);
      setExpiringTotal(res.data.total || 0);
    } catch (err) {
      console.warn('Failed to fetch expiring policies:', err.message);
    } finally {
      setExpiringLoading(false);
    }
  };

  // Poll alerts & fetch initial data
  useEffect(() => {
    fetchAlerts();
    fetchExpiring(selectedDuration);

    const interval = setInterval(() => {
      fetchAlerts();
      fetchExpiring(selectedDuration);
    }, 30000);

    return () => clearInterval(interval);
  }, [selectedDuration]);

  // Acknowledge single alert
  const handleAcknowledgeAlert = async (alertId, e) => {
    if (e) e.stopPropagation();
    setAckLoadingId(alertId);
    try {
      await client.post(`/api/admin/alerts/${alertId}/ack`);
      await fetchAlerts();
    } catch (err) {
      console.error('Failed to acknowledge alert:', err);
    } finally {
      setAckLoadingId(null);
    }
  };

  // Navigation handler
  const handlePolicyClick = (regNo) => {
    setIsOpen(false);
    if (onNavigateToUser) {
      onNavigateToUser(regNo);
    } else {
      window.history.pushState({}, '', `/admin/user/${regNo}`);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  };

  const unacknowledgedAlerts = alerts.filter((a) => !a.is_acknowledged);
  const totalCount = unackAlertsCount + expiringTotal;

  // Compute days until expiration
  const getDaysLeft = (endStr) => {
    if (!endStr) return null;
    const diffTime = new Date(endStr).getTime() - new Date().getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  return (
    <div className="relative" ref={containerRef}>
      {/* Bell Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`relative p-2 rounded transition-colors cursor-pointer flex items-center justify-center ${
          isOpen
            ? isDark
              ? 'bg-slate-800 text-white'
              : 'bg-slate-200 text-slate-900'
            : isDark
            ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/80'
            : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
        }`}
        title="Notifications & Alerts"
      >
        <Bell className="w-4 h-4" />
        
        {totalCount > 0 && (
          <span
            className={`absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center text-white border ${
              unackAlertsCount > 0
                ? 'bg-rose-600 border-rose-900 animate-pulse'
                : 'bg-amber-500 border-amber-800'
            }`}
          >
            {totalCount > 99 ? '99+' : totalCount}
          </span>
        )}
      </button>

      {/* Popover Dropdown */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className={`absolute right-0 mt-2 w-96 sm:w-[420px] rounded-lg border shadow-2xl z-50 overflow-hidden flex flex-col ${
              isDark ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-white border-slate-200 text-slate-800'
            }`}
            style={{ maxHeight: 'calc(100vh - 120px)' }}
          >
            {/* Popover Header */}
            <div
              className={`p-3.5 border-b flex items-center justify-between ${
                isDark ? 'bg-slate-900/60 border-slate-800' : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-blue-500" />
                <span className="font-semibold text-xs tracking-wide uppercase">
                  Notification Center
                </span>
                {totalCount > 0 && (
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                      isDark ? 'bg-slate-800 text-slate-300' : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {totalCount} new
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1 rounded text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Category Tabs */}
            <div
              className={`flex items-center border-b px-2 pt-1 gap-1 text-xs font-medium ${
                isDark ? 'border-slate-800 bg-slate-950' : 'border-slate-200 bg-slate-50/50'
              }`}
            >
              <button
                type="button"
                onClick={() => setActiveSubTab('all')}
                className={`px-3 py-2 border-b-2 text-xs transition-colors cursor-pointer ${
                  activeSubTab === 'all'
                    ? 'border-blue-500 text-blue-500 font-semibold'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                All ({totalCount})
              </button>
              <button
                type="button"
                onClick={() => setActiveSubTab('warnings')}
                className={`px-3 py-2 border-b-2 text-xs flex items-center gap-1.5 transition-colors cursor-pointer ${
                  activeSubTab === 'warnings'
                    ? 'border-rose-500 text-rose-500 font-semibold'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>Warnings</span>
                {unackAlertsCount > 0 && (
                  <span className="px-1.5 py-0.5 bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-full text-[10px] font-bold">
                    {unackAlertsCount}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setActiveSubTab('expiring')}
                className={`px-3 py-2 border-b-2 text-xs flex items-center gap-1.5 transition-colors cursor-pointer ${
                  activeSubTab === 'expiring'
                    ? 'border-amber-500 text-amber-500 font-semibold'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>Expiring Policies</span>
                {expiringTotal > 0 && (
                  <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-full text-[10px] font-bold">
                    {expiringTotal}
                  </span>
                )}
              </button>
            </div>

            {/* Filter Pills for Expiring Policies */}
            {(activeSubTab === 'expiring' || activeSubTab === 'all') && (
              <div
                className={`px-3 py-2 border-b flex items-center justify-between text-[11px] gap-1 ${
                  isDark ? 'bg-slate-900/40 border-slate-800/80' : 'bg-slate-100/60 border-slate-200'
                }`}
              >
                <div className="flex items-center gap-1 text-slate-400 font-medium shrink-0">
                  <Filter className="w-3 h-3 text-slate-500" />
                  <span>Horizon:</span>
                </div>
                <div className="flex items-center gap-1 overflow-x-auto">
                  {DURATION_FILTERS.map((d) => (
                    <button
                      key={d.days}
                      type="button"
                      onClick={() => setSelectedDuration(d.days)}
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors cursor-pointer shrink-0 ${
                        selectedDuration === d.days
                          ? 'bg-blue-600 text-white'
                          : isDark
                          ? 'bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700'
                          : 'bg-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-300'
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Notification Items List */}
            <div className="overflow-y-auto divide-y divide-slate-800/50 flex-1 max-h-96">
              {/* Warnings Section */}
              {(activeSubTab === 'all' || activeSubTab === 'warnings') && unacknowledgedAlerts.length > 0 && (
                <div>
                  <div
                    className={`px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-wider ${
                      isDark ? 'bg-rose-950/40 text-rose-400' : 'bg-rose-50 text-rose-700'
                    }`}
                  >
                    System Warnings ({unacknowledgedAlerts.length})
                  </div>
                  {unacknowledgedAlerts.map((alert) => (
                    <div
                      key={alert.id}
                      className={`p-3.5 flex items-start gap-3 transition-colors ${
                        isDark ? 'hover:bg-slate-900/50' : 'hover:bg-slate-50'
                      }`}
                    >
                      <ShieldAlert className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-bold text-rose-400 uppercase tracking-wide truncate">
                            {alert.alert_type.replace(/_/g, ' ')}
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono shrink-0">
                            {new Date(alert.created_at).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                        <p className={`text-xs mt-0.5 line-clamp-2 ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                          {alert.message}
                        </p>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <span className="text-[9px] px-1.5 py-0.5 rounded uppercase font-bold bg-rose-900/30 text-rose-400 border border-rose-800/40">
                            {alert.severity || 'CRITICAL'}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => handleAcknowledgeAlert(alert.id, e)}
                            disabled={ackLoadingId === alert.id}
                            className="text-[11px] px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded transition-colors flex items-center gap-1 cursor-pointer"
                          >
                            {ackLoadingId === alert.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                            )}
                            Acknowledge
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Expiring Policies Section */}
              {(activeSubTab === 'all' || activeSubTab === 'expiring') && (
                <div>
                  <div
                    className={`px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-wider flex items-center justify-between ${
                      isDark ? 'bg-amber-950/30 text-amber-400' : 'bg-amber-50 text-amber-800'
                    }`}
                  >
                    <span>
                      Policies Expiring ({expiringPolicies.length} of {expiringTotal})
                    </span>
                    <span className="text-[9px] font-normal lowercase tracking-normal">
                      next {selectedDuration} days
                    </span>
                  </div>

                  {expiringLoading ? (
                    <div className="p-8 flex items-center justify-center text-slate-500">
                      <Loader2 className="w-5 h-5 animate-spin text-blue-500 mr-2" />
                      <span className="text-xs">Loading expiring policies...</span>
                    </div>
                  ) : expiringPolicies.length === 0 ? (
                    <div className="p-6 text-center text-slate-500 text-xs">
                      <CheckCircle2 className="w-6 h-6 text-slate-600 mx-auto mb-1.5" />
                      No policies expiring within {selectedDuration} days.
                    </div>
                  ) : (
                    expiringPolicies.map((pol, idx) => {
                      const daysLeft = getDaysLeft(pol.policy_end_date);
                      return (
                        <div
                          key={`${pol.vehicle_reg_no}-${pol.doc_type}-${idx}`}
                          onClick={() => handlePolicyClick(pol.vehicle_reg_no)}
                          className={`p-3.5 flex items-center justify-between gap-3 cursor-pointer transition-colors group ${
                            isDark ? 'hover:bg-slate-900/60' : 'hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-start gap-2.5 min-w-0">
                            <Clock className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-mono font-bold text-blue-400 truncate">
                                  {pol.vehicle_reg_no}
                                </span>
                                <span className="text-[10px] text-slate-400 truncate">
                                  · {pol.name || 'Unknown'}
                                </span>
                              </div>
                              <p className={`text-[11px] truncate mt-0.5 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                                {formatDocType(pol.doc_type)}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <div className="text-right">
                              <span
                                className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded border block ${
                                  daysLeft !== null && daysLeft <= 15
                                    ? 'bg-rose-950/40 text-rose-400 border-rose-900/40'
                                    : 'bg-amber-950/40 text-amber-400 border-amber-900/40'
                                }`}
                              >
                                {daysLeft !== null ? (daysLeft <= 0 ? 'Expires today' : `in ${daysLeft}d`) : 'Expiring'}
                              </span>
                              <span className="text-[9px] text-slate-500 font-mono block mt-0.5">
                                {pol.policy_end_date}
                              </span>
                            </div>
                            <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-blue-400 transition-colors" />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* Zero-state if empty in warnings view */}
              {activeSubTab === 'warnings' && unacknowledgedAlerts.length === 0 && (
                <div className="p-8 text-center text-slate-500 text-xs">
                  <CheckCircle2 className="w-7 h-7 text-emerald-500 mx-auto mb-2" />
                  <p className="font-semibold text-slate-300">No Active Warnings</p>
                  <p className="text-[11px] text-slate-500 mt-1">All system checks and backups are nominal.</p>
                </div>
              )}
            </div>

            {/* Popover Footer */}
            {onSwitchTab && (
              <div
                className={`p-2.5 border-t flex items-center justify-between text-xs ${
                  isDark ? 'bg-slate-900/70 border-slate-800' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    onSwitchTab('expiring');
                  }}
                  className="text-blue-400 hover:text-blue-300 transition-colors font-medium flex items-center gap-1 cursor-pointer"
                >
                  <span>View All Expiring</span>
                  <ExternalLink className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    onSwitchTab('settings');
                  }}
                  className="text-slate-400 hover:text-slate-200 transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <span>System Settings</span>
                  <ExternalLink className="w-3 h-3" />
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Top Bar Inline Alert Banner ─────────────────────────────────────────────
export function TopAlertBanner({ isDark = true, onSwitchTab = null }) {
  const [alerts, setAlerts] = useState([]);
  const [unackAlertsCount, setUnackAlertsCount] = useState(0);
  const [ackLoading, setAckLoading] = useState(false);

  const fetchAlerts = async () => {
    try {
      const res = await client.get('/api/admin/alerts');
      setAlerts(res.data.alerts || []);
      setUnackAlertsCount(res.data.unacknowledged_count || 0);
    } catch (err) {
      // quiet
    }
  };

  useEffect(() => {
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 25000);
    return () => clearInterval(interval);
  }, []);

  const unackList = alerts.filter((a) => !a.is_acknowledged);
  if (unackList.length === 0) return null;

  const topAlert = unackList[0];

  const handleAcknowledge = async () => {
    if (!topAlert) return;
    setAckLoading(true);
    try {
      await client.post(`/api/admin/alerts/${topAlert.id}/ack`);
      await fetchAlerts();
    } catch (err) {
      console.error('Failed to acknowledge alert:', err);
    } finally {
      setAckLoading(false);
    }
  };

  return (
    <div className="bg-red-950 border-b border-red-500/40 px-4 sm:px-6 py-2 flex items-center justify-between gap-4 text-xs z-30 sticky top-0 shadow-md">
      <div className="flex items-center gap-2.5 overflow-hidden">
        <span className="flex h-2.5 w-2.5 relative flex-shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
        </span>
        <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
        <div className="flex items-center gap-2 truncate">
          <span className="font-bold uppercase tracking-wider text-red-300">
            SYSTEM ALERT ({unackAlertsCount}):
          </span>
          <span className="text-red-100 font-medium truncate">{topAlert.message}</span>
          <span className="text-red-400/80 text-[10px] font-mono shrink-0 hidden sm:inline">
            {new Date(topAlert.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          type="button"
          onClick={handleAcknowledge}
          disabled={ackLoading}
          className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white rounded font-medium text-xs transition-colors flex items-center gap-1.5 shadow-sm cursor-pointer"
        >
          {ackLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
          <span className="hidden sm:inline">Acknowledge</span>
        </button>
        {onSwitchTab && (
          <button
            type="button"
            onClick={() => onSwitchTab('settings')}
            className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded text-xs transition-colors cursor-pointer"
          >
            View All
          </button>
        )}
      </div>
    </div>
  );
}
