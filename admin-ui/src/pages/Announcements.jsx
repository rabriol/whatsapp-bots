import { useEffect, useState } from 'react';
import { api } from '../api';
import { formatMessage } from '../messagePreview';
import {
  PlusIcon, PencilIcon, TrashIcon, CloseIcon,
  SimpleIcon, EventIcon, DonationIcon, RentIcon,
} from '../icons';

const TYPE_DEFS = [
  { key: 'simple', label: 'Simples', Icon: SimpleIcon },
  { key: 'event', label: 'Evento', Icon: EventIcon },
  { key: 'donation', label: 'Doação', Icon: DonationIcon },
  { key: 'rent', label: 'Aluguel', Icon: RentIcon },
];
const MONEY_TYPES = ['donation', 'rent'];
const DOT_COLORS = {
  simple: 'var(--ink-500)', event: 'var(--ink-500)',
  donation: 'var(--accent)', rent: 'var(--accent)',
};

const DAY_DEFS = [
  { code: 'SU', label: 'Dom', full: 'domingo' },
  { code: 'MO', label: 'Seg', full: 'segunda' },
  { code: 'TU', label: 'Ter', full: 'terça' },
  { code: 'WE', label: 'Qua', full: 'quarta' },
  { code: 'TH', label: 'Qui', full: 'quinta' },
  { code: 'FR', label: 'Sex', full: 'sexta' },
  { code: 'SA', label: 'Sáb', full: 'sábado' },
];

function humanizeRecurrence(freq, byDay, day, dateOnce) {
  if (freq === 'none') return dateOnce ? `Uma vez, ${dateOnce}` : 'Uma vez';
  if (freq === 'daily') return 'Todos os dias';
  if (freq === 'weekly') {
    if (!byDay.length) return 'Toda semana';
    return 'Toda semana, ' + byDay.map((c) => DAY_DEFS.find((d) => d.code === c)?.full).filter(Boolean).join(' e ');
  }
  return `Todo mês, dia ${day}`;
}

function buildRRule(freq, byDay, day, dateOnce) {
  if (freq === 'none') return dateOnce ? `Uma vez, em ${dateOnce}` : 'Ocorre uma vez, sem repetição';
  if (freq === 'daily') return 'RRULE:FREQ=DAILY';
  if (freq === 'weekly') return byDay.length ? `RRULE:FREQ=WEEKLY;BYDAY=${byDay.join(',')}` : 'RRULE:FREQ=WEEKLY';
  return `RRULE:FREQ=MONTHLY;BYMONTHDAY=${day}`;
}

function fmtMoney(n) {
  return `$ ${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const EMPTY_DRAFT = {
  id: null, type: 'simple', title: '', freq: 'none', byDay: [], day: 1,
  dateOnce: '', time: '09:00', goal: 0, collected: 0, dueDate: '', link: '', text: '',
};

export default function Announcements() {
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  function load() {
    setLoading(true);
    api.getAnnouncements()
      .then(setAnnouncements)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  function openCreate() {
    setDraft(EMPTY_DRAFT);
    setModalOpen(true);
  }

  function openEdit(a) {
    setDraft({
      id: a.id, type: a.type, title: a.title, freq: a.freq, byDay: [...a.byDay],
      day: a.day || 1, dateOnce: a.dateOnce || '', time: a.time, goal: a.goal,
      collected: a.collected, dueDate: a.dueDate, link: a.link, text: a.text,
    });
    setModalOpen(true);
  }

  function toggleDraftDay(code) {
    setDraft((d) => ({
      ...d,
      byDay: d.byDay.includes(code) ? d.byDay.filter((c) => c !== code) : [...d.byDay, code],
    }));
  }

  async function saveDraft() {
    try {
      if (draft.id != null) {
        const existing = announcements.find((a) => a.id === draft.id);
        const updated = await api.updateAnnouncement(draft.id, { ...draft, active: existing?.active ?? true });
        setAnnouncements((rows) => rows.map((r) => (r.id === draft.id ? { ...r, ...updated, byDay: updated.byDay ?? draft.byDay } : r)));
      } else {
        await api.createAnnouncement(draft);
        load();
      }
      setModalOpen(false);
    } catch (err) {
      setError(err.message);
    }
  }

  async function toggleActive(a) {
    try {
      await api.updateAnnouncement(a.id, { ...a, active: !a.active });
      setAnnouncements((rows) => rows.map((r) => (r.id === a.id ? { ...r, active: !a.active } : r)));
    } catch (err) {
      setError(err.message);
    }
  }

  async function confirmDelete(id) {
    try {
      await api.deleteAnnouncement(id);
      setAnnouncements((rows) => rows.filter((r) => r.id !== id));
      setConfirmDeleteId(null);
    } catch (err) {
      setError(err.message);
    }
  }

  const showMoneyFields = MONEY_TYPES.includes(draft.type);

  if (loading) return <div className="content">Carregando...</div>;

  return (
    <div className="content">
      <div className="page-head">
        <div>
          <h1>Anúncios</h1>
          <p className="subtitle">Mensagens que o bot envia automaticamente pro grupo do WhatsApp.</p>
        </div>
        <button className="btn-primary" onClick={openCreate}>
          <PlusIcon /> Novo anúncio
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="card card-flush">
        <table>
          <thead>
            <tr>
              <th>Título</th>
              <th>Tipo</th>
              <th>Recorrência</th>
              <th>Detalhe</th>
              <th>Ativo</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {announcements.map((a) => {
              const typeDef = TYPE_DEFS.find((t) => t.key === a.type) || TYPE_DEFS[0];
              const isMoney = MONEY_TYPES.includes(a.type);
              const pct = a.goal > 0 ? Math.min(Math.round((a.collected / a.goal) * 100), 100) : 0;
              return (
                <tr key={a.id}>
                  <td>{a.title}</td>
                  <td>
                    <span className="type-badge">
                      <span className="type-dot" style={{ background: DOT_COLORS[a.type] }} />
                      {typeDef.label}
                    </span>
                  </td>
                  <td>
                    <div>{humanizeRecurrence(a.freq, a.byDay, a.day, a.dateOnce)} · {a.time}</div>
                    <div className="rrule-cell">{buildRRule(a.freq, a.byDay, a.day, a.dateOnce)}</div>
                  </td>
                  <td>
                    {isMoney ? (
                      <div className="progress-mini">
                        <div className="progress-track"><div className="progress-fill" style={{ width: `${pct}%` }} /></div>
                        <div className="progress-label">{fmtMoney(a.collected)} de {fmtMoney(a.goal)}</div>
                      </div>
                    ) : (
                      <div className="detail-cell">{a.text}</div>
                    )}
                  </td>
                  <td>
                    <button className={`status-pill ${a.active ? 'active' : 'paused'}`} onClick={() => toggleActive(a)}>
                      {a.active ? 'Ativo' : 'Inativo'}
                    </button>
                  </td>
                  <td>
                    {confirmDeleteId === a.id ? (
                      <div className="confirm-row">
                        Remover?
                        <button className="btn-ghost" onClick={() => setConfirmDeleteId(null)}>Cancelar</button>
                        <button className="btn-danger" onClick={() => confirmDelete(a.id)}>Remover</button>
                      </div>
                    ) : (
                      <div className="row-actions">
                        <button className="icon-btn" onClick={() => openEdit(a)} title="Editar"><PencilIcon /></button>
                        <button className="icon-btn" onClick={() => setConfirmDeleteId(a.id)} title="Remover"><TrashIcon /></button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {announcements.length === 0 && <div className="empty-state">Nenhum anúncio cadastrado.</div>}
      </div>

      {modalOpen && (
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>{draft.id != null ? 'Editar anúncio' : 'Novo anúncio'}</h3>
              <button className="icon-btn" onClick={() => setModalOpen(false)}><CloseIcon /></button>
            </div>

            <div className="modal-grid">
              <div className="modal-form-col">
                <div className="field">
                  <label>Tipo</label>
                  <div className="type-row">
                    {TYPE_DEFS.map(({ key, label, Icon }) => (
                      <button
                        key={key}
                        className={`type-chip ${draft.type === key ? 'active' : ''}`}
                        onClick={() => setDraft((d) => ({ ...d, type: key }))}
                      >
                        <Icon /> {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="field">
                  <label>Título</label>
                  <input type="text" value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} />
                </div>

                <div className="field">
                  <label>Repetição</label>
                  <div className="freq-row">
                    {[['none', 'Não repete'], ['daily', 'Diariamente'], ['weekly', 'Semanalmente'], ['monthly', 'Mensalmente']].map(([key, label]) => (
                      <button
                        key={key}
                        className={`freq-chip ${draft.freq === key ? 'active' : ''}`}
                        onClick={() => setDraft((d) => ({ ...d, freq: key }))}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {draft.freq === 'weekly' && (
                  <div className="field">
                    <label>Dias da semana</label>
                    <div className="day-row">
                      {DAY_DEFS.map((d) => (
                        <button
                          key={d.code}
                          className={`day-chip ${draft.byDay.includes(d.code) ? 'active' : ''}`}
                          onClick={() => toggleDraftDay(d.code)}
                        >
                          {d.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {draft.freq === 'monthly' && (
                  <div className="field">
                    <label>Dia do mês</label>
                    <input
                      type="number" min="1" max="31" value={draft.day}
                      onChange={(e) => setDraft((d) => ({ ...d, day: parseInt(e.target.value, 10) || 1 }))}
                    />
                  </div>
                )}

                {draft.freq === 'none' && (
                  <div className="field">
                    <label>Data</label>
                    <input
                      type="date" value={draft.dateOnce}
                      onChange={(e) => setDraft((d) => ({ ...d, dateOnce: e.target.value }))}
                    />
                  </div>
                )}

                <div className="field">
                  <label>Hora</label>
                  <input type="time" value={draft.time} onChange={(e) => setDraft((d) => ({ ...d, time: e.target.value }))} />
                </div>

                <div>
                  <div className="rrule-preview-label">Regra técnica (RRULE)</div>
                  <div className="rrule-preview">{buildRRule(draft.freq, draft.byDay, draft.day, draft.dateOnce)}</div>
                </div>

                {showMoneyFields ? (
                  <>
                    <div className="field-row">
                      <div className="field">
                        <label>Meta ($)</label>
                        <input type="number" min="0" value={draft.goal} onChange={(e) => setDraft((d) => ({ ...d, goal: parseFloat(e.target.value) || 0 }))} />
                      </div>
                      <div className="field">
                        <label>Arrecadado ($)</label>
                        <input type="number" min="0" value={draft.collected} onChange={(e) => setDraft((d) => ({ ...d, collected: parseFloat(e.target.value) || 0 }))} />
                      </div>
                    </div>
                    <div className="field-row">
                      <div className="field">
                        <label>Vencimento (MM/DD)</label>
                        <input type="text" placeholder="07/31" value={draft.dueDate} onChange={(e) => setDraft((d) => ({ ...d, dueDate: e.target.value }))} />
                      </div>
                      <div className="field">
                        <label>Link de contribuição</label>
                        <input type="text" placeholder="https://..." value={draft.link} onChange={(e) => setDraft((d) => ({ ...d, link: e.target.value }))} />
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="field">
                    <label>Mensagem</label>
                    <textarea value={draft.text} onChange={(e) => setDraft((d) => ({ ...d, text: e.target.value }))} />
                  </div>
                )}
              </div>

              <div className="preview-panel">
                <div className="preview-panel-label">Pré-visualização da mensagem</div>
                <div className="preview-panel-sub">Como o bot vai enviar pro grupo do WhatsApp</div>
                <div className="bubble">
                  <div className="bubble-text">{formatMessage(draft)}</div>
                </div>
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn-ghost" onClick={() => setModalOpen(false)}>Cancelar</button>
              <button className="btn-primary" onClick={saveDraft}>Salvar anúncio</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
