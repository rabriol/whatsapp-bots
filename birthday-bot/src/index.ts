import { setupSchedule, startPeriodicSync } from "./scheduler";

async function main() {
  console.log("Starting Church Birthday Bot...");

  await setupSchedule();
  startPeriodicSync();

  console.log("Bot is running. Press Ctrl+C to stop.");
}

main().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
