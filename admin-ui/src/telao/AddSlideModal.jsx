import { useState } from 'react';
import { api } from '../api';
import { CloseIcon } from '../icons';
import { ImageSource, appendSource } from './ImageSource';

// mode is 'add', or { replace: 'background' | 'text', slide } to swap one image.
export function AddSlideModal({ folder, folders, mode, onClose, onSaved }) {
  const replacing = mode !== 'add' ? mode.replace : null;
  const slide = replacing ? mode.slide : null;
  const existing = (role) => (slide ? { previewUrl: api.slideImageUrl(folder.name, slide[role]) } : null);

  const [background, setBackground] = useState(replacing === 'text' ? existing('background') : null);
  const [text, setText] = useState(replacing === 'background' ? existing('text') : null);
  const [errors, setErrors] = useState([]);
  const [saving, setSaving] = useState(false);

  const ready = replacing ? Boolean(replacing === 'background' ? background : text) : Boolean(background && text);
  const title = replacing === 'background' ? 'Trocar fundo' : replacing === 'text' ? 'Trocar texto' : 'Adicionar slide';

  async function save() {
    setSaving(true);
    setErrors([]);
    const form = new FormData();
    try {
      let saved;
      if (replacing) {
        appendSource(form, 'image', 'imageRef', replacing === 'background' ? background : text);
        saved = await api.replaceSlideImage(folder.name, slide.id, replacing, form);
      } else {
        appendSource(form, 'background', 'backgroundRef', background);
        appendSource(form, 'text', 'textRef', text);
        saved = await api.addSlide(folder.name, form);
      }
      onSaved(saved.warnings || []);
      onClose();
    } catch (err) {
      setErrors(err.errors && err.errors.length ? err.errors : [err.message]);
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(domEvent) => domEvent.stopPropagation()}>
        <div className="modal-head">
          <h3>{title} · {folder.name}</h3>
          <button className="icon-btn" onClick={onClose}><CloseIcon /></button>
        </div>

        {errors.length > 0 && (
          <div className="error-banner">
            {errors.map((e) => <div key={e}>{e}</div>)}
          </div>
        )}

        <div className="modal-grid">
          <div className="modal-form-col">
            {replacing !== 'text' && (
              <ImageSource label="Fundo" value={background} onChange={setBackground} folders={folders} currentFolder={folder.name} />
            )}
            {replacing !== 'background' && (
              <ImageSource label="Texto (PNG com fundo transparente)" value={text} onChange={setText} folders={folders} currentFolder={folder.name} />
            )}
          </div>

          <div className="preview-panel">
            <div className="preview-panel-label">Prévia no telão</div>
            <div className="preview-panel-sub">O texto aparece 1 s depois do fundo.</div>
            <div className="telao-preview">
              {background && <img src={background.previewUrl} alt="" />}
              {text && <img src={text.previewUrl} alt="" />}
              {!background && !text && <span className="telao-preview-empty">Escolha as imagens</span>}
            </div>
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={save} disabled={!ready || saving}>
            {saving ? 'Salvando...' : replacing ? 'Salvar' : 'Adicionar slide'}
          </button>
        </div>
      </div>
    </div>
  );
}
