'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const load = () => import('../src/slides/export/frames.js');

test('background fades in over 0.8 s with ease-out', async () => {
  const f = await load();
  assert.equal(f.opacityAt('background', 0), 0);
  assert.equal(f.opacityAt('background', 0.8), 1);
  assert.equal(f.opacityAt('background', 5), 1);
  assert.ok(f.opacityAt('background', 0.4) > 0.5, 'ease-out is above linear at the midpoint');
});

test('text stays hidden until 1.0 s, then fades in over 0.8 s with ease', async () => {
  const f = await load();
  assert.equal(f.opacityAt('text', 0), 0);
  assert.equal(f.opacityAt('text', 0.99), 0);
  assert.equal(f.opacityAt('text', 1.0), 0);
  assert.equal(f.opacityAt('text', 1.8), 1);
  assert.ok(Math.abs(f.opacityAt('text', 1.4) - 0.8024) < 0.01, 'CSS ease at 50% is about 0.8024');
});

test('opacity never decreases over the 2 s timeline', async () => {
  const f = await load();
  for (const layer of ['background', 'text']) {
    let previous = 0;
    for (let i = 0; i <= 60; i++) {
      const value = f.opacityAt(layer, i / 30);
      assert.ok(value >= previous, `${layer} dropped at frame ${i}`);
      previous = value;
    }
  }
});

test('there are 60 frames and the last one shows everything', async () => {
  const f = await load();
  assert.equal(f.frameCount(), 60);
  assert.equal(f.opacityAt('background', f.frameTimestamp(59)), 1);
  assert.equal(f.opacityAt('text', f.frameTimestamp(59)), 1);
});

test('containRect fits any image into 1920x1080 without distortion', async () => {
  const f = await load();
  assert.deepEqual(f.containRect(1920, 1080), { x: 0, y: 0, width: 1920, height: 1080 });

  const wide = f.containRect(1098, 561);
  assert.equal(wide.width, 1920);
  assert.ok(Math.abs(wide.height - 981) < 0.5);
  assert.equal(wide.x, 0);
  assert.ok(Math.abs(wide.y - 49.5) < 0.5);

  const square = f.containRect(1080, 1080);
  assert.equal(square.width, 1080);
  assert.equal(square.x, 420);
});

test('movFileName pads to two digits, or more when there are over 99 slides', async () => {
  const f = await load();
  assert.equal(f.movFileName(0, 22), '01.mov');
  assert.equal(f.movFileName(21, 22), '22.mov');
  assert.equal(f.movFileName(0, 101), '001.mov');
  assert.equal(f.movFileName(100, 101), '101.mov');
});

test('zipFileName uses the folder name', async () => {
  const f = await load();
  assert.equal(f.zipFileName('10_10_2026'), 'anuncios-10_10_2026.zip');
});

test('folderFromPath reads the mm_dd_yyyy folder from the page path', async () => {
  const f = await load();
  assert.equal(f.folderFromPath('/10_10_2026/'), '10_10_2026');
  assert.equal(f.folderFromPath('/10_10_2026/index.html'), '10_10_2026');
  assert.equal(f.folderFromPath('/'), null);
  assert.equal(f.folderFromPath('/abc/'), null);
});

test('activeSlideIndex maps the two-step player position to a slide', async () => {
  const f = await load();
  assert.equal(f.activeSlideIndex(0), 0);
  assert.equal(f.activeSlideIndex(1), 0);
  assert.equal(f.activeSlideIndex(2), 1);
  assert.equal(f.activeSlideIndex(5), 2);
});
