# admin-api

REST API (and, once built, static host) for the WhatsApp bots admin UI. Reads and writes the same Google Sheet the bots use, via a Google Service Account (no interactive OAuth — safe to run headless in a container).

## One-time setup on the real Google Sheet

The `Announcements` tab already has these columns (matching `announcement-bot/src/sheets.js`):

```
id | type | title | day | time | goal | collected | due_date | link | text | active
```

**Add three columns after `active`** (so the existing bot's positional parsing of A2:K is untouched):

```
freq | byday | date_once
```

- `freq`: `none` / `daily` / `weekly` / `monthly`. Leave blank on existing rows — the API treats blank as `monthly`, which is the only mode the bot supported before this.
- `byday`: comma-separated day codes for weekly (`SU,MO,TU,WE,TH,FR,SA`), e.g. `SU,WE`. Blank otherwise.
- `date_once`: `YYYY-MM-DD`, only used when `freq` is `none`.

**Add a new tab named `Settings`** (or reuse the one from `events-sync` if this is the same spreadsheet), with header row:

```
key | value
```

The birthday schedule is stored there as `birthday_schedule_hour`, `birthday_schedule_minute`, `birthday_schedule_tz`.

**Events live in a second, separate spreadsheet** — the same one `church-calendar`, `events-sync`, and `weekly-announcement-bot` read from (`EVENTS_SHEETS_ID`, tab `Events` by default). Share *that* spreadsheet with the service account too (Viewer access is enough — this route is read-only).

## Setup

```bash
cp .env.example .env    # fill in GOOGLE_SHEETS_ID and EVENTS_SHEETS_ID
cp service-account.example.json service-account.json   # replace with your real key
npm install
```

Share both Google Sheets with the service account's `client_email` before running: the main one (Editor access) and the events one (Viewer is enough).

## Run

```bash
npm start
```

## Routes

- `GET/POST /api/announcements`, `PUT/DELETE /api/announcements/:id`
- `GET/POST /api/birthdays`, `PUT/DELETE /api/birthdays/:rowNumber`
- `GET/PUT /api/birthday-schedule`
- `GET /api/events/preview` — read-only, computes what `weekly-announcement-bot` would send this week
