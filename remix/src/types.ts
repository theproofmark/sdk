/**
 * ShowAd Remix SDK - shared types.
 */

import type { AccessPolicyOptions } from './core/access-policy';

/**
 * Server-side configuration for the SDK.
 *
 * `apiKey` and `redirectSecret` MUST stay server-side. Loaders and
 * `entry.server.tsx` are server-only, so these can be referenced freely there.
 */
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

/** Decoded JWT claims emitted by the ShowAd backend. */
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

/** Request payload for claiming a redirect ticket. */
export interface ClaimTicketRequest {
  creator_hash: string;
}

/** Response from claiming a redirect ticket. */
export interface ClaimTicketResponse {
  creator_hash: string;
  ticket_id: string;
  token: string;
  header_name: string;
  scheme: string;
  destination_url: string;
  require_jwt: boolean;
}

/** Response from `/api/sdk/validate`. */
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

/** Verification result returned by helper inspectors. */
export interface VerificationResult {
  verified: boolean;
  reason?:
    | 'valid_token'
    | 'no_token'
    | 'expired_token'
    | 'invalid_token'
    | 'creator_mismatch'
    | 'fingerprint_mismatch'
    | 'error';
  token?: string;
  creatorHash?: string;
}

/** Options for the protect helpers. */
export interface ProtectOptions {
  /** Glob-style paths to protect. */
  protectedPaths?: string[];
  /** Glob-style paths to exclude. */
  excludePaths?: string[];
  /** Called when verification fails (informational). */
  onVerificationFailed?: (reason: string) => void;
  /** Server-only access policy evaluated before ticket/token logic. */
  accessPolicy?: AccessPolicyOptions;
}

/** Error codes emitted by the SDK. */
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

/** SDK error class. */
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
