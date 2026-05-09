import assert from 'node:assert/strict';
import { test } from 'node:test';
import crypto from 'node:crypto';

import {
  verifyAppProxyRequest,
  canonicalQueryString,
} from '../app/app/lib/shopify-proxy-hmac.ts';

/**
 * Fixtures from the official Shopify "Authenticate app proxies" docs
 * (https://shopify.dev/docs/apps/build/online-store/app-proxies/authenticate-app-proxies)
 * with `{shop}` replaced with `shop-name`. Shared secret = "hush".
 */
const SECRET = 'hush';

const LOGGED_IN_QS =
  'extra=1&extra=2&shop=shop-name.myshopify.com&logged_in_customer_id=1' +
  '&path_prefix=%2Fapps%2Fawesome_reviews&timestamp=1317327555' +
  '&signature=4c68c8624d737112c91818c11017d24d334b524cb5c2b8ba08daa056f7395ddb';

const ANONYMOUS_QS =
  'extra=1&extra=2&shop=shop-name.myshopify.com&logged_in_customer_id=' +
  '&path_prefix=%2Fapps%2Fawesome_reviews&timestamp=1317327555' +
  '&signature=e072b6d7e6622d85912a5214b860d3100dc1e73d9bc29f43796ac8c9ff8093cb';

test('canonical query string sorts and joins multi-values for logged-in customer', () => {
  const params = new URLSearchParams(LOGGED_IN_QS);
  assert.equal(
    canonicalQueryString(params),
    'extra=1,2logged_in_customer_id=1path_prefix=/apps/awesome_reviewsshop=shop-name.myshopify.comtimestamp=1317327555'
  );
});

test('canonical query string handles anonymous customer (empty value)', () => {
  const params = new URLSearchParams(ANONYMOUS_QS);
  assert.equal(
    canonicalQueryString(params),
    'extra=1,2logged_in_customer_id=path_prefix=/apps/awesome_reviewsshop=shop-name.myshopify.comtimestamp=1317327555'
  );
});

test('verifies the official Shopify docs logged-in fixture', () => {
  const url = new URL(`https://example.com/proxy/state?${LOGGED_IN_QS}`);
  assert.deepEqual(verifyAppProxyRequest(url, SECRET), { valid: true });
});

test('verifies the official Shopify docs anonymous fixture', () => {
  const url = new URL(`https://example.com/proxy/state?${ANONYMOUS_QS}`);
  assert.deepEqual(verifyAppProxyRequest(url, SECRET), { valid: true });
});

test('rejects mismatched signature with reason "mismatch"', () => {
  const tampered = LOGGED_IN_QS.replace(
    'signature=4c68c8624d737112c91818c11017d24d334b524cb5c2b8ba08daa056f7395ddb',
    'signature=ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
  );
  const url = new URL(`https://example.com/proxy/state?${tampered}`);
  const result = verifyAppProxyRequest(url, SECRET);
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'mismatch');
});

test('rejects request without signature param', () => {
  const url = new URL('https://example.com/proxy/state?shop=shop-name.myshopify.com&timestamp=1');
  const result = verifyAppProxyRequest(url, SECRET);
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'missing_signature');
});

test('rejects request when secret is empty', () => {
  const url = new URL(`https://example.com/proxy/state?${LOGGED_IN_QS}`);
  const result = verifyAppProxyRequest(url, '');
  assert.equal(result.valid, false);
});

test('rejects request when secret is wrong', () => {
  const url = new URL(`https://example.com/proxy/state?${LOGGED_IN_QS}`);
  const result = verifyAppProxyRequest(url, 'not-the-secret');
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'mismatch');
});

test('round-trip: a freshly signed URL verifies cleanly', () => {
  const params = new URLSearchParams({
    shop: 'demo.myshopify.com',
    timestamp: String(Math.floor(Date.now() / 1000)),
    path_prefix: '/apps/showad-gate',
    extra: 'value-with-comma,inline',
  });
  const sig = crypto
    .createHmac('sha256', SECRET)
    .update(canonicalQueryString(params))
    .digest('hex');
  params.set('signature', sig);
  const url = new URL(`https://example.com/proxy/state?${params.toString()}`);
  assert.deepEqual(verifyAppProxyRequest(url, SECRET), { valid: true });
});
