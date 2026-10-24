'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const { createSlidesRouter } = require('../src/routes/slides');
const { makePng, makeJpeg } = require('./helpers');

async function startServer() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'telao-routes-'));
  const app = express();
  app.use(express.json());
  app.use('/api/slides', createSlidesRouter(dir));
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api/slides`;
  test.after(() => server.close());
  return { dir, base };
}

const postJson = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

async function slideForm({ opaqueText = false } = {}) {
  const form = new FormData();
  form.append('background', new Blob([await makeJpeg({ width: 1920, height: 1080 })], { type: 'image/jpeg' }), 'bg.jpg');
  const text = await makePng({ width: 1920, height: 1080, transparentRatio: opaqueText ? 0 : 0.6 });
  form.append('text', new Blob([text], { type: 'image/png' }), 'text.png');
  return form;
}

async function makeReadOnly(dir) {
  await fs.mkdir(path.join(dir, '10_24_2026', 'img'), { recursive: true });
  await fs.writeFile(path.join(dir, '10_24_2026', 'img', 'ab12cd34ef56.jpg'), await makeJpeg({ width: 1920, height: 1080 }));
}

test('create folder then add slide via upload', async () => {
  const { base } = await startServer();
  const created = await postJson(`${base}/folders`, { date: '2026-11-01' });
  assert.equal(created.status, 201);
  assert.deepEqual(await created.json(), { name: '11_01_2026' });
  const res = await fetch(`${base}/folders/11_01_2026/slides`, { method: 'POST', body: await slideForm() });
  assert.equal(res.status, 201);
  const folder = await (await fetch(`${base}/folders/11_01_2026`)).json();
  assert.equal(folder.slides.length, 1);
  const img = await fetch(`${base}/folders/11_01_2026/${folder.slides[0].background}`);
  assert.equal(img.status, 200);
});

test('add slide via references', async () => {
  const { dir, base } = await startServer();
  await makeReadOnly(dir);
  await postJson(`${base}/folders`, { date: '2026-11-01' });
  await fetch(`${base}/folders/11_01_2026/slides`, { method: 'POST', body: await slideForm() });
  const src = await (await fetch(`${base}/folders/11_01_2026`)).json();
  await postJson(`${base}/folders`, { date: '2026-11-08' });
  const form = new FormData();
  form.append('backgroundRef', JSON.stringify({ folder: '10_24_2026', file: 'ab12cd34ef56.jpg' }));
  form.append('textRef', JSON.stringify({ folder: '11_01_2026', file: path.basename(src.slides[0].text) }));
  const res = await fetch(`${base}/folders/11_08_2026/slides`, { method: 'POST', body: form });
  assert.equal(res.status, 201);
});

test('opaque text is accepted', async () => {
  const { base } = await startServer();
  await postJson(`${base}/folders`, { date: '2026-11-01' });
  const res = await fetch(`${base}/folders/11_01_2026/slides`, { method: 'POST', body: await slideForm({ opaqueText: true }) });
  assert.equal(res.status, 201);
});

test('rejects traversal in folder and file params', async () => {
  const { base } = await startServer();
  await postJson(`${base}/folders`, { date: '2026-11-01' });
  assert.equal((await fetch(`${base}/folders/..%2F..%2Fetc/img/ab12cd34ef56.png`)).status, 400);
  assert.equal((await fetch(`${base}/folders/11_01_2026/img/..%2Fslides.json`)).status, 400);
  const form = await slideForm();
  form.delete('background');
  form.append('backgroundRef', JSON.stringify({ folder: '10_24_2026/..', file: 'x.png' }));
  assert.equal((await fetch(`${base}/folders/11_01_2026/slides`, { method: 'POST', body: form })).status, 400);
});

test('write to read-only folder is 409', async () => {
  const { dir, base } = await startServer();
  await makeReadOnly(dir);
  const res = await fetch(`${base}/folders/10_24_2026/slides`, { method: 'POST', body: await slideForm() });
  assert.equal(res.status, 409);
});

test('copy from read-only folder is 409', async () => {
  const { dir, base } = await startServer();
  await makeReadOnly(dir);
  await postJson(`${base}/folders`, { date: '2026-11-01' });
  const res = await postJson(`${base}/folders/11_01_2026/copy`, { from: '10_24_2026', slideIds: ['x'] });
  assert.equal(res.status, 409);
});

test('oversized upload is 422', async () => {
  const { base } = await startServer();
  await postJson(`${base}/folders`, { date: '2026-11-01' });
  const form = await slideForm();
  form.set('background', new Blob([Buffer.alloc(25 * 1024 * 1024 + 1)], { type: 'image/jpeg' }), 'big.jpg');
  const res = await fetch(`${base}/folders/11_01_2026/slides`, { method: 'POST', body: form });
  assert.equal(res.status, 422);
  assert.match((await res.json()).error, /25 MB/);
});
