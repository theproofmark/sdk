import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';

import { NextRequest } from 'next/server.js';

import { createShowAdMiddleware } from '../dist/middleware.mjs';

const FUTURE = Math.floor(Date.now() / 1000) + 3600;

const config = {
  creatorHash: 'creator-abc',
  apiKey: 'sk_test_key',
  redirectSecret: 'rs_test_secret',
  apiBaseUrl: 'https://api.test',
  videoAdUrl: 'https://video.test',
};

let originalFetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function base64url(value) {
  return Buffer.from(value).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function makeToken(claims, alg = 'HS256') {
  return `${base64url(JSON.stringify({ alg, typ: 'JWT' }))}.${base64url(JSON.stringify(claims))}.${alg === 'none' ? '' : 'sig'}`;
}

function requestWithCookies(token) {
  return new NextRequest('https://publisher.test/premium/article', {
    headers: {
      cookie: [
        `showad_token=${encodeURIComponent(token)}`,
        'showad_fingerprint=fp-1',
        'showad_creator=creator-abc',
        'showad_verified=1',
        `showad_expires=${FUTURE}`,
      ].join('; '),
    },
  });
}

test('existing token is validated by backend before protected content is allowed', async () => {
  const token = makeToken({
    creator_hash: 'creator-abc',
    fingerprint: 'fp-1',
    exp: FUTURE,
    iss: 'showad-backend',
  });
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ valid: true, message: 'ok' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  const middleware = createShowAdMiddleware(config, { protectedPaths: ['/premium/*'] });
  const response = await middleware(requestWithCookies(token));

  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/api\/sdk\/validate$/);
  assert.deepEqual(JSON.parse(calls[0].init.body), { token, sdk_key: 'sk_test_key' });
});

test('forged unsigned token redirects when backend validation rejects it', async () => {
  const token = makeToken({
    creator_hash: 'creator-abc',
    fingerprint: 'fp-1',
    exp: FUTURE,
    iss: 'showad-backend',
  }, 'none');
  let validateCalls = 0;
  globalThis.fetch = async () => {
    validateCalls += 1;
    return new Response(JSON.stringify({ valid: false, message: 'bad signature' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  const middleware = createShowAdMiddleware(config, { protectedPaths: ['/premium/*'] });
  const response = await middleware(requestWithCookies(token));

  assert.equal(response.status, 307);
  assert.equal(validateCalls, 1);
  assert.match(response.headers.get('location') || '', /^https:\/\/video\.test\/c\/creator-abc\?/);
  assert.match(response.headers.get('set-cookie') || '', /showad_token=;/);
});
