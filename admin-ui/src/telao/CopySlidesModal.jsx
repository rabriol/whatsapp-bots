import { useEffect, useState } from 'react';
import { api } from '../api';
import { CloseIcon } from '../icons';

export function CopySlidesModal({ folder, folders, onClose, onCopied }) {
  const sources = folders.filter((f) => f.editable && f.name !== folder.name && f.count > 0);
  const [from, setFrom] = useState(sources[0] ? sources[0].name : '');
  const [slides, setSlides] = useState([]);
  const [picked, setPicked] = useState(new Set());
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setPicked(new Set());
    if (!from) { setSlides([]); return; }
    api.getSlideFolder(from).then((f) => setSlides(f.slides || [])).catch((err) => setError(err.message));
  }, [from]);

  function toggle(id) {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id); else next.add(id);
    setPicked(next);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await api.copySlides(folder.name, from, [...picked]);
      onCopied();
      onClose();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(domEvent) => domEvent.stopPropagation()} style={{ maxWidth: 720 }}>
        <div className="modal-head">
          <h3>Copiar slides para {folder.name}</h3>
          <button className="icon-btn" onClick={onClose}><CloseIcon /></button>
        </div>

        {error && <div className="error-banner">{error}</div>}

        {sources.length === 0 ? (
          <div className="empty-state">Nenhuma outra pasta tem slides para copiar. Para reaproveitar uma imagem avulsa, use "Adicionar slide" › "Escolher de outra pasta".</div>
        ) : (
          <>
            <div className="field">
              <label>Copiar de</label>
              <select value={from} onChange={(e) => setFrom(e.target.value)}>
                {sources.map((f) => <option key={f.name} value={f.name}>{f.name}</option>)}
              </select>
            </div>
            <div className="telao-grid">
              {slides.map((s, i) => (
                <label key={s.id} className={`telao-card telao-copy ${picked.has(s.id) ? 'active' : ''}`}>
                  <div className="telao-pair">
                    <img className="telao-thumb" src={api.slideImageUrl(from, s.background)} alt="" loading="lazy" />
                    <img className="telao-thumb telao-checker" src={api.slideImageUrl(from, s.text)} alt="" loading="lazy" />
                  </div>
                  <span className="telao-card-foot">
                    <span className="telao-card-num">{i + 1}</span>
                    <input type="checkbox" checked={picked.has(s.id)} onChange={() => toggle(s.id)} />
                  </span>
                </label>
              ))}
            </div>
          </>
        )}

        <div className="modal-actions">
          <button className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={save} disabled={picked.size === 0 || saving}>
            {saving ? 'Copiando...' : `Copiar ${picked.size} ${picked.size === 1 ? 'slide' : 'slides'}`}
          </button>
        </div>
      </div>
    </div>
  );
}
