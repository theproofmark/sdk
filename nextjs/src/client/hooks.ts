'use client';

/**
 * React hooks for ShowAd SDK (Client-Side Only)
 * 
 * These hooks provide access to verification state that is set by the server middleware.
 * Client-side only collects fingerprint - all verification happens server-side.
 */

import { useCallback, useEffect, useState } from 'react';
import { useShowAdContext } from './context';
import type { VerificationState } from '../types';
import { getFingerprint, getFingerprintDetails, getDeviceType } from '../utils/fingerprint';

/**
 * Main hook to access ShowAd verification state and actions
 */
export function useShowAd() {
  const context = useShowAdContext();

  return {
    /** Whether the user is verified to access content */
    isVerified: context.state.isVerified,
    /** Whether verification check is in progress */
    isLoading: context.state.isLoading,
    /** Error message if verification failed */
    error: context.state.error,
    /** Full verification state */
    state: context.state,
    /** SDK configuration */
    config: context.config,
    /** Redirect to video ad page */
    redirectToVideoAd: context.redirectToVideoAd,
    /** Re-check verification state from cookies */
    refresh: context.refresh,
    /** Get the collected fingerprint */
    getFingerprint: context.getFingerprint,
  };
}

/**
 * Hook to check if user is verified (simple boolean)
 */
export function useIsVerified(): boolean {
  const { isVerified } = useShowAd();
  return isVerified;
}

/**
 * Hook to check if verification is loading
 */
export function useIsLoading(): boolean {
  const { isLoading } = useShowAd();
  return isLoading;
}

/**
 * Hook to get verification error
 */
export function useVerificationError(): string | null {
  const { error } = useShowAd();
  return error;
}

/**
 * Hook to get fingerprint (collected on client)
 */
export function useFingerprint() {
  const [fingerprint, setFingerprint] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadFingerprint = async () => {
      try {
        const fp = await getFingerprint();
        if (isMounted) {
          setFingerprint(fp);
          setIsLoading(false);
        }
      } catch (err) {
        if (isMounted) {
          setError((err as Error).message);
          setIsLoading(false);
        }
      }
    };

    loadFingerprint();

    return () => {
      isMounted = false;
    };
  }, []);

  return { fingerprint, isLoading, error };
}

/**
 * Hook to get detailed fingerprint data
 */
export function useFingerprintDetails() {
  const [details, setDetails] = useState<{
    visitorId: string | null;
    confidenceScore: number | null;
    deviceType: string | null;
  }>({
    visitorId: null,
    confidenceScore: null,
    deviceType: null,
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const loadDetails = async () => {
      try {
        const fpDetails = await getFingerprintDetails();
        const device = getDeviceType();
        
        if (isMounted) {
          setDetails({
            visitorId: fpDetails.visitorId,
            confidenceScore: fpDetails.confidenceScore ?? null,
            deviceType: device,
          });
          setIsLoading(false);
        }
      } catch {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadDetails();

    return () => {
      isMounted = false;
    };
  }, []);

  return { ...details, isLoading };
}

/**
 * Hook to get time until verification expires
 */
export function useVerificationExpiry(): {
  expiresAt: number | null;
  expiresIn: number | null;
  isExpired: boolean;
} {
  const { state } = useShowAd();
  const [expiresIn, setExpiresIn] = useState<number | null>(null);

  useEffect(() => {
    if (!state.expiresAt) {
      setExpiresIn(null);
      return;
    }

    const updateExpiry = () => {
      const remaining = Math.max(0, state.expiresAt! - Date.now());
      setExpiresIn(Math.floor(remaining / 1000));
    };

    updateExpiry();
    const interval = setInterval(updateExpiry, 1000);

    return () => clearInterval(interval);
  }, [state.expiresAt]);

  return {
    expiresAt: state.expiresAt,
    expiresIn,
    isExpired: expiresIn !== null && expiresIn <= 0,
  };
}

/**
 * Hook for protected content - shows loading/error states automatically
 */
export function useProtectedContent<T>(
  content: T
): {
  content: T | null;
  isLoading: boolean;
  isVerified: boolean;
  error: string | null;
  redirectToVideoAd: () => void;
} {
  const { isVerified, isLoading, error, redirectToVideoAd } = useShowAd();

  return {
    content: isVerified ? content : null,
    isLoading,
    isVerified,
    error,
    redirectToVideoAd,
  };
}

/**
 * Hook to trigger redirect on unverified access (client-side fallback)
 * Note: Primary protection should be via server middleware
 */
export function useRequireVerification(options?: {
  redirectOnFailure?: boolean;
  fallbackUrl?: string;
}): void {
  const { isVerified, isLoading, redirectToVideoAd } = useShowAd();
  const { redirectOnFailure = true, fallbackUrl } = options || {};

  useEffect(() => {
    if (!isLoading && !isVerified && redirectOnFailure) {
      redirectToVideoAd(fallbackUrl);
    }
  }, [isVerified, isLoading, redirectOnFailure, redirectToVideoAd, fallbackUrl]);
}
