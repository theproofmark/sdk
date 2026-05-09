import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  decodeToken,
  isTokenExpired,
  getTokenExpiry,
  validateTokenClaims,
} from '../dist/server.mjs';

const ENCODER = (obj) =>
  Buffer.from(JSON.stringify(obj), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

function makeToken(claims) {
  const header = ENCODER({ alg: 'HS256', typ: 'JWT' });
  const payload = ENCODER(claims);
  return `${header}.${payload}.signature-not-checked`;
}

const NOW = Math.floor(Date.now() / 1000);
const baseClaims = {
  fingerprint: 'fp-123',
  ip_address: '203.0.113.10',
  creator_hash: 'creator-abc',
  session_hash: 'sess-xyz',
  iat: NOW - 60,
  nbf: NOW - 60,
  exp: NOW + 600,
  iss: 'showad-backend',
};

test('decodeToken returns null for malformed input', () => {
  assert.equal(decodeToken(''), null);
  assert.equal(decodeToken('not.a.jwt.at.all'), null);
  assert.equal(decodeToken('only-one-part'), null);
});

test('decodeToken extracts claims from a valid base64url payload', () => {
  const token = makeToken(baseClaims);
  const claims = decodeToken(token);
  assert.equal(claims.creator_hash, 'creator-abc');
  assert.equal(claims.fingerprint, 'fp-123');
  assert.equal(claims.iss, 'showad-backend');
});

test('isTokenExpired returns true past exp', () => {
  const expired = makeToken({ ...baseClaims, exp: NOW - 10 });
  assert.equal(isTokenExpired(expired), true);
});

test('isTokenExpired returns true before nbf', () => {
  const future = makeToken({ ...baseClaims, nbf: NOW + 600 });
  assert.equal(isTokenExpired(future), true);
});

test('isTokenExpired returns false for valid window', () => {
  assert.equal(isTokenExpired(makeToken(baseClaims)), false);
});

test('getTokenExpiry returns the exp claim in seconds', () => {
  assert.equal(getTokenExpiry(makeToken(baseClaims)), baseClaims.exp);
  assert.equal(getTokenExpiry('garbage'), null);
});

test('validateTokenClaims rejects when creator_hash mismatches', () => {
  const result = validateTokenClaims(makeToken(baseClaims), 'other-creator', 'fp-123');
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'creator_mismatch');
});

test('validateTokenClaims rejects when fingerprint mismatches', () => {
  const result = validateTokenClaims(makeToken(baseClaims), 'creator-abc', 'fp-other');
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'fingerprint_mismatch');
});

test('validateTokenClaims rejects on bad issuer', () => {
  const token = makeToken({ ...baseClaims, iss: 'evil-issuer' });
  const result = validateTokenClaims(token, 'creator-abc', 'fp-123');
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'invalid_issuer');
});

test('validateTokenClaims accepts a happy-path token', () => {
  const result = validateTokenClaims(makeToken(baseClaims), 'creator-abc', 'fp-123');
  assert.deepEqual(result, { valid: true });
});

test('validateTokenClaims tolerates missing fingerprint when not requested', () => {
  const result = validateTokenClaims(makeToken(baseClaims), 'creator-abc');
  assert.deepEqual(result, { valid: true });
});
