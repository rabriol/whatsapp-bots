import cron from "node-cron";
import { getSchedule, getTodaysBirthdays, SCHEDULE_DEFAULTS, Schedule } from "./sheets";
import { sendBirthdayMessage, sendAlert } from "./whatsapp";
import { config } from "./config";

// The gateway answers 503 for as long as Baileys is reconnecting, so the first
// retries are short and the last one rides out a longer outage.
const RETRY_DELAYS_MS = [30_000, 120_000, 300_000];

let lastKnownSchedule: Schedule = SCHEDULE_DEFAULTS;
let lastSentDay: string | null = null;
let lastLoggedSchedule = "";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function formatSchedule({ hour, minute, tz }: Schedule): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")} (${tz})`;
}

// The container runs in UTC; the send time is wall-clock time in the church's
// own timezone, so "now" has to be resolved there rather than read off Date.
function getNowInTz(tz: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return {
    year: parseInt(map.year, 10),
    month: parseInt(map.month, 10),
    day: parseInt(map.day, 10),
    hour: parseInt(map.hour, 10) % 24, // midnight formats as "24" on some ICU builds
    minute: parseInt(map.minute, 10),
  };
}

export async function withRetry<T>(
  label: string,
  fn: () => Promise<T>,
  delays: number[] = RETRY_DELAYS_MS
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= delays.length) throw err;
      const wait = delays[attempt];
      console.error(
        `Failed to ${label} (attempt ${attempt + 1}/${delays.length + 1}): ` +
          `${(err as Error).message}. Retrying in ${Math.round(wait / 1000)}s.`
      );
      await sleep(wait);
    }
  }
}

async function runCheck(tz: string): Promise<void> {
  console.log("Checking for today's birthdays...");

  let names: string[];
  try {
    names = await withRetry("read birthdays from Google Sheets", () => getTodaysBirthdays(tz));
  } catch (err) {
    await sendAlert(
      `Não consegui ler a planilha de aniversários hoje, então nenhuma mensagem foi enviada.\n\n` +
        `Erro: ${(err as Error).message}`
    );
    return;
  }

  if (names.length === 0) {
    console.log("No birthdays today.");
    return;
  }

  console.log(`Found ${names.length} birthday(s): ${names.join(", ")}`);

  try {
    await withRetry("send birthday message", () =>
      sendBirthdayMessage(config.whatsappGroupJid, names)
    );
  } catch (err) {
    await sendAlert(
      `Não consegui enviar a mensagem de aniversário de: ${names.join(", ")}.\n\n` +
        `Erro: ${(err as Error).message}`
    );
  }
}

export async function checkSchedule(): Promise<void> {
  try {
    lastKnownSchedule = await getSchedule();
  } catch (err) {
    console.error(
      `Could not refresh schedule, keeping ${formatSchedule(lastKnownSchedule)}: ${(err as Error).message}`
    );
  }

  const description = formatSchedule(lastKnownSchedule);
  if (description !== lastLoggedSchedule) {
    console.log(`Birthday check scheduled daily at ${description}`);
    lastLoggedSchedule = description;
  }

  const { hour, minute, tz } = lastKnownSchedule;
  const now = getNowInTz(tz);
  if (now.hour !== hour || now.minute !== minute) return;

  // Claimed before the first attempt so the retries below, which can span
  // several minutes, cannot overlap with the next minute's poll.
  const today = `${now.year}-${now.month}-${now.day}`;
  if (lastSentDay === today) return;
  lastSentDay = today;

  await runCheck(tz);
}

/**
 * Registers a single cron that polls every minute and compares the current
 * wall-clock time against the schedule in the Settings sheet.
 *
 * This task is never stopped or recreated. The previous design registered the
 * send time as its own cron pattern and rebuilt it hourly to pick up schedule
 * changes; because the rebuild stopped the task synchronously and only
 * recreated it after an awaited Sheets read, a rebuild landing on the send
 * minute discarded that day's execution entirely, with nothing logged.
 * Polling also drops the lag on a schedule change from an hour to a minute.
 */
export function setupSchedule(): void {
  cron.schedule("* * * * *", () => {
    checkSchedule().catch((err) => console.error("Error checking birthdays:", err.message));
  });
  console.log("Polling the Settings sheet every minute for the birthday send time.");
}
