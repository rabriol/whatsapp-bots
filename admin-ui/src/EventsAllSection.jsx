import { Fragment, useEffect, useState } from 'react';
import { api } from './api';
import { SearchIcon, PlusIcon, PencilIcon } from './icons';
import { EventFormModal, COLOR_OPTIONS } from './EventFormModal';

const TRUNCATE_STYLE = { maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };

const MONTH_NAMES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function fmtDateShort(dateStr) {
  if (!dateStr) return '';
  const [m, d] = dateStr.split('/');
  if (!m || !d) return dateStr;
  return `${d.padStart(2, '0')} ${MONTH_NAMES[parseInt(m, 10) - 1] || ''}`;
}

// Matches shared/events.js's filter: blank or exactly 'confirmed' means the
// event is shown in the weekly message; anything else (e.g. 'cancelled')
// excludes it.
function isEventActive(status) {
  const s = (status || '').trim().toLowerCase();
  return s === '' || s === 'confirmed';
}

function statusLabel(status) {
  const s = (status || '').trim().toLowerCase();
  if (s === 'cancelled') return 'Cancelado';
  if (s === 'tentative') return 'Provisório';
  return 'Confirmado';
}

function isCancelled(status) {
  return (status || '').trim().toLowerCase() === 'cancelled';
}

function Item({ label, children }) {
  if (!children) return null;
  return (
    <div className="event-detail-item">
      <span className="k">{label}</span>
      <span className="v">{children}</span>
    </div>
  );
}

function EventDetail({ event: e }) {
  return (
    <div className="event-detail">
      <Item label="Local">{e.location}</Item>
      <Item label="Descrição">{e.description}</Item>
      <Item label="Descrição HTML">
        {e.htmlDescription && <span className="rrule-cell">{e.htmlDescription}</span>}
      </Item>
      <Item label="Zoom">
        {e.zoomUrl && <a href={e.zoomUrl} target="_blank" rel="noreferrer">{e.zoomUrl}</a>}
      </Item>
      <Item label="YouTube">
        {e.youtubeUrl && (
          <>
            <a href={e.youtubeUrl} target="_blank" rel="noreferrer">{e.youtubeUrl}</a>
            {e.isLive ? ' · ao vivo' : ''}
          </>
        )}
      </Item>
    </div>
  );
}

export function EventsAllSection() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedIndex, setExpandedIndex] = useState(null);
  const [formModal, setFormModal] = useState(null); // null | 'create' | event object to edit

  function load() {
    setLoading(true);
    api.getAllEvents()
      .then((r) => setEvents(r.events))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  const q = searchQuery.trim().toLowerCase();
  const filtered = events.filter((e) => !q || e.title.toLowerCase().includes(q));

  function openEdit(domEvent, e) {
    domEvent.stopPropagation();
    setFormModal(e);
  }

  async function toggleStatus(domEvent, e) {
    domEvent.stopPropagation();
    const nextStatus = isEventActive(e.status) ? 'cancelled' : 'confirmed';
    const prevStatus = e.status;
    setEvents((rows) => rows.map((r) => (r.rowNumber === e.rowNumber ? { ...r, status: nextStatus } : r)));
    try {
      await api.updateEventStatus(e.rowNumber, nextStatus);
    } catch (err) {
      setEvents((rows) => rows.map((r) => (r.rowNumber === e.rowNumber ? { ...r, status: prevStatus } : r)));
      setError(err.message);
    }
  }

  return (
    <div className="card card-flush">
      <div className="card-head" style={{ padding: '14px 16px 0' }}>
        <h2>Todos os eventos ({events.length})</h2>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div className="search-box">
            <SearchIcon />
            <input
              type="text"
              placeholder="Buscar por título..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setExpandedIndex(null);
              }}
            />
          </div>
          <button className="btn-primary" onClick={() => setFormModal('create')}>
            <PlusIcon /> Novo evento
          </button>
        </div>
      </div>

      {error && <div className="error-banner" style={{ margin: '0 16px' }}>{error}</div>}

      {loading ? (
        <div className="empty-state">Carregando...</div>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Título</th>
                <th>Status</th>
                <th>Início</th>
                <th>Fim</th>
                <th>Hora início</th>
                <th>Hora fim</th>
                <th>Recorrência</th>
                <th>Fuso horário</th>
                <th>Local</th>
                <th>Descrição</th>
                <th>Zoom</th>
                <th>YouTube</th>
                <th>Participantes</th>
                <th>Lembretes</th>
                <th>Visibilidade</th>
                <th>Cor</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e, i) => {
                const color = COLOR_OPTIONS.find((c) => c.value === e.colorId);
                return (
                  <Fragment key={i}>
                    <tr
                      className="event-row"
                      onClick={() => setExpandedIndex(expandedIndex === i ? null : i)}
                    >
                      <td style={isCancelled(e.status) ? { textDecoration: 'line-through', opacity: 0.6 } : undefined}>
                        {e.title}
                      </td>
                      <td>
                        <button
                          className={`status-pill ${isEventActive(e.status) ? 'active' : 'paused'}`}
                          onClick={(domEvent) => toggleStatus(domEvent, e)}
                        >
                          {statusLabel(e.status)}
                        </button>
                      </td>
                      <td className="muted">{fmtDateShort(e.startDate) || '—'}</td>
                      <td className="muted">
                        {e.endDate && e.endDate !== e.startDate ? fmtDateShort(e.endDate) : '—'}
                      </td>
                      <td className="muted">{e.allDay ? 'Dia inteiro' : (e.startTime || '—')}</td>
                      <td className="muted">{e.allDay ? '—' : (e.endTime || '—')}</td>
                      <td>
                        {e.recurrenceRule
                          ? <span className="rrule-cell">{e.recurrenceRule}</span>
                          : <span className="muted">—</span>}
                      </td>
                      <td className="muted">{e.timezone || '—'}</td>
                      <td className="muted" style={TRUNCATE_STYLE} title={e.location || undefined}>{e.location || '—'}</td>
                      <td className="muted" style={TRUNCATE_STYLE} title={e.description || undefined}>{e.description || '—'}</td>
                      <td>
                        {e.zoomUrl
                          ? <a href={e.zoomUrl} target="_blank" rel="noreferrer" onClick={(ev) => ev.stopPropagation()}>Abrir ↗</a>
                          : <span className="muted">—</span>}
                      </td>
                      <td>
                        {e.youtubeUrl
                          ? (
                            <a href={e.youtubeUrl} target="_blank" rel="noreferrer" onClick={(ev) => ev.stopPropagation()}>
                              Abrir ↗{e.isLive ? ' · ao vivo' : ''}
                            </a>
                          )
                          : <span className="muted">—</span>}
                      </td>
                      <td className="muted" style={TRUNCATE_STYLE} title={e.attendees || undefined}>{e.attendees || '—'}</td>
                      <td className="muted">{e.reminders || '—'}</td>
                      <td className="muted">{e.visibility || '—'}</td>
                      <td>
                        {color?.hex ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ width: 10, height: 10, borderRadius: '50%', background: color.hex, display: 'inline-block' }} />
                            {color.label}
                          </span>
                        ) : <span className="muted">—</span>}
                      </td>
                      <td>
                        <button className="icon-btn" onClick={(domEvent) => openEdit(domEvent, e)} title="Editar">
                          <PencilIcon />
                        </button>
                      </td>
                    </tr>
                    {expandedIndex === i && (
                      <tr className="event-detail-row">
                        <td colSpan={17}>
                          <EventDetail event={e} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && filtered.length === 0 && <div className="empty-state">Nenhum evento encontrado.</div>}

      {formModal && (
        <EventFormModal
          event={formModal === 'create' ? null : formModal}
          onClose={() => setFormModal(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}
