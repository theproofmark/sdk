import { MESSAGE_SOURCE } from './config';
import { originOf } from './utils';
import type { Widget } from './types';

/** Transitions the message layer can trigger on a widget. Injected by widget.ts. */
export interface WidgetTransitions {
  onReady(w: Widget): void;            // cancel iframe-ready timer
  onToken(w: Widget, token: string): void;
  onError(w: Widget, code: string): void;
}

/**
 * Install the single global message listener. `getWidgets` returns the live
 * registry array so the listener always sees current widgets. Returns an
 * uninstall fn (used by tests).
 *
 * Three-layer integrity check, ported from api.js 987-1010:
 *   1. event.data.source === 'proofmark-verify'
 *   2. event.source is the widget's iframe.contentWindow OR popup window
 *   3. event.origin === the expected origin of that frame/popup
 */
export function installMessageListener(
  getWidgets: () => (Widget | null)[],
  transitions: WidgetTransitions
): () => void {
  const handler = (event: MessageEvent) => {
    const data = event.data;
    if (!data || data.source !== MESSAGE_SOURCE) return;
    const widgets = getWidgets();
    for (let i = 0; i < widgets.length; i++) {
      const w = widgets[i];
      if (!w) continue;
      let expectedOrigin: string | null = null;
      let matched = false;
      if (w.iframe && event.source === w.iframe.contentWindow) {
        matched = true;
        expectedOrigin = originOf(w.iframe.src);
      } else if (w.popup && event.source === w.popup) {
        matched = true;
        expectedOrigin = w.popupOrigin;
      }
      if (!matched) continue;
      if (expectedOrigin && event.origin !== expectedOrigin) continue; // impostor → silent drop
      dispatch(w, data, transitions);
      break;
    }
  };
  window.addEventListener('message', handler);
  return () => window.removeEventListener('message', handler);
}

/** Ported from api.js handleIframeMessage 1189-1206. */
function dispatch(w: Widget, data: { type?: string; token?: string; code?: string }, t: WidgetTransitions): void {
  switch (data.type) {
    case 'pm-verify-ready': t.onReady(w); break;
    case 'pm-verify-token': if (data.token) t.onToken(w, data.token); break;
    case 'pm-verify-error': t.onError(w, data.code || 'unknown'); break;
  }
}
