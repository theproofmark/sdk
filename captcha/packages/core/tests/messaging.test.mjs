import assert from 'node:assert/strict';
import { test, before, beforeEach, afterEach } from 'node:test';

before(async () => {
  const { GlobalRegistrator } = await import('@happy-dom/global-registrator');
  GlobalRegistrator.register();
});

function makeWidgetWithIframe(src) {
  const iframe = document.createElement('iframe');
  iframe.src = src;
  document.body.appendChild(iframe);
  return {
    id: 0, iframe, popup: null, popupOrigin: null,
    _win: iframe.contentWindow,
  };
}

let uninstall;
afterEach(() => { if (uninstall) uninstall(); uninstall = null; });

test('accepts a well-formed token message from the iframe origin', async () => {
  const { installMessageListener } = await import('../dist/index.mjs');
  const w = makeWidgetWithIframe('https://verify.proofmark.com/verify/c/abc');
  let token = null;
  uninstall = installMessageListener(() => [w], {
    onReady() {}, onToken(_w, t) { token = t; }, onError() {},
  });
  window.dispatchEvent(new MessageEvent('message', {
    data: { source: 'proofmark-verify', type: 'pm-verify-token', token: 'TK' },
    origin: 'https://verify.proofmark.com',
    source: w._win,
  }));
  assert.equal(token, 'TK');
});

test('rejects a message with the wrong source discriminator', async () => {
  const { installMessageListener } = await import('../dist/index.mjs');
  const w = makeWidgetWithIframe('https://verify.proofmark.com/verify/c/abc');
  let token = null;
  uninstall = installMessageListener(() => [w], {
    onReady() {}, onToken(_w, t) { token = t; }, onError() {},
  });
  window.dispatchEvent(new MessageEvent('message', {
    data: { source: 'evil', type: 'pm-verify-token', token: 'TK' },
    origin: 'https://verify.proofmark.com', source: w._win,
  }));
  assert.equal(token, null);
});

test('rejects a correct-shape message from a foreign origin', async () => {
  const { installMessageListener } = await import('../dist/index.mjs');
  const w = makeWidgetWithIframe('https://verify.proofmark.com/verify/c/abc');
  let token = null;
  uninstall = installMessageListener(() => [w], {
    onReady() {}, onToken(_w, t) { token = t; }, onError() {},
  });
  window.dispatchEvent(new MessageEvent('message', {
    data: { source: 'proofmark-verify', type: 'pm-verify-token', token: 'TK' },
    origin: 'https://attacker.example', source: w._win,
  }));
  assert.equal(token, null);
});
