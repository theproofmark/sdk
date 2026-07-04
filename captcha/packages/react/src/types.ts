/** Mirrors @proofmark/verify-js's LockoutInfo — kept local to avoid a hard dependency. */
export interface LockoutInfo {
  code: string;
  tier?: 'minor' | 'moderate' | 'severe';
  retryAfterSec?: number;
}

export interface PmVerifyGlobal {
  render(container: string | HTMLElement, options: {
    sitekey: string;
    callback?: (token: string) => void;
    'expired-callback'?: () => void;
    'error-callback'?: (code: string) => void;
    'lockout-callback'?: (info: LockoutInfo) => void;
    theme?: 'light' | 'dark' | 'auto';
    action?: string;
    lang?: string;
  }): number;
  getResponse(id: number): string;
  reset(id: number): void;
  remove(id: number): void;
  execute(id: number): void;
}

declare global {
  interface Window { pmverify?: PmVerifyGlobal }
}

export interface ProofMarkVerifyHandle {
  reset(): void;
}

export interface ProofMarkVerifyProps {
  siteKey: string;
  onToken: (token: string) => void;
  onExpire?: () => void;
  onError?: (code: string) => void;
  /**
   * Fired when the visitor's fingerprint+IP is under an active penalty
   * lockout (Phase 7). Distinct from onError so hosts can show a real
   * cooldown UI (e.g. disable a submit button, show a countdown) — the
   * widget itself already renders a locked, non-clickable checkbox
   * regardless of whether this is set. Additive-only: omitting it just
   * means onError still receives code 'locked-out'.
   */
  onLockout?: (info: LockoutInfo) => void;
  theme?: 'light' | 'dark' | 'auto';
  action?: string;
  lang?: string;
  /** Base URL the api.js script loads from. Default https://verify.proofmark.com */
  scriptBaseUrl?: string;
}
