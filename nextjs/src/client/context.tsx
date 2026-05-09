'use client';

/**
 * ShowAd Context Provider for React (Client-Side Only)
 * 
 * This provider handles:
 * - Collecting fingerprint from the browser
 * - Storing fingerprint in cookie
 * - Reading verification state from cookies (set by server middleware)
 * 
 * All ticket claiming and validation happens server-side in middleware.
 */

import React, { 
  createContext, 
  useContext, 
  useCallback, 
  useEffect, 
  useState,
  useMemo,
  type ReactNode 
} from 'react';
import type { 
  ShowAdClientConfig,
  VerificationState, 
} from '../types';
import { getFingerprint } from '../utils/fingerprint';
import { buildVideoAdRedirectUrl } from '../utils/api';
import { 
  isTokenExpired,
  getTokenExpiry,
  verifyTokenClient,
} from '../utils/jwt';

// Cookie names (must match server middleware)
const COOKIE_PREFIX = 'showad';
const COOKIE_FINGERPRINT = `${COOKIE_PREFIX}_fingerprint`;
const COOKIE_TOKEN = `${COOKIE_PREFIX}_token`;
const COOKIE_CREATOR = `${COOKIE_PREFIX}_creator`;
const COOKIE_TICKET = `${COOKIE_PREFIX}_ticket`;
const COOKIE_VERIFIED = `${COOKIE_PREFIX}_verified`;
const COOKIE_EXPIRES = `${COOKIE_PREFIX}_expires`;

/**
 * Context value type
 */
interface ShowAdContextValue {
  state: VerificationState;
  config: ShowAdClientConfig;
  /** Redirect to video ad page */
  redirectToVideoAd: (returnUrl?: string) => void;
  /** Re-check verification state from cookies */
  refresh: () => void;
  /** Get the collected fingerprint */
  getFingerprint: () => string | null;
}

const ShowAdContext = createContext<ShowAdContextValue | null>(null);

/**
 * Provider props
 */
interface ShowAdProviderProps {
  children: ReactNode;
  config: ShowAdClientConfig;
  /** Called when verification state changes */
  onStateChange?: (state: VerificationState) => void;
  /** Skip fingerprint collection on mount */
  skipFingerprintCollection?: boolean;
}

/**
 * Get cookie value by name
 */
function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const cookies = document.cookie.split(';');
  for (const cookie of cookies) {
    const [cookieName, cookieValue] = cookie.trim().split('=');
    if (cookieName === name) {
      return decodeURIComponent(cookieValue);
    }
  }
  return null;
}

/**
 * Set a cookie
 */
function setCookie(name: string, value: string, maxAge: number = 3600): void {
  if (typeof document === 'undefined') return;
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`;
}

/**
 * ShowAd Provider Component
 * 
 * Client-side only responsibilities:
 * 1. Collect fingerprint and store in cookie
 * 2. Read verification state from cookies (set by server)
 * 3. Provide redirect function to video ad
 */
export function ShowAdProvider({
  children,
  config,
  onStateChange,
  skipFingerprintCollection = false,
}: ShowAdProviderProps): JSX.Element {
  const [state, setState] = useState<VerificationState>({
    isVerified: false,
    isLoading: true,
    error: null,
    creatorHash: config.creatorHash,
    fingerprint: null,
    redirectTicketId: null,
    expiresAt: null,
  });

  const [collectedFingerprint, setCollectedFingerprint] = useState<string | null>(null);

  /**
   * Debug logger
   */
  const debugLog = useCallback((...args: unknown[]) => {
    if (config.debug) {
      console.log('[ShowAd SDK]', ...args);
    }
  }, [config.debug]);

  /**
   * Read verification state from cookies
   */
  const readStateFromCookies = useCallback(() => {
    const fingerprint = getCookie(COOKIE_FINGERPRINT);
    const verified = getCookie(COOKIE_VERIFIED);
    const token = getCookie(COOKIE_TOKEN);
    const creatorHash = getCookie(COOKIE_CREATOR) || config.creatorHash;
    const ticketId = getCookie(COOKIE_TICKET);
    const expiryCookie = getCookie(COOKIE_EXPIRES);
    const expiresAt = expiryCookie ? Number(expiryCookie) : null;
    const hasValidExpiry = expiresAt !== null && Number.isFinite(expiresAt);

    debugLog('Reading cookies:', { 
      hasFingerprint: !!fingerprint, 
      hasVerified: !!verified,
      hasToken: !!token,
      hasTicket: !!ticketId,
      hasExpiry: hasValidExpiry,
    });

    // Check signal cookie first (set by server middleware alongside httpOnly token)
    // If the token cookie is httpOnly, we rely on the signal cookie for status
    const hasVerification = verified === '1' || !!token;

    if (!hasVerification) {
      return {
        isVerified: false,
        isLoading: false,
        error: null,
        creatorHash,
        fingerprint,
        redirectTicketId: ticketId,
        expiresAt: null,
      };
    }

    if (!token && hasValidExpiry && expiresAt <= Date.now()) {
      debugLog('Verification signal expired');
      return {
        isVerified: false,
        isLoading: false,
        error: 'Verification expired',
        creatorHash,
        fingerprint,
        redirectTicketId: ticketId,
        expiresAt: null,
      };
    }

    // If we can read the token (backwards compat with non-httpOnly setups), validate it
    if (token) {
      // Check token expiry
      if (isTokenExpired(token)) {
        debugLog('Token expired');
        return {
          isVerified: false,
          isLoading: false,
          error: 'Verification expired',
          creatorHash,
          fingerprint,
          redirectTicketId: ticketId,
          expiresAt: null,
        };
      }

      // Validate token claims (client-side check)
      const validation = verifyTokenClient(
        { creatorHash }, 
        token, 
        fingerprint || undefined
      );

      if (!validation.valid) {
        debugLog('Token validation failed:', validation.error);
        return {
          isVerified: false,
          isLoading: false,
          error: validation.error || 'Invalid verification',
          creatorHash,
          fingerprint,
          redirectTicketId: ticketId,
          expiresAt: null,
        };
      }

      return {
        isVerified: true,
        isLoading: false,
        error: null,
        creatorHash,
        fingerprint,
        redirectTicketId: ticketId,
        expiresAt: getTokenExpiry(token),
      };
    }

    // Signal cookie present but token is httpOnly (can't read it) — trust server middleware
    debugLog('Verification valid (signal cookie)');
    return {
      isVerified: true,
      isLoading: false,
      error: null,
      creatorHash,
      fingerprint,
      redirectTicketId: ticketId,
      expiresAt: hasValidExpiry ? expiresAt : null,
    };
  }, [config.creatorHash, debugLog]);

  /**
   * Collect fingerprint and store in cookie
   */
  const collectFingerprint = useCallback(async () => {
    debugLog('Collecting fingerprint...');
    
    try {
      const fp = await getFingerprint();
      debugLog('Fingerprint collected:', fp.substring(0, 8) + '...');
      
      // Store in cookie for server to read
      const maxAge = config.cookieMaxAge || 3600;
      setCookie(COOKIE_FINGERPRINT, fp, maxAge);
      setCookie(COOKIE_CREATOR, config.creatorHash, maxAge);
      
      setCollectedFingerprint(fp);
      return fp;
    } catch (error) {
      debugLog('Fingerprint collection failed:', error);
      return null;
    }
  }, [config.creatorHash, config.cookieMaxAge, debugLog]);

  /**
   * Refresh verification state
   */
  const refresh = useCallback(() => {
    const newState = readStateFromCookies();
    setState(newState);
    onStateChange?.(newState);
  }, [readStateFromCookies, onStateChange]);

  /**
   * Redirect to video ad
   */
  const redirectToVideoAd = useCallback((returnUrl?: string) => {
    const url = returnUrl || (typeof window !== 'undefined' ? window.location.href : '');
    const redirectUrl = buildVideoAdRedirectUrl(
      { creatorHash: config.creatorHash, videoAdUrl: config.videoAdUrl },
      url
    );
    
    debugLog('Redirecting to video ad:', redirectUrl);
    
    if (typeof window !== 'undefined') {
      window.location.href = redirectUrl;
    }
  }, [config.creatorHash, debugLog]);

  /**
   * Get collected fingerprint
   */
  const getFingerprintValue = useCallback(() => {
    return collectedFingerprint || getCookie(COOKIE_FINGERPRINT);
  }, [collectedFingerprint]);

  // Initialize on mount
  useEffect(() => {
    const init = async () => {
      // Step 1: Collect fingerprint (if not skipped)
      if (!skipFingerprintCollection) {
        await collectFingerprint();
      }

      // Step 2: Read state from cookies (set by server middleware)
      const newState = readStateFromCookies();
      setState(newState);
      onStateChange?.(newState);
    };

    init();
  }, [skipFingerprintCollection, collectFingerprint, readStateFromCookies, onStateChange]);

  // Set up expiry timer
  useEffect(() => {
    if (!state.isVerified || !state.expiresAt) return;

    const timeUntilExpiry = state.expiresAt - Date.now();
    
    if (timeUntilExpiry <= 0) {
      // Already expired
      refresh();
      return;
    }

    // Refresh 30 seconds before expiry
    const refreshTime = Math.max(0, timeUntilExpiry - 30000);
    
    const timer = setTimeout(() => {
      debugLog('Verification expiring soon, refreshing...');
      refresh();
    }, refreshTime);

    return () => clearTimeout(timer);
  }, [state.isVerified, state.expiresAt, refresh, debugLog]);

  const contextValue = useMemo<ShowAdContextValue>(() => ({
    state,
    config,
    redirectToVideoAd,
    refresh,
    getFingerprint: getFingerprintValue,
  }), [state, config, redirectToVideoAd, refresh, getFingerprintValue]);

  return (
    <ShowAdContext.Provider value={contextValue}>
      {children}
    </ShowAdContext.Provider>
  );
}

/**
 * Hook to access ShowAd context
 */
export function useShowAdContext(): ShowAdContextValue {
  const context = useContext(ShowAdContext);
  
  if (!context) {
    throw new Error('useShowAdContext must be used within a ShowAdProvider');
  }
  
  return context;
}
