'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { exportAssets } = require('../src/slides/exportAssets');

test('exportAssets lists our modules and both libraries, all readable and non-empty', async () => {
  const assets = exportAssets();
  const names = assets.map((a) => a.name);
  for (const expected of ['frames.js', 'mediabunny.js', 'fflate.js']) assert.ok(names.includes(expected), `missing ${expected}`);
  assert.ok(!names.includes('package.json'));
  for (const { name, from } of assets) {
    const stat = await fs.stat(from);
    assert.ok(stat.size > 0, `${name} is empty`);
  }
});
