'use strict';

const sharp = require('sharp');

// A PNG whose top `transparentRatio` fraction of rows is fully transparent and
// the rest is an opaque colour - enough to exercise the transparency check.
async function makePng({ width, height, transparentRatio = 0, color = { r: 200, g: 120, b: 40 } }) {
  const opaqueHeight = Math.round(height * (1 - transparentRatio));
  const canvas = sharp({
    create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  });
  if (opaqueHeight === 0) return canvas.png().toBuffer();
  const block = await sharp({
    create: { width, height: opaqueHeight, channels: 4, background: { ...color, alpha: 1 } },
  }).png().toBuffer();
  return canvas.composite([{ input: block, top: height - opaqueHeight, left: 0 }]).png().toBuffer();
}

async function makeJpeg({ width, height, color = { r: 30, g: 60, b: 120 } }) {
  return sharp({ create: { width, height, channels: 3, background: color } }).jpeg().toBuffer();
}

module.exports = { makePng, makeJpeg };
