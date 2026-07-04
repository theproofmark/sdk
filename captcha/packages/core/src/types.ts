/** Passed to the lockout callback when a fingerprint+IP penalty is active (Phase 7). */
export interface LockoutInfo {
  /** Always 'locked-out' today; kept as a string for forward compatibility with future codes. */
  code: string;
  /** Escalation tier from the server's penalty tracker, when available. */
  tier?: 'minor' | 'moderate' | 'severe';
  /** Seconds until the lockout expires, when the server reports one. */
  retryAfterSec?: number;
}

/** Options accepted by pmverify.render(). Mirrors the legacy api.js contract. */
export interface RenderOptions {
  /** Public site key (pmv_live_… or pmv_test_…). Required. */
  sitekey: string;
  /** Called with the token on success. A string is treated as a global fn name. */
  callback?: ((token: string) => void) | string;
  'expired-callback'?: (() => void) | string;
  'error-callback'?: ((code: string) => void) | string;
  /**
   * Called when the visitor's fingerprint+IP is under an active penalty
   * lockout (server error-code 'locked-out') — distinct from the generic
   * error-callback so hosts can show a real cooldown UI instead of just
   * letting the user click the checkbox again immediately. The widget
   * itself already renders a disabled, locked checkbox state; this
   * callback is for hosts that want to react too (e.g. disable a submit
   * button). Additive-only: hosts that don't set this still get the
   * generic error-callback with code 'locked-out'.
   */
  'lockout-callback'?: ((info: LockoutInfo) => void) | string;
  /** camelCase aliases (accepted for ergonomics; legacy hyphenated keys win if both set). */
  expiredCallback?: (() => void) | string;
  errorCallback?: ((code: string) => void) | string;
  lockoutCallback?: ((info: LockoutInfo) => void) | string;
  theme?: 'light' | 'dark' | 'auto';
  action?: string;
  lang?: string;
  debug?: boolean;
}

/** The global API installed at window.pmverify. */
export interface PmVerifyGlobal {
  render(container: string | HTMLElement, options: RenderOptions): number;
  getResponse(id: number): string;
  reset(id: number): void;
  remove(id: number): void;
  execute(id: number): void;
}

/** Parsed /v1/verify/challenge response. Exactly one of token|embed_url is meaningful. */
export interface ChallengeResponse {
  challenge_id?: string;
  embed_url?: string;
  token?: string;
  expires_in?: number;
  'error-codes'?: string[];
  /** Present when 'error-codes' is ['locked-out'] — see backend VerifyLockoutError. */
  lockout_tier?: 'minor' | 'moderate' | 'severe';
  retry_after_sec?: number;
}

export type WidgetState = 'idle' | 'requesting' | 'open' | 'success' | 'locked';

/** Internal per-widget record. Not exported from the package public surface. */
export interface Widget {
  id: number;
  container: HTMLElement;
  options: RenderOptions;
  sitekey: string;
  action?: string;
  theme: 'light' | 'dark';
  locale: string;
  rtl: boolean;
  state: WidgetState;
  token: string;
  challengeId: string | null;
  modal: HTMLElement | null;
  iframe: HTMLIFrameElement | null;
  popup: Window | null;
  popupOrigin: string | null;
  embedURL: string | null;
  iframeReadyTimer: ReturnType<typeof setTimeout> | null;
  expiryTimer: ReturnType<typeof setTimeout> | null;
  priorBodyOverflow?: string | null;
  priorBodyPaddingRight?: string | null;
  focusReturn?: Element | null;
  keyHandler?: ((e: KeyboardEvent) => void) | null;
  resizeHandler?: (() => void) | null;
  lockoutTimer: ReturnType<typeof setTimeout> | null;
  callbacks: {
    success: ((token: string) => void) | null;
    error: ((code: string) => void) | null;
    expired: (() => void) | null;
    lockout: ((info: LockoutInfo) => void) | null;
  };
}
