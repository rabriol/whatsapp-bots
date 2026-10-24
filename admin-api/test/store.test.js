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

test('addSlide with opaque text is ValidationError and writes nothing', async () => {
  const { dir, store } = await setup();
  const { name } = await store.createFolder('2026-11-01');
  const bad = await pair();
  bad.text = { buffer: await makePng({ width: 1920, height: 1080, transparentRatio: 0 }) };
  await assert.rejects(store.addSlide(name, bad), (err) => {
    assert.ok(err instanceof ValidationError);
    assert.ok(err.errors.includes('A imagem de texto precisa ter fundo transparente'));
    return true;
  });
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
