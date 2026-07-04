/**
 * Poll `predicate` until it returns truthy or `timeoutMs` elapses.
 *
 * The widget's challenge request now does real async work before the
 * network call (fingerprint hashing via SubtleCrypto, a best-effort public-
 * key fetch for envelope encryption) — a fixed short setTimeout is no
 * longer a reliable proxy for "the request settled", especially when many
 * test files run concurrently under `node --test`'s parallel workers.
 * Polling with a generous ceiling keeps the common case fast while staying
 * robust under CPU contention.
 */
export async function waitFor(predicate, { timeoutMs = 2000, intervalMs = 5 } = {}) {
  const start = Date.now();
  for (;;) {
    if (predicate()) return true;
    if (Date.now() - start >= timeoutMs) return false;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
