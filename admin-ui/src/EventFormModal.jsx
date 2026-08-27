import { useState } from 'react';
import { api } from './api';
import { CloseIcon } from './icons';
import { RecurrenceBuilder } from './RecurrenceBuilder';

const STATUS_OPTIONS = [
  { value: 'confirmed', label: 'Confirmado' },
  { value: 'tentative', label: 'Provisório' },
  { value: 'cancelled', label: 'Cancelado' },
];

const TIMEZONE_OPTIONS = [
  'America/Los_Angeles', 'America/Denver', 'America/Chicago',
  'America/New_York', 'Pacific/Honolulu', 'America/Anchorage',
];

const VISIBILITY_OPTIONS = [
  { value: '', label: '(padrão do Calendar)' },
  { value: 'default', label: 'Padrão' },
  { value: 'public', label: 'Público' },
  { value: 'private', label: 'Privado' },
  { value: 'confidential', label: 'Confidencial' },
];

// Google Calendar's 11 named event colors (colorId names, not the numeric
// ids) - hex values here are just approximate swatches for the picker.
export const COLOR_OPTIONS = [
  { value: '', label: '(nenhuma)', hex: null },
  { value: 'lavender', label: 'Lavanda', hex: '#7986CB' },
  { value: 'sage', label: 'Sálvia', hex: '#33B679' },
  { value: 'grape', label: 'Uva', hex: '#8E24AA' },
  { value: 'flamingo', label: 'Flamingo', hex: '#E67C73' },
  { value: 'banana', label: 'Banana', hex: '#F6BF26' },
  { value: 'tangerine', label: 'Tangerina', hex: '#F4511E' },
  { value: 'peacock', label: 'Pavão', hex: '#039BE5' },
  { value: 'graphite', label: 'Grafite', hex: '#616161' },
  { value: 'blueberry', label: 'Mirtilo', hex: '#3F51B5' },
  { value: 'basil', label: 'Manjericão', hex: '#0B8043' },
  { value: 'tomato', label: 'Tomate', hex: '#D50000' },
];

// More churches can be added here later - for now just these two.
export const CHURCH_OPTIONS = [
  { value: 'orangevale', label: 'Igreja Orangevale' },
  { value: 'ncc', label: 'NCC' },
];

const EMPTY_DRAFT = {
  title: '', description: '', location: '',
  startDate: '', endDate: '', startTime: '', endTime: '',
  allDay: false, recurrenceRule: '', status: 'confirmed',
  zoomUrl: '', youtubeUrl: '', isLive: false,
  timezone: 'America/Los_Angeles', attendees: '', reminders: [],
  visibility: '', colorId: '', htmlDescription: '', church: 'orangevale',
};

// reminders is stored as "method:minutes" pairs joined by comma (e.g.
// "popup:30,email:60"). Only ever seen a single reminder in real data, so
// the multi-value delimiter is our best guess - verify against a real save
// before trusting it further.
function parseReminders(s) {
  if (!s) return [];
  return s.split(',').map((part) => {
    const [method, minutes] = part.split(':');
    return { method: (method || 'popup').trim(), minutes: parseInt(minutes, 10) || 0 };
  }).filter((r) => r.minutes > 0);
}

function serializeReminders(list) {
  return list.filter((r) => r.minutes > 0).map((r) => `${r.method}:${r.minutes}`).join(',');
}

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
    timezone: e.timezone || 'America/Los_Angeles',
    attendees: e.attendees || '',
    reminders: parseReminders(e.reminders),
    visibility: e.visibility || '',
    colorId: e.colorId || '',
    htmlDescription: e.htmlDescription || '',
    church: e.church || 'orangevale',
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
    timezone: d.timezone,
    attendees: d.attendees.trim(),
    reminders: serializeReminders(d.reminders),
    visibility: d.visibility,
    colorId: d.colorId,
    htmlDescription: d.htmlDescription.trim(),
    church: d.church,
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
            <label>Igreja</label>
            <select value={draft.church} onChange={(e) => set('church', e.target.value)}>
              {CHURCH_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
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
            <label>Fuso horário</label>
            <select value={draft.timezone} onChange={(e) => set('timezone', e.target.value)}>
              {TIMEZONE_OPTIONS.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
            </select>
          </div>

          <RecurrenceBuilder value={draft.recurrenceRule} onChange={(v) => set('recurrenceRule', v)} />

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

          <div className="field">
            <label>Participantes (e-mails separados por vírgula)</label>
            <input
              type="text" placeholder="fulano@exemplo.com, ciclana@exemplo.com"
              value={draft.attendees} onChange={(e) => set('attendees', e.target.value)}
            />
          </div>

          <div className="field">
            <label>Lembretes</label>
            {draft.reminders.map((r, i) => (
              <div key={i} className="field-row" style={{ marginBottom: 6, alignItems: 'center' }}>
                <select
                  value={r.method}
                  onChange={(e) => set('reminders', draft.reminders.map((x, idx) => (idx === i ? { ...x, method: e.target.value } : x)))}
                >
                  <option value="popup">Popup</option>
                  <option value="email">E-mail</option>
                </select>
                <input
                  type="number" min="1" placeholder="minutos antes" value={r.minutes || ''}
                  onChange={(e) => set('reminders', draft.reminders.map((x, idx) => (idx === i ? { ...x, minutes: parseInt(e.target.value, 10) || 0 } : x)))}
                />
                <button
                  type="button" className="icon-btn" title="Remover"
                  onClick={() => set('reminders', draft.reminders.filter((_, idx) => idx !== i))}
                >
                  <CloseIcon />
                </button>
              </div>
            ))}
            <button
              type="button" className="btn-ghost" style={{ alignSelf: 'flex-start' }}
              onClick={() => set('reminders', [...draft.reminders, { method: 'popup', minutes: 30 }])}
            >
              + Adicionar lembrete
            </button>
          </div>

          <div className="field">
            <label>Visibilidade</label>
            <select value={draft.visibility} onChange={(e) => set('visibility', e.target.value)}>
              {VISIBILITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div className="field">
            <label>Cor no Calendar</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {COLOR_OPTIONS.map((c) => (
                <button
                  key={c.value} type="button" title={c.label}
                  className={`freq-chip ${draft.colorId === c.value ? 'active' : ''}`}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  onClick={() => set('colorId', c.value)}
                >
                  {c.hex && <span style={{ width: 10, height: 10, borderRadius: '50%', background: c.hex, display: 'inline-block' }} />}
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label>Descrição HTML (opcional)</label>
            <textarea
              placeholder="<p>Descrição formatada em HTML...</p>"
              value={draft.htmlDescription} onChange={(e) => set('htmlDescription', e.target.value)}
            />
          </div>
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
