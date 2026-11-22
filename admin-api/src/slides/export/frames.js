// Pure timing and layout math for the Telão MOV export. No browser or Node APIs,
// so the same file runs in the player (copied next to index.html) and in the tests.

export const WIDTH = 1920;
export const HEIGHT = 1080;
export const FPS = 30;
export const DURATION = 2;
export const BACKDROP = '#080f1d';

// Mirrors the player's CSS: the background fades with `ease-out` from 0 s, the text
// with `ease` once REVEAL_DELAY (1 s) has passed; both fades last 0.8 s.
const EASE_OUT = [0, 0, 0.58, 1];
const EASE = [0.25, 0.1, 0.25, 1];
const LAYERS = {
  background: { start: 0, duration: 0.8, curve: EASE_OUT },
  text: { start: 1, duration: 0.8, curve: EASE },
};

// CSS cubic-bezier(x1, y1, x2, y2): find the curve parameter whose x equals `progress`,
// then return its y.
function cubicBezier([x1, y1, x2, y2], progress) {
  const at = (a, b, s) => 3 * a * (1 - s) ** 2 * s + 3 * b * (1 - s) * s ** 2 + s ** 3;
  let low = 0;
  let high = 1;
  for (let i = 0; i < 40; i++) {
    const mid = (low + high) / 2;
    if (at(x1, x2, mid) < progress) low = mid;
    else high = mid;
  }
  return at(y1, y2, (low + high) / 2);
}

export function opacityAt(layer, t) {
  const { start, duration, curve } = LAYERS[layer];
  const progress = (t - start) / duration;
  if (progress <= 0) return 0;
  if (progress >= 1 - 1e-9) return 1;
  return cubicBezier(curve, progress);
}

export const frameCount = () => DURATION * FPS;
export const frameTimestamp = (i) => i / FPS;

// Largest rectangle with the image's proportions that fits the box, centred.
export function containRect(srcW, srcH, boxW = WIDTH, boxH = HEIGHT) {
  const scale = Math.min(boxW / srcW, boxH / srcH);
  const width = srcW * scale;
  const height = srcH * scale;
  return { x: (boxW - width) / 2, y: (boxH - height) / 2, width, height };
}

// `index` is zero-based. Two digits normally, more when the folder has over 99 slides,
// so the names still sort in slide order.
export function movFileName(index, total) {
  const digits = Math.max(2, String(total).length);
  return `${String(index + 1).padStart(digits, '0')}.mov`;
}

export const zipFileName = (folder) => `anuncios-${folder}.zip`;

export function folderFromPath(pathname) {
  const match = /^\/(\d{2}_\d{2}_\d{4})(?:\/|$)/.exec(pathname);
  return match ? match[1] : null;
}
