// src/middleware.ts
var DEFAULT_TOKEN_FIELD = "pm-verify-response";
var DEFAULT_ATTACH = "proofmark";
function proofmarkVerifyMiddleware(options) {
  const client = new ProofMarkVerify({
    secret: options.secret,
    baseUrl: options.baseUrl,
    timeoutMs: options.timeoutMs
  });
  const minScore = options.minScore ?? 0;
  const tokenField = options.tokenField ?? DEFAULT_TOKEN_FIELD;
  const attachAs = options.attachAs ?? DEFAULT_ATTACH;
  const onFail = options.onFail ?? defaultOnFail;
  return async function handler(req, res, next) {
    const token = req.body && req.body[tokenField] || req.query && req.query[tokenField] || void 0;
    if (!token || typeof token !== "string") {
      return onFail(req, res, "missing-token");
    }
    let result;
    try {
      result = await client.verify(token, { remoteip: getClientIp(req) });
    } catch (err) {
      if (options.failOpenOnNetworkError && err instanceof ProofMarkVerifyError && (err.code === "PMV_TIMEOUT" || err.code === "PMV_NETWORK_ERROR")) {
        result = {
          success: true,
          score: 0,
          flags: ["no_challenge_shown", "network_error_fail_open"],
          credit: false
        };
      } else {
        return onFail(req, res, "network-error");
      }
    }
    req[attachAs] = result;
    if (!result.success) {
      return onFail(req, res, "verification-failed", result);
    }
    if (result.score < minScore) {
      return onFail(req, res, "low-score", result);
    }
    next();
  };
}
function defaultOnFail(req, res, reason, result) {
  res.status(400).json({
    error: "ProofMark Verify failed",
    reason,
    result: result ? sanitizeForResponse(result) : void 0
  });
}
function sanitizeForResponse(r) {
  return {
    success: r.success,
    score: r.score,
    flags: r.flags,
    "error-codes": r["error-codes"]
  };
}
function getClientIp(req) {
  if (typeof req.ip === "string" && req.ip) return req.ip;
  const xff = req.headers && req.headers["x-forwarded-for"];
  if (typeof xff === "string") return xff.split(",")[0].trim();
  if (req.socket && typeof req.socket.remoteAddress === "string") {
    return req.socket.remoteAddress;
  }
  return void 0;
}

// src/index.ts
var ProofMarkVerifyError = class extends Error {
  constructor(code, message, cause) {
    super(message);
    this.name = "ProofMarkVerifyError";
    this.code = code;
    this.cause = cause;
  }
};
var DEFAULT_BASE_URL = "https://api.proofmark.com";
var DEFAULT_TIMEOUT = 5e3;
var ProofMarkVerify = class {
  constructor(options) {
    if (!options.secret) {
      throw new Error("ProofMarkVerify: `secret` is required");
    }
    this.secret = options.secret;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT;
    const f = options.fetchImpl ?? globalThis.fetch;
    if (typeof f !== "function") {
      throw new Error(
        "ProofMarkVerify: global `fetch` is not available. Pass `fetchImpl` or use Node 18+."
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
  async verify(token, opts = {}) {
    if (!token) {
      return {
        success: false,
        score: 0,
        flags: [],
        credit: false,
        "error-codes": ["missing-input-response"]
      };
    }
    const url = `${this.baseUrl}/v1/verify/siteverify`;
    const body = new URLSearchParams({
      secret: this.secret,
      response: token
    });
    if (opts.remoteip) body.set("remoteip", opts.remoteip);
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), this.timeoutMs);
    let res;
    try {
      res = await this.fetchImpl(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
        signal: ac.signal
      });
    } catch (err) {
      const isAbort = err instanceof Error && (err.name === "AbortError" || err.message.toLowerCase().includes("abort"));
      throw new ProofMarkVerifyError(
        isAbort ? "PMV_TIMEOUT" : "PMV_NETWORK_ERROR",
        isAbort ? `siteverify timed out after ${this.timeoutMs}ms` : "siteverify network error",
        err
      );
    } finally {
      clearTimeout(timer);
    }
    let json;
    try {
      json = await res.json();
    } catch (err) {
      throw new ProofMarkVerifyError(
        "PMV_INVALID_RESPONSE",
        `siteverify returned non-JSON body (status ${res.status})`,
        err
      );
    }
    if (!res.ok) {
      throw new ProofMarkVerifyError(
        "PMV_HTTP_ERROR",
        `siteverify returned HTTP ${res.status}`,
        json
      );
    }
    return normalize(json);
  }
};
function normalize(raw) {
  const r = raw || {};
  return {
    success: r["success"] === true,
    challenge_ts: typeof r["challenge_ts"] === "string" ? r["challenge_ts"] : void 0,
    hostname: typeof r["hostname"] === "string" ? r["hostname"] : void 0,
    action: typeof r["action"] === "string" ? r["action"] : void 0,
    score: typeof r["score"] === "number" ? r["score"] : 0,
    flags: Array.isArray(r["flags"]) ? r["flags"] : [],
    credit: r["credit"] === true,
    "error-codes": Array.isArray(r["error-codes"]) ? r["error-codes"] : void 0
  };
}
export {
  ProofMarkVerify,
  ProofMarkVerifyError,
  proofmarkVerifyMiddleware
};
//# sourceMappingURL=index.mjs.map