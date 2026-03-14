import { config } from "./config";

interface Birthday {
  day: number;
  month: number;
  name: string;
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
