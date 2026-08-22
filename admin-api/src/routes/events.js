'use strict';

const express = require('express');
const { RRule } = require('rrule');
const config = require('../config');
const { readSheet, appendRow, updateRow } = require('../sheetsClient');
const { createEventsModule, parseDate } = require('../../../shared/events');

const router = express.Router();
const { buildEventEntries, formatMessage } = createEventsModule(RRule);

// Only the fields a human cares about - the sheet has ~20 more columns of
// events-sync bookkeeping (checksum, sync_action, event_id, last_synced_at,
// program_sheet_id, ...) that aren't useful here.
function toEventDetail(row, rowNumber) {
  return {
    rowNumber,
    rowId: row.row_id || '',
    title: row.title || '',
    description: row.description || '',
    location: row.location || '',
    startDate: row.start_date || '',
    startTime: row.start_time || '',
    endDate: row.end_date || '',
    endTime: row.end_time || '',
    allDay: String(row.all_day).toUpperCase() === 'TRUE',
    timezone: row.timezone || '',
    recurrenceRule: row.recurrence_rule || '',
    status: row.status || '',
    excludeWeekly: String(row.exclude_weekly).trim().toLowerCase() === 'yes',
    registrationUrl: row.registration_url || '',
    registrationButtonText: row.registration_button_text || '',
    registrationDeadline: row.registration_deadline || '',
    zoomUrl: row.zoom_url || '',
    youtubeUrl: row.youtube_url || '',
    isLive: String(row.is_live).toUpperCase() === 'TRUE',
    attendees: row.attendees || '',
    reminders: row.reminders || '',
    visibility: row.visibility || '',
  };
}

// Fields admin-ui lets a human create/edit. Deliberately excludes the
// events-sync bookkeeping columns (sync_action, event_id, checksum,
// last_synced_at, last_error, program_sheet_id, color_id) and the
// registration_*/exclude_weekly/attendees/reminders/visibility columns,
// which either don't exist in this sheet or use Calendar-API-specific
// formats no form here validates.
const EDITABLE_FIELD_MAP = {
  title: 'title',
  description: 'description',
  location: 'location',
  startDate: 'start_date',
  startTime: 'start_time',
  endDate: 'end_date',
  endTime: 'end_time',
  allDay: 'all_day',
  recurrenceRule: 'recurrence_rule',
  status: 'status',
  zoomUrl: 'zoom_url',
  youtubeUrl: 'youtube_url',
  isLive: 'is_live',
};

function fromEditableFields(body) {
  const values = {};
  for (const [apiKey, sheetKey] of Object.entries(EDITABLE_FIELD_MAP)) {
    if (body[apiKey] === undefined) continue;
    if (apiKey === 'allDay' || apiKey === 'isLive') {
      values[sheetKey] = body[apiKey] ? 'TRUE' : 'FALSE';
    } else {
      values[sheetKey] = String(body[apiKey] ?? '').trim();
    }
  }
  return values;
}

// row_id (e.g. "E-0032") is this sheet's own stable ID, distinct from the
// events-sync-assigned Calendar event_id. New rows get the next one in
// sequence, matching the scheme already used throughout the sheet.
function nextRowId(rows) {
  let max = 0;
  for (const r of rows) {
    const m = /^E-(\d+)$/.exec((r.values.row_id || '').trim());
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `E-${String(max + 1).padStart(4, '0')}`;
}

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

router.get('/all', async (req, res, next) => {
  try {
    if (!config.eventsSheetsId) {
      return res.status(500).json({ error: 'EVENTS_SHEETS_ID is not configured' });
    }

    const { rows } = await readSheet(config.eventsSheetName, config.eventsSheetsId);
    const events = rows
      .filter((r) => r.values.title)
      .map((r) => toEventDetail(r.values, r.rowNumber))
      .sort((a, b) => {
        const da = parseDate(a.startDate);
        const db = parseDate(b.startDate);
        if (!da && !db) return 0;
        if (!da) return 1;
        if (!db) return -1;
        return da - db;
      });

    res.json({ events });
  } catch (err) {
    next(err);
  }
});

// Matches Google Calendar's event status vocabulary (this sheet is synced
// via events-sync, which mirrors Calendar). shared/events.js only treats
// exactly 'confirmed' (or a blank status) as "shown in the weekly message" -
// any other value, including 'cancelled', excludes it.
const VALID_STATUSES = ['confirmed', 'tentative', 'cancelled'];

router.put('/:rowNumber/status', async (req, res, next) => {
  try {
    if (!config.eventsSheetsId) {
      return res.status(500).json({ error: 'EVENTS_SHEETS_ID is not configured' });
    }

    const rowNumber = parseInt(req.params.rowNumber, 10);
    const status = String(req.body.status || '').trim().toLowerCase();
    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
    }

    // row_id isn't guaranteed unique in this sheet, so match on the actual
    // sheet row number instead. Read+merge the full row (not just `status`)
    // so updateRow's full-row overwrite doesn't blank the ~20 events-sync
    // bookkeeping columns admin-api doesn't know about individually.
    const { headers, rows } = await readSheet(config.eventsSheetName, config.eventsSheetsId);
    const match = rows.find((r) => r.rowNumber === rowNumber);
    if (!match) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const updatedValues = { ...match.values, status };
    await updateRow(config.eventsSheetName, rowNumber, headers, updatedValues, config.eventsSheetsId);

    res.json(toEventDetail(updatedValues, rowNumber));
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

// Registered after the literal /preview, /all, /window routes above -
// Express matches path params positionally, so a generic single-segment
// route like this one would otherwise shadow PUT /window (":rowNumber"
// would greedily match the literal string "window").
router.post('/', async (req, res, next) => {
  try {
    if (!config.eventsSheetsId) {
      return res.status(500).json({ error: 'EVENTS_SHEETS_ID is not configured' });
    }

    const body = req.body;
    if (!body.title || !body.startDate) {
      return res.status(400).json({ error: 'title and startDate are required' });
    }
    const status = String(body.status || 'confirmed').trim().toLowerCase();
    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
    }

    const { headers, rows } = await readSheet(config.eventsSheetName, config.eventsSheetsId);

    const values = fromEditableFields({ ...body, status });
    values.row_id = nextRowId(rows);
    values.timezone = 'America/Los_Angeles';
    // sync_action='UPSERT' matches the value already present on every
    // existing synced row, signalling events-sync to push this row to
    // Calendar. event_id/checksum/last_synced_at/last_error are left blank
    // on purpose - those are computed and written back by events-sync
    // itself once it processes the row, never set by this app.
    values.sync_action = 'UPSERT';

    await appendRow(config.eventsSheetName, headers, values, config.eventsSheetsId);

    res.status(201).json(toEventDetail(values));
  } catch (err) {
    next(err);
  }
});

router.put('/:rowNumber', async (req, res, next) => {
  try {
    if (!config.eventsSheetsId) {
      return res.status(500).json({ error: 'EVENTS_SHEETS_ID is not configured' });
    }

    const rowNumber = parseInt(req.params.rowNumber, 10);
    const body = req.body;
    if (!body.title || !body.startDate) {
      return res.status(400).json({ error: 'title and startDate are required' });
    }
    if (body.status !== undefined) {
      const status = String(body.status).trim().toLowerCase();
      if (!VALID_STATUSES.includes(status)) {
        return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
      }
    }

    const { headers, rows } = await readSheet(config.eventsSheetName, config.eventsSheetsId);
    const match = rows.find((r) => r.rowNumber === rowNumber);
    if (!match) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const updatedValues = { ...match.values, ...fromEditableFields(body) };
    await updateRow(config.eventsSheetName, rowNumber, headers, updatedValues, config.eventsSheetsId);

    res.json(toEventDetail(updatedValues, rowNumber));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
