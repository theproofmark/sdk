import {
  resolveApiBase, TOKEN_EXPIRY_MS, HIDDEN_INPUT_NAME,
} from './config';
import { resolveLocale, isRTL, strings } from './i18n';
import { resolveCallback, escapeHtml } from './utils';
import { resolveTheme, checkboxStyles, checkmarkStyles } from './styles';
import { showModal, tearDownModal, type ModalHandlers } from './modal';
import type { Widget, RenderOptions, ChallengeResponse } from './types';

/** Build a widget record and render its idle checkbox. Ported from api.js createWidget (437-484). */
export function createWidget(id: number, container: HTMLElement, options: RenderOptions): Widget {
  const langFromDom = container && container.getAttribute ? container.getAttribute('data-lang') : null;
  const rawLang =
    options.lang ||
    langFromDom ||
    (document.documentElement && document.documentElement.lang) ||
    (typeof navigator !== 'undefined' ? navigator.language : '') ||
    'en';
  const locale = resolveLocale(rawLang);

  const widget: Widget = {
    id,
    container,
    options,
    sitekey: options.sitekey,
    action: options.action,
    theme: resolveTheme(options.theme),
    locale,
    rtl: isRTL(locale),
    state: 'idle',
    token: '',
    challengeId: null,
    modal: null,
    iframe: null,
    popup: null,
    popupOrigin: null,
    embedURL: null,
    iframeReadyTimer: null,
    expiryTimer: null,
    callbacks: {
      success: resolveCallback(options.callback),
      error: resolveCallback(options['error-callback'] || options.errorCallback),
      expired: resolveCallback(options['expired-callback'] || options.expiredCallback),
    },
  };

  renderCheckbox(widget);
  return widget;
}

/** Render the idle "I am not a robot" checkbox. Ported from api.js renderCheckbox (510-558). */
export function renderCheckbox(widget: Widget): void {
  const c = widget.container;
  const str = strings(widget.locale);
  c.innerHTML = '';
  c.style.display = 'inline-block';
  c.setAttribute('dir', widget.rtl ? 'rtl' : 'ltr');
  c.setAttribute('lang', widget.locale);

  const box = document.createElement('div');
  box.setAttribute('role', 'button');
  box.setAttribute('tabindex', '0');
  box.setAttribute('aria-label', str.aria_label);
  box.style.cssText = checkboxStyles(widget.theme);

  const inner = document.createElement('div');
  inner.style.cssText = 'display:flex;align-items:center;gap:12px;';

  const check = document.createElement('div');
  check.style.cssText = checkmarkStyles(widget.theme);
  check.id = 'pmv-check-' + widget.id;

  const label = document.createElement('div');
  label.style.cssText = 'flex:1;text-align:start;';
  const textColor = widget.theme === 'dark' ? '#f3f4f6' : '#111827';
  const subColor = widget.theme === 'dark' ? '#9ca3af' : '#6b7280';
  label.innerHTML =
    '<div style="font-size:14px;color:' + textColor + ';">' + escapeHtml(str.checkbox_label) + '</div>' +
    '<div style="font-size:11px;color:' + subColor + ';margin-top:2px;">' + escapeHtml(str.brand) + '</div>';

  inner.appendChild(check);
  inner.appendChild(label);
  box.appendChild(inner);

  box.addEventListener('click', () => openModal(widget, registryRef));
  box.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      openModal(widget, registryRef);
    }
  });

  c.appendChild(box);
}

/**
 * The widget registry is owned by index.ts. widget.ts needs it for the
 * multi-widget supersede in openModal, so index.ts injects it once at startup
 * via setRegistry(). renderCheckbox's click handler closes over this ref.
 */
let registryRef: (Widget | null)[] = [];
export function setRegistry(reg: (Widget | null)[]): void { registryRef = reg; }

/** Click → request challenge → passive pass or modal. Ported from api.js openModal (596-648). */
export function openModal(widget: Widget, all: (Widget | null)[]): void {
  if (widget.state !== 'idle') return;
  // Multi-widget supersede (api.js 602-607): dismiss any other open modal first.
  for (let i = 0; i < all.length; i++) {
    const other = all[i];
    if (other && other !== widget && other.modal) dismiss(other);
  }
  widget.state = 'requesting';
  const apiBase = resolveApiBase();

  fetch(apiBase + '/v1/verify/challenge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sitekey: widget.sitekey, hostname: window.location.host, action: widget.action }),
  })
    .then((r) => r.json().then((b: ChallengeResponse) => ({ ok: r.ok, body: b })))
    .then((res) => {
      if (!res.ok) {
        const codes = res.body['error-codes'];
        fail(widget, (codes && codes[0]) || 'request-failed');
        return;
      }
      widget.challengeId = res.body.challenge_id || null;
      if (res.body.token) { succeed(widget, res.body.token); return; }   // passive pass
      if (!res.body.embed_url) { fail(widget, 'invalid-response'); return; }
      showModal(widget, res.body.embed_url, apiBase, modalHandlers());   // interactive
    })
    .catch(() => fail(widget, 'network-error'));
}

/** Handlers the modal layer calls back into. */
function modalHandlers(): ModalHandlers {
  return {
    onDismiss: (w) => dismiss(w),
    onPopupBlocked: (w) => fail(w, 'popup-blocked'),
    strings,
  };
}

/** Close the modal; restore checkbox unless already succeeded. Ported from api.js dismiss (877-883). */
export function dismiss(widget: Widget): void {
  tearDownModal(widget);
  if (widget.state !== 'success') {
    widget.state = 'idle';
    renderCheckbox(widget);
  }
}

/** Token obtained — success UI, hidden input, callback, 270s expiry. Ported from api.js succeed (885-902). */
export function succeed(widget: Widget, token: string): void {
  widget.token = token;
  widget.state = 'success';
  tearDownModal(widget);
  renderSuccessUI(widget);
  setHiddenInput(widget, token);
  if (widget.callbacks.success) widget.callbacks.success(token);
  widget.expiryTimer = setTimeout(() => {
    if (widget.token === token) {
      widget.token = '';
      widget.state = 'idle';
      renderCheckbox(widget);
      removeHiddenInput(widget);
      if (widget.callbacks.expired) widget.callbacks.expired();
    }
  }, TOKEN_EXPIRY_MS);
}

/** Error path — restore checkbox, fire error callback. Ported from api.js fail (904-909). */
export function fail(widget: Widget, code: string): void {
  widget.state = 'idle';
  tearDownModal(widget);
  renderCheckbox(widget);
  if (widget.callbacks.error) widget.callbacks.error(code);
}

/** Render the verified state. Ported from api.js renderSuccessUI (911-947). */
export function renderSuccessUI(widget: Widget): void {
  const c = widget.container;
  const str = strings(widget.locale);
  c.innerHTML = '';
  c.setAttribute('dir', widget.rtl ? 'rtl' : 'ltr');
  c.setAttribute('lang', widget.locale);
  const box = document.createElement('div');
  box.style.cssText = checkboxStyles(widget.theme);
  box.style.cursor = 'default';
  box.style.borderColor = '#047857';
  const inner = document.createElement('div');
  inner.style.cssText = 'display:flex;align-items:center;gap:12px;';
  const tick = document.createElement('div');
  tick.style.cssText = [
    'width:24px', 'height:24px', 'border-radius:3px', 'background:#047857',
    'color:#fff', 'display:flex', 'align-items:center', 'justify-content:center',
    'font-size:14px', 'flex-shrink:0',
  ].join(';');
  tick.textContent = '✓';
  const label = document.createElement('div');
  label.style.cssText = 'text-align:start;';
  const textColor = widget.theme === 'dark' ? '#f3f4f6' : '#111827';
  label.innerHTML =
    '<div style="font-size:14px;color:' + textColor + ';">' + escapeHtml(str.verified) + '</div>' +
    '<div style="font-size:11px;color:#047857;margin-top:2px;">' + escapeHtml(str.brand) + '</div>';
  inner.appendChild(tick);
  inner.appendChild(label);
  box.appendChild(inner);
  c.appendChild(box);
}

/** Insert the hidden pm-verify-response input into the enclosing form. api.js setHiddenInput (952-962). */
export function setHiddenInput(widget: Widget, token: string): void {
  removeHiddenInput(widget);
  const form = closestForm(widget.container);
  if (!form) return; // Not inside a form; host must use getResponse().
  const input = document.createElement('input');
  input.type = 'hidden';
  input.name = HIDDEN_INPUT_NAME;
  input.value = token;
  input.setAttribute('data-pmv-widget-id', String(widget.id));
  form.appendChild(input);
}

/** Remove this widget's hidden input. api.js removeHiddenInput (964-969). */
export function removeHiddenInput(widget: Widget): void {
  const form = closestForm(widget.container);
  if (!form) return;
  const inputs = form.querySelectorAll(
    'input[name="' + HIDDEN_INPUT_NAME + '"][data-pmv-widget-id="' + widget.id + '"]'
  );
  inputs.forEach((el) => el.parentNode && el.parentNode.removeChild(el));
}

function closestForm(el: HTMLElement | null): HTMLFormElement | null {
  let cur: Node | null = el;
  while (cur && (cur as HTMLElement).tagName !== 'FORM') cur = cur.parentNode;
  return cur && (cur as HTMLElement).tagName === 'FORM' ? (cur as HTMLFormElement) : null;
}

/** Current token for getResponse(). */
export function getToken(widget: Widget): string {
  return widget.token || '';
}
