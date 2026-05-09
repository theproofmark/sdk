/**
 * Express adapter for the ShowAd SDK.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type {
  NormalizedRequest,
  ProtectMiddlewareOptions,
  ShowAdConfig,
  VerificationResult,
} from '../types';
import { runProtect } from '../core/protect';
import { parseCookieHeader, getCookieNames } from '../core/cookies';
import { isTokenExpired, validateTokenClaims } from '../core/jwt';
import { validateToken } from '../core/api';

/** Minimal Express-like request shape we depend on. */
interface ExpressLikeRequest extends IncomingMessage {
  originalUrl?: string;
  url?: string;
  protocol?: string;
  secure?: boolean;
  hostname?: string;
  ip?: string;
  ips?: string[];
  cookies?: Record<string, string>;
  query?: Record<string, unknown>;
}

/** Minimal Express-like response shape. */
interface ExpressLikeResponse extends ServerResponse {
  cookie?: (
    name: string,
    value: string,
    options?: Record<string, unknown>
  ) => ExpressLikeResponse;
  redirect?: (status: number, url?: string) => void;
  status?: (code: number) => ExpressLikeResponse;
}

export type ExpressNext = (err?: unknown) => void;
export type ExpressRequestHandler = (
  req: ExpressLikeRequest,
  res: ExpressLikeResponse,
  next: ExpressNext
) => void;

/**
 * Create an Express middleware that protects matching routes.
 */
export function createShowAdMiddleware(
  config: ShowAdConfig,
  options: ProtectMiddlewareOptions = {}
): ExpressRequestHandler {
  return function showAdMiddleware(req, res, next) {
    Promise.resolve()
      .then(async () => {
        const normalized = normalizeExpressRequest(req);
        const result = await runProtect(normalized, config, options);

        for (const cookie of result.setCookies) {
          appendSetCookie(res, cookie);
        }

        if (result.action === 'redirect' && result.redirectUrl) {
          if (typeof res.redirect === 'function') {
            res.redirect(302, result.redirectUrl);
            return;
          }
          res.statusCode = 302;
          res.setHeader('Location', result.redirectUrl);
          res.end();
          return;
        }

        next();
      })
      .catch(next);
  };
}

/** Inspect the cookies on an Express request and return verification status. */
export async function verifyExpressRequest(
  req: ExpressLikeRequest,
  config: ShowAdConfig
): Promise<VerificationResult> {
  const cookies = readCookies(req);
  const names = getCookieNames(config.cookiePrefix);
  const token = cookies[names.token];
  const fingerprint = cookies[names.fingerprint];

  if (!token) {
    return { verified: false, reason: 'no_token' };
  }
  if (isTokenExpired(token)) {
    return { verified: false, reason: 'expired_token' };
  }
  const validation = validateTokenClaims(token, config.creatorHash, fingerprint || null);
  if (!validation.valid) {
    return {
      verified: false,
      reason:
        validation.reason === 'expired'
          ? 'expired_token'
          : validation.reason === 'creator_mismatch'
            ? 'creator_mismatch'
            : validation.reason === 'fingerprint_mismatch'
              ? 'fingerprint_mismatch'
              : 'invalid_token',
    };
  }
  try {
    await validateToken(config, token);
  } catch {
    return { verified: false, reason: 'invalid_token' };
  }
  return {
    verified: true,
    reason: 'valid_token',
    token,
    creatorHash: config.creatorHash,
  };
}

function normalizeExpressRequest(req: ExpressLikeRequest): NormalizedRequest {
  const headers = normalizeHeaders(req.headers);
  const cookies = readCookies(req);
  const isHttps = inferHttps(req, headers);
  const fullUrl = buildFullUrl(req, headers, isHttps);
  const parsed = new URL(fullUrl);

  return {
    headers,
    cookies,
    ip: resolveSocketIp(req),
    pathname: parsed.pathname,
    searchParams: parsed.searchParams,
    url: fullUrl,
    method: (req.method || 'GET').toUpperCase(),
    isHttps,
  };
}

function normalizeHeaders(
  headers: IncomingMessage['headers']
): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (Array.isArray(value)) {
      out[key.toLowerCase()] = value.join(', ');
    } else if (typeof value === 'string') {
      out[key.toLowerCase()] = value;
    }
  }
  return out;
}

function readCookies(req: ExpressLikeRequest): Record<string, string> {
  if (req.cookies && typeof req.cookies === 'object') return req.cookies;
  return parseCookieHeader(req.headers.cookie);
}

function inferHttps(
  req: ExpressLikeRequest,
  headers: Record<string, string | undefined>
): boolean {
  if (req.secure === true) return true;
  if (req.protocol === 'https') return true;
  const xfProto = headers['x-forwarded-proto'];
  if (xfProto && xfProto.split(',')[0]?.trim().toLowerCase() === 'https') return true;
  return false;
}

function buildFullUrl(
  req: ExpressLikeRequest,
  headers: Record<string, string | undefined>,
  isHttps: boolean
): string {
  const path = req.originalUrl || req.url || '/';
  const host = headers['host'] || req.hostname || 'localhost';
  const scheme = isHttps ? 'https' : 'http';
  try {
    return new URL(path, `${scheme}://${host}`).toString();
  } catch {
    return `${scheme}://${host}${path.startsWith('/') ? path : `/${path}`}`;
  }
}

function resolveSocketIp(req: ExpressLikeRequest): string | null {
  if (req.ip) return req.ip;
  const remote = req.socket?.remoteAddress;
  if (!remote) return null;
  return remote.replace(/^::ffff:/, '');
}

function appendSetCookie(res: ExpressLikeResponse, cookie: string): void {
  const existing = res.getHeader('Set-Cookie');
  if (!existing) {
    res.setHeader('Set-Cookie', cookie);
    return;
  }
  if (Array.isArray(existing)) {
    res.setHeader('Set-Cookie', [...existing, cookie]);
    return;
  }
  res.setHeader('Set-Cookie', [String(existing), cookie]);
}
