import { useMemo, useState } from 'react';
import {
  isCobrancaPendente,
  valorPagoCobranca,
  valorSaldoCobranca,
  valorTotalCobranca,
  type CobrancaComMembro,
} from '../../../services/cobrancas';
import { resolvePessoaIdCobranca } from '../../../types/database';
import { CobrancaRow, statusCobrancaUi } from './CobrancaRow';

export type CobrancaMembroGrupo = {
  key: string;
  nome: string;
  items: CobrancaComMembro[];
};

export function membroCobrancaKey(c: CobrancaComMembro): string {
  const pid = resolvePessoaIdCobranca(c);
  if (pid) return `p:${pid}`;
  const nome = (c.membro_nome || c.membro || 'Membro').trim().toLowerCase();
  return `n:${nome || 'sem-nome'}`;
}

/** Agrupa cobranças por membro, preservando a ordem relativa da lista filtrada. */
export function groupCobrancasPorMembro(rows: CobrancaComMembro[]): CobrancaMembroGrupo[] {
  const order: string[] = [];
  const map = new Map<string, CobrancaMembroGrupo>();
  for (const c of rows) {
    const key = membroCobrancaKey(c);
    let g = map.get(key);
    if (!g) {
      g = {
        key,
        nome: c.membro_nome || c.membro || 'Membro',
        items: [],
      };
      map.set(key, g);
      order.push(key);
    }
    g.items.push(c);
  }
  return order.map((k) => map.get(k)!);
}

function money(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });
}

function statusGrupo(items: CobrancaComMembro[]): {
  key: 'atrasada' | 'em_aberto' | 'pago';
  label: string;
} {
  const uis = items.map(statusCobrancaUi);
  if (uis.some((u) => u === 'atrasada')) return { key: 'atrasada', label: 'Atrasada' };
  if (uis.some((u) => u === 'em_aberto')) return { key: 'em_aberto', label: 'Em aberto' };
  return { key: 'pago', label: 'Pago' };
}

type Props = {
  grupo: CobrancaMembroGrupo;
  onEdit: (c: CobrancaComMembro) => void;
  onDelete: (c: CobrancaComMembro) => void;
  onRefresh: () => void;
  selectedIds?: Set<string>;
  onToggleSelect?: (c: CobrancaComMembro, next: boolean) => void;
  onToggleSelectGroup?: (items: CobrancaComMembro[], next: boolean) => void;
};

export function CobrancaMembroCard({
  grupo,
  onEdit,
  onDelete,
  onRefresh,
  selectedIds,
  onToggleSelect,
  onToggleSelectGroup,
}: Props) {
  const multi = grupo.items.length > 1;
  const [open, setOpen] = useState(false);

  const totals = useMemo(() => {
    let pago = 0;
    let total = 0;
    let saldo = 0;
    for (const c of grupo.items) {
      pago += valorPagoCobranca(c);
      total += valorTotalCobranca(c);
      saldo += valorSaldoCobranca(c);
    }
    const pct = total > 0 ? Math.round((pago / total) * 100) : 0;
    return { pago, total, saldo, pct };
  }, [grupo.items]);

  const status = statusGrupo(grupo.items);
  const qtdPendentes = grupo.items.filter((c) => isCobrancaPendente(c)).length;

  const selectedCount = useMemo(() => {
    if (!selectedIds) return 0;
    return grupo.items.filter((c) => selectedIds.has(String(c.id))).length;
  }, [grupo.items, selectedIds]);

  const allSelected = multi && selectedCount === grupo.items.length && grupo.items.length > 0;
  const someSelected = multi && selectedCount > 0 && !allSelected;

  if (!multi) {
    return (
      <CobrancaRow
        cobranca={grupo.items[0]!}
        onEdit={onEdit}
        onDelete={onDelete}
        onRefresh={onRefresh}
      />
    );
  }

  return (
    <article
      className={`dash-cob-group${status.key === 'pago' ? ' dash-cob-group--pago' : ''}${
        open ? ' is-open' : ''
      }${selectedCount > 0 ? ' is-selected' : ''}`}
    >
      <div className="dash-cob-group__head">
        {onToggleSelectGroup && (
          <label
            className="dash-cob-group__check"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <input
              type="checkbox"
              checked={allSelected}
              ref={(el) => {
                if (el) el.indeterminate = someSelected;
              }}
              onChange={(e) => {
                const next = e.target.checked;
                if (next) setOpen(true);
                onToggleSelectGroup(grupo.items, next);
              }}
              aria-label={`Selecionar todas as cobranças de ${grupo.nome}`}
            />
          </label>
        )}
        <button
          type="button"
          className="dash-cob-group__toggle"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="dash-cob-group__chevron" aria-hidden>
            {open ? '▾' : '▸'}
          </span>
          <span className="dash-cob-group__main">
            <strong className="dash-cob-group__nome">{grupo.nome}</strong>
            <span className="dash-cob-group__meta">
              {grupo.items.length} cobranças
              {qtdPendentes > 0 ? ` · ${qtdPendentes} em aberto` : ''}
              {selectedCount > 0 ? ` · ${selectedCount} selecionada(s)` : ''}
            </span>
            <span className="dash-cob-group__valores">
              {money(totals.pago)} de {money(totals.total)} — resta {money(totals.saldo)}
            </span>
            <span
              className="dash-cob-item__bar"
              role="progressbar"
              aria-valuenow={totals.pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${totals.pct}% quitado`}
            >
              <span className="dash-cob-item__bar-fill" style={{ width: `${Math.min(100, totals.pct)}%` }} />
            </span>
            <span className="dash-cob-item__pct">{totals.pct}% quitado</span>
          </span>
          <span className={`dash-cob-status dash-cob-status--${status.key}`}>{status.label}</span>
        </button>
      </div>

      {open && (
        <div className="dash-cob-group__items">
          {grupo.items.map((c) => (
            <CobrancaRow
              key={String(c.id)}
              cobranca={c}
              hideNome
              selectable
              selected={Boolean(selectedIds?.has(String(c.id)))}
              onToggleSelect={onToggleSelect}
              onEdit={onEdit}
              onDelete={onDelete}
              onRefresh={onRefresh}
            />
          ))}
        </div>
      )}
    </article>
  );
}
