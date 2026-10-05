export function authRedirectUrl(location = window.location) {
  return `${location.origin}${location.pathname}`;
}

export async function fetchWithTimeout(input, options = {}, timeoutMs = 15000) {
  const timeout = AbortSignal.timeout(timeoutMs);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  return fetch(input, { ...options, signal });
}

const arrayValue = value => {
  if (Array.isArray(value)) return value;
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; }
  catch { return []; }
};

// Auth owns identity; an unavailable application profile must not sign a user out.
export function profileForUser(user, row) {
  // Keep legacy/raw fields as fallbacks, but let canonical table columns win.
  const profile = { ...(row?.raw_data || {}), ...row };
  const metadata = user.user_metadata || {};
  return {
    ...profile,
    id: user.id,
    uid: user.id,
    email: user.email || '',
    name: profile.name || metadata.name || metadata.full_name || user.email?.split('@')[0] || 'SportSpace',
    phone: profile.phone || metadata.phone || '',
    role: profile.role || 'user',
    favoriteSports: arrayValue(profile.favoriteSports),
    savedVenueIds: arrayValue(profile.savedVenueIds),
    // user_metadata is user-editable and must never grant admin access.
    isAdmin: user.app_metadata?.admin === true,
  };
}

export function consumeAuthError(location = window.location, history = window.history) {
  const query = new URLSearchParams(location.search);
  const hash = new URLSearchParams(location.hash.slice(1));
  const code = hash.get('error') || query.get('error');
  if (!code) return null;
  const message = hash.get('error_description') || query.get('error_description') || code;
  for (const key of ['error', 'error_code', 'error_description']) {
    query.delete(key);
    hash.delete(key);
  }
  history.replaceState(null, '', location.pathname + (query.size ? `?${query}` : '') + (hash.size ? `#${hash}` : ''));
  return message;
}
