import { store } from './store';

const BASE = '/api';

export async function api(path, options = {}) {
  const { token } = store.getState().auth;
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.error || `Request failed: ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}
