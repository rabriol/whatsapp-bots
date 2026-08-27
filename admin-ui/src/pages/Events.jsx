import { useEffect, useState } from 'react';
import { RRule } from 'rrule';
import { api } from '../api';
import { ClockIcon, EventIcon, CheckIcon } from '../icons';
import { WhatsAppText } from '../WhatsAppText';
import { RecurrenceBuilder } from '../RecurrenceBuilder';

const WEEKDAY_LABELS = { MO: 'segunda', TU: 'terça', WE: 'quarta', TH: 'quinta', FR: 'sexta', SA: 'sábado', SU: 'domingo' };
const WEEKDAY_BY_INDEX = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

function humanizeSendSchedule(rruleStr, time) {
  let label;
  try {
    const o = RRule.fromString(rruleStr).origOptions;
    const byweekdayArr = o.byweekday ? (Array.isArray(o.byweekday) ? o.byweekday : [o.byweekday]) : [];
    const days = byweekdayArr.map((w) => WEEKDAY_LABELS[WEEKDAY_BY_INDEX[w.weekday]]).filter(Boolean);
    if (o.freq === RRule.DAILY) label = 'Todos os dias';
    else if (o.freq === RRule.WEEKLY) label = days.length ? `Toda semana, ${days.join(' e ')}` : 'Toda semana';
    else if (o.freq === RRule.MONTHLY) label = days.length ? `Todo mês, ${days.join(' e ')}` : 'Todo mês';
    else label = rruleStr;
  } catch {
    label = rruleStr;
  }
  return `${label} às ${time} (Los Angeles)`;
}

export default function Events() {
  const [preview, setPreview] = useState(null);
  const [sendSchedule, setSendSchedule] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [editingWindow, setEditingWindow] = useState(false);
  const [draftWindow, setDraftWindow] = useState(45);
  const [windowSavedFlash, setWindowSavedFlash] = useState(false);

  const [editingSchedule, setEditingSchedule] = useState(false);
  const [draftRrule, setDraftRrule] = useState('');
  const [draftTime, setDraftTime] = useState('11:00');
  const [scheduleSavedFlash, setScheduleSavedFlash] = useState(false);

  function load() {
    setLoading(true);
    Promise.all([api.getEventsPreview(), api.getSendSchedule()])
      .then(([p, s]) => {
        setPreview(p);
        setSendSchedule(s);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  function startEditWindow() {
    setDraftWindow(preview.windowDays);
    setEditingWindow(true);
  }

  async function saveWindow() {
    try {
      await api.updateEventsWindow(draftWindow);
      setEditingWindow(false);
      setWindowSavedFlash(true);
      setTimeout(() => setWindowSavedFlash(false), 2200);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  function startEditSchedule() {
    setDraftRrule(sendSchedule.rrule);
    setDraftTime(sendSchedule.time);
    setEditingSchedule(true);
  }

  async function saveSchedule() {
    try {
      await api.updateSendSchedule({ rrule: draftRrule, time: draftTime });
      setEditingSchedule(false);
      setScheduleSavedFlash(true);
      setTimeout(() => setScheduleSavedFlash(false), 2200);
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
        {!editingSchedule && (
          <div className="schedule-row">
            <div className="schedule-icon">
              <ClockIcon />
            </div>
            <div className="schedule-info">
              <div className="schedule-label">Frequência de envio</div>
              <div className="schedule-value">{humanizeSendSchedule(sendSchedule.rrule, sendSchedule.time)}</div>
            </div>
            <button className="btn-ghost" onClick={startEditSchedule}>Editar frequência</button>
          </div>
        )}

        {editingSchedule && (
          <div className="schedule-edit">
            <RecurrenceBuilder value={draftRrule} onChange={setDraftRrule} allowExceptions={false} />
            <div className="field">
              <label>Horário (Los Angeles)</label>
              <input type="time" value={draftTime} onChange={(e) => setDraftTime(e.target.value)} />
            </div>
            <div className="edit-actions">
              <button className="btn-ghost" onClick={() => setEditingSchedule(false)}>Cancelar</button>
              <button className="btn-primary" onClick={saveSchedule}>Salvar</button>
            </div>
          </div>
        )}

        {scheduleSavedFlash && (
          <div className="save-flash">
            <CheckIcon /> Frequência atualizada
          </div>
        )}
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
            <button className="btn-ghost" onClick={startEditWindow}>Editar janela</button>
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

        {windowSavedFlash && (
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
