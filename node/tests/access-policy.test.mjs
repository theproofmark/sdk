import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  evaluateAccessPolicy,
  isIpInCidrs,
  verifyCrawlerRequest,
  getClientIp,
} from '../dist/access-policy.mjs';

function normalized({ headers = {}, ip = null, pathname = '/premium/story', url = 'https://publisher.example/premium/story' } = {}) {
  const lowerHeaders = {};
  for (const [k, v] of Object.entries(headers)) lowerHeaders[k.toLowerCase()] = v;
  return {
    headers: lowerHeaders,
    cookies: {},
    ip,
    pathname,
    searchParams: new URL(url).searchParams,
    url,
    method: 'GET',
    isHttps: url.startsWith('https'),
  };
}

test('matches IPv4 CIDR ranges', () => {
  assert.equal(isIpInCidrs('203.0.113.42', ['203.0.113.0/24']), true);
  assert.equal(isIpInCidrs('198.51.100.42', ['203.0.113.0/24']), false);
});

test('matches IPv6 CIDR ranges', () => {
  assert.equal(isIpInCidrs('2001:db8::1', ['2001:db8::/32']), true);
  assert.equal(isIpInCidrs('2001:db9::1', ['2001:db8::/32']), false);
});

test('exact-IP CIDR (no prefix) matches', () => {
  assert.equal(isIpInCidrs('203.0.113.42', ['203.0.113.42']), true);
  assert.equal(isIpInCidrs('203.0.113.43', ['203.0.113.42']), false);
});

test('does not verify a crawler from user-agent alone', async () => {
  const result = await verifyCrawlerRequest({
    ip: '198.51.100.10',
    userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    crawler: {
      enabled: true,
      families: ['google'],
      familyCidrs: { google: ['66.249.64.0/19'] },
    },
  });
  assert.equal(result.verified, false);
  assert.equal(result.reason, 'ip_not_verified');
});

test('verifies a crawler when UA + trusted IP range match', async () => {
  const result = await verifyCrawlerRequest({
    ip: '66.249.66.1',
    userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    crawler: {
      enabled: true,
      families: ['google'],
      familyCidrs: { google: ['66.249.64.0/19'] },
    },
  });
  assert.equal(result.verified, true);
  assert.equal(result.family, 'google');
});

test('cloudflare verified bot grants access when enabled', async () => {
  const result = await verifyCrawlerRequest({
    ip: '198.51.100.5',
    userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1)',
    cloudflareVerifiedBot: true,
    crawler: {
      enabled: true,
      families: ['google'],
      allowCloudflareVerifiedBot: true,
    },
  });
  assert.equal(result.verified, true);
  assert.equal(result.reason, 'cloudflare_verified_bot');
});

test('reverseDnsVerifier as fallback', async () => {
  const result = await verifyCrawlerRequest({
    ip: '198.51.100.5',
    userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1)',
    crawler: {
      enabled: true,
      families: ['google'],
      reverseDnsVerifier: async (ip, family) => family === 'google' && ip === '198.51.100.5',
    },
  });
  assert.equal(result.verified, true);
  assert.equal(result.reason, 'reverse_dns_match');
});

test('publisher beforeProtect callback can allow a premium user', async () => {
  const decision = await evaluateAccessPolicy(
    normalized({ headers: { 'x-publisher-premium': '1' } }),
    {
      beforeProtect: ({ request }) =>
        request.headers['x-publisher-premium'] === '1'
          ? { action: 'allow', reason: 'premium_user' }
          : 'continue',
    }
  );
  assert.deepEqual(decision, { action: 'allow', reason: 'premium_user' });
});

test('CIDR allowlist resolves IP via configured trusted header', async () => {
  const decision = await evaluateAccessPolicy(
    normalized({ headers: { 'cf-connecting-ip': '203.0.113.42' } }),
    { allowCidrs: ['203.0.113.0/24'], trustedIpHeaders: ['cf-connecting-ip'] }
  );
  assert.deepEqual(decision, { action: 'allow', reason: 'cidr_allowlist' });
});

test('getClientIp uses first comma-separated value of trusted header', () => {
  const ip = getClientIp(
    normalized({ headers: { 'x-forwarded-for': '203.0.113.42, 10.0.0.1' } }),
    ['x-forwarded-for']
  );
  assert.equal(ip, '203.0.113.42');
});

test('getClientIp falls back to request.ip when no trusted header set', () => {
  const ip = getClientIp(normalized({ ip: '10.0.0.5' }), ['x-real-ip']);
  assert.equal(ip, '10.0.0.5');
});

test('UA bypass alone never grants access (no allowlists)', async () => {
  const decision = await evaluateAccessPolicy(
    normalized({
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)',
        'cf-connecting-ip': '198.51.100.10',
      },
    }),
    {
      trustedIpHeaders: ['cf-connecting-ip'],
      crawler: { enabled: true, families: ['google'] },
    }
  );
  assert.equal(decision.action, 'continue');
});
