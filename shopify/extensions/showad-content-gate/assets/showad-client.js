/**
 * ShowAd Content Gate — storefront client. Vanilla JS, no frameworks.
 *
 * Why client-managed cookies?
 *   Shopify strips the `Cookie` request header and the `Set-Cookie` response
 *   header on app-proxy traffic. The proxy therefore cannot set or read
 *   first-party cookies. We work around that by storing `showad_token` and
 *   `showad_fingerprint` in `document.cookie` (set by this script on the
 *   merchant's storefront origin, which is the *same origin* as the proxy
 *   path) and forwarding them to the proxy in the request body.
 *
 * Flow:
 *   1. On load, find every gate block. POST to /state with the stored token.
 *   2. If `verified`, reveal the inner content. Otherwise show the locked
 *      state and a button that navigates to the verdict's `redirectUrl`.
 *   3. After the visitor watches the video ad, they're returned to the
 *      storefront with `?redirect_ticket=...`. Detect that, POST to /claim
 *      with the ticket + fingerprint, persist the returned token in a
 *      first-party cookie, then strip the ticket from the URL and rerun.
 */
(function () {
  if (window.__showadGateInit) return;
  window.__showadGateInit = true;

  var COOKIE_TOKEN = 'showad_token';
  var COOKIE_FINGERPRINT = 'showad_fingerprint';
  var COOKIE_VERIFIED = 'showad_verified';

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  function boot() {
    var gates = document.querySelectorAll('[data-showad-gate]');
    if (!gates.length) return;
    var firstGate = gates[0];
    handleReturnFromAd(firstGate).then(function () {
      gates.forEach(initGate);
    });
  }

  function handleReturnFromAd(firstGate) {
    var url = new URL(window.location.href);
    var ticket = url.searchParams.get('redirect_ticket');
    if (!ticket) return Promise.resolve();
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(ticket)) return Promise.resolve();

    var claim = firstGate.getAttribute('data-proxy-claim') || '/apps/showad-gate/proxy/claim';
    var fingerprint = readCookie(COOKIE_FINGERPRINT) || (window.ShowAdFingerprint && window.ShowAdFingerprint.get()) || '';

    return fetch(claim, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({
        redirect_ticket: ticket,
        fingerprint: fingerprint,
        return_path: url.pathname,
      }),
    })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        if (data && data.verified && data.token) {
          var maxAge = data.cookieMaxAge || 3600;
          writeCookie(COOKIE_TOKEN, data.token, maxAge);
          writeCookie(COOKIE_VERIFIED, '1', maxAge);
        }
      })
      .catch(function () { /* swallow — /state will retry */ })
      .then(function () {
        url.searchParams.delete('redirect_ticket');
        window.history.replaceState({}, '', url.toString());
      });
  }

  function initGate(gate) {
    var lockedEl = gate.querySelector('[data-showad-locked]');
    var verifiedEl = gate.querySelector('[data-showad-verified]');
    var loadingEl = gate.querySelector('[data-showad-loading]');
    var statusEl = gate.querySelector('[data-showad-status]');
    var btn = gate.querySelector('[data-showad-unlock-btn]');

    var stateUrl = gate.getAttribute('data-proxy-state') || '/apps/showad-gate/proxy/state';
    var protectedPath = gate.getAttribute('data-protected-path') || window.location.pathname;

    var token = readCookie(COOKIE_TOKEN) || '';
    var fingerprint = readCookie(COOKIE_FINGERPRINT) || (window.ShowAdFingerprint && window.ShowAdFingerprint.get()) || '';

    fetchState(stateUrl, {
      token: token,
      fingerprint: fingerprint,
      protected_path: protectedPath,
      return_url: window.location.href,
    })
      .then(function (verdict) {
        hide(loadingEl);
        if (verdict.verified) {
          show(verifiedEl);
          hide(lockedEl);
          return;
        }
        show(lockedEl);
        hide(verifiedEl);
        if (btn && verdict.redirectUrl) {
          btn.addEventListener('click', function () {
            if (statusEl) statusEl.textContent = 'Loading ad...';
            window.location.assign(verdict.redirectUrl);
          });
        } else if (btn) {
          btn.disabled = true;
          if (statusEl) statusEl.textContent = 'Gate not configured.';
        }
      })
      .catch(function () {
        hide(loadingEl);
        show(lockedEl);
        if (statusEl) statusEl.textContent = 'Unable to reach gate. Try again.';
      });
  }

  function fetchState(stateUrl, body) {
    return fetch(stateUrl, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify(body),
    }).then(function (res) {
      if (!res.ok) throw new Error('state ' + res.status);
      return res.json();
    });
  }

  function readCookie(name) {
    try {
      var match = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([^;]*)'));
      return match ? decodeURIComponent(match[1]) : '';
    } catch (e) { return ''; }
  }

  function writeCookie(name, value, maxAgeSeconds) {
    var secure = window.location.protocol === 'https:';
    document.cookie = name + '=' + encodeURIComponent(value)
      + '; Path=/; Max-Age=' + Math.floor(maxAgeSeconds || 3600)
      + '; SameSite=Lax'
      + (secure ? '; Secure' : '');
  }

  function show(el) { if (el) el.removeAttribute('hidden'); }
  function hide(el) { if (el) el.setAttribute('hidden', ''); }
})();
