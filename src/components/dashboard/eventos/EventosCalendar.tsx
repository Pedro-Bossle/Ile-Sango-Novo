import { useMemo, type ReactNode } from 'react';
import { estiloBarraCategoria, normalizeHex } from '../../../services/agendaCategorias';

export type CalendarioItemKind = 'evento' | 'compromisso';

export type CalendarioSpan = 'single' | 'start' | 'mid' | 'end';

export type CalendarioItem = {
  id: string;
  kind: CalendarioItemKind;
  nome: string;
  /** Dia de início (YYYY-MM-DD) */
  data: string;
  /** Dia de fim (YYYY-MM-DD); se diferente de data, a tag cobre o intervalo */
  dataFim?: string | null;
  hora?: string | null;
  local?: string | null;
  descricao?: string | null;
  tipo?: string | null;
  /** Cor da barra (hex), quando categoria configurada */
  cor?: string | null;
  createdBy?: string | null;
  createdByNome?: string | null;
  /** Segmento visual quando cobre vários dias */
  span?: CalendarioSpan;
  /** Payload original para edição */
  raw?: unknown;
};

type Props = {
  items: CalendarioItem[];
  viewMonth: Date;
  onViewMonthChange: (d: Date) => void;
  onDayClick: (isoDate: string) => void;
  onItemClick: (item: CalendarioItem) => void;
  /** Conteúdo à direita do botão Hoje (ex.: Cópia rápida). */
  toolbarExtra?: ReactNode;
};

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MAX_CHIPS = 3;

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseIsoDateLocal(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1);
}

/** Dias inclusivos entre duas datas ISO (YYYY-MM-DD). */
function eachDayInclusive(fromIso: string, toIso: string): string[] {
  const start = parseIsoDateLocal(fromIso);
  const end = parseIsoDateLocal(toIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [fromIso.slice(0, 10)];
  if (end.getTime() < start.getTime()) return [fromIso.slice(0, 10)];
  const out: string[] = [];
  const cur = new Date(start);
  while (cur.getTime() <= end.getTime()) {
    out.push(toIsoDate(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

function spanForIndex(index: number, total: number): CalendarioSpan {
  if (total <= 1) return 'single';
  if (index === 0) return 'start';
  if (index === total - 1) return 'end';
  return 'mid';
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

export function EventosCalendar({
  items,
  viewMonth,
  onViewMonthChange,
  onDayClick,
  onItemClick,
  toolbarExtra,
}: Props) {
  const byDate = useMemo(() => {
    const map = new Map<string, CalendarioItem[]>();
    for (const ev of items) {
      if (!ev?.data) continue;
      const start = String(ev.data).slice(0, 10);
      const endRaw = String(ev.dataFim ?? '').slice(0, 10);
      // Só estende se houver fim em dia civil posterior ao início.
      const multi = Boolean(endRaw && endRaw > start && ev.kind === 'compromisso');
      const days = multi ? eachDayInclusive(start, endRaw) : [start];
      days.forEach((day, idx) => {
        const list = map.get(day) ?? [];
        list.push({
          ...ev,
          data: day,
          span: spanForIndex(idx, days.length),
        });
        map.set(day, list);
      });
    }
    for (const list of map.values()) {
      // Multi-dia primeiro (mesma “faixa”), depois por hora.
      list.sort((a, b) => {
        const aMulti = a.span && a.span !== 'single' ? 0 : 1;
        const bMulti = b.span && b.span !== 'single' ? 0 : 1;
        if (aMulti !== bMulti) return aMulti - bMulti;
        return String(a.hora ?? '').localeCompare(String(b.hora ?? ''));
      });
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
        <div className="dash-cal__toolbar-end">
          <button type="button" className="dash-cal__today" onClick={() => onViewMonthChange(startOfMonth(new Date()))}>
            Hoje
          </button>
          {toolbarExtra}
        </div>
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
              tabIndex={0}
              className={[
                'dash-cal__day',
                cell.inMonth ? '' : 'is-outside',
                cell.isToday ? 'is-today' : '',
                dayEvents.length ? 'has-events' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => onDayClick(cell.iso)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onDayClick(cell.iso);
                }
              }}
              aria-label={`${cell.date.toLocaleDateString('pt-BR')}${
                dayEvents.length ? `, ${dayEvents.length} item(ns)` : ''
              }. Clique para adicionar.`}
            >
              <span className="dash-cal__day-num" aria-hidden>
                {cell.date.getDate()}
              </span>
              <div className="dash-cal__chips">
                {visible.map((ev) => {
                  const span = ev.span ?? 'single';
                  const cor = ev.cor ? normalizeHex(ev.cor) : null;
                  const chipStyle = cor ? estiloBarraCategoria(cor) : undefined;
                  return (
                    <button
                      key={`${ev.kind}-${ev.id}-${cell.iso}`}
                      type="button"
                      className={[
                        'dash-cal__chip',
                        `dash-cal__chip--${ev.kind}`,
                        span !== 'single' ? `dash-cal__chip--span-${span}` : '',
                        cor ? 'dash-cal__chip--custom' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      style={chipStyle}
                      title={
                        ev.kind === 'compromisso' && ev.createdByNome
                          ? `${ev.nome} · ${ev.createdByNome}`
                          : ev.nome
                      }
                      onClick={(e) => {
                        e.stopPropagation();
                        onItemClick(ev);
                      }}
                    >
                      <span className="dash-cal__chip-kind">{ev.kind === 'evento' ? 'E' : 'C'}</span>
                      {span === 'start' || span === 'single' ? (
                        <>
                          {ev.hora ? `${String(ev.hora).slice(0, 5)} ` : ''}
                          {ev.nome}
                        </>
                      ) : (
                        <span className="dash-cal__chip-continued">{ev.nome}</span>
                      )}
                    </button>
                  );
                })}
                {extra > 0 && (
                  <button
                    type="button"
                    className="dash-cal__more"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDayClick(cell.iso);
                    }}
                  >
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
