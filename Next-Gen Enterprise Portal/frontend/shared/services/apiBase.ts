const normalizeApiBaseUrl = (value?: string): string => {
  const raw = String(value || '').trim();
  if (!raw) return '/api/v1';

  const normalized = raw.endsWith('/') ? raw.slice(0, -1) : raw;
  if (normalized === '/api') return '/api/v1';
  if (normalized.endsWith('/api')) return `${normalized}/v1`;
  return normalized;
};

export const API_BASE_URL = normalizeApiBaseUrl(import.meta.env.VITE_API_BASE_URL as string | undefined);
