import { config } from "./config";

async function sendText(jid: string, text: string): Promise<void> {
  const response = await fetch(`${config.gatewayUrl}/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jid, text }),
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Gateway error (${response.status}): ${body}`);
  }
}

export async function sendBirthdayMessage(
  groupJid: string,
  names: string[]
): Promise<void> {
  const nameLines = names.map((n) => `🎈 ${n}`).join("\n");
  const message =
    `🎂✨ Parabéns pelo seu dia! ✨🎂\n\n` +
    `Hoje comemoramos a vida de:\n\n` +
    `${nameLines}\n\n` +
    `📖 "O Senhor te abençoe e te guarde; o Senhor faça resplandecer o seu rosto sobre ti e tenha misericórdia de ti; o Senhor sobre ti levante o seu rosto e te dê a paz." — Números 6:24-26\n\n` +
    `Que este novo ano de vida seja repleto das bênçãos do Senhor! 🙌`;

  await sendText(groupJid, message);
  console.log("Birthday message sent successfully!");
}

// Never throws: an alert that fails must not replace the error it reports.
export async function sendAlert(text: string): Promise<void> {
  if (!config.notificationJid) {
    console.warn(`NOTIFICATION_JID not set, alert not delivered: ${text}`);
    return;
  }

  try {
    await sendText(config.notificationJid, `⚠️ *birthday-bot*\n\n${text}`);
  } catch (err) {
    console.error("Failed to deliver alert:", (err as Error).message);
  }
}
