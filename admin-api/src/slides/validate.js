'use strict';

const sharp = require('sharp');

const MAX_BYTES = 25 * 1024 * 1024;
const MIN_TRANSPARENT_RATIO = 0.2;
const ASPECT_TOLERANCE = 0.01;
const RECOMMENDED = { width: 1920, height: 1080 };

const FORMATS = {
  background: ['png', 'jpeg', 'webp'],
  text: ['png', 'webp'],
};

class ValidationError extends Error {
  constructor(errors) {
    super(errors.join(' '));
    this.errors = errors;
  }
}

// Reads only metadata and the alpha channel; the image bytes are never rewritten.
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
  let pixels;
  try {
    pixels = await sharp(buffer).raw().toBuffer({ resolveWithObject: true });
  } catch {
    throw new ValidationError(['O arquivo está corrompido ou incompleto.']);
  }

  let transparentRatio = 0;
  if (meta.hasAlpha) {
    const { data, info } = pixels;
    const alphaIndex = info.channels - 1;
    let zeros = 0;
    for (let i = alphaIndex; i < data.length; i += info.channels) if (data[i] === 0) zeros++;
    transparentRatio = zeros / (info.width * info.height);
  }

  return {
    format: meta.format,
    width: meta.width,
    height: meta.height,
    hasAlpha: Boolean(meta.hasAlpha),
    transparentRatio,
  };
}

function validateRole(meta, role, size) {
  const errors = [];
  const warnings = [];
  const label = role === 'text' ? 'texto' : 'fundo';

  if (size > MAX_BYTES) errors.push(`A imagem de ${label} é maior que 25 MB.`);

  if (!FORMATS[role].includes(meta.format)) {
    errors.push(role === 'text'
      ? 'A imagem de texto precisa ser PNG ou WebP com fundo transparente.'
      : 'A imagem de fundo precisa ser PNG, JPG ou WebP.');
  } else if (role === 'text' && (!meta.hasAlpha || meta.transparentRatio < MIN_TRANSPARENT_RATIO)) {
    errors.push('A imagem de texto precisa ter fundo transparente');
  }

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
