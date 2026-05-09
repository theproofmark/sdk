import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  evaluateAccessPolicy,
  isIpInCidrs,
  verifyCrawlerRequest,
} from '../dist/access-policy.mjs';

function makeRequest(headers = {}, url = 'https://publisher.example/premium/story') {
  return new Request(url, { headers });
}

test('matches IPv4 CIDR ranges', () => {
  assert.equal(isIpInCidrs('203.0.113.42', ['203.0.113.0/24']), true);
  assert.equal(isIpInCidrs('198.51.100.42', ['203.0.113.0/24']), false);
});

test('matches IPv6 CIDR ranges', () => {
  assert.equal(isIpInCidrs('2001:db8::1', ['2001:db8::/32']), true);
  assert.equal(isIpInCidrs('2001:db9::1', ['2001:db8::/32']), false);
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
    userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1)',
    crawler: {
      enabled: true,
      families: ['google'],
      familyCidrs: { google: ['66.249.64.0/19'] },
    },
  });

  assert.equal(result.verified, true);
  assert.equal(result.family, 'google');
});

test('verifies via Cloudflare verified-bot signal', async () => {
  const result = await verifyCrawlerRequest({
    ip: '198.51.100.10',
    userAgent: 'Mozilla/5.0 (compatible; bingbot/2.0)',
    cloudflareVerifiedBot: true,
    crawler: {
      enabled: true,
      families: ['bing'],
      allowCloudflareVerifiedBot: true,
    },
  });

  assert.equal(result.verified, true);
  assert.equal(result.family, 'bing');
  assert.equal(result.reason, 'cloudflare_verified_bot');
});

test('beforeProtect can allow a server-verified premium user', async () => {
  const decision = await evaluateAccessPolicy(makeRequest({ 'x-publisher-premium': '1' }), {
    beforeProtect: ({ request }) => {
      return request.headers.get('x-publisher-premium') === '1'
        ? { action: 'allow', reason: 'premium_user' }
        : 'continue';
    },
  });
  assert.deepEqual(decision, { action: 'allow', reason: 'premium_user' });
});

test('trusted CIDR allowlist uses configured trusted IP headers', async () => {
  const decision = await evaluateAccessPolicy(
    makeRequest({ 'cf-connecting-ip': '203.0.113.42' }),
    {
      allowCidrs: ['203.0.113.0/24'],
      trustedIpHeaders: ['cf-connecting-ip'],
    }
  );
  assert.deepEqual(decision, { action: 'allow', reason: 'cidr_allowlist' });
});

test('untrusted X-Forwarded-For without configuration does not bypass', async () => {
  const decision = await evaluateAccessPolicy(
    makeRequest({ 'x-forwarded-for': '203.0.113.42' }),
    { allowCidrs: ['203.0.113.0/24'] }
  );
  assert.equal(decision.action, 'continue');
});

test('returns continue when no policy matches', async () => {
  const decision = await evaluateAccessPolicy(makeRequest());
  assert.deepEqual(decision, { action: 'continue' });
});
