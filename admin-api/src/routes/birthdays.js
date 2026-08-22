'use strict';

const express = require('express');
const config = require('../config');
const { readRawRows, appendRawRow, updateRawRow } = require('../sheetsClient');

const router = express.Router();

// Matches birthday-bot/src/sheets.ts: column order is day, month, name.
function toResponseShape(row) {
  const [day, month, name] = row.values;
  return {
    rowNumber: row.rowNumber,
    day: parseInt(day, 10),
    month: parseInt(month, 10),
    name: (name || '').trim(),
  };
}

// The server (VPS) runs in UTC, but "today" for birthday purposes means
// today in the church's own timezone - using the server's local Date
// directly caused an off-by-one whenever UTC had already rolled to the
// next calendar day while it was still "yesterday" in Los Angeles.
const CHURCH_TZ = 'America/Los_Angeles';

function getTodayInTz(tz) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return { year: parseInt(map.year, 10), month: parseInt(map.month, 10), day: parseInt(map.day, 10) };
}

function daysUntilNext(day, month) {
  const { year, month: curMonth, day: curDay } = getTodayInTz(CHURCH_TZ);
  const today = new Date(Date.UTC(year, curMonth - 1, curDay));

  let next = new Date(Date.UTC(year, month - 1, day));
  if (next < today) {
    next = new Date(Date.UTC(year + 1, month - 1, day));
  }
  return Math.round((next - today) / (1000 * 60 * 60 * 24));
}

router.get('/', async (req, res, next) => {
  try {
    const rows = await readRawRows(config.birthdaySheetName, 'A2:C');
    const birthdays = rows
      .filter((r) => r.values[2]) // has a name
      .map((r) => {
        const b = toResponseShape(r);
        return { ...b, daysUntil: daysUntilNext(b.day, b.month) };
      })
      .sort((a, b) => a.daysUntil - b.daysUntil);
    res.json(birthdays);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { day, month, name } = req.body;
    await appendRawRow(config.birthdaySheetName, [String(day), String(month), name]);
    res.status(201).json({ day, month, name });
  } catch (err) {
    next(err);
  }
});

router.put('/:rowNumber', async (req, res, next) => {
  try {
    const { day, month, name } = req.body;
    const rowNumber = parseInt(req.params.rowNumber, 10);
    await updateRawRow(config.birthdaySheetName, rowNumber, [String(day), String(month), name]);
    res.json({ day, month, name, rowNumber });
  } catch (err) {
    next(err);
  }
});

router.delete('/:rowNumber', async (req, res, next) => {
  try {
    const rowNumber = parseInt(req.params.rowNumber, 10);
    await updateRawRow(config.birthdaySheetName, rowNumber, ['', '', '']);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
