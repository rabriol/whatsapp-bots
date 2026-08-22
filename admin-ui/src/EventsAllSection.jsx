import { Fragment, useEffect, useState } from 'react';
import { api } from './api';
import { SearchIcon } from './icons';

const MONTH_NAMES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function fmtDateShort(dateStr) {
  if (!dateStr) return '';
  const [m, d] = dateStr.split('/');
  if (!m || !d) return dateStr;
  return `${d.padStart(2, '0')} ${MONTH_NAMES[parseInt(m, 10) - 1] || ''}`;
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
  const timeLabel = e.allDay ? 'Dia inteiro' : [e.startTime, e.endTime].filter(Boolean).join(' – ');

  return (
    <div className="event-detail">
      <Item label="Descrição">{e.description}</Item>
      <Item label="Local">{e.location}</Item>
      <Item label="Horário">{timeLabel}</Item>
      <Item label="Recorrência">
        {e.recurrenceRule && <span className="rrule-cell">{e.recurrenceRule}</span>}
      </Item>
      <Item label="Inscrição">
        {e.registrationUrl && (
          <>
            <a href={e.registrationUrl} target="_blank" rel="noreferrer">
              {e.registrationButtonText || e.registrationUrl}
            </a>
            {e.registrationDeadline ? ` · até ${e.registrationDeadline}` : ''}
          </>
        )}
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
      <Item label="Participantes">{e.attendees}</Item>
      <Item label="Lembretes">{e.reminders}</Item>
      <Item label="Visibilidade">{e.visibility}</Item>
    </div>
  );
}

export function EventsAllSection() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedIndex, setExpandedIndex] = useState(null);

  useEffect(() => {
    api.getAllEvents()
      .then((r) => setEvents(r.events))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const q = searchQuery.trim().toLowerCase();
  const filtered = events.filter((e) => !q || e.title.toLowerCase().includes(q));

  return (
    <div className="card card-flush">
      <div className="card-head" style={{ padding: '14px 16px 0' }}>
        <h2>Todos os eventos ({events.length})</h2>
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
                <th>Data</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e, i) => (
                <Fragment key={i}>
                  <tr
                    className="event-row"
                    onClick={() => setExpandedIndex(expandedIndex === i ? null : i)}
                  >
                    <td>{e.title}</td>
                    <td className="muted">
                      {fmtDateShort(e.startDate)}
                      {e.endDate && e.endDate !== e.startDate ? ` – ${fmtDateShort(e.endDate)}` : ''}
                    </td>
                    <td>
                      <span className={`pill ${e.status === 'confirmed' ? 'pill-default' : 'pill-urgent'}`}>
                        {e.status || '—'}
                      </span>
                      {e.excludeWeekly && (
                        <span className="pill pill-default" style={{ marginLeft: 6 }}>Fora do aviso semanal</span>
                      )}
                    </td>
                  </tr>
                  {expandedIndex === i && (
                    <tr className="event-detail-row">
                      <td colSpan={3}>
                        <EventDetail event={e} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && filtered.length === 0 && <div className="empty-state">Nenhum evento encontrado.</div>}
    </div>
  );
}
