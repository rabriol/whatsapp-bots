/**
 * Generates a progress bar string using block characters.
 * @param {number} current - Current value
 * @param {number} total - Total/goal value
 * @param {number} blocks - Total number of blocks in the bar (default 10)
 * @returns {string} e.g. "▓▓▓▓▓░░░░░ 50% — $ 1,000.00"
 */
function progressBar(current, total, blocks = 10) {
  const pct = total > 0 ? Math.min(current / total, 1) : 0;
  const filled = Math.round(pct * blocks);
  const empty = blocks - filled;

  const bar = '▓'.repeat(filled) + '░'.repeat(empty);
  const pctLabel = Math.round(pct * 100);
  const currentLabel = current.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return `${bar} ${pctLabel}% — $ ${currentLabel}`;
}

module.exports = { progressBar };
