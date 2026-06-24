import assert from 'node:assert/strict';
import { test, before, beforeEach } from 'node:test';

before(async () => {
  const { GlobalRegistrator } = await import('@happy-dom/global-registrator');
  GlobalRegistrator.register();
});

beforeEach(async () => {
  const { __resetLoaders } = await import('../dist/index.mjs');
  __resetLoaders?.();
  document.head.innerHTML = '';
  delete window.pmverify;
});

test('two loads for the same base inject exactly one script tag', async () => {
  const { loadVerifyScript } = await import('../dist/index.mjs');
  loadVerifyScript('https://verify.proofmark.com');
  loadVerifyScript('https://verify.proofmark.com');
  const tags = document.querySelectorAll('script[src*="api.js"]');
  assert.equal(tags.length, 1);
  assert.match(tags[0].src, /render=explicit/);
});

test('resolves immediately if window.pmverify already present', async () => {
  const { loadVerifyScript } = await import('../dist/index.mjs');
  window.pmverify = { render: () => 0, getResponse: () => '', reset() {}, remove() {}, execute() {} };
  await loadVerifyScript(); // should not hang
  assert.ok(true);
});
