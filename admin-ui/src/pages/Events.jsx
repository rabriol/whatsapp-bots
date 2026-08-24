import { useEffect, useState } from 'react';
import { api } from '../api';
import { ClockIcon, EventIcon, CheckIcon } from '../icons';
import { WhatsAppText } from '../WhatsAppText';

export default function Events() {
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [editingWindow, setEditingWindow] = useState(false);
  const [draftWindow, setDraftWindow] = useState(45);
  const [savedFlash, setSavedFlash] = useState(false);

  function load() {
    setLoading(true);
    api.getEventsPreview()
      .then(setPreview)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  function startEdit() {
    setDraftWindow(preview.windowDays);
    setEditingWindow(true);
  }

  async function saveWindow() {
    try {
      await api.updateEventsWindow(draftWindow);
      setEditingWindow(false);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2200);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  if (loading) return <div className="content">Carregando...</div>;

  return (
    <div className="content">
      <div className="page-head">
        <div>
          <h1>Eventos</h1>
          <p className="subtitle">
            O que será enviado na próxima mensagem semanal (próximos {preview?.windowDays ?? 45} dias).
          </p>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="card">
        <div className="schedule-row">
          <div className="schedule-icon">
            <ClockIcon />
          </div>
          <div className="schedule-info">
            <div className="schedule-label">Frequência de envio</div>
            <div className="schedule-value">Toda semana, sábado às 11:00 (Los Angeles)</div>
          </div>
        </div>
      </div>

      <div className="card">
        {!editingWindow && (
          <div className="schedule-row">
            <div className="schedule-icon">
              <EventIcon />
            </div>
            <div className="schedule-info">
              <div className="schedule-label">Janela de eventos</div>
              <div className="schedule-value">Próximos {preview?.windowDays ?? 45} dias</div>
            </div>
            <button className="btn-ghost" onClick={startEdit}>Editar janela</button>
          </div>
        )}

        {editingWindow && (
          <div className="schedule-edit">
            <div className="field">
              <label>Dias à frente (1–180)</label>
              <input
                type="number" min="1" max="180" value={draftWindow}
                onChange={(e) => setDraftWindow(parseInt(e.target.value, 10) || 1)}
              />
            </div>
            <div className="edit-actions">
              <button className="btn-ghost" onClick={() => setEditingWindow(false)}>Cancelar</button>
              <button className="btn-primary" onClick={saveWindow}>Salvar</button>
            </div>
          </div>
        )}

        {savedFlash && (
          <div className="save-flash">
            <CheckIcon /> Janela atualizada
          </div>
        )}
      </div>

      {preview && preview.entries.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            Nenhum evento nos próximos {preview.windowDays} dias — o bot não enviaria mensagem essa semana.
          </div>
        </div>
      ) : (
        <div className="card preview-panel" style={{ maxWidth: 480 }}>
          <div className="preview-panel-label">Pré-visualização da mensagem</div>
          <div className="preview-panel-sub">{preview?.entries.length} evento(s) nessa janela</div>
          <div className="bubble">
            <div className="bubble-text"><WhatsAppText text={preview?.message} /></div>
          </div>
        </div>
      )}
    </div>
  );
}
