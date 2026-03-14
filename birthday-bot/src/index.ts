import { config } from "./config";
import { getTodaysBirthdays } from "./sheets";
import { sendBirthdayMessage } from "./whatsapp";

async function main() {
  console.log("Checking for today's birthdays...");

  const names = await getTodaysBirthdays();

  if (names.length === 0) {
    console.log("No birthdays today.");
    return;
  }

  console.log(`Found ${names.length} birthday(s): ${names.join(", ")}`);

  await sendBirthdayMessage(config.whatsappGroupJid, names);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
