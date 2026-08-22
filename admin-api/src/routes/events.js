'use strict';

const express = require('express');
const { RRule } = require('rrule');
const config = require('../config');
const { readSheet, appendRow, updateRow } = require('../sheetsClient');
const { createEventsModule } = require('../../../shared/events');

const router = express.Router();
const { buildEventEntries, formatMessage } = createEventsModule(RRule);

const WINDOW_KEY = 'event_window_days';
const WINDOW_HEADERS = ['key', 'value'];
const DEFAULT_WINDOW_DAYS = 45;
const MIN_WINDOW_DAYS = 1;
const MAX_WINDOW_DAYS = 180;

async function getWindowDays() {
  const { rows } = await readSheet(config.eventsSettingsSheetName, config.eventsSheetsId);
  const row = rows.find((r) => r.values.key === WINDOW_KEY);
  const n = row ? parseInt(row.values.value, 10) : NaN;
  return Number.isFinite(n) && n >= MIN_WINDOW_DAYS && n <= MAX_WINDOW_DAYS ? n : DEFAULT_WINDOW_DAYS;
}

router.get('/preview', async (req, res, next) => {
  try {
    if (!config.eventsSheetsId) {
      return res.status(500).json({ error: 'EVENTS_SHEETS_ID is not configured' });
    }

    const [{ rows }, windowDays] = await Promise.all([
      readSheet(config.eventsSheetName, config.eventsSheetsId),
      getWindowDays(),
    ]);
    const flatRows = rows.map((r) => r.values);

    const entries = buildEventEntries(flatRows, windowDays);
    const message = entries.length > 0 ? formatMessage(entries) : null;

    res.json({
      windowDays,
      entries: entries.map((e) => ({ dateLabel: e.dateLabel, title: e.title })),
      message,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/window', async (req, res, next) => {
  try {
    if (!config.eventsSheetsId) {
      return res.status(500).json({ error: 'EVENTS_SHEETS_ID is not configured' });
    }
    res.json({ windowDays: await getWindowDays() });
  } catch (err) {
    next(err);
  }
});

router.put('/window', async (req, res, next) => {
  try {
    if (!config.eventsSheetsId) {
      return res.status(500).json({ error: 'EVENTS_SHEETS_ID is not configured' });
    }

    const windowDays = parseInt(req.body.windowDays, 10);
    if (!Number.isFinite(windowDays) || windowDays < MIN_WINDOW_DAYS || windowDays > MAX_WINDOW_DAYS) {
      return res.status(400).json({ error: `windowDays must be between ${MIN_WINDOW_DAYS} and ${MAX_WINDOW_DAYS}` });
    }

    const { rows } = await readSheet(config.eventsSettingsSheetName, config.eventsSheetsId);
    const existing = rows.find((r) => r.values.key === WINDOW_KEY);
    const rowValues = { key: WINDOW_KEY, value: String(windowDays) };

    if (existing) {
      await updateRow(config.eventsSettingsSheetName, existing.rowNumber, WINDOW_HEADERS, rowValues, config.eventsSheetsId);
    } else {
      await appendRow(config.eventsSettingsSheetName, WINDOW_HEADERS, rowValues, config.eventsSheetsId);
    }

    res.json({ windowDays });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
