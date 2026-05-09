import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createShowAdHandle } from '../dist/server.mjs';

const CREATOR_HASH = 'creator-abc';
const FINGERPRINT = 'fp-123';

const baseConfig = {
  creatorHash: CREATOR_HASH,
  apiKey: 'sk_live_test',
  redirectSecret: 'redirect-secret',
  apiBaseUrl: 'https://api.example.test',
  videoAdUrl: 'https://ad.example.test',
};

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function makeJwt(claims) {
  const now = Math.floor(Date.now() / 1000);
  const payload = b64url({
    fingerprint: FINGERPRINT,
    ip_address: '203.0.113.10',
    creator_hash: CREATOR_HASH,
    session_hash: 'sess-1',
    iat: now - 60,
    nbf: now - 60,
    exp: now + 600,
    iss: 'showad-backend',
    ...claims,
  });
  return `${b64url({ alg: 'HS256', typ: 'JWT' })}.${payload}.signature-not-checked`;
}

function makeUnsignedJwt(claims) {
  const now = Math.floor(Date.now() / 1000);
  const payload = b64url({
    fingerprint: FINGERPRINT,
    ip_address: '203.0.113.10',
    creator_hash: CREATOR_HASH,
    session_hash: 'sess-1',
    iat: now - 60,
    nbf: now - 60,
    exp: now + 600,
    iss: 'showad-backend',
    ...claims,
  });
  return `${b64url({ alg: 'none', typ: 'JWT' })}.${payload}.`;
}

class MockCookies {
  constructor(initial = {}) {
    this.store = { ...initial };
    this.sets = [];
    this.deletes = [];
  }
  get(name) {
    return this.store[name];
  }
  set(name, value, opts) {
    this.sets.push({ name, value, opts });
    this.store[name] = value;
  }
  delete(name, opts) {
    this.deletes.push({ name, opts });
    delete this.store[name];
  }
}

function buildEvent({
  url = 'https://publisher.example/premium/story',
  cookies = {},
  headers = {},
  useCookieHeader = false,
} = {}) {
  const requestHeaders = new Headers(headers);
  if (useCookieHeader && Object.keys(cookies).length > 0) {
    const cookieHeader = Object.entries(cookies)
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join('; ');
    requestHeaders.set('cookie', cookieHeader);
  }
  const event = {
    request: new Request(url, { headers: requestHeaders }),
    url: new URL(url),
    cookies: useCookieHeader ? undefined : new MockCookies(cookies),
  };
  return event;
}

function recorderResolve() {
  const calls = [];
  const resolve = (event) => {
    calls.push(event);
    return new Response('OK', { status: 200, headers: { 'content-type': 'text/plain' } });
  };
  return { resolve, calls };
}

function withFetch(impl, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  return Promise.resolve(fn()).finally(() => {
    globalThis.fetch = original;
  });
}

function withValidateSuccess(fn) {
  return withFetch(
    async (url, init) => {
      assert.match(String(url), /\/api\/sdk\/validate$/);
      assert.equal(init?.method, 'POST');
      return new Response(JSON.stringify({ valid: true, message: 'ok' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
    fn
  );
}

test('non-protected paths pass through to resolve', async () => {
  const handle = createShowAdHandle(baseConfig, { protectedPaths: ['/premium/*'] });
  const event = buildEvent({ url: 'https://publisher.example/free/article' });
  const { resolve, calls } = recorderResolve();

  const response = await handle({ event, resolve });
  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
});

test('excluded paths pass through even when matched by protectedPaths', async () => {
  const handle = createShowAdHandle(baseConfig, {
    protectedPaths: ['/premium/*'],
    excludePaths: ['/premium/public/*'],
  });
  const event = buildEvent({ url: 'https://publisher.example/premium/public/teaser' });
  const { resolve, calls } = recorderResolve();

  const response = await handle({ event, resolve });
  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
});

test('unverified visitor on protected path is redirected to video ad with cleared cookies', async () => {
  const handle = createShowAdHandle(baseConfig, { protectedPaths: ['/premium/*'] });
  const event = buildEvent();
  const { resolve, calls } = recorderResolve();

  const response = await handle({ event, resolve });
  assert.equal(response.status, 302);
  const location = response.headers.get('location');
  assert.ok(location.startsWith('https://ad.example.test/c/creator-abc'));
  const target = new URL(location);
  assert.equal(target.searchParams.get('return_url'), event.url.toString());
  assert.equal(target.searchParams.get('sdk'), '1');
  assert.equal(calls.length, 0, 'resolve must not be called for unverified user');

  const setCookies = response.headers.getSetCookie();
  assert.ok(
    setCookies.some((c) => c.startsWith('showad_token=') && /Max-Age=0/.test(c)),
    'token cookie should be cleared'
  );
});

test('valid token cookie passes the request through to resolve', async () => {
  const handle = createShowAdHandle(baseConfig, { protectedPaths: ['/premium/*'] });
  const token = makeJwt();
  const event = buildEvent({
    cookies: {
      showad_fingerprint: FINGERPRINT,
      showad_token: token,
      showad_creator: CREATOR_HASH,
      showad_verified: '1',
      showad_expires: String(Math.floor(Date.now() / 1000) + 600),
    },
  });
  const { resolve, calls } = recorderResolve();

  const response = await withValidateSuccess(() => handle({ event, resolve }));
  assert.equal(response.status, 200);
  assert.equal(calls.length, 1, 'resolve must be invoked for valid token');
});

test('forged unsigned token redirects when backend validation rejects it', async () => {
  const handle = createShowAdHandle(baseConfig, { protectedPaths: ['/premium/*'] });
  const token = makeUnsignedJwt();
  const event = buildEvent({
    cookies: {
      showad_fingerprint: FINGERPRINT,
      showad_token: token,
      showad_creator: CREATOR_HASH,
      showad_verified: '1',
    },
  });
  const { resolve, calls } = recorderResolve();
  let validateCalls = 0;

  const response = await withFetch(
    async (url) => {
      validateCalls += 1;
      assert.match(String(url), /\/api\/sdk\/validate$/);
      return new Response(JSON.stringify({ valid: false, message: 'bad signature' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
    () => handle({ event, resolve })
  );

  assert.equal(response.status, 302);
  assert.equal(calls.length, 0);
  assert.equal(validateCalls, 1);
  const setCookies = response.headers.getSetCookie();
  assert.ok(setCookies.some((c) => c.startsWith('showad_token=') && /Max-Age=0/.test(c)));
});

test('valid token without prior verified cookie refreshes Set-Cookie metadata', async () => {
  const handle = createShowAdHandle(baseConfig, { protectedPaths: ['/premium/*'] });
  const token = makeJwt();
  const event = buildEvent({
    cookies: { showad_fingerprint: FINGERPRINT, showad_token: token },
  });
  const { resolve, calls } = recorderResolve();

  const response = await withValidateSuccess(() => handle({ event, resolve }));
  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  const setCookies = response.headers.getSetCookie();
  assert.ok(
    setCookies.some((c) => c.startsWith('showad_verified=1')),
    'verified cookie should be re-issued'
  );
  assert.ok(setCookies.some((c) => c.startsWith('showad_creator=' + CREATOR_HASH)));
});

test('expired token redirects to video ad', async () => {
  const handle = createShowAdHandle(baseConfig, { protectedPaths: ['/premium/*'] });
  const past = Math.floor(Date.now() / 1000) - 600;
  const token = makeJwt({ exp: past });
  const failures = [];
  const event = buildEvent({
    cookies: { showad_fingerprint: FINGERPRINT, showad_token: token },
  });
  const handle2 = createShowAdHandle(baseConfig, {
    protectedPaths: ['/premium/*'],
    onVerificationFailed: (r) => failures.push(r),
  });
  const { resolve, calls } = recorderResolve();
  const response = await handle2({ event, resolve });
  assert.equal(response.status, 302);
  assert.equal(calls.length, 0);
  assert.deepEqual(failures, ['expired_token']);
});

test('mismatched creator_hash in token redirects', async () => {
  const handle = createShowAdHandle(baseConfig, { protectedPaths: ['/premium/*'] });
  const token = makeJwt({ creator_hash: 'someone-else' });
  const event = buildEvent({
    cookies: { showad_fingerprint: FINGERPRINT, showad_token: token },
  });
  const { resolve, calls } = recorderResolve();
  const response = await handle({ event, resolve });
  assert.equal(response.status, 302);
  assert.equal(calls.length, 0);
});

test('redirect ticket is claimed via fetch and verification cookies are set', async () => {
  const handle = createShowAdHandle(baseConfig, { protectedPaths: ['/premium/*'] });
  const issuedToken = makeJwt();
  const fetchCalls = [];
  const mockFetch = async (url, init) => {
    fetchCalls.push({ url: String(url), init });
    return new Response(
      JSON.stringify({
        creator_hash: CREATOR_HASH,
        ticket_id: 'ticket-1',
        token: issuedToken,
        header_name: 'X-ShowAd-Token',
        scheme: 'Bearer',
        destination_url: 'https://publisher.example/premium/story',
        require_jwt: true,
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  };

  const event = buildEvent({
    url: 'https://publisher.example/premium/story?redirect_ticket=ticket-1&utm=foo',
    cookies: { showad_fingerprint: FINGERPRINT },
  });
  const { resolve, calls } = recorderResolve();

  const response = await withFetch(mockFetch, () => handle({ event, resolve }));
  assert.equal(response.status, 302);
  assert.equal(calls.length, 0);
  assert.equal(fetchCalls.length, 1);
  assert.equal(
    fetchCalls[0].url,
    'https://api.example.test/api/redirect-ticket/ticket-1/claim'
  );
  assert.equal(fetchCalls[0].init.method, 'POST');
  const headers = new Headers(fetchCalls[0].init.headers);
  assert.equal(headers.get('X-ShowAd-API-Key'), baseConfig.apiKey);
  assert.equal(headers.get('X-ShowAd-Creator-Hash'), CREATOR_HASH);
  assert.equal(headers.get('X-Redirect-Ticket-Secret'), baseConfig.redirectSecret);

  const location = new URL(response.headers.get('location'));
  assert.equal(location.searchParams.get('redirect_ticket'), null, 'ticket stripped');
  assert.equal(location.searchParams.get('utm'), 'foo', 'other params preserved');

  const setCookies = response.headers.getSetCookie();
  assert.ok(setCookies.some((c) => c.startsWith('showad_token=' + encodeURIComponent(issuedToken))));
  assert.ok(setCookies.some((c) => c.startsWith('showad_token=') && /HttpOnly/.test(c)));
  assert.ok(setCookies.some((c) => c.startsWith('showad_verified=1')));
  assert.ok(setCookies.some((c) => c.startsWith('showad_creator=' + CREATOR_HASH)));
});

test('redirect ticket without fingerprint cookie redirects to video ad', async () => {
  const handle = createShowAdHandle(baseConfig, { protectedPaths: ['/premium/*'] });
  const fetchCalls = [];
  const mockFetch = async (...args) => {
    fetchCalls.push(args);
    return new Response('{}', { status: 200 });
  };
  const event = buildEvent({
    url: 'https://publisher.example/premium/story?redirect_ticket=ticket-1',
  });
  const { resolve, calls } = recorderResolve();
  const response = await withFetch(mockFetch, () => handle({ event, resolve }));
  assert.equal(response.status, 302);
  assert.equal(fetchCalls.length, 0, 'fetch must not be called without fingerprint');
  assert.equal(calls.length, 0);
});

test('failed ticket claim falls back to video ad redirect', async () => {
  const handle = createShowAdHandle(baseConfig, { protectedPaths: ['/premium/*'] });
  const mockFetch = async () =>
    new Response(JSON.stringify({ error: 'gone' }), {
      status: 410,
      headers: { 'content-type': 'application/json' },
    });

  const event = buildEvent({
    url: 'https://publisher.example/premium/story?redirect_ticket=ticket-1',
    cookies: { showad_fingerprint: FINGERPRINT },
  });
  const { resolve, calls } = recorderResolve();
  const response = await withFetch(mockFetch, () => handle({ event, resolve }));
  assert.equal(response.status, 302);
  assert.equal(calls.length, 0);
  const location = response.headers.get('location');
  assert.ok(location.startsWith('https://ad.example.test/c/creator-abc'));
});

test('access policy with crawler verification allows verified Googlebot', async () => {
  const handle = createShowAdHandle(baseConfig, {
    protectedPaths: ['/premium/*'],
    accessPolicy: {
      crawler: {
        enabled: true,
        families: ['google'],
        familyCidrs: { google: ['66.249.64.0/19'] },
      },
    },
  });
  const event = buildEvent({
    headers: {
      'user-agent':
        'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    },
  });
  event.getClientAddress = () => '66.249.66.1';
  const { resolve, calls } = recorderResolve();
  const response = await withValidateSuccess(() => handle({ event, resolve }));
  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
});

test('access policy with UA-only crawler does NOT bypass (UA alone is insufficient)', async () => {
  const handle = createShowAdHandle(baseConfig, {
    protectedPaths: ['/premium/*'],
    accessPolicy: {
      crawler: {
        enabled: true,
        families: ['google'],
        familyCidrs: { google: ['66.249.64.0/19'] },
      },
    },
  });
  const event = buildEvent({
    headers: {
      'user-agent':
        'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    },
  });
  event.getClientAddress = () => '198.51.100.10';
  const { resolve, calls } = recorderResolve();
  const response = await handle({ event, resolve });
  assert.equal(response.status, 302);
  assert.equal(calls.length, 0);
});

test('cookies fall back to parsing the Cookie header when event.cookies is absent', async () => {
  const handle = createShowAdHandle(baseConfig, { protectedPaths: ['/premium/*'] });
  const token = makeJwt();
  const event = buildEvent({
    cookies: {
      showad_fingerprint: FINGERPRINT,
      showad_token: token,
      showad_creator: CREATOR_HASH,
      showad_verified: '1',
      showad_expires: String(Math.floor(Date.now() / 1000) + 600),
    },
    useCookieHeader: true,
  });
  const { resolve, calls } = recorderResolve();
  const response = await withValidateSuccess(() => handle({ event, resolve }));
  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
});
