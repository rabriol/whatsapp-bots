import { useState } from 'react';
import { api } from '../api';
import { PlusIcon, TrashIcon } from '../icons';

export function SlideGrid({ folder, onChanged, onAddSlide, onReplace, onError }) {
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  if (!folder.editable) {
    return (
      <div className="telao-grid">
        {folder.images.length === 0 && <div className="empty-state">Nenhuma imagem nesta pasta.</div>}
        {folder.images.map((img) => (
          <div key={img} className="telao-card">
            <img className="telao-thumb" src={api.slideImageUrl(folder.name, img)} alt="" loading="lazy" />
          </div>
        ))}
      </div>
    );
  }

  async function confirmDelete(id) {
    try {
      await api.deleteSlide(folder.name, id);
      setConfirmDeleteId(null);
      onChanged();
    } catch (err) {
      onError(err.message);
    }
  }

  return (
    <div className="telao-grid">
      {folder.slides.map((s, i) => (
        <div key={s.id} className="telao-card">
          <div className="telao-pair">
            <img className="telao-thumb" src={api.slideImageUrl(folder.name, s.background)} alt={`Fundo do slide ${i + 1}`} loading="lazy" />
            <img className="telao-thumb telao-checker" src={api.slideImageUrl(folder.name, s.text)} alt={`Texto do slide ${i + 1}`} loading="lazy" />
          </div>
          {confirmDeleteId === s.id ? (
            <div className="confirm-row">
              Remover?
              <button className="btn-ghost" onClick={() => setConfirmDeleteId(null)}>Cancelar</button>
              <button className="btn-danger" onClick={() => confirmDelete(s.id)}>Remover</button>
            </div>
          ) : (
            <div className="telao-card-foot">
              <span className="telao-card-num">{i + 1}</span>
              <div className="row-actions">
                <button className="btn-ghost telao-small" onClick={() => onReplace(s, 'background')}>Trocar fundo</button>
                <button className="btn-ghost telao-small" onClick={() => onReplace(s, 'text')}>Trocar texto</button>
                <button className="icon-btn" onClick={() => setConfirmDeleteId(s.id)} title="Remover"><TrashIcon /></button>
              </div>
            </div>
          )}
        </div>
      ))}
      <button className="telao-card telao-add" onClick={onAddSlide}>
        <PlusIcon />
        <span>Adicionar slide</span>
        <span className="telao-add-sub">fundo + texto</span>
      </button>
    </div>
  );
}
