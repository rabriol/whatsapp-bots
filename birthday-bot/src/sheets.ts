import { config } from "./config";

interface Birthday {
  day: number;
  month: number;
  name: string;
}

export interface Schedule {
  hour: number;
  minute: number;
  tz: string;
}

const SCHEDULE_DEFAULTS: Schedule = { hour: 7, minute: 0, tz: "America/Los_Angeles" };

export async function getSchedule(): Promise<Schedule> {
  const { googleSheetsId, googleApiKey, settingsSheetName } = config;
  const range = encodeURIComponent(settingsSheetName);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${googleSheetsId}/values/${range}?key=${googleApiKey}`;

  const response = await fetch(url);
  if (!response.ok) {
    console.warn(`Could not read ${settingsSheetName} sheet (${response.status}), using default schedule.`);
    return SCHEDULE_DEFAULTS;
  }

  const data = (await response.json()) as { values?: string[][] };
  const rows = data.values || [];
  const byKey: Record<string, string> = {};
  for (const row of rows.slice(1)) {
    if (row[0]) byKey[row[0].trim()] = (row[1] || "").trim();
  }

  const hour = parseInt(byKey["birthday_schedule_hour"], 10);
  const minute = parseInt(byKey["birthday_schedule_minute"], 10);
  const tz = byKey["birthday_schedule_tz"];

  return {
    hour: Number.isFinite(hour) ? hour : SCHEDULE_DEFAULTS.hour,
    minute: Number.isFinite(minute) ? minute : SCHEDULE_DEFAULTS.minute,
    tz: tz || SCHEDULE_DEFAULTS.tz,
  };
}

export async function getTodaysBirthdays(): Promise<string[]> {
  const birthdays = await fetchBirthdays();
  const today = new Date();
  const day = today.getDate();
  const month = today.getMonth() + 1;

  return birthdays
    .filter((b) => b.day === day && b.month === month)
    .map((b) => b.name);
}

async function fetchBirthdays(): Promise<Birthday[]> {
  const { googleSheetsId, googleApiKey, sheetName } = config;
  const range = encodeURIComponent(sheetName);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${googleSheetsId}/values/${range}?key=${googleApiKey}`;

  const response = await fetch(url);

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Google Sheets API error (${response.status}): ${body}`);
  }

  const data = (await response.json()) as { values?: string[][] };
  const rows = data.values || [];

  if (rows.length <= 1) {
    return [];
  }

  // Skip header row
  return rows.slice(1).map((row) => ({
    day: parseInt(row[0], 10),
    month: parseInt(row[1], 10),
    name: (row[2] || "").trim(),
  })).filter((b) => !isNaN(b.day) && !isNaN(b.month) && b.name);
}
