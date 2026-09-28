import { useMemo } from 'react';

export type CalendarioItemKind = 'evento' | 'compromisso';

export type CalendarioItem = {
  id: string;
  kind: CalendarioItemKind;
  nome: string;
  data: string;
  hora?: string | null;
  local?: string | null;
  descricao?: string | null;
  tipo?: string | null;
  createdBy?: string | null;
  createdByNome?: string | null;
  /** Payload original para edição */
  raw?: unknown;
};

type Props = {
  items: CalendarioItem[];
  viewMonth: Date;
  onViewMonthChange: (d: Date) => void;
  onDayClick: (isoDate: string) => void;
  onItemClick: (item: CalendarioItem) => void;
};

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MAX_CHIPS = 3;

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addMonths(d: Date, delta: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + delta, 1);
}

function monthLabel(d: Date): string {
  const raw = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

type DayCell = {
  date: Date;
  iso: string;
  inMonth: boolean;
  isToday: boolean;
};

function buildMonthGrid(viewMonth: Date): DayCell[] {
  const first = startOfMonth(viewMonth);
  const startOffset = first.getDay();
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - startOffset);

  const todayIso = toIsoDate(new Date());
  const cells: DayCell[] = [];
  for (let i = 0; i < 42; i += 1) {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + i);
    const iso = toIsoDate(date);
    cells.push({
      date,
      iso,
      inMonth: date.getMonth() === viewMonth.getMonth(),
      isToday: iso === todayIso,
    });
  }
  return cells;
}

export function EventosCalendar({ items, viewMonth, onViewMonthChange, onDayClick, onItemClick }: Props) {
  const byDate = useMemo(() => {
    const map = new Map<string, CalendarioItem[]>();
    for (const ev of items) {
      if (!ev?.data) continue;
      const key = String(ev.data).slice(0, 10);
      const list = map.get(key) ?? [];
      list.push(ev);
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => String(a.hora ?? '').localeCompare(String(b.hora ?? '')));
    }
    return map;
  }, [items]);

  const cells = useMemo(() => buildMonthGrid(viewMonth), [viewMonth]);

  return (
    <div className="dash-cal" data-tour="eventos-calendario">
      <div className="dash-cal__toolbar">
        <div className="dash-cal__nav">
          <button
            type="button"
            className="dash-cal__nav-btn"
            aria-label="Mês anterior"
            onClick={() => onViewMonthChange(addMonths(viewMonth, -1))}
          >
            ‹
          </button>
          <h2 className="dash-cal__title">{monthLabel(viewMonth)}</h2>
          <button
            type="button"
            className="dash-cal__nav-btn"
            aria-label="Próximo mês"
            onClick={() => onViewMonthChange(addMonths(viewMonth, 1))}
          >
            ›
          </button>
        </div>
        <button type="button" className="dash-cal__today" onClick={() => onViewMonthChange(startOfMonth(new Date()))}>
          Hoje
        </button>
      </div>

      <div className="dash-cal__weekdays" aria-hidden="true">
        {WEEKDAYS.map((d) => (
          <div key={d} className="dash-cal__weekday">
            {d}
          </div>
        ))}
      </div>

      <div className="dash-cal__grid" role="grid" aria-label={`Calendário de ${monthLabel(viewMonth)}`}>
        {cells.map((cell) => {
          const dayEvents = byDate.get(cell.iso) ?? [];
          const visible = dayEvents.slice(0, MAX_CHIPS);
          const extra = dayEvents.length - visible.length;

          return (
            <div
              key={cell.iso}
              role="gridcell"
              className={[
                'dash-cal__day',
                cell.inMonth ? '' : 'is-outside',
                cell.isToday ? 'is-today' : '',
                dayEvents.length ? 'has-events' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <button
                type="button"
                className="dash-cal__day-hit"
                onClick={() => onDayClick(cell.iso)}
                aria-label={`${cell.date.toLocaleDateString('pt-BR')}${
                  dayEvents.length ? `, ${dayEvents.length} item(ns)` : ''
                }. Clique para adicionar.`}
              >
                <span className="dash-cal__day-num">{cell.date.getDate()}</span>
              </button>
              <div className="dash-cal__chips">
                {visible.map((ev) => (
                  <button
                    key={`${ev.kind}-${ev.id}`}
                    type="button"
                    className={`dash-cal__chip dash-cal__chip--${ev.kind}`}
                    title={
                      ev.kind === 'compromisso' && ev.createdByNome
                        ? `${ev.nome} · ${ev.createdByNome}`
                        : ev.nome
                    }
                    onClick={() => onItemClick(ev)}
                  >
                    <span className="dash-cal__chip-kind">{ev.kind === 'evento' ? 'E' : 'C'}</span>
                    {ev.hora ? `${String(ev.hora).slice(0, 5)} ` : ''}
                    {ev.nome}
                    {ev.kind === 'compromisso' && ev.createdByNome ? (
                      <span className="dash-cal__chip-author"> · {ev.createdByNome}</span>
                    ) : null}
                  </button>
                ))}
                {extra > 0 && (
                  <button type="button" className="dash-cal__more" onClick={() => onDayClick(cell.iso)}>
                    +{extra}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** @deprecated Alias para compatibilidade — use CalendarioItem */
export type EventoCalendario = CalendarioItem;
