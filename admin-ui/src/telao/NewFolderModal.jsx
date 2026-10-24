import { useState } from 'react';
import { api } from '../api';
import { CloseIcon } from '../icons';

export function NewFolderModal({ onClose, onCreated }) {
  const [date, setDate] = useState('');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const preview = date ? `${date.slice(5, 7)}_${date.slice(8, 10)}_${date.slice(0, 4)}` : null;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const { name } = await api.createSlideFolder(date);
      onCreated(name);
      onClose();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(domEvent) => domEvent.stopPropagation()} style={{ maxWidth: 420 }}>
        <div className="modal-head">
          <h3>Nova pasta</h3>
          <button className="icon-btn" onClick={onClose}><CloseIcon /></button>
        </div>

        {error && <div className="error-banner">{error}</div>}

        <div className="field">
          <label>Data da apresentação</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          {preview && <span className="field-hint">A pasta vai se chamar {preview}.</span>}
        </div>

        <div className="modal-actions">
          <button className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={save} disabled={!date || saving}>
            {saving ? 'Criando...' : 'Criar pasta'}
          </button>
        </div>
      </div>
    </div>
  );
}
