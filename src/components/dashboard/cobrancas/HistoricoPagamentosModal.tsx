import { useEffect, useState } from 'react';
import type { CobrancaComMembro } from '../../../services/cobrancas';
import { buscarHistoricoPagamentos, valorSaldoCobranca, valorPagoCobranca } from '../../../services/cobrancas';
import type { PagamentoHistorico } from '../../../types/database';

type Props = {
  open: boolean;
  cobranca: CobrancaComMembro | null;
  onClose: () => void;
};

export function HistoricoPagamentosModal({ open, cobranca, onClose }: Props) {
  const [linhas, setLinhas] = useState<PagamentoHistorico[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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

  if (!open || !cobranca) return null;

  const totalPago = linhas.reduce((a, r) => a + Number(r.valor ?? 0), 0);
  const saldo = valorSaldoCobranca(cobranca);
  const pagoOficial = valorPagoCobranca(cobranca);

  return (
    <div className="dash-modal-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="dash-modal dash-modal--historico" onClick={(e) => e.stopPropagation()}>
        <h2>Histórico de pagamentos</h2>
        <p className="dash-muted">
          Cobrança #{String(cobranca.id)} · {cobranca.membro_nome}
        </p>
        {loading && <p>A carregar…</p>}
        {error && <p className="dash-error">{error}</p>}
        {!loading && !error && (
          <>
            <div className="dash-table-scroll">
              <table className="dash-table">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Valor pago</th>
                    <th>Forma</th>
                    <th>Observação</th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.length === 0 ? (
                    <tr>
                      <td colSpan={4}>
                        <span className="dash-muted">Nenhum pagamento registado.</span>
                      </td>
                    </tr>
                  ) : (
                    linhas.map((r) => (
                      <tr key={r.id}>
                        <td>{r.data_pagamento}</td>
                        <td>R$ {Number(r.valor ?? 0).toFixed(2)}</td>
                        <td>{r.forma_pagamento || '—'}</td>
                        <td>{r.obs || '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="dash-hist-resumo">
              <p>
                <strong>Total pago (linhas):</strong> R$ {totalPago.toFixed(2)}
              </p>
              <p>
                <strong>Valor pago (cobrança):</strong> R$ {pagoOficial.toFixed(2)}
              </p>
              <p>
                <strong>Saldo restante:</strong> R$ {saldo.toFixed(2)}
              </p>
            </div>
          </>
        )}
        <div className="dash-form-actions dash-hist-footer">
          <button type="button" className="dash-btn-primary" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
