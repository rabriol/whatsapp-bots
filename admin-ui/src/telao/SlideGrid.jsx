import { useEffect, useState } from 'react';
import { api } from '../api';
import { PlusIcon, TrashIcon } from '../icons';

export function SlideGrid({ folder, onChanged, onAddSlide, onReplace, onError }) {
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  // Drag-to-reorder: the slide being dragged, the slot (0..n) it would land in,
  // and the reordered list shown while the save is in flight.
  const [dragId, setDragId] = useState(null);
  const [dropIndex, setDropIndex] = useState(null);
  const [pending, setPending] = useState(null);

  useEffect(() => { setPending(null); }, [folder]);

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

  const slides = pending || folder.slides;

  async function confirmDelete(id) {
    try {
      await api.deleteSlide(folder.name, id);
      setConfirmDeleteId(null);
      onChanged();
    } catch (err) {
      onError(err.message);
    }
  }

  function onDragOver(e, i) {
    if (!dragId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = e.currentTarget.getBoundingClientRect();
    setDropIndex(e.clientX > rect.left + rect.width / 2 ? i + 1 : i);
  }

  function endDrag() {
    setDragId(null);
    setDropIndex(null);
  }

  async function onDrop(e) {
    e.preventDefault();
    const from = slides.findIndex((s) => s.id === dragId);
    let to = dropIndex;
    endDrag();
    if (from < 0 || to === null) return;
    if (to > from) to -= 1;
    if (to === from) return;

    const next = [...slides];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setPending(next);
    try {
      await api.reorderSlides(folder.name, next.map((s) => s.id));
    } catch (err) {
      onError(err.message);
    }
    onChanged();
  }

  return (
    <>
      {slides.length > 1 && <p className="subtitle">Arraste um slide para a esquerda ou para a direita para mudar a ordem.</p>}
      <div className="telao-grid">
        {slides.map((s, i) => {
          const dropClass = dragId && dragId !== s.id
            ? (dropIndex === i ? 'telao-drop-before' : dropIndex === i + 1 ? 'telao-drop-after' : '')
            : '';
          return (
            <div
              key={s.id}
              className={`telao-card telao-draggable ${dragId === s.id ? 'telao-dragging' : ''} ${dropClass}`}
              draggable={confirmDeleteId !== s.id}
              onDragStart={(e) => { setDragId(s.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', s.id); }}
              onDragOver={(e) => onDragOver(e, i)}
              onDrop={onDrop}
              onDragEnd={endDrag}
            >
              <div className="telao-pair">
                <img className="telao-thumb" src={api.slideImageUrl(folder.name, s.background)} alt={`Fundo do slide ${i + 1}`} loading="lazy" draggable={false} />
                <img className="telao-thumb telao-checker" src={api.slideImageUrl(folder.name, s.text)} alt={`Texto do slide ${i + 1}`} loading="lazy" draggable={false} />
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
          );
        })}
        <button className="telao-card telao-add" onClick={onAddSlide}>
          <PlusIcon />
          <span>Adicionar slide</span>
          <span className="telao-add-sub">fundo + texto</span>
        </button>
      </div>
    </>
  );
}
