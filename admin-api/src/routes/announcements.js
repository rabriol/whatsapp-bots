'use strict';

const express = require('express');
const config = require('../config');
const { readSheet, appendRow, updateRow, clearRow } = require('../sheetsClient');

const router = express.Router();

const HEADERS = [
  'id', 'type', 'title', 'day', 'time', 'goal', 'collected', 'due_date',
  'link', 'text', 'active', 'freq', 'byday', 'date_once',
];

function toResponseShape(values) {
  return {
    id: values.id,
    type: values.type || 'simple',
    title: values.title || '',
    day: values.day ? parseInt(values.day, 10) : null,
    time: values.time || '',
    goal: values.goal ? parseFloat(values.goal) : 0,
    collected: values.collected ? parseFloat(values.collected) : 0,
    dueDate: values.due_date || '',
    link: values.link || '',
    text: values.text || '',
    active: String(values.active).toUpperCase() === 'TRUE',
    // freq defaults to "monthly" for rows written before this column existed,
    // since that's the only mode the original announcement-bot ever supported.
    freq: values.freq || 'monthly',
    byDay: values.byday ? values.byday.split(',').map((s) => s.trim()).filter(Boolean) : [],
    dateOnce: values.date_once || '',
  };
}

function fromRequestShape(body) {
  return {
    id: String(body.id),
    type: body.type,
    title: body.title,
    day: body.day != null ? String(body.day) : '',
    time: body.time,
    goal: body.goal != null ? String(body.goal) : '',
    collected: body.collected != null ? String(body.collected) : '',
    due_date: body.dueDate || '',
    link: body.link || '',
    text: body.text || '',
    active: body.active ? 'TRUE' : 'FALSE',
    freq: body.freq || 'monthly',
    byday: Array.isArray(body.byDay) ? body.byDay.join(',') : '',
    date_once: body.dateOnce || '',
  };
}

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await readSheet(config.announcementSheetName);
    const announcements = rows
      .filter((r) => r.values.id) // skip blank/cleared rows
      .map((r) => ({ ...toResponseShape(r.values), rowNumber: r.rowNumber }));
    res.json(announcements);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { rows } = await readSheet(config.announcementSheetName);
    const maxId = rows.reduce((max, r) => {
      const n = parseInt(r.values.id, 10);
      return Number.isFinite(n) && n > max ? n : max;
    }, 0);

    const newAnnouncement = { ...req.body, id: maxId + 1, active: true };
    await appendRow(config.announcementSheetName, HEADERS, fromRequestShape(newAnnouncement));
    res.status(201).json(newAnnouncement);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { rows } = await readSheet(config.announcementSheetName);
    const match = rows.find((r) => r.values.id === String(req.params.id));
    if (!match) {
      return res.status(404).json({ error: `Announcement ${req.params.id} not found` });
    }

    const updated = { ...req.body, id: req.params.id };
    await updateRow(config.announcementSheetName, match.rowNumber, HEADERS, fromRequestShape(updated));
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { rows } = await readSheet(config.announcementSheetName);
    const match = rows.find((r) => r.values.id === String(req.params.id));
    if (!match) {
      return res.status(404).json({ error: `Announcement ${req.params.id} not found` });
    }

    await clearRow(config.announcementSheetName, match.rowNumber, HEADERS.length);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
