const { progressBar } = require('./progressBar');

const HEADER = 'Olá, família! 👋\n';
const FOOTER = '\nDeus abençoe! 🙏';

/**
 * Formats a donation announcement.
 * @param {Object} row - Row data from spreadsheet
 */
function formatDonation(row) {
  const current = parseFloat(row.collected) || 0;
  const total = parseFloat(row.goal) || 0;
  const bar = progressBar(current, total);
  const month = new Date().toLocaleString('en-US', { month: 'long', timeZone: 'America/Los_Angeles' });

  return [
    HEADER,
    `Doações — ${row.title}`,
    month,
    '',
    `Meta: $ ${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    bar,
    '',
    `Contribuir: ${row.link}`,
    FOOTER,
  ].join('\n');
}

/**
 * Formats a rent announcement.
 * @param {Object} row - Row data from spreadsheet
 */
function formatRent(row) {
  const current = parseFloat(row.collected) || 0;
  const total = parseFloat(row.goal) || 0;
  const bar = progressBar(current, total);

  return [
    HEADER,
    'Segue a atualização financeira referente ao aluguel deste mês:',
    '',
    `${row.title}`,
    `Vencimento: ${row.due_date}`,
    `Total: $ ${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    '',
    bar,
    '',
    `Contribuições: ${row.link}`,
    FOOTER,
  ].join('\n');
}

/**
 * Formats a simple text announcement.
 * @param {Object} row - Row data from spreadsheet
 */
function formatSimple(row) {
  return [HEADER, row.text, FOOTER].join('\n');
}

/**
 * Formats an event announcement.
 * @param {Object} row - Row data from spreadsheet
 */
function formatEvent(row) {
  return [HEADER, row.text, FOOTER].join('\n');
}

/**
 * Returns a formatted message string based on the row type.
 * @param {Object} row - Row data from spreadsheet
 * @returns {string}
 */
function formatMessage(row) {
  switch (row.type) {
    case 'donation':
      return formatDonation(row);
    case 'rent':
      return formatRent(row);
    case 'simple':
      return formatSimple(row);
    case 'event':
      return formatEvent(row);
    default:
      return formatSimple(row);
  }
}

module.exports = { formatMessage };
