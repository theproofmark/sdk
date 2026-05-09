import assert from 'node:assert/strict';
import { test, beforeEach, afterEach } from 'node:test';

import express from 'express';
import request from 'supertest';

import { createShowAdMiddleware } from '../dist/express.mjs';

function base64url(input) {
  return Buffer.from(input).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}
function makeToken(claims) {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify(claims));
  return `${header}.${payload}.sig`;
}
function makeUnsignedToken(claims) {
  const header = base64url(JSON.stringify({ alg: 'none', typ: 'JWT' }));
  const payload = base64url(JSON.stringify(claims));
  return `${header}.${payload}.`;
}

const FUTURE = Math.floor(Date.now() / 1000) + 3600;
const PAST = Math.floor(Date.now() / 1000) - 60;

const baseConfig = {
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

function buildApp(config = baseConfig, options = { protectedPaths: ['/premium/*'] }) {
  const app = express();
  app.use(createShowAdMiddleware(config, options));
  app.get('/public', (_req, res) => res.send('public'));
  app.get('/premium/article', (_req, res) => res.send('premium'));
  return app;
}

test('public path passes through without redirect', async () => {
  const app = buildApp();
  const res = await request(app).get('/public');
  assert.equal(res.status, 200);
  assert.equal(res.text, 'public');
});

test('protected path with no cookie redirects to video ad', async () => {
  const app = buildApp();
  const res = await request(app).get('/premium/article');
  assert.equal(res.status, 302);
  const location = res.headers.location;
  assert.match(location, /^https:\/\/video\.test\/c\/creator-abc\?/);
  assert.match(location, /sdk=1/);
  assert.match(location, /return_url=/);
});

test('protected path with valid token allows access', async () => {
  const token = makeToken({
    creator_hash: 'creator-abc',
    fingerprint: 'fp-1',
    exp: FUTURE,
    iss: 'showad-backend',
  });
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ valid: true, message: 'ok' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  const app = buildApp();
  const res = await request(app)
    .get('/premium/article')
    .set('Cookie', [
      `showad_token=${token}`,
      'showad_fingerprint=fp-1',
      'showad_creator=creator-abc',
      'showad_verified=1',
      `showad_expires=${FUTURE}`,
    ]);
  assert.equal(res.status, 200);
  assert.equal(res.text, 'premium');
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/api\/sdk\/validate$/);
  assert.deepEqual(JSON.parse(calls[0].init.body), { token, sdk_key: 'sk_test_key' });
});

test('forged unsigned token redirects when backend validation rejects it', async () => {
  const token = makeUnsignedToken({
    creator_hash: 'creator-abc',
    fingerprint: 'fp-1',
    exp: FUTURE,
    iss: 'showad-backend',
  });
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ valid: false, message: 'bad signature' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  const app = buildApp();
  const res = await request(app)
    .get('/premium/article')
    .set('Cookie', [
      `showad_token=${token}`,
      'showad_fingerprint=fp-1',
      'showad_creator=creator-abc',
      'showad_verified=1',
      `showad_expires=${FUTURE}`,
    ]);
  assert.equal(res.status, 302);
  assert.match(res.headers.location, /^https:\/\/video\.test\/c\/creator-abc\?/);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/api\/sdk\/validate$/);
  const cookies = (res.headers['set-cookie'] || []).join('\n');
  assert.match(cookies, /showad_token=;/);
});

test('protected path with expired token redirects', async () => {
  const token = makeToken({ creator_hash: 'creator-abc', fingerprint: 'fp-1', exp: PAST });
  const app = buildApp();
  const res = await request(app)
    .get('/premium/article')
    .set('Cookie', [`showad_token=${token}`, 'showad_fingerprint=fp-1']);
  assert.equal(res.status, 302);
  assert.match(res.headers.location, /^https:\/\/video\.test\/c\/creator-abc\?/);
});

test('protected path with creator mismatch redirects', async () => {
  const token = makeToken({ creator_hash: 'wrong', fingerprint: 'fp-1', exp: FUTURE });
  const app = buildApp();
  const res = await request(app)
    .get('/premium/article')
    .set('Cookie', [`showad_token=${token}`, 'showad_fingerprint=fp-1']);
  assert.equal(res.status, 302);
});

test('redirect_ticket flow claims ticket and sets cookies', async () => {
  const claimedToken = makeToken({
    creator_hash: 'creator-abc',
    fingerprint: 'fp-1',
    exp: FUTURE,
  });
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return new Response(
      JSON.stringify({
        creator_hash: 'creator-abc',
        ticket_id: 't-1',
        token: claimedToken,
        header_name: 'X-ShowAd-Token',
        scheme: 'Bearer',
        destination_url: 'https://publisher.test/premium/article',
        require_jwt: true,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  };

  const app = buildApp();
  const res = await request(app)
    .get('/premium/article?redirect_ticket=t-1')
    .set('Cookie', ['showad_fingerprint=fp-1']);

  assert.equal(res.status, 302);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/api\/redirect-ticket\/t-1\/claim$/);
  assert.equal(calls[0].init.headers['X-Redirect-Ticket-Secret'], 'rs_test_secret');
  assert.equal(calls[0].init.headers['X-ShowAd-API-Key'], 'sk_test_key');
  assert.equal(calls[0].init.headers['X-ShowAd-Creator-Hash'], 'creator-abc');

  const setCookies = res.headers['set-cookie'] || [];
  const joined = setCookies.join('\n');
  assert.match(joined, /showad_token=/);
  assert.match(joined, /HttpOnly/);
  assert.match(joined, /showad_verified=1/);
  assert.match(joined, /showad_creator=creator-abc/);
  assert.match(joined, /showad_ticket=t-1/);

  const location = res.headers.location;
  assert.doesNotMatch(location, /redirect_ticket/);
});

test('redirect_ticket failure (410) clears cookies and redirects to ad', async () => {
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ error: 'gone' }), {
      status: 410,
      headers: { 'Content-Type': 'application/json' },
    });

  const app = buildApp();
  const res = await request(app)
    .get('/premium/article?redirect_ticket=t-bad')
    .set('Cookie', ['showad_fingerprint=fp-1']);

  assert.equal(res.status, 302);
  assert.match(res.headers.location, /^https:\/\/video\.test\/c\/creator-abc\?/);
  const cookies = (res.headers['set-cookie'] || []).join('\n');
  assert.match(cookies, /showad_token=;/);
});

test('access policy bypass for trusted CIDR', async () => {
  const app = buildApp(baseConfig, {
    protectedPaths: ['/premium/*'],
    accessPolicy: {
      trustedIpHeaders: ['cf-connecting-ip'],
      allowCidrs: ['203.0.113.0/24'],
    },
  });
  const res = await request(app)
    .get('/premium/article')
    .set('cf-connecting-ip', '203.0.113.42');
  assert.equal(res.status, 200);
  assert.equal(res.text, 'premium');
});

test('access policy verified Googlebot is allowed through', async () => {
  const app = buildApp(baseConfig, {
    protectedPaths: ['/premium/*'],
    accessPolicy: {
      trustedIpHeaders: ['cf-connecting-ip'],
      crawler: {
        enabled: true,
        families: ['google'],
        familyCidrs: { google: ['66.249.64.0/19'] },
      },
    },
  });
  const res = await request(app)
    .get('/premium/article')
    .set('cf-connecting-ip', '66.249.66.1')
    .set('user-agent', 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)');
  assert.equal(res.status, 200);
});

test('access policy spoofed Googlebot UA without trusted IP is blocked', async () => {
  const app = buildApp(baseConfig, {
    protectedPaths: ['/premium/*'],
    accessPolicy: {
      trustedIpHeaders: ['cf-connecting-ip'],
      crawler: {
        enabled: true,
        families: ['google'],
        familyCidrs: { google: ['66.249.64.0/19'] },
      },
    },
  });
  const res = await request(app)
    .get('/premium/article')
    .set('cf-connecting-ip', '198.51.100.5')
    .set('user-agent', 'Mozilla/5.0 (compatible; Googlebot/2.1)');
  assert.equal(res.status, 302);
});

test('excludePaths short-circuits before access policy', async () => {
  let called = false;
  const app = buildApp(baseConfig, {
    protectedPaths: ['/premium/*'],
    excludePaths: ['/premium/free'],
    accessPolicy: {
      beforeProtect: () => {
        called = true;
        return 'continue';
      },
    },
  });
  app.get('/premium/free', (_req, res) => res.send('free'));
  const res = await request(app).get('/premium/free');
  assert.equal(res.status, 200);
  assert.equal(called, false);
});
