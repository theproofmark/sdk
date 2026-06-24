import { appendQueryParam, originOf } from './utils';
import type { Widget } from './types';

/** Open the challenge as a top-level window. Calls onBlocked if popup blocked. */
export function openVerifyPopup(widget: Widget, onBlocked: (w: Widget) => void): void {
  if (!widget.embedURL) { onBlocked(widget); return; }
  let url = appendQueryParam(widget.embedURL, 'pmv_parent_origin', window.location.origin);
  url = appendQueryParam(url, 'pmv_popup', '1');
  const w = window.open(url, 'pmv-verify-' + widget.id, 'width=520,height=620,resizable=yes,scrollbars=yes');
  if (!w) { onBlocked(widget); return; }
  widget.popup = w;
  widget.popupOrigin = originOf(widget.embedURL);
}

export function closePopupIfOpen(widget: Widget): void {
  if (widget.popup && !widget.popup.closed) {
    try { widget.popup.close(); } catch { /* ignore */ }
  }
  widget.popup = null;
  widget.popupOrigin = null;
}
