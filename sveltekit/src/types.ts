/**
 * ShowAd SvelteKit SDK - Types
 */

import type { AccessPolicyOptions } from './core/access-policy';

/** Server-side configuration for the SDK. */
export interface ShowAdConfig {
  /** Creator hash (public, identifies the creator). */
  creatorHash: string;
  /** API key (secret, server-side only). */
  apiKey: string;
  /** Redirect ticket secret (secret, used to claim tickets). */
  redirectSecret: string;
  /** Backend API base URL. @default https://ad.proofmark.io */
  apiBaseUrl?: string;
  /** Video ad frontend URL. @default https://showad.proofmark.io */
  videoAdUrl?: string;
  /** Cookie name prefix. @default showad */
  cookiePrefix?: string;
  /** Cookie max-age (seconds). @default 3600 */
  cookieMaxAge?: number;
  /** Force the Secure cookie attribute regardless of request scheme. */
  secure?: boolean;
  /** Enable verbose debug logs. */
  debug?: boolean;
}

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

export interface ClaimTicketRequest {
  creator_hash: string;
}

export interface ClaimTicketResponse {
  creator_hash: string;
  ticket_id: string;
  token: string;
  header_name: string;
  scheme: string;
  destination_url: string;
  require_jwt: boolean;
}

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

export type VerificationFailureReason =
  | 'no_fingerprint'
  | 'no_token'
  | 'expired_token'
  | 'invalid_token'
  | 'creator_mismatch'
  | 'fingerprint_mismatch'
  | 'ticket_claim_failed'
  | 'no_verification';

export interface VerificationResult {
  verified: boolean;
  reason?: VerificationFailureReason | 'valid_token';
  token?: string;
  creatorHash?: string;
}

export interface ShowAdHandleOptions {
  /** Glob-style paths to protect (`*` wildcard). */
  protectedPaths?: string[];
  /** Glob-style paths excluded from protection. */
  excludePaths?: string[];
  /** Called when verification fails (informational). */
  onVerificationFailed?: (reason: VerificationFailureReason) => void;
  /** Server-only access policy evaluated before ticket/token logic. */
  accessPolicy?: AccessPolicyOptions;
}

export enum ShowAdErrorCode {
  TICKET_NOT_FOUND = 'TICKET_NOT_FOUND',
  TICKET_EXPIRED = 'TICKET_EXPIRED',
  TICKET_CLAIM_FAILED = 'TICKET_CLAIM_FAILED',
  TOKEN_INVALID = 'TOKEN_INVALID',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  CREATOR_MISMATCH = 'CREATOR_MISMATCH',
  NETWORK_ERROR = 'NETWORK_ERROR',
  CONFIG_ERROR = 'CONFIG_ERROR',
}

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

/**
 * Minimal RequestEvent shape consumed by the SDK. Compatible with SvelteKit's
 * `RequestEvent` but typed locally so the SDK does not require `@sveltejs/kit`
 * to compile.
 */
export interface RequestEventLike {
  request: Request;
  url: URL;
  cookies?: SvelteKitCookiesLike;
  getClientAddress?: () => string;
  locals?: Record<string, unknown>;
}

export interface SvelteKitCookiesLike {
  get(name: string): string | undefined;
  set(name: string, value: string, opts: CookieSetOptions): void;
  delete(name: string, opts: CookieSetOptions): void;
}

export interface CookieSetOptions {
  path: string;
  maxAge?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'strict' | 'lax' | 'none';
  expires?: Date;
}

export type ResolveLike = (event: RequestEventLike) => Response | Promise<Response>;

export type ShowAdHandle = (input: {
  event: RequestEventLike;
  resolve: ResolveLike;
}) => Promise<Response>;
