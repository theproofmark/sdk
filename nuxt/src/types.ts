/**
 * Public types for @showad/nuxt
 */

export type AccessPolicyAction = 'allow' | 'continue' | 'redirect'

export type AccessPolicyDecision =
  | AccessPolicyAction
  | {
      action: AccessPolicyAction
      reason?: string
      redirectUrl?: string
    }

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
  | 'linkedin'

export interface CrawlerPolicy {
  enabled?: boolean
  families?: CrawlerFamily[]
  familyCidrs?: Partial<Record<CrawlerFamily, string[]>>
  allowCloudflareVerifiedBot?: boolean
  reverseDnsVerifier?: (ip: string, family: CrawlerFamily) => boolean | Promise<boolean>
}

export interface AccessPolicyContext<RequestLike = unknown> {
  request: RequestLike
  pathname: string
  clientIp: string | null
  userAgent: string
}

export interface AccessPolicyOptions<RequestLike = unknown> {
  trustedIpHeaders?: string[]
  allowCidrs?: string[]
  crawler?: CrawlerPolicy
  beforeProtect?: (
    context: AccessPolicyContext<RequestLike>,
  ) => AccessPolicyDecision | Promise<AccessPolicyDecision>
}

export interface CrawlerVerificationInput {
  ip?: string | null
  userAgent?: string | null
  cloudflareVerifiedBot?: boolean
  crawler?: CrawlerPolicy
}

export interface CrawlerVerificationResult {
  verified: boolean
  family?: CrawlerFamily
  reason:
    | 'disabled'
    | 'no_family_match'
    | 'missing_ip'
    | 'cloudflare_verified_bot'
    | 'cidr_match'
    | 'reverse_dns_match'
    | 'ip_not_verified'
}

export interface ShowAdJWTClaims {
  fingerprint?: string
  ip_address?: string
  creator_hash: string
  session_hash?: string
  iat?: number
  exp?: number
  nbf?: number
  iss?: string
}

export interface ClaimTicketResponse {
  creator_hash: string
  ticket_id: string
  token: string
  header_name?: string
  scheme?: string
  destination_url?: string
  require_jwt?: boolean
}

export interface ValidateTokenResponse {
  valid: boolean
  message?: string
  creator_hash?: string
  fingerprint?: string
  ip_address?: string
}

/**
 * Module options consumed in nuxt.config.ts under the `showad` key.
 *
 * Server-only secrets (apiKey, redirectSecret) MUST be provided through env
 * vars or `runtimeConfig.showad` to avoid bundling them into the client.
 */
export interface ShowAdModuleOptions {
  /** Creator hash from the ShowAd dashboard. */
  creatorHash?: string
  /** Server-only API key. Read from `runtimeConfig.showad.apiKey`. */
  apiKey?: string
  /** Server-only redirect ticket secret. */
  redirectSecret?: string
  /** Backend API base URL. */
  apiBaseUrl?: string
  /** Video ad frontend URL. */
  videoAdUrl?: string
  /** Cookie max age in seconds. */
  cookieMaxAge?: number
  /** Glob patterns for paths that require verification. */
  protectedPaths?: string[]
  /** Glob patterns for paths to exclude from verification. */
  excludePaths?: string[]
  /** Access policy applied before token validation. */
  accessPolicy?: AccessPolicyOptions
  /** Enable debug logging on the server. */
  debug?: boolean
  /** Auto-register the Nitro middleware. Defaults to true. */
  enabled?: boolean
}

export interface ShowAdPublicRuntimeConfig {
  creatorHash: string
  apiBaseUrl: string
  videoAdUrl: string
  cookieMaxAge: number
}

export interface ShowAdPrivateRuntimeConfig {
  apiKey: string
  redirectSecret: string
  protectedPaths: string[]
  excludePaths: string[]
  debug: boolean
  enabled: boolean
}

export interface VerificationState {
  isVerified: boolean
  creatorHash: string | null
  expiresAt: number | null
}
