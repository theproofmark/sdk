/**
 * Framework-free server-side access policy for ShowAd.
 *
 * Pipeline (in order):
 *   1. Verified crawler (UA + trusted IP range OR Cloudflare verified bot OR rDNS)
 *   2. CIDR allowlist resolved from a trusted IP header
 *   3. Publisher-defined `beforeProtect` callback (premium users, app sessions, ...)
 *
 * UA detection alone is NEVER sufficient to bypass.
 */

import net from 'node:net';
import type { NormalizedRequest } from '../types';

export type AccessPolicyAction = 'allow' | 'continue' | 'redirect';

export type AccessPolicyDecision =
  | AccessPolicyAction
  | {
      action: AccessPolicyAction;
      reason?: string;
      redirectUrl?: string;
    };

export type CrawlerFamily =
  | 'google'
  | 'bing'
  | 'duckduckgo'
  | 'yandex'
  | 'baidu'
  | 'openai'
  | 'anthropic'
  | 'perplexity'
  | 'commoncrawl'
  | 'facebook'
  | 'twitter'
  | 'linkedin';

export interface CrawlerPolicy {
  enabled?: boolean;
  families?: CrawlerFamily[];
  familyCidrs?: Partial<Record<CrawlerFamily, string[]>>;
  allowCloudflareVerifiedBot?: boolean;
  reverseDnsVerifier?: (ip: string, family: CrawlerFamily) => boolean | Promise<boolean>;
}

export interface AccessPolicyContext {
  request: NormalizedRequest;
  pathname: string;
  clientIp: string | null;
  userAgent: string;
}

export interface AccessPolicyOptions {
  /** Header names whose first value is trusted as the client IP. */
  trustedIpHeaders?: string[];
  /** CIDRs that are always allowed through (e.g. office IPs, monitoring). */
  allowCidrs?: string[];
  /** Crawler verification policy. */
  crawler?: CrawlerPolicy;
  /** Publisher-defined hook (premium users, app sessions, ...). */
  beforeProtect?: (
    context: AccessPolicyContext
  ) => AccessPolicyDecision | Promise<AccessPolicyDecision>;
}

export interface CrawlerVerificationInput {
  ip?: string | null;
  userAgent?: string | null;
  cloudflareVerifiedBot?: boolean;
  crawler?: CrawlerPolicy;
}

export interface CrawlerVerificationResult {
  verified: boolean;
  family?: CrawlerFamily;
  reason:
    | 'disabled'
    | 'no_family_match'
    | 'missing_ip'
    | 'cloudflare_verified_bot'
    | 'cidr_match'
    | 'reverse_dns_match'
    | 'ip_not_verified';
}

const CRAWLER_USER_AGENTS: Record<CrawlerFamily, RegExp[]> = {
  google: [/googlebot/i, /google-inspectiontool/i, /apis-google/i],
  bing: [/bingbot/i],
  duckduckgo: [/duckduckbot/i],
  yandex: [/yandexbot/i],
  baidu: [/baiduspider/i],
  openai: [/gptbot/i, /chatgpt-user/i, /oai-searchbot/i],
  anthropic: [/claudebot/i, /anthropic-ai/i],
  perplexity: [/perplexitybot/i],
  commoncrawl: [/ccbot/i],
  facebook: [/facebookexternalhit/i, /facebot/i],
  twitter: [/twitterbot/i],
  linkedin: [/linkedinbot/i],
};

export async function evaluateAccessPolicy(
  request: NormalizedRequest,
  options: AccessPolicyOptions = {}
): Promise<Exclude<AccessPolicyDecision, AccessPolicyAction>> {
  const clientIp = getClientIp(request, options.trustedIpHeaders);
  const userAgent = request.headers['user-agent'] || '';

  const context: AccessPolicyContext = {
    request,
    pathname: request.pathname,
    clientIp,
    userAgent,
  };

  const crawler = await verifyCrawlerRequest({
    ip: clientIp,
    userAgent,
    cloudflareVerifiedBot: parseBooleanHeader(
      request.headers['cf-verified-bot'] || request.headers['x-proofmark-cf-verified-bot']
    ),
    crawler: options.crawler,
  });

  if (crawler.verified) {
    return { action: 'allow', reason: `crawler:${crawler.family}` };
  }

  if (clientIp && isIpInCidrs(clientIp, options.allowCidrs || [])) {
    return { action: 'allow', reason: 'cidr_allowlist' };
  }

  if (options.beforeProtect) {
    return normalizeDecision(await options.beforeProtect(context));
  }

  return { action: 'continue' };
}

export async function verifyCrawlerRequest(
  input: CrawlerVerificationInput
): Promise<CrawlerVerificationResult> {
  const policy = input.crawler;
  if (!policy?.enabled) {
    return { verified: false, reason: 'disabled' };
  }

  const family = detectCrawlerFamily(input.userAgent || '', policy.families);
  if (!family) {
    return { verified: false, reason: 'no_family_match' };
  }

  const ip = (input.ip || '').trim();
  if (!ip) {
    return { verified: false, family, reason: 'missing_ip' };
  }

  if (policy.allowCloudflareVerifiedBot && input.cloudflareVerifiedBot) {
    return { verified: true, family, reason: 'cloudflare_verified_bot' };
  }

  if (isIpInCidrs(ip, policy.familyCidrs?.[family] || [])) {
    return { verified: true, family, reason: 'cidr_match' };
  }

  if (policy.reverseDnsVerifier && (await policy.reverseDnsVerifier(ip, family))) {
    return { verified: true, family, reason: 'reverse_dns_match' };
  }

  return { verified: false, family, reason: 'ip_not_verified' };
}

/** True if `ip` is contained in any of the supplied CIDR blocks (IPv4 or IPv6). */
export function isIpInCidrs(ip: string, cidrs: string[]): boolean {
  if (!ip || !cidrs.length) return false;
  const normalized = stripIpv6Zone(ip);
  if (!net.isIP(normalized)) return false;

  const list = new net.BlockList();
  let added = 0;
  for (const cidr of cidrs) {
    if (addCidrToBlockList(list, cidr)) added += 1;
  }
  if (!added) return false;

  const family = net.isIPv6(normalized) ? 'ipv6' : 'ipv4';
  try {
    return list.check(normalized, family);
  } catch {
    return false;
  }
}

/**
 * Resolve the client IP. Reads the first comma-separated value from each
 * configured trusted header in order, falling back to the request IP.
 */
export function getClientIp(
  request: NormalizedRequest,
  trustedIpHeaders: string[] = []
): string | null {
  for (const header of trustedIpHeaders) {
    const value = firstHeaderValue(request.headers[header.toLowerCase()]);
    if (value) return value;
  }
  return request.ip || null;
}

function detectCrawlerFamily(
  userAgent: string,
  allowedFamilies: CrawlerFamily[] = Object.keys(CRAWLER_USER_AGENTS) as CrawlerFamily[]
): CrawlerFamily | null {
  if (!userAgent) return null;
  return (
    allowedFamilies.find((family) =>
      CRAWLER_USER_AGENTS[family]?.some((pattern) => pattern.test(userAgent))
    ) || null
  );
}

function normalizeDecision(
  decision: AccessPolicyDecision
): Exclude<AccessPolicyDecision, AccessPolicyAction> {
  if (typeof decision === 'string') return { action: decision };
  return decision;
}

function firstHeaderValue(value: string | undefined): string | null {
  if (!value) return null;
  const first = value.split(',')[0]?.trim();
  return first || null;
}

function parseBooleanHeader(value: string | undefined): boolean {
  if (!value) return false;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function stripIpv6Zone(ip: string): string {
  const idx = ip.indexOf('%');
  return idx === -1 ? ip : ip.slice(0, idx);
}

function addCidrToBlockList(list: net.BlockList, cidr: string): boolean {
  try {
    const trimmed = cidr.trim();
    if (!trimmed) return false;

    if (!trimmed.includes('/')) {
      const family = net.isIPv6(trimmed) ? 'ipv6' : net.isIPv4(trimmed) ? 'ipv4' : null;
      if (!family) return false;
      list.addAddress(trimmed, family);
      return true;
    }

    const [range, bitsRaw] = trimmed.split('/');
    const bits = Number(bitsRaw);
    if (!Number.isInteger(bits) || bits < 0) return false;
    const family = net.isIPv6(range) ? 'ipv6' : net.isIPv4(range) ? 'ipv4' : null;
    if (!family) return false;
    if (family === 'ipv4' && bits > 32) return false;
    if (family === 'ipv6' && bits > 128) return false;
    list.addSubnet(range, bits, family);
    return true;
  } catch {
    return false;
  }
}
