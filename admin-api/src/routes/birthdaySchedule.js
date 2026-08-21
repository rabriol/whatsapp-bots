'use strict';

const express = require('express');
const config = require('../config');
const { readSheet, appendRow, updateRow } = require('../sheetsClient');

const router = express.Router();

const HOUR_KEY = 'birthday_schedule_hour';
const MINUTE_KEY = 'birthday_schedule_minute';
const TZ_KEY = 'birthday_schedule_tz';
const HEADERS = ['key', 'value'];

const DEFAULTS = { hour: 7, minute: 0, tz: 'America/Los_Angeles' };

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await readSheet(config.settingsSheetName);
    const byKey = Object.fromEntries(rows.map((r) => [r.values.key, r.values.value]));

    res.json({
      hour: byKey[HOUR_KEY] != null ? parseInt(byKey[HOUR_KEY], 10) : DEFAULTS.hour,
      minute: byKey[MINUTE_KEY] != null ? parseInt(byKey[MINUTE_KEY], 10) : DEFAULTS.minute,
      tz: byKey[TZ_KEY] || DEFAULTS.tz,
    });
  } catch (err) {
    next(err);
  }
});

router.put('/', async (req, res, next) => {
  try {
    const { hour, minute, tz } = req.body;
    const updates = [
      [HOUR_KEY, String(hour)],
      [MINUTE_KEY, String(minute)],
      [TZ_KEY, tz],
    ];

    const { rows } = await readSheet(config.settingsSheetName);

    for (const [key, value] of updates) {
      const existing = rows.find((r) => r.values.key === key);
      if (existing) {
        await updateRow(config.settingsSheetName, existing.rowNumber, HEADERS, { key, value });
      } else {
        await appendRow(config.settingsSheetName, HEADERS, { key, value });
      }
    }

    res.json({ hour, minute, tz });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
