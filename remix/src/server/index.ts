/**
 * ShowAd Remix SDK - server entry point.
 *
 * Import path: `@showad/remix/server`.
 */

export {
  requireShowAdVerification,
  getVerificationFromRequest,
} from './protect';
export { protectLoader, protectAction, type Loader, type LoaderArgsLike } from './loader';
export { wrapHandleRequest, type HandleRequestFn } from './handle-request';

export {
  evaluateAccessPolicy,
  verifyCrawlerRequest,
  isIpInCidrs,
  getClientIp,
  type AccessPolicyOptions,
  type AccessPolicyDecision,
  type AccessPolicyContext,
  type CrawlerFamily,
  type CrawlerPolicy,
  type CrawlerVerificationInput,
  type CrawlerVerificationResult,
} from '../core/access-policy';

export {
  buildVideoAdRedirectUrl,
  buildResourceRedirectUrl,
  resolveVideoAdUrl,
  removeQueryParam,
} from '../core/url';

export {
  buildVerificationSetCookieHeaders,
  buildClearSetCookieHeaders,
  buildSetCookieHeader,
  parseCookieHeader,
  readShowAdCookies,
  getCookieNames,
  DEFAULT_COOKIE_MAX_AGE,
  type CookieNames,
  type CookieOptions,
  type VerificationCookieInput,
  type ParsedShowAdCookies,
} from '../core/cookies';

export {
  decodeToken,
  isTokenExpired,
  getTokenExpiry,
  validateTokenClaims,
} from '../core/jwt';

export { matchPath, isPathProtected, isPathExcluded } from '../core/path-match';

export {
  claimRedirectTicket,
  validateToken,
  checkHealth,
  resolveApiBaseUrl,
} from '../core/api';

export type {
  ShowAdConfig,
  ShowAdJWTClaims,
  ClaimTicketRequest,
  ClaimTicketResponse,
  ValidateTokenResponse,
  VerificationResult,
  ProtectOptions,
} from '../types';

export { ShowAdError, ShowAdErrorCode } from '../types';
