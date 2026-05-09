import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import { test, before, after } from 'node:test'

import { createTest, fetch as nuxtFetch } from '@nuxt/test-utils/e2e'

const fixtureUrl = new URL('./fixtures/basic/', import.meta.url)
const rootDir = fileURLToPath(fixtureUrl)

const ctx = createTest({
  rootDir,
  server: true,
  browser: false,
  dev: false,
  build: true,
  fixture: '.',
  setupTimeout: 240_000,
  teardownTimeout: 60_000,
})

before(async () => {
  await ctx.beforeAll()
}, { timeout: 240_000 })

after(async () => {
  await ctx.afterAll()
}, { timeout: 60_000 })

function parseSetCookie(headers) {
  const all = []
  if (typeof headers.getSetCookie === 'function') {
    for (const c of headers.getSetCookie()) all.push(c)
  }
  else {
    const single = headers.get('set-cookie')
    if (single) all.push(single)
  }
  return all
}

function cookieValues(rawCookies) {
  const out = {}
  for (const c of rawCookies) {
    const [pair] = c.split(';')
    const [name, ...rest] = pair.split('=')
    out[name.trim()] = rest.join('=')
  }
  return out
}

function base64Url(s) {
  return Buffer.from(s, 'utf8').toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
}

function makeJwt(claims) {
  return `${base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${base64Url(JSON.stringify(claims))}.sig`
}

function makeUnsignedJwt(claims) {
  return `${base64Url(JSON.stringify({ alg: 'none', typ: 'JWT' }))}.${base64Url(JSON.stringify(claims))}.`
}

test('public path is allowed without verification', async () => {
  const res = await nuxtFetch('/', { redirect: 'manual' })
  assert.equal(res.status, 200)
})

test('excluded path bypasses protection', async () => {
  const res = await nuxtFetch('/premium/public', { redirect: 'manual' })
  assert.equal(res.status, 200)
})

test('protected path without token redirects to video ad', async () => {
  const res = await nuxtFetch('/premium/article', { redirect: 'manual' })
  assert.equal(res.status, 302)
  const loc = res.headers.get('location') || ''
  assert.ok(loc.includes('http://video.invalid/c/creator_test'), `unexpected location: ${loc}`)
  assert.ok(loc.includes('return_url='))
  assert.ok(loc.includes('sdk=1'))
})

test('untrusted forwarded IP header does not satisfy access policy', async () => {
  const res = await nuxtFetch('/premium/article', {
    redirect: 'manual',
    headers: { 'x-forwarded-for': '203.0.113.42' },
  })
  assert.equal(res.status, 302)
  const loc = res.headers.get('location') || ''
  assert.ok(loc.includes('http://video.invalid/c/creator_test'))
})

test('configured trusted IP header can satisfy access policy', async () => {
  const res = await nuxtFetch('/premium/article', {
    redirect: 'manual',
    headers: { 'cf-connecting-ip': '203.0.113.42' },
  })
  assert.equal(res.status, 200)
})

test('redirect_ticket without fingerprint redirects back to video ad', async () => {
  const res = await nuxtFetch('/premium/article?redirect_ticket=abc123', { redirect: 'manual' })
  assert.equal(res.status, 302)
  const loc = res.headers.get('location') || ''
  assert.ok(loc.includes('http://video.invalid/c/creator_test'))
})

test('redirect_ticket with fingerprint sets cookies and redirects to clean url', async () => {
  const res = await nuxtFetch('/premium/article?redirect_ticket=ticket-1', {
    redirect: 'manual',
    headers: { cookie: 'showad_fingerprint=fp123' },
  })
  assert.equal(res.status, 302)
  const loc = res.headers.get('location') || ''
  assert.ok(loc.startsWith('/premium/article'), `unexpected loc: ${loc}`)
  assert.ok(!loc.includes('redirect_ticket='))

  const cookies = cookieValues(parseSetCookie(res.headers))
  assert.ok(cookies.showad_token, 'expected showad_token cookie')
  assert.equal(cookies.showad_verified, '1')
  assert.equal(cookies.showad_creator, 'creator_test')
})

test('mismatched creator_hash on claim falls back to video ad redirect', async () => {
  const res = await nuxtFetch('/premium/article?redirect_ticket=wrong_creator', {
    redirect: 'manual',
    headers: { cookie: 'showad_fingerprint=fp123' },
  })
  assert.equal(res.status, 302)
  const loc = res.headers.get('location') || ''
  assert.ok(loc.includes('http://video.invalid/c/creator_test'))
})

test('expired ticket (410) redirects to video ad', async () => {
  const res = await nuxtFetch('/premium/article?redirect_ticket=expired', {
    redirect: 'manual',
    headers: { cookie: 'showad_fingerprint=fp123' },
  })
  assert.equal(res.status, 302)
})

test('valid token cookie allows access', async () => {
  const token = makeJwt({
    creator_hash: 'creator_test',
    fingerprint: 'fp123',
    exp: Math.floor(Date.now() / 1000) + 3600,
    iss: 'showad-backend',
  })
  const res = await nuxtFetch('/premium/article', {
    redirect: 'manual',
    headers: {
      cookie: `showad_fingerprint=fp123; showad_token=${token}; showad_verified=1; showad_creator=creator_test`,
    },
  })
  assert.equal(res.status, 200)
})

test('forged unsigned token cookie redirects when backend validation rejects it', async () => {
  const token = makeUnsignedJwt({
    creator_hash: 'creator_test',
    fingerprint: 'fp123',
    exp: Math.floor(Date.now() / 1000) + 3600,
    iss: 'showad-backend',
  })
  const res = await nuxtFetch('/premium/article', {
    redirect: 'manual',
    headers: {
      cookie: `showad_fingerprint=fp123; showad_token=${token}; showad_verified=1; showad_creator=creator_test`,
    },
  })
  assert.equal(res.status, 302)
  const loc = res.headers.get('location') || ''
  assert.ok(loc.includes('http://video.invalid/c/creator_test'))
})

test('expired token cookie causes redirect', async () => {
  const token = makeJwt({
    creator_hash: 'creator_test',
    fingerprint: 'fp123',
    exp: Math.floor(Date.now() / 1000) - 60,
    iss: 'showad-backend',
  })
  const res = await nuxtFetch('/premium/article', {
    redirect: 'manual',
    headers: {
      cookie: `showad_fingerprint=fp123; showad_token=${token}`,
    },
  })
  assert.equal(res.status, 302)
})

test('token with mismatched creator hash causes redirect', async () => {
  const token = makeJwt({
    creator_hash: 'other_creator',
    fingerprint: 'fp123',
    exp: Math.floor(Date.now() / 1000) + 3600,
  })
  const res = await nuxtFetch('/premium/article', {
    redirect: 'manual',
    headers: {
      cookie: `showad_fingerprint=fp123; showad_token=${token}`,
    },
  })
  assert.equal(res.status, 302)
})
