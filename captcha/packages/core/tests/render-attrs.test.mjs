import assert from 'node:assert/strict';
import { test, before, beforeEach, afterEach } from 'node:test';

before(async () => {
  const { GlobalRegistrator } = await import('@happy-dom/global-registrator');
  GlobalRegistrator.register();
});

let realFetch;
beforeEach(() => { realFetch = globalThis.fetch; });
afterEach(() => { globalThis.fetch = realFetch; document.body.innerHTML = ''; });

test('an Arabic widget sets dir="rtl" on its container', async () => {
  await import('../dist/index.mjs');
  const div = document.createElement('div');
  document.body.appendChild(div);
  window.pmverify.render(div, { sitekey: 'pmv_test_x', lang: 'ar' });
  assert.equal(div.getAttribute('dir'), 'rtl');
  assert.equal(div.getAttribute('lang'), 'ar');
});

test('an English widget sets dir="ltr" on its container', async () => {
  await import('../dist/index.mjs');
  const div = document.createElement('div');
  document.body.appendChild(div);
  window.pmverify.render(div, { sitekey: 'pmv_test_x', lang: 'en' });
  assert.equal(div.getAttribute('dir'), 'ltr');
});

test('resolveTheme honors explicit values and falls back via matchMedia', async () => {
  const mod = await import('../dist/index.mjs');
  assert.equal(mod.resolveTheme('dark'), 'dark');
  assert.equal(mod.resolveTheme('light'), 'light');
  // 'auto' resolves to 'light' or 'dark' depending on matchMedia; just assert it's one of them.
  assert.ok(['light', 'dark'].includes(mod.resolveTheme('auto')));
  assert.ok(['light', 'dark'].includes(mod.resolveTheme(undefined)));
});
