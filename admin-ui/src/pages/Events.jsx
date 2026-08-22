import { useEffect, useState } from 'react';
import { api } from '../api';
import { ClockIcon } from '../icons';
import { WhatsAppText } from '../WhatsAppText';

export default function Events() {
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.getEventsPreview()
      .then(setPreview)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="content">Carregando...</div>;

  return (
    <div className="content">
      <div className="page-head">
        <div>
          <h1>Eventos</h1>
          <p className="subtitle">O que será enviado na próxima mensagem semanal (próximos 45 dias).</p>
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

      {preview && preview.entries.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            Nenhum evento nos próximos 45 dias — o bot não enviaria mensagem essa semana.
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
