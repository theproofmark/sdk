<script>
/**
 * ShowAd Client-Side SDK for Laravel
 * Handles fingerprint collection, cookie management, and verification state.
 */
(function(window, document) {
    'use strict';

    var ShowAd = {
        config: {
            creatorHash: '{{ $creatorHash }}',
            cookiePrefix: '{{ $cookiePrefix }}',
            videoUrl: '{{ $videoUrl }}',
            debug: {{ $debug }}
        },

        /**
         * Initialize the SDK.
         */
        init: function() {
            this.log('Initializing ShowAd client SDK');
            this.collectFingerprint();
            this.checkRedirectTicket();
            this.startExpiryWatcher();
        },

        /**
         * Collect browser fingerprint and store in cookie.
         */
        collectFingerprint: function() {
            var self = this;
            var existing = this.getCookie(this.config.cookiePrefix + '_fingerprint');

            if (existing) {
                this.log('Fingerprint already present');
                return;
            }

            // Try FingerprintJS if available
            if (typeof FingerprintJS !== 'undefined') {
                FingerprintJS.load().then(function(fp) {
                    return fp.get();
                }).then(function(result) {
                    self.setFingerprint(result.visitorId);
                    self.log('Fingerprint collected via FingerprintJS');
                }).catch(function() {
                    self.setFingerprint(self.generateFallbackFingerprint());
                    self.log('Fingerprint collected via fallback');
                });
            } else {
                this.loadFingerprintScript(function() {
                    if (typeof FingerprintJS !== 'undefined') {
                        FingerprintJS.load().then(function(fp) {
                            return fp.get();
                        }).then(function(result) {
                            self.setFingerprint(result.visitorId);
                            self.log('Fingerprint collected via CDN FingerprintJS');
                        }).catch(function() {
                            self.setFingerprint(self.generateFallbackFingerprint());
                            self.log('Fingerprint collected via fallback');
                        });
                        return;
                    }

                    self.setFingerprint(self.generateFallbackFingerprint());
                    self.log('Fingerprint collected via fallback');
                });
            }
        },

        /**
         * Lazily load the FingerprintJS CDN bundle.
         */
        loadFingerprintScript: function(callback) {
            var existingScript = document.querySelector('script[data-showad-fingerprintjs]');

            if (existingScript) {
                if (existingScript.getAttribute('data-loaded') === '1') {
                    callback();
                    return;
                }

                existingScript.addEventListener('load', callback, { once: true });
                existingScript.addEventListener('error', callback, { once: true });
                return;
            }

            var script = document.createElement('script');
            script.src = 'https://openfpcdn.io/fingerprintjs/v4/iife.min.js';
            script.async = true;
            script.defer = true;
            script.setAttribute('data-showad-fingerprintjs', '1');
            script.onload = function() {
                script.setAttribute('data-loaded', '1');
                callback();
            };
            script.onerror = callback;
            document.head.appendChild(script);
        },

        /**
         * Generate a fallback fingerprint from browser properties.
         * Must match the Next.js SDK fallback algorithm.
         */
        generateFallbackFingerprint: function() {
            var components = [];
            components.push(navigator.userAgent || '');
            components.push(navigator.language || '');
            components.push(screen.width + 'x' + screen.height);
            components.push(screen.colorDepth || '');
            components.push(new Date().getTimezoneOffset());

            try { components.push(!!window.sessionStorage); } catch(e) { components.push(false); }
            try { components.push(!!window.localStorage); } catch(e) { components.push(false); }

            var str = components.join('|');
            var hash = 0;
            for (var i = 0; i < str.length; i++) {
                var char = str.charCodeAt(i);
                hash = ((hash << 5) - hash) + char;
                hash = hash & hash; // Convert to 32bit integer
            }
            return Math.abs(hash).toString(36);
        },

        /**
         * Store fingerprint in cookie.
         */
        setFingerprint: function(fingerprint) {
            var name = this.config.cookiePrefix + '_fingerprint';
            var isSecure = window.location.protocol === 'https:';
            var cookie = name + '=' + encodeURIComponent(fingerprint) + '; Path=/; Max-Age=3600; SameSite=Lax';
            if (isSecure) {
                cookie += '; Secure';
            }
            document.cookie = cookie;
            this.log('Fingerprint stored: ' + fingerprint.substring(0, 8) + '...');
        },

        /**
         * Check URL for redirect ticket and clean it up.
         */
        checkRedirectTicket: function() {
            var params = new URLSearchParams(window.location.search);
            var ticket = params.get('redirect_ticket');
            if (ticket) {
                this.log('Found redirect ticket in URL, server middleware will handle it');
            }
        },

        /**
         * Watch for token expiry and trigger events.
         */
        startExpiryWatcher: function() {
            var self = this;
            var expiresStr = this.getCookie(this.config.cookiePrefix + '_expires');

            if (!expiresStr) return;

            var expiresAt = parseInt(expiresStr, 10);
            if (isNaN(expiresAt)) return;

            var checkExpiry = function() {
                var now = Date.now();
                var remaining = expiresAt - now;

                if (remaining <= 0) {
                    self.log('Verification expired');
                    self.dispatchEvent('showad:expired');
                    return;
                }

                // Warn 30 seconds before expiry
                if (remaining <= 30000 && remaining > 29000) {
                    self.dispatchEvent('showad:expiring', { remainingMs: remaining });
                }

                setTimeout(checkExpiry, Math.min(remaining, 10000));
            };

            checkExpiry();
        },

        /**
         * Check if user is verified.
         */
        isVerified: function() {
            return this.getCookie(this.config.cookiePrefix + '_verified') === '1';
        },

        /**
         * Get time until token expires (in seconds).
         */
        getTimeUntilExpiry: function() {
            var expiresStr = this.getCookie(this.config.cookiePrefix + '_expires');
            if (!expiresStr) return -1;
            var expiresAt = parseInt(expiresStr, 10);
            if (isNaN(expiresAt)) return -1;
            return Math.floor((expiresAt - Date.now()) / 1000);
        },

        /**
         * Redirect to video ad.
         */
        redirectToVideoAd: function(returnUrl) {
            var url = this.config.videoUrl + '/c/' + encodeURIComponent(this.config.creatorHash);
            url += '?sdk=1';
            if (returnUrl) {
                url += '&return_url=' + encodeURIComponent(returnUrl);
            } else {
                url += '&return_url=' + encodeURIComponent(window.location.href);
            }
            window.location.href = url;
        },

        /**
         * Get a cookie by name.
         */
        getCookie: function(name) {
            var cookies = document.cookie.split(';');
            for (var i = 0; i < cookies.length; i++) {
                var cookie = cookies[i].trim();
                if (cookie.indexOf(name + '=') === 0) {
                    return decodeURIComponent(cookie.substring(name.length + 1));
                }
            }
            return null;
        },

        /**
         * Dispatch a custom event.
         */
        dispatchEvent: function(name, detail) {
            if (typeof CustomEvent === 'function') {
                window.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
            }
        },

        /**
         * Log a debug message.
         */
        log: function() {
            if (this.config.debug) {
                var args = ['[ShowAd SDK]'].concat(Array.prototype.slice.call(arguments));
                console.log.apply(console, args);
            }
        }
    };

    // Auto-initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() { ShowAd.init(); });
    } else {
        ShowAd.init();
    }

    // Expose globally
    window.ShowAd = ShowAd;
})(window, document);
</script>
