/**
 * App Proxy: GET/POST /apps/showad-gate/proxy/state
 *
 * The storefront block JS calls this to get a verdict for the current
 * visitor. Because Shopify strips Cookie/Set-Cookie on app-proxy requests,
 * the JS reads `showad_token` and `showad_fingerprint` from
 * `document.cookie` (set on the merchant's storefront origin) and forwards
 * them either as query params (GET) or in a JSON body (POST).
 *
 * Returns JSON: { verified, reason, redirectUrl }.
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { verifyAppProxyRequest } from '~/lib/shopify-proxy-hmac';
import { getShopConfig, getShopFromQuery, pathMatches } from '~/lib/shop-config';
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
  if (!config || !config.creatorHash || !config.apiKey || !config.redirectSecret) {
    return json({ error: 'app_not_configured' }, { status: 503 });
  }

  const body = await readBody(request);

  const protectedPath =
    body.protected_path || url.searchParams.get('protected_path') || '/';
  if (config.protectedPaths.length > 0) {
    const isProtected =
      pathMatches(protectedPath, config.protectedPaths) &&
      !pathMatches(protectedPath, config.excludedPaths);
    if (!isProtected) {
      return jsonNoStore({ verified: true, reason: 'path_not_protected', redirectUrl: null });
    }
  }

  const returnUrl =
    body.return_url ||
    url.searchParams.get('return_url') ||
    `https://${shop}${protectedPath}`;

  const result = await protect(
    {
      apiKey: config.apiKey,
      creatorHash: config.creatorHash,
      redirectSecret: config.redirectSecret,
      apiBaseUrl: config.apiBaseUrl,
      videoAdUrl: config.videoAdUrl,
    },
    {
      token: body.token || url.searchParams.get('token'),
      fingerprint: body.fingerprint || url.searchParams.get('fingerprint'),
      returnUrl,
    }
  );

  return jsonNoStore({
    verified: result.verified,
    reason: result.reason,
    redirectUrl: result.redirectUrl ?? null,
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
    // Ignore; treat as empty body.
  }
  return {};
}

function jsonNoStore(body: unknown) {
  return json(body, {
    headers: { 'Cache-Control': 'private, no-store' },
  });
}
