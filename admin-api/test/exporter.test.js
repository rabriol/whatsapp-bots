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

const slidesOf = (n) => Array.from({ length: n }, (_, i) => ({ background: `img/b${i}.png`, text: `img/t${i}.png` }));
const fakeRender = async (slide) => new TextEncoder().encode(`mov:${slide.background}`);

test('exportFolder zips one numbered MOV per slide and reports progress', async () => {
  const { exportFolder } = await load();
  const fflate = await import('fflate');
  const progress = [];
  const zip = await exportFolder({
    render: fakeRender, fflate, slides: slidesOf(3), folder: '10_10_2026',
    onProgress: (current, total) => progress.push([current, total]),
  });
  assert.deepEqual(progress, [[1, 3], [2, 3], [3, 3]]);
  assert.equal(zip.name, 'anuncios-10_10_2026.zip');
  const files = fflate.unzipSync(zip.data);
  assert.deepEqual(Object.keys(files), ['01.mov', '02.mov', '03.mov']);
  assert.equal(new TextDecoder().decode(files['02.mov']), 'mov:img/b1.png');
});

test('exportFolder stops with an ExportError naming the failing slide and builds no zip', async () => {
  const { exportFolder, ExportError } = await load();
  const fflate = await import('fflate');
  const rendered = [];
  const render = async (slide) => {
    rendered.push(slide.background);
    if (slide.background === 'img/b1.png') throw new Error('image 404');
    return new Uint8Array([1]);
  };
  await assert.rejects(
    exportFolder({ render, fflate, slides: slidesOf(3), folder: '10_10_2026', onProgress() {} }),
    (err) => err instanceof ExportError && err.slideNumber === 2 && err.message === 'Não foi possível gerar o slide 2.',
  );
  assert.deepEqual(rendered, ['img/b0.png', 'img/b1.png'], 'slide 3 must not be rendered after the failure');
});

test('exportFolder keeps MOV names sortable with more than 99 slides', async () => {
  const { exportFolder } = await load();
  const fflate = await import('fflate');
  const zip = await exportFolder({ render: async () => new Uint8Array([1]), fflate, slides: slidesOf(101), folder: '10_10_2026', onProgress() {} });
  const names = Object.keys(fflate.unzipSync(zip.data));
  assert.equal(names[0], '001.mov');
  assert.equal(names[100], '101.mov');
  assert.deepEqual([...names].sort(), names);
});

test('exportFolder rejects a folder with no slides', async () => {
  const { exportFolder } = await load();
  const fflate = await import('fflate');
  await assert.rejects(exportFolder({ render: fakeRender, fflate, slides: [], folder: '10_10_2026', onProgress() {} }), /Nenhum slide para exportar\./);
});

test('renderSlide turns any failure into an ExportError naming the slide', async () => {
  const { renderSlide, ExportError } = await load();
  const bytes = new Uint8Array([7]);
  assert.equal(await renderSlide(async () => bytes, {}, 0), bytes);
  await assert.rejects(
    renderSlide(async () => { throw new Error('HTTP 404'); }, {}, 4),
    (err) => err instanceof ExportError && err.slideNumber === 5 && err.message === 'Não foi possível gerar o slide 5.',
  );
});

// Minimal stand-ins for the browser canvas and mediabunny, so renderMov's cleanup can run in Node.
function fakeRenderEnv({ failOnFrame = null } = {}) {
  const log = { cancelled: 0, finalized: 0, added: 0 };
  globalThis.OffscreenCanvas = class { getContext() { return { fillRect() {}, drawImage() {} }; } };
  const mb = {
    BufferTarget: class { constructor() { this.buffer = new ArrayBuffer(4); } },
    MovOutputFormat: class {},
    QUALITY_HIGH: 'high',
    CanvasSource: class {
      async add() { log.added++; if (failOnFrame !== null && log.added === failOnFrame) throw new Error('encoder died'); }
      close() {}
    },
    Output: class {
      addVideoTrack() {}
      async start() {}
      async finalize() { log.finalized++; }
      async cancel() { log.cancelled++; }
    },
  };
  return { mb, log };
}

test('renderMov cancels the output when encoding fails, and still closes both images', async () => {
  const { renderMov } = await load();
  const { mb, log } = fakeRenderEnv({ failOnFrame: 3 });
  let closed = 0;
  const loadImage = async () => ({ width: 1920, height: 1080, close() { closed++; } });
  try {
    await assert.rejects(renderMov({ mb, loadImage, slide: { background: 'a.png', text: 'b.png' }, baseUrl: 'http://x/y/' }), /encoder died/);
  } finally {
    delete globalThis.OffscreenCanvas;
  }
  assert.equal(log.cancelled, 1);
  assert.equal(log.finalized, 0);
  assert.equal(closed, 2);
});

test('renderMov closes the image that loaded when the other one fails to load', async () => {
  const { renderMov } = await load();
  const { mb } = fakeRenderEnv();
  let closed = 0;
  const loadImage = async (url) => {
    if (url.endsWith('b.png')) throw new Error('HTTP 404');
    return { width: 1920, height: 1080, close() { closed++; } };
  };
  try {
    await assert.rejects(renderMov({ mb, loadImage, slide: { background: 'a.png', text: 'b.png' }, baseUrl: 'http://x/y/' }), /HTTP 404/);
  } finally {
    delete globalThis.OffscreenCanvas;
  }
  assert.equal(closed, 1);
});
