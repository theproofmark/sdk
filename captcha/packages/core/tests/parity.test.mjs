import assert from 'node:assert/strict';
import { test, before, beforeEach, afterEach } from 'node:test';

before(async () => {
  const { GlobalRegistrator } = await import('@happy-dom/global-registrator');
  GlobalRegistrator.register();
});

let realFetch;
beforeEach(() => { realFetch = globalThis.fetch; });
afterEach(() => { globalThis.fetch = realFetch; document.body.innerHTML = ''; });

test('importing the module installs window.pmverify with the full public shape', async () => {
  // The built module installs window.pmverify on import (capability gate passes under happy-dom).
  await import('../dist/index.mjs');
  for (const m of ['render', 'getResponse', 'reset', 'remove', 'execute']) {
    assert.equal(typeof window.pmverify[m], 'function', `pmverify.${m} missing`);
  }
});

test('render throws on missing sitekey and missing container', async () => {
  await import('../dist/index.mjs');
  assert.throws(() => window.pmverify.render('no-such-id', { sitekey: 'x' }), /container not found/);
  const div = document.createElement('div'); document.body.appendChild(div);
  assert.throws(() => window.pmverify.render(div, {}), /sitekey required/);
});

test('success sets a hidden pm-verify-response input inside the enclosing form', async () => {
  await import('../dist/index.mjs');
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ challenge_id: 'c', token: 'TKN' }) });
  const form = document.createElement('form');
  const div = document.createElement('div');
  form.appendChild(div); document.body.appendChild(form);
  window.pmverify.render(div, { sitekey: 'pmv_test_x' });
  div.querySelector('[role="button"]').click();
  await new Promise((r) => setTimeout(r, 10));
  const hidden = form.querySelector('input[name="pm-verify-response"]');
  assert.ok(hidden, 'hidden input present');
  assert.equal(hidden.value, 'TKN');
});

test('reset clears token and removes the hidden input', async () => {
  await import('../dist/index.mjs');
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ challenge_id: 'c', token: 'TKN' }) });
  const form = document.createElement('form');
  const div = document.createElement('div');
  form.appendChild(div); document.body.appendChild(form);
  const id = window.pmverify.render(div, { sitekey: 'pmv_test_x' });
  div.querySelector('[role="button"]').click();
  await new Promise((r) => setTimeout(r, 10));
  window.pmverify.reset(id);
  assert.equal(window.pmverify.getResponse(id), '');
  assert.equal(form.querySelector('input[name="pm-verify-response"]'), null);
});

test('opening a second widget supersedes the first widget modal', async () => {
  await import('../dist/index.mjs');
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ challenge_id: 'c', embed_url: 'https://verify.proofmark.com/verify/c/c' }) });
  const mk = () => { const d = document.createElement('div'); document.body.appendChild(d); return d; };
  const d1 = mk(), d2 = mk();
  window.pmverify.render(d1, { sitekey: 'x' });
  window.pmverify.render(d2, { sitekey: 'x' });
  d1.querySelector('[role="button"]').click();
  await new Promise((r) => setTimeout(r, 10));
  d2.querySelector('[role="button"]').click();
  await new Promise((r) => setTimeout(r, 10));
  // Only one modal overlay should exist at a time.
  const modals = document.querySelectorAll('[role="dialog"]');
  assert.ok(modals.length <= 1, `expected <=1 modal, got ${modals.length}`);
});
