/**
 * ShowAd Next.js SDK
 * Protect your content with video ad verification
 * 
 * @example
 * ```tsx
 * // In your layout or provider
 * import { ShowAdProvider } from '@showad/nextjs-sdk/client';
 * 
 * const config = {
 *   creatorHash: process.env.NEXT_PUBLIC_SHOWAD_CREATOR_HASH!,
 *   apiKey: process.env.SHOWAD_API_KEY!,
 * };
 * 
 * export default function Layout({ children }) {
 *   return (
 *     <ShowAdProvider config={config}>
 *       {children}
 *     </ShowAdProvider>
 *   );
 * }
 * ```
 */

// Types
export * from './types';

// Utilities (can be used anywhere)
export {
  getFingerprint,
  getFingerprintDetails,
  isFingerprintAvailable,
  getDeviceType,
  getBrowserInfo,
} from './utils/fingerprint';

export {
  setShowAdCookie,
  getShowAdCookie,
  clearShowAdCookies,
  updateShowAdToken,
  isShowAdCookieExpired,
  getRedirectTicketFromUrl,
  removeRedirectTicketFromUrl,
  parseCookieHeader,
  getShowAdCookieFromParsed,
} from './utils/cookies';

export {
  claimRedirectTicket,
  validateToken,
  validateTokenWithHeader,
  buildVideoAdRedirectUrl,
  buildResourceRedirectUrl,
  checkHealth,
} from './utils/api';

export {
  decodeToken,
  isTokenExpired,
  getTokenExpiry,
  getTimeUntilExpiry,
  validateTokenClaims,
  getCreatorHashFromToken,
  getFingerprintFromToken,
  getSessionHashFromToken,
  verifyTokenClient,
  createVerificationResult,
} from './utils/jwt';

// Configuration helper
export function createShowAdConfig(options: {
  creatorHash: string;
  apiKey: string;
  apiBaseUrl?: string;
  videoAdUrl?: string;
  cookiePrefix?: string;
  cookieMaxAge?: number;
  debug?: boolean;
}): import('./types').ShowAdConfig {
  return {
    creatorHash: options.creatorHash,
    apiKey: options.apiKey,
    apiBaseUrl: options.apiBaseUrl || process.env.NEXT_PUBLIC_SHOWAD_API_URL || 'https://ad.proofmark.io',
    videoAdUrl: options.videoAdUrl || process.env.NEXT_PUBLIC_SHOWAD_VIDEO_URL || 'https://showad.proofmark.io',
    cookiePrefix: options.cookiePrefix || 'showad',
    cookieMaxAge: options.cookieMaxAge || 3600,
    debug: options.debug || process.env.NODE_ENV === 'development',
  };
}

