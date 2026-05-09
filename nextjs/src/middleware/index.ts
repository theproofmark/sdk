/**
 * Server-side middleware exports for ShowAd SDK
 * 
 * Use these in your middleware.ts or server components
 */

export {
  createShowAdMiddleware,
  verifyRequest,
  getVerificationFromCookies,
  buildVideoAdRedirectUrl,
  type ShowAdServerConfig,
} from './protect';

// Re-export types
export type {
  MiddlewareVerificationResult,
  ProtectMiddlewareOptions,
} from '../types';
