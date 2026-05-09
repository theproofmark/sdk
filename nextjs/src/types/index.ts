/**
 * ShowAd Next.js SDK Types
 */

/**
 * Client-side SDK Configuration (no secrets)
 * Used in ShowAdProvider on client components
 */
export interface ShowAdClientConfig {
  /**
   * Creator hash - unique identifier for the creator
   * Obtained from the ShowAd dashboard
   */
  creatorHash: string;

  /**
   * Base URL of the ShowAd backend
   * @default 'https://ad.proofmark.io'
   */
  apiBaseUrl?: string;

  /**
   * URL to redirect users to watch video ads
   * @default 'https://showad.proofmark.io'
   */
  videoAdUrl?: string;

  /**
   * Cookie name prefix for SDK cookies
   * @default 'showad'
   */
  cookiePrefix?: string;

  /**
   * Cookie expiry in seconds
   * @default 3600 (1 hour)
   */
  cookieMaxAge?: number;

  /**
   * Enable debug logging
   * @default false
   */
  debug?: boolean;
}

/**
 * Full SDK Configuration (with secrets)
 * Used server-side in middleware
 * @deprecated Use ShowAdServerConfig for server-side
 */
export interface ShowAdConfig extends ShowAdClientConfig {
  /**
   * API Key - secret key for authentication
   * @server-only Do NOT use on client side
   */
  apiKey: string;

  /**
   * Redirect ticket secret
   * @server-only Do NOT use on client side
   */
  redirectSecret?: string;
}

/**
 * Verification state for a visitor
 */
export interface VerificationState {
  /** Whether the visitor is verified to access content */
  isVerified: boolean;
  /** Whether verification is in progress */
  isLoading: boolean;
  /** Error message if verification failed */
  error: string | null;
  /** Creator hash associated with this verification */
  creatorHash: string | null;
  /** Fingerprint of the visitor (from cookie) */
  fingerprint: string | null;
  /** Redirect ticket ID if present */
  redirectTicketId: string | null;
  /** Expiry timestamp of the verification (ms) */
  expiresAt: number | null;
}

/**
 * Cookie data stored for verification
 */
export interface ShowAdCookieData {
  /** Visitor fingerprint */
  fingerprint: string;
  /** Redirect ticket ID */
  redirectTicketId: string | null;
  /** JWT token for verification */
  token: string | null;
  /** Creator hash */
  creatorHash: string;
  /** Timestamp when cookie was created */
  createdAt: number;
  /** Expiry timestamp */
  expiresAt: number | null;
}

/**
 * Request payload for claiming a redirect ticket
 */
export interface ClaimTicketRequest {
  creator_hash: string;
}

/**
 * Response from claiming a redirect ticket
 */
export interface ClaimTicketResponse {
  creator_hash: string;
  ticket_id: string;
  token: string;
  header_name: string;
  scheme: string;
  destination_url: string;
  require_jwt: boolean;
}

/**
 * Response from validating a token
 */
export interface ValidateTokenResponse {
  valid: boolean;
  message: string;
  creator_hash?: string;
  project_hash?: string;
  resource_hash?: string;
  resource_type?: string;
  destination_url?: string;
  fingerprint?: string;
  ip_address?: string;
}

/**
 * JWT Claims structure (decoded from token)
 */
export interface ShowAdJWTClaims {
  fingerprint: string;
  ip_address: string;
  creator_hash: string;
  session_hash: string;
  iat: number;
  exp: number;
  nbf: number;
  iss: string;
}

/**
 * Fingerprint data collected from the browser
 */
export interface FingerprintData {
  visitorId: string;
  confidenceScore?: number;
  rawJSON?: string;
}

/**
 * Middleware verification result
 */
export interface MiddlewareVerificationResult {
  verified: boolean;
  reason?: 'valid_token' | 'no_ticket' | 'invalid_ticket' | 'expired_token' | 'creator_mismatch' | 'error';
  redirectUrl?: string;
  token?: string;
  creatorHash?: string;
}

/**
 * Options for the protect middleware
 */
export interface ProtectMiddlewareOptions {
  /**
   * Paths to protect (glob patterns supported)
   * @example ['/protected/*', '/premium/*']
   */
  protectedPaths?: string[];

  /**
   * Paths to exclude from protection
   * @example ['/api/*', '/public/*']
   */
  excludePaths?: string[];

  /**
   * Called when verification fails
   */
  onVerificationFailed?: (reason: string) => void;

  /**
   * Server-only access policy that runs before ShowAd verification.
   * Use to allow verified crawlers, trusted IP ranges, or your own
   * authenticated/premium users without forcing the ad flow.
   */
  accessPolicy?: import('../server/access-policy').AccessPolicyOptions<
    import('next/server').NextRequest
  >;
}

/**
 * Error codes from the SDK
 */
export enum ShowAdErrorCode {
  FINGERPRINT_FAILED = 'FINGERPRINT_FAILED',
  TICKET_NOT_FOUND = 'TICKET_NOT_FOUND',
  TICKET_EXPIRED = 'TICKET_EXPIRED',
  TICKET_CLAIM_FAILED = 'TICKET_CLAIM_FAILED',
  TOKEN_INVALID = 'TOKEN_INVALID',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  CREATOR_MISMATCH = 'CREATOR_MISMATCH',
  NETWORK_ERROR = 'NETWORK_ERROR',
  CONFIG_ERROR = 'CONFIG_ERROR',
}

/**
 * SDK Error class
 */
export class ShowAdError extends Error {
  code: ShowAdErrorCode;
  details?: Record<string, unknown>;

  constructor(code: ShowAdErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'ShowAdError';
    this.code = code;
    this.details = details;
  }
}
