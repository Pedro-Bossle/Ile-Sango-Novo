import { useEffect, useState } from 'react';
import type { CobrancaComMembro } from '../../../services/cobrancas';
import {
  buscarHistoricoPagamentos,
  excluirPagamentoCobranca,
  valorTotalCobranca,
} from '../../../services/cobrancas';
import type { PagamentoHistorico } from '../../../types/database';
import { formatDateBR } from '../../../utils/formatDate';
import { formatMoneyBRL } from '../../../utils/money';
import { onModalOverlayClick } from '../../../utils/modalOverlay';
import { useConfirmAction } from '../ConfirmActionModal';

type Props = {
  open: boolean;
  cobranca: CobrancaComMembro | null;
  onClose: () => void;
  /** Após excluir um pagamento (para recarregar a lista de cobranças). */
  onChanged?: () => void;
  canDelete?: boolean;
};

export function HistoricoPagamentosModal({
  open,
  cobranca,
  onClose,
  onChanged,
  canDelete = true,
}: Props) {
  const [linhas, setLinhas] = useState<PagamentoHistorico[]>([]);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const { ask: askConfirm, modal: confirmModal } = useConfirmAction();

  const reload = () => {
    if (!cobranca) return;
    setLoading(true);
    setError('');
    buscarHistoricoPagamentos(cobranca.id)
      .then(setLinhas)
      .catch((e) => setError(e instanceof Error ? e.message : 'Erro ao carregar.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!open || !cobranca) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    buscarHistoricoPagamentos(cobranca.id)
      .then((rows) => {
        if (!cancelled) setLinhas(rows);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Erro ao carregar.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch só depende de cobranca.id
  }, [open, cobranca?.id]);

  const excluir = async (r: PagamentoHistorico) => {
    const ok = await askConfirm({
      title: 'Confirmar exclusão',
      message: (
        <>
          Excluir o pagamento de <strong>{formatMoneyBRL(Number(r.valor ?? 0))}</strong> em{' '}
          <strong>{formatDateBR(r.data_pagamento)}</strong>? Isso remove do caixa e recalcula a
          quitação.
        </>
      ),
      confirmLabel: 'Excluir',
    });
    if (!ok) return;
    setDeletingId(r.id);
    try {
      await excluirPagamentoCobranca(r.id);
      reload();
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao excluir.');
    } finally {
      setDeletingId(null);
    }
  };

  if (!open || !cobranca) return null;

  const totalCobranca = valorTotalCobranca(cobranca);
  const totalPago = linhas.reduce((a, r) => a + Number(r.valor ?? 0), 0);
  const saldo = Math.max(0, Math.round((totalCobranca - totalPago) * 100) / 100);
  const quitada = saldo <= 0.009;

  return (
    <div
      className="dash-modal-overlay dash-modal-overlay--historico"
      role="dialog"
      aria-modal="true"
      onClick={onModalOverlayClick(onClose)}
    >
      {confirmModal}
      <div className="dash-modal dash-modal--historico" onClick={(e) => e.stopPropagation()}>
        <header className="dash-modal__head">
          <div>
            <h2>Histórico de pagamentos</h2>
            <p className="dash-muted">
              {cobranca.membro_nome}
              {cobranca.descricao ? ` · ${cobranca.descricao}` : ` · #${String(cobranca.id)}`}
            </p>
          </div>
          <button type="button" className="dash-modal__close" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </header>

        {loading && <p className="dash-muted">A carregar…</p>}
        {error && <p className="dash-error">{error}</p>}

        {!loading && !error && (
          <>
            <div className="dash-hist-resumo" aria-live="polite">
              <div className="dash-hist-resumo__row">
                <span>Valor da cobrança</span>
                <strong>{formatMoneyBRL(totalCobranca)}</strong>
              </div>
              <div className="dash-hist-resumo__row">
                <span>Total pago</span>
                <strong>{formatMoneyBRL(totalPago)}</strong>
              </div>
              <div className={`dash-hist-resumo__row dash-hist-resumo__saldo${quitada ? ' is-quitada' : ''}`}>
                <span>Saldo restante</span>
                <strong>{quitada ? 'Quitada' : formatMoneyBRL(saldo)}</strong>
              </div>
            </div>

            {linhas.length === 0 ? (
              <p className="dash-hist-empty dash-muted">Nenhum pagamento registado.</p>
            ) : (
              <ul className="dash-hist-list">
                {linhas.map((r) => (
                  <li key={r.id} className="dash-hist-item">
                    <div className="dash-hist-item__main">
                      <div className="dash-hist-item__top">
                        <time dateTime={r.data_pagamento || undefined}>{formatDateBR(r.data_pagamento)}</time>
                        <span className="dash-hist-item__valor">{formatMoneyBRL(Number(r.valor ?? 0))}</span>
                      </div>
                      <div className="dash-hist-item__meta">
                        <span className="dash-hist-item__forma">{r.forma_pagamento || '—'}</span>
                        {r.obs ? <span className="dash-hist-item__obs">{r.obs}</span> : null}
                      </div>
                    </div>
                    {canDelete && (
                      <button
                        type="button"
                        className="dash-btn-table dash-btn-table--danger"
                        disabled={deletingId === r.id}
                        onClick={() => void excluir(r)}
                        aria-label={`Excluir pagamento de ${formatMoneyBRL(Number(r.valor ?? 0))}`}
                      >
                        {deletingId === r.id ? '…' : 'Excluir'}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        <div className="dash-form-actions dash-hist-footer">
          <button type="button" className="dash-btn-secondary" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
