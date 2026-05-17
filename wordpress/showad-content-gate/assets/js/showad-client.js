/**
 * ShowAd Client-Side SDK for WordPress.
 *
 * Handles fingerprint collection, cookie management, verification state,
 * expiry monitoring, and video ad redirects.
 *
 * @version 1.0.0
 */
(function () {
  'use strict';

  // Bail if already initialized.
  if (window.ShowAd && window.ShowAd._initialized) {
    return;
  }

  var config = window.showadConfig || {};
  var COOKIE_PREFIX = config.cookiePrefix || 'showad';
  var DEBUG = !!config.debug;

  // ---------------------------------------------------------------
  // Utility helpers
  // ---------------------------------------------------------------

  function log() {
    if (DEBUG && window.console && console.log) {
      var args = Array.prototype.slice.call(arguments);
      args.unshift('[ShowAd]');
      console.log.apply(console, args);
    }
  }

  function getCookie(name) {
    var match = document.cookie.match(new RegExp('(^|;\\s*)' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([^;]*)'));
    return match ? decodeURIComponent(match[2]) : null;
  }

  function setCookie(name, value, maxAge, httpOnly) {
    var parts = [
      name + '=' + encodeURIComponent(value),
      'path=/',
      'max-age=' + (maxAge || config.cookieMaxAge || 3600)
    ];

    if (window.location.protocol === 'https:') {
      parts.push('secure');
      parts.push('samesite=strict');
    } else {
      parts.push('samesite=lax');
    }

    document.cookie = parts.join('; ');
  }

  function deleteCookie(name) {
    document.cookie = name + '=; path=/; max-age=0';
  }

  function cookieName(suffix) {
    return COOKIE_PREFIX + '_' + suffix;
  }

  // ---------------------------------------------------------------
  // Fingerprint collection (matches Next.js/Laravel SDK algorithm)
  // ---------------------------------------------------------------

  function generateFallbackFingerprint() {
    var components = [
      navigator.userAgent || '',
      navigator.language || '',
      screen.width + 'x' + screen.height,
      screen.colorDepth || '',
      new Date().getTimezoneOffset(),
      (function () {
        try { localStorage.setItem('_t', '1'); localStorage.removeItem('_t'); return '1'; } catch (e) { return '0'; }
      })(),
      (function () {
        try { sessionStorage.setItem('_t', '1'); sessionStorage.removeItem('_t'); return '1'; } catch (e) { return '0'; }
      })()
    ];

    var str = components.join('|||');
    var hash = 0;
    for (var i = 0; i < str.length; i++) {
      var char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer.
    }

    return Math.abs(hash).toString(36);
  }

  function collectFingerprint(callback) {
    // Try FingerprintJS first.
    if (window.FingerprintJS) {
      FingerprintJS.load()
        .then(function (fp) { return fp.get(); })
        .then(function (result) {
          log('Fingerprint collected via FingerprintJS:', result.visitorId);
          callback(result.visitorId);
        })
        .catch(function (err) {
          log('FingerprintJS failed, using fallback:', err);
          callback(generateFallbackFingerprint());
        });
    } else if (window.fpPromise) {
      // FingerprintJS loaded as a promise (CDN pattern).
      window.fpPromise
        .then(function (fp) { return fp.get(); })
        .then(function (result) {
          callback(result.visitorId);
        })
        .catch(function () {
          callback(generateFallbackFingerprint());
        });
    } else {
      log('FingerprintJS not available, using fallback.');
      callback(generateFallbackFingerprint());
    }
  }

  // ---------------------------------------------------------------
  // Cookie readers
  // ---------------------------------------------------------------

  function isVerified() {
    var verified = getCookie(cookieName('verified'));
    if (verified !== '1') return false;

    // Also check expiry (Unix seconds).
    var expiresStr = getCookie(cookieName('expires'));
    if (expiresStr) {
      var expiresSec = parseInt(expiresStr, 10);
      if (!isNaN(expiresSec) && Math.floor(Date.now() / 1000) > expiresSec) {
        return false;
      }
    }

    return true;
  }

  function getTimeUntilExpiry() {
    var expiresStr = getCookie(cookieName('expires'));
    if (!expiresStr) return -1;

    var expiresSec = parseInt(expiresStr, 10);
    if (isNaN(expiresSec)) return -1;

    var remaining = Math.max(0, expiresSec - Math.floor(Date.now() / 1000));
    return remaining;
  }

  function getCreatorHash() {
    return getCookie(cookieName('creator')) || config.creatorHash || '';
  }

  function getFingerprint() {
    return getCookie(cookieName('fingerprint')) || null;
  }

  // ---------------------------------------------------------------
  // Redirect helpers
  // ---------------------------------------------------------------

  function redirectToVideoAd(returnUrl) {
    var url = (config.videoAdUrl || 'https://showad.proofmark.io') +
              '/c/' + encodeURIComponent(config.creatorHash || '') +
              '?sdk=1&return_url=' + encodeURIComponent(returnUrl || window.location.href);
    window.location.href = url;
  }

  function getRedirectTicketFromUrl() {
    var params = new URLSearchParams(window.location.search);
    return params.get('redirect_ticket') || null;
  }

  function removeRedirectTicketFromUrl() {
    if (!getRedirectTicketFromUrl()) return;

    var url = new URL(window.location.href);
    url.searchParams.delete('redirect_ticket');
    if (window.history && window.history.replaceState) {
      window.history.replaceState({}, document.title, url.toString());
    }
  }

  // ---------------------------------------------------------------
  // Expiry watcher
  // ---------------------------------------------------------------

  var expiryInterval = null;

  function startExpiryWatcher() {
    if (expiryInterval) return;

    expiryInterval = setInterval(function () {
      var remaining = getTimeUntilExpiry();

      if (remaining === -1) return;

      // Update all countdown elements on the page.
      var countdowns = document.querySelectorAll('[data-showad-expiry]');
      for (var i = 0; i < countdowns.length; i++) {
        var el = countdowns[i];
        var format = el.getAttribute('data-format') || 'mm:ss';
        el.textContent = formatTime(remaining, format);
      }

      // Fire events.
      if (remaining <= 30 && remaining > 0) {
        dispatchEvent('showad:expiring', { secondsRemaining: remaining });
      }

      if (remaining <= 0) {
        dispatchEvent('showad:expired', {});
        clearInterval(expiryInterval);
        expiryInterval = null;
      }
    }, 1000);
  }

  function formatTime(seconds, format) {
    if (seconds <= 0) return format === 'seconds' ? '0' : '0:00';

    switch (format) {
      case 'seconds':
        return String(seconds);
      case 'human':
        if (seconds >= 3600) {
          var h = Math.floor(seconds / 3600);
          var m = Math.floor((seconds % 3600) / 60);
          return h + 'h ' + m + 'm';
        }
        if (seconds >= 60) {
          var mins = Math.floor(seconds / 60);
          var secs = seconds % 60;
          return mins + 'm ' + secs + 's';
        }
        return seconds + 's';
      case 'mm:ss':
      default:
        var mm = Math.floor(seconds / 60);
        var ss = seconds % 60;
        return mm + ':' + (ss < 10 ? '0' : '') + ss;
    }
  }

  function dispatchEvent(name, detail) {
    if (typeof CustomEvent === 'function') {
      document.dispatchEvent(new CustomEvent(name, { detail: detail }));
    }
  }

  // ---------------------------------------------------------------
  // Initialization
  // ---------------------------------------------------------------

  function initialize() {
    log('Initializing ShowAd client SDK');

    // Collect fingerprint and store in cookie.
    collectFingerprint(function (fp) {
      if (fp) {
        setCookie(cookieName('fingerprint'), fp, config.cookieMaxAge || 3600);
        log('Fingerprint stored:', fp);
      }
    });

    // Check for redirect_ticket in URL (server-side middleware handles this,
    // but clean URL on client side too).
    removeRedirectTicketFromUrl();

    // Start expiry watcher if verified.
    if (isVerified()) {
      startExpiryWatcher();
    }

    log('SDK initialized, verified:', isVerified());
  }

  // ---------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------

  window.ShowAd = {
    _initialized: true,
    isVerified: isVerified,
    getTimeUntilExpiry: getTimeUntilExpiry,
    getCreatorHash: getCreatorHash,
    getFingerprint: getFingerprint,
    redirectToVideoAd: redirectToVideoAd,
    getCookie: getCookie,
    collectFingerprint: collectFingerprint,
    startExpiryWatcher: startExpiryWatcher,
    formatTime: formatTime
  };

  // Initialize on DOM ready.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }
})();
