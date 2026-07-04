import assert from 'node:assert/strict';
import { test, before, beforeEach, afterEach } from 'node:test';
import { waitFor } from './helpers.mjs';

before(async () => {
  const { GlobalRegistrator } = await import('@happy-dom/global-registrator');
  GlobalRegistrator.register();
});

let realFetch;
beforeEach(() => { realFetch = globalThis.fetch; });
afterEach(() => { globalThis.fetch = realFetch; document.body.innerHTML = ''; });

function mountWidget() {
  const div = document.createElement('div');
  document.body.appendChild(div);
  return div;
}

test('passive-pass response sets token without opening a modal', async () => {
  const mod = await import('../dist/index.mjs');
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ challenge_id: 'c1', token: 'PASS' }) });
  const div = mountWidget();
  let got = null;
  mod.render(div, { sitekey: 'pmv_test_x', callback: (t) => { got = t; } });
  div.querySelector('[role="button"]').click();
  await waitFor(() => got !== null);
  assert.equal(got, 'PASS');                            // token delivered via callback
  assert.equal(document.querySelector('iframe'), null); // no modal iframe
});

test('interactive response opens a modal iframe at embed_url', async () => {
  const mod = await import('../dist/index.mjs');
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ challenge_id: 'c2', embed_url: 'https://verify.proofmark.com/verify/c/c2' }) });
  const div = mountWidget();
  mod.render(div, { sitekey: 'pmv_test_x' });
  div.querySelector('[role="button"]').click();
  await waitFor(() => document.querySelector('iframe') !== null);
  const iframe = document.querySelector('iframe');
  assert.ok(iframe, 'expected a modal iframe');
  assert.ok(iframe.src.startsWith('https://verify.proofmark.com/verify/c/c2'));
  assert.match(iframe.src, /pmv_parent_origin=/);
});

test('locked-out response renders a locked checkbox and fires lockout-callback', async () => {
  const mod = await import('../dist/index.mjs');
  globalThis.fetch = async () => ({
    ok: false,
    json: async () => ({ 'error-codes': ['locked-out'], lockout_tier: 'moderate', retry_after_sec: 120 }),
  });
  const div = mountWidget();
  let info = null;
  let errorCode = null;
  mod.render(div, {
    sitekey: 'pmv_test_x',
    'lockout-callback': (i) => { info = i; },
    'error-callback': (c) => { errorCode = c; },
  });
  div.querySelector('[role="button"]').click();
  await waitFor(() => info !== null);
  assert.equal(info.code, 'locked-out');
  assert.equal(info.tier, 'moderate');
  assert.equal(info.retryAfterSec, 120);
  assert.equal(errorCode, null, 'error-callback should not fire when lockout-callback is set');
  assert.equal(div.querySelector('[role="button"]'), null, 'checkbox must not be clickable while locked');
});

test('locked-out response falls back to error-callback when no lockout-callback is set', async () => {
  const mod = await import('../dist/index.mjs');
  globalThis.fetch = async () => ({
    ok: false,
    json: async () => ({ 'error-codes': ['locked-out'] }),
  });
  const div = mountWidget();
  let errorCode = null;
  mod.render(div, { sitekey: 'pmv_test_x', 'error-callback': (c) => { errorCode = c; } });
  div.querySelector('[role="button"]').click();
  await waitFor(() => errorCode !== null);
  assert.equal(errorCode, 'locked-out');
});

test('non-ok response triggers error-callback and restores checkbox', async () => {
  const mod = await import('../dist/index.mjs');
  globalThis.fetch = async () => ({ ok: false, json: async () => ({ 'error-codes': ['bad-sitekey'] }) });
  const div = mountWidget();
  let code = null;
  mod.render(div, { sitekey: 'pmv_test_x', 'error-callback': (c) => { code = c; } });
  div.querySelector('[role="button"]').click();
  await waitFor(() => code !== null);
  assert.equal(code, 'bad-sitekey');
  assert.ok(div.querySelector('[role="button"]'), 'checkbox restored');
});
