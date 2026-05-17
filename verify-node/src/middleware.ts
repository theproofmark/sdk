/**
 * Express middleware for @proofmark/verify-node.
 *
 * Usage:
 *
 *   import { proofmarkVerifyMiddleware } from '@proofmark/verify-node/middleware';
 *
 *   app.post(
 *     '/signup',
 *     proofmarkVerifyMiddleware({
 *       secret: process.env.PMV_SECRET_KEY!,
 *       minScore: 0.5,
 *       onFail: (req, res) => res.status(400).send('Verification failed'),
 *     }),
 *     (req, res) => {
 *       // req.proofmark contains the full VerifyResult
 *       console.log('score:', req.proofmark.score);
 *       res.send('ok');
 *     }
 *   );
 */

import { ProofMarkVerify, ProofMarkVerifyError, VerifyResult } from './index';

// We accept the Express types loosely so this package compiles without
// pulling Express into our prod dependency tree. If you use Express, the
// peer dep types will narrow these for you.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Req = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Res = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Next = (err?: any) => void;

/** Augment Express's Request type so `req.proofmark` is typed. */
export interface ProofMarkRequest extends Record<string, unknown> {
  proofmark?: VerifyResult;
}

export interface ProofMarkVerifyMiddlewareOptions {
  /** Your secret key. Required. */
  secret: string;
  /**
   * Minimum acceptable score (0.0–1.0). Requests below this threshold
   * are rejected via `onFail`. Default 0 (any successful token passes).
   */
  minScore?: number;
  /**
   * Name of the form field that holds the token. Default `'pm-verify-response'`.
   */
  tokenField?: string;
  /**
   * Custom failure handler. Default sends 400 with a JSON error.
   */
  onFail?: (req: Req, res: Res, reason: string, result?: VerifyResult) => void;
  /**
   * Property name on req where to attach the VerifyResult. Default `'proofmark'`.
   */
  attachAs?: string;
  /** Base URL override (testing / self-hosted). */
  baseUrl?: string;
  /** HTTP timeout in ms. Default 5000. */
  timeoutMs?: number;
  /**
   * If true and siteverify is unreachable (timeout or network error), allow
   * the request to proceed. Default false — network errors fail closed.
   *
   * USE WITH CAUTION on high-stakes endpoints.
   */
  failOpenOnNetworkError?: boolean;
}

const DEFAULT_TOKEN_FIELD = 'pm-verify-response';
const DEFAULT_ATTACH = 'proofmark';

export function proofmarkVerifyMiddleware(
  options: ProofMarkVerifyMiddlewareOptions
) {
  const client = new ProofMarkVerify({
    secret: options.secret,
    baseUrl: options.baseUrl,
    timeoutMs: options.timeoutMs,
  });
  const minScore = options.minScore ?? 0;
  const tokenField = options.tokenField ?? DEFAULT_TOKEN_FIELD;
  const attachAs = options.attachAs ?? DEFAULT_ATTACH;
  const onFail = options.onFail ?? defaultOnFail;

  return async function handler(req: Req, res: Res, next: Next): Promise<void> {
    const token =
      (req.body && req.body[tokenField]) ||
      (req.query && req.query[tokenField]) ||
      undefined;

    if (!token || typeof token !== 'string') {
      return onFail(req, res, 'missing-token');
    }

    let result: VerifyResult;
    try {
      result = await client.verify(token, { remoteip: getClientIp(req) });
    } catch (err) {
      if (
        options.failOpenOnNetworkError &&
        err instanceof ProofMarkVerifyError &&
        (err.code === 'PMV_TIMEOUT' || err.code === 'PMV_NETWORK_ERROR')
      ) {
        // Fail-open: synthesise a result with no-challenge-shown flag.
        result = {
          success: true,
          score: 0.0,
          flags: ['no_challenge_shown', 'network_error_fail_open'],
          credit: false,
        };
      } else {
        return onFail(req, res, 'network-error');
      }
    }

    req[attachAs] = result;

    if (!result.success) {
      return onFail(req, res, 'verification-failed', result);
    }
    if (result.score < minScore) {
      return onFail(req, res, 'low-score', result);
    }
    next();
  };
}

function defaultOnFail(req: Req, res: Res, reason: string, result?: VerifyResult): void {
  res.status(400).json({
    error: 'ProofMark Verify failed',
    reason,
    result: result ? sanitizeForResponse(result) : undefined,
  });
}

function sanitizeForResponse(r: VerifyResult): Partial<VerifyResult> {
  // Don't expose challenge_ts or hostname to the client.
  return {
    success: r.success,
    score: r.score,
    flags: r.flags,
    'error-codes': r['error-codes'],
  };
}

function getClientIp(req: Req): string | undefined {
  // Express puts the trusted IP at req.ip when trust-proxy is configured.
  if (typeof req.ip === 'string' && req.ip) return req.ip;
  const xff = req.headers && req.headers['x-forwarded-for'];
  if (typeof xff === 'string') return xff.split(',')[0].trim();
  if (req.socket && typeof req.socket.remoteAddress === 'string') {
    return req.socket.remoteAddress;
  }
  return undefined;
}
