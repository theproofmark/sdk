import { MOBILE_BREAKPOINT_PX } from './config';

type Theme = 'light' | 'dark';

export function isNarrowViewport(): boolean {
  return typeof window !== 'undefined' && window.innerWidth > 0 &&
    window.innerWidth <= MOBILE_BREAKPOINT_PX;
}

export function matchMediaDark(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/** Resolve 'auto' against prefers-color-scheme. Ported from api.js 486-489. */
export function resolveTheme(t: string | undefined): Theme {
  if (t === 'dark' || t === 'light') return t;
  return matchMediaDark() ? 'dark' : 'light';
}

export function checkboxStyles(theme: Theme): string {
  const dark = theme === 'dark';
  return [
    'display:inline-flex', 'box-sizing:border-box', 'padding:14px 16px',
    'min-width:260px', 'border-radius:6px',
    'border:1px solid ' + (dark ? '#374151' : '#d1d5db'),
    'background:' + (dark ? '#1f2937' : '#ffffff'),
    'cursor:pointer', 'font-family:system-ui,-apple-system,sans-serif',
    'user-select:none', 'transition:border-color .15s',
  ].join(';');
}

export function checkmarkStyles(theme: Theme): string {
  const dark = theme === 'dark';
  return [
    'width:24px', 'height:24px',
    'border:2px solid ' + (dark ? '#6b7280' : '#9ca3af'),
    'border-radius:3px', 'background:' + (dark ? '#111827' : '#ffffff'),
    'display:flex', 'align-items:center', 'justify-content:center',
    'flex-shrink:0', 'transition:background-color .15s',
  ].join(';');
}

export function iframeStyles(): string {
  if (isNarrowViewport()) {
    return ['width:100%','height:100%','max-width:none','background:#fff',
      'border:none','border-radius:0','box-shadow:none'].join(';');
  }
  return ['width:100%','max-width:520px','height:520px','background:#fff',
    'border:none','border-radius:12px','box-shadow:0 20px 50px rgba(0,0,0,.3)'].join(';');
}

/** Modal overlay container. Ported from api.js showModal (657-667). */
export function modalStyles(narrow: boolean): string {
  return [
    'position:fixed',
    'inset:0',
    'background:' + (narrow ? '#fff' : 'rgba(0,0,0,.55)'),
    'z-index:2147483647',
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'padding:' + (narrow ? '0' : '16px'),
  ].join(';');
}

/** Close (✕) button. Ported from api.js showModal (705-720). */
export function closeButtonStyles(narrow: boolean): string {
  return [
    'position:absolute',
    'top:' + (narrow ? '8px' : '16px'),
    'right:' + (narrow ? '8px' : '16px'),
    'width:36px',
    'height:36px',
    'border-radius:18px',
    'border:none',
    'background:rgba(255,255,255,.9)',
    'color:#111',
    'font-size:18px',
    'cursor:pointer',
    'box-shadow:0 2px 6px rgba(0,0,0,.2)',
  ].join(';');
}

/** Popup-fallback card container. Ported from api.js switchToPopupFallback (808-817). */
export function popupCardStyles(): string {
  return [
    'background:#fff',
    'border-radius:12px',
    'box-shadow:0 20px 50px rgba(0,0,0,.3)',
    'padding:32px',
    'max-width:420px',
    'width:100%',
    'text-align:center',
    'font-family:system-ui,-apple-system,sans-serif',
  ].join(';');
}
