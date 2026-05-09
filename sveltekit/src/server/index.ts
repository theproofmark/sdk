export { createShowAdHandle, type ShowAdHandle } from './handle';
export {
  inspectShowAdVerification,
  hasShowAdVerification,
  requireShowAdVerification,
  ShowAdRedirect,
} from './protect';
export {
  evaluateAccessPolicy,
  verifyCrawlerRequest,
  isIpInCidrs,
  getClientIp,
  type AccessPolicyAction,
  type AccessPolicyDecision,
  type AccessPolicyOptions,
  type AccessPolicyContext,
  type AccessPolicyRequestLike,
  type CrawlerFamily,
  type CrawlerPolicy,
  type CrawlerVerificationInput,
  type CrawlerVerificationResult,
} from '../core/access-policy';
export {
  decodeToken,
  isTokenExpired,
  getTokenExpiry,
  validateTokenClaims,
} from '../core/jwt';
export {
  claimRedirectTicket,
  validateToken,
  checkHealth,
  resolveApiBaseUrl,
} from '../core/api';
export {
  buildVideoAdRedirectUrl,
  buildResourceRedirectUrl,
  removeQueryParam,
  resolveVideoAdUrl,
} from '../core/url';
export {
  getCookieNames,
  parseCookieHeader,
  buildSetCookieHeader,
  buildVerificationSetCookieHeaders,
  buildClearSetCookieHeaders,
  applyVerificationCookies,
  applyClearCookies,
  appendSetCookieHeaders,
  DEFAULT_COOKIE_MAX_AGE,
  type CookieNames,
  type CookieOptions,
  type VerificationCookieInput,
} from '../core/cookies';
export {
  isPathProtected,
  isPathExcluded,
  matchPath,
} from '../core/path-match';
