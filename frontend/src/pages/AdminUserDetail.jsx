import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, User, Mail, Calendar, FileText, Eye, Loader2,
  AlertCircle, AlertTriangle,
  Trash2, Upload, CheckCircle, X, History, RefreshCw, Save, ChevronDown, ChevronUp,
  Phone, Hash, Shield, Sun, Moon
} from 'lucide-react';
import client from '../api/client';
import { parseNotes, getPolicyStatus, formatDate, formatDateTime, formatDocType } from '../utils/policyUtils';
import DocumentViewer from '../components/DocumentViewer';
import {
  validateCustomDocType,
  validateDates
} from '../utils/validators';
import NotificationCenter, { TopAlertBanner } from '../components/NotificationCenter';

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Returns Tailwind color classes for a status value: 'active' | 'expiring' | 'expired'
 */
function statusClasses(status, isDark = true) {
  switch (status) {
    case 'active':
      return {
        badge: isDark
          ? 'bg-emerald-950/30 text-emerald-400 border-emerald-900/30'
          : 'bg-emerald-50 text-emerald-700 border-emerald-200',
        dot: 'bg-emerald-400',
        label: 'Active',
      };
    case 'expiring':
      return {
        badge: isDark
          ? 'bg-amber-950/30 text-amber-400 border-amber-900/30'
          : 'bg-amber-50 text-amber-700 border-amber-200',
        dot: 'bg-amber-400',
        label: 'Expiring Soon',
      };
    default:
      return {
        badge: isDark
          ? 'bg-rose-950/30 text-rose-400 border-rose-900/30'
          : 'bg-rose-50 text-rose-750 border-rose-200',
        dot: 'bg-rose-500',
        label: 'Expired',
      };
  }
}

/** Inline status badge component */
function StatusBadge({ status, isDark = true }) {
  const cls = statusClasses(status, isDark);
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full border ${cls.badge}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${cls.dot}`} />
      {cls.label}
    </span>
  );
}

// Integrity check rendering removed.

// ─── Main Component ──────────────────────────────────────────────────────────

export default function AdminUserDetail() {
  // Extract vehicle registration number from last path segment: /admin/user/:vehicle_reg_no
  const vehicleRegNo = window.location.pathname.split('/').filter(Boolean).pop();

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

  // ── State ──────────────────────────────────────────────────────────────────
  const [userData, setUserData] = useState(null);
  const [docsByType, setDocsByType] = useState({}); // { [docType]: DocumentResponse[] }
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [selectedDoc, setSelectedDoc] = useState(null);

  const [deletingPolicyType, setDeletingPolicyType] = useState(null); // { docType, docLabel }
  const [deletePolicyReason, setDeletePolicyReason] = useState('');
  const [deletingPolicy, setDeletingPolicy] = useState(false);

  const [deletingDoc, setDeletingDoc] = useState(null); // doc object
  const [deleteDocReason, setDeleteDocReason] = useState('');
  const [isDeletingDocLoading, setIsDeletingDocLoading] = useState(false);

  const [confirmDeleteUser, setConfirmDeleteUser] = useState(false);
  const [deleteUserConfirmInput, setDeleteUserConfirmInput] = useState('');
  const [deletingUser, setDeletingUser] = useState(false);

  const [showUploadForm, setShowUploadForm] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [uploadFiles, setUploadFiles] = useState({
    file: null,
    doc_type: '',
    policy_number: '',
    policy_end_date: '',
    version_note: '',
  });
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploadSuccess, setUploadSuccess] = useState('');

  // End date is strictly required only for policy documents
  const requiresExpiry = uploadFiles.doc_type === 'policy_document';

  const [auditOpen, setAuditOpen] = useState(false);

  // ── Navigation ─────────────────────────────────────────────────────────────
  const goBack = () => {
    window.history.pushState({}, '', '/admin');
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  // ── Data fetching ──────────────────────────────────────────────────────────

  const fetchAll = useCallback(
    async (showSpinner = true) => {
      if (showSpinner) setLoading(true);
      setError('');

      try {
        const res = await client.get(`/api/admin/user/${vehicleRegNo}`);
        setUserData(res.data.user);
        setDocsByType(res.data.docs_by_type ?? {});
        setAuditLogs(res.data.audit_logs ?? []);
      } catch (err) {
        setError(err.response?.data?.detail || 'Failed to load user details.');
      } finally {
        setLoading(false);
      }
    },
    [vehicleRegNo]
  );

  // Initial fetch on mount
  useEffect(() => {
    fetchAll(true);
  }, [fetchAll]);

  // ── Delete policy category ──────────────────────────────────────────────────
  const handleDeletePolicy = async () => {
    if (!deletingPolicyType) return;
    const reason = deletePolicyReason.trim();
    if (!reason) return;

    setDeletingPolicy(true);
    try {
      await client.delete(`/api/admin/user/${vehicleRegNo}/policy/${deletingPolicyType.docType}`, {
        data: { reason },
      });
      // Refresh all user details
      await fetchAll(true);

      setDeletingPolicyType(null);
      setDeletePolicyReason('');

      // Close preview if it was a document under the deleted category
      setSelectedDoc((prev) => (prev?.doc_type === deletingPolicyType.docType ? null : prev));
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to delete policy category.');
    } finally {
      setDeletingPolicy(false);
    }
  };

  // ── Delete single document version ─────────────────────────────────────────
  const handleDeleteDoc = async () => {
    if (!deletingDoc) return;
    const reason = deleteDocReason.trim();
    if (!reason) {
      setError('A compliance justification reason is required.');
      return;
    }
    setIsDeletingDocLoading(true);
    try {
      await client.delete(`/api/admin/user/${vehicleRegNo}/documents/${deletingDoc.id}`, {
        data: { reason },
      });
      setDeletingDoc(null);
      setDeleteDocReason('');
      setSelectedDoc((prev) => (prev?.id === deletingDoc.id ? null : prev));
      await fetchAll(false);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to delete document version.');
    } finally {
      setIsDeletingDocLoading(false);
    }
  };

  // ── Delete User ────────────────────────────────────────────────────────────
  const handleDeleteUser = async () => {
    if (deleteUserConfirmInput !== 'DELETE USER') return;
    setDeletingUser(true);
    try {
      await client.delete(`/api/admin/user/${vehicleRegNo}`);
      goBack();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to delete user profile.');
      setConfirmDeleteUser(false);
      setDeleteUserConfirmInput('');
    } finally {
      setDeletingUser(false);
    }
  };

  // ── Admin upload ───────────────────────────────────────────────────────────
  const handleUploadSubmit = async (e) => {
    e.preventDefault();
    setUploadError('');
    setUploadSuccess('');

    if (!uploadFiles.file) {
      setUploadError('Please select a file to upload.');
      return;
    }
    if (!uploadFiles.doc_type.trim()) {
      setUploadError('Document type is required.');
      return;
    }

    const cleanDocType = uploadFiles.doc_type.trim().replace(/\s+/g, '_').toLowerCase();

    if (selectedCategory === 'other') {
      const typeError = validateCustomDocType(cleanDocType);
      if (typeError) {
        setUploadError(typeError);
        return;
      }
    }

    if (requiresExpiry) {
      const dateError = validateDates(null, uploadFiles.policy_end_date);
      if (dateError) {
        setUploadError(dateError);
        return;
      }
    }

    setUploading(true);
    const formData = new FormData();
    formData.append('files', uploadFiles.file);
    formData.append('doc_types', cleanDocType);
    formData.append('policy_start_dates', '');
    formData.append('policy_end_dates', requiresExpiry ? uploadFiles.policy_end_date : '2099-12-31');
    formData.append('policy_numbers', ''); // omitted
    formData.append('version_notes', uploadFiles.version_note || '');

    try {
      await client.post(`/api/admin/user/${vehicleRegNo}/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setUploadSuccess('Document uploaded and versioned successfully.');
      setShowUploadForm(false);
      setSelectedCategory('');
      setUploadFiles({
        file: null,
        doc_type: '',
        policy_number: '',
        policy_end_date: '',
        version_note: '',
      });
      // Re-fetch all
      await fetchAll(false);
    } catch (err) {
      setUploadError(err.response?.data?.detail || 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  // ── Derived: sorted list of docTypes ──────────────────────────────────────
  const sortedDocTypes = Object.keys(docsByType).sort();

  // ── Render helpers ─────────────────────────────────────────────────────────

  const renderVersionTree = (docType, versions) => {
    // Sort: latest first, then by version number descending
    const sorted = [...versions].sort((a, b) => {
      if (a.is_latest && !b.is_latest) return -1;
      if (!a.is_latest && b.is_latest) return 1;
      return b.version_number - a.version_number;
    });

    return (
      <div className={`relative pl-5 mt-2 space-y-1.5 border-l-2 ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
        {sorted.map((doc) => {
          const { policyNumber } = parseNotes(doc.notes);
          return (
            <motion.div
              key={doc.id}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              className={`relative group flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 p-2.5 rounded border transition-all ${
                doc.is_latest
                  ? isDark
                    ? 'bg-emerald-950/10 border-emerald-900/20 hover:border-emerald-800/40 text-emerald-400'
                    : 'bg-emerald-50 border-emerald-200 hover:border-emerald-300 text-emerald-700'
                  : isDark
                  ? 'bg-slate-900/40 border-slate-800/50 hover:border-slate-700 text-slate-300'
                  : 'bg-slate-50 border-slate-200 hover:border-slate-300 text-slate-700'
              }`}
            >
              {/* Tree dot */}
              <span
                className={`absolute -left-[22px] top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full border-2 ${
                  doc.is_latest
                    ? 'bg-emerald-400 border-emerald-600'
                    : isDark
                    ? 'bg-slate-600 border-slate-800'
                    : 'bg-slate-300 border-slate-400'
                }`}
              />

              {/* Version + badges */}
              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                <span
                  className={`text-xs font-extrabold ${
                    doc.is_latest
                      ? isDark ? 'text-emerald-400' : 'text-emerald-600'
                      : isDark ? 'text-slate-400' : 'text-slate-500'
                  }`}
                >
                  v{doc.version_number}
                </span>
                {doc.is_latest && (
                  <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded border tracking-wider uppercase ${isDark ? 'text-emerald-400 bg-emerald-950/30 border-emerald-900/20' : 'text-emerald-600 bg-emerald-50 border-emerald-200'}`}>
                    ★ Latest
                  </span>
                )}
                {doc.is_deleted && (
                  <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded border uppercase tracking-wider ${isDark ? 'text-rose-400 bg-rose-950/20 border-rose-900/20' : 'text-rose-600 bg-rose-50 border-rose-200'}`}>
                    Deleted
                  </span>
                )}
              </div>

              {/* Period + policy number */}
              <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                <span className={`text-[10px] font-mono ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  {formatDate(doc.policy_start_date)} – {formatDate(doc.policy_end_date)}
                </span>
                {policyNumber && (
                  <span className="text-[10px] text-blue-400 font-semibold truncate">
                    # {policyNumber}
                  </span>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                {/* View */}
                <button
                  type="button"
                  onClick={() => setSelectedDoc(doc)}
                  className={`flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded border transition-all cursor-pointer ${
                    selectedDoc?.id === doc.id
                      ? 'bg-blue-600 border-blue-500 text-white'
                      : isDark
                      ? 'bg-slate-900 border-slate-800 text-blue-400 hover:bg-slate-800 hover:text-blue-300'
                      : 'bg-white border-slate-300 text-blue-500 hover:bg-slate-50 hover:text-blue-600'
                  }`}
                  title="Preview document"
                >
                  <Eye className="w-3 h-3" />
                  View
                </button>

                {/* Delete version (only if not already soft-deleted) */}
                {!doc.is_deleted && (
                  <button
                    type="button"
                    onClick={() => {
                      setDeletingDoc(doc);
                      setDeleteDocReason('');
                    }}
                    className={`flex items-center gap-1 text-[10px] font-bold px-2 py-1 border rounded transition-all cursor-pointer ${isDark ? 'bg-slate-900 border-slate-800 text-rose-500 hover:bg-rose-950/25 hover:border-rose-900/30' : 'bg-white border-slate-300 text-rose-500 hover:bg-rose-50 hover:text-rose-600'}`}
                    title="Delete this version"
                  >
                    <Trash2 className="w-3 h-3" />
                    Delete
                  </button>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    );
  };

  // ── Loading state ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className={`min-h-screen flex flex-col items-center justify-center gap-4 transition-colors duration-200 ${isDark ? 'bg-slate-950 text-slate-400' : 'bg-slate-50 text-slate-600'}`}>
        <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
        <p className="text-sm font-medium">Loading policy record…</p>
      </div>
    );
  }

  // ── Hard error state (no user data) ───────────────────────────────────────
  if (error && !userData) {
    return (
      <div className={`min-h-screen flex flex-col items-center justify-center gap-5 px-6 transition-colors duration-200 ${isDark ? 'bg-slate-950 text-slate-400' : 'bg-slate-50 text-slate-600'}`}>
        <AlertTriangle className="w-14 h-14 text-rose-500" />
        <p className={`font-bold text-center max-w-sm ${isDark ? 'text-white' : 'text-slate-900'}`}>{error}</p>
        <div className="flex gap-3">
          <button
            onClick={goBack}
            className={`flex items-center gap-2 px-4 py-2 border text-sm font-semibold rounded transition-all ${isDark ? 'bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-300 hover:text-white' : 'bg-white hover:bg-slate-100 border-slate-300 text-slate-700 hover:text-slate-900'}`}
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          <button
            onClick={() => fetchAll(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded transition-all"
          >
            <RefreshCw className="w-4 h-4" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  // ── Main render ────────────────────────────────────────────────────────────
  return (
    <div className={`min-h-screen flex flex-col transition-colors duration-200 ${isDark ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>

      {/* ── Persistent System Failure / Warning Banner ── */}
      <TopAlertBanner isDark={isDark} />

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className={`sticky top-0 z-20 border-b transition-colors duration-200 ${isDark ? 'bg-slate-950 border-slate-800' : 'bg-white border-slate-200'} px-4 sm:px-6 py-3.5 flex items-center justify-between gap-4`}>
        {/* Left: back + brand + user info */}
        <div className="flex items-center gap-4 min-w-0">
          <div className="flex items-center gap-2 shrink-0">
            <Shield className="w-4 h-4 text-blue-500" />
            <div className="hidden sm:flex flex-col leading-tight">
              <span className={`font-bold text-xs uppercase tracking-wider ${isDark ? 'text-white' : 'text-slate-800'}`}>Policy Manager</span>
              <span className="text-[9px] text-slate-400 font-medium tracking-normal">Document Vault</span>
            </div>
          </div>
          <div className={`h-4 w-px hidden sm:block ${isDark ? 'bg-slate-700' : 'bg-slate-300'}`} />
          <button
            onClick={goBack}
            className={`flex items-center gap-2 text-xs font-medium border px-3 py-1.5 rounded transition-all shrink-0 cursor-pointer ${isDark ? 'text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 border-slate-800' : 'text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-100 border-slate-300'}`}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Back to Dashboard</span>
            <span className="sm:hidden">Back</span>
          </button>

          <div className="min-w-0 hidden md:block">
            <h1 className={`text-sm font-semibold truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>
              {userData?.name || 'Unknown User'}
              <span className={`font-mono font-normal text-xs ml-2 px-1.5 py-0.5 rounded border ${isDark ? 'text-slate-500 bg-slate-800 border-slate-700' : 'text-slate-600 bg-slate-100 border-slate-200'}`}>{vehicleRegNo}</span>
            </h1>
            <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider mt-0.5">
              Policy Detail View
            </p>
          </div>
        </div>

        {/* Right: notifications + theme toggle + delete button */}
        <div className="flex items-center gap-2.5">
          <NotificationCenter
            isDark={isDark}
            onNavigateToUser={(reg) => {
              window.history.pushState({}, '', `/admin/user/${reg}`);
              window.dispatchEvent(new PopStateEvent('popstate'));
            }}
          />

          <button
            onClick={() => setIsDark(!isDark)}
            className={`p-1.5 rounded transition-colors cursor-pointer ${isDark ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'}`}
            title="Toggle theme"
          >
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          
          <div className={`h-4 w-px ${isDark ? 'bg-slate-700' : 'bg-slate-300'}`} />

          {userData && (
            <button
              type="button"
              onClick={() => setConfirmDeleteUser(true)}
              className={`flex items-center gap-1.5 px-3 py-1.5 border rounded text-xs font-medium transition-all cursor-pointer ${
                isDark
                  ? 'bg-rose-950/35 border-rose-900/40 text-rose-400 hover:bg-rose-600 hover:text-white hover:border-rose-500'
                  : 'bg-rose-50 border-rose-200 text-rose-600 hover:bg-rose-600 hover:text-white hover:border-rose-600'
              }`}
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete User</span>
            </button>
          )}
        </div>
      </header>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col lg:flex-row gap-0 relative">

        {/* ── Left / main column ───────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 overflow-y-auto px-4 sm:px-6 py-6 space-y-6">

          {/* ── User info strip ──────────────────────────────────────────────── */}
          {userData && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`p-4 border rounded-md flex flex-wrap gap-4 items-start transition-colors duration-200 ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`}
            >
              <div className="w-10 h-10 rounded bg-blue-600/15 border border-blue-900/30 flex items-center justify-center text-blue-400 shrink-0">
                <User className="w-5 h-5" />
              </div>

              <div className="flex-1 min-w-0 grid grid-cols-2 md:grid-cols-5 gap-3">
                <div className="space-y-0.5">
                  <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Name</p>
                  <p className={`text-xs font-bold truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>{userData.name}</p>
                </div>
                <div className="space-y-0.5">
                  <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                    <Hash className="w-2.5 h-2.5" /> Vehicle Reg
                  </p>
                  <p className="text-xs font-bold text-blue-400 truncate font-mono">{userData.vehicle_reg_no}</p>
                </div>
                <div className="space-y-0.5">
                  <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                    <Phone className="w-2.5 h-2.5" /> Phone
                  </p>
                  <p className={`text-xs font-medium truncate ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                    {userData.phone_number || '—'}
                  </p>
                </div>
                <div className="space-y-0.5">
                  <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                    <Mail className="w-2.5 h-2.5" /> Email
                  </p>
                  <p className={`text-xs font-medium truncate ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                    {userData.email || '—'}
                  </p>
                </div>
                <div className="space-y-0.5">
                  <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                    <Calendar className="w-2.5 h-2.5" /> Joined
                  </p>
                  <p className={`text-xs font-medium ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                    {formatDate(userData.created_at)}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setConfirmDeleteUser(true)}
                className={`self-center flex items-center gap-1.5 px-3 py-1.5 border rounded text-xs font-medium transition-all cursor-pointer shrink-0 ${
                  isDark
                    ? 'bg-rose-950/35 border-rose-900/40 text-rose-400 hover:bg-rose-600 hover:text-white hover:border-rose-500'
                    : 'bg-rose-50 border-rose-200 text-rose-600 hover:bg-rose-600 hover:text-white hover:border-rose-600'
                }`}
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete User</span>
              </button>
            </motion.div>
          )}

          {/* ── Soft-error banner (non-fatal) ─────────────────────────────── */}
          <AnimatePresence>
            {error && userData && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className={`flex items-center gap-3 p-3.5 rounded text-xs font-semibold border ${
                  isDark
                    ? 'bg-rose-950/15 border-rose-900/25 text-rose-400'
                    : 'bg-rose-50 border-rose-200 text-rose-700'
                }`}
              >
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
                <button
                  onClick={() => setError('')}
                  className={`ml-auto transition-colors ${
                    isDark ? 'text-rose-500 hover:text-rose-300' : 'text-rose-500 hover:text-rose-800'
                  }`}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Upload success banner ──────────────────────────────────────── */}
          <AnimatePresence>
            {uploadSuccess && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className={`flex items-center gap-3 p-3.5 rounded text-xs font-semibold border ${
                  isDark
                    ? 'bg-emerald-950/15 border-emerald-900/25 text-emerald-400'
                    : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                }`}
              >
                <CheckCircle className="w-4 h-4 shrink-0" />
                <span>{uploadSuccess}</span>
                <button
                  onClick={() => setUploadSuccess('')}
                  className={`ml-auto transition-colors ${
                    isDark ? 'text-emerald-500 hover:text-emerald-300' : 'text-emerald-500 hover:text-emerald-800'
                  }`}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Policies section ─────────────────────────────────────────────── */}
          <section className="space-y-4">
            {/* Section header */}
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xs font-extrabold uppercase tracking-widest text-slate-400 flex items-center gap-2">
                <FileText className="w-3.5 h-3.5 text-blue-400" />
                Policy Documents
              </h2>
              <button
                type="button"
                onClick={() => {
                  setShowUploadForm((v) => !v);
                  setUploadError('');
                }}
                className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded transition-all border border-blue-700 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                + Upload for User
              </button>
            </div>

            {/* Inline upload form */}
            <AnimatePresence>
              {showUploadForm && (
                <motion.div
                  key="upload-form"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <form
                    onSubmit={handleUploadSubmit}
                    className={`p-5 border rounded-md space-y-4 transition-colors duration-200 ${isDark ? 'bg-slate-900 border-blue-900/30' : 'bg-white border-slate-200 shadow-sm'}`}
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-blue-400 flex items-center gap-2">
                        <Upload className="w-3.5 h-3.5" />
                        Admin Upload
                      </h3>
                      <button
                        type="button"
                        onClick={() => {
                          setShowUploadForm(false);
                          setUploadError('');
                        }}
                        className={`p-1 transition-colors cursor-pointer ${isDark ? 'text-slate-500 hover:text-white' : 'text-slate-400 hover:text-slate-900'}`}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-bold uppercase tracking-wider text-slate-400">
                      {/* Doc type */}
                      <div className="flex flex-col gap-1">
                        <label className="block mb-0.5">
                          Document Type <span className="text-rose-400">*</span>
                        </label>
                        <select
                          required
                          value={selectedCategory}
                          onChange={(e) => {
                            const val = e.target.value;
                            setSelectedCategory(val);
                            if (val !== 'other') {
                               setUploadFiles((p) => ({ ...p, doc_type: val }));
                            } else {
                               setUploadFiles((p) => ({ ...p, doc_type: '' }));
                            }
                          }}
                          className={`w-full border rounded px-3 py-2 text-xs focus:outline-none focus:border-blue-500 font-semibold cursor-pointer ${isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-white border-slate-300 text-slate-800'}`}
                        >
                          <option value="">-- Select Category --</option>
                          <option value="aadhar_card">Aadhar Card</option>
                          <option value="pan_card">PAN Card</option>
                          <option value="driving_license">Driving License</option>
                          <option value="policy_document">Policy Document</option>
                          <option value="other">Other (Custom Type...)</option>
                        </select>
                      </div>

                      {/* Custom Doc Type - only show if "other" is selected */}
                      {selectedCategory === 'other' && (
                        <div className="flex flex-col gap-1">
                          <label className="block mb-0.5">
                            Custom Type Name <span className="text-rose-400">*</span>
                          </label>
                          <input
                            type="text"
                            required
                            placeholder="e.g. fitness_certificate"
                            value={uploadFiles.doc_type}
                            onChange={(e) =>
                              setUploadFiles((p) => ({ ...p, doc_type: e.target.value.toLowerCase().replace(/\s+/g, '_') }))
                            }
                            className={`w-full border rounded px-3 py-2 text-xs focus:outline-none focus:border-blue-500 font-medium normal-case tracking-normal ${isDark ? 'bg-slate-950 border-slate-800 text-white placeholder-slate-600' : 'bg-white border-slate-300 text-slate-800 placeholder-slate-400'}`}
                          />
                        </div>
                      )}

                      {/* Policy End Date - strictly required only for Policy Document */}
                      {requiresExpiry && (
                        <div>
                          <label className={`block mb-1.5 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                            Policy End Date <span className="text-rose-400">*</span>
                          </label>
                          <input
                            type="date"
                            required
                            value={uploadFiles.policy_end_date}
                            onChange={(e) =>
                              setUploadFiles((p) => ({ ...p, policy_end_date: e.target.value }))
                            }
                            className={`w-full border rounded px-3 py-2 text-xs focus:outline-none focus:border-blue-500 font-medium cursor-pointer ${isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-white border-slate-300 text-slate-800'}`}
                          />
                        </div>
                      )}

                      {/* Info notice for non-policy documents */}
                      {!requiresExpiry && selectedCategory && (
                        <div className="flex items-center gap-2 text-[11px] font-normal text-slate-500 normal-case tracking-normal mt-1 sm:col-span-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                          <span>Standard Document · Automatically marked as perpetual with no expiration required.</span>
                        </div>
                      )}

                      {/* Version note */}
                      <div className="sm:col-span-2">
                        <label className="block mb-1.5 flex flex-col">
                          <span>Version Note</span>
                          <span className="text-[10px] text-slate-500 font-normal mt-0.5 normal-case tracking-normal">
                            A version note helps track history (e.g. "Initial upload", "Annual renewal").
                          </span>
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Annual renewal 2025"
                          value={uploadFiles.version_note}
                          onChange={(e) =>
                            setUploadFiles((p) => ({ ...p, version_note: e.target.value }))
                          }
                          className={`w-full border rounded px-3 py-2 text-xs focus:outline-none focus:border-blue-500 font-medium normal-case tracking-normal ${isDark ? 'bg-slate-950 border-slate-800 text-white placeholder-slate-600' : 'bg-white border-slate-300 text-slate-800 placeholder-slate-400'}`}
                        />
                      </div>

                      {/* File input */}
                      <div className="sm:col-span-2">
                        <label className={`block mb-1.5 normal-case tracking-normal font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                          File <span className="text-rose-400">*</span>{' '}
                          <span className="text-slate-500 font-normal text-[10px]">
                            (PDF / JPEG / PNG, max 50 MB)
                          </span>
                        </label>
                        <input
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png"
                          required
                          onChange={(e) =>
                            setUploadFiles((p) => ({ ...p, file: e.target.files?.[0] || null }))
                          }
                          className={`w-full text-xs file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-bold file:bg-blue-600 file:text-white file:cursor-pointer hover:file:bg-blue-700 transition-all cursor-pointer ${isDark ? 'text-slate-300' : 'text-slate-600'}`}
                        />
                        {uploadFiles.file && (
                          <p className="mt-1 text-[10px] text-blue-400 font-semibold truncate">
                            Selected: {uploadFiles.file.name}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Upload error */}
                    {uploadError && (
                      <div className={`flex items-center gap-2 p-3 rounded text-xs font-semibold border ${
                        isDark
                          ? 'bg-rose-950/15 border-rose-900/25 text-rose-400'
                          : 'bg-rose-50 border-rose-200 text-rose-700'
                      }`}>
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        {uploadError}
                      </div>
                    )}

                    {/* Submit */}
                    <div className="flex justify-end">
                      <button
                        type="submit"
                        disabled={uploading}
                        className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium transition-all disabled:opacity-50 border border-blue-700 cursor-pointer"
                      >
                        {uploading ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Save className="w-3.5 h-3.5" />
                        )}
                        {uploading ? 'Uploading…' : 'Upload Document'}
                      </button>
                    </div>
                  </form>
                </motion.div>
              )}
            </AnimatePresence>

            {/* No policies yet */}
            {sortedDocTypes.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-slate-600 gap-3">
                <FileText className="w-12 h-12 text-slate-700" />
                <p className="text-sm font-semibold text-slate-500">No policy documents found.</p>
                <p className="text-xs text-slate-600">Use the upload button above to add one.</p>
              </div>
            )}

            {/* Per-docType groups */}
            {sortedDocTypes.map((docType) => {
              const versions = docsByType[docType] ?? [];
              const latest = versions.find((v) => v.is_latest);
              const status = latest ? getPolicyStatus(latest.policy_end_date) : 'expired';

              return (
                <motion.div
                  key={docType}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`p-4 border rounded-md space-y-1 transition-colors duration-200 ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`}
                >
                  {/* Type header row */}
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-8 h-8 rounded flex items-center justify-center border ${
                          status === 'active'
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-900/20'
                            : status === 'expiring'
                            ? 'bg-amber-500/10 text-amber-400 border-amber-900/20'
                            : isDark
                            ? 'bg-slate-800 text-slate-500 border-slate-700'
                            : 'bg-slate-100 text-slate-400 border-slate-200'
                        }`}
                      >
                        <FileText className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className={`text-sm font-extrabold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                          {formatDocType(docType)}
                        </h3>
                        <p className={`text-[9px] font-mono mt-0.5 ${isDark ? 'text-slate-650' : 'text-slate-450'}`}>{docType}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={status} isDark={isDark} />
                      {versions.some((v) => !v.is_deleted) && (
                        <button
                          type="button"
                          onClick={() =>
                            setDeletingPolicyType({
                              docType,
                              docLabel: formatDocType(docType),
                            })
                          }
                          className={`p-1.5 border rounded transition-all cursor-pointer ${isDark ? 'bg-slate-900 border-slate-800 hover:bg-rose-950/25 hover:border-rose-900/30 text-slate-500 hover:text-rose-400' : 'bg-white border-slate-300 hover:bg-rose-50 text-slate-500 hover:text-rose-600'}`}
                          title={`Delete all documents under ${formatDocType(docType)}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Version tree */}
                  {versions.length > 0 ? (
                    renderVersionTree(docType, versions)
                  ) : (
                    <p className={`text-xs italic pl-5 mt-2 ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>
                      No versions available.
                    </p>
                  )}
                </motion.div>
              );
            })}
          </section>

          {/* ── Audit Log section ─────────────────────────────────────────────── */}
          <section className="pb-8">
            <button
              type="button"
              onClick={() => setAuditOpen((v) => !v)}
              className="w-full flex items-center justify-between gap-3 mb-3 group"
            >
              <h2 className="text-xs font-extrabold uppercase tracking-widest text-slate-400 flex items-center gap-2 group-hover:text-slate-300 transition-colors">
                <History className="w-3.5 h-3.5 text-blue-400" />
                Audit Log
                <span className="text-[9px] font-semibold text-slate-600 normal-case tracking-normal">
                  ({auditLogs.length} entries)
                </span>
              </h2>
              {auditOpen ? (
                <ChevronUp className="w-4 h-4 text-slate-500 group-hover:text-slate-300 transition-colors" />
              ) : (
                <ChevronDown className="w-4 h-4 text-slate-500 group-hover:text-slate-300 transition-colors" />
              )}
            </button>

            <AnimatePresence initial={false}>
              {auditOpen && (
                <motion.div
                  key="audit-body"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  {auditLogs.length === 0 ? (
                    <div className="py-10 text-center text-slate-600 text-xs flex flex-col items-center gap-2">
                      <History className="w-8 h-8 text-slate-700" />
                      No audit entries yet.
                    </div>
                  ) : (
                    <div className={`relative pl-5 space-y-2 border-l-2 ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                      {auditLogs.map((log, idx) => (
                        <div key={log.id ?? idx} className="relative group">
                          {/* Timeline dot */}
                          <span className={`absolute -left-[22px] top-2.5 w-2.5 h-2.5 rounded-full bg-blue-500/40 border-2 group-hover:bg-blue-500 transition-colors ${isDark ? 'border-blue-800' : 'border-blue-300'}`} />

                          <div className={`p-3 border rounded transition-all ${isDark ? 'bg-slate-900/60 hover:bg-slate-900 border-slate-800/60 hover:border-slate-700' : 'bg-white hover:bg-slate-50 border-slate-200 hover:border-slate-300 shadow-sm'}`}>
                            <div className="flex items-start justify-between gap-2 flex-wrap">
                              <p className={`text-xs font-semibold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                                <span className="text-blue-400 font-bold">{log.action}</span>
                                <span className={isDark ? 'text-slate-500' : 'text-slate-400'}> by </span>
                                <span className={isDark ? 'text-white' : 'text-slate-900'}>{log.performed_by}</span>
                              </p>
                              <span className={`text-[9px] font-mono shrink-0 ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>
                                {formatDateTime(log.timestamp)}
                              </span>
                            </div>
                            {log.notes && (
                              <p className="mt-1 text-[10px] text-slate-500 italic leading-relaxed">
                                {log.notes}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </section>
        </div>

        {/* ── Right pane: Desktop document preview ─────────────────────────── */}
        <div className={`hidden lg:flex lg:w-[42%] xl:w-[45%] shrink-0 flex-col border-l overflow-hidden sticky top-[57px] h-[calc(100vh-57px)] transition-colors duration-200 ${isDark ? 'bg-slate-950 border-slate-800' : 'bg-white border-slate-200'}`}>
          {selectedDoc ? (
            <div className="flex-1 flex flex-col p-4 gap-3 overflow-hidden">
              {/* Doc meta strip */}
              <div className="flex items-center justify-between gap-2 shrink-0">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">
                    {formatDocType(selectedDoc.doc_type)}
                  </p>
                  <p className={`text-xs font-bold truncate mt-0.5 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                    {selectedDoc.original_filename}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedDoc(null)}
                  className={`p-1 transition-colors shrink-0 cursor-pointer ${isDark ? 'text-slate-500 hover:text-white' : 'text-slate-400 hover:text-slate-900'}`}
                  title="Close preview"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="px-3 py-1.5 bg-blue-950/20 border border-blue-900/30 rounded text-[10px] text-blue-400 flex items-center gap-2 shrink-0 font-medium">
                <Calendar className="w-3.5 h-3.5 shrink-0" />
                <span>
                  Validity:{' '}
                  <span className={`font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                    {selectedDoc.policy_start_date
                      ? formatDate(selectedDoc.policy_start_date)
                      : 'N/A'}{' '}
                    – {formatDate(selectedDoc.policy_end_date)}
                  </span>
                </span>
              </div>

              {selectedDoc.notes && (() => {
                const { policyNumber, versionNote } = parseNotes(selectedDoc.notes);
                return (policyNumber || versionNote) ? (
                  <div className={`px-3 py-1.5 border rounded text-[10px] shrink-0 space-y-0.5 ${isDark ? 'bg-slate-900 border-slate-800 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-600 shadow-sm'}`}>
                    {policyNumber && <p>Policy #: <span className="text-blue-400 font-bold">{policyNumber}</span></p>}
                    {versionNote && <p className="italic">{versionNote}</p>}
                  </div>
                ) : null;
              })()}

              <div className="flex-1 overflow-hidden">
                <DocumentViewer
                  url={selectedDoc.s3_url}
                  mimeType={selectedDoc.mime_type}
                  filename={selectedDoc.original_filename}
                />
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-650 p-8 text-center gap-4">
              <Eye className="w-12 h-12 text-slate-700" />
              <div>
                <p className="text-sm font-semibold text-slate-500">Preview Panel</p>
                <p className="text-xs text-slate-600 mt-1 max-w-xs">
                  Select any version from the policy tree and click{' '}
                  <span className="text-blue-400 font-semibold">View</span> to render it here.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Delete User confirmation dialog ─────────────────────────────────── */}
      <AnimatePresence>
        {confirmDeleteUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, y: 15, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 15, scale: 0.97 }}
              className={`w-full max-w-md p-6 border rounded-md shadow-2xl flex flex-col gap-4 relative transition-colors duration-200 ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}
            >
              <button
                type="button"
                onClick={() => { setConfirmDeleteUser(false); setDeleteUserConfirmInput(''); }}
                className={`absolute top-4 right-4 p-1.5 rounded border transition-colors cursor-pointer ${isDark ? 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white' : 'bg-white border-slate-350 text-slate-500 hover:text-slate-950'}`}
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex items-start gap-3">
                <div className={`p-2.5 rounded shrink-0 border ${
                  isDark
                    ? 'bg-rose-500/10 border-rose-900/30 text-rose-400'
                    : 'bg-rose-50 border-rose-200 text-rose-600'
                }`}>
                  <AlertTriangle className="w-5 h-5 animate-bounce" />
                </div>
                <div>
                  <h3 className={`text-sm font-extrabold ${isDark ? 'text-white' : 'text-slate-900'}`}>Delete User Profile</h3>
                  <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">
                    This will permanently delete the user profile for{' '}
                    <span className={`font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{userData?.name}</span> ({vehicleRegNo}).
                    All document database records, audit logs, and S3 files will be permanently purged.
                  </p>
                </div>
              </div>

              <div className={`p-3.5 border rounded text-xs font-semibold flex flex-col gap-1 ${isDark ? 'bg-rose-950/15 border-rose-900/30 text-rose-400' : 'bg-rose-50 border-rose-200 text-rose-600'}`}>
                <p className="uppercase tracking-wider text-[10px] font-extrabold">Warning</p>
                <p className={`text-[10px] font-normal leading-relaxed ${isDark ? 'text-rose-300' : 'text-rose-700'}`}>
                  This action is completely irreversible. Files will be permanently deleted from S3 and the database immediately.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className={`block text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-655'}`}>
                  Type <span className={`font-mono font-bold ${isDark ? 'text-white' : 'text-slate-800'}`}>DELETE USER</span> to confirm:
                </label>
                <input
                  type="text"
                  value={deleteUserConfirmInput}
                  onChange={(e) => setDeleteUserConfirmInput(e.target.value)}
                  placeholder="DELETE USER"
                  className={`w-full border rounded px-3 py-2 text-xs font-mono tracking-wider focus:outline-none focus:border-rose-500 ${isDark ? 'bg-slate-955 border-slate-800 text-white placeholder-slate-600' : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'}`}
                />
              </div>

              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => { setConfirmDeleteUser(false); setDeleteUserConfirmInput(''); }}
                  className={`px-4 py-2 rounded border text-xs font-bold transition-all cursor-pointer ${isDark ? 'bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-white border-slate-800' : 'bg-white hover:bg-slate-100 text-slate-600 hover:text-slate-800 border-slate-300 shadow-sm'}`}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={deletingUser || deleteUserConfirmInput !== 'DELETE USER'}
                  onClick={handleDeleteUser}
                  className="flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed border border-rose-700 cursor-pointer"
                >
                  {deletingUser ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete Permanently</span>
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Soft-delete category confirmation dialog ─────────────────────────── */}
      <AnimatePresence>
        {deletingPolicyType && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-955/85 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, y: 15, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 15, scale: 0.97 }}
              className={`w-full max-w-md p-6 border rounded-md shadow-2xl flex flex-col gap-4 relative transition-colors duration-200 ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}
            >
              <button
                type="button"
                onClick={() => { setDeletingPolicyType(null); setDeletePolicyReason(''); }}
                className={`absolute top-4 right-4 p-1.5 rounded border transition-colors cursor-pointer ${isDark ? 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white' : 'bg-white border-slate-350 text-slate-500 hover:text-slate-950'}`}
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex items-start gap-3">
                <div className={`p-2.5 rounded shrink-0 border ${
                  isDark
                    ? 'bg-rose-500/10 border-rose-900/30 text-rose-400'
                    : 'bg-rose-50 border-rose-200 text-rose-600'
                }`}>
                  <AlertTriangle className="w-5 h-5 animate-bounce" />
                </div>
                <div>
                  <h3 className={`text-sm font-extrabold ${isDark ? 'text-white' : 'text-slate-900'}`}>Delete Policy Category</h3>
                  <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">
                    This will soft-delete ALL versions of the policy category{' '}
                    <span className={`font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{deletingPolicyType.docLabel}</span> for
                    this user. All linked files will be removed from S3.
                  </p>
                </div>
              </div>

              <div className={`p-3 border rounded space-y-1 text-[10px] font-semibold ${isDark ? 'bg-slate-955 border-slate-800 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-600 shadow-sm'}`}>
                <p>Category: <span className={`font-bold uppercase ${isDark ? 'text-white' : 'text-slate-900'}`}>{deletingPolicyType.docLabel}</span></p>
                <p>Technical Identifier: <span className="text-blue-400 font-mono">{deletingPolicyType.docType}</span></p>
              </div>

              <div className="space-y-1.5">
                <label className={`block text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-655'}`}>
                  Reason for Deletion <span className="text-rose-400">* (Required)</span>
                </label>
                <textarea
                  required
                  rows={3}
                  value={deletePolicyReason}
                  onChange={(e) => setDeletePolicyReason(e.target.value)}
                  placeholder="Provide compliance justification for deleting this entire category…"
                  className={`w-full border rounded px-3 py-2 text-xs resize-none font-medium focus:outline-none focus:border-blue-500 ${isDark ? 'bg-slate-950 border-slate-800 text-white placeholder-slate-600' : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'}`}
                />
              </div>

              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => { setDeletingPolicyType(null); setDeletePolicyReason(''); }}
                  className={`px-4 py-2 rounded border text-xs font-bold transition-all cursor-pointer ${isDark ? 'bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-white border-slate-800' : 'bg-white hover:bg-slate-100 text-slate-600 hover:text-slate-805 border-slate-300 shadow-sm'}`}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={deletingPolicy || !deletePolicyReason.trim()}
                  onClick={handleDeletePolicy}
                  className="flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed border border-rose-700 cursor-pointer"
                >
                  {deletingPolicy ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete Entire Category</span>
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Soft-delete document version confirmation dialog ────────── */}
      <AnimatePresence>
        {deletingDoc && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-955/85 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, y: 15, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 15, scale: 0.97 }}
              className={`w-full max-w-md p-6 border rounded-md shadow-2xl flex flex-col gap-4 relative transition-colors duration-200 ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}
            >
              <button
                type="button"
                onClick={() => { setDeletingDoc(null); setDeleteDocReason(''); }}
                className={`absolute top-4 right-4 p-1.5 rounded border transition-colors cursor-pointer ${isDark ? 'bg-slate-955 border-slate-800 text-slate-400 hover:text-white' : 'bg-white border-slate-300 text-slate-500 hover:text-slate-905'}`}
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex items-start gap-3">
                <div className={`p-2.5 rounded shrink-0 border ${
                  isDark
                    ? 'bg-rose-500/10 border-rose-900/30 text-rose-400'
                    : 'bg-rose-50 border-rose-200 text-rose-600'
                }`}>
                  <AlertTriangle className="w-5 h-5 animate-bounce" />
                </div>
                <div>
                  <h3 className={`text-sm font-extrabold ${isDark ? 'text-white' : 'text-slate-900'}`}>Delete Document Version</h3>
                  <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">
                    This will soft-delete version <span className={`font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>v{deletingDoc.version_number}</span> of the category <span className={`font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{formatDocType(deletingDoc.doc_type)}</span>.
                    The linked S3 file will be permanently removed.
                  </p>
                </div>
              </div>

              <div className={`p-3 border rounded space-y-1 text-[10px] font-semibold ${isDark ? 'bg-slate-955 border-slate-800 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-600 shadow-sm'}`}>
                <p>File: <span className={`font-bold truncate block ${isDark ? 'text-white' : 'text-slate-900'}`}>{deletingDoc.original_filename}</span></p>
                <p>Version: <span className="text-blue-400 font-mono">v{deletingDoc.version_number}</span></p>
              </div>

              <div className="space-y-1.5">
                <label className={`block text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-655'}`}>
                  Reason for Deletion <span className="text-rose-400">* (Required)</span>
                </label>
                <textarea
                  required
                  rows={3}
                  value={deleteDocReason}
                  onChange={(e) => setDeleteDocReason(e.target.value)}
                  placeholder="Provide compliance justification for deleting this specific version..."
                  className={`w-full border rounded px-3 py-2 text-xs resize-none font-medium focus:outline-none focus:border-blue-500 ${isDark ? 'bg-slate-955 border-slate-800 text-white placeholder-slate-600' : 'bg-white border-slate-300 text-slate-900 placeholder-slate-450'}`}
                />
              </div>

              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => { setDeletingDoc(null); setDeleteDocReason(''); }}
                  className={`px-4 py-2 rounded border text-xs font-bold transition-all cursor-pointer ${isDark ? 'bg-slate-955 hover:bg-slate-800 text-slate-400 hover:text-white border-slate-800' : 'bg-white hover:bg-slate-100 text-slate-600 hover:text-slate-905 border-slate-300 shadow-sm'}`}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isDeletingDocLoading || !deleteDocReason.trim()}
                  onClick={handleDeleteDoc}
                  className="flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed border border-rose-700 cursor-pointer"
                >
                  {isDeletingDocLoading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete Version</span>
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
