'use strict';

const express = require('express');
const { RRule } = require('rrule');
const config = require('../config');
const { readSheet } = require('../sheetsClient');
const { createEventsModule } = require('../../../shared/events');

const router = express.Router();
const { buildEventEntries, formatMessage } = createEventsModule(RRule);

router.get('/preview', async (req, res, next) => {
  try {
    if (!config.eventsSheetsId) {
      return res.status(500).json({ error: 'EVENTS_SHEETS_ID is not configured' });
    }

    const { rows } = await readSheet(config.eventsSheetName, config.eventsSheetsId);
    const flatRows = rows.map((r) => r.values);

    const entries = buildEventEntries(flatRows);
    const message = entries.length > 0 ? formatMessage(entries) : null;

    res.json({
      entries: entries.map((e) => ({ dateLabel: e.dateLabel, title: e.title })),
      message,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
