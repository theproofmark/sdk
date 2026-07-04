import { iframeReadyTimeoutMs } from './config';
import { appendQueryParam } from './utils';
import type { ChromeStrings } from './i18n';
import {
  isNarrowViewport, iframeStyles, modalStyles, closeButtonStyles, popupCardStyles,
} from './styles';
import {
  lockBodyScroll, unlockBodyScroll, installFocusTrap, uninstallFocusTrap,
} from './a11y';
import { openVerifyPopup, closePopupIfOpen } from './popup';
import type { Widget } from './types';

/** Callbacks the modal layer needs from the widget state machine (injected to avoid a cycle). */
export interface ModalHandlers {
  onDismiss(w: Widget, reason: string): void;
  onPopupBlocked(w: Widget): void;
  strings: (locale: string) => ChromeStrings;
}

/** Mount the modal overlay + challenge iframe. Ported from api.js showModal (650-753). */
export function showModal(widget: Widget, embedURL: string, apiBase: string, h: ModalHandlers): void {
  widget.state = 'open';
  const narrow = isNarrowViewport();

  const modal = document.createElement('div');
  modal.style.cssText = modalStyles(narrow);
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', 'ProofMark Verify challenge');

  let srcWithOrigin = appendQueryParam(embedURL, 'pmv_parent_origin', window.location.origin);
  srcWithOrigin = appendQueryParam(srcWithOrigin, 'pmv_lang', widget.locale);

  const frame = document.createElement('iframe');
  frame.src = srcWithOrigin;
  // autoplay + encrypted-media: the challenge plays a short muted ad clip.
  // clipboard-write: lets the embedded document (and dev tooling running inside
  // it) use the async Clipboard API; without it, navigator.clipboard.writeText
  // throws NotAllowedError under the parent's permissions policy.
  frame.allow = 'autoplay; encrypted-media; clipboard-write';
  frame.setAttribute('title', 'ProofMark Verify');
  frame.setAttribute(
    'sandbox',
    'allow-scripts allow-same-origin allow-forms allow-same-site-none-cookies allow-storage-access-by-user-activation'
  );
  frame.style.cssText = iframeStyles();

  const close = document.createElement('button');
  close.type = 'button';
  close.setAttribute('aria-label', h.strings(widget.locale).aria_close);
  close.textContent = '✕';
  close.style.cssText = closeButtonStyles(narrow);
  close.addEventListener('click', () => h.onDismiss(widget, 'user-closed'));

  // Backdrop dismiss disabled on mobile where the modal IS the viewport.
  if (!narrow) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) h.onDismiss(widget, 'user-closed');
    });
  }

  modal.appendChild(frame);
  modal.appendChild(close);
  document.body.appendChild(modal);

  widget.modal = modal;
  widget.iframe = frame;
  widget.embedURL = embedURL;

  lockBodyScroll(widget);
  installFocusTrap(widget, () => h.onDismiss(widget, 'escape'));
  installResizeHandler(widget);

  armIframeReadyTimer(widget, apiBase, h);
  frame.addEventListener('error', () => switchToPopupFallback(widget, h));
}

/** Common cleanup for every modal-exit path. Ported from api.js tearDownModal (759-775). */
export function tearDownModal(widget: Widget): void {
  if (widget.iframeReadyTimer) {
    clearTimeout(widget.iframeReadyTimer);
    widget.iframeReadyTimer = null;
  }
  closePopupIfOpen(widget);
  uninstallResizeHandler(widget);
  uninstallFocusTrap(widget);
  if (widget.modal) {
    unlockBodyScroll(widget);
    if (widget.modal.parentNode) {
      widget.modal.parentNode.removeChild(widget.modal);
    }
  }
  widget.modal = null;
  widget.iframe = null;
}

/** Deadline that fires the popup fallback if the iframe never signals ready. api.js 780-789. */
function armIframeReadyTimer(widget: Widget, apiBase: string, h: ModalHandlers): void {
  if (widget.iframeReadyTimer) clearTimeout(widget.iframeReadyTimer);
  const timeout = iframeReadyTimeoutMs(apiBase);
  widget.iframeReadyTimer = setTimeout(() => {
    if (widget.state === 'open' && !widget.token) {
      switchToPopupFallback(widget, h);
    }
  }, timeout);
}

/** Swap the iframe for a "verify in a new window" card. api.js switchToPopupFallback (795-857). */
export function switchToPopupFallback(widget: Widget, h: ModalHandlers): void {
  if (!widget.modal) return;
  if (widget.iframeReadyTimer) {
    clearTimeout(widget.iframeReadyTimer);
    widget.iframeReadyTimer = null;
  }
  if (widget.iframe && widget.iframe.parentNode) {
    widget.iframe.parentNode.removeChild(widget.iframe);
  }
  widget.iframe = null;

  const card = document.createElement('div');
  card.style.cssText = popupCardStyles();

  const str = h.strings(widget.locale);
  const title = document.createElement('div');
  title.style.cssText = 'font-size:18px;font-weight:600;color:#111827;margin-bottom:8px;text-align:start;';
  title.textContent = str.popup_title;

  const desc = document.createElement('p');
  desc.style.cssText = 'font-size:14px;color:#374151;line-height:1.5;margin:0 0 16px;text-align:start;';
  desc.textContent = str.popup_body;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = str.popup_button;
  btn.style.cssText = [
    'display:inline-block', 'padding:10px 20px', 'border-radius:6px', 'border:none',
    'background:#2563eb', 'color:#fff', 'font-size:14px', 'font-weight:600', 'cursor:pointer',
  ].join(';');
  // CRITICAL: window.open must fire from the user gesture — wire it to the click directly.
  btn.addEventListener('click', () => openVerifyPopup(widget, h.onPopupBlocked));

  card.appendChild(title);
  card.appendChild(desc);
  card.appendChild(btn);

  if (widget.modal.firstChild) {
    widget.modal.insertBefore(card, widget.modal.firstChild);
  } else {
    widget.modal.appendChild(card);
  }
}

/** Re-style modal on viewport rotation/resize. api.js installResizeHandler (1099-1113). */
function installResizeHandler(widget: Widget): void {
  widget.resizeHandler = () => {
    if (!widget.modal) return;
    const narrow = isNarrowViewport();
    widget.modal.style.background = narrow ? '#fff' : 'rgba(0,0,0,.55)';
    widget.modal.style.padding = narrow ? '0' : '16px';
    if (widget.iframe) {
      widget.iframe.style.cssText = iframeStyles();
    }
  };
  window.addEventListener('resize', widget.resizeHandler);
  window.addEventListener('orientationchange', widget.resizeHandler);
}

function uninstallResizeHandler(widget: Widget): void {
  if (widget.resizeHandler) {
    window.removeEventListener('resize', widget.resizeHandler);
    window.removeEventListener('orientationchange', widget.resizeHandler);
    widget.resizeHandler = null;
  }
}
