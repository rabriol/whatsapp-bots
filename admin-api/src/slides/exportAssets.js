'use strict';

const fs = require('fs');
const path = require('path');

const EXPORT_SRC = path.join(__dirname, 'export');

// Files the player loads on demand for the MOV/ZIP export, copied by the store into
// <folder>/export/. They are named .js (not .mjs) so any static server sends a
// JavaScript MIME type, which browsers require for modules.
function exportAssets() {
  const own = fs.readdirSync(EXPORT_SRC)
    .filter((file) => file.endsWith('.js'))
    .map((file) => ({ name: file, from: path.join(EXPORT_SRC, file) }));

  // require.resolve returns each package's Node entry, so locate the browser build from it.
  const mediabunnyDir = path.dirname(require.resolve('mediabunny'));
  const fflateDir = path.dirname(require.resolve('fflate'));
  return [
    ...own,
    { name: 'mediabunny.js', from: path.join(mediabunnyDir, 'mediabunny.min.mjs') },
    { name: 'fflate.js', from: path.join(fflateDir, '..', 'esm', 'browser.js') },
    // fflate is MIT: its notice must travel with the copy. (mediabunny's MPL header is inside its file.)
    { name: 'LICENSE-fflate.txt', from: path.join(fflateDir, '..', 'LICENSE') },
  ];
}

module.exports = { exportAssets };
