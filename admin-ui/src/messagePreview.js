// Mirrors announcement-bot/src/messages.js and progressBar.js exactly, so
// this preview matches what the bot actually sends.

const HEADER = 'Olá, família! 👋';
const FOOTER = 'Deus abençoe! 🙏';

function fmtMoney(n) {
  return `$ ${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function progressBar(current, total, blocks = 10) {
  const pct = total > 0 ? Math.min(current / total, 1) : 0;
  const filled = Math.round(pct * blocks);
  const empty = blocks - filled;
  const bar = '▓'.repeat(filled) + '░'.repeat(empty);
  return `${bar} ${Math.round(pct * 100)}% — ${fmtMoney(current)}`;
}

function formatDonation(d) {
  const month = new Date().toLocaleString('en-US', { month: 'long' });
  return [
    HEADER,
    `Doações — ${d.title || '(sem título)'}`,
    month,
    '',
    `Meta: ${fmtMoney(d.goal)}`,
    progressBar(d.collected, d.goal),
    '',
    `Contribuir: ${d.link || '(sem link)'}`,
    FOOTER,
  ].join('\n');
}

function formatRent(d) {
  return [
    HEADER,
    'Segue a atualização financeira referente ao aluguel deste mês:',
    '',
    d.title || '(sem título)',
    `Vencimento: ${d.dueDate || '(sem data)'}`,
    `Total: ${fmtMoney(d.goal)}`,
    '',
    progressBar(d.collected, d.goal),
    '',
    `Contribuições: ${d.link || '(sem link)'}`,
    FOOTER,
  ].join('\n');
}

function formatSimple(d) {
  return [HEADER, d.text || '(sem mensagem)', FOOTER].join('\n');
}

export function formatMessage(d) {
  if (d.type === 'donation') return formatDonation(d);
  if (d.type === 'rent') return formatRent(d);
  return formatSimple(d);
}
