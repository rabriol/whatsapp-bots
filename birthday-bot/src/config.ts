import "dotenv/config";

interface Config {
  googleSheetsId: string;
  googleApiKey: string;
  sheetName: string;
  settingsSheetName: string;
  whatsappGroupJid: string;
  gatewayUrl: string;
  notificationJid: string;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config: Config = {
  googleSheetsId: requireEnv("GOOGLE_SHEETS_ID"),
  googleApiKey: requireEnv("GOOGLE_API_KEY"),
  sheetName: process.env.SHEET_NAME || "Sheet1",
  settingsSheetName: process.env.SETTINGS_SHEET_NAME || "Settings",
  whatsappGroupJid: requireEnv("WHATSAPP_GROUP_JID"),
  gatewayUrl: requireEnv("GATEWAY_URL"),
  // Same group the gateway posts its own health messages to. Optional: without
  // it the bot still runs, it just has no way to report a failed send.
  notificationJid: process.env.NOTIFICATION_JID || "",
};
