export const SUPABASE_URL = 'https://tcteyjqttubktygdzmbp.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_2JpXxZ6eTRP5l_hTKP72Sg_AfGTGDWI';
// Where GoTrue's recovery/invite email links redirect to — the extension has
// no web app of its own, so this static page is the landing spot that reads
// the token from the URL and lets the user set a password.
export const AUTH_LANDING_URL = 'https://krishnakrish77.github.io/career-coach/auth.html';

async function authRequest(path, body, fetchImpl) {
  const res = await fetchImpl(`${SUPABASE_URL}/auth/v1/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.msg || data.error || `Auth error ${res.status}`);
  return data;
}

// Normalizes a GoTrue token response into the shape we persist to chrome.storage.local.
export function toStoredSession(authResponse) {
  return {
    accessToken: authResponse.access_token,
    refreshToken: authResponse.refresh_token,
    expiresAt: Math.floor(Date.now() / 1000) + authResponse.expires_in,
    user: { id: authResponse.user.id, email: authResponse.user.email },
  };
}

// With email confirmation required (the current live setting), signup
// succeeds but returns no session until the link is clicked — access_token
// is absent rather than the response being malformed. Signal that case
// distinctly instead of crashing trying to build a session that doesn't exist yet.
export async function signUp(email, password, fetchImpl = fetch) {
  const authResponse = await authRequest('signup', { email, password }, fetchImpl);
  if (!authResponse.access_token) return { pendingConfirmation: true };
  return toStoredSession(authResponse);
}

export async function signIn(email, password, fetchImpl = fetch) {
  return toStoredSession(await authRequest('token?grant_type=password', { email, password }, fetchImpl));
}

// GoTrue returns 200 with an empty body whether or not the email exists, by
// design, to avoid leaking which emails are registered — so there's nothing
// meaningful to return here beyond "the request was accepted."
export async function requestPasswordReset(email, fetchImpl = fetch) {
  await authRequest(`recover?redirect_to=${encodeURIComponent(AUTH_LANDING_URL)}`, { email }, fetchImpl);
}

export async function refreshSession(refreshToken, fetchImpl = fetch) {
  return toStoredSession(await authRequest('token?grant_type=refresh_token', { refresh_token: refreshToken }, fetchImpl));
}

// Returns a still-valid session, refreshing first if it's expired/near expiry.
// Returns the same object unchanged when no refresh was needed (callers can skip
// re-persisting in that case), a new session object when it refreshed, or null if
// there's no session or the refresh token itself is no longer valid.
export async function getValidSession(session, fetchImpl = fetch) {
  if (!session) return null;
  const bufferSeconds = 60;
  if (session.expiresAt - Math.floor(Date.now() / 1000) > bufferSeconds) {
    return session;
  }
  try {
    return await refreshSession(session.refreshToken, fetchImpl);
  } catch {
    return null;
  }
}
