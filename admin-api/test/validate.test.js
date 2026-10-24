'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { inspectImage, validateRole, validatePair, ValidationError } = require('../src/slides/validate');
const { makePng, makeJpeg } = require('./helpers');

const SMALL = 1024;

test('text with 50% transparent passes', async () => {
  const meta = await inspectImage(await makePng({ width: 1920, height: 1080, transparentRatio: 0.5 }));
  assert.deepEqual(validateRole(meta, 'text', SMALL).errors, []);
});

test('opaque png text passes', async () => {
  const meta = await inspectImage(await makePng({ width: 1920, height: 1080, transparentRatio: 0 }));
  assert.deepEqual(validateRole(meta, 'text', SMALL), { errors: [], warnings: [] });
});

test('jpeg as text passes', async () => {
  const meta = await inspectImage(await makeJpeg({ width: 1920, height: 1080 }));
  assert.deepEqual(validateRole(meta, 'text', SMALL), { errors: [], warnings: [] });
});

test('jpeg as background passes', async () => {
  const meta = await inspectImage(await makeJpeg({ width: 1920, height: 1080 }));
  assert.deepEqual(validateRole(meta, 'background', SMALL), { errors: [], warnings: [] });
});

test('background over 25 MB fails', async () => {
  const meta = await inspectImage(await makeJpeg({ width: 1920, height: 1080 }));
  assert.ok(validateRole(meta, 'background', 25 * 1024 * 1024 + 1).errors.length > 0);
});

test('1280x720 background only warns', async () => {
  const meta = await inspectImage(await makeJpeg({ width: 1280, height: 720 }));
  const result = validateRole(meta, 'background', SMALL);
  assert.deepEqual(result.errors, []);
  assert.equal(result.warnings.length, 1);
});

test('pair 1920x1080 + 3840x2160 passes', async () => {
  const bg = await inspectImage(await makeJpeg({ width: 1920, height: 1080 }));
  const text = await inspectImage(await makePng({ width: 3840, height: 2160, transparentRatio: 0.5 }));
  assert.deepEqual(validatePair(bg, text).errors, []);
});

test('pair 1920x1080 + 1920x1200 fails', async () => {
  const bg = await inspectImage(await makeJpeg({ width: 1920, height: 1080 }));
  const text = await inspectImage(await makePng({ width: 1920, height: 1200, transparentRatio: 0.5 }));
  assert.equal(validatePair(bg, text).errors.length, 1);
});

for (const [label, make] of [
  ['truncated png with alpha', () => makePng({ width: 1920, height: 1080, transparentRatio: 0.5 })],
  ['truncated jpeg', () => makeJpeg({ width: 1920, height: 1080 })],
]) {
  test(`${label} is rejected as corrupted`, async () => {
    const full = await make();
    await assert.rejects(inspectImage(full.subarray(0, Math.floor(full.length / 2))), (err) => {
      assert.ok(err instanceof ValidationError);
      assert.deepEqual(err.errors, ['O arquivo está corrompido ou incompleto.']);
      return true;
    });
  });
}

test('non-image buffer is rejected with message', async () => {
  await assert.rejects(inspectImage(Buffer.from('%PDF-1.4')), (err) => {
    assert.ok(err instanceof ValidationError);
    assert.match(err.errors[0], /imagem/i);
    return true;
  });
});
