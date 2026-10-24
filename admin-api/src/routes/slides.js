'use strict';

const express = require('express');
const multer = require('multer');
const { createStore, NotFoundError, ConflictError, InvalidNameError, ValidationError } = require('../slides/store');

const MAX_BYTES = 25 * 1024 * 1024;

// Slides for announcements.sdarmorangevale.com, stored in the folder the
// announcements nginx container serves. Takes the directory so tests can use a temp one.
function createSlidesRouter(slidesDir) {
  const store = createStore(slidesDir);
  const router = express.Router();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES } });

  // Async handler + multipart parsing, with every store error mapped to a status.
  const handle = (fields, fn) => [
    (req, res, next) => {
      if (!fields) return next();
      upload.fields(fields)(req, res, (err) => {
        if (!err) return next();
        if (err.code === 'LIMIT_FILE_SIZE') return res.status(422).json({ error: 'Imagem maior que 25 MB.', errors: ['Imagem maior que 25 MB.'] });
        return res.status(400).json({ error: err.message });
      });
    },
    async (req, res, next) => {
      try {
        await fn(req, res);
      } catch (err) {
        if (err instanceof ValidationError) return res.status(422).json({ error: err.message, errors: err.errors });
        if (err instanceof InvalidNameError) return res.status(400).json({ error: err.message });
        if (err instanceof ConflictError) return res.status(409).json({ error: err.message });
        if (err instanceof NotFoundError) return res.status(404).json({ error: err.message });
        next(err);
      }
    },
  ];

  // An image comes either as an uploaded file or as a JSON {folder, file} reference.
  function sourceFrom(req, fileField, refField) {
    const file = req.files && req.files[fileField] && req.files[fileField][0];
    if (file) return { buffer: file.buffer };
    const ref = req.body && req.body[refField];
    if (!ref) return null;
    try {
      const { folder, file: name } = JSON.parse(ref);
      return { folder, file: name };
    } catch {
      throw new InvalidNameError(`Referência de imagem inválida em ${refField}.`);
    }
  }

  router.get('/folders', ...handle(null, async (req, res) => {
    res.json(await store.listFolders());
  }));

  router.post('/folders', ...handle(null, async (req, res) => {
    res.status(201).json(await store.createFolder(req.body && req.body.date));
  }));

  router.get('/folders/:name', ...handle(null, async (req, res) => {
    res.json(await store.getFolder(req.params.name));
  }));

  router.get('/folders/:name/img/:file', ...handle(null, async (req, res) => {
    const file = await store.imagePath(req.params.name, req.params.file);
    res.set('Cache-Control', 'private, max-age=300');
    res.sendFile(file);
  }));

  router.post('/folders/:name/slides', ...handle([{ name: 'background', maxCount: 1 }, { name: 'text', maxCount: 1 }], async (req, res) => {
    const slide = await store.addSlide(req.params.name, {
      background: sourceFrom(req, 'background', 'backgroundRef'),
      text: sourceFrom(req, 'text', 'textRef'),
    });
    res.status(201).json(slide);
  }));

  router.put('/folders/:name/slides/:id/:role', ...handle([{ name: 'image', maxCount: 1 }], async (req, res) => {
    res.json(await store.replaceImage(req.params.name, req.params.id, req.params.role, sourceFrom(req, 'image', 'imageRef')));
  }));

  router.delete('/folders/:name/slides/:id', ...handle(null, async (req, res) => {
    await store.removeSlide(req.params.name, req.params.id);
    res.status(204).end();
  }));

  router.post('/folders/:name/copy', ...handle(null, async (req, res) => {
    const { from, slideIds } = req.body || {};
    res.status(201).json(await store.copySlides(req.params.name, from, slideIds));
  }));

  return router;
}

module.exports = { createSlidesRouter };
