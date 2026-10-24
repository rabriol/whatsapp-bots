'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { FOLDER_RE, FILE_RE, folderNameFromDate, folderDateKey, todayKeyInTz } = require('../src/slides/names');

test('folderNameFromDate formats mm_dd_yyyy', () => {
  assert.equal(folderNameFromDate('2026-11-01'), '11_01_2026');
});

test('folderNameFromDate rejects invalid dates', () => {
  assert.throws(() => folderNameFromDate('2026-13-01'));
  assert.throws(() => folderNameFromDate('2026-02-30'));
  assert.throws(() => folderNameFromDate('nope'));
});

test('folderDateKey orders across years', () => {
  assert.ok(folderDateKey('01_05_2027') > folderDateKey('12_31_2026'));
});

test('todayKeyInTz uses the church timezone, not UTC', () => {
  assert.equal(todayKeyInTz('America/Los_Angeles', new Date('2026-10-25T05:00:00Z')), '20261024');
});

test('FOLDER_RE accepts only mm_dd_yyyy', () => {
  assert.ok(FOLDER_RE.test('10_24_2026'));
  assert.ok(!FOLDER_RE.test('1_5_2026'));
  assert.ok(!FOLDER_RE.test('10_24_2026/..'));
});

test('FILE_RE accepts only lowercase hash names', () => {
  assert.ok(FILE_RE.test('ab12cd34ef56.png'));
  assert.ok(FILE_RE.test('ab12cd34ef56.jpg'));
  assert.ok(!FILE_RE.test('../x.png'));
  assert.ok(!FILE_RE.test('AB12CD34EF56.png'));
});
