/**
 * ShowAd Node SDK - main entry.
 */

export * from './types';
export {
  decodeToken,
  isTokenExpired,
  getTokenExpiry,
  validateTokenClaims,
} from './core/jwt';
export {
  claimRedirectTicket,
  validateToken,
  checkHealth,
  resolveApiBaseUrl,
} from './core/api';
export {
  buildVideoAdRedirectUrl,
  buildResourceRedirectUrl,
  removeQueryParam,
  resolveVideoAdUrl,
} from './core/url';
export {
  getCookieNames,
  buildSetCookieHeader,
  buildVerificationSetCookieHeaders,
  buildClearSetCookieHeaders,
  parseCookieHeader,
  DEFAULT_COOKIE_MAX_AGE,
} from './core/cookies';
export { matchPath, isPathProtected, isPathExcluded } from './core/path-match';
export {
  evaluateAccessPolicy,
  verifyCrawlerRequest,
  isIpInCidrs,
  getClientIp,
} from './core/access-policy';
export type {
  AccessPolicyAction,
  AccessPolicyDecision,
  AccessPolicyOptions,
  AccessPolicyContext,
  CrawlerFamily,
  CrawlerPolicy,
  CrawlerVerificationInput,
  CrawlerVerificationResult,
} from './core/access-policy';
export { runProtect } from './core/protect';
export type { ProtectAction, ProtectResult } from './core/protect';
