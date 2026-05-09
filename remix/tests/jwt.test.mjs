import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  decodeToken,
  isTokenExpired,
  getTokenExpiry,
  validateTokenClaims,
} from '../dist/server.mjs';

function base64UrlEncode(input) {
  return Buffer.from(input, 'utf8')
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function makeToken(payload, header = { alg: 'HS256', typ: 'JWT' }) {
  const h = base64UrlEncode(JSON.stringify(header));
  const p = base64UrlEncode(JSON.stringify(payload));
  return `${h}.${p}.signature`;
}

test('decodeToken returns null for malformed input', () => {
  assert.equal(decodeToken(''), null);
  assert.equal(decodeToken('not-a-jwt'), null);
  assert.equal(decodeToken('a.b'), null);
  assert.equal(decodeToken('a.@@@.c'), null);
});

test('decodeToken returns claims for a valid base64url payload', () => {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const token = makeToken({
    creator_hash: 'creator-1',
    fingerprint: 'fp-1',
    exp,
    nbf: exp - 7200,
    iss: 'showad-backend',
  });

  const claims = decodeToken(token);
  assert.equal(claims?.creator_hash, 'creator-1');
  assert.equal(claims?.fingerprint, 'fp-1');
  assert.equal(claims?.exp, exp);
});

test('isTokenExpired returns true when exp is in the past', () => {
  const token = makeToken({
    creator_hash: 'creator-1',
    exp: Math.floor(Date.now() / 1000) - 60,
  });
  assert.equal(isTokenExpired(token), true);
});

test('isTokenExpired returns true when nbf is in the future', () => {
  const token = makeToken({
    creator_hash: 'creator-1',
    exp: Math.floor(Date.now() / 1000) + 3600,
    nbf: Math.floor(Date.now() / 1000) + 600,
  });
  assert.equal(isTokenExpired(token), true);
});

test('getTokenExpiry returns exp claim or null', () => {
  const exp = Math.floor(Date.now() / 1000) + 1000;
  assert.equal(getTokenExpiry(makeToken({ exp })), exp);
  assert.equal(getTokenExpiry('garbage'), null);
});

test('validateTokenClaims enforces creator and fingerprint', () => {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const token = makeToken({
    creator_hash: 'creator-1',
    fingerprint: 'fp-1',
    exp,
    iss: 'showad-backend',
  });

  assert.deepEqual(validateTokenClaims(token, 'creator-1', 'fp-1'), { valid: true });
  assert.equal(validateTokenClaims(token, 'creator-2').valid, false);
  assert.equal(validateTokenClaims(token, 'creator-1', 'fp-other').valid, false);
});

test('validateTokenClaims rejects non-showad-backend issuer', () => {
  const token = makeToken({
    creator_hash: 'creator-1',
    exp: Math.floor(Date.now() / 1000) + 3600,
    iss: 'evil-issuer',
  });
  assert.equal(validateTokenClaims(token, 'creator-1').valid, false);
});
