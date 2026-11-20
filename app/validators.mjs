import crypto from 'node:crypto';
import net from 'node:net';

export const ALLOWED_CURRENCIES = new Set(['USD', 'EUR']);
export const ALLOWED_STATUSES = new Set(['pending', 'processing', 'completed', 'cancelled']);

/**
 * Validates order creation payload and returns normalized data or field errors.
 */
export function validateOrderPayload(payload) {
  const errors = {};
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { valid: false, errors: { body: 'JSON object payload is required.' } };
  }

  const reference = typeof payload.reference === 'string' ? payload.reference.trim() : '';
  const customerEmail = typeof payload.customerEmail === 'string' ? payload.customerEmail.trim().toLowerCase() : '';
  const currency = typeof payload.currency === 'string' ? payload.currency.trim().toUpperCase() : 'USD';
  const amount = Number(payload.amount);

  if (!reference || reference.length < 3 || reference.length > 40 || !/^[A-Za-z0-9_-]+$/.test(reference)) {
    errors.reference = 'Reference must be 3-40 alphanumeric, dash, or underscore characters.';
  }

  if (!customerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
    errors.customerEmail = 'A valid customer email is required.';
  }

  if (!Number.isFinite(amount) || amount <= 0 || amount > 100000) {
    errors.amount = 'Amount must be a finite number between 0.01 and 100000.';
  }

  if (!ALLOWED_CURRENCIES.has(currency)) {
    errors.currency = 'Currency must be USD or EUR.';
  }

  if (Object.keys(errors).length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    data: {
      reference,
      customerEmail,
      amountCents: Math.round(amount * 100),
      currency,
    },
  };
}

/**
 * Checks whether an IPv4 address belongs to private, loopback, or link-local ranges.
 */
function isPrivateIpv4(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) {
    return true;
  }
  const [a, b] = parts;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

/**
 * SSRF protection for outbound webhook registration.
 */
export function isSafeWebhookUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
    return { safe: false, reason: 'Webhook URL is required.' };
  }

  let parsed;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return { safe: false, reason: 'Malformed URL.' };
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { safe: false, reason: 'Only HTTP/HTTPS protocols are allowed.' };
  }

  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) {
    return { safe: false, reason: 'Local/internal hostnames are blocked (SSRF protection).' };
  }

  const ipType = net.isIP(host);
  if (ipType === 4 && isPrivateIpv4(host)) {
    return { safe: false, reason: 'Private or loopback IPv4 addresses are blocked (SSRF protection).' };
  }
  if (ipType === 6 && (host === '::1' || host.startsWith('fe80:') || host.startsWith('fc') || host.startsWith('fd'))) {
    return { safe: false, reason: 'Private or loopback IPv6 addresses are blocked (SSRF protection).' };
  }

  return { safe: true, url: parsed.toString() };
}

/**
 * Computes a deterministic SHA-256 hash of a normalized JSON payload for idempotency checks.
 */
export function hashPayload(obj) {
  const canonical = JSON.stringify(obj, Object.keys(obj).sort());
  return crypto.createHash('sha256').update(canonical).digest('hex');
}
