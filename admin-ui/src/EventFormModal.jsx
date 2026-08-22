import { useState } from 'react';
import { api } from './api';
import { CloseIcon } from './icons';

const STATUS_OPTIONS = [
  { value: 'confirmed', label: 'Confirmado' },
  { value: 'tentative', label: 'Provisório' },
  { value: 'cancelled', label: 'Cancelado' },
];

const EMPTY_DRAFT = {
  title: '', description: '', location: '',
  startDate: '', endDate: '', startTime: '', endTime: '',
  allDay: false, recurrenceRule: '', status: 'confirmed',
  zoomUrl: '', youtubeUrl: '', isLive: false,
};

// The sheet stores dates/times as plain text in "M/D/YYYY" and
// "h:mm:ss AM/PM" (e.g. "2/21/2026", "6:00:00 PM") - matching the format
// events-sync and shared/events.js's parseDate already expect. These
// convert to/from the formats native <input type="date"/"time"> need.
function toHtmlDate(s) {
  if (!s) return '';
  const [m, d, y] = s.split('/').map(Number);
  if (!m || !d || !y) return '';
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function fromHtmlDate(s) {
  if (!s) return '';
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return '';
  return `${m}/${d}/${y}`;
}

function toHtmlTime(s) {
  if (!s) return '';
  const m = /^(\d{1,2}):(\d{2}):\d{2}\s*(AM|PM)$/i.exec(s.trim());
  if (!m) return '';
  let h = parseInt(m[1], 10);
  const ampm = m[3].toUpperCase();
  if (ampm === 'PM' && h !== 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${m[2]}`;
}

function fromHtmlTime(s) {
  if (!s) return '';
  const [hStr, min] = s.split(':');
  const h = parseInt(hStr, 10);
  const ampm = h >= 12 ? 'PM' : 'AM';
  let h12 = h % 12;
  if (h12 === 0) h12 = 12;
  return `${h12}:${min}:00 ${ampm}`;
}

function eventToDraft(e) {
  return {
    title: e.title || '',
    description: e.description || '',
    location: e.location || '',
    startDate: toHtmlDate(e.startDate),
    endDate: toHtmlDate(e.endDate),
    startTime: toHtmlTime(e.startTime),
    endTime: toHtmlTime(e.endTime),
    allDay: !!e.allDay,
    recurrenceRule: e.recurrenceRule || '',
    status: e.status || 'confirmed',
    zoomUrl: e.zoomUrl || '',
    youtubeUrl: e.youtubeUrl || '',
    isLive: !!e.isLive,
  };
}

function draftToPayload(d) {
  return {
    title: d.title.trim(),
    description: d.description.trim(),
    location: d.location.trim(),
    startDate: fromHtmlDate(d.startDate),
    endDate: fromHtmlDate(d.endDate || d.startDate),
    startTime: d.allDay ? '' : fromHtmlTime(d.startTime),
    endTime: d.allDay ? '' : fromHtmlTime(d.endTime),
    allDay: d.allDay,
    recurrenceRule: d.recurrenceRule.trim(),
    status: d.status,
    zoomUrl: d.zoomUrl.trim(),
    youtubeUrl: d.youtubeUrl.trim(),
    isLive: d.isLive,
  };
}

export function EventFormModal({ event, onClose, onSaved }) {
  const [draft, setDraft] = useState(event ? eventToDraft(event) : EMPTY_DRAFT);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  function set(key, value) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  async function save() {
    if (!draft.title.trim() || !draft.startDate) {
      setError('Título e data de início são obrigatórios.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = draftToPayload(draft);
      if (event) {
        await api.updateEvent(event.rowNumber, payload);
      } else {
        await api.createEvent(payload);
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(domEvent) => domEvent.stopPropagation()} style={{ maxWidth: 560 }}>
        <div className="modal-head">
          <h3>{event ? 'Editar evento' : 'Novo evento'}</h3>
          <button className="icon-btn" onClick={onClose}><CloseIcon /></button>
        </div>

        {error && <div className="error-banner">{error}</div>}

        <div className="modal-form-col">
          <div className="field">
            <label>Título</label>
            <input type="text" value={draft.title} onChange={(e) => set('title', e.target.value)} />
          </div>

          <div className="field">
            <label>Descrição</label>
            <textarea value={draft.description} onChange={(e) => set('description', e.target.value)} />
          </div>

          <div className="field">
            <label>Local</label>
            <input type="text" value={draft.location} onChange={(e) => set('location', e.target.value)} />
          </div>

          <div className="field-row">
            <div className="field">
              <label>Data início</label>
              <input type="date" value={draft.startDate} onChange={(e) => set('startDate', e.target.value)} />
            </div>
            <div className="field">
              <label>Data fim</label>
              <input type="date" value={draft.endDate} onChange={(e) => set('endDate', e.target.value)} />
            </div>
          </div>

          <button
            type="button"
            className={`freq-chip ${draft.allDay ? 'active' : ''}`}
            style={{ alignSelf: 'flex-start' }}
            onClick={() => set('allDay', !draft.allDay)}
          >
            Dia inteiro
          </button>

          {!draft.allDay && (
            <div className="field-row">
              <div className="field">
                <label>Hora início</label>
                <input type="time" value={draft.startTime} onChange={(e) => set('startTime', e.target.value)} />
              </div>
              <div className="field">
                <label>Hora fim</label>
                <input type="time" value={draft.endTime} onChange={(e) => set('endTime', e.target.value)} />
              </div>
            </div>
          )}

          <div className="field">
            <label>Recorrência (RRULE, opcional)</label>
            <input
              type="text" placeholder="RRULE:FREQ=WEEKLY;BYDAY=SA"
              value={draft.recurrenceRule} onChange={(e) => set('recurrenceRule', e.target.value)}
            />
            <div className="field-hint">Deixe em branco para um evento único, sem repetição.</div>
          </div>

          <div className="field">
            <label>Status</label>
            <select value={draft.status} onChange={(e) => set('status', e.target.value)}>
              {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div className="field">
            <label>Zoom (URL)</label>
            <input type="text" placeholder="https://..." value={draft.zoomUrl} onChange={(e) => set('zoomUrl', e.target.value)} />
          </div>

          <div className="field">
            <label>YouTube (URL)</label>
            <input type="text" placeholder="https://..." value={draft.youtubeUrl} onChange={(e) => set('youtubeUrl', e.target.value)} />
          </div>

          <button
            type="button"
            className={`freq-chip ${draft.isLive ? 'active' : ''}`}
            style={{ alignSelf: 'flex-start' }}
            onClick={() => set('isLive', !draft.isLive)}
          >
            Transmissão ao vivo
          </button>
        </div>

        <div className="modal-actions">
          <button className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar evento'}
          </button>
        </div>
      </div>
    </div>
  );
}
