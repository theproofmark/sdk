import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  evaluateAccessPolicy,
  isIpInCidrs,
  verifyCrawlerRequest,
} from '../dist/runtime/server/core/access-policy.js'

function request(headers = {}, pathname = '/premium/story') {
  return {
    headers: new Headers(headers),
    url: new URL(`https://publisher.example${pathname}`),
    pathname,
  }
}

test('matches IPv4 CIDR ranges', () => {
  assert.equal(isIpInCidrs('203.0.113.42', ['203.0.113.0/24']), true)
  assert.equal(isIpInCidrs('198.51.100.42', ['203.0.113.0/24']), false)
})

test('matches IPv6 CIDR ranges', () => {
  assert.equal(isIpInCidrs('2001:db8::1', ['2001:db8::/32']), true)
  assert.equal(isIpInCidrs('2002:db8::1', ['2001:db8::/32']), false)
})

test('does not verify a crawler from user-agent alone', async () => {
  const result = await verifyCrawlerRequest({
    ip: '198.51.100.10',
    userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    crawler: {
      enabled: true,
      families: ['google'],
      familyCidrs: { google: ['66.249.64.0/19'] },
    },
  })
  assert.equal(result.verified, false)
  assert.equal(result.reason, 'ip_not_verified')
})

test('verifies a crawler when user-agent and trusted IP range match', async () => {
  const result = await verifyCrawlerRequest({
    ip: '66.249.66.1',
    userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    crawler: {
      enabled: true,
      families: ['google'],
      familyCidrs: { google: ['66.249.64.0/19'] },
    },
  })
  assert.equal(result.verified, true)
  assert.equal(result.family, 'google')
})

test('crawler verification disabled when policy is missing', async () => {
  const result = await verifyCrawlerRequest({ ip: '66.249.66.1', userAgent: 'Googlebot' })
  assert.equal(result.verified, false)
  assert.equal(result.reason, 'disabled')
})

test('cloudflare verified bot bypass requires both flag and policy opt-in', async () => {
  const optedIn = await verifyCrawlerRequest({
    ip: '1.1.1.1',
    userAgent: 'Googlebot',
    cloudflareVerifiedBot: true,
    crawler: { enabled: true, allowCloudflareVerifiedBot: true, families: ['google'] },
  })
  assert.equal(optedIn.verified, true)
  assert.equal(optedIn.reason, 'cloudflare_verified_bot')

  const noFlag = await verifyCrawlerRequest({
    ip: '1.1.1.1',
    userAgent: 'Googlebot',
    cloudflareVerifiedBot: true,
    crawler: { enabled: true, families: ['google'] },
  })
  assert.equal(noFlag.verified, false)
})

test('publisher policy callback can allow a server-verified premium user', async () => {
  const decision = await evaluateAccessPolicy(request({ 'x-publisher-premium': '1' }), {
    beforeProtect: ({ request }) => {
      return request.headers.get('x-publisher-premium') === '1'
        ? { action: 'allow', reason: 'premium_user' }
        : 'continue'
    },
  })
  assert.deepEqual(decision, { action: 'allow', reason: 'premium_user' })
})

test('trusted CIDR allowlist uses configured trusted IP headers', async () => {
  const decision = await evaluateAccessPolicy(
    request({ 'cf-connecting-ip': '203.0.113.42' }),
    {
      allowCidrs: ['203.0.113.0/24'],
      trustedIpHeaders: ['cf-connecting-ip'],
    },
  )
  assert.deepEqual(decision, { action: 'allow', reason: 'cidr_allowlist' })
})

test('returns continue when nothing matches', async () => {
  const decision = await evaluateAccessPolicy(request({}), {})
  assert.deepEqual(decision, { action: 'continue' })
})

test('reverse DNS verifier can pass crawler', async () => {
  const result = await verifyCrawlerRequest({
    ip: '8.8.8.8',
    userAgent: 'Googlebot/2.1',
    crawler: {
      enabled: true,
      families: ['google'],
      reverseDnsVerifier: async (_ip, family) => family === 'google',
    },
  })
  assert.equal(result.verified, true)
  assert.equal(result.reason, 'reverse_dns_match')
})
