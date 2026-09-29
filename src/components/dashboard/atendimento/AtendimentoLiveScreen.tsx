import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  cancelarAtendimento,
  fecharAtendimentoPago,
  fetchAtendimento,
  fetchCatalogoAtivo,
  salvarItensAtendimento,
  type AtendimentoItem,
  type CatalogoAtivoItem,
} from '../../../services/atendimentos';
import { fetchConfigIle } from '../../../services/configIle';
import { FORMA_PAGAMENTO_PADRAO, type FormaPagamento } from '../../../lib/formasPagamento';
import { baixarReciboAtendimento } from '../../../utils/reciboAtendimento';
import { matchesSearchFields } from '../../../utils/searchFold';
import { Toast } from '../Toast';
import { useConfirmAction } from '../ConfirmActionModal';
import { AtendimentoReceipt } from './AtendimentoReceipt';
import './AtendimentoLiveScreen.css';

function money(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

type Props = {
  atendimentoId: string;
  onClose: () => void;
  onPaid?: () => void;
};

export function AtendimentoLiveScreen({ atendimentoId, onClose, onPaid }: Props) {
  const { ask: askConfirm, modal: confirmModal } = useConfirmAction();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [clienteNome, setClienteNome] = useState('');
  const [itens, setItens] = useState<AtendimentoItem[]>([]);
  const [catalogo, setCatalogo] = useState<CatalogoAtivoItem[]>([]);
  const [busca, setBusca] = useState('');
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [forma, setForma] = useState<FormaPagamento>(FORMA_PAGAMENTO_PADRAO);
  const [pixChave, setPixChave] = useState<string | null>(null);
  const [pixTipo, setPixTipo] = useState<string | null>(null);
  const [pixQr, setPixQr] = useState<string | null>(null);
  const [ileNome, setIleNome] = useState<string | null>(null);
  const [logo, setLogo] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; variant: 'success' | 'error' } | null>(null);

  const total = useMemo(
    () => itens.reduce((a, it) => a + Number(it.valor) * Number(it.quantidade), 0),
    [itens],
  );

  const catalogoFiltrado = useMemo(() => {
    const q = busca.trim();
    if (!q) return catalogo;
    return catalogo.filter((c) => matchesSearchFields(q, c.nome, c.categoria));
  }, [catalogo, busca]);

  const persistItens = useCallback(
    async (next: AtendimentoItem[]) => {
      setItens(next);
      try {
        await salvarItensAtendimento(atendimentoId, next);
      } catch (e) {
        setToast({ msg: e instanceof Error ? e.message : 'Erro ao salvar itens.', variant: 'error' });
      }
    },
    [atendimentoId],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [atend, cat, cfg] = await Promise.all([
          fetchAtendimento(atendimentoId),
          fetchCatalogoAtivo(),
          fetchConfigIle(),
        ]);
        if (cancelled) return;
        if (atend.status !== 'em_andamento') {
          setToast({ msg: 'Este atendimento já foi encerrado.', variant: 'error' });
        }
        setClienteNome(atend.cliente_nome || 'Cliente');
        setItens(atend.itens ?? []);
        setCatalogo(cat);
        setPixChave(cfg.chave_pix);
        setPixTipo(cfg.chave_pix_tipo);
        setPixQr(cfg.pix_qr_base64);
        setIleNome(cfg.nome_ile);
        setLogo(cfg.logo_base64);
      } catch (e) {
        if (!cancelled) {
          setToast({ msg: e instanceof Error ? e.message : 'Erro ao abrir atendimento.', variant: 'error' });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [atendimentoId]);

  const addItem = (c: CatalogoAtivoItem) => {
    const next = [...itens];
    const idx = next.findIndex(
      (it) => it.catalogo_id === c.id && it.nome === c.nome && Number(it.valor) === Number(c.valor),
    );
    if (idx >= 0) {
      next[idx] = { ...next[idx], quantidade: Number(next[idx].quantidade) + 1 };
    } else {
      next.push({ catalogo_id: c.id, nome: c.nome, valor: c.valor, quantidade: 1 });
    }
    void persistItens(next);
  };

  const setQty = (index: number, qty: number) => {
    const next = [...itens];
    if (qty <= 0) {
      next.splice(index, 1);
    } else {
      next[index] = { ...next[index], quantidade: qty };
    }
    void persistItens(next);
  };

  const confirmarPagamento = async () => {
    setSaving(true);
    try {
      await salvarItensAtendimento(atendimentoId, itens);
      const { visitaId } = await fecharAtendimentoPago(atendimentoId, forma);
      try {
        baixarReciboAtendimento({
          ileNome,
          logoBase64: logo,
          chavePix: pixChave,
          chavePixTipo: pixTipo,
          pixQrBase64: pixQr,
          clienteNome,
          data: new Date().toISOString().slice(0, 10),
          resumo: itens.map((it) => `${it.quantidade}× ${it.nome}`).join(', '),
          valor: total,
          pago: true,
        });
      } catch {
        /* PDF opcional */
      }
      setToast({ msg: 'Pagamento registrado no caixa.', variant: 'success' });
      setReceiptOpen(false);
      onPaid?.();
      void visitaId;
      onClose();
    } catch (e) {
      setToast({ msg: e instanceof Error ? e.message : 'Erro ao registrar pagamento.', variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const cancelar = async () => {
    const ok = await askConfirm({
      title: 'Cancelar atendimento',
      message: 'Cancelar este atendimento? Os itens da comanda serão descartados.',
      confirmLabel: 'Cancelar atendimento',
      confirmingLabel: 'Cancelando…',
      cancelLabel: 'Voltar',
    });
    if (!ok) return;
    try {
      await cancelarAtendimento(atendimentoId);
      onClose();
    } catch (e) {
      setToast({ msg: e instanceof Error ? e.message : 'Erro ao cancelar.', variant: 'error' });
    }
  };

  return (
    <div className="dash-atend-live" data-tour="atendimento-live">
      {confirmModal}
      <Toast message={toast?.msg ?? null} variant={toast?.variant} onDismiss={() => setToast(null)} />

      <header className="dash-atend-live__head">
        <button type="button" className="dash-btn-secondary" onClick={onClose}>
          ← Voltar
        </button>
        <div className="dash-atend-live__titles">
          <h1>{clienteNome || 'Atendimento'}</h1>
          <p className="dash-muted">Comanda ao vivo · {money(total)}</p>
        </div>
        <button type="button" className="dash-btn-secondary dash-atend-live__cancel" onClick={() => void cancelar()}>
          Cancelar
        </button>
      </header>

      {loading ? (
        <p className="dash-muted dash-atend-live__loading">Carregando…</p>
      ) : (
        <div className="dash-atend-live__grid">
          <section className="dash-atend-live__catalogo" aria-label="Catálogo">
            <input
              type="search"
              className="dash-atend-live__busca"
              placeholder="Buscar no catálogo…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              aria-label="Buscar no catálogo"
            />
            <ul className="dash-atend-live__lista">
              {catalogoFiltrado.map((c) => (
                <li key={c.opcaoKey ?? `${c.id}-${c.nome}`}>
                  <button type="button" className="dash-atend-live__prod" onClick={() => addItem(c)}>
                    <span className="dash-atend-live__prod-nome">{c.nome}</span>
                    <span className="dash-atend-live__prod-valor">{money(c.valor)}</span>
                  </button>
                </li>
              ))}
              {!catalogoFiltrado.length && <li className="dash-muted">Nenhum item encontrado.</li>}
            </ul>
          </section>

          <section className="dash-atend-live__carrinho" aria-label="Comanda">
            <h2>Comanda</h2>
            {itens.length === 0 ? (
              <p className="dash-muted">Toque nos itens do catálogo para adicionar.</p>
            ) : (
              <ul className="dash-atend-live__cart">
                {itens.map((it, i) => (
                  <li key={`${it.catalogo_id}-${it.nome}-${i}`}>
                    <div className="dash-atend-live__cart-info">
                      <strong>{it.nome}</strong>
                      <span>{money(it.valor)}</span>
                    </div>
                    <div className="dash-atend-live__qty">
                      <button type="button" aria-label="Diminuir" onClick={() => setQty(i, Number(it.quantidade) - 1)}>
                        −
                      </button>
                      <span>{it.quantidade}</span>
                      <button type="button" aria-label="Aumentar" onClick={() => setQty(i, Number(it.quantidade) + 1)}>
                        +
                      </button>
                    </div>
                    <strong className="dash-atend-live__line">{money(it.valor * it.quantidade)}</strong>
                  </li>
                ))}
              </ul>
            )}
            <div className="dash-atend-live__footer">
              <p className="dash-atend-live__total">
                Total <strong>{money(total)}</strong>
              </p>
              <button
                type="button"
                className="dash-btn-primary"
                disabled={!itens.length}
                onClick={() => setReceiptOpen(true)}
              >
                Receber
              </button>
            </div>
          </section>
        </div>
      )}

      <AtendimentoReceipt
        open={receiptOpen}
        clienteNome={clienteNome}
        itens={itens}
        total={total}
        forma={forma}
        onFormaChange={setForma}
        chavePix={pixChave}
        chavePixTipo={pixTipo}
        pixQrBase64={pixQr}
        saving={saving}
        onConfirm={() => void confirmarPagamento()}
        onClose={() => setReceiptOpen(false)}
      />
    </div>
  );
}
