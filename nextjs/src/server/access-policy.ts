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

export interface AccessPolicyContext<RequestLike = unknown> {
  request: RequestLike;
  pathname: string;
  clientIp: string | null;
  userAgent: string;
}

export interface AccessPolicyOptions<RequestLike = unknown> {
  trustedIpHeaders?: string[];
  allowCidrs?: string[];
  crawler?: CrawlerPolicy;
  beforeProtect?: (
    context: AccessPolicyContext<RequestLike>
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

type HeaderLike = {
  get(name: string): string | null;
};

type RequestLike = {
  headers?: HeaderLike;
  nextUrl?: { pathname?: string };
  ip?: string;
};

const crawlerUserAgents: Record<CrawlerFamily, RegExp[]> = {
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

export async function evaluateAccessPolicy<RequestT extends RequestLike>(
  request: RequestT,
  options: AccessPolicyOptions<RequestT> = {}
): Promise<Exclude<AccessPolicyDecision, AccessPolicyAction>> {
  const context: AccessPolicyContext<RequestT> = {
    request,
    pathname: request.nextUrl?.pathname || '/',
    clientIp: getClientIp(request, options.trustedIpHeaders || []),
    userAgent: getHeader(request.headers, 'user-agent') || '',
  };

  const crawler = await verifyCrawlerRequest({
    ip: context.clientIp,
    userAgent: context.userAgent,
    cloudflareVerifiedBot: parseBooleanHeader(
      getHeader(request.headers, 'cf-verified-bot') ||
        getHeader(request.headers, 'x-proofmark-cf-verified-bot')
    ),
    crawler: options.crawler,
  });

  if (crawler.verified) {
    return { action: 'allow', reason: `crawler:${crawler.family}` };
  }

  if (context.clientIp && isIpInCidrs(context.clientIp, options.allowCidrs || [])) {
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

export function isIpInCidrs(ip: string, cidrs: string[]): boolean {
  return cidrs.some((cidr) => ipMatchesCidr(ip, cidr));
}

export function getClientIp(request: RequestLike, trustedIpHeaders: string[] = []): string | null {
  for (const header of trustedIpHeaders) {
    const value = firstHeaderValue(getHeader(request.headers, header));
    if (value) {
      return value;
    }
  }

  return request.ip || null;
}

function detectCrawlerFamily(
  userAgent: string,
  allowedFamilies: CrawlerFamily[] = Object.keys(crawlerUserAgents) as CrawlerFamily[]
): CrawlerFamily | null {
  return allowedFamilies.find((family) => {
    return crawlerUserAgents[family]?.some((pattern) => pattern.test(userAgent));
  }) || null;
}

function normalizeDecision(decision: AccessPolicyDecision): Exclude<AccessPolicyDecision, AccessPolicyAction> {
  if (typeof decision === 'string') {
    return { action: decision };
  }

  return decision;
}

function getHeader(headers: HeaderLike | undefined, name: string): string | null {
  return headers?.get(name) || headers?.get(name.toLowerCase()) || null;
}

function firstHeaderValue(value: string | null): string | null {
  return value?.split(',')[0]?.trim() || null;
}

function parseBooleanHeader(value: string | null): boolean {
  return ['1', 'true', 'yes', 'on'].includes((value || '').toLowerCase());
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
  let value = ip.trim();
  // Strip IPv6 zone identifier (e.g. fe80::1%eth0)
  const zoneIdx = value.indexOf('%');
  if (zoneIdx !== -1) {
    value = value.slice(0, zoneIdx);
  }
  if (value.includes(':')) {
    return parseIpv6(value);
  }

  return parseIpv4(value);
}

function parseIpv4(ip: string): { value: bigint; bits: 32 } | null {
  const parts = ip.split('.');
  if (parts.length !== 4) {
    return null;
  }

  let value = 0n;
  for (const part of parts) {
    if (!/^\d+$/.test(part)) {
      return null;
    }
    const byte = Number(part);
    if (byte < 0 || byte > 255) {
      return null;
    }
    value = (value << 8n) + BigInt(byte);
  }

  return { value, bits: 32 };
}

function parseIpv6(ip: string): { value: bigint; bits: 128 } | null {
  const [head = '', tail = ''] = ip.toLowerCase().split('::');
  if (ip.split('::').length > 2) {
    return null;
  }

  const headParts = splitIpv6Part(head);
  const tailParts = splitIpv6Part(tail);
  if (!headParts || !tailParts) {
    return null;
  }

  const missing = 8 - headParts.length - tailParts.length;
  if ((ip.includes('::') && missing < 0) || (!ip.includes('::') && missing !== 0)) {
    return null;
  }

  const parts = [...headParts, ...Array(Math.max(missing, 0)).fill(0), ...tailParts];
  if (parts.length !== 8) {
    return null;
  }

  let value = 0n;
  for (const part of parts) {
    value = (value << 16n) + BigInt(part);
  }

  return { value, bits: 128 };
}

function splitIpv6Part(part: string): number[] | null {
  if (!part) {
    return [];
  }

  const segments = part.split(':');
  const result: number[] = [];
  for (const segment of segments) {
    if (!/^[0-9a-f]{1,4}$/.test(segment)) {
      return null;
    }
    result.push(parseInt(segment, 16));
  }

  return result;
}
