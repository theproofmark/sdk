import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  decodeToken,
  isTokenExpired,
  getTokenExpiry,
  validateTokenClaims,
} from '../dist/index.mjs';

function base64url(input) {
  return Buffer.from(input).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function makeToken(claims) {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify(claims));
  return `${header}.${payload}.signature`;
}

const FUTURE = Math.floor(Date.now() / 1000) + 3600;
const PAST = Math.floor(Date.now() / 1000) - 60;

test('decodeToken parses claims', () => {
  const token = makeToken({ creator_hash: 'creator-1', exp: FUTURE });
  const claims = decodeToken(token);
  assert.equal(claims.creator_hash, 'creator-1');
  assert.equal(claims.exp, FUTURE);
});

test('decodeToken returns null for malformed input', () => {
  assert.equal(decodeToken('not-a-jwt'), null);
  assert.equal(decodeToken(''), null);
  assert.equal(decodeToken('a.b'), null);
});

test('isTokenExpired returns true for past exp', () => {
  const token = makeToken({ creator_hash: 'c', exp: PAST });
  assert.equal(isTokenExpired(token), true);
});

test('isTokenExpired returns false for future exp', () => {
  const token = makeToken({ creator_hash: 'c', exp: FUTURE });
  assert.equal(isTokenExpired(token), false);
});

test('isTokenExpired returns true when nbf is in the future', () => {
  const token = makeToken({ creator_hash: 'c', exp: FUTURE, nbf: FUTURE });
  assert.equal(isTokenExpired(token), true);
});

test('getTokenExpiry returns exp value', () => {
  const token = makeToken({ creator_hash: 'c', exp: FUTURE });
  assert.equal(getTokenExpiry(token), FUTURE);
});

test('validateTokenClaims accepts a valid token', () => {
  const token = makeToken({
    creator_hash: 'creator-1',
    fingerprint: 'fp-1',
    exp: FUTURE,
    iss: 'showad-backend',
  });
  const result = validateTokenClaims(token, 'creator-1', 'fp-1');
  assert.equal(result.valid, true);
});

test('validateTokenClaims rejects creator mismatch', () => {
  const token = makeToken({ creator_hash: 'creator-1', exp: FUTURE });
  const result = validateTokenClaims(token, 'creator-2');
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'creator_mismatch');
});

test('validateTokenClaims rejects fingerprint mismatch', () => {
  const token = makeToken({ creator_hash: 'c', fingerprint: 'fp-a', exp: FUTURE });
  const result = validateTokenClaims(token, 'c', 'fp-b');
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'fingerprint_mismatch');
});

test('validateTokenClaims allows missing fingerprint cookie', () => {
  const token = makeToken({ creator_hash: 'c', fingerprint: 'fp', exp: FUTURE });
  const result = validateTokenClaims(token, 'c');
  assert.equal(result.valid, true);
});

test('validateTokenClaims rejects unknown issuer', () => {
  const token = makeToken({ creator_hash: 'c', exp: FUTURE, iss: 'rogue' });
  const result = validateTokenClaims(token, 'c');
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'invalid_issuer');
});

test('validateTokenClaims rejects expired token', () => {
  const token = makeToken({ creator_hash: 'c', exp: PAST });
  const result = validateTokenClaims(token, 'c');
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'expired');
});
