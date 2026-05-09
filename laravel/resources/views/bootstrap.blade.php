<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex,nofollow">
    <title>Preparing Secure Verification</title>
    <style>
        body {
            margin: 0;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #f8fafc;
            color: #0f172a;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        .showad-bootstrap {
            width: 100%;
            max-width: 32rem;
            padding: 2rem;
            text-align: center;
        }
        .showad-spinner {
            width: 2.5rem;
            height: 2.5rem;
            margin: 0 auto 1rem;
            border-radius: 9999px;
            border: 3px solid #cbd5e1;
            border-top-color: #2563eb;
            animation: showad-spin 0.8s linear infinite;
        }
        .showad-title {
            margin: 0 0 0.75rem;
            font-size: 1.25rem;
            font-weight: 600;
        }
        .showad-text {
            margin: 0;
            color: #475569;
            line-height: 1.6;
        }
        .showad-link {
            display: inline-block;
            margin-top: 1.25rem;
            color: #2563eb;
            text-decoration: none;
            font-weight: 600;
        }
        @keyframes showad-spin {
            to {
                transform: rotate(360deg);
            }
        }
    </style>
</head>
<body>
    <main class="showad-bootstrap">
        <div class="showad-spinner" aria-hidden="true"></div>
        <h1 class="showad-title">Preparing secure verification</h1>
        <p class="showad-text">
            We are establishing a secure browser fingerprint before continuing to the protected content.
        </p>
        <noscript>
            <p class="showad-text" style="margin-top: 1rem; color: #b91c1c;">
                JavaScript is required to complete verification.
            </p>
            <a class="showad-link" href="{{ $targetUrl }}">Continue</a>
        </noscript>
    </main>
    <script>
    (function (window, document) {
        'use strict';

        var targetUrl = <?php echo json_encode($targetUrl); ?>;
        var cookiePrefix = <?php echo json_encode($cookiePrefix); ?>;
        var debug = <?php echo $debug ? 'true' : 'false'; ?>;

        function log() {
            if (!debug || !window.console || !window.console.log) {
                return;
            }

            var args = ['[ShowAd Bootstrap]'].concat(Array.prototype.slice.call(arguments));
            window.console.log.apply(window.console, args);
        }

        function setCookie(name, value) {
            var cookie = name + '=' + encodeURIComponent(value) + '; Path=/; Max-Age=3600; SameSite=Lax';

            if (window.location.protocol === 'https:') {
                cookie += '; Secure';
            }

            document.cookie = cookie;
        }

        function getCookie(name) {
            var cookies = document.cookie.split(';');
            for (var i = 0; i < cookies.length; i++) {
                var cookie = cookies[i].trim();
                if (cookie.indexOf(name + '=') === 0) {
                    return decodeURIComponent(cookie.substring(name.length + 1));
                }
            }
            return null;
        }

        function generateFallbackFingerprint() {
            var components = [];
            components.push(navigator.userAgent || '');
            components.push(navigator.language || '');
            components.push(screen.width + 'x' + screen.height);
            components.push(screen.colorDepth || '');
            components.push(new Date().getTimezoneOffset());

            try { components.push(!!window.sessionStorage); } catch (e) { components.push(false); }
            try { components.push(!!window.localStorage); } catch (e) { components.push(false); }

            var joined = components.join('|');
            var hash = 0;

            for (var i = 0; i < joined.length; i++) {
                var code = joined.charCodeAt(i);
                hash = ((hash << 5) - hash) + code;
                hash = hash & hash;
            }

            return Math.abs(hash).toString(36);
        }

        function continueFlow(fingerprint) {
            setCookie(cookiePrefix + '_fingerprint', fingerprint);
            log('Fingerprint ready, continuing flow');
            window.location.replace(targetUrl);
        }

        function loadFingerprintScript(onReady) {
            var existing = document.querySelector('script[data-showad-fingerprintjs]');

            if (existing) {
                if (existing.getAttribute('data-loaded') === '1') {
                    onReady();
                    return;
                }

                existing.addEventListener('load', onReady, { once: true });
                existing.addEventListener('error', onReady, { once: true });
                return;
            }

            var script = document.createElement('script');
            script.src = 'https://openfpcdn.io/fingerprintjs/v4/iife.min.js';
            script.async = true;
            script.defer = true;
            script.setAttribute('data-showad-fingerprintjs', '1');
            script.onload = function () {
                script.setAttribute('data-loaded', '1');
                onReady();
            };
            script.onerror = onReady;
            document.head.appendChild(script);
        }

        function collectFingerprint() {
            var existingFingerprint = getCookie(cookiePrefix + '_fingerprint');
            if (existingFingerprint) {
                log('Fingerprint already present');
                continueFlow(existingFingerprint);
                return;
            }

            if (typeof window.FingerprintJS !== 'undefined') {
                window.FingerprintJS.load().then(function (fp) {
                    return fp.get();
                }).then(function (result) {
                    continueFlow(result.visitorId);
                }).catch(function () {
                    continueFlow(generateFallbackFingerprint());
                });
                return;
            }

            loadFingerprintScript(function () {
                if (typeof window.FingerprintJS !== 'undefined') {
                    window.FingerprintJS.load().then(function (fp) {
                        return fp.get();
                    }).then(function (result) {
                        continueFlow(result.visitorId);
                    }).catch(function () {
                        continueFlow(generateFallbackFingerprint());
                    });
                    return;
                }

                continueFlow(generateFallbackFingerprint());
            });
        }

        collectFingerprint();
    })(window, document);
    </script>
</body>
</html>
