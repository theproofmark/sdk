/**
 * ShowAd Vue plugin for Inertia.js
 *
 * Usage in app.js:
 *   import { ShowAdPlugin } from 'vendor/showad/resources/js/vue';
 *   app.use(ShowAdPlugin);
 *
 * Then use components: <ShowAdGate>, <ShowAdVerified>, <ShowAdUnverified>, <ShowAdExpiryCountdown>
 */

import { computed } from 'vue';
import { usePage } from '@inertiajs/vue3';
import ShowAdGate from './ShowAdGate.vue';
import ShowAdVerified from './ShowAdVerified.vue';
import ShowAdUnverified from './ShowAdUnverified.vue';
import ShowAdExpiryCountdown from './ShowAdExpiryCountdown.vue';

export const ShowAdPlugin = {
    install(app) {
        app.component('ShowAdGate', ShowAdGate);
        app.component('ShowAdVerified', ShowAdVerified);
        app.component('ShowAdUnverified', ShowAdUnverified);
        app.component('ShowAdExpiryCountdown', ShowAdExpiryCountdown);
    },
};

export { ShowAdGate, ShowAdVerified, ShowAdUnverified, ShowAdExpiryCountdown };

/**
 * Composable for accessing ShowAd state in Vue 3 with Inertia.
 *
 * Usage:
 *   import { useShowAd } from 'vendor/showad/resources/js/vue';
 *   const { isVerified, expiresAt, redirectToVideoAd } = useShowAd();
 */
export function useShowAd() {
    const page = usePage();
    const state = computed(() => page.props.showad || {});

    return {
        state,
        isVerified: computed(() => state.value.is_verified || false),
        creatorHash: computed(() => state.value.creator_hash || null),
        expiresAt: computed(() => state.value.expires_at || null),
        redirectUrl: computed(() => state.value.redirect_url || null),
        redirectToVideoAd: function(returnUrl) {
            const url = returnUrl || state.value.redirect_url;
            if (url) {
                window.location.href = url;
            } else if (window.ShowAd) {
                window.ShowAd.redirectToVideoAd(returnUrl);
            }
        },
    };
}
