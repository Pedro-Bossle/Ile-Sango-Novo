import type { CobrancaComMembro } from '../../../services/cobrancas';
import {
  isCobrancaPendente,
  valorPagoCobranca,
  valorSaldoCobranca,
  valorTotalCobranca,
} from '../../../services/cobrancas';
import { CobrancaMembroCard, groupCobrancasPorMembro, type CobrancaMembroGrupo } from './CobrancaMembroCard';

export type CobrancasSortKey = 'nome-asc' | 'nome-desc' | 'vencimento' | 'valor';
export type CobrancasStatusFiltro = 'todas' | 'abertas' | 'atrasadas' | 'pagas';

type Props = {
  /** Grupos já paginados — preferencial. */
  groups?: CobrancaMembroGrupo[];
  /** Fallback: lista plana (agrupa internamente). */
  rows?: CobrancaComMembro[];
  onEdit: (c: CobrancaComMembro) => void;
  onDelete: (c: CobrancaComMembro) => void;
  onRefresh: () => void;
  selectedIds?: Set<string>;
  onToggleSelect?: (c: CobrancaComMembro, next: boolean) => void;
  onToggleSelectGroup?: (items: CobrancaComMembro[], next: boolean) => void;
};

function hojeIso() {
  return new Date().toISOString().slice(0, 10);
}

export function isCobrancaAtrasada(c: CobrancaComMembro): boolean {
  if (!isCobrancaPendente(c)) return false;
  const venc = (c.vencimento ?? '').slice(0, 10);
  return Boolean(venc && venc < hojeIso());
}

export function sortCobrancasList(list: CobrancaComMembro[], key: CobrancasSortKey): CobrancaComMembro[] {
  const out = [...list];
  out.sort((a, b) => {
    switch (key) {
      case 'nome-asc':
        return (a.membro_nome ?? '').localeCompare(b.membro_nome ?? '', 'pt-BR', { sensitivity: 'base' });
      case 'nome-desc':
        return (b.membro_nome ?? '').localeCompare(a.membro_nome ?? '', 'pt-BR', { sensitivity: 'base' });
      case 'vencimento': {
        const va = a.vencimento ?? '';
        const vb = b.vencimento ?? '';
        if (!va && !vb) return 0;
        if (!va) return 1;
        if (!vb) return -1;
        return va.localeCompare(vb);
      }
      case 'valor':
        return valorTotalCobranca(b) - valorTotalCobranca(a);
      default:
        return 0;
    }
  });
  return out;
}

export function totalRecebidoLista(rows: CobrancaComMembro[]) {
  return rows.reduce((a, c) => a + valorPagoCobranca(c), 0);
}

export function totalAbertoLista(rows: CobrancaComMembro[]) {
  return rows.reduce((a, c) => a + valorSaldoCobranca(c), 0);
}

export { groupCobrancasPorMembro };

export function CobrancasTable({
  groups,
  rows,
  onEdit,
  onDelete,
  onRefresh,
  selectedIds,
  onToggleSelect,
  onToggleSelectGroup,
}: Props) {
  const lista = groups ?? (rows ? groupCobrancasPorMembro(rows) : []);

  if (lista.length === 0) {
    return <p className="dash-cob-empty">Nenhuma cobrança encontrada.</p>;
  }

  return (
    <div className="dash-cob-list" data-tour="cobrancas-lista">
      {lista.map((g) => (
        <CobrancaMembroCard
          key={g.key}
          grupo={g}
          onEdit={onEdit}
          onDelete={onDelete}
          onRefresh={onRefresh}
          selectedIds={selectedIds}
          onToggleSelect={onToggleSelect}
          onToggleSelectGroup={onToggleSelectGroup}
        />
      ))}
    </div>
  );
}
