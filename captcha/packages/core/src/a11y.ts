import type { Widget } from './types';

export function lockBodyScroll(widget: Widget): void {
  if (typeof document === 'undefined') return;
  widget.priorBodyOverflow = document.body.style.overflow;
  widget.priorBodyPaddingRight = document.body.style.paddingRight;
  const sbw = window.innerWidth - document.documentElement.clientWidth;
  document.body.style.overflow = 'hidden';
  if (sbw > 0) {
    const cur = parseFloat(window.getComputedStyle(document.body).paddingRight) || 0;
    document.body.style.paddingRight = (cur + sbw) + 'px';
  }
}

export function unlockBodyScroll(widget: Widget): void {
  if (typeof document === 'undefined') return;
  document.body.style.overflow = widget.priorBodyOverflow || '';
  document.body.style.paddingRight = widget.priorBodyPaddingRight || '';
  widget.priorBodyOverflow = null;
  widget.priorBodyPaddingRight = null;
}

/**
 * Focusable elements within the modal, for the focus trap.
 *
 * NOTE: intentionally a broad query + JS filter rather than the original
 * api.js single CSS selector. The original union
 * `input:not([disabled]), …, [tabindex]:not([tabindex="-1"])` re-admits an
 * `<input tabindex="-1">` because it still matches `input:not([disabled])`.
 * Filtering in JS honors the author's clear intent to exclude `tabindex="-1"`.
 * Production behavior is identical (the modal never contains such inputs);
 * this only differs on a synthetic edge case the unit test pins down.
 */
export function getFocusableElements(root: HTMLElement | null): HTMLElement[] {
  if (!root || !root.querySelectorAll) return [];
  const candidates = Array.from(root.querySelectorAll<HTMLElement>(
    'a[href], button, input, select, textarea, iframe, [tabindex]'
  ));
  return candidates.filter(el => {
    const tabindex = el.getAttribute('tabindex');
    if (tabindex === '-1') return false;
    const disabled = (el as HTMLInputElement).disabled;
    if (disabled) return false;
    return true;
  });
}

export function installFocusTrap(widget: Widget, onEscape: () => void): void {
  widget.focusReturn = document.activeElement;
  widget.keyHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); onEscape(); return; }
    if (e.key !== 'Tab' || !widget.modal) return;
    const f = getFocusableElements(widget.modal);
    if (f.length === 0) { e.preventDefault(); return; }
    const first = f[0], last = f[f.length - 1], active = document.activeElement;
    if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
  };
  document.addEventListener('keydown', widget.keyHandler, true);
  setTimeout(() => {
    if (!widget.modal) return;
    const f = getFocusableElements(widget.modal);
    if (f.length > 0) { try { f[0].focus(); } catch { /* ignore */ } }
  }, 50);
}

export function uninstallFocusTrap(widget: Widget): void {
  if (widget.keyHandler) {
    document.removeEventListener('keydown', widget.keyHandler, true);
    widget.keyHandler = null;
  }
  if (widget.focusReturn && (widget.focusReturn as HTMLElement).focus) {
    try { (widget.focusReturn as HTMLElement).focus(); } catch { /* ignore */ }
  }
  widget.focusReturn = null;
}
