import assert from 'node:assert/strict';
import { test, before, beforeEach } from 'node:test';

before(async () => {
  const { GlobalRegistrator } = await import('@happy-dom/global-registrator');
  GlobalRegistrator.register();
});

beforeEach(() => { document.head.innerHTML = ''; document.body.innerHTML = ''; });

test('mounting ProofMarkVerify calls pmverify.render once script is ready', async () => {
  // Pre-install a fake global so the component skips real script loading.
  let rendered = null;
  window.pmverify = {
    render: (_el, opts) => { rendered = opts; return 7; },
    getResponse: () => '', reset() {}, remove() {}, execute() {},
  };
  const React = (await import('react')).default;
  const { createRoot } = await import('react-dom/client');
  const { ProofMarkVerify } = await import('../dist/index.mjs');

  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await new Promise((resolve) => {
    root.render(React.createElement(ProofMarkVerify, {
      siteKey: 'pmv_test_x', onToken: () => {},
    }));
    setTimeout(resolve, 30);
  });
  assert.ok(rendered, 'pmverify.render was called');
  assert.equal(rendered.sitekey, 'pmv_test_x');
});

test('onLockout prop is forwarded as lockout-callback and invoked with the info object', async () => {
  let rendered = null;
  window.pmverify = {
    render: (_el, opts) => { rendered = opts; return 7; },
    getResponse: () => '', reset() {}, remove() {}, execute() {},
  };
  const React = (await import('react')).default;
  const { createRoot } = await import('react-dom/client');
  const { ProofMarkVerify } = await import('../dist/index.mjs');

  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  let received = null;
  await new Promise((resolve) => {
    root.render(React.createElement(ProofMarkVerify, {
      siteKey: 'pmv_test_x',
      onToken: () => {},
      onLockout: (info) => { received = info; },
    }));
    setTimeout(resolve, 30);
  });
  assert.equal(typeof rendered['lockout-callback'], 'function');
  rendered['lockout-callback']({ code: 'locked-out', tier: 'severe', retryAfterSec: 60 });
  assert.deepEqual(received, { code: 'locked-out', tier: 'severe', retryAfterSec: 60 });
});
