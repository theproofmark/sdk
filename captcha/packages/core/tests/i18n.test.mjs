import assert from 'node:assert/strict';
import { test } from 'node:test';

import { resolveLocale, isRTL, strings, SUPPORTED_LOCALES } from '../dist/index.mjs';

test('resolveLocale handles base tags, regions, and fallback', () => {
  assert.equal(resolveLocale('en-US'), 'en');
  assert.equal(resolveLocale('fr'), 'fr');
  assert.equal(resolveLocale('DE,en;q=0.9'), 'de');
  assert.equal(resolveLocale('xx-YY'), 'en');
  assert.equal(resolveLocale(''), 'en');
  assert.equal(resolveLocale(undefined), 'en');
});

test('resolveLocale distinguishes Chinese scripts', () => {
  assert.equal(resolveLocale('zh'), 'zh-CN');
  assert.equal(resolveLocale('zh-CN'), 'zh-CN');
  assert.equal(resolveLocale('zh-Hant'), 'zh-TW');
  assert.equal(resolveLocale('zh-TW'), 'zh-TW');
  assert.equal(resolveLocale('zh-HK'), 'zh-TW');
});

test('isRTL true only for ar/he/fa', () => {
  assert.equal(isRTL('ar'), true);
  assert.equal(isRTL('he'), true);
  assert.equal(isRTL('fa'), true);
  assert.equal(isRTL('en'), false);
});

test('every supported locale has a complete string block', () => {
  const keys = ['checkbox_label','brand','verified','popup_title','popup_body','popup_button','aria_label','aria_close'];
  for (const loc of SUPPORTED_LOCALES) {
    const s = strings(loc);
    for (const k of keys) assert.ok(s[k] && s[k].length > 0, `${loc}.${k} missing`);
  }
});

test('unknown locale falls back to en strings', () => {
  assert.equal(strings('xx').checkbox_label, strings('en').checkbox_label);
});
