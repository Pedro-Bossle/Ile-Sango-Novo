import { useEffect, useState, type FormEvent } from 'react';
import type { CobrancaComMembro } from '../../../services/cobrancas';
import { isMensalidadeTipo, registrarPagamento, valorSaldoCobranca } from '../../../services/cobrancas';
import { resolvePessoaIdCobranca, type UUID } from '../../../types/database';
import { FORMA_PAGAMENTO_PADRAO, FORMAS_PAGAMENTO } from '../../../lib/formasPagamento';
import { onModalOverlayClick } from '../../../utils/modalOverlay';
import { parseValorInput, sanitizeValorInput, valorToMaskedInput, formatMoneyBRL } from '../../../utils/money';

type Props = {
  open: boolean;
  cobranca: CobrancaComMembro | null;
  onClose: () => void;
  onSaved: () => void;
};

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function RegistrarPagamentoModal({ open, cobranca, onClose, onSaved }: Props) {
  const [valor, setValor] = useState('');
  const [data, setData] = useState(hojeISO());
  const [formaPagamento, setFormaPagamento] = useState(FORMA_PAGAMENTO_PADRAO);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    const saldo = cobranca ? valorSaldoCobranca(cobranca) : 0;
    setValor(cobranca && isMensalidadeTipo(cobranca) && saldo > 0 ? valorToMaskedInput(saldo) : '');
    setData(hojeISO());
    setFormaPagamento(FORMA_PAGAMENTO_PADRAO);
    setError('');
  }, [open, cobranca]);

  if (!open || !cobranca) return null;

  const saldo = valorSaldoCobranca(cobranca);
  const pessoaId = resolvePessoaIdCobranca(cobranca) as UUID | null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const v = parseValorInput(valor) ?? NaN;
    if (!pessoaId || Number.isNaN(v) || v <= 0) {
      setError('Informe um valor válido.');
      return;
    }
    if (v > saldo + 0.01) {
      setError('O valor não pode ser maior que o saldo em aberto.');
      return;
    }
    if (!formaPagamento) {
      setError('Selecione o tipo de pagamento.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await registrarPagamento(cobranca.id, pessoaId, v, data, formaPagamento);
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao registrar.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="dash-modal-overlay dash-modal-overlay--pagamento"
      role="dialog"
      aria-modal="true"
      onClick={onModalOverlayClick(onClose)}
    >
      <div className="dash-modal dash-modal--narrow" onClick={(e) => e.stopPropagation()}>
        <header className="dash-modal__head">
          <div>
            <h2>Registrar pagamento</h2>
            <p className="dash-muted">
              {cobranca.membro_nome}
              {cobranca.descricao ? ` · ${cobranca.descricao}` : ''}
            </p>
          </div>
          <button type="button" className="dash-modal__close" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </header>
        <p className="dash-muted">
          Em aberto: <strong>{formatMoneyBRL(saldo)}</strong>
        </p>
        {error && <p className="dash-error">{error}</p>}
        <form className="dash-member-form" onSubmit={(e) => void submit(e)}>
          <label className="dash-field">
            <span>Valor do pagamento</span>
            <input
              inputMode="decimal"
              required
              value={valor}
              onChange={(e) => setValor(sanitizeValorInput(e.target.value))}
              placeholder="R$ 0,00"
            />
          </label>
          <label className="dash-field">
            <span>Data</span>
            <input type="date" required value={data} onChange={(e) => setData(e.target.value)} />
          </label>
          <label className="dash-field dash-field--full">
            <span>Tipo de pagamento</span>
            <select
              value={formaPagamento}
              onChange={(e) => setFormaPagamento(e.target.value as typeof formaPagamento)}
              aria-label="Tipo de pagamento"
              required
            >
              {FORMAS_PAGAMENTO.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
          <div className="dash-form-actions">
            <button type="button" className="dash-btn-secondary" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="dash-btn-primary" disabled={saving}>
              {saving ? 'Salvando…' : 'Confirmar pagamento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
