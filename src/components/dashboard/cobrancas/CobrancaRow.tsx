import { useState } from 'react';
import {
  isCobrancaPendente,
  progressoPagamentoObrigacao,
  valorPagoCobranca,
  valorSaldoCobranca,
  valorTotalCobranca,
  type CobrancaComMembro,
} from '../../../services/cobrancas';
import { RegistrarPagamentoModal } from './RegistrarPagamentoModal';
import { HistoricoPagamentosModal } from './HistoricoPagamentosModal';

type Props = {
  cobranca: CobrancaComMembro;
  onEdit: (c: CobrancaComMembro) => void;
  onDelete: (c: CobrancaComMembro) => void;
  onRefresh: () => void;
  /** Quando dentro de um grupo por membro, oculta o nome repetido. */
  hideNome?: boolean;
  /** Exibe checkbox (ex.: várias cobranças do mesmo membro). */
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (c: CobrancaComMembro, next: boolean) => void;
};

function money(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });
}

function hojeIso() {
  return new Date().toISOString().slice(0, 10);
}

/** Status de UI: alinhado ao filtro da tela (`em_aberto` | `atrasada` | `pago`). */
export function statusCobrancaUi(c: CobrancaComMembro): 'em_aberto' | 'atrasada' | 'pago' {
  if (!isCobrancaPendente(c)) return 'pago';
  const venc = (c.vencimento ?? '').slice(0, 10);
  if (venc && venc < hojeIso()) return 'atrasada';
  return 'em_aberto';
}

function statusBadge(c: CobrancaComMembro): { key: 'atrasada' | 'aberta' | 'pago'; label: string } {
  const ui = statusCobrancaUi(c);
  if (ui === 'pago') return { key: 'pago', label: 'Pago' };
  if (ui === 'atrasada') return { key: 'atrasada', label: 'Atrasada' };
  return { key: 'aberta', label: 'Em aberto' };
}

export function CobrancaRow({
  cobranca,
  onEdit,
  onDelete,
  onRefresh,
  hideNome = false,
  selectable = false,
  selected = false,
  onToggleSelect,
}: Props) {
  const [registrarOpen, setRegistrarOpen] = useState(false);
  const [historicoOpen, setHistoricoOpen] = useState(false);

  const total = valorTotalCobranca(cobranca);
  const pago = valorPagoCobranca(cobranca);
  const saldo = valorSaldoCobranca(cobranca);
  const pct = Math.round(progressoPagamentoObrigacao(cobranca) * 100);
  const status = statusBadge(cobranca);
  const pendente = isCobrancaPendente(cobranca);
  const nome = cobranca.membro_nome || cobranca.membro || 'Membro';
  const desc = (cobranca.descricao || '').trim() || 'Sem descrição';

  return (
    <>
      <article
        className={`dash-cob-item${status.key === 'pago' ? ' dash-cob-item--pago' : ''}${
          hideNome ? ' dash-cob-item--nested' : ''
        }${selected ? ' is-selected' : ''}`}
      >
        {selectable && (
          <label className="dash-cob-item__check">
            <input
              type="checkbox"
              checked={selected}
              onChange={(e) => onToggleSelect?.(cobranca, e.target.checked)}
              aria-label={`Selecionar cobrança de ${nome}`}
            />
          </label>
        )}
        <div className="dash-cob-item__main">
          {!hideNome && <h3 className="dash-cob-item__nome">{nome}</h3>}
          <p className={`dash-cob-item__desc${hideNome ? ' dash-cob-item__desc--lead' : ''}`}>{desc}</p>
          <p className="dash-cob-item__valores">
            {money(pago)} de {money(total)} — resta {money(saldo)}
          </p>
          <div className="dash-cob-item__progress">
            <div
              className="dash-cob-item__bar"
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${pct}% quitado`}
            >
              <div className="dash-cob-item__bar-fill" style={{ width: `${Math.min(100, pct)}%` }} />
            </div>
            <span className="dash-cob-item__pct">{pct}% quitado</span>
          </div>
        </div>

        <div className="dash-cob-item__side">
          <span
            className={`dash-cob-status dash-cob-status--${
              status.key === 'aberta' ? 'em_aberto' : status.key
            }`}
          >
            {status.label}
          </span>
          <div className="dash-cob-item__actions">
            {pendente && (
              <button
                type="button"
                className="dash-cob-icon-btn dash-cob-icon-btn--pay"
                onClick={() => setRegistrarOpen(true)}
                title="Registrar pagamento"
                aria-label="Registrar pagamento"
              >
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden focusable="false">
                  <path
                    fill="currentColor"
                    d="M3 7.5A2.5 2.5 0 0 1 5.5 5h13A2.5 2.5 0 0 1 21 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 16.5v-9Zm2.5-.5a.5.5 0 0 0-.5.5V9h16V7.5a.5.5 0 0 0-.5-.5h-15ZM21 11H3v5.5a.5.5 0 0 0 .5.5h13a.5.5 0 0 0 .5-.5V11Zm-8 3h5v1.5h-5V14Z"
                  />
                </svg>
              </button>
            )}
            <button
              type="button"
              className="dash-cob-icon-btn"
              onClick={() => setHistoricoOpen(true)}
              title="Histórico"
              aria-label="Histórico de pagamentos"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden focusable="false">
                <path
                  fill="currentColor"
                  d="M12 4a8 8 0 1 1-7.75 10h1.6A6.5 6.5 0 1 0 12 5.5V8l3.5-3.5L12 1v3Zm-.75 4.25v4.1l3.4 2.02.75-1.26-2.65-1.57V8.25h-1.5Z"
                />
              </svg>
            </button>
            {pendente && (
              <button
                type="button"
                className="dash-cob-icon-btn"
                onClick={() => onEdit(cobranca)}
                title="Editar"
                aria-label="Editar cobrança"
              >
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden focusable="false">
                  <path
                    fill="currentColor"
                    d="M4 17.25V20h2.75L18.8 8.0l-2.75-2.75L4 17.25ZM20.7 6.35a.75.75 0 0 0 0-1.06l-1.99-1.99a.75.75 0 0 0-1.06 0l-1.56 1.56 3.05 3.05 1.56-1.56Z"
                  />
                </svg>
              </button>
            )}
            <button
              type="button"
              className="dash-cob-icon-btn dash-cob-icon-btn--danger"
              onClick={() => onDelete(cobranca)}
              title="Excluir"
              aria-label="Excluir cobrança"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden focusable="false">
                <path
                  fill="currentColor"
                  d="M9 3h6l1 2h4v2H4V5h4l1-2Zm1 6h2v9h-2V9Zm4 0h2v9h-2V9ZM7 9h2v9H7V9Zm-1 12h12a1 1 0 0 0 1-1V8H5v12a1 1 0 0 0 1 1Z"
                />
              </svg>
            </button>
          </div>
        </div>
      </article>

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
        onChanged={onRefresh}
      />
    </>
  );
}
