import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

test('sync runs and either writes the file or fails with a helpful message', () => {
  const script = resolve(__dirname, 'sync-frontend.mjs');
  const res = spawnSync(process.execPath, [script], { encoding: 'utf8' });
  // Post-build the bundle exists → exit 0 and a "[sync] wrote" line.
  // Pre-build the bundle is absent → exit 1 and a "core bundle not found" message.
  // Never a crash (some other non-0/1 code or a stack trace with no guard message).
  assert.ok(res.status === 0 || res.status === 1, `unexpected exit ${res.status}: ${res.stderr}`);
  if (res.status === 0) assert.match(res.stdout, /\[sync\] wrote/);
  if (res.status === 1) assert.match(res.stderr, /core bundle not found/);
});
