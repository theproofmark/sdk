import { installMessageListener, type WidgetTransitions } from './messaging';
import { tearDownModal } from './modal';
import {
  createWidget, renderCheckbox, openModal, succeed, fail,
  removeHiddenInput, getToken, setRegistry,
} from './widget';
import type { PmVerifyGlobal, RenderOptions, Widget } from './types';

// Re-export pure helpers for unit tests + bundler users.
export { escapeHtml, appendQueryParam, originOf, resolveCallback } from './utils';
export { resolveLocale, isRTL, strings, STRINGS, SUPPORTED_LOCALES } from './i18n';
export { lockBodyScroll, unlockBodyScroll, getFocusableElements } from './a11y';
export { installMessageListener } from './messaging';
export { resolveTheme } from './styles';
export type { RenderOptions, PmVerifyGlobal } from './types';

const widgets: (Widget | null)[] = [];
let nextWidgetId = 0;

// Capability gate — ported from api.js 38-62. Installs a no-op API on
// unsupported browsers so host code never throws.
function unsupported(): boolean {
  if (typeof window === 'undefined' || !window.document) return true;
  return (
    typeof window.fetch !== 'function' ||
    typeof window.Promise !== 'function' ||
    typeof window.URL !== 'function' ||
    typeof window.postMessage !== 'function' ||
    typeof window.addEventListener !== 'function'
  );
}

function installNoOp(): void {
  (window as unknown as { pmverify: PmVerifyGlobal }).pmverify = {
    render: () => -1, getResponse: () => '', reset: () => {}, remove: () => {}, execute: () => {},
  };
}

const transitions: WidgetTransitions = {
  onReady(w) { if (w.iframeReadyTimer) { clearTimeout(w.iframeReadyTimer); w.iframeReadyTimer = null; } },
  onToken(w, token) { succeed(w, token); },
  onError(w, code) { fail(w, code); },
};

const pmverify: PmVerifyGlobal = {
  render(container, options: RenderOptions) {
    const el = typeof container === 'string' ? document.getElementById(container) : container;
    if (!el) throw new Error('pmverify.render: container not found');
    if (!options || !options.sitekey) throw new Error('pmverify.render: sitekey required');
    const id = nextWidgetId++;
    widgets[id] = createWidget(id, el, options);
    return id;
  },
  getResponse(id) { const w = widgets[id]; return w ? getToken(w) : ''; },
  reset(id) {
    const w = widgets[id]; if (!w) return;
    if (w.expiryTimer) { clearTimeout(w.expiryTimer); w.expiryTimer = null; }
    w.token = ''; w.state = 'idle'; renderCheckbox(w); removeHiddenInput(w);
  },
  remove(id) {
    const w = widgets[id]; if (!w) return;
    if (w.expiryTimer) { clearTimeout(w.expiryTimer); w.expiryTimer = null; }
    tearDownModal(w); removeHiddenInput(w);
    while (w.container.firstChild) w.container.removeChild(w.container.firstChild);
    widgets[id] = null;
  },
  execute(id) { const w = widgets[id]; if (w && w.state === 'idle') openModal(w, widgets); },
};

// Public render() for bundler users — same as pmverify.render.
export function render(container: string | HTMLElement, options: RenderOptions): number {
  return pmverify.render(container, options);
}

function shouldAutoRender(): boolean {
  const scripts = document.getElementsByTagName('script');
  for (let i = 0; i < scripts.length; i++) {
    const src = scripts[i].src || '';
    if (src.indexOf('proofmark.com/verify') !== -1 || src.indexOf('verify/api.js') !== -1) {
      if (src.indexOf('render=explicit') !== -1) return false;
    }
  }
  return true;
}

function autoRenderAll(): void {
  if (!shouldAutoRender()) return;
  const nodes = document.querySelectorAll<HTMLElement>('.pm-verify:not([data-pmv-rendered])');
  nodes.forEach((node) => {
    const sitekey = node.getAttribute('data-sitekey');
    if (!sitekey) return;
    try {
      pmverify.render(node, {
        sitekey,
        action: node.getAttribute('data-action') || undefined,
        theme: (node.getAttribute('data-theme') as RenderOptions['theme']) || 'auto',
        lang: node.getAttribute('data-lang') || undefined,
        callback: node.getAttribute('data-callback') || undefined,
        'error-callback': node.getAttribute('data-error-callback') || undefined,
        'expired-callback': node.getAttribute('data-expired-callback') || undefined,
      });
      node.setAttribute('data-pmv-rendered', '1');
    } catch { /* ignore */ }
  });
}

// Side-effect install (this is what the IIFE bundle runs).
if (unsupported()) {
  installNoOp();
} else {
  (window as unknown as { pmverify: PmVerifyGlobal }).pmverify = pmverify;
  setRegistry(widgets);
  installMessageListener(() => widgets, transitions);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoRenderAll);
  } else {
    autoRenderAll();
  }
}
