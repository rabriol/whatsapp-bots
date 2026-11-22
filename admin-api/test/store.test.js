'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { createStore, ConflictError, ValidationError } = require('../src/slides/store');
const { makePng, makeJpeg } = require('./helpers');

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

async function setup() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'telao-'));
  return { dir, store: createStore(dir) };
}

async function pair(seed = 0) {
  return {
    background: { buffer: await makeJpeg({ width: 1920, height: 1080, color: { r: seed, g: 60, b: 120 } }) },
    text: { buffer: await makePng({ width: 1920, height: 1080, transparentRatio: 0.6, color: { r: 255, g: seed, b: 0 } }) },
  };
}

// A hand-made folder like 10_24_2026: images and an index.html, no slides.json.
async function makeReadOnly(dir, name = '10_24_2026') {
  const img = await makeJpeg({ width: 1920, height: 1080 });
  const file = `${sha(img).slice(0, 12)}.jpg`;
  await fs.mkdir(path.join(dir, name, 'img'), { recursive: true });
  await fs.writeFile(path.join(dir, name, 'img', file), img);
  await fs.writeFile(path.join(dir, name, 'index.html'), 'hand made');
  return { name, file, img };
}

const readManifest = async (dir, name) => JSON.parse(await fs.readFile(path.join(dir, name, 'slides.json'), 'utf8'));
const listImg = (dir, name) => fs.readdir(path.join(dir, name, 'img'));

test('createFolder writes manifest, img dir and player', async () => {
  const { dir, store } = await setup();
  assert.deepEqual(await store.createFolder('2026-11-01'), { name: '11_01_2026' });
  assert.deepEqual(await readManifest(dir, '11_01_2026'), { version: 1, slides: [] });
  assert.deepEqual(await listImg(dir, '11_01_2026'), []);
  assert.match(await fs.readFile(path.join(dir, '11_01_2026', 'index.html'), 'utf8'), /telao-player/);
});

test('createFolder twice is ConflictError', async () => {
  const { store } = await setup();
  await store.createFolder('2026-11-01');
  await assert.rejects(store.createFolder('2026-11-01'), ConflictError);
});

test('addSlide appends in insertion order', async () => {
  const { dir, store } = await setup();
  const { name } = await store.createFolder('2026-11-01');
  const ids = [];
  for (const seed of [1, 2, 3]) ids.push((await store.addSlide(name, await pair(seed))).id);
  assert.deepEqual((await readManifest(dir, name)).slides.map((s) => s.id), ids);
});

test('addSlide accepts an opaque text image', async () => {
  const { store } = await setup();
  const { name } = await store.createFolder('2026-11-01');
  const p = await pair();
  p.text = { buffer: await makeJpeg({ width: 1920, height: 1080, color: { r: 250, g: 250, b: 250 } }) };
  const slide = await store.addSlide(name, p);
  assert.match(slide.text, /\.jpg$/);
});

test('addSlide with mismatched proportions is ValidationError and writes nothing', async () => {
  const { dir, store } = await setup();
  const { name } = await store.createFolder('2026-11-01');
  const bad = await pair();
  bad.text = { buffer: await makePng({ width: 1920, height: 1200 }) };
  await assert.rejects(store.addSlide(name, bad), ValidationError);
  assert.deepEqual(await listImg(dir, name), []);
});

test('addSlide by reference copies bytes identically', async () => {
  const { dir, store } = await setup();
  const ro = await makeReadOnly(dir);
  const src = await store.createFolder('2026-11-01');
  const srcSlide = await store.addSlide(src.name, await pair(5));
  const dst = await store.createFolder('2026-11-08');
  const slide = await store.addSlide(dst.name, {
    background: { folder: ro.name, file: ro.file },
    text: { folder: src.name, file: path.basename(srcSlide.text) },
  });
  const copiedBg = await fs.readFile(path.join(dir, dst.name, slide.background));
  assert.equal(sha(copiedBg), sha(ro.img));
  const copiedText = await fs.readFile(path.join(dir, dst.name, slide.text));
  const originalText = await fs.readFile(path.join(dir, src.name, srcSlide.text));
  assert.equal(sha(copiedText), sha(originalText));
});

test('replaceImage swaps background and deletes orphan', async () => {
  const { dir, store } = await setup();
  const { name } = await store.createFolder('2026-11-01');
  const slide = await store.addSlide(name, await pair(1));
  const newBg = { buffer: await makeJpeg({ width: 1920, height: 1080, color: { r: 9, g: 9, b: 9 } }) };
  const updated = await store.replaceImage(name, slide.id, 'background', newBg);
  assert.notEqual(updated.background, slide.background);
  const files = await listImg(dir, name);
  assert.ok(!files.includes(path.basename(slide.background)));
  assert.ok(files.includes(path.basename(updated.background)));
});

test('removing a slide keeps files still referenced', async () => {
  const { dir, store } = await setup();
  const { name } = await store.createFolder('2026-11-01');
  const p = await pair(1);
  const first = await store.addSlide(name, p);
  const second = await store.addSlide(name, {
    background: p.background,
    text: { buffer: await makePng({ width: 1920, height: 1080, transparentRatio: 0.5, color: { r: 1, g: 2, b: 3 } }) },
  });
  assert.equal(first.background, second.background);
  await store.removeSlide(name, first.id);
  const files = await listImg(dir, name);
  assert.ok(files.includes(path.basename(second.background)));
  assert.ok(!files.includes(path.basename(first.text)));
});

test('concurrent adds keep both slides', async () => {
  const { dir, store } = await setup();
  const { name } = await store.createFolder('2026-11-01');
  const [a, b] = await Promise.all([pair(1), pair(2)]);
  await Promise.all([store.addSlide(name, a), store.addSlide(name, b)]);
  assert.equal((await readManifest(dir, name)).slides.length, 2);
});

test('read-only folder rejects every write with ConflictError', async () => {
  const { dir, store } = await setup();
  const ro = await makeReadOnly(dir);
  const p = await pair();
  await assert.rejects(store.addSlide(ro.name, p), ConflictError);
  await assert.rejects(store.replaceImage(ro.name, 'x', 'background', p.background), ConflictError);
  await assert.rejects(store.removeSlide(ro.name, 'x'), ConflictError);
  const other = await store.createFolder('2026-11-01');
  await store.addSlide(other.name, p);
  const otherIds = (await readManifest(dir, other.name)).slides.map((s) => s.id);
  await assert.rejects(store.copySlides(ro.name, other.name, otherIds), ConflictError);
  assert.equal(await fs.readFile(path.join(dir, ro.name, 'index.html'), 'utf8'), 'hand made');
  await assert.rejects(fs.access(path.join(dir, ro.name, 'slides.json')));
});

test('copySlides keeps source order and new ids', async () => {
  const { dir, store } = await setup();
  const src = await store.createFolder('2026-11-01');
  const s1 = await store.addSlide(src.name, await pair(1));
  const s2 = await store.addSlide(src.name, await pair(2));
  const dst = await store.createFolder('2026-11-08');
  const copied = await store.copySlides(dst.name, src.name, [s2.id, s1.id]);
  assert.deepEqual(copied.map((s) => s.background), [s1.background, s2.background]);
  assert.ok(copied.every((s) => s.id !== s1.id && s.id !== s2.id));
  assert.equal((await readManifest(dir, dst.name)).slides.length, 2);
});

test('copy from read-only folder is ConflictError', async () => {
  const { dir, store } = await setup();
  const ro = await makeReadOnly(dir);
  const dst = await store.createFolder('2026-11-08');
  await assert.rejects(store.copySlides(dst.name, ro.name, ['x']), ConflictError);
});

test('listFolders sorts by date across years', async () => {
  const { dir, store } = await setup();
  await store.createFolder('2026-12-31');
  await store.createFolder('2027-01-05');
  await fs.mkdir(path.join(dir, 'notadate'));
  const names = (await store.listFolders()).map((f) => f.name);
  assert.deepEqual(names, ['01_05_2027', '12_31_2026']);
});

test('liveFolderName skips future and empty', async () => {
  const { dir, store } = await setup();
  await makeReadOnly(dir, '10_24_2026');
  await store.createFolder('2026-10-31');
  const { name } = await store.createFolder('2026-11-07');
  await store.addSlide(name, await pair(1));
  assert.equal(await store.liveFolderName('20261101'), '10_24_2026');
  assert.equal(await store.liveFolderName('20261107'), '11_07_2026');
  const live = (await store.listFolders('20261107')).filter((f) => f.live).map((f) => f.name);
  assert.deepEqual(live, ['11_07_2026']);
});

test('reorderSlides saves the new order', async () => {
  const { dir, store } = await setup();
  const { name } = await store.createFolder('2026-11-01');
  const ids = [];
  for (const seed of [1, 2, 3]) ids.push((await store.addSlide(name, await pair(seed))).id);
  const order = [ids[2], ids[0], ids[1]];
  const slides = await store.reorderSlides(name, order);
  assert.deepEqual(slides.map((s) => s.id), order);
  assert.deepEqual((await readManifest(dir, name)).slides.map((s) => s.id), order);
});

test('reorderSlides with a stale or partial list is ConflictError', async () => {
  const { dir, store } = await setup();
  const { name } = await store.createFolder('2026-11-01');
  const a = await store.addSlide(name, await pair(1));
  const b = await store.addSlide(name, await pair(2));
  await assert.rejects(store.reorderSlides(name, [b.id]), ConflictError);
  await assert.rejects(store.reorderSlides(name, [b.id, a.id, 'ghost']), ConflictError);
  await assert.rejects(store.reorderSlides(name, [a.id, a.id]), ConflictError);
  assert.deepEqual((await readManifest(dir, name)).slides.map((s) => s.id), [a.id, b.id]);
});

test('reorderSlides on a read-only folder is ConflictError', async () => {
  const { dir, store } = await setup();
  const ro = await makeReadOnly(dir);
  await assert.rejects(store.reorderSlides(ro.name, []), ConflictError);
});

const EXPORT_FILES = ['frames.js', 'mediabunny.js', 'fflate.js'];

test('createFolder copies the MOV export modules next to the player', async () => {
  const { dir, store } = await setup();
  await store.createFolder('2026-11-01');
  for (const file of EXPORT_FILES) {
    const stat = await fs.stat(path.join(dir, '11_01_2026', 'export', file));
    assert.ok(stat.size > 0, `${file} is empty`);
  }
});

test('saving a folder restores missing export modules', async () => {
  const { dir, store } = await setup();
  await store.createFolder('2026-11-01');
  await fs.rm(path.join(dir, '11_01_2026', 'export', 'frames.js'));
  await store.addSlide('11_01_2026', await pair());
  await fs.access(path.join(dir, '11_01_2026', 'export', 'frames.js'));
});

test('hand-made folders never get an export directory', async () => {
  const { dir, store } = await setup();
  const ro = await makeReadOnly(dir);
  await assert.rejects(store.addSlide(ro.name, await pair()), ConflictError);
  await assert.rejects(fs.access(path.join(dir, ro.name, 'export')));
});

const { NotFoundError, InvalidNameError } = require('../src/slides/store');

test('removeFolder deletes the whole folder and leaves the others untouched', async () => {
  const { dir, store } = await setup();
  await store.createFolder('2026-11-01');
  await store.addSlide('11_01_2026', await pair());
  await store.createFolder('2026-11-02');
  await store.addSlide('11_02_2026', await pair(5));

  await store.removeFolder('11_01_2026');

  await assert.rejects(fs.access(path.join(dir, '11_01_2026')));
  assert.deepEqual((await store.listFolders()).map((f) => f.name), ['11_02_2026']);
  assert.equal((await readManifest(dir, '11_02_2026')).slides.length, 1);
  assert.equal((await listImg(dir, '11_02_2026')).length, 2);
});

test('removeFolder refuses a hand-made folder and leaves it intact', async () => {
  const { dir, store } = await setup();
  const ro = await makeReadOnly(dir);
  await assert.rejects(store.removeFolder(ro.name), ConflictError);
  assert.deepEqual(await listImg(dir, ro.name), [ro.file]);
  assert.equal(await fs.readFile(path.join(dir, ro.name, 'index.html'), 'utf8'), 'hand made');
});

test('removeFolder on a missing folder is NotFoundError', async () => {
  const { store } = await setup();
  await assert.rejects(store.removeFolder('11_01_2026'), NotFoundError);
});

test('removeFolder only accepts mm_dd_yyyy names, never paths', async () => {
  const { dir, store } = await setup();
  await store.createFolder('2026-11-01');
  for (const bad of ['..', '../x', '11_01_2026/img', '', undefined, '11-01-2026']) {
    await assert.rejects(store.removeFolder(bad), InvalidNameError, `accepted ${bad}`);
  }
  await fs.access(path.join(dir, '11_01_2026', 'slides.json'));
});

test('refreshPlayers rewrites the player and export modules of editable folders only', async () => {
  const { dir, store } = await setup();
  await store.createFolder('2026-11-01');
  await store.addSlide('11_01_2026', await pair());
  const ro = await makeReadOnly(dir);
  const manifestBefore = await readManifest(dir, '11_01_2026');
  const imagesBefore = await listImg(dir, '11_01_2026');
  // a folder last saved by an older version: old player, no export modules
  await fs.writeFile(path.join(dir, '11_01_2026', 'index.html'), 'old player');
  await fs.rm(path.join(dir, '11_01_2026', 'export'), { recursive: true });

  assert.deepEqual(await store.refreshPlayers(), { refreshed: ['11_01_2026'], failed: [] });

  assert.match(await fs.readFile(path.join(dir, '11_01_2026', 'index.html'), 'utf8'), /telao-player/);
  await fs.access(path.join(dir, '11_01_2026', 'export', 'frames.js'));
  assert.deepEqual(await readManifest(dir, '11_01_2026'), manifestBefore);
  assert.deepEqual(await listImg(dir, '11_01_2026'), imagesBefore);
  assert.equal(await fs.readFile(path.join(dir, ro.name, 'index.html'), 'utf8'), 'hand made');
  await assert.rejects(fs.access(path.join(dir, ro.name, 'export')));
});

test('refreshPlayers keeps going and reports a folder it cannot refresh', async () => {
  const { dir, store } = await setup();
  await store.createFolder('2026-11-01');
  await store.createFolder('2026-11-02');
  // a plain file where the export directory belongs makes that one folder fail
  await fs.rm(path.join(dir, '11_01_2026', 'export'), { recursive: true });
  await fs.writeFile(path.join(dir, '11_01_2026', 'export'), 'not a directory');

  const result = await store.refreshPlayers();

  assert.deepEqual(result.refreshed, ['11_02_2026']);
  assert.equal(result.failed.length, 1);
  assert.equal(result.failed[0].name, '11_01_2026');
  assert.ok(result.failed[0].error);
  await fs.access(path.join(dir, '11_02_2026', 'export', 'frames.js'));
});

test('refreshPlayers does nothing when the slides directory does not exist', async () => {
  const store = createStore(path.join(os.tmpdir(), `telao-missing-${Date.now()}`));
  assert.deepEqual(await store.refreshPlayers(), { refreshed: [], failed: [] });
});
