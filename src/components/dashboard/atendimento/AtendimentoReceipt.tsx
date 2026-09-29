import { FORMAS_PAGAMENTO, type FormaPagamento } from '../../../lib/formasPagamento';
import { formatarPixMascara, inferirPixTipo, isPixTipo } from '../../../utils/pix';

function money(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function pixDisplay(chave: string, tipo?: string | null) {
  const t = isPixTipo(tipo) ? tipo : inferirPixTipo(chave);
  return formatarPixMascara(t, chave);
}

export type ReceiptItem = {
  nome: string;
  valor: number;
  quantidade: number;
};

type Props = {
  open: boolean;
  clienteNome: string;
  itens: ReceiptItem[];
  total: number;
  forma: FormaPagamento;
  onFormaChange: (f: FormaPagamento) => void;
  chavePix?: string | null;
  chavePixTipo?: string | null;
  pixQrBase64?: string | null;
  saving?: boolean;
  onConfirm: () => void;
  onClose: () => void;
};

export function AtendimentoReceipt({
  open,
  clienteNome,
  itens,
  total,
  forma,
  onFormaChange,
  chavePix,
  chavePixTipo,
  pixQrBase64,
  saving = false,
  onConfirm,
  onClose,
}: Props) {
  if (!open) return null;

  return (
    <div className="dash-modal-overlay dash-atend-receipt-overlay" role="presentation">
      <div
        className="dash-atend-receipt"
        role="dialog"
        aria-modal="true"
        aria-labelledby="atend-receipt-title"
      >
        <header className="dash-atend-receipt__head">
          <button type="button" className="dash-btn-secondary" onClick={onClose} disabled={saving}>
            Voltar
          </button>
          <h2 id="atend-receipt-title">Receber pagamento</h2>
        </header>

        <div className="dash-atend-receipt__body">
          <p className="dash-atend-receipt__cliente">{clienteNome}</p>

          <ul className="dash-atend-receipt__itens">
            {itens.map((it, i) => (
              <li key={`${it.nome}-${i}`}>
                <span>
                  {it.quantidade}× {it.nome}
                </span>
                <strong>{money(it.valor * it.quantidade)}</strong>
              </li>
            ))}
          </ul>

          <p className="dash-atend-receipt__total">
            <span>Total</span>
            <strong>{money(total)}</strong>
          </p>

          <div className="dash-atend-receipt__modos" role="group" aria-label="Forma de pagamento">
            {FORMAS_PAGAMENTO.map((f) => (
              <button
                key={f.value}
                type="button"
                className={`dash-atend-receipt__modo${forma === f.value ? ' is-active' : ''}`}
                onClick={() => onFormaChange(f.value)}
                disabled={saving}
              >
                {f.label}
              </button>
            ))}
          </div>

          {forma === 'Pix' && (
            <div className="dash-atend-receipt__pix">
              {pixQrBase64 ? (
                <img src={pixQrBase64} alt="QR Code Pix" className="dash-atend-receipt__qr" />
              ) : (
                <p className="dash-muted">Cadastre o QR Pix em Dados do Ilê.</p>
              )}
              {chavePix ? (
                <p className="dash-atend-receipt__chave">
                  Chave: <strong>{pixDisplay(chavePix, chavePixTipo)}</strong>
                </p>
              ) : null}
            </div>
          )}

          {forma === 'Dinheiro' && (
            <p className="dash-muted dash-atend-receipt__hint">Confirme o recebimento em dinheiro.</p>
          )}
          {forma === 'Cartão' && (
            <p className="dash-muted dash-atend-receipt__hint">Confirme o recebimento no cartão.</p>
          )}
        </div>

        <footer className="dash-atend-receipt__foot">
          <button
            type="button"
            className="dash-btn-primary dash-atend-receipt__confirm"
            disabled={saving || total <= 0}
            onClick={onConfirm}
          >
            {saving ? 'Registrando…' : `Confirmar ${money(total)}`}
          </button>
        </footer>
      </div>
    </div>
  );
}
