import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { fetchClientes, type Cliente } from '../../../services/atendimento';
import {
  buildOrcamentoMensagem,
  fetchOrcamentoItens,
  fetchOrcamentos,
  saveOrcamento,
  softDeleteOrcamento,
  saveCompromisso,
  type Orcamento,
  type OrcamentoItem,
} from '../../../services/orcamentosAgenda';
import { fetchConfigIle } from '../../../services/configIle';
import { buildMailtoLink, buildWaMeLink, openExternal } from '../../../utils/whatsappLink';
import { SearchableSelect, type SearchableSelectOption } from '../SearchableSelect';
import { Toast } from '../Toast';

type CatalogItem = { id: number; nome: string; valor: number };

type Props = {
  initialClienteId?: string | null;
  canSend?: boolean;
};

const FAV_KEY = 'orcamento_favoritos_catalogo';

export function OrcamentosScreen({ initialClienteId = null, canSend = true }: Props) {
  const [lista, setLista] = useState<Orcamento[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [catalogo, setCatalogo] = useState<CatalogItem[]>([]);
  const [favoritos, setFavoritos] = useState<number[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(FAV_KEY) || '[]');
    } catch {
      return [];
    }
  });
  const [sheet, setSheet] = useState(false);
  const [toast, setToast] = useState<{ msg: string; variant: 'success' | 'error' } | null>(null);
  const [ileNome, setIleNome] = useState('');
  const [pix, setPix] = useState('');
  const [form, setForm] = useState({
    id: '' as string | undefined,
    cliente_id: initialClienteId ?? '',
    titulo: 'Orçamento',
    itens: [] as OrcamentoItem[],
  });

  const reload = async () => {
    const [o, c] = await Promise.all([fetchOrcamentos(), fetchClientes()]);
    setLista(o);
    setClientes(c);
    const { data } = await supabase
      .from('catalogo')
      .select('id, nome, valor')
      .is('deleted_at', null)
      .order('nome');
    setCatalogo(
      (data ?? []).map((x) => ({ id: Number(x.id), nome: String(x.nome), valor: Number(x.valor) || 0 })),
    );
  };

  useEffect(() => {
    void reload().catch((e) => setToast({ msg: e.message, variant: 'error' }));
    fetchConfigIle()
      .then((cfg) => {
        setIleNome(cfg.nome_ile ?? '');
        setPix(cfg.chave_pix ?? '');
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (initialClienteId) {
      setForm((f) => ({ ...f, cliente_id: initialClienteId }));
      setSheet(true);
    }
  }, [initialClienteId]);

  const total = useMemo(
    () => form.itens.reduce((a, i) => a + Number(i.valor) * Number(i.quantidade || 1), 0),
    [form.itens],
  );

  const clienteOptions = useMemo(
    (): SearchableSelectOption[] => [
      { value: '', label: '—' },
      ...clientes.map((c) => ({ value: c.id, label: c.nome })),
    ],
    [clientes],
  );

  const mensagem = useMemo(() => {
    const base = buildOrcamentoMensagem(ileNome, form.itens, total);
    return pix ? `${base}\n\nPix: ${pix}` : base;
  }, [form.itens, total, ileNome, pix]);

  const addItem = (cat: CatalogItem) => {
    setForm((f) => ({
      ...f,
      itens: [...f.itens, { catalogo_id: cat.id, nome: cat.nome, valor: cat.valor, quantidade: 1 }],
    }));
  };

  const toggleFav = (id: number) => {
    setFavoritos((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      localStorage.setItem(FAV_KEY, JSON.stringify(next));
      return next;
    });
  };

  const salvar = async (status: 'rascunho' | 'enviado', criarAgenda = false) => {
    try {
      const id = await saveOrcamento({
        id: form.id,
        cliente_id: form.cliente_id || null,
        titulo: form.titulo,
        mensagem,
        total,
        status,
        itens: form.itens,
      });
      if (criarAgenda) {
        const cliente = clientes.find((c) => c.id === form.cliente_id);
        await saveCompromisso({
          titulo: `Atendimento — ${cliente?.nome || form.titulo}`,
          inicio: new Date(Date.now() + 86400000).toISOString(),
          cliente_id: form.cliente_id || null,
          tipo: 'atendimento',
          notas: mensagem.slice(0, 500),
        });
      }
      setSheet(false);
      await reload();
      setToast({ msg: 'Orçamento salvo.', variant: 'success' });
      return id;
    } catch (e) {
      setToast({ msg: e instanceof Error ? e.message : 'Erro', variant: 'error' });
      return null;
    }
  };

  const enviar = async (channel: 'wa' | 'mail') => {
    const id = await salvar('enviado');
    if (!id) return;
    const cliente = clientes.find((c) => c.id === form.cliente_id);
    if (channel === 'wa') openExternal(buildWaMeLink(cliente?.whatsapp, mensagem));
    else openExternal(buildMailtoLink(cliente?.email, form.titulo, mensagem));
  };

  const duplicar = async (o: Orcamento) => {
    const itens = await fetchOrcamentoItens(o.id);
    setForm({
      id: undefined,
      cliente_id: o.cliente_id ?? '',
      titulo: `${o.titulo || 'Orçamento'} (cópia)`,
      itens,
    });
    setSheet(true);
  };

  const catsOrdenados = useMemo(() => {
    const fav = catalogo.filter((c) => favoritos.includes(c.id));
    const rest = catalogo.filter((c) => !favoritos.includes(c.id));
    return [...fav, ...rest];
  }, [catalogo, favoritos]);

  return (
    <div className="dash-orcamentos" data-tour="atendimento-orcamentos">
      <Toast message={toast?.msg ?? null} variant={toast?.variant} onDismiss={() => setToast(null)} />
      <header className="dash-page-head">
        <div className="dash-page-head__titles">
          <h1>Orçamentos</h1>
          <p className="dash-muted">Propostas e valores para clientes.</p>
        </div>
        <div className="dash-page-head__actions" data-tour="orcamentos-acoes">
          <button
            type="button"
            className="dash-add-button"
            data-tour="orcamentos-novo"
            onClick={() => {
              setForm({ id: undefined, cliente_id: initialClienteId ?? '', titulo: 'Orçamento', itens: [] });
              setSheet(true);
            }}
          >
            + Orçamento
          </button>
        </div>
      </header>
      <div className="dash-grid-3" data-tour="orcamentos-lista">
        {lista.map((o) => (
          <article key={o.id} className="dash-card">
            <h3>{o.titulo}</h3>
            <p>
              {o.status} · {Number(o.total).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </p>
            <div className="dash-actions">
              <button type="button" onClick={() => void duplicar(o)}>
                Duplicar
              </button>
              <button type="button" onClick={() => void softDeleteOrcamento(o.id).then(reload)}>
                Excluir
              </button>
            </div>
          </article>
        ))}
      </div>

      {sheet && (
        <div className="dash-modal-overlay dash-modal-overlay--scrollable">
          <div className="dash-modal dash-modal--orcamento">
            <div className="dash-modal__head">
              <h2>Orçamento</h2>
              <button type="button" className="dash-modal__close" onClick={() => setSheet(false)}>
                ×
              </button>
            </div>
            <div className="dash-event-sheet__body dash-orcamentos__sheet">
              <div className="dash-event-sheet__row">
                <label className="dash-event-sheet__field">
                  <span>Cliente</span>
                  <SearchableSelect
                    options={clienteOptions}
                    value={form.cliente_id}
                    onChange={(v) => setForm({ ...form, cliente_id: v })}
                    searchPlaceholder="Buscar cliente…"
                    aria-label="Cliente"
                  />
                </label>
                <label className="dash-event-sheet__field">
                  <span>Título</span>
                  <input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} />
                </label>
              </div>
              <h3>Itens do catálogo</h3>
              <div className="dash-orcamentos__cats">
                {catsOrdenados.slice(0, 40).map((c) => (
                  <div key={c.id} className="dash-orcamentos__cat">
                    <button type="button" className="dash-btn-secondary dash-btn-min" onClick={() => addItem(c)}>
                      + {c.nome}
                    </button>
                    <button type="button" className="dash-btn-min dash-orcamentos__fav" onClick={() => toggleFav(c.id)} title="Favorito">
                      {favoritos.includes(c.id) ? '★' : '☆'}
                    </button>
                  </div>
                ))}
              </div>
              <ul className="dash-orcamentos__itens">
                {form.itens.map((i, idx) => (
                  <li key={`${i.nome}-${idx}`}>
                    <span>
                      {i.nome} ×{i.quantidade} — R$ {(i.valor * i.quantidade).toFixed(2)}
                    </span>
                    <button
                      type="button"
                      className="dash-icon-remove"
                      aria-label="Remover item"
                      onClick={() => setForm({ ...form, itens: form.itens.filter((_, j) => j !== idx) })}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
              <p className="dash-orcamentos__total">
                <strong>Total:</strong>{' '}
                {total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </p>
              <textarea className="dash-event-sheet__textarea" readOnly rows={8} value={mensagem} />
              <div className="dash-section-actions dash-orcamentos__actions">
                <button type="button" className="dash-btn-secondary" onClick={() => void salvar('rascunho')}>
                  Salvar rascunho
                </button>
                <button type="button" className="dash-btn-secondary" onClick={() => void salvar('enviado', true)}>
                  Salvar + Agenda
                </button>
                {canSend && (
                  <>
                    <button type="button" className="dash-btn-primary" onClick={() => void enviar('wa')}>
                      WhatsApp
                    </button>
                    <button type="button" className="dash-btn-primary" onClick={() => void enviar('mail')}>
                      E-mail
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
