import cron, { ScheduledTask } from "node-cron";
import { getSchedule, getTodaysBirthdays } from "./sheets";
import { sendBirthdayMessage } from "./whatsapp";
import { config } from "./config";

let activeTask: ScheduledTask | null = null;

async function runCheck(): Promise<void> {
  console.log("Checking for today's birthdays...");
  const names = await getTodaysBirthdays();

  if (names.length === 0) {
    console.log("No birthdays today.");
    return;
  }

  console.log(`Found ${names.length} birthday(s): ${names.join(", ")}`);
  await sendBirthdayMessage(config.whatsappGroupJid, names);
}

export async function setupSchedule(): Promise<void> {
  if (activeTask) {
    activeTask.stop();
    activeTask = null;
  }

  const { hour, minute, tz } = await getSchedule();
  const cronExpr = `0 ${minute} ${hour} * * *`;

  if (!cron.validate(cronExpr)) {
    console.error(`Invalid cron expression built from schedule: "${cronExpr}". Keeping previous schedule.`);
    return;
  }

  activeTask = cron.schedule(cronExpr, () => {
    runCheck().catch((err) => console.error("Error checking birthdays:", err.message));
  }, { timezone: tz });

  console.log(`Birthday check scheduled daily at ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")} (${tz})`);
}

export function startPeriodicSync(): void {
  // Re-reads the schedule from the Settings sheet hourly, so a change made
  // via admin-api takes effect without a redeploy.
  cron.schedule("0 * * * *", () => {
    console.log("Re-syncing birthday schedule from Google Sheets...");
    setupSchedule().catch((err) => console.error("Error re-syncing schedule:", err.message));
  }, { timezone: "America/Los_Angeles" });
}
