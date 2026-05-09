import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  evaluateAccessPolicy,
  isIpInCidrs,
  verifyCrawlerRequest,
} from '../app/app/lib/proofmark/access-policy.ts';

function request(headers = {}, url = 'https://store.example/pages/premium/article') {
  return {
    headers: new Headers(headers),
    url,
    nextUrl: { pathname: new URL(url).pathname },
  };
}

test('matches IPv4 CIDR ranges', () => {
  assert.equal(isIpInCidrs('203.0.113.42', ['203.0.113.0/24']), true);
  assert.equal(isIpInCidrs('198.51.100.42', ['203.0.113.0/24']), false);
});

test('matches IPv6 CIDR ranges', () => {
  assert.equal(isIpInCidrs('2001:db8::1', ['2001:db8::/32']), true);
  assert.equal(isIpInCidrs('2001:dead::1', ['2001:db8::/32']), false);
});

test('does not verify a crawler from user-agent alone', async () => {
  const result = await verifyCrawlerRequest({
    ip: '198.51.100.10',
    userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    crawler: { enabled: true, families: ['google'], familyCidrs: { google: ['66.249.64.0/19'] } },
  });
  assert.equal(result.verified, false);
  assert.equal(result.reason, 'ip_not_verified');
});

test('verifies a crawler when user-agent and trusted IP range match', async () => {
  const result = await verifyCrawlerRequest({
    ip: '66.249.66.1',
    userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    crawler: { enabled: true, families: ['google'], familyCidrs: { google: ['66.249.64.0/19'] } },
  });
  assert.equal(result.verified, true);
  assert.equal(result.family, 'google');
  assert.equal(result.reason, 'cidr_match');
});

test('verifies a crawler via Cloudflare verified-bot signal when allowed', async () => {
  const result = await verifyCrawlerRequest({
    ip: '203.0.113.10',
    userAgent: 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
    cloudflareVerifiedBot: true,
    crawler: { enabled: true, families: ['bing'], allowCloudflareVerifiedBot: true, familyCidrs: {} },
  });
  assert.equal(result.verified, true);
  assert.equal(result.reason, 'cloudflare_verified_bot');
});

test('publisher policy callback can allow a server-verified premium user', async () => {
  const decision = await evaluateAccessPolicy(request({ 'x-publisher-premium': '1' }), {
    beforeProtect: ({ request }) =>
      request.headers.get('x-publisher-premium') === '1'
        ? { action: 'allow', reason: 'premium_user' }
        : 'continue',
  });
  assert.deepEqual(decision, { action: 'allow', reason: 'premium_user' });
});

test('trusted CIDR allowlist uses configured trusted IP headers', async () => {
  const decision = await evaluateAccessPolicy(
    request({ 'cf-connecting-ip': '203.0.113.42' }),
    { allowCidrs: ['203.0.113.0/24'], trustedIpHeaders: ['cf-connecting-ip'] }
  );
  assert.deepEqual(decision, { action: 'allow', reason: 'cidr_allowlist' });
});

test('untrusted X-Forwarded-For is ignored when not in trustedIpHeaders', async () => {
  const decision = await evaluateAccessPolicy(
    request({ 'x-forwarded-for': '203.0.113.42' }),
    { allowCidrs: ['203.0.113.0/24'], trustedIpHeaders: ['cf-connecting-ip'] }
  );
  assert.equal(decision.action, 'continue');
});

test('redirect decision passes through', async () => {
  const decision = await evaluateAccessPolicy(request(), {
    beforeProtect: () => ({ action: 'redirect', reason: 'subscribe', redirectUrl: 'https://example.com/x' }),
  });
  assert.equal(decision.action, 'redirect');
  assert.equal(decision.redirectUrl, 'https://example.com/x');
});
