import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { ClockIcon, SearchIcon, CheckIcon, PlusIcon, PencilIcon, TrashIcon, CloseIcon } from '../icons';

const TZ_LABELS = {
  'America/Los_Angeles': 'Los Angeles (PT)',
  'America/Chicago': 'Chicago (CT)',
  'America/New_York': 'Nova York (ET)',
  'America/Sao_Paulo': 'São Paulo (BRT)',
};

const MONTH_NAMES = [
  'jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez',
];
const MONTH_FULL_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

function fmtTime(hour, minute) {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

const EMPTY_DRAFT = { rowNumber: null, name: '', day: 1, month: 1 };

export default function Birthdays() {
  const [birthdays, setBirthdays] = useState([]);
  const [schedule, setSchedule] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [editingSchedule, setEditingSchedule] = useState(false);
  const [draftTime, setDraftTime] = useState('07:00');
  const [draftTz, setDraftTz] = useState('America/Los_Angeles');
  const [savedFlash, setSavedFlash] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [confirmDeleteRow, setConfirmDeleteRow] = useState(null);

  function load() {
    setLoading(true);
    Promise.all([api.getBirthdays(), api.getBirthdaySchedule()])
      .then(([b, s]) => {
        setBirthdays(b);
        setSchedule(s);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  function startEdit() {
    setDraftTime(fmtTime(schedule.hour, schedule.minute));
    setDraftTz(schedule.tz);
    setEditingSchedule(true);
  }

  async function saveSchedule() {
    const [hour, minute] = draftTime.split(':').map((n) => parseInt(n, 10));
    try {
      const updated = await api.updateBirthdaySchedule({ hour, minute, tz: draftTz });
      setSchedule(updated);
      setEditingSchedule(false);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2200);
    } catch (err) {
      setError(err.message);
    }
  }

  function openCreate() {
    setDraft(EMPTY_DRAFT);
    setModalOpen(true);
  }

  function openEdit(b) {
    setDraft({ rowNumber: b.rowNumber, name: b.name, day: b.day, month: b.month });
    setModalOpen(true);
  }

  async function saveDraft() {
    try {
      if (draft.rowNumber != null) {
        await api.updateBirthday(draft.rowNumber, { name: draft.name, day: draft.day, month: draft.month });
      } else {
        await api.createBirthday({ name: draft.name, day: draft.day, month: draft.month });
      }
      setModalOpen(false);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function confirmDelete(rowNumber) {
    try {
      await api.deleteBirthday(rowNumber);
      setBirthdays((rows) => rows.filter((r) => r.rowNumber !== rowNumber));
      setConfirmDeleteRow(null);
    } catch (err) {
      setError(err.message);
    }
  }

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return birthdays.filter((b) => !q || b.name.toLowerCase().includes(q));
  }, [birthdays, searchQuery]);

  if (loading) return <div className="content">Carregando...</div>;

  return (
    <div className="content">
      <div className="page-head">
        <div>
          <h1>Aniversariantes</h1>
          <p className="subtitle">Quem vai ser comunicado no grupo do WhatsApp, e quando.</p>
        </div>
        <button className="btn-primary" onClick={openCreate}>
          <PlusIcon /> Adicionar aniversariante
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="card">
        {!editingSchedule && schedule && (
          <div className="schedule-row">
            <div className="schedule-icon">
              <ClockIcon />
            </div>
            <div className="schedule-info">
              <div className="schedule-label">Horário de execução diário</div>
              <div className="schedule-value">
                {fmtTime(schedule.hour, schedule.minute)} · {TZ_LABELS[schedule.tz] || schedule.tz}
              </div>
            </div>
            <button className="btn-ghost" onClick={startEdit}>Editar horário</button>
          </div>
        )}

        {editingSchedule && (
          <div className="schedule-edit">
            <div className="field">
              <label>Horário</label>
              <input type="time" value={draftTime} onChange={(e) => setDraftTime(e.target.value)} />
            </div>
            <div className="field">
              <label>Fuso horário</label>
              <select value={draftTz} onChange={(e) => setDraftTz(e.target.value)}>
                {Object.entries(TZ_LABELS).map(([tz, label]) => (
                  <option key={tz} value={tz}>{label}</option>
                ))}
              </select>
            </div>
            <div className="edit-actions">
              <button className="btn-ghost" onClick={() => setEditingSchedule(false)}>Cancelar</button>
              <button className="btn-primary" onClick={saveSchedule}>Salvar</button>
            </div>
          </div>
        )}

        {savedFlash && (
          <div className="save-flash">
            <CheckIcon /> Horário atualizado
          </div>
        )}
      </div>

      <div className="card card-flush">
        <div className="card-head" style={{ padding: '14px 0 0' }}>
          <h2>Próximos aniversários</h2>
          <div className="search-box">
            <SearchIcon />
            <input
              type="text"
              placeholder="Buscar por nome..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>Data</th>
              <th>Faltam</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((b) => (
              <tr key={b.rowNumber}>
                <td>{b.name}</td>
                <td>{b.day} {MONTH_NAMES[b.month - 1]}</td>
                <td>
                  <span className={`pill ${b.daysUntil <= 7 ? 'pill-urgent' : 'pill-default'}`}>
                    {b.daysUntil === 0 ? 'Hoje' : b.daysUntil === 1 ? 'Amanhã' : `Em ${b.daysUntil} dias`}
                  </span>
                </td>
                <td>
                  {confirmDeleteRow === b.rowNumber ? (
                    <div className="confirm-row">
                      Remover?
                      <button className="btn-ghost" onClick={() => setConfirmDeleteRow(null)}>Cancelar</button>
                      <button className="btn-danger" onClick={() => confirmDelete(b.rowNumber)}>Remover</button>
                    </div>
                  ) : (
                    <div className="row-actions">
                      <button className="icon-btn" onClick={() => openEdit(b)} title="Editar"><PencilIcon /></button>
                      <button className="icon-btn" onClick={() => setConfirmDeleteRow(b.rowNumber)} title="Remover"><TrashIcon /></button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filtered.length === 0 && <div className="empty-state">Nenhum aniversariante encontrado.</div>}
      </div>

      {modalOpen && (
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>{draft.rowNumber != null ? 'Editar aniversariante' : 'Adicionar aniversariante'}</h3>
              <button className="icon-btn" onClick={() => setModalOpen(false)}><CloseIcon /></button>
            </div>

            <div className="field">
              <label>Nome</label>
              <input type="text" value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
            </div>

            <div className="field-row">
              <div className="field">
                <label>Dia</label>
                <input
                  type="number" min="1" max="31" value={draft.day}
                  onChange={(e) => setDraft((d) => ({ ...d, day: parseInt(e.target.value, 10) || 1 }))}
                />
              </div>
              <div className="field">
                <label>Mês</label>
                <select value={draft.month} onChange={(e) => setDraft((d) => ({ ...d, month: parseInt(e.target.value, 10) }))}>
                  {MONTH_FULL_NAMES.map((name, i) => (
                    <option key={name} value={i + 1}>{name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn-ghost" onClick={() => setModalOpen(false)}>Cancelar</button>
              <button className="btn-primary" onClick={saveDraft} disabled={!draft.name.trim()}>Salvar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
