import { useEffect, useState } from 'react';
import { RRule } from 'rrule';
import { CloseIcon } from './icons';

const WEEKDAY_DEFS = [
  { code: 'SU', label: 'Dom' }, { code: 'MO', label: 'Seg' }, { code: 'TU', label: 'Ter' },
  { code: 'WE', label: 'Qua' }, { code: 'TH', label: 'Qui' }, { code: 'FR', label: 'Sex' },
  { code: 'SA', label: 'Sáb' },
];
const MONTH_DEFS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];
const SETPOS_DEFS = [
  { value: 1, label: '1º' }, { value: 2, label: '2º' }, { value: 3, label: '3º' },
  { value: 4, label: '4º' }, { value: -1, label: 'último' },
];
const FREQ_MAP = { [RRule.DAILY]: 'DAILY', [RRule.WEEKLY]: 'WEEKLY', [RRule.MONTHLY]: 'MONTHLY' };
const WEEKDAY_BY_INDEX = { 0: 'MO', 1: 'TU', 2: 'WE', 3: 'TH', 4: 'FR', 5: 'SA', 6: 'SU' };
const ALLOWED_OPTION_KEYS = new Set(['freq', 'interval', 'until', 'count', 'byweekday', 'bymonthday', 'bysetpos', 'bymonth']);

const EMPTY = {
  freq: 'none', interval: 1, byweekday: [],
  monthlyMode: 'day', bymonthday: 1, bysetpos: 1, byweekdaySingle: 'SA',
  restrictMonth: false, bymonth: 1,
  end: 'never', until: '', count: 1,
  exdates: [], advanced: false, advancedText: '',
};

// EXDATE values in this sheet aren't consistently formatted - some carry a
// trailing "Z" (UTC), most don't (naive local time matching the event's own
// start time). Preserve whichever form each exception already had rather
// than guessing/normalizing, so re-saving an untouched exception round-trips
// byte-for-byte.
function compactToDatetimeLocal(raw) {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/.exec(raw.trim());
  if (!m) return null;
  return { value: `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}`, hadZ: !!m[7] };
}

function datetimeLocalToCompact({ value, hadZ }) {
  const [datePart, timePart] = (value || '').split('T');
  if (!datePart || !timePart) return '';
  const [y, mo, da] = datePart.split('-');
  const [h, mi] = timePart.split(':');
  return `${y}${mo}${da}T${h}${mi}00${hadZ ? 'Z' : ''}`;
}

// The sheet stores RRULE and EXDATE as separate lines in the same cell,
// standard iCalendar VEVENT style (not comma/space-joined) - e.g.
// "RRULE:FREQ=WEEKLY;BYDAY=SA;UNTIL=...\nEXDATE:20260606T190000,...".
export function parseCell(cell) {
  const trimmed = (cell || '').trim();
  if (!trimmed) return { ...EMPTY };

  const lines = trimmed.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const rrulePart = lines[0] || '';
  const exdateLine = lines.slice(1).find((l) => l.toUpperCase().startsWith('EXDATE:'));
  const exdatePart = exdateLine ? exdateLine.slice('EXDATE:'.length) : '';
  const exdates = exdatePart
    ? exdatePart.split(',').map(compactToDatetimeLocal).filter(Boolean)
    : [];

  const fallback = { ...EMPTY, exdates, advanced: true, advancedText: trimmed };

  let rule;
  try {
    rule = RRule.fromString(rrulePart);
  } catch {
    return fallback;
  }

  const o = rule.origOptions;
  const freq = FREQ_MAP[o.freq];
  if (!freq) return fallback;

  const extraKeys = Object.keys(o).filter((k) => !ALLOWED_OPTION_KEYS.has(k));
  if (extraKeys.length > 0) return fallback;

  const byweekdayArr = o.byweekday ? (Array.isArray(o.byweekday) ? o.byweekday : [o.byweekday]) : [];
  if (byweekdayArr.some((w) => w && w.n !== undefined)) return fallback;
  const dayCodes = byweekdayArr.map((w) => WEEKDAY_BY_INDEX[w.weekday]);

  const bysetposArr = o.bysetpos !== undefined ? (Array.isArray(o.bysetpos) ? o.bysetpos : [o.bysetpos]) : [];
  if (bysetposArr.length > 1) return fallback;

  const bymonthdayArr = o.bymonthday !== undefined ? (Array.isArray(o.bymonthday) ? o.bymonthday : [o.bymonthday]) : [];

  const bymonthArr = o.bymonth !== undefined ? (Array.isArray(o.bymonth) ? o.bymonth : [o.bymonth]) : [];
  if (bymonthArr.length > 1) return fallback;

  let monthlyMode = 'day';
  let bymonthday = 1;
  let bysetpos = 1;
  let byweekdaySingle = 'SA';

  if (freq === 'MONTHLY') {
    const isLastDayIdiom = bymonthdayArr.length === 4
      && [28, 29, 30, 31].every((day) => bymonthdayArr.includes(day))
      && bysetposArr[0] === -1 && dayCodes.length === 0;

    if (isLastDayIdiom) {
      monthlyMode = 'lastDayOfMonth';
    } else if (bysetposArr.length === 1 && dayCodes.length === 1 && bymonthdayArr.length === 0) {
      monthlyMode = 'weekday';
      bysetpos = bysetposArr[0];
      byweekdaySingle = dayCodes[0];
    } else if (bymonthdayArr.length === 1 && dayCodes.length === 0 && bysetposArr.length === 0) {
      monthlyMode = 'day';
      bymonthday = bymonthdayArr[0];
    } else {
      return fallback;
    }
  } else if (freq === 'WEEKLY') {
    if (bymonthdayArr.length > 0 || bysetposArr.length > 0) return fallback;
  } else if (freq === 'DAILY') {
    if (bymonthdayArr.length > 0 || bysetposArr.length > 0 || dayCodes.length > 0) return fallback;
  }

  let end = 'never';
  let until = '';
  let count = 1;
  if (o.until) {
    end = 'until';
    until = o.until.toISOString().slice(0, 10);
  } else if (o.count) {
    end = 'count';
    count = o.count;
  }

  return {
    freq, interval: o.interval || 1,
    byweekday: freq === 'WEEKLY' ? dayCodes : [],
    monthlyMode, bymonthday, bysetpos, byweekdaySingle,
    restrictMonth: bymonthArr.length === 1, bymonth: bymonthArr[0] || 1,
    end, until, count,
    exdates, advanced: false, advancedText: trimmed,
  };
}

export function generateCell(d) {
  if (d.advanced) return d.advancedText.trim();
  if (d.freq === 'none') return '';

  const options = { freq: RRule[d.freq] };
  if (d.interval && d.interval > 1) options.interval = d.interval;

  if (d.freq === 'WEEKLY' && d.byweekday.length > 0) {
    options.byweekday = d.byweekday.map((code) => RRule[code]);
  }
  if (d.freq === 'MONTHLY') {
    if (d.monthlyMode === 'day') {
      options.bymonthday = [d.bymonthday];
    } else if (d.monthlyMode === 'weekday') {
      options.byweekday = [RRule[d.byweekdaySingle]];
      options.bysetpos = [d.bysetpos];
    } else if (d.monthlyMode === 'lastDayOfMonth') {
      options.bymonthday = [28, 29, 30, 31];
      options.bysetpos = [-1];
    }
  }
  if (d.restrictMonth) options.bymonth = [d.bymonth];

  if (d.end === 'until' && d.until) {
    const [y, m, day] = d.until.split('-').map(Number);
    options.until = new Date(Date.UTC(y, m - 1, day, 23, 59, 59));
  } else if (d.end === 'count' && d.count) {
    options.count = d.count;
  }

  let str = new RRule(options).toString();

  const validExdates = d.exdates.filter((e) => e && e.value);
  if (validExdates.length > 0) {
    str += `\nEXDATE:${validExdates.map(datetimeLocalToCompact).join(',')}`;
  }
  return str;
}

export function RecurrenceBuilder({ value, onChange }) {
  const [d, setD] = useState(() => parseCell(value));

  useEffect(() => {
    onChange(generateCell(d));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d]);

  function set(key, val) {
    setD((prev) => ({ ...prev, [key]: val }));
  }

  function toggleWeekday(code) {
    setD((prev) => ({
      ...prev,
      byweekday: prev.byweekday.includes(code) ? prev.byweekday.filter((c) => c !== code) : [...prev.byweekday, code],
    }));
  }

  function addExdate() {
    setD((prev) => ({ ...prev, exdates: [...prev.exdates, { value: '', hadZ: false }] }));
  }

  function updateExdate(i, val) {
    setD((prev) => ({ ...prev, exdates: prev.exdates.map((e, idx) => (idx === i ? { ...e, value: val } : e)) }));
  }

  function removeExdate(i) {
    setD((prev) => ({ ...prev, exdates: prev.exdates.filter((_, idx) => idx !== i) }));
  }

  if (d.advanced) {
    return (
      <div className="field">
        <label>Recorrência (modo avançado)</label>
        <textarea value={d.advancedText} onChange={(e) => set('advancedText', e.target.value)} />
        <div className="field-hint">
          Esse padrão é complexo demais para o construtor visual - editando como texto (RRULE) cru.
        </div>
        <button type="button" className="btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setD(parseCell(d.advancedText))}>
          Tentar construtor visual
        </button>
      </div>
    );
  }

  return (
    <div className="field" style={{ gap: 12 }}>
      <label>Recorrência</label>
      <div className="freq-row">
        {[['none', 'Não repete'], ['DAILY', 'Diariamente'], ['WEEKLY', 'Semanalmente'], ['MONTHLY', 'Mensalmente']].map(([key, label]) => (
          <button key={key} type="button" className={`freq-chip ${d.freq === key ? 'active' : ''}`} onClick={() => set('freq', key)}>
            {label}
          </button>
        ))}
      </div>

      {d.freq !== 'none' && (
        <div className="field-row">
          <div className="field">
            <label>A cada</label>
            <input type="number" min="1" value={d.interval} onChange={(e) => set('interval', parseInt(e.target.value, 10) || 1)} />
          </div>
          <div className="field">
            <label>&nbsp;</label>
            <div style={{ padding: '9px 0', fontSize: 13, color: 'var(--ink-500)' }}>
              {d.freq === 'DAILY' ? 'dia(s)' : d.freq === 'WEEKLY' ? 'semana(s)' : 'mês(es)'}
            </div>
          </div>
        </div>
      )}

      {d.freq === 'WEEKLY' && (
        <div className="day-row">
          {WEEKDAY_DEFS.map((w) => (
            <button key={w.code} type="button" className={`day-chip ${d.byweekday.includes(w.code) ? 'active' : ''}`} onClick={() => toggleWeekday(w.code)}>
              {w.label}
            </button>
          ))}
        </div>
      )}

      {d.freq === 'MONTHLY' && (
        <div className="field">
          <div className="freq-row">
            <button type="button" className={`freq-chip ${d.monthlyMode === 'day' ? 'active' : ''}`} onClick={() => set('monthlyMode', 'day')}>
              No dia do mês
            </button>
            <button type="button" className={`freq-chip ${d.monthlyMode === 'weekday' ? 'active' : ''}`} onClick={() => set('monthlyMode', 'weekday')}>
              No dia da semana
            </button>
            <button type="button" className={`freq-chip ${d.monthlyMode === 'lastDayOfMonth' ? 'active' : ''}`} onClick={() => set('monthlyMode', 'lastDayOfMonth')}>
              Último dia do mês
            </button>
          </div>

          {d.monthlyMode === 'day' && (
            <input
              type="number" min="1" max="31" value={d.bymonthday} style={{ marginTop: 8, maxWidth: 100 }}
              onChange={(e) => set('bymonthday', parseInt(e.target.value, 10) || 1)}
            />
          )}

          {d.monthlyMode === 'weekday' && (
            <div className="field-row" style={{ marginTop: 8 }}>
              <select value={d.bysetpos} onChange={(e) => set('bysetpos', parseInt(e.target.value, 10))}>
                {SETPOS_DEFS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
              <select value={d.byweekdaySingle} onChange={(e) => set('byweekdaySingle', e.target.value)}>
                {WEEKDAY_DEFS.map((w) => <option key={w.code} value={w.code}>{w.label}</option>)}
              </select>
            </div>
          )}
        </div>
      )}

      {d.freq !== 'none' && (
        <div className="field">
          <button
            type="button" className={`freq-chip ${d.restrictMonth ? 'active' : ''}`} style={{ alignSelf: 'flex-start' }}
            onClick={() => set('restrictMonth', !d.restrictMonth)}
          >
            Restringir a um mês do ano
          </button>
          {d.restrictMonth && (
            <select value={d.bymonth} onChange={(e) => set('bymonth', parseInt(e.target.value, 10))} style={{ marginTop: 8, maxWidth: 180 }}>
              {MONTH_DEFS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
          )}
        </div>
      )}

      {d.freq !== 'none' && (
        <div className="field">
          <label>Término</label>
          <div className="freq-row">
            {[['never', 'Nunca'], ['until', 'Em data'], ['count', 'Depois de N vezes']].map(([key, label]) => (
              <button key={key} type="button" className={`freq-chip ${d.end === key ? 'active' : ''}`} onClick={() => set('end', key)}>
                {label}
              </button>
            ))}
          </div>
          {d.end === 'until' && (
            <input type="date" value={d.until} onChange={(e) => set('until', e.target.value)} style={{ marginTop: 8 }} />
          )}
          {d.end === 'count' && (
            <input type="number" min="1" value={d.count} style={{ marginTop: 8, maxWidth: 100 }} onChange={(e) => set('count', parseInt(e.target.value, 10) || 1)} />
          )}
        </div>
      )}

      {d.freq !== 'none' && (
        <div className="field">
          <label>Exceções (datas puladas)</label>
          {d.exdates.map((ex, i) => (
            <div key={i} className="field-row" style={{ marginBottom: 6, alignItems: 'center' }}>
              <input type="datetime-local" value={ex.value} onChange={(e) => updateExdate(i, e.target.value)} />
              <button type="button" className="icon-btn" onClick={() => removeExdate(i)} title="Remover"><CloseIcon /></button>
            </div>
          ))}
          <button type="button" className="btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={addExdate}>
            + Adicionar exceção
          </button>
        </div>
      )}

      <div className="field-hint">
        RRULE gerado: <span className="rrule-cell">{generateCell(d) || '(nenhuma recorrência)'}</span>
      </div>

      <button type="button" className="btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={() => set('advanced', true)}>
        Editar como texto (avançado)
      </button>
    </div>
  );
}
