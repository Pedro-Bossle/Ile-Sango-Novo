import { useEffect, useMemo, useRef, useState } from 'react';
import type { CobrancaComMembro } from '../../../services/cobrancas';
import { valorTotalCobranca } from '../../../services/cobrancas';
import { CobrancaRow } from './CobrancaRow';

type Props = {
  rows: CobrancaComMembro[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string | number, checked: boolean) => void;
  onToggleSelectAllVisible: (ids: Array<string | number>, checked: boolean) => void;
  onEdit: (c: CobrancaComMembro) => void;
  onDelete: (c: CobrancaComMembro) => void;
  onRefresh: () => void;
};

type SortKey = 'criacao' | 'vencimento' | 'membro' | 'tipo' | 'valores' | 'descricao';

/** Primeira ordenação ao mudar de coluna: datas/valores com “mais relevante” primeiro. */
function defaultDirFor(key: SortKey): 'asc' | 'desc' {
  if (key === 'criacao' || key === 'valores') return 'desc';
  return 'asc';
}

function labelTipoOrdenacao(t: string | null | undefined): string {
  if (t === 'mensalidade') return 'Mensalidade';
  if (t === 'obrigacao') return 'Obrigação';
  if (t === 'outros') return 'Outros';
  return (t ?? '').trim() || '—';
}

function parseTimeIso(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
}

function parseDia(data: string | null | undefined): number | null {
  if (!data) return null;
  const t = new Date(data).getTime();
  return Number.isNaN(t) ? null : t;
}

function sortCobrancas(list: CobrancaComMembro[], key: SortKey, dir: 'asc' | 'desc'): CobrancaComMembro[] {
  const out = [...list];
  const cmpNumNullLast = (a: number | null, b: number | null): number => {
    if (a === null && b === null) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    const d = a - b;
    return dir === 'asc' ? d : -d;
  };

  out.sort((a, b) => {
    switch (key) {
      case 'criacao':
        return cmpNumNullLast(parseTimeIso(a.created_at), parseTimeIso(b.created_at));
      case 'vencimento':
        return cmpNumNullLast(parseDia(a.vencimento), parseDia(b.vencimento));
      case 'membro': {
        const cmp = (a.membro_nome ?? '').localeCompare(b.membro_nome ?? '', 'pt-BR', { sensitivity: 'base' });
        return dir === 'asc' ? cmp : -cmp;
      }
      case 'tipo': {
        const cmp = labelTipoOrdenacao(a.tipo).localeCompare(labelTipoOrdenacao(b.tipo), 'pt-BR', {
          sensitivity: 'base',
        });
        return dir === 'asc' ? cmp : -cmp;
      }
      case 'valores': {
        const d = valorTotalCobranca(a) - valorTotalCobranca(b);
        return dir === 'asc' ? d : -d;
      }
      case 'descricao': {
        const cmp = (a.descricao ?? '').localeCompare(b.descricao ?? '', 'pt-BR', { sensitivity: 'base' });
        return dir === 'asc' ? cmp : -cmp;
      }
      default:
        return 0;
    }
  });
  return out;
}

type SortHeaderProps = {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  dir: 'asc' | 'desc';
  onSort: (key: SortKey) => void;
  title: string;
};

function SortTh({ label, sortKey, activeKey, dir, onSort, title }: SortHeaderProps) {
  const active = activeKey === sortKey;
  const ariaSort = active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none';
  return (
    <th scope="col" aria-sort={ariaSort}>
      <button type="button" className="dash-th-sort" onClick={() => onSort(sortKey)} title={title}>
        <span>{label}</span>
        <span className="dash-th-sort__icons" aria-hidden>
          {active ? (dir === 'asc' ? '▲' : '▼') : '⇅'}
        </span>
      </button>
    </th>
  );
}

export function CobrancasTable({
  rows,
  selectedIds,
  onToggleSelect,
  onToggleSelectAllVisible,
  onEdit,
  onDelete,
  onRefresh,
}: Props) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({
    key: 'vencimento',
    dir: 'asc',
  });

  const sorted = useMemo(
    () => sortCobrancas(rows, sort.key, sort.dir),
    [rows, sort.key, sort.dir],
  );

  const onSort = (key: SortKey) => {
    setSort((s) => {
      if (s.key === key) return { key, dir: s.dir === 'asc' ? 'desc' : 'asc' };
      return { key, dir: defaultDirFor(key) };
    });
  };

  const visibleIds = sorted.map((c) => String(c.id));
  const totalSelecionadosVisiveis = visibleIds.filter((id) => selectedIds.has(id)).length;
  const allVisiveisSelecionados = visibleIds.length > 0 && totalSelecionadosVisiveis === visibleIds.length;
  const someVisiveisSelecionados = totalSelecionadosVisiveis > 0 && !allVisiveisSelecionados;
  const selectAllRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!selectAllRef.current) return;
    selectAllRef.current.indeterminate = someVisiveisSelecionados;
  }, [someVisiveisSelecionados]);

  if (rows.length === 0) {
    return <p className="dash-muted">Nenhuma cobrança encontrada.</p>;
  }
  return (
    <div className="dash-table-scroll">
      <table className="dash-table dash-table--cobrancas">
        <thead>
          <tr>
            <th scope="col" className="dash-th-static dash-cob-select-col">
              <input
                ref={selectAllRef}
                type="checkbox"
                checked={allVisiveisSelecionados}
                onChange={(e) => onToggleSelectAllVisible(sorted.map((c) => c.id), e.target.checked)}
                aria-label="Selecionar todas as cobranças visíveis"
              />
            </th>
            <SortTh
              label="Criação"
              sortKey="criacao"
              activeKey={sort.key}
              dir={sort.dir}
              onSort={onSort}
              title="Ordenar por data de criação (mais novo / mais antigo)"
            />
            <SortTh
              label="Data vencimento"
              sortKey="vencimento"
              activeKey={sort.key}
              dir={sort.dir}
              onSort={onSort}
              title="Ordenar por vencimento (mais próximo / mais distante)"
            />
            <SortTh
              label="Membro"
              sortKey="membro"
              activeKey={sort.key}
              dir={sort.dir}
              onSort={onSort}
              title="Ordenar por nome (A–Z / Z–A)"
            />
            <SortTh
              label="Tipo"
              sortKey="tipo"
              activeKey={sort.key}
              dir={sort.dir}
              onSort={onSort}
              title="Ordenar por tipo (A–Z / Z–A)"
            />
            <SortTh
              label="Valores"
              sortKey="valores"
              activeKey={sort.key}
              dir={sort.dir}
              onSort={onSort}
              title="Ordenar por valor total (maior / menor)"
            />
            <SortTh
              label="Descrição"
              sortKey="descricao"
              activeKey={sort.key}
              dir={sort.dir}
              onSort={onSort}
              title="Ordenar por descrição (A–Z / Z–A)"
            />
            <th scope="col" className="dash-th-static">
              Ações
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((c) => (
            <CobrancaRow
              key={String(c.id)}
              cobranca={c}
              selected={selectedIds.has(String(c.id))}
              onSelect={onToggleSelect}
              onEdit={onEdit}
              onDelete={onDelete}
              onRefresh={onRefresh}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
