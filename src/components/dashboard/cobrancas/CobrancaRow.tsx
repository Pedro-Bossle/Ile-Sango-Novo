import { useState } from 'react';
import {
  isCobrancaPendente,
  isObrigacaoTipo,
  progressoPagamentoObrigacao,
  valorPagoCobranca,
  valorSaldoCobranca,
  valorTotalCobranca,
  type CobrancaComMembro,
} from '../../../services/cobrancas';
import { formatDateBR } from '../../../utils/formatDate';
import { RegistrarPagamentoModal } from './RegistrarPagamentoModal';
import { HistoricoPagamentosModal } from './HistoricoPagamentosModal';

type Props = {
  cobranca: CobrancaComMembro;
  selected: boolean;
  onSelect: (id: string | number, checked: boolean) => void;
  onEdit: (c: CobrancaComMembro) => void;
  onDelete: (c: CobrancaComMembro) => void;
  onRefresh: () => void;
};

function badgeTipo(t: string | null | undefined): { label: string; className: string } {
  if (t === 'mensalidade') return { label: 'Mensalidade', className: 'dash-badge-tipo dash-badge-tipo--mensalidade' };
  if (t === 'obrigacao') return { label: 'Obrigação', className: 'dash-badge-tipo dash-badge-tipo--obrigacao' };
  if (t === 'outros') return { label: 'Outros', className: 'dash-badge-tipo dash-badge-tipo--outros' };
  return { label: t?.trim() ? String(t) : '—', className: 'dash-badge-tipo' };
}

export function CobrancaRow({ cobranca, selected, onSelect, onEdit, onDelete, onRefresh }: Props) {
  const [registrarOpen, setRegistrarOpen] = useState(false);
  const [historicoOpen, setHistoricoOpen] = useState(false);

  const total = valorTotalCobranca(cobranca);
  const pago = valorPagoCobranca(cobranca);
  const saldo = valorSaldoCobranca(cobranca);
  const obrigacao = isObrigacaoTipo(cobranca);
  const pct = obrigacao ? progressoPagamentoObrigacao(cobranca) * 100 : 0;
  const tipoBadge = badgeTipo(cobranca.tipo);
  const pendente = isCobrancaPendente(cobranca);

  const dataCriacao = formatDateBR(cobranca.created_at ?? null);

  return (
    <>
      <tr className={selected ? 'dash-cob-row--selected' : undefined}>
        <td className="dash-cob-select-col">
          <input
            type="checkbox"
            checked={selected}
            onChange={(e) => onSelect(cobranca.id, e.target.checked)}
            aria-label={`Selecionar cobrança de ${cobranca.membro_nome}`}
          />
        </td>
        <td className="dash-cob-criacao">{dataCriacao}</td>
        <td>{formatDateBR(cobranca.vencimento)}</td>
        <td>{cobranca.membro_nome}</td>
        <td>
          <span className={tipoBadge.className}>{tipoBadge.label}</span>
        </td>
        <td className="dash-cob-valores">
          {obrigacao ? (
            <>
              <div className="dash-cob-valores__line">
                <span>Total</span> <strong>R$ {total.toFixed(2)}</strong>
              </div>
              <div className="dash-cob-valores__line">
                <span>Pago</span> <strong>R$ {pago.toFixed(2)}</strong>
              </div>
              <div className="dash-cob-valores__line">
                <span>Saldo</span> <strong>R$ {saldo.toFixed(2)}</strong>
              </div>
              <p className="dash-cob-progress-meta">
                R$ {pago.toFixed(2)} / R$ {total.toFixed(2)}
              </p>
              <div className="dash-cob-progress" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
                <div className="dash-cob-progress__fill" style={{ width: `${Math.min(100, pct)}%` }} />
              </div>
            </>
          ) : (
            <div className="dash-cob-valores__line">
              <strong>R$ {total.toFixed(2)}</strong>
            </div>
          )}
        </td>
        <td>{cobranca.descricao || '—'}</td>
        <td className="dash-cob-acoes">
          {pendente && obrigacao && (
            <>
              <button
                type="button"
                className="dash-btn-table"
                onClick={() => setHistoricoOpen(true)}
                title="Ver histórico"
                aria-label="Ver histórico"
              >
                📜
              </button>
              <button
                type="button"
                className="dash-btn-table dash-btn-table--pay"
                onClick={() => setRegistrarOpen(true)}
                title="Pagar"
                aria-label="Pagar"
              >
                💵
              </button>
            </>
          )}
          {pendente && !obrigacao && (
            <button
              type="button"
              className="dash-btn-table dash-btn-table--pay"
              onClick={() => setRegistrarOpen(true)}
              title="Pagar"
              aria-label="Pagar"
            >
              💵
            </button>
          )}
          {pendente && (
            <button
              type="button"
              className="dash-btn-table dash-btn-table--edit"
              onClick={() => onEdit(cobranca)}
              title="Editar"
              aria-label="Editar"
            >
              🖊️
            </button>
          )}
          <button
            type="button"
            className="dash-btn-table dash-btn-table--danger"
            onClick={() => onDelete(cobranca)}
            title="Excluir"
            aria-label="Excluir"
          >
            🗑️
          </button>
        </td>
      </tr>

      <RegistrarPagamentoModal
        open={registrarOpen}
        cobranca={cobranca}
        onClose={() => setRegistrarOpen(false)}
        onSaved={onRefresh}
      />
      <HistoricoPagamentosModal
        open={historicoOpen}
        cobranca={cobranca}
        onClose={() => setHistoricoOpen(false)}
      />
    </>
  );
}
