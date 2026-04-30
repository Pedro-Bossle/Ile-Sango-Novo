import { useEffect, useState, type FormEvent } from 'react';
import type { CobrancaComMembro } from '../../../services/cobrancas';
import { registrarPagamento, valorSaldoCobranca } from '../../../services/cobrancas';
import { resolvePessoaIdCobranca, type UUID } from '../../../types/database';

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
  const [formaPagamento, setFormaPagamento] = useState('PIX');
  const [obs, setObs] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setValor('');
    setData(hojeISO());
    setFormaPagamento('PIX');
    setObs('');
    setError('');
  }, [open, cobranca?.id]);

  if (!open || !cobranca) return null;

  const saldo = valorSaldoCobranca(cobranca);
  const pessoaId = resolvePessoaIdCobranca(cobranca) as UUID | null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const v = Number(valor);
    if (!pessoaId || Number.isNaN(v) || v <= 0) {
      setError('Informe um valor válido.');
      return;
    }
    if (v > saldo + 0.01) {
      setError('O valor não pode ser maior que o saldo em aberto.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await registrarPagamento(cobranca.id, pessoaId, v, data, formaPagamento, obs);
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao registrar.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="dash-modal-overlay dash-modal-overlay--pagamento" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="dash-modal dash-modal--narrow" onClick={(e) => e.stopPropagation()}>
        <h2>Registrar pagamento</h2>
        <p className="dash-muted">
          Saldo atual: <strong>R$ {saldo.toFixed(2)}</strong>
        </p>
        {error && <p className="dash-error">{error}</p>}
        <form className="dash-member-form" onSubmit={(e) => void submit(e)}>
          <label className="dash-field">
            <span>Valor pago</span>
            <input
              type="number"
              step="0.01"
              min="0.01"
              max={saldo}
              required
              value={valor}
              onChange={(e) => setValor(e.target.value)}
            />
          </label>
          <label className="dash-field">
            <span>Data do pagamento</span>
            <input type="date" required value={data} onChange={(e) => setData(e.target.value)} />
          </label>
          <label className="dash-field">
            <span>Forma de pagamento</span>
            <select value={formaPagamento} onChange={(e) => setFormaPagamento(e.target.value)}>
              <option value="PIX">PIX</option>
              <option value="Dinheiro">Dinheiro</option>
              <option value="Cartão">Cartão</option>
              <option value="Transferência">Transferência</option>
            </select>
          </label>
          <label className="dash-field dash-field--full">
            <span>Observação</span>
            <textarea rows={3} value={obs} onChange={(e) => setObs(e.target.value)} />
          </label>
          <div className="dash-form-actions">
            <button type="button" className="dash-btn-secondary" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="dash-btn-primary" disabled={saving}>
              {saving ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
