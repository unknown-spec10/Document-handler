/**
 * Input validation utilities for frontend forms.
 */

export function validateVehicleReg(value) {
  if (!value || !value.trim()) return 'Vehicle Registration Number is required.';
  const cleaned = value.replace(/[\s-]/g, '').toUpperCase();
  const regRegex = /^[A-Z0-9]{5,15}$/;
  if (!regRegex.test(cleaned)) {
    return 'Must be 5 to 15 alphanumeric characters (e.g. MH12AB1234).';
  }
  return null;
}

export function validateName(value) {
  if (!value || !value.trim()) return 'Full Name is required.';
  const cleaned = value.trim();
  if (cleaned.length < 2 || cleaned.length > 100) {
    return 'Full Name must be between 2 and 100 characters.';
  }
  const nameRegex = /^[a-zA-Z\s.-]+$/;
  if (!nameRegex.test(cleaned)) {
    return 'Full Name can only contain letters, spaces, dots, and hyphens.';
  }
  return null;
}

export function validatePhone(value) {
  if (!value || !value.trim()) return 'Phone Number is required.';
  // Strip spaces, hyphens, parentheses
  const cleaned = value.replace(/[\s\-()]/g, '');
  const phoneRegex = /^(?:\+?91)?[6-9]\d{9}$/;
  if (!phoneRegex.test(cleaned)) {
    return 'Please enter a valid 10-digit Indian phone number starting with 6-9 (optional +91 prefix).';
  }
  return null;
}

export function validateEmail(value) {
  if (!value || !value.trim()) return null; // Optional field
  const cleaned = value.trim();
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(cleaned)) {
    return 'Please enter a valid email address (e.g. name@example.com).';
  }
  return null;
}

export function validateCustomDocType(value) {
  if (!value) return 'Custom Document Type is required.';
  const cleaned = value.trim();
  if (cleaned.length < 3 || cleaned.length > 30) {
    return 'Custom Document Type must be between 3 and 30 characters.';
  }
  const docTypeRegex = /^[a-zA-Z0-9\s_-]+$/;
  if (!docTypeRegex.test(cleaned)) {
    return 'Can only contain letters, numbers, spaces, underscores, and hyphens.';
  }
  return null;
}

export function validateDates(startDate, endDate) {
  if (!endDate) return 'End Date is required.';
  if (!startDate) return null; // Start date is optional

  const start = new Date(startDate);
  const end = new Date(endDate);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return 'Invalid date format.';
  }

  if (end < start) {
    return 'End Date / Expiration must be on or after Start Date.';
  }
  return null;
}
