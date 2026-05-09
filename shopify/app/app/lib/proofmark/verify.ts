/**
 * Pure protect() — returns a verdict object given the visitor's token and
 * fingerprint. Caller is responsible for transporting these (Shopify App
 * Proxy strips Set-Cookie / Cookie headers, so the storefront JS reads them
 * from `document.cookie` and forwards them in the request body).
 */

import { isTokenExpired, validateTokenClaims, getTokenExpiry } from './jwt';
import { claimRedirectTicket, validateToken, type ProofMarkApiConfig } from './api';
import { buildVideoAdRedirectUrl } from './url';
import {
  evaluateAccessPolicy,
  type AccessPolicyOptions,
} from './access-policy';

export type VerifyReason =
  | 'valid_token'
  | 'no_token'
  | 'expired_token'
  | 'invalid_token'
  | 'no_fingerprint'
  | 'creator_mismatch'
  | 'ticket_claim_failed'
  | 'access_policy_allow'
  | 'access_policy_redirect';

export interface VerifyResult {
  verified: boolean;
  reason: VerifyReason;
  redirectUrl?: string;
  token?: string | null;
  expiresAt?: number | null;
  ticketId?: string | null;
  creatorHash?: string | null;
}

export interface VerifyContext {
  token?: string | null;
  fingerprint?: string | null;
  redirectTicket?: string | null;
  returnUrl: string;
  request?: {
    headers?: { get(name: string): string | null };
    url?: string;
    nextUrl?: { pathname?: string };
    ip?: string;
  };
}

export interface VerifyOptions {
  accessPolicy?: AccessPolicyOptions;
}

export async function protect(
  apiConfig: ProofMarkApiConfig & { videoAdUrl?: string },
  ctx: VerifyContext,
  opts: VerifyOptions = {}
): Promise<VerifyResult> {
  if (opts.accessPolicy && ctx.request) {
    const decision = await evaluateAccessPolicy(ctx.request, opts.accessPolicy);
    if (decision.action === 'allow') {
      return { verified: true, reason: 'access_policy_allow' };
    }
    if (decision.action === 'redirect') {
      const url =
        decision.redirectUrl ||
        buildVideoAdRedirectUrl(
          { creatorHash: apiConfig.creatorHash, videoAdUrl: apiConfig.videoAdUrl },
          ctx.returnUrl
        );
      return { verified: false, reason: 'access_policy_redirect', redirectUrl: url };
    }
  }

  if (ctx.redirectTicket) {
    if (!ctx.fingerprint) return failure(apiConfig, ctx, 'no_fingerprint');
    try {
      const claim = await claimRedirectTicket(apiConfig, ctx.redirectTicket);
      if (claim.creator_hash !== apiConfig.creatorHash) {
        return failure(apiConfig, ctx, 'creator_mismatch');
      }
      return {
        verified: true,
        reason: 'valid_token',
        token: claim.token,
        ticketId: claim.ticket_id,
        creatorHash: claim.creator_hash,
        expiresAt: getTokenExpiry(claim.token),
      };
    } catch {
      return failure(apiConfig, ctx, 'ticket_claim_failed');
    }
  }

  if (ctx.token) {
    if (isTokenExpired(ctx.token)) return failure(apiConfig, ctx, 'expired_token');
    const v = validateTokenClaims(ctx.token, apiConfig.creatorHash, ctx.fingerprint || undefined);
    if (!v.valid) return failure(apiConfig, ctx, 'invalid_token');
    try {
      const backend = await validateToken(apiConfig, ctx.token);
      if (!backend.valid) return failure(apiConfig, ctx, 'invalid_token');
    } catch {
      return failure(apiConfig, ctx, 'invalid_token');
    }
    return {
      verified: true,
      reason: 'valid_token',
      token: ctx.token,
      creatorHash: apiConfig.creatorHash,
      expiresAt: getTokenExpiry(ctx.token),
    };
  }

  return failure(apiConfig, ctx, 'no_token');
}

function failure(
  apiConfig: ProofMarkApiConfig & { videoAdUrl?: string },
  ctx: VerifyContext,
  reason: VerifyReason
): VerifyResult {
  return {
    verified: false,
    reason,
    redirectUrl: buildVideoAdRedirectUrl(
      { creatorHash: apiConfig.creatorHash, videoAdUrl: apiConfig.videoAdUrl },
      ctx.returnUrl
    ),
  };
}
