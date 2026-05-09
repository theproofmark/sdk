import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';

import { NextRequest } from 'next/server.js';
import { createShowAdMiddleware } from '../dist/middleware.mjs';

const CONFIG = {
  creatorHash: 'creator-abc',
  apiKey: 'sk-test',
  redirectSecret: 'redirect-secret',
  apiBaseUrl: 'https://api.test.local',
  videoAdUrl: 'https://video.test.local',
};

function base64url(input) {
  return Buffer.from(input, 'utf8')
    .toString('base64')
    .replace(/=+$/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function makeToken(claims, alg = 'HS256') {
  return [
    base64url(JSON.stringify({ alg, typ: 'JWT' })),
    base64url(JSON.stringify(claims)),
    alg === 'none' ? '' : 'sig',
  ].join('.');
}

function makeRequest(cookies) {
  return new NextRequest('https://publisher.example/premium/article', {
    headers: {
      cookie: Object.entries(cookies)
        .map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
        .join('; '),
    },
  });
}

let originalFetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('existing token is allowed only after backend validation succeeds', async () => {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const token = makeToken({
    creator_hash: CONFIG.creatorHash,
    fingerprint: 'fp-1',
    exp,
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

  const middleware = createShowAdMiddleware(CONFIG, { protectedPaths: ['/premium/*'] });
  const response = await middleware(makeRequest({
    showad_token: token,
    showad_fingerprint: 'fp-1',
    showad_creator: CONFIG.creatorHash,
    showad_verified: '1',
    showad_expires: String(exp),
  }));

  assert.equal(response.headers.get('location'), null);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/api\/sdk\/validate$/);
  assert.deepEqual(JSON.parse(calls[0].init.body), { token, sdk_key: 'sk-test' });
});

test('forged unsigned token redirects when backend validation rejects it', async () => {
  const token = makeToken({
    creator_hash: CONFIG.creatorHash,
    fingerprint: 'fp-1',
    exp: Math.floor(Date.now() / 1000) + 3600,
    iss: 'showad-backend',
  }, 'none');
  let validateCalls = 0;
  globalThis.fetch = async (url) => {
    validateCalls += 1;
    assert.match(String(url), /\/api\/sdk\/validate$/);
    return new Response(JSON.stringify({ valid: false, message: 'bad signature' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  const middleware = createShowAdMiddleware(CONFIG, { protectedPaths: ['/premium/*'] });
  const response = await middleware(makeRequest({
    showad_token: token,
    showad_fingerprint: 'fp-1',
    showad_creator: CONFIG.creatorHash,
    showad_verified: '1',
  }));

  assert.match(response.headers.get('location') || '', /^https:\/\/video\.test\.local\/c\/creator-abc\?/);
  assert.equal(validateCalls, 1);
  assert.match(response.headers.get('set-cookie') || '', /showad_token=/);
});
