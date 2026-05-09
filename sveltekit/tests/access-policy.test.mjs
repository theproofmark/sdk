import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  evaluateAccessPolicy,
  isIpInCidrs,
  verifyCrawlerRequest,
} from '../dist/access-policy.mjs';

function event({ headers = {}, ip = null, pathname = '/premium/story' } = {}) {
  return {
    request: { headers: new Headers(headers) },
    url: new URL(`https://publisher.example${pathname}`),
    getClientAddress: ip ? () => ip : undefined,
  };
}

test('matches IPv4 CIDR ranges', () => {
  assert.equal(isIpInCidrs('203.0.113.42', ['203.0.113.0/24']), true);
  assert.equal(isIpInCidrs('198.51.100.42', ['203.0.113.0/24']), false);
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
  assert.equal(result.reason, 'cidr_match');
});

test('verified crawler bypasses access policy', async () => {
  const decision = await evaluateAccessPolicy(
    event({
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      },
      ip: '66.249.66.1',
    }),
    {
      crawler: { enabled: true, families: ['google'], familyCidrs: { google: ['66.249.64.0/19'] } },
    }
  );

  assert.equal(decision.action, 'allow');
  assert.equal(decision.reason, 'crawler:google');
});

test('publisher beforeProtect can allow a server-verified premium user', async () => {
  const decision = await evaluateAccessPolicy(
    event({ headers: { 'x-publisher-premium': '1' } }),
    {
      beforeProtect: ({ request }) => {
        return request.request.headers.get('x-publisher-premium') === '1'
          ? { action: 'allow', reason: 'premium_user' }
          : 'continue';
      },
    }
  );

  assert.deepEqual(decision, { action: 'allow', reason: 'premium_user' });
});

test('trusted CIDR allowlist uses configured trusted IP headers', async () => {
  const decision = await evaluateAccessPolicy(
    event({ headers: { 'cf-connecting-ip': '203.0.113.42' } }),
    {
      allowCidrs: ['203.0.113.0/24'],
      trustedIpHeaders: ['cf-connecting-ip'],
    }
  );

  assert.deepEqual(decision, { action: 'allow', reason: 'cidr_allowlist' });
});

test('returns continue when no rule matches', async () => {
  const decision = await evaluateAccessPolicy(
    event({ headers: { 'user-agent': 'Mozilla/5.0' }, ip: '198.51.100.5' }),
    {}
  );
  assert.deepEqual(decision, { action: 'continue' });
});
