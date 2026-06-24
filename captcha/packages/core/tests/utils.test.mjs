import assert from 'node:assert/strict';
import { test } from 'node:test';

import { escapeHtml, appendQueryParam, originOf, resolveCallback } from '../dist/index.mjs';

test('escapeHtml escapes all five special chars', () => {
  assert.equal(escapeHtml(`<a href="x">&'`), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;');
});

test('appendQueryParam uses ? then &', () => {
  assert.equal(appendQueryParam('https://h/p', 'a', '1'), 'https://h/p?a=1');
  assert.equal(appendQueryParam('https://h/p?x=0', 'a', '1 2'), 'https://h/p?x=0&a=1%202');
});

test('originOf returns origin or null', () => {
  assert.equal(originOf('https://verify.proofmark.com/verify/c/abc?z=1'), 'https://verify.proofmark.com');
  assert.equal(originOf(null), null);
  assert.equal(originOf('::::not a url'), null);
});

test('resolveCallback wraps a global fn-name string', () => {
  let got = '';
  globalThis.__pmCb = (t) => { got = t; };
  const fn = resolveCallback('__pmCb');
  fn('tok');
  assert.equal(got, 'tok');
  assert.equal(resolveCallback(undefined), null);
});
