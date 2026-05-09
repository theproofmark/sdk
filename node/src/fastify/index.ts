/**
 * Fastify plugin for the ShowAd SDK.
 */

import type {
  NormalizedRequest,
  ProtectMiddlewareOptions,
  ShowAdConfig,
} from '../types';
import { runProtect } from '../core/protect';
import { parseCookieHeader } from '../core/cookies';

interface FastifyHeadersLike {
  [key: string]: string | string[] | undefined;
}

interface FastifyRequestLike {
  headers: FastifyHeadersLike;
  url: string;
  method: string;
  ip?: string;
  hostname?: string;
  protocol?: string;
  socket?: { remoteAddress?: string };
  cookies?: Record<string, string>;
}

interface FastifyReplyLike {
  header: (name: string, value: string | string[]) => FastifyReplyLike;
  getHeader?: (name: string) => string | string[] | undefined;
  redirect: ((url: string) => FastifyReplyLike) & ((code: number, url: string) => FastifyReplyLike);
}

interface FastifyInstanceLike {
  addHook: (
    name: 'onRequest',
    handler: (request: FastifyRequestLike, reply: FastifyReplyLike) => Promise<void>
  ) => void;
}

export interface ShowAdPluginOptions extends ProtectMiddlewareOptions {
  config: ShowAdConfig;
}

/**
 * Fastify plugin. Register with `fastify.register(showAdPlugin, { config, ... })`.
 */
export const showAdPlugin = async function showAdPlugin(
  fastify: FastifyInstanceLike,
  opts: ShowAdPluginOptions
): Promise<void> {
  if (!opts || !opts.config) {
    throw new Error('@showad/node-sdk: showAdPlugin requires `config`');
  }
  const { config, ...options } = opts;

  fastify.addHook('onRequest', async (request, reply) => {
    const normalized = normalizeFastifyRequest(request);
    const result = await runProtect(normalized, config, options);

    for (const cookie of result.setCookies) {
      appendSetCookie(reply, cookie);
    }

    if (result.action === 'redirect' && result.redirectUrl) {
      reply.redirect(302, result.redirectUrl);
    }
  });
};

function normalizeFastifyRequest(request: FastifyRequestLike): NormalizedRequest {
  const headers = normalizeHeaders(request.headers);
  const cookies = request.cookies && typeof request.cookies === 'object'
    ? request.cookies
    : parseCookieHeader(typeof headers['cookie'] === 'string' ? headers['cookie'] : undefined);

  const isHttps = inferHttps(request, headers);
  const path = request.url || '/';
  const host = headers['host'] || request.hostname || 'localhost';
  const scheme = isHttps ? 'https' : 'http';
  let fullUrl: string;
  try {
    fullUrl = new URL(path, `${scheme}://${host}`).toString();
  } catch {
    fullUrl = `${scheme}://${host}${path.startsWith('/') ? path : `/${path}`}`;
  }
  const parsed = new URL(fullUrl);

  return {
    headers,
    cookies,
    ip: resolveIp(request),
    pathname: parsed.pathname,
    searchParams: parsed.searchParams,
    url: fullUrl,
    method: (request.method || 'GET').toUpperCase(),
    isHttps,
  };
}

function normalizeHeaders(headers: FastifyHeadersLike): Record<string, string | undefined> {
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

function inferHttps(
  request: FastifyRequestLike,
  headers: Record<string, string | undefined>
): boolean {
  if (request.protocol === 'https') return true;
  const xfProto = headers['x-forwarded-proto'];
  if (xfProto && xfProto.split(',')[0]?.trim().toLowerCase() === 'https') return true;
  return false;
}

function resolveIp(request: FastifyRequestLike): string | null {
  if (request.ip) return request.ip;
  const remote = request.socket?.remoteAddress;
  if (!remote) return null;
  return remote.replace(/^::ffff:/, '');
}

function appendSetCookie(reply: FastifyReplyLike, cookie: string): void {
  const existing = reply.getHeader ? reply.getHeader('set-cookie') : undefined;
  if (!existing) {
    reply.header('set-cookie', cookie);
    return;
  }
  if (Array.isArray(existing)) {
    reply.header('set-cookie', [...existing, cookie]);
    return;
  }
  reply.header('set-cookie', [String(existing), cookie]);
}
