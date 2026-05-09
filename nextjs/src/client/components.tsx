'use client';

/**
 * React components for ShowAd SDK (Client-Side Only)
 */

import React, { type ReactNode } from 'react';
import { useShowAd, useIsVerified, useIsLoading, useVerificationExpiry } from './hooks';

/**
 * Props for ShowAdGate component
 */
interface ShowAdGateProps {
  children: ReactNode;
  /** Content to show while loading */
  loadingContent?: ReactNode;
  /** Content to show when not verified */
  unverifiedContent?: ReactNode;
  /** Auto-redirect to video ad when not verified (client-side fallback) */
  autoRedirect?: boolean;
  /** Custom redirect URL */
  redirectUrl?: string;
}

/**
 * Gate component that only shows children when verified
 * Note: Primary protection should be via server middleware
 */
export function ShowAdGate({
  children,
  loadingContent,
  unverifiedContent,
  autoRedirect = false,
  redirectUrl,
}: ShowAdGateProps): JSX.Element {
  const { isVerified, isLoading, error, redirectToVideoAd } = useShowAd();

  // Auto-redirect if enabled (client-side fallback)
  React.useEffect(() => {
    if (!isLoading && !isVerified && autoRedirect) {
      redirectToVideoAd(redirectUrl);
    }
  }, [isLoading, isVerified, autoRedirect, redirectToVideoAd, redirectUrl]);

  // Loading state
  if (isLoading) {
    return <>{loadingContent || <DefaultLoadingState />}</>;
  }

  // Not verified
  if (!isVerified) {
    return (
      <>
        {unverifiedContent || (
          <DefaultUnverifiedState 
            onRedirect={() => redirectToVideoAd(redirectUrl)} 
            error={error}
          />
        )}
      </>
    );
  }

  // Verified - show children
  return <>{children}</>;
}

/**
 * Component that only renders when verified (no fallback)
 */
export function ShowAdVerified({ children }: { children: ReactNode }): JSX.Element | null {
  const isVerified = useIsVerified();
  const isLoading = useIsLoading();

  if (isLoading || !isVerified) {
    return null;
  }

  return <>{children}</>;
}

/**
 * Component that only renders when NOT verified
 */
export function ShowAdUnverified({ children }: { children: ReactNode }): JSX.Element | null {
  const isVerified = useIsVerified();
  const isLoading = useIsLoading();

  if (isLoading || isVerified) {
    return null;
  }

  return <>{children}</>;
}

/**
 * Component that shows while loading
 */
export function ShowAdLoading({ children }: { children: ReactNode }): JSX.Element | null {
  const isLoading = useIsLoading();

  if (!isLoading) {
    return null;
  }

  return <>{children}</>;
}

/**
 * Component that shows verification expiry countdown
 */
export function ShowAdExpiryCountdown({
  format = 'mm:ss',
  onExpired,
}: {
  format?: 'mm:ss' | 'seconds' | 'human';
  onExpired?: () => void;
}): JSX.Element | null {
  const { expiresIn, isExpired } = useVerificationExpiry();

  React.useEffect(() => {
    if (isExpired && onExpired) {
      onExpired();
    }
  }, [isExpired, onExpired]);

  if (expiresIn === null) {
    return null;
  }

  let display: string;

  switch (format) {
    case 'seconds':
      display = `${expiresIn}s`;
      break;
    case 'human':
      if (expiresIn > 3600) {
        const hours = Math.floor(expiresIn / 3600);
        const mins = Math.floor((expiresIn % 3600) / 60);
        display = `${hours}h ${mins}m`;
      } else if (expiresIn > 60) {
        const mins = Math.floor(expiresIn / 60);
        const secs = expiresIn % 60;
        display = `${mins}m ${secs}s`;
      } else {
        display = `${expiresIn}s`;
      }
      break;
    case 'mm:ss':
    default:
      const minutes = Math.floor(expiresIn / 60);
      const seconds = expiresIn % 60;
      display = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
      break;
  }

  return <span>{display}</span>;
}

/**
 * Default loading state component
 */
function DefaultLoadingState(): JSX.Element {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '200px',
      flexDirection: 'column',
      gap: '16px',
    }}>
      <div style={{
        width: '40px',
        height: '40px',
        border: '3px solid #e5e7eb',
        borderTopColor: '#3b82f6',
        borderRadius: '50%',
        animation: 'showad-spin 1s linear infinite',
      }} />
      <p style={{ color: '#6b7280', margin: 0 }}>Verifying access...</p>
      <style>{`
        @keyframes showad-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

/**
 * Default unverified state component
 */
function DefaultUnverifiedState({ 
  onRedirect,
  error,
}: { 
  onRedirect: () => void;
  error: string | null;
}): JSX.Element {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '200px',
      flexDirection: 'column',
      gap: '16px',
      padding: '24px',
      textAlign: 'center',
    }}>
      <div style={{
        width: '64px',
        height: '64px',
        backgroundColor: '#fef3c7',
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '32px',
      }}>
        🔒
      </div>
      <h3 style={{ margin: 0, color: '#1f2937', fontSize: '18px', fontWeight: 600 }}>
        Content Protected
      </h3>
      <p style={{ color: '#6b7280', margin: 0, maxWidth: '300px' }}>
        Please watch a short video ad to access this content.
      </p>
      {error && (
        <p style={{ color: '#ef4444', margin: 0, fontSize: '14px' }}>
          {error}
        </p>
      )}
      <button
        onClick={onRedirect}
        style={{
          backgroundColor: '#3b82f6',
          color: 'white',
          border: 'none',
          padding: '12px 24px',
          borderRadius: '8px',
          fontSize: '16px',
          fontWeight: 500,
          cursor: 'pointer',
          transition: 'background-color 0.2s',
        }}
        onMouseOver={(e) => {
          e.currentTarget.style.backgroundColor = '#2563eb';
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.backgroundColor = '#3b82f6';
        }}
      >
        Watch Ad to Unlock
      </button>
    </div>
  );
}

/**
 * Debug component showing verification state
 */
export function ShowAdDebug(): JSX.Element | null {
  const { state, config } = useShowAd();
  const { expiresIn } = useVerificationExpiry();

  // Only show in development or debug mode
  if (process.env.NODE_ENV !== 'development' && !config.debug) {
    return null;
  }

  return (
    <div style={{
      position: 'fixed',
      bottom: '16px',
      right: '16px',
      backgroundColor: 'rgba(0, 0, 0, 0.9)',
      color: 'white',
      padding: '16px',
      borderRadius: '8px',
      fontSize: '12px',
      fontFamily: 'monospace',
      maxWidth: '300px',
      zIndex: 9999,
    }}>
      <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>
        ShowAd Debug
      </div>
      <div>Verified: {state.isVerified ? '✅' : '❌'}</div>
      <div>Loading: {state.isLoading ? '⏳' : '✓'}</div>
      <div>Fingerprint: {state.fingerprint?.substring(0, 8) || 'none'}...</div>
      <div>Creator: {state.creatorHash?.substring(0, 8) || 'none'}...</div>
      {expiresIn !== null && (
        <div>Expires in: {expiresIn}s</div>
      )}
      {state.error && (
        <div style={{ color: '#ef4444' }}>Error: {state.error}</div>
      )}
    </div>
  );
}
