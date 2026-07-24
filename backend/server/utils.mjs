import { randomUUID } from 'node:crypto';

export function id(prefix) {
  return `${prefix}_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
}

export function now() {
  return new Date().toISOString();
}

export function asString(value, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback;
}

export function asPort(value, fallback = 0) {
  const port = Number.parseInt(value, 10);
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : fallback;
}

export function asBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === 1 || value === '1') return true;
  if (value === 'false' || value === 0 || value === '0') return false;
  return fallback;
}

export function decodeBase64(value) {
  const normalized = String(value).trim().replaceAll('-', '+').replaceAll('_', '/');
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + padding, 'base64').toString('utf8');
}

export function encodeBase64(value) {
  return Buffer.from(value, 'utf8').toString('base64url');
}

export function redact(value, visible = 5) {
  const input = String(value || '');
  if (input.length <= visible) return input;
  return `${input.slice(0, visible)}...`;
}

export function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

export function normalizeArray(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  return String(value || '').split(',').map((item) => item.trim()).filter(Boolean);
}

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}
