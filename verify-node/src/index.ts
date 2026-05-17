/**
 * @proofmark/verify-node
 *
 * Server-side SDK for ProofMark Verify, the CAPTCHA-replacement protocol.
 *
 * Drop-in replacement for hCaptcha / reCAPTCHA / Cloudflare Turnstile SDKs.
 * Wraps a POST to /v1/verify/siteverify with idiomatic Node.js + Express
 * helpers, response typing, error handling, and test-key detection.
 *
 * Quick start:
 *
 *   import { ProofMarkVerify } from '@proofmark/verify-node';
 *
 *   const pmv = new ProofMarkVerify({ secret: process.env.PMV_SECRET_KEY! });
 *
 *   const result = await pmv.verify(token, { remoteip: req.ip });
 *   if (result.success && result.score >= 0.5) {
 *     // human-verified; proceed
 *   }
 *
 * Full docs: https://github.com/proofmark/verify-node
 *           https://proofmark.com/verify/server-verification
 */

/* ───────────────────────────────────────────────────────────────────────── *
 * Types
 * ───────────────────────────────────────────────────────────────────────── */

/** Constructor options for the client. */
export interface ProofMarkVerifyOptions {
  /** Your secret key (pmvs_live_… or pmvs_test_…). REQUIRED. */
  secret: string;

  /**
   * Base URL of the ProofMark API. Override only for self-hosted / dev.
   * Default: 'https://api.proofmark.com'
   */
  baseUrl?: string;

  /**
   * HTTP request timeout in milliseconds. Default 5000.
   * Tokens are short-lived; long timeouts don't help.
   */
  timeoutMs?: number;

  /** Custom fetch implementation (for testing). Defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

/** Options for a single verify call. */
export interface VerifyOptions {
  /**
   * Optional. The IP address of the user that triggered verification.
   * Highly recommended — improves risk scoring accuracy.
   */
  remoteip?: string;
}

/** Result of a /siteverify call. Mirrors the API response. */
export interface VerifyResult {
  /** True if the token is valid, unredeemed, and matches this secret. */
  success: boolean;
  /** ISO-8601 timestamp of when the challenge was solved. */
  challenge_ts?: string;
  /** Hostname where the challenge ran. */
  hostname?: string;
  /** Action label set at challenge time (analytics). */
  action?: string;
  /** Risk score 0.0–1.0. Higher = more confident this is a human. */
  score: number;
  /** Categorical risk signals — see docs/verify/server-verification.md. */
  flags: string[];
  /** True if this verification was billable (used for analytics). */
  credit: boolean;
  /** Present only when success=false. */
  'error-codes'?: string[];
}

/** Thrown when the SDK can't reach the verify endpoint or got an invalid response. */
export class ProofMarkVerifyError extends Error {
  public readonly code: string;
  public readonly cause?: unknown;
  constructor(code: string, message: string, cause?: unknown) {
    super(message);
    this.name = 'ProofMarkVerifyError';
    this.code = code;
    this.cause = cause;
  }
}

/* ───────────────────────────────────────────────────────────────────────── *
 * Client
 * ───────────────────────────────────────────────────────────────────────── */

const DEFAULT_BASE_URL = 'https://api.proofmark.com';
const DEFAULT_TIMEOUT = 5000;

export class ProofMarkVerify {
  private readonly secret: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ProofMarkVerifyOptions) {
    if (!options.secret) {
      throw new Error('ProofMarkVerify: `secret` is required');
    }
    this.secret = options.secret;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const f: any = options.fetchImpl ?? (globalThis as any).fetch;
    if (typeof f !== 'function') {
      throw new Error(
        'ProofMarkVerify: global `fetch` is not available. Pass `fetchImpl` or use Node 18+.'
      );
    }
    this.fetchImpl = f;
  }

  /**
   * Verify a token against the ProofMark backend.
   *
   * @param token  The string from `pm-verify-response` form field
   * @param opts   Options including `remoteip`
   * @returns      The verification result (always; non-2xx HTTP throws)
   */
  async verify(token: string, opts: VerifyOptions = {}): Promise<VerifyResult> {
    if (!token) {
      return {
        success: false,
        score: 0,
        flags: [],
        credit: false,
        'error-codes': ['missing-input-response'],
      };
    }

    const url = `${this.baseUrl}/v1/verify/siteverify`;
    const body = new URLSearchParams({
      secret: this.secret,
      response: token,
    });
    if (opts.remoteip) body.set('remoteip', opts.remoteip);

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), this.timeoutMs);

    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: ac.signal,
      });
    } catch (err) {
      const isAbort =
        err instanceof Error &&
        (err.name === 'AbortError' || err.message.toLowerCase().includes('abort'));
      throw new ProofMarkVerifyError(
        isAbort ? 'PMV_TIMEOUT' : 'PMV_NETWORK_ERROR',
        isAbort
          ? `siteverify timed out after ${this.timeoutMs}ms`
          : 'siteverify network error',
        err
      );
    } finally {
      clearTimeout(timer);
    }

    let json: unknown;
    try {
      json = await res.json();
    } catch (err) {
      throw new ProofMarkVerifyError(
        'PMV_INVALID_RESPONSE',
        `siteverify returned non-JSON body (status ${res.status})`,
        err
      );
    }

    if (!res.ok) {
      throw new ProofMarkVerifyError(
        'PMV_HTTP_ERROR',
        `siteverify returned HTTP ${res.status}`,
        json
      );
    }

    return normalize(json);
  }
}

/* ───────────────────────────────────────────────────────────────────────── *
 * Helpers
 * ───────────────────────────────────────────────────────────────────────── */

/** Normalize the raw API response into the typed VerifyResult. */
function normalize(raw: unknown): VerifyResult {
  const r = (raw as Record<string, unknown>) || {};
  return {
    success: r['success'] === true,
    challenge_ts: typeof r['challenge_ts'] === 'string' ? (r['challenge_ts'] as string) : undefined,
    hostname: typeof r['hostname'] === 'string' ? (r['hostname'] as string) : undefined,
    action: typeof r['action'] === 'string' ? (r['action'] as string) : undefined,
    score: typeof r['score'] === 'number' ? (r['score'] as number) : 0,
    flags: Array.isArray(r['flags']) ? (r['flags'] as string[]) : [],
    credit: r['credit'] === true,
    'error-codes': Array.isArray(r['error-codes']) ? (r['error-codes'] as string[]) : undefined,
  };
}

/* ───────────────────────────────────────────────────────────────────────── *
 * Re-export middleware so users can `import { proofmarkVerifyMiddleware }
 * from '@proofmark/verify-node'`.
 * ───────────────────────────────────────────────────────────────────────── */
export { proofmarkVerifyMiddleware } from './middleware';
export type {
  ProofMarkVerifyMiddlewareOptions,
  ProofMarkRequest,
} from './middleware';
