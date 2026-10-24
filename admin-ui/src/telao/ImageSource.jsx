import { useEffect, useState } from 'react';
import { api } from '../api';

// One image slot (fundo or texto): upload a file or reuse an image from any folder.
// value is { file, previewUrl } or { ref: { folder, file }, previewUrl } or null.
export function ImageSource({ label, value, onChange, folders, currentFolder }) {
  const [mode, setMode] = useState('upload');
  const [pickFolder, setPickFolder] = useState('');
  const [images, setImages] = useState([]);

  const otherFolders = folders.filter((f) => f.name !== currentFolder && f.count > 0);

  useEffect(() => {
    if (mode !== 'pick' || !pickFolder) { setImages([]); return; }
    api.getSlideFolder(pickFolder).then((folder) => {
      const paths = folder.editable
        ? [...new Set(folder.slides.flatMap((s) => [s.background, s.text]))]
        : folder.images;
      setImages(paths);
    }).catch(() => setImages([]));
  }, [mode, pickFolder]);

  function onFile(e) {
    const file = e.target.files[0];
    if (file) onChange({ file, previewUrl: URL.createObjectURL(file) });
  }

  function onPick(path) {
    onChange({ ref: { folder: pickFolder, file: path.replace(/^img\//, '') }, previewUrl: api.slideImageUrl(pickFolder, path) });
  }

  return (
    <div className="field telao-source">
      <label>{label}</label>
      <div className="type-row">
        <button type="button" className={`type-chip ${mode === 'upload' ? 'active' : ''}`} onClick={() => setMode('upload')}>Enviar arquivo</button>
        <button type="button" className={`type-chip ${mode === 'pick' ? 'active' : ''}`} onClick={() => setMode('pick')}>Escolher de outra pasta</button>
      </div>

      {mode === 'upload' && (
        <input type="file" accept="image/png,image/jpeg,image/webp" onChange={onFile} />
      )}

      {mode === 'pick' && (
        <>
          <select value={pickFolder} onChange={(e) => setPickFolder(e.target.value)}>
            <option value="">Escolha uma pasta…</option>
            {otherFolders.map((f) => <option key={f.name} value={f.name}>{f.name}</option>)}
          </select>
          {images.length > 0 && (
            <div className="telao-pick-grid">
              {images.map((p) => {
                const active = value && value.ref && value.ref.folder === pickFolder && `img/${value.ref.file}` === p;
                return (
                  <button type="button" key={p} className={`telao-pick ${active ? 'active' : ''}`} onClick={() => onPick(p)}>
                    <img className="telao-thumb telao-checker" src={api.slideImageUrl(pickFolder, p)} alt="" loading="lazy" />
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function appendSource(formData, fileField, refField, value) {
  if (value.file) formData.append(fileField, value.file);
  else formData.append(refField, JSON.stringify(value.ref));
}
