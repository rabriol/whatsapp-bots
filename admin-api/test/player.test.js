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

test('player has a single-slide MOV download button', () => {
  assert.ok(html.includes('id="dl-one"'));
});

test('player loads export modules only from its own ./export/ folder', () => {
  const targets = [...html.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]);
  assert.ok(targets.length > 0, 'expected dynamic imports');
  for (const target of targets) assert.ok(target.startsWith('./export/'), `unexpected import ${target}`);
  assert.ok(!/import\(\s*['"]https?:/.test(html));
});

test('player has a download-all ZIP button', () => {
  assert.ok(html.includes('id="dl-all"'));
});
