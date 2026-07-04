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

type Req = any;
type Res = any;
type Next = (err?: any) => void;
/** Augment Express's Request type so `req.proofmark` is typed. */
interface ProofMarkRequest extends Record<string, unknown> {
    proofmark?: VerifyResult;
}
interface ProofMarkVerifyMiddlewareOptions {
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
declare function proofmarkVerifyMiddleware(options: ProofMarkVerifyMiddlewareOptions): (req: Req, res: Res, next: Next) => Promise<void>;

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
/** Constructor options for the client. */
interface ProofMarkVerifyOptions {
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
interface VerifyOptions {
    /**
     * Optional. The IP address of the user that triggered verification.
     * Highly recommended — improves risk scoring accuracy.
     */
    remoteip?: string;
}
/** Result of a /siteverify call. Mirrors the API response. */
interface VerifyResult {
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
declare class ProofMarkVerifyError extends Error {
    readonly code: string;
    readonly cause?: unknown;
    constructor(code: string, message: string, cause?: unknown);
}
declare class ProofMarkVerify {
    private readonly secret;
    private readonly baseUrl;
    private readonly timeoutMs;
    private readonly fetchImpl;
    constructor(options: ProofMarkVerifyOptions);
    /**
     * Verify a token against the ProofMark backend.
     *
     * @param token  The string from `pm-verify-response` form field
     * @param opts   Options including `remoteip`
     * @returns      The verification result (always; non-2xx HTTP throws)
     */
    verify(token: string, opts?: VerifyOptions): Promise<VerifyResult>;
}

export { ProofMarkVerify as P, type ProofMarkRequest, type ProofMarkVerifyMiddlewareOptions, type VerifyOptions as V, ProofMarkVerifyError as a, type ProofMarkVerifyOptions as b, type VerifyResult as c, proofmarkVerifyMiddleware };
