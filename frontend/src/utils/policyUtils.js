/**
 * parseNotes — parses the `notes` field from a DocumentResponse.
 *
 * Handles three shapes:
 *  1. JSONB dict from API (new format): { policy_number: '...', version_note: '...' }
 *  2. JSON string (transitional): '{"policy_number":"...","version_note":"..."}'
 *  3. Legacy plain-text string: 'Old text note' — treated as version_note
 *  4. null / undefined — returns empty strings
 */
export function parseNotes(raw) {
  if (!raw) return { policyNumber: '', versionNote: '' };

  // Case 1: already a parsed object (JSONB returns dict via axios)
  if (typeof raw === 'object') {
    return {
      policyNumber: raw.policy_number || '',
      versionNote: raw.version_note || '',
    };
  }

  // Case 2: JSON string
  try {
    const parsed = JSON.parse(raw);
    return {
      policyNumber: parsed.policy_number || '',
      versionNote: parsed.version_note || '',
    };
  } catch {
    // Case 3: Legacy plain-text
    return { policyNumber: '', versionNote: String(raw) };
  }
}

/**
 * getPolicyStatus — returns a status string based on policy_end_date.
 * Uses UTC ISO date string comparison to avoid timezone border issues.
 *
 * @param {string} endDateStr - ISO date string e.g. "2025-07-12"
 * @returns {'active' | 'expiring' | 'expired'}
 */
export function getPolicyStatus(endDateStr) {
  if (!endDateStr) return 'expired';
  const today = new Date().toISOString().split('T')[0]; // UTC YYYY-MM-DD
  const thirtyDaysLater = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];

  if (endDateStr < today) return 'expired';
  if (endDateStr <= thirtyDaysLater) return 'expiring';
  return 'active';
}

/**
 * formatDate — formats an ISO date string to a human-readable short date.
 * @param {string} dateStr
 * @returns {string}
 */
export function formatDate(dateStr) {
  if (!dateStr) return '—';
  const hasTime = dateStr.includes('T');
  const dateObj = hasTime ? new Date(dateStr) : new Date(dateStr + 'T00:00:00Z');
  if (isNaN(dateObj.getTime())) return '—';
  return dateObj.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: hasTime ? undefined : 'UTC',
  });
}

/**
 * formatDateTime — formats an ISO datetime string to a human-readable datetime.
 * @param {string} dateStr
 * @returns {string}
 */
export function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * formatDocType — converts snake_case doc_type to a display label.
 * @param {string} docType
 * @returns {string}
 */
export function formatDocType(docType) {
  if (!docType) return '';
  return docType
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * generateCSV — converts an array of objects to a CSV string and triggers download.
 * @param {Object[]} rows
 * @param {string[]} columns - keys to include
 * @param {string} filename
 */
export function downloadCSV(rows, columns, filename = 'export.csv') {
  const header = columns.join(',');
  const body = rows
    .map((row) =>
      columns
        .map((col) => {
          const val = row[col] ?? '';
          return `"${String(val).replace(/"/g, '""')}"`;
        })
        .join(',')
    )
    .join('\n');
  const csv = `${header}\n${body}`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
