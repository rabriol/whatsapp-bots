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

function daysUntilNext(day, month) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const year = today.getFullYear();

  let next = new Date(year, month - 1, day);
  if (next < today) {
    next = new Date(year + 1, month - 1, day);
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
