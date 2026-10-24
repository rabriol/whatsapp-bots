'use strict';

const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { FOLDER_RE, FILE_RE, folderNameFromDate, folderDateKey, todayKeyInTz } = require('./names');
const { inspectImage, validateRole, validatePair, ValidationError } = require('./validate');

const PLAYER_TEMPLATE = path.join(__dirname, 'player.html');
const MANIFEST = 'slides.json';
const EXT = { png: 'png', jpeg: 'jpg', webp: 'webp' };

class NotFoundError extends Error {}
class ConflictError extends Error {}
class InvalidNameError extends Error {}

function assertFolderName(name) {
  if (typeof name !== 'string' || !FOLDER_RE.test(name)) throw new InvalidNameError(`Nome de pasta inválido: ${name}`);
}

function assertFileName(file) {
  if (typeof file !== 'string' || !FILE_RE.test(file)) throw new InvalidNameError(`Nome de imagem inválido: ${file}`);
}

const exists = (p) => fs.access(p).then(() => true, () => false);

// A folder is editable only if it has a slides.json; hand-made folders like
// 10_24_2026 have none and must never be written to.
function createStore(slidesDir) {
  const queues = new Map();
  const folderDir = (name) => path.join(slidesDir, name);

  // Serialises writes per folder so concurrent requests never lose a slide.
  function withLock(name, fn) {
    const prev = queues.get(name) || Promise.resolve();
    const next = prev.catch(() => {}).then(fn);
    queues.set(name, next);
    next.finally(() => { if (queues.get(name) === next) queues.delete(name); }).catch(() => {});
    return next;
  }

  async function readManifest(name) {
    try {
      return JSON.parse(await fs.readFile(path.join(folderDir(name), MANIFEST), 'utf8'));
    } catch (err) {
      if (err.code === 'ENOENT') return null;
      throw err;
    }
  }

  async function requireFolder(name) {
    assertFolderName(name);
    if (!(await exists(folderDir(name)))) throw new NotFoundError(`Pasta não encontrada: ${name}`);
  }

  async function requireEditable(name) {
    await requireFolder(name);
    const manifest = await readManifest(name);
    if (!manifest) throw new ConflictError(`A pasta ${name} é somente leitura.`);
    return manifest;
  }

  async function writeManifest(name, manifest) {
    const dir = folderDir(name);
    const tmp = path.join(dir, `.${MANIFEST}.${process.pid}.${Date.now()}.tmp`);
    await fs.writeFile(tmp, JSON.stringify(manifest, null, 2) + '\n', { mode: 0o644 });
    await fs.rename(tmp, path.join(dir, MANIFEST));
  }

  async function writePlayer(name) {
    await fs.copyFile(PLAYER_TEMPLATE, path.join(folderDir(name), 'index.html'));
    await fs.chmod(path.join(folderDir(name), 'index.html'), 0o644);
  }

  async function removeOrphans(name, manifest) {
    const used = new Set(manifest.slides.flatMap((s) => [s.background, s.text]).map((p) => path.basename(p)));
    for (const file of await fs.readdir(path.join(folderDir(name), 'img'))) {
      if (!used.has(file)) await fs.rm(path.join(folderDir(name), 'img', file), { force: true });
    }
  }

  async function save(name, manifest) {
    await writeManifest(name, manifest);
    await removeOrphans(name, manifest);
    await writePlayer(name);
  }

  // Source is { buffer } (upload) or { folder, file } (reuse from any folder).
  async function loadSource(source) {
    if (source && Buffer.isBuffer(source.buffer)) return source.buffer;
    if (!source || !source.folder || !source.file) throw new ValidationError(['Imagem ausente.']);
    assertFolderName(source.folder);
    assertFileName(source.file);
    try {
      return await fs.readFile(path.join(folderDir(source.folder), 'img', source.file));
    } catch (err) {
      if (err.code === 'ENOENT') throw new NotFoundError(`Imagem não encontrada: ${source.folder}/${source.file}`);
      throw err;
    }
  }

  async function storeImage(name, buffer, meta) {
    const file = `${crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 12)}.${EXT[meta.format]}`;
    const target = path.join(folderDir(name), 'img', file);
    if (!(await exists(target))) await fs.writeFile(target, buffer, { mode: 0o644 });
    return `img/${file}`;
  }

  async function inspectRoles(entries) {
    const errors = [];
    const warnings = [];
    const metas = {};
    for (const [role, buffer] of entries) {
      metas[role] = await inspectImage(buffer);
      const result = validateRole(metas[role], role, buffer.length);
      errors.push(...result.errors);
      warnings.push(...result.warnings);
    }
    return { metas, errors, warnings };
  }

  async function listFolderNames() {
    let entries;
    try {
      entries = await fs.readdir(slidesDir, { withFileTypes: true });
    } catch (err) {
      if (err.code === 'ENOENT') return [];
      throw err;
    }
    return entries
      .filter((e) => e.isDirectory() && FOLDER_RE.test(e.name))
      .map((e) => e.name)
      .sort((a, b) => folderDateKey(b).localeCompare(folderDateKey(a)));
  }

  async function countImages(name) {
    try {
      return (await fs.readdir(path.join(folderDir(name), 'img'))).filter((f) => FILE_RE.test(f)).length;
    } catch {
      return 0;
    }
  }

  // Same rule as the site's home page: newest date up to today that has content.
  async function liveFolderName(todayKey = todayKeyInTz()) {
    for (const name of await listFolderNames()) {
      if (folderDateKey(name) > todayKey) continue;
      const manifest = await readManifest(name);
      if (!manifest || manifest.slides.length > 0) return name;
    }
    return null;
  }

  async function listFolders(todayKey = todayKeyInTz()) {
    const live = await liveFolderName(todayKey);
    const folders = [];
    for (const name of await listFolderNames()) {
      const manifest = await readManifest(name);
      folders.push({
        name,
        editable: Boolean(manifest),
        count: manifest ? manifest.slides.length : await countImages(name),
        live: name === live,
      });
    }
    return folders;
  }

  async function getFolder(name) {
    await requireFolder(name);
    const manifest = await readManifest(name);
    if (manifest) return { name, editable: true, slides: manifest.slides };
    const files = (await fs.readdir(path.join(folderDir(name), 'img')).catch(() => [])).filter((f) => FILE_RE.test(f));
    return { name, editable: false, images: files.sort().map((f) => `img/${f}`) };
  }

  async function createFolder(isoDate) {
    let name;
    try {
      name = folderNameFromDate(isoDate);
    } catch (err) {
      throw new InvalidNameError(err.message);
    }
    return withLock(name, async () => {
      if (await exists(folderDir(name))) throw new ConflictError(`A pasta ${name} já existe.`);
      await fs.mkdir(path.join(folderDir(name), 'img'), { recursive: true, mode: 0o755 });
      await writeManifest(name, { version: 1, slides: [] });
      await writePlayer(name);
      return { name };
    });
  }

  async function imagePath(name, file) {
    assertFolderName(name);
    assertFileName(file);
    const p = path.join(folderDir(name), 'img', file);
    if (!(await exists(p))) throw new NotFoundError(`Imagem não encontrada: ${name}/${file}`);
    return p;
  }

  function addSlide(name, { background, text }) {
    return withLock(name, async () => {
      const manifest = await requireEditable(name);
      const bgBuf = await loadSource(background);
      const textBuf = await loadSource(text);
      const { metas, errors, warnings } = await inspectRoles([['background', bgBuf], ['text', textBuf]]);
      errors.push(...validatePair(metas.background, metas.text).errors);
      if (errors.length) throw new ValidationError(errors);

      const slide = {
        id: crypto.randomUUID(),
        background: await storeImage(name, bgBuf, metas.background),
        text: await storeImage(name, textBuf, metas.text),
        addedAt: new Date().toISOString(),
      };
      manifest.slides.push(slide);
      await save(name, manifest);
      return { ...slide, warnings };
    });
  }

  function replaceImage(name, id, role, source) {
    return withLock(name, async () => {
      if (role !== 'background' && role !== 'text') throw new InvalidNameError(`Tipo de imagem inválido: ${role}`);
      const manifest = await requireEditable(name);
      const slide = manifest.slides.find((s) => s.id === id);
      if (!slide) throw new NotFoundError('Slide não encontrado.');

      const buffer = await loadSource(source);
      const { metas, errors, warnings } = await inspectRoles([[role, buffer]]);
      const otherRole = role === 'background' ? 'text' : 'background';
      const otherMeta = await inspectImage(await fs.readFile(path.join(folderDir(name), slide[otherRole])));
      const bgMeta = role === 'background' ? metas[role] : otherMeta;
      const textMeta = role === 'text' ? metas[role] : otherMeta;
      errors.push(...validatePair(bgMeta, textMeta).errors);
      if (errors.length) throw new ValidationError(errors);

      slide[role] = await storeImage(name, buffer, metas[role]);
      await save(name, manifest);
      return { ...slide, warnings };
    });
  }

  function removeSlide(name, id) {
    return withLock(name, async () => {
      const manifest = await requireEditable(name);
      const before = manifest.slides.length;
      manifest.slides = manifest.slides.filter((s) => s.id !== id);
      if (manifest.slides.length === before) throw new NotFoundError('Slide não encontrado.');
      await save(name, manifest);
    });
  }

  // ids must be exactly the folder's current slide ids in the new order; anything
  // else means the admin page is out of date (another tab changed the folder).
  function reorderSlides(name, ids) {
    return withLock(name, async () => {
      const manifest = await requireEditable(name);
      const byId = new Map(manifest.slides.map((s) => [s.id, s]));
      const valid = Array.isArray(ids) && ids.length === byId.size && new Set(ids).size === ids.length && ids.every((id) => byId.has(id));
      if (!valid) throw new ConflictError('A pasta mudou desde que a página foi aberta. Recarregue e tente de novo.');
      manifest.slides = ids.map((id) => byId.get(id));
      await save(name, manifest);
      return manifest.slides;
    });
  }

  function copySlides(name, from, slideIds) {
    return withLock(name, async () => {
      const manifest = await requireEditable(name);
      await requireFolder(from);
      const source = await readManifest(from);
      if (!source) throw new ConflictError(`A pasta ${from} não tem slides para copiar; escolha imagens avulsas dela em "Adicionar slide".`);
      const wanted = new Set(slideIds || []);
      const picked = source.slides.filter((s) => wanted.has(s.id));
      if (picked.length === 0) throw new NotFoundError('Nenhum slide selecionado foi encontrado.');

      const copied = [];
      for (const s of picked) {
        for (const role of ['background', 'text']) {
          const target = path.join(folderDir(name), s[role]);
          if (!(await exists(target))) await fs.copyFile(path.join(folderDir(from), s[role]), target);
        }
        copied.push({ id: crypto.randomUUID(), background: s.background, text: s.text, addedAt: new Date().toISOString() });
      }
      manifest.slides.push(...copied);
      await save(name, manifest);
      return copied;
    });
  }

  return { listFolders, liveFolderName, getFolder, createFolder, imagePath, addSlide, replaceImage, removeSlide, reorderSlides, copySlides };
}

module.exports = { createStore, NotFoundError, ConflictError, InvalidNameError, ValidationError };
