'use strict';

const path = require('path');
const express = require('express');
const config = require('./config');
const announcementsRouter = require('./routes/announcements');
const birthdaysRouter = require('./routes/birthdays');
const birthdayScheduleRouter = require('./routes/birthdaySchedule');

const app = express();
app.use(express.json());

app.use('/api/announcements', announcementsRouter);
app.use('/api/birthdays', birthdaysRouter);
app.use('/api/birthday-schedule', birthdayScheduleRouter);

app.get('/api/health', (req, res) => res.json({ ok: true }));

// Serves the built admin UI, once it exists (npm run build in ../admin-ui -> ./public).
app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'), (err) => {
    if (err) next(err);
  });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message });
});

app.listen(config.port, () => {
  console.log(`admin-api listening on port ${config.port}`);
});
