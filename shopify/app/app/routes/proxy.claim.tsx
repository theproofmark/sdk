/**
 * App Proxy: POST /apps/showad-gate/proxy/claim
 *
 * Called when the visitor returns from the video ad with a redirect_ticket.
 * The storefront JS POSTs `{ redirect_ticket, fingerprint, return_path }`.
 * This route:
 *   1. Verifies the App Proxy HMAC.
 *   2. Calls ProofMark `POST /api/redirect-ticket/:id/claim` with the
 *      server-only redirect secret (never exposed to the storefront).
 *   3. Returns the JWT in JSON for the storefront JS to persist as a
 *      first-party cookie under the merchant's domain.
 *
 * NOTE: Shopify strips Set-Cookie on app-proxy responses, so the JWT cannot
 * be set server-side. The client cookie is therefore JS-readable; mitigate
 * by keeping cookieMaxAge short and the path narrow.
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { verifyAppProxyRequest } from '~/lib/shopify-proxy-hmac';
import { getShopConfig, getShopFromQuery } from '~/lib/shop-config';
import { protect } from '~/lib/proofmark/verify';

export async function loader(args: LoaderFunctionArgs) {
  return handle(args.request);
}

export async function action(args: ActionFunctionArgs) {
  return handle(args.request);
}

async function handle(request: Request) {
  const url = new URL(request.url);

  const hmac = verifyAppProxyRequest(url, process.env.SHOPIFY_API_SECRET || '');
  if (!hmac.valid) {
    return json({ error: 'invalid_signature', reason: hmac.reason }, { status: 401 });
  }

  const shop = getShopFromQuery(url.searchParams);
  if (!shop) return json({ error: 'invalid_shop' }, { status: 400 });

  const config = await getShopConfig(shop);
  if (!config) return json({ error: 'app_not_configured' }, { status: 503 });

  const body = await readBody(request);

  const ticket = body.redirect_ticket || url.searchParams.get('redirect_ticket') || '';
  const fingerprint = body.fingerprint || url.searchParams.get('fingerprint') || '';
  const returnPath = sanitizeReturnPath(body.return_path || url.searchParams.get('return_path'));

  if (!ticket || !/^[A-Za-z0-9_-]{1,128}$/.test(ticket)) {
    return json({ error: 'invalid_ticket' }, { status: 400 });
  }

  const result = await protect(
    {
      apiKey: config.apiKey,
      creatorHash: config.creatorHash,
      redirectSecret: config.redirectSecret,
      apiBaseUrl: config.apiBaseUrl,
      videoAdUrl: config.videoAdUrl,
    },
    {
      redirectTicket: ticket,
      fingerprint,
      returnUrl: `https://${shop}${returnPath}`,
    },
    { /* no access policy needed for ticket claim */ }
  );

  if (!result.verified || !result.token) {
    return jsonNoStore(
      { verified: false, reason: result.reason, redirectUrl: result.redirectUrl ?? null },
      { status: 400 }
    );
  }

  return jsonNoStore({
    verified: true,
    reason: result.reason,
    token: result.token,
    creatorHash: result.creatorHash,
    expiresAt: result.expiresAt,
    cookieMaxAge: config.cookieMaxAge,
    returnPath,
  });
}

async function readBody(request: Request): Promise<Record<string, string>> {
  if (request.method === 'GET' || request.method === 'HEAD') return {};
  const ctype = request.headers.get('content-type') || '';
  try {
    if (ctype.includes('application/json')) {
      const data = (await request.json()) as Record<string, unknown>;
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(data || {})) {
        if (typeof v === 'string') out[k] = v;
      }
      return out;
    }
    if (ctype.includes('application/x-www-form-urlencoded') || ctype.includes('multipart/form-data')) {
      const form = await request.formData();
      const out: Record<string, string> = {};
      for (const [k, v] of form.entries()) out[k] = String(v);
      return out;
    }
  } catch {
    // Treat as empty body on parse error.
  }
  return {};
}

function jsonNoStore(body: unknown, init?: ResponseInit) {
  return json(body, {
    ...init,
    headers: { ...(init?.headers || {}), 'Cache-Control': 'private, no-store' },
  });
}

function sanitizeReturnPath(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/';
  return raw.split(/[\r\n]/)[0].slice(0, 1024);
}
