/**
 * Server-side access policy for ShowAd Remix SDK.
 *
 * Pipeline (in order):
 *   1. Verified crawler (UA + trusted IP range OR Cloudflare verified bot OR rDNS).
 *   2. CIDR allowlist resolved from a trusted IP header.
 *   3. Publisher-defined `beforeProtect` callback (premium users, app sessions, ...).
 *
 * UA detection alone is NEVER sufficient to bypass.
 *
 * Operates on the standard Web `Request` Remix exposes; no framework imports.
 */

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
  request: Request;
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
  request: Request,
  options: AccessPolicyOptions = {}
): Promise<Exclude<AccessPolicyDecision, AccessPolicyAction>> {
  const url = safeParseUrl(request.url);
  const pathname = url?.pathname || '/';
  const clientIp = getClientIp(request, options.trustedIpHeaders || []);
  const userAgent = request.headers.get('user-agent') || '';

  const context: AccessPolicyContext = {
    request,
    pathname,
    clientIp,
    userAgent,
  };

  const crawler = await verifyCrawlerRequest({
    ip: clientIp,
    userAgent,
    cloudflareVerifiedBot: parseBooleanHeader(
      request.headers.get('cf-verified-bot') ||
        request.headers.get('x-proofmark-cf-verified-bot')
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
  return cidrs.some((cidr) => ipMatchesCidr(ip, cidr));
}

/**
 * Resolve the client IP from configured trusted headers.
 *
 * Web `Request` does not expose a peer IP directly, so the publisher must
 * supply at least one trusted header (e.g. `cf-connecting-ip`,
 * `x-forwarded-for`) sourced from a reverse proxy they control.
 */
export function getClientIp(
  request: Request,
  trustedIpHeaders: string[] = []
): string | null {
  for (const header of trustedIpHeaders) {
    const value = firstHeaderValue(request.headers.get(header));
    if (value) return value;
  }
  return null;
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

function firstHeaderValue(value: string | null | undefined): string | null {
  if (!value) return null;
  const first = value.split(',')[0]?.trim();
  return first || null;
}

function parseBooleanHeader(value: string | null | undefined): boolean {
  if (!value) return false;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function safeParseUrl(input: string): URL | null {
  try {
    return new URL(input);
  } catch {
    return null;
  }
}

function ipMatchesCidr(ip: string, cidr: string): boolean {
  const [range, bits] = cidr.split('/');
  const ipParsed = parseIp(ip);
  const rangeParsed = parseIp(range);

  if (!ipParsed || !rangeParsed || ipParsed.bits !== rangeParsed.bits) {
    return false;
  }

  const prefix = bits === undefined ? ipParsed.bits : Number(bits);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > ipParsed.bits) {
    return false;
  }

  const shift = BigInt(ipParsed.bits - prefix);
  return (ipParsed.value >> shift) === (rangeParsed.value >> shift);
}

function parseIp(ip: string): { value: bigint; bits: 32 | 128 } | null {
  const value = stripIpv6Zone(ip.trim());
  if (value.includes(':')) return parseIpv6(value);
  return parseIpv4(value);
}

function stripIpv6Zone(ip: string): string {
  const idx = ip.indexOf('%');
  return idx === -1 ? ip : ip.slice(0, idx);
}

function parseIpv4(ip: string): { value: bigint; bits: 32 } | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;

  let value = 0n;
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return null;
    const byte = Number(part);
    if (byte < 0 || byte > 255) return null;
    value = (value << 8n) + BigInt(byte);
  }

  return { value, bits: 32 };
}

function parseIpv6(ip: string): { value: bigint; bits: 128 } | null {
  const lower = ip.toLowerCase();
  if (lower.split('::').length > 2) return null;

  const [head = '', tail = ''] = lower.split('::');
  const headParts = splitIpv6Part(head);
  const tailParts = splitIpv6Part(tail);
  if (!headParts || !tailParts) return null;

  const missing = 8 - headParts.length - tailParts.length;
  if ((lower.includes('::') && missing < 0) || (!lower.includes('::') && missing !== 0)) {
    return null;
  }

  const parts = [...headParts, ...Array(Math.max(missing, 0)).fill(0), ...tailParts];
  if (parts.length !== 8) return null;

  let value = 0n;
  for (const part of parts) {
    value = (value << 16n) + BigInt(part);
  }

  return { value, bits: 128 };
}

function splitIpv6Part(part: string): number[] | null {
  if (!part) return [];

  const segments = part.split(':');
  const result: number[] = [];
  for (const segment of segments) {
    if (!/^[0-9a-f]{1,4}$/.test(segment)) return null;
    result.push(parseInt(segment, 16));
  }
  return result;
}
