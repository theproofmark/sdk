/**
 * Test-only Nitro plugin: monkey-patch global fetch to stub backend calls.
 * The stub recognises ShowAd backend endpoints by URL prefix (configured in
 * nuxt.config.ts apiBaseUrl). Behaviour is controlled via the request body so
 * tests can simulate success / failure without restarting the server.
 */

// @ts-expect-error - Nitro provides this at runtime
import { defineNitroPlugin } from '#imports'

function base64Url(buf: Buffer | string): string {
  const b = typeof buf === 'string' ? Buffer.from(buf, 'utf8') : buf
  return b.toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
}

function makeJwt(claims: Record<string, unknown>): string {
  const header = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = base64Url(JSON.stringify(claims))
  return `${header}.${payload}.sig`
}

function decodeJwtPart(token: string, index: number): Record<string, unknown> | null {
  try {
    const part = token.split('.')[index]
    if (!part) return null
    const normalized = part.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as Record<string, unknown>
  }
  catch {
    return null
  }
}

export default defineNitroPlugin(() => {
  const realFetch = globalThis.fetch

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    if (url.includes('stub.invalid')) {
      const body = init?.body ? JSON.parse(String(init.body)) : {}
      const headers = new Headers(init?.headers as HeadersInit)

      if (url.includes('/api/redirect-ticket/')) {
        const secret = headers.get('X-Redirect-Ticket-Secret')
        if (secret !== 'redirect_test') {
          return new Response(JSON.stringify({ error: 'invalid secret' }), { status: 401 })
        }
        const ticketId = url.match(/redirect-ticket\/([^/]+)\/claim/)?.[1] || ''
        if (ticketId === 'expired') {
          return new Response(JSON.stringify({ error: 'gone' }), { status: 410 })
        }
        if (ticketId === 'wrong_creator') {
          return new Response(JSON.stringify({
            creator_hash: 'someone_else',
            ticket_id: ticketId,
            token: makeJwt({
              creator_hash: 'someone_else',
              fingerprint: 'fp123',
              exp: Math.floor(Date.now() / 1000) + 3600,
            }),
          }), { status: 200 })
        }
        return new Response(JSON.stringify({
          creator_hash: body.creator_hash,
          ticket_id: ticketId,
          token: makeJwt({
            creator_hash: body.creator_hash,
            fingerprint: 'fp123',
            session_hash: 'sess1',
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + 3600,
            iss: 'showad-backend',
          }),
        }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      if (url.includes('/api/sdk/validate')) {
        const token = String(body.token || '')
        const header = decodeJwtPart(token, 0)
        const claims = decodeJwtPart(token, 1)
        if (header?.alg === 'none') {
          return new Response(JSON.stringify({ valid: false, message: 'bad signature' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        }
        return new Response(JSON.stringify({
          valid: true,
          message: 'ok',
          creator_hash: claims?.creator_hash,
          fingerprint: claims?.fingerprint,
        }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
    }
    return realFetch(input as RequestInfo, init)
  }) as typeof fetch
})
