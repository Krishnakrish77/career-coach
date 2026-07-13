import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  signUp,
  signIn,
  refreshSession,
  getValidSession,
  toStoredSession,
  requestPasswordReset,
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  AUTH_LANDING_URL,
} from '../src/supabase-auth.js';

function fakeResponse({ ok = true, status = 200, json = {} }) {
  return { ok, status, json: async () => json };
}

const AUTH_RESPONSE = {
  access_token: 'access-1',
  refresh_token: 'refresh-1',
  expires_in: 3600,
  user: { id: 'user-1', email: 'a@example.com' },
};

test('toStoredSession normalizes a GoTrue response and computes an absolute expiry', () => {
  const before = Math.floor(Date.now() / 1000);
  const session = toStoredSession(AUTH_RESPONSE);
  assert.equal(session.accessToken, 'access-1');
  assert.equal(session.refreshToken, 'refresh-1');
  assert.equal(session.user.email, 'a@example.com');
  assert.ok(session.expiresAt >= before + 3600);
});

test('signUp posts to /auth/v1/signup with the apikey header', async () => {
  let capturedUrl, capturedOpts;
  const fetchImpl = async (url, opts) => {
    capturedUrl = url;
    capturedOpts = opts;
    return fakeResponse({ json: AUTH_RESPONSE });
  };
  const session = await signUp('a@example.com', 'pw', fetchImpl);
  assert.equal(session.user.id, 'user-1');
  assert.equal(capturedUrl, `${SUPABASE_URL}/auth/v1/signup`);
  assert.equal(capturedOpts.headers.apikey, SUPABASE_ANON_KEY);
  assert.deepEqual(JSON.parse(capturedOpts.body), { email: 'a@example.com', password: 'pw' });
});

test('signUp signals pendingConfirmation instead of crashing when email confirmation is required', async () => {
  // With enable_confirmations on, GoTrue's signup response has no access_token
  // (and no usable .user) until the confirmation link is clicked.
  const fetchImpl = async () => fakeResponse({ json: { id: 'user-1', email: 'a@example.com' } });
  const result = await signUp('a@example.com', 'pw', fetchImpl);
  assert.deepEqual(result, { pendingConfirmation: true });
});

test('signIn posts to the password grant endpoint', async () => {
  let capturedUrl;
  const fetchImpl = async (url) => {
    capturedUrl = url;
    return fakeResponse({ json: AUTH_RESPONSE });
  };
  const session = await signIn('a@example.com', 'pw', fetchImpl);
  assert.equal(session.accessToken, 'access-1');
  assert.equal(capturedUrl, `${SUPABASE_URL}/auth/v1/token?grant_type=password`);
});

test('signIn surfaces the GoTrue error message on failure', async () => {
  const fetchImpl = async () =>
    fakeResponse({ ok: false, status: 400, json: { error_description: 'Invalid login credentials' } });
  await assert.rejects(() => signIn('a@example.com', 'wrong', fetchImpl), /Invalid login credentials/);
});

test('refreshSession posts the refresh token to the refresh_token grant endpoint', async () => {
  let capturedUrl, capturedBody;
  const fetchImpl = async (url, opts) => {
    capturedUrl = url;
    capturedBody = JSON.parse(opts.body);
    return fakeResponse({ json: { ...AUTH_RESPONSE, access_token: 'access-2' } });
  };
  const session = await refreshSession('refresh-1', fetchImpl);
  assert.equal(session.accessToken, 'access-2');
  assert.equal(capturedUrl, `${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`);
  assert.equal(capturedBody.refresh_token, 'refresh-1');
});

test('getValidSession returns the same session untouched when it is not near expiry', async () => {
  const session = { accessToken: 'a', refreshToken: 'r', expiresAt: Math.floor(Date.now() / 1000) + 3600 };
  const result = await getValidSession(session, async () => {
    throw new Error('should not fetch');
  });
  assert.equal(result, session);
});

test('getValidSession refreshes when the session is within the expiry buffer', async () => {
  const session = { accessToken: 'a', refreshToken: 'r', expiresAt: Math.floor(Date.now() / 1000) + 10 };
  const fetchImpl = async () => fakeResponse({ json: { ...AUTH_RESPONSE, access_token: 'fresh' } });
  const result = await getValidSession(session, fetchImpl);
  assert.equal(result.accessToken, 'fresh');
});

test('getValidSession returns null when the refresh token is no longer valid', async () => {
  const session = { accessToken: 'a', refreshToken: 'r', expiresAt: Math.floor(Date.now() / 1000) - 10 };
  const fetchImpl = async () => fakeResponse({ ok: false, status: 401, json: { error: 'invalid_grant' } });
  const result = await getValidSession(session, fetchImpl);
  assert.equal(result, null);
});

test('getValidSession returns null when there is no session', async () => {
  const result = await getValidSession(null, async () => {
    throw new Error('should not fetch');
  });
  assert.equal(result, null);
});

test('requestPasswordReset posts to /auth/v1/recover with the landing page as redirect_to', async () => {
  let capturedUrl, capturedBody;
  const fetchImpl = async (url, opts) => {
    capturedUrl = url;
    capturedBody = JSON.parse(opts.body);
    return fakeResponse({ json: {} });
  };
  await requestPasswordReset('a@example.com', fetchImpl);
  assert.equal(capturedUrl, `${SUPABASE_URL}/auth/v1/recover?redirect_to=${encodeURIComponent(AUTH_LANDING_URL)}`);
  assert.deepEqual(capturedBody, { email: 'a@example.com' });
});
