/**
 * FingerprintJS loader — loads FingerprintJS v4 from CDN with fallback.
 *
 * @version 1.0.0
 */
(function () {
  'use strict';

  // Check if already loaded.
  if (window.FingerprintJS) {
    return;
  }

  // Dynamic import of FingerprintJS open-source edition.
  var script = document.createElement('script');
  script.src = 'https://openfpcdn.io/fingerprintjs/v4';
  script.async = true;
  script.crossOrigin = 'anonymous';

  script.onload = function () {
    if (window.FingerprintJS) {
      window.fpPromise = FingerprintJS.load();
    }
  };

  script.onerror = function () {
    // Fallback — ShowAd client SDK will use its built-in fallback.
    if (window.console) {
      console.warn('[ShowAd] FingerprintJS CDN unavailable, using built-in fallback.');
    }
  };

  // Append to head.
  var head = document.head || document.getElementsByTagName('head')[0];
  head.appendChild(script);
})();
