/**
 * Client-side exports for ShowAd SDK
 * 
 * Use these in client components ('use client')
 * 
 * Client-side responsibilities:
 * - Collect fingerprint and store in cookie
 * - Read verification state from cookies (set by server middleware)
 * - Provide redirect function for unverified users
 * 
 * All ticket claiming and validation happens server-side in middleware.
 */

// Context and Provider
export { ShowAdProvider, useShowAdContext } from './context';

// Hooks
export {
  useShowAd,
  useIsVerified,
  useIsLoading,
  useVerificationError,
  useFingerprint,
  useFingerprintDetails,
  useVerificationExpiry,
  useProtectedContent,
  useRequireVerification,
} from './hooks';

// Components
export {
  ShowAdGate,
  ShowAdVerified,
  ShowAdUnverified,
  ShowAdLoading,
  ShowAdExpiryCountdown,
  ShowAdDebug,
} from './components';

// Re-export types
export type {
  ShowAdClientConfig,
  VerificationState,
  FingerprintData,
} from '../types';
