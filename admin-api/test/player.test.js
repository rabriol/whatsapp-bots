'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'slides', 'player.html'), 'utf8');

test('player reads slides.json and keeps the telão look', () => {
  assert.ok(html.includes('<!-- telao-player -->'));
  assert.ok(html.includes('slides.json'));
  assert.ok(html.includes('#080f1d'));
  assert.match(html, /object-fit:\s?contain/);
  assert.ok(html.includes('Nenhum slide nesta apresentação ainda.'));
});

test('player has no external dependencies', () => {
  assert.ok(!/<script[^>]+src=/i.test(html));
  assert.ok(!/<link/i.test(html));
});
