'use strict';

const path = require('path');
const express = require('express');
const config = require('./config');
const announcementsRouter = require('./routes/announcements');
const birthdaysRouter = require('./routes/birthdays');
const birthdayScheduleRouter = require('./routes/birthdaySchedule');
const eventsRouter = require('./routes/events');
const { createSlidesRouter } = require('./routes/slides');
const { createStore } = require('./slides/store');

const app = express();
app.use(express.json());

app.use('/api/announcements', announcementsRouter);
app.use('/api/birthdays', birthdaysRouter);
app.use('/api/birthday-schedule', birthdayScheduleRouter);
app.use('/api/events', eventsRouter);
// One store shared by the router and the startup refresh, so both use the same per-folder locks.
const slidesStore = createStore(config.slidesDir);
app.use('/api/slides', createSlidesRouter(config.slidesDir, slidesStore));

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

  // Bring every Telão folder up to the current player after each deploy.
  slidesStore.refreshPlayers().then(({ refreshed, failed }) => {
    console.log(`slides: player refreshed in ${refreshed.length} folder(s)`);
    for (const { name, error } of failed) console.error(`slides: could not refresh ${name}: ${error}`);
  }).catch((err) => console.error(`slides: could not refresh players: ${err.message}`));
});
