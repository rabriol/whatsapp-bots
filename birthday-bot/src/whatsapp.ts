import { config } from "./config";

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

  const response = await fetch(`${config.gatewayUrl}/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jid: groupJid, text: message }),
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Gateway error (${response.status}): ${body}`);
  }

  console.log("Birthday message sent successfully!");
}
