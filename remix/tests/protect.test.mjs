import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  requireShowAdVerification,
  protectLoader,
  buildVerificationSetCookieHeaders,
  getCookieNames,
} from '../dist/server.mjs';

const CONFIG = {
  creatorHash: 'creator-test',
  apiKey: 'sk-test',
  redirectSecret: 'redirect-secret-test',
  apiBaseUrl: 'https://api.test.local',
  videoAdUrl: 'https://showad.test.local',
  cookieMaxAge: 3600,
};

const NAMES = getCookieNames();

function base64UrlEncode(input) {
  return Buffer.from(input, 'utf8')
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function makeToken(payload) {
  const h = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const p = base64UrlEncode(JSON.stringify(payload));
  return `${h}.${p}.signature`;
}
function makeUnsignedToken(payload) {
  const h = base64UrlEncode(JSON.stringify({ alg: 'none', typ: 'JWT' }));
  const p = base64UrlEncode(JSON.stringify(payload));
  return `${h}.${p}.`;
}

function buildCookieHeader(map) {
  return Object.entries(map)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('; ');
}

function makeRequest(url, cookies = {}, extraHeaders = {}) {
  const headers = new Headers(extraHeaders);
  if (Object.keys(cookies).length) {
    headers.set('Cookie', buildCookieHeader(cookies));
  }
  return new Request(url, { headers });
}

function withFetchMock(handler, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  return Promise.resolve(fn()).finally(() => {
    globalThis.fetch = original;
  });
}

function withValidateSuccess(fn) {
  return withFetchMock(
    async (url, init) => {
      assert.match(String(url), /\/api\/sdk\/validate$/);
      assert.equal(init?.method, 'POST');
      return new Response(JSON.stringify({ valid: true, message: 'ok' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
    fn
  );
}

test('redirects to video ad when no verification cookies are present', async () => {
  const response = await requireShowAdVerification(
    makeRequest('https://publisher.example/premium/story'),
    CONFIG
  );

  assert.ok(response, 'expected a Response');
  assert.equal(response.status, 302);
  const location = response.headers.get('location');
  assert.ok(location?.startsWith('https://showad.test.local/c/creator-test'), location);
  assert.match(location, /return_url=/);
  assert.match(location, /sdk=1/);

  const setCookies = response.headers.getSetCookie?.() ?? [];
  assert.ok(setCookies.some((c) => c.startsWith(`${NAMES.token}=;`)));
});

test('skips paths that are not in protectedPaths', async () => {
  const response = await requireShowAdVerification(
    makeRequest('https://publisher.example/public/story'),
    CONFIG,
    { protectedPaths: ['/premium/*'] }
  );
  assert.equal(response, undefined);
});

test('skips paths matched by excludePaths', async () => {
  const response = await requireShowAdVerification(
    makeRequest('https://publisher.example/premium/api/foo'),
    CONFIG,
    { protectedPaths: ['/premium/*'], excludePaths: ['/premium/api/*'] }
  );
  assert.equal(response, undefined);
});

test('valid token + matching cookies allows the request to continue', async () => {
  const token = makeToken({
    creator_hash: CONFIG.creatorHash,
    fingerprint: 'fp-1',
    exp: Math.floor(Date.now() / 1000) + 3600,
    iss: 'showad-backend',
  });

  const response = await withValidateSuccess(() =>
    requireShowAdVerification(
      makeRequest('https://publisher.example/premium', {
        [NAMES.token]: token,
        [NAMES.fingerprint]: 'fp-1',
        [NAMES.creator]: CONFIG.creatorHash,
        [NAMES.verified]: '1',
        [NAMES.expires]: String(Math.floor(Date.now() / 1000) + 3600),
      }),
      CONFIG
    )
  );

  assert.equal(response, undefined);
});

test('forged unsigned token redirects when backend validation rejects it', async () => {
  const token = makeUnsignedToken({
    creator_hash: CONFIG.creatorHash,
    fingerprint: 'fp-1',
    exp: Math.floor(Date.now() / 1000) + 3600,
    iss: 'showad-backend',
  });

  let validateCalls = 0;
  const response = await withFetchMock(
    async (url) => {
      validateCalls += 1;
      assert.match(String(url), /\/api\/sdk\/validate$/);
      return new Response(JSON.stringify({ valid: false, message: 'bad signature' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
    () =>
      requireShowAdVerification(
        makeRequest('https://publisher.example/premium', {
          [NAMES.token]: token,
          [NAMES.fingerprint]: 'fp-1',
          [NAMES.creator]: CONFIG.creatorHash,
          [NAMES.verified]: '1',
        }),
        CONFIG
      )
  );

  assert.ok(response);
  assert.equal(response.status, 302);
  assert.equal(validateCalls, 1);
  const setCookies = response.headers.getSetCookie?.() ?? [];
  assert.ok(setCookies.some((c) => c.startsWith(`${NAMES.token}=;`)));
});

test('valid token but missing UX cookies returns 204 with refreshed cookies', async () => {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const token = makeToken({
    creator_hash: CONFIG.creatorHash,
    fingerprint: 'fp-1',
    exp,
    iss: 'showad-backend',
  });

  const response = await withValidateSuccess(() =>
    requireShowAdVerification(
      makeRequest('https://publisher.example/premium', {
        [NAMES.token]: token,
        [NAMES.fingerprint]: 'fp-1',
      }),
      CONFIG
    )
  );

  assert.ok(response);
  assert.equal(response.status, 204);
  const setCookies = response.headers.getSetCookie?.() ?? [];
  assert.ok(setCookies.some((c) => c.startsWith(`${NAMES.verified}=1`)));
  assert.ok(setCookies.some((c) => c.startsWith(`${NAMES.expires}=${exp}`)));
});

test('expired token redirects to video ad', async () => {
  const token = makeToken({
    creator_hash: CONFIG.creatorHash,
    fingerprint: 'fp-1',
    exp: Math.floor(Date.now() / 1000) - 60,
    iss: 'showad-backend',
  });

  const response = await requireShowAdVerification(
    makeRequest('https://publisher.example/premium', {
      [NAMES.token]: token,
      [NAMES.fingerprint]: 'fp-1',
    }),
    CONFIG
  );

  assert.ok(response);
  assert.equal(response.status, 302);
});

test('mismatched creator hash redirects to video ad', async () => {
  const token = makeToken({
    creator_hash: 'other-creator',
    fingerprint: 'fp-1',
    exp: Math.floor(Date.now() / 1000) + 3600,
    iss: 'showad-backend',
  });

  const response = await requireShowAdVerification(
    makeRequest('https://publisher.example/premium', {
      [NAMES.token]: token,
      [NAMES.fingerprint]: 'fp-1',
    }),
    CONFIG
  );

  assert.ok(response);
  assert.equal(response.status, 302);
});

test('redirect_ticket without fingerprint redirects without claim', async () => {
  let calls = 0;
  await withFetchMock(
    async () => {
      calls += 1;
      return new Response('{}', { status: 200 });
    },
    async () => {
      const response = await requireShowAdVerification(
        makeRequest('https://publisher.example/premium?redirect_ticket=t-1'),
        CONFIG
      );
      assert.ok(response);
      assert.equal(response.status, 302);
    }
  );
  assert.equal(calls, 0, 'fetch should not be called without a fingerprint');
});

test('redirect_ticket with fingerprint claims and sets verification cookies', async () => {
  const exp = Math.floor(Date.now() / 1000) + 1800;
  const claimedToken = makeToken({
    creator_hash: CONFIG.creatorHash,
    fingerprint: 'fp-1',
    exp,
    iss: 'showad-backend',
  });

  let claimUrl = '';
  let claimBody = '';
  await withFetchMock(
    async (url, init) => {
      claimUrl = url;
      claimBody = init?.body || '';
      return new Response(
        JSON.stringify({
          creator_hash: CONFIG.creatorHash,
          ticket_id: 't-1',
          token: claimedToken,
          header_name: 'X-ShowAd-Token',
          scheme: 'Bearer',
          destination_url: '',
          require_jwt: false,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    },
    async () => {
      const response = await requireShowAdVerification(
        makeRequest('https://publisher.example/premium?redirect_ticket=t-1', {
          [NAMES.fingerprint]: 'fp-1',
        }),
        CONFIG
      );

      assert.ok(response);
      assert.equal(response.status, 302);
      const location = response.headers.get('location');
      assert.equal(location, 'https://publisher.example/premium');

      const setCookies = response.headers.getSetCookie?.() ?? [];
      assert.ok(setCookies.some((c) => c.startsWith(`${NAMES.token}=`) && c.includes('HttpOnly')));
      assert.ok(setCookies.some((c) => c.startsWith(`${NAMES.verified}=1`)));
      assert.ok(setCookies.some((c) => c.startsWith(`${NAMES.expires}=${exp}`)));
    }
  );

  assert.match(claimUrl, /\/api\/redirect-ticket\/t-1\/claim$/);
  const parsedBody = JSON.parse(claimBody);
  assert.equal(parsedBody.creator_hash, CONFIG.creatorHash);
});

test('failed claim redirects to video ad', async () => {
  await withFetchMock(
    async () => new Response('{"error":"gone"}', { status: 410 }),
    async () => {
      const response = await requireShowAdVerification(
        makeRequest('https://publisher.example/premium?redirect_ticket=t-1', {
          [NAMES.fingerprint]: 'fp-1',
        }),
        CONFIG
      );
      assert.ok(response);
      assert.equal(response.status, 302);
      const location = response.headers.get('location');
      assert.ok(location.startsWith('https://showad.test.local/c/creator-test'));
    }
  );
});

test('access-policy allow short-circuits before token logic', async () => {
  const response = await requireShowAdVerification(
    makeRequest('https://publisher.example/premium', {}, { 'x-publisher-premium': '1' }),
    CONFIG,
    {
      accessPolicy: {
        beforeProtect: ({ request }) =>
          request.headers.get('x-publisher-premium') === '1'
            ? { action: 'allow', reason: 'premium' }
            : 'continue',
      },
    }
  );
  assert.equal(response, undefined);
});

test('access-policy redirect short-circuits with the supplied URL', async () => {
  const response = await requireShowAdVerification(
    makeRequest('https://publisher.example/premium'),
    CONFIG,
    {
      accessPolicy: {
        beforeProtect: () => ({ action: 'redirect', redirectUrl: '/login' }),
      },
    }
  );
  assert.ok(response);
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), 'https://publisher.example/login');
});

test('protectLoader returns guard response without invoking the loader', async () => {
  let invoked = false;
  const wrapped = protectLoader(
    async () => {
      invoked = true;
      return new Response('inner', { status: 200 });
    },
    CONFIG
  );

  const result = await wrapped({
    request: makeRequest('https://publisher.example/premium'),
  });

  assert.equal(invoked, false);
  assert.ok(result instanceof Response);
  assert.equal(result.status, 302);
});

test('protectLoader merges cookie-refresh into the inner loader response', async () => {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const token = makeToken({
    creator_hash: CONFIG.creatorHash,
    fingerprint: 'fp-1',
    exp,
    iss: 'showad-backend',
  });

  let invoked = false;
  const wrapped = protectLoader(
    async () => {
      invoked = true;
      return new Response('hello', {
        status: 200,
        headers: { 'X-Inner': '1' },
      });
    },
    CONFIG
  );

  const result = await withValidateSuccess(() =>
    wrapped({
      request: makeRequest('https://publisher.example/premium', {
        [NAMES.token]: token,
        [NAMES.fingerprint]: 'fp-1',
      }),
    })
  );

  assert.equal(invoked, true);
  assert.ok(result instanceof Response);
  assert.equal(result.status, 200);
  assert.equal(result.headers.get('x-inner'), '1');
  const setCookies = result.headers.getSetCookie?.() ?? [];
  assert.ok(setCookies.some((c) => c.startsWith(`${NAMES.verified}=1`)));
});

test('buildVerificationSetCookieHeaders honours the secure flag', () => {
  const headers = buildVerificationSetCookieHeaders({
    token: 'token',
    creatorHash: 'c',
    tokenExpiry: 1234,
    cookieMaxAge: 3600,
    secure: true,
  });
  assert.ok(headers.every((h) => h.includes('Secure')));
  assert.ok(headers.find((h) => h.startsWith(`${NAMES.token}=`))?.includes('HttpOnly'));
});
