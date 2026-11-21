'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const load = () => import('../src/slides/export/exporter.js');

const browserEnv = { VideoEncoder: class {}, OffscreenCanvas: class {} };

test('isExportSupported is false when the browser has no WebCodecs or OffscreenCanvas', async () => {
  const { isExportSupported } = await load();
  const mb = { canEncodeVideo: async () => true };
  assert.equal(await isExportSupported(mb, {}), false);
  assert.equal(await isExportSupported(mb, { VideoEncoder: class {} }), false);
  assert.equal(await isExportSupported(mb, { OffscreenCanvas: class {} }), false);
});

test('isExportSupported is false when the browser cannot encode H.264 at 1920x1080', async () => {
  const { isExportSupported } = await load();
  assert.equal(await isExportSupported({ canEncodeVideo: async () => false }, browserEnv), false);
});

test('isExportSupported asks mediabunny about avc at 1920x1080 and returns its answer', async () => {
  const { isExportSupported } = await load();
  const calls = [];
  const mb = { canEncodeVideo: async (...args) => { calls.push(args); return true; } };
  assert.equal(await isExportSupported(mb, browserEnv), true);
  assert.deepEqual(calls, [['avc', { width: 1920, height: 1080 }]]);
});

test('createExclusive runs one job at a time and ignores a second click', async () => {
  const { createExclusive } = await load();
  const exclusive = createExclusive();
  let runs = 0;
  let release;
  const first = exclusive.run(() => { runs++; return new Promise((resolve) => { release = resolve; }); });
  const second = await exclusive.run(() => { runs++; });
  assert.deepEqual(second, { ran: false });
  release('done');
  assert.deepEqual(await first, { ran: true, value: 'done' });
  assert.equal(runs, 1);
});

test('createExclusive frees the lock after a job fails', async () => {
  const { createExclusive } = await load();
  const exclusive = createExclusive();
  await assert.rejects(exclusive.run(async () => { throw new Error('boom'); }), /boom/);
  assert.deepEqual(await exclusive.run(() => 'again'), { ran: true, value: 'again' });
});
