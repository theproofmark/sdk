import assert from 'node:assert/strict';
import { test, before } from 'node:test';

before(async () => {
  const { GlobalRegistrator } = await import('@happy-dom/global-registrator');
  GlobalRegistrator.register();
});

test('lockBodyScroll sets overflow hidden and unlock restores it', async () => {
  const { lockBodyScroll, unlockBodyScroll } = await import('../dist/index.mjs');
  document.body.style.overflow = 'scroll';
  const w = { };
  lockBodyScroll(w);
  assert.equal(document.body.style.overflow, 'hidden');
  unlockBodyScroll(w);
  assert.equal(document.body.style.overflow, 'scroll');
});

test('getFocusableElements finds buttons and iframes, skips disabled/-1', async () => {
  const { getFocusableElements } = await import('../dist/index.mjs');
  const root = document.createElement('div');
  root.innerHTML = '<button>a</button><button disabled>b</button>' +
    '<input tabindex="-1"><iframe></iframe>';
  const f = getFocusableElements(root);
  assert.equal(f.length, 2); // enabled button + iframe
});
