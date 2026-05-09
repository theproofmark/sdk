import React, { createContext, useContext, useState, useEffect } from 'react';
import { usePage } from '@inertiajs/react';

/**
 * ShowAd React context and hooks for Inertia.js
 *
 * Usage with Inertia React:
 *   import { InertiaShowAdProvider, useShowAd, ShowAdGate } from 'vendor/showad/resources/js/react';
 */

const ShowAdContext = createContext({
    isVerified: false,
    creatorHash: null,
    expiresAt: null,
    redirectUrl: null,
    redirectToVideoAd: () => {},
});

/**
 * Provider that reads ShowAd state from Inertia page props.
 */
export function ShowAdProvider({ children, showadState }) {
    const state = showadState || {};

    const redirectToVideoAd = (returnUrl) => {
        const url = returnUrl || state.redirect_url;
        if (url) {
            window.location.href = url;
        } else if (window.ShowAd) {
            window.ShowAd.redirectToVideoAd(returnUrl);
        }
    };

    const value = {
        isVerified: state.is_verified || false,
        creatorHash: state.creator_hash || null,
        expiresAt: state.expires_at || null,
        redirectUrl: state.redirect_url || null,
        redirectToVideoAd,
    };

    return React.createElement(ShowAdContext.Provider, { value }, children);
}

/**
 * Provider that reads state from Inertia page props.
 */
export function InertiaShowAdProvider({ children }) {
    const page = usePage();

    return React.createElement(
        ShowAdProvider,
        { showadState: page.props.showad || {} },
        children
    );
}

/**
 * Hook to access ShowAd verification state.
 */
export function useShowAd() {
    return useContext(ShowAdContext);
}

/**
 * Hook that returns only the verified status.
 */
export function useIsVerified() {
    const { isVerified } = useShowAd();
    return isVerified;
}

/**
 * Hook for expiry countdown.
 */
export function useExpiryCountdown() {
    const { expiresAt } = useShowAd();
    const [remaining, setRemaining] = useState(0);

    useEffect(() => {
        if (!expiresAt) return;

        const update = () => {
            setRemaining(Math.max(0, Math.floor((expiresAt - Date.now()) / 1000)));
        };

        update();
        const timer = setInterval(update, 1000);
        return () => clearInterval(timer);
    }, [expiresAt]);

    return {
        remaining,
        isExpired: remaining <= 0 && expiresAt != null,
        formatted: remaining > 0
            ? String(Math.floor(remaining / 60)).padStart(2, '0') + ':' + String(remaining % 60).padStart(2, '0')
            : '00:00',
    };
}

/**
 * Gate component - shows children only when verified.
 */
export function ShowAdGate({ children, loading, unverified, autoRedirect = false }) {
    const { isVerified, redirectToVideoAd } = useShowAd();

    useEffect(() => {
        if (autoRedirect && !isVerified) {
            redirectToVideoAd();
        }
    }, [autoRedirect, isVerified, redirectToVideoAd]);

    if (isVerified) {
        return children;
    }

    if (unverified) {
        return unverified;
    }

    return React.createElement('div', { style: { textAlign: 'center', padding: '2rem' } },
        React.createElement('p', { style: { marginBottom: '1rem', color: '#6b7280' } },
            'This content requires verification.'
        ),
        React.createElement('button', {
            onClick: () => redirectToVideoAd(),
            style: {
                padding: '0.75rem 1.5rem',
                backgroundColor: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '0.375rem',
                fontWeight: 600,
                cursor: 'pointer',
            },
        }, 'Watch Ad to Unlock')
    );
}

/**
 * Show content only when verified.
 */
export function ShowAdVerified({ children }) {
    const { isVerified } = useShowAd();
    return isVerified ? children : null;
}

/**
 * Show content only when NOT verified.
 */
export function ShowAdUnverified({ children }) {
    const { isVerified } = useShowAd();
    return isVerified ? null : children;
}

/**
 * Expiry countdown display component.
 */
export function ShowAdExpiryCountdown({ format = 'mm:ss', onExpired }) {
    const { remaining, isExpired, formatted } = useExpiryCountdown();
    const { expiresAt } = useShowAd();

    useEffect(() => {
        if (isExpired && onExpired) {
            onExpired();
        }
    }, [isExpired, onExpired]);

    if (!expiresAt) return null;

    if (format === 'seconds') {
        return React.createElement('span', null, remaining + 's');
    }

    if (format === 'human') {
        const mins = Math.floor(remaining / 60);
        const secs = remaining % 60;
        const text = mins > 0 ? mins + 'm ' + secs + 's' : secs + 's';
        return React.createElement('span', null, text);
    }

    return React.createElement('span', null, isExpired ? 'Expired' : formatted);
}
