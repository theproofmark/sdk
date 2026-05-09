/**
 * Server-side exports for ShowAd SDK
 * 
 * Use these in:
 * - middleware.ts (Next.js middleware)
 * - Server components
 * - API routes
 * - getServerSideProps
 * 
 * All ticket claiming and validation happens server-side.
 */

// Re-export everything from middleware
export {
  createShowAdMiddleware,
  verifyRequest,
  getVerificationFromCookies,
  buildVideoAdRedirectUrl,
  type ShowAdServerConfig,
} from '../middleware/protect';

// Re-export types
export type {
  MiddlewareVerificationResult,
  ProtectMiddlewareOptions,
  ClaimTicketResponse,
  ValidateTokenResponse,
} from '../types';
