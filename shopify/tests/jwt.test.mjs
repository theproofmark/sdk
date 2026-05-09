import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  decodeToken,
  isTokenExpired,
  validateTokenClaims,
  getTokenExpiry,
  getTimeUntilExpiry,
  getCreatorHashFromToken,
  getFingerprintFromToken,
  getSessionHashFromToken,
} from '../app/app/lib/proofmark/jwt.ts';

function makeToken(claims) {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify(claims));
  return `${header}.${payload}.fakesignature`;
}

function base64url(input) {
  return Buffer.from(input, 'utf-8').toString('base64')
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

test('decodeToken returns claims for a well-formed token', () => {
  const claims = { creator_hash: 'creator-1', session_hash: 'sess-1', exp: 9999999999 };
  const out = decodeToken(makeToken(claims));
  assert.equal(out.creator_hash, 'creator-1');
  assert.equal(out.session_hash, 'sess-1');
});

test('decodeToken returns null for malformed input', () => {
  assert.equal(decodeToken(''), null);
  assert.equal(decodeToken('not.a.token.at.all'), null);
  assert.equal(decodeToken('only-one-segment'), null);
  assert.equal(decodeToken('bad.payload'), null);
});

test('isTokenExpired honors exp', () => {
  const expired = makeToken({ creator_hash: 'c', session_hash: 's', exp: 1 });
  const fresh = makeToken({ creator_hash: 'c', session_hash: 's', exp: Math.floor(Date.now()/1000) + 3600 });
  assert.equal(isTokenExpired(expired), true);
  assert.equal(isTokenExpired(fresh), false);
});

test('isTokenExpired honors nbf in the future', () => {
  const future = makeToken({ creator_hash: 'c', session_hash: 's', nbf: Math.floor(Date.now()/1000) + 600, exp: Math.floor(Date.now()/1000) + 3600 });
  assert.equal(isTokenExpired(future), true);
});

test('validateTokenClaims rejects mismatched creator hash', () => {
  const token = makeToken({ creator_hash: 'real', session_hash: 'sess', exp: Math.floor(Date.now()/1000) + 3600 });
  const v = validateTokenClaims(token, 'other-creator');
  assert.equal(v.valid, false);
  assert.match(v.reason, /Creator hash mismatch/);
});

test('validateTokenClaims rejects mismatched fingerprint when provided', () => {
  const token = makeToken({ creator_hash: 'c', session_hash: 's', fingerprint: 'fp-A', exp: Math.floor(Date.now()/1000) + 3600 });
  const v = validateTokenClaims(token, 'c', 'fp-B');
  assert.equal(v.valid, false);
  assert.match(v.reason, /Fingerprint mismatch/);
});

test('validateTokenClaims rejects unknown issuer', () => {
  const token = makeToken({ creator_hash: 'c', session_hash: 's', iss: 'somebody-else', exp: Math.floor(Date.now()/1000) + 3600 });
  const v = validateTokenClaims(token, 'c');
  assert.equal(v.valid, false);
  assert.match(v.reason, /Invalid issuer/);
});

test('validateTokenClaims accepts expected issuer', () => {
  const token = makeToken({ creator_hash: 'c', session_hash: 's', iss: 'showad-backend', exp: Math.floor(Date.now()/1000) + 3600 });
  const v = validateTokenClaims(token, 'c');
  assert.equal(v.valid, true);
});

test('validateTokenClaims rejects token missing required claims', () => {
  const noCreator = makeToken({ session_hash: 's', exp: Math.floor(Date.now()/1000) + 3600 });
  assert.equal(validateTokenClaims(noCreator, 'c').valid, false);
  const noSession = makeToken({ creator_hash: 'c', exp: Math.floor(Date.now()/1000) + 3600 });
  assert.equal(validateTokenClaims(noSession, 'c').valid, false);
});

test('claim extraction helpers return expected fields', () => {
  const token = makeToken({ creator_hash: 'c-x', session_hash: 's-y', fingerprint: 'fp-z', exp: 9999999999 });
  assert.equal(getCreatorHashFromToken(token), 'c-x');
  assert.equal(getSessionHashFromToken(token), 's-y');
  assert.equal(getFingerprintFromToken(token), 'fp-z');
  assert.equal(getTokenExpiry(token), 9999999999 * 1000);
  assert.ok(getTimeUntilExpiry(token) > 0);
});
