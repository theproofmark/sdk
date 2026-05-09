import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';

import { protect } from '../app/app/lib/proofmark/verify.ts';

const CONFIG = {
  creatorHash: 'creator-test',
  apiKey: 'sk-test',
  redirectSecret: 'redirect-secret',
  apiBaseUrl: 'https://api.test.local',
  videoAdUrl: 'https://video.test.local',
};

function base64url(input) {
  return Buffer.from(input, 'utf-8').toString('base64')
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function makeToken(claims, alg = 'HS256') {
  const header = base64url(JSON.stringify({ alg, typ: 'JWT' }));
  const payload = base64url(JSON.stringify(claims));
  return `${header}.${payload}.${alg === 'none' ? '' : 'sig'}`;
}

let originalFetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('existing token is allowed only after backend validation succeeds', async () => {
  const token = makeToken({
    creator_hash: CONFIG.creatorHash,
    session_hash: 'sess-1',
    fingerprint: 'fp-1',
    exp: Math.floor(Date.now() / 1000) + 3600,
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

  const result = await protect(CONFIG, {
    token,
    fingerprint: 'fp-1',
    returnUrl: 'https://shop.example/products/protected',
  });

  assert.equal(result.verified, true);
  assert.equal(result.reason, 'valid_token');
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/api\/sdk\/validate$/);
});

test('forged unsigned token is rejected when backend validation rejects it', async () => {
  const token = makeToken({
    creator_hash: CONFIG.creatorHash,
    session_hash: 'sess-1',
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

  const result = await protect(CONFIG, {
    token,
    fingerprint: 'fp-1',
    returnUrl: 'https://shop.example/products/protected',
  });

  assert.equal(result.verified, false);
  assert.equal(result.reason, 'invalid_token');
  assert.equal(validateCalls, 1);
});
