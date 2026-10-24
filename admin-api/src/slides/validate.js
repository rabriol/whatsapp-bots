'use strict';

const sharp = require('sharp');

const MAX_BYTES = 25 * 1024 * 1024;
const ASPECT_TOLERANCE = 0.01;
const RECOMMENDED = { width: 1920, height: 1080 };

class ValidationError extends Error {
  constructor(errors) {
    super(errors.join(' '));
    this.errors = errors;
  }
}

// Reads metadata and decodes the pixels; the image bytes are never rewritten.
async function inspectImage(buffer) {
  let meta;
  try {
    meta = await sharp(buffer).metadata();
  } catch {
    throw new ValidationError(['O arquivo não é uma imagem válida.']);
  }
  if (!['png', 'jpeg', 'webp'].includes(meta.format)) {
    throw new ValidationError(['Formato de imagem não suportado. Use PNG, JPG ou WebP.']);
  }

  // Decode every pixel so a truncated file is caught here instead of being
  // saved and shown half-grey on the telão (metadata() alone accepts it).
  try {
    await sharp(buffer).raw().toBuffer();
  } catch {
    throw new ValidationError(['O arquivo está corrompido ou incompleto.']);
  }

  return { format: meta.format, width: meta.width, height: meta.height };
}

function validateRole(meta, role, size) {
  const errors = [];
  const warnings = [];
  const label = role === 'text' ? 'texto' : 'fundo';

  if (size > MAX_BYTES) errors.push(`A imagem de ${label} é maior que 25 MB.`);

  if (meta.width < RECOMMENDED.width || meta.height < RECOMMENDED.height) {
    warnings.push(`A imagem de ${label} tem ${meta.width}×${meta.height}, menor que 1920×1080; pode ficar sem nitidez no telão.`);
  }

  return { errors, warnings };
}

function validatePair(bgMeta, textMeta) {
  const bgRatio = bgMeta.width / bgMeta.height;
  const textRatio = textMeta.width / textMeta.height;
  const errors = [];
  if (Math.abs(bgRatio - textRatio) / bgRatio > ASPECT_TOLERANCE) {
    errors.push(`O fundo (${bgMeta.width}×${bgMeta.height}) e o texto (${textMeta.width}×${textMeta.height}) precisam ter a mesma proporção.`);
  }
  return { errors, warnings: [] };
}

module.exports = { inspectImage, validateRole, validatePair, ValidationError };
