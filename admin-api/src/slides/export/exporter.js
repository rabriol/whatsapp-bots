// Browser-side MOV export for the Telão player. Libraries (mediabunny, fflate) and the
// image loader are passed in, so the player controls what gets loaded and the tests can
// run the logic without a browser.

import {
  WIDTH, HEIGHT, FPS, BACKDROP, opacityAt, frameCount, frameTimestamp, containRect, movFileName, zipFileName,
} from './frames.js';

// True only if this browser can encode H.264 at 1920x1080 through WebCodecs.
export async function isExportSupported(mb, env = globalThis) {
  if (typeof env.VideoEncoder === 'undefined' || typeof env.OffscreenCanvas === 'undefined') return false;
  return Boolean(await mb.canEncodeVideo('avc', { width: WIDTH, height: HEIGHT }));
}

// One job at a time: a second click while one runs is ignored instead of queued.
export function createExclusive() {
  let busy = false;
  return {
    async run(fn) {
      if (busy) return { ran: false };
      busy = true;
      try {
        return { ran: true, value: await fn() };
      } finally {
        busy = false;
      }
    },
  };
}

function drawLayer(ctx, image, opacity) {
  if (opacity <= 0) return;
  const { x, y, width, height } = containRect(image.width, image.height);
  ctx.globalAlpha = opacity;
  ctx.drawImage(image, x, y, width, height);
}

// Renders one slide ({ background, text }, paths relative to baseUrl) as a 2 s MOV that
// replays the player's animation: frame i is drawn at t = i / FPS.
export async function renderMov({ mb, loadImage, slide, baseUrl }) {
  const resolve = (path) => new URL(path, baseUrl).href;
  // allSettled, not all: if one image fails the other may already be decoded and must be released.
  const loaded = await Promise.allSettled([loadImage(resolve(slide.background)), loadImage(resolve(slide.text))]);
  const failure = loaded.find((result) => result.status === 'rejected');
  if (failure) {
    for (const result of loaded) result.value?.close?.();
    throw failure.reason;
  }
  const [background, text] = loaded.map((result) => result.value);
  let output;
  try {
    const canvas = new OffscreenCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';

    const target = new mb.BufferTarget();
    output = new mb.Output({ format: new mb.MovOutputFormat({ fastStart: 'in-memory' }), target });
    const source = new mb.CanvasSource(canvas, { codec: 'avc', quality: mb.QUALITY_HIGH });
    output.addVideoTrack(source, { frameRate: FPS });
    await output.start();

    for (let i = 0; i < frameCount(); i++) {
      const t = frameTimestamp(i);
      ctx.globalAlpha = 1;
      ctx.fillStyle = BACKDROP;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      drawLayer(ctx, background, opacityAt('background', t));
      drawLayer(ctx, text, opacityAt('text', t));
      await source.add(t, 1 / FPS);
    }
    source.close();
    await output.finalize();
    return new Uint8Array(target.buffer);
  } catch (err) {
    // Release the encoder now instead of waiting for garbage collection, so retries after a failure still work.
    try { await output?.cancel(); } catch { /* the original error matters more */ }
    throw err;
  } finally {
    background.close?.();
    text.close?.();
  }
}

export class ExportError extends Error {
  constructor(slideNumber, cause) {
    super(`Não foi possível gerar o slide ${slideNumber}.`, { cause });
    this.slideNumber = slideNumber;
  }
}

// Runs `render(slide)` and reports any failure as an ExportError naming the slide (`index` is zero-based).
export async function renderSlide(render, slide, index) {
  try {
    return await render(slide);
  } catch (err) {
    throw new ExportError(index + 1, err);
  }
}

// MOVs are already compressed, so the zip stores them as they are (level 0).
export function zipMovs(fflate, files) {
  return fflate.zipSync(Object.fromEntries(files.map(({ name, data }) => [name, data])), { level: 0 });
}

// Renders every slide in order, one at a time, and returns the zip. `onProgress(current, total)`
// fires before each slide (current starts at 1). If any slide fails nothing is returned.
export async function exportFolder({ render, fflate, slides, folder, onProgress }) {
  if (slides.length === 0) throw new Error('Nenhum slide para exportar.');
  const files = [];
  for (let i = 0; i < slides.length; i++) {
    onProgress(i + 1, slides.length);
    files.push({ name: movFileName(i, slides.length), data: await renderSlide(render, slides[i], i) });
  }
  return { name: zipFileName(folder), data: zipMovs(fflate, files) };
}
