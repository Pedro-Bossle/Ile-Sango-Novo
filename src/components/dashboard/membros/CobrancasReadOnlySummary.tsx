import { useMemo } from 'react';
import {
  isCobrancaPendente,
  valorSaldoCobranca,
  valorTotalCobranca,
  type CobrancaComMembro,
} from '../../../services/cobrancas';
import { formatDateBR } from '../../../utils/formatDate';

type Props = {
  cobrancas: CobrancaComMembro[];
  onEdit: (c: CobrancaComMembro) => void;
  onDelete: (c: CobrancaComMembro) => void;
};

const formatBRL = (n: number) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });

export function CobrancasReadOnlySummary({ cobrancas, onEdit, onDelete }: Props) {
  const subtotalDevido = useMemo(
    () =>
      cobrancas.filter((c) => isCobrancaPendente(c)).reduce((a, c) => a + valorSaldoCobranca(c), 0),
    [cobrancas],
  );

  if (cobrancas.length === 0) {
    return (
      <section className="dash-form-section">
        <h2 className="dash-form-section__title">Cobranças</h2>
        <p className="dash-muted">Nenhuma cobrança associada. As cobranças são geridas no ecrã Cobranças.</p>
      </section>
    );
  }

  return (
    <section className="dash-form-section">
      <h2 className="dash-form-section__title">Cobranças (resumo)</h2>
      <p className="dash-muted">Edite ou exclua por linha; para a lista completa use o menu Cobranças.</p>
      <div className="dash-table-scroll">
        <table className="dash-table dash-table--cobrancas-resumo">
          <thead>
            <tr>
              <th>Data</th>
              <th>Valor</th>
              <th>Descrição</th>
              <th>Situação</th>
              <th className="dash-th-static">Ações</th>
            </tr>
          </thead>
          <tbody>
            {cobrancas.map((c) => {
              const pendente = isCobrancaPendente(c);
              const total = valorTotalCobranca(c);
              const saldo = valorSaldoCobranca(c);
              return (
                <tr key={c.id}>
                  <td>{formatDateBR(c.vencimento ?? null)}</td>
                  <td>
                    R$ {total.toFixed(2)}
                    {saldo > 0.001 && saldo < total - 0.001 && (
                      <span className="dash-muted"> (aberto R$ {saldo.toFixed(2)})</span>
                    )}
                  </td>
                  <td>{c.descricao || '—'}</td>
                  <td>
                    <span className={`dash-badge ${pendente ? 'dash-badge--devendo' : 'dash-badge--ok'}`}>
                      {pendente ? 'Devendo' : 'Em dia'}
                    </span>
                  </td>
                  <td className="dash-cob-resumo-acoes">
                    <button
                      type="button"
                      className="dash-icon-action dash-icon-action--edit"
                      aria-label="Editar cobrança"
                      title="Editar"
                      onClick={() => onEdit(c)}
                    >
                      ✎
                    </button>
                    <button
                      type="button"
                      className="dash-icon-action dash-icon-action--danger"
                      aria-label="Excluir cobrança"
                      title="Excluir"
                      onClick={() => onDelete(c)}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="dash-cob-subtotal dash-cob-resumo-subtotal" role="status">
        <strong>Subtotal em aberto (devendo):</strong> {formatBRL(subtotalDevido)}
      </p>
    </section>
  );
}
