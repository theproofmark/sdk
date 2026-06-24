import assert from 'node:assert/strict';
import { test, before, beforeEach, afterEach } from 'node:test';

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
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(got, 'PASS');                            // token delivered via callback
  assert.equal(document.querySelector('iframe'), null); // no modal iframe
});

test('interactive response opens a modal iframe at embed_url', async () => {
  const mod = await import('../dist/index.mjs');
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ challenge_id: 'c2', embed_url: 'https://verify.proofmark.com/verify/c/c2' }) });
  const div = mountWidget();
  mod.render(div, { sitekey: 'pmv_test_x' });
  div.querySelector('[role="button"]').click();
  await new Promise((r) => setTimeout(r, 10));
  const iframe = document.querySelector('iframe');
  assert.ok(iframe, 'expected a modal iframe');
  assert.ok(iframe.src.startsWith('https://verify.proofmark.com/verify/c/c2'));
  assert.match(iframe.src, /pmv_parent_origin=/);
});

test('non-ok response triggers error-callback and restores checkbox', async () => {
  const mod = await import('../dist/index.mjs');
  globalThis.fetch = async () => ({ ok: false, json: async () => ({ 'error-codes': ['bad-sitekey'] }) });
  const div = mountWidget();
  let code = null;
  mod.render(div, { sitekey: 'pmv_test_x', 'error-callback': (c) => { code = c; } });
  div.querySelector('[role="button"]').click();
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(code, 'bad-sitekey');
  assert.ok(div.querySelector('[role="button"]'), 'checkbox restored');
});
