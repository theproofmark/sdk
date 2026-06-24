#!/usr/bin/env node
// Copies the compiled core bundle into the frontend public dir so the served
// widget always matches @proofmark/verify-js. The frontend file is GENERATED —
// do not hand-edit it.
import { readFile, writeFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dirname, '../packages/core/dist/api.js');
const DEST = resolve(__dirname, '../../../frontend/public/verify/api.js');

const BANNER =
  '/* GENERATED from sdks/captcha/packages/core (@proofmark/verify-js) — do not edit by hand. */\n';

async function main() {
  try {
    await access(SRC);
  } catch {
    console.error(`[sync] core bundle not found at ${SRC}. Run "npm run build" first.`);
    process.exit(1);
  }
  const bundle = await readFile(SRC, 'utf8');
  await writeFile(DEST, BANNER + bundle, 'utf8');
  console.log(`[sync] wrote ${DEST} (${bundle.length} bytes + banner)`);
}

main().catch((err) => { console.error(err); process.exit(1); });
