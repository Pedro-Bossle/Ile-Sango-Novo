import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { fetchClientes, type Cliente } from '../../../services/atendimento';
import {
  buildOrcamentoMensagem,
  ensureCobrancaFromVenda,
  saveOrcamento,
  saveCompromisso,
  type OrcamentoItem,
} from '../../../services/orcamentosAgenda';
import { fetchConfigIle } from '../../../services/configIle';
import { buildWaMeLink, openExternal } from '../../../utils/whatsappLink';
import { enviarEmail } from '../../../services/enviarEmail';
import { SearchableSelect, type SearchableSelectOption } from '../SearchableSelect';
import { onModalOverlayClick } from '../../../utils/modalOverlay';
import { expandCatalogoOpcoes } from '../../../utils/catalogoVariacoes';
import { matchesSearch } from '../../../utils/searchFold';

type CatalogItem = { id: number; nome: string; valor: number; opcaoKey?: string };

const FAV_KEY = 'orcamento_favoritos_catalogo';

function money(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export type OrcamentoModalProps = {
  open: boolean;
  onClose: () => void;
  /** Cliente pré-selecionado (ex.: ficha do cliente). */
  initialClienteId?: string | null;
  /** Nome para exibir quando o cliente está bloqueado (evita esperar o fetch). */
  clienteNome?: string | null;
  /** Se o cliente é filho de santo (pessoa_id), para criar cobrança sem esperar o fetch. */
  clientePessoaId?: string | null;
  initialTitulo?: string;
  initialItens?: OrcamentoItem[];
  /** Impede trocar o cliente no passo 1 e grava sempre esse vínculo. */
  lockCliente?: boolean;
  canSend?: boolean;
  onSaved?: () => void;
  onToast?: (msg: string, variant: 'success' | 'error') => void;
};

export function OrcamentoModal({
  open,
  onClose,
  initialClienteId = null,
  clienteNome = null,
  clientePessoaId = null,
  initialTitulo = 'Venda',
  initialItens,
  lockCliente = false,
  canSend = true,
  onSaved,
  onToast,
}: OrcamentoModalProps) {
  const clienteIdVinculado = String(initialClienteId ?? '').trim();

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [catalogo, setCatalogo] = useState<CatalogItem[]>([]);
  const [favoritos, setFavoritos] = useState<number[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(FAV_KEY) || '[]');
    } catch {
      return [];
    }
  });
  const [ileNome, setIleNome] = useState('');
  const [pix, setPix] = useState('');
  const [buscaCatalogo, setBuscaCatalogo] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    id: undefined as string | undefined,
    cliente_id: clienteIdVinculado,
    titulo: 'Venda',
    itens: [] as OrcamentoItem[],
  });

  useEffect(() => {
    if (!open) return;
    const cid = lockCliente ? clienteIdVinculado : String(initialClienteId ?? '').trim();
    setForm({
      id: undefined,
      cliente_id: cid,
      titulo: initialTitulo || 'Venda',
      itens: initialItens ? [...initialItens] : [],
    });
    setBuscaCatalogo('');
    void (async () => {
      try {
        const c = await fetchClientes();
        setClientes(c);
        const { data } = await supabase
          .from('catalogo')
          .select('id, nome, valor, categoria, variacoes')
          .is('deleted_at', null)
          .order('nome');
        setCatalogo(
          expandCatalogoOpcoes(data ?? []).map((x) => ({
            id: x.id,
            nome: x.nome,
            valor: x.valor,
            opcaoKey: x.opcaoKey,
          })),
        );
      } catch (e) {
        onToast?.(e instanceof Error ? e.message : 'Erro ao carregar venda.', 'error');
      }
    })();
    fetchConfigIle()
      .then((cfg) => {
        setIleNome(cfg.nome_ile ?? '');
        setPix(cfg.chave_pix ?? '');
      })
      .catch(() => undefined);
    // Reinicia ao abrir; lê cliente/título/itens do momento da abertura
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, clienteIdVinculado, lockCliente]);

  const clienteIdEfetivo = lockCliente && clienteIdVinculado ? clienteIdVinculado : form.cliente_id;

  const total = useMemo(
    () => form.itens.reduce((a, i) => a + Number(i.valor) * Number(i.quantidade || 1), 0),
    [form.itens],
  );

  const clienteSelecionado = useMemo(
    () => clientes.find((c) => c.id === clienteIdEfetivo) ?? null,
    [clientes, clienteIdEfetivo],
  );

  const nomeClienteExibido =
    clienteNome?.trim() || clienteSelecionado?.nome || (lockCliente ? 'Cliente da ficha' : '');

  const clienteOptions = useMemo(
    (): SearchableSelectOption[] => [
      { value: '', label: 'Escolha o cliente…' },
      ...clientes.map((c) => ({ value: c.id, label: c.nome })),
    ],
    [clientes],
  );

  const mensagem = useMemo(() => {
    const base = buildOrcamentoMensagem(ileNome, form.itens, total);
    return pix ? `${base}\n\nPix: ${pix}` : base;
  }, [form.itens, total, ileNome, pix]);

  const addItem = (cat: CatalogItem) => {
    setForm((f) => {
      const idx = f.itens.findIndex((i) => i.catalogo_id === cat.id && i.nome === cat.nome);
      if (idx >= 0) {
        return {
          ...f,
          itens: f.itens.map((i, j) =>
            j === idx ? { ...i, quantidade: Number(i.quantidade || 1) + 1 } : i,
          ),
        };
      }
      return {
        ...f,
        itens: [...f.itens, { catalogo_id: cat.id, nome: cat.nome, valor: cat.valor, quantidade: 1 }],
      };
    });
    setBuscaCatalogo('');
  };

  const setQty = (idx: number, qty: number) => {
    const q = Math.max(1, Math.min(99, Math.floor(qty) || 1));
    setForm((f) => ({
      ...f,
      itens: f.itens.map((i, j) => (j === idx ? { ...i, quantidade: q } : i)),
    }));
  };

  const removeItem = (idx: number) => {
    setForm((f) => ({ ...f, itens: f.itens.filter((_, j) => j !== idx) }));
  };

  const toggleFav = (id: number) => {
    setFavoritos((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      localStorage.setItem(FAV_KEY, JSON.stringify(next));
      return next;
    });
  };

  const podeEnviar = Boolean(clienteIdEfetivo) && form.itens.length > 0;

  const salvar = async (status: 'rascunho' | 'enviado', criarAgenda = false) => {
    if (!form.itens.length) {
      onToast?.('Inclua ao menos um serviço na venda.', 'error');
      return null;
    }
    if (lockCliente && !clienteIdEfetivo) {
      onToast?.('Cliente da ficha não identificado.', 'error');
      return null;
    }
    setSaving(true);
    try {
      const id = await saveOrcamento({
        id: form.id,
        cliente_id: clienteIdEfetivo || null,
        titulo: form.titulo,
        mensagem,
        total,
        status,
        itens: form.itens,
      });
      const cliente = clientes.find((c) => c.id === clienteIdEfetivo);
      const pessoaId = cliente?.pessoa_id || (lockCliente ? clientePessoaId : null) || null;
      const membroNome = cliente?.nome || nomeClienteExibido || 'Membro';
      let cobrancaCriada = false;
      if (pessoaId && total > 0) {
        const r = await ensureCobrancaFromVenda({
          orcamentoId: id,
          pessoaId,
          membroNome,
          total,
          titulo: form.titulo,
          itens: form.itens,
        });
        cobrancaCriada = r.created;
      }
      if (criarAgenda) {
        await saveCompromisso({
          titulo: `Atendimento — ${membroNome || form.titulo}`,
          inicio: new Date(Date.now() + 86400000).toISOString(),
          cliente_id: clienteIdEfetivo || null,
          tipo: 'atendimento',
          notas: mensagem.slice(0, 500),
        });
      }
      onClose();
      onSaved?.();
      const baseMsg = criarAgenda
        ? 'Venda guardada e marcada na agenda.'
        : 'Venda guardada.';
      onToast?.(
        cobrancaCriada ? `${baseMsg} Cobrança criada para o filho de santo.` : baseMsg,
        'success',
      );
      return id;
    } catch (e) {
      onToast?.(e instanceof Error ? e.message : 'Erro', 'error');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const enviar = async (channel: 'wa' | 'mail') => {
    if (!clienteIdEfetivo) {
      onToast?.('Escolha o cliente antes de enviar.', 'error');
      return;
    }
    if (!form.itens.length) {
      onToast?.('Inclua ao menos um serviço antes de enviar.', 'error');
      return;
    }
    const cliente = clientes.find((c) => c.id === clienteIdEfetivo);
    if (channel === 'wa' && !cliente?.whatsapp) {
      onToast?.('Este cliente não tem WhatsApp cadastrado.', 'error');
      return;
    }
    if (channel === 'mail' && !cliente?.email) {
      onToast?.('Este cliente não tem e-mail cadastrado.', 'error');
      return;
    }
    const id = await salvar('enviado');
    if (!id) return;
    if (channel === 'wa') {
      openExternal(buildWaMeLink(cliente?.whatsapp, mensagem));
      return;
    }
    try {
      await enviarEmail({
        to: cliente!.email!,
        subject: form.titulo || 'Venda',
        title: form.titulo?.trim() || 'Venda',
        text: mensagem,
      });
      onToast?.('Venda enviada por e-mail pelo No-reply.', 'success');
    } catch (e) {
      onToast?.(
        e instanceof Error ? e.message : 'Venda guardada, mas o e-mail não foi enviado.',
        'error',
      );
    }
  };

  const catsFavoritos = useMemo(
    () => catalogo.filter((c) => favoritos.includes(c.id)),
    [catalogo, favoritos],
  );

  const catsFiltrados = useMemo(() => {
    const q = buscaCatalogo.trim();
    const base = q
      ? catalogo.filter((c) => matchesSearch(c.nome, q))
      : catalogo.filter((c) => !favoritos.includes(c.id));
    return base.slice(0, 24);
  }, [catalogo, buscaCatalogo, favoritos]);

  if (!open) return null;

  return (
    <div
      className="dash-modal-overlay dash-modal-overlay--scrollable"
      onClick={onModalOverlayClick(onClose)}
    >
      <div className="dash-modal dash-modal--orcamento" role="dialog" aria-labelledby="orcamento-titulo">
        <div className="dash-modal__head">
          <div>
            <h2 id="orcamento-titulo">Nova venda</h2>
            <p className="dash-orcamentos__lead">Siga os 3 passos e envie para o cliente.</p>
          </div>
          <button type="button" className="dash-modal__close" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>

        <div className="dash-orcamentos__sheet">
          <section className="dash-orcamentos__passo" aria-labelledby="orc-passo-1">
            <h3 id="orc-passo-1">
              <span className="dash-orcamentos__passo-num" aria-hidden>
                1
              </span>
              Para quem é?
            </h3>
            <label className="dash-event-sheet__field">
              <span>Cliente</span>
              {lockCliente && clienteIdEfetivo ? (
                <strong className="dash-orcamentos__cliente-fix">{nomeClienteExibido}</strong>
              ) : (
                <SearchableSelect
                  options={clienteOptions}
                  value={form.cliente_id}
                  onChange={(v) => setForm({ ...form, cliente_id: v })}
                  placeholder="Escolha o cliente…"
                  searchPlaceholder="Digite o nome do cliente…"
                  aria-label="Cliente"
                />
              )}
            </label>
            {clienteSelecionado && (
              <p className="dash-orcamentos__cliente-hint">
                {clienteSelecionado.whatsapp
                  ? `WhatsApp: ${clienteSelecionado.whatsapp}`
                  : 'Sem WhatsApp cadastrado'}
                {' · '}
                {clienteSelecionado.email ? `E-mail: ${clienteSelecionado.email}` : 'Sem e-mail cadastrado'}
                {clienteSelecionado.pessoa_id || (lockCliente && clientePessoaId)
                  ? ' · Filho de santo — ao guardar, cria cobrança'
                  : ''}
              </p>
            )}
            {lockCliente && clienteIdEfetivo && !clienteSelecionado && (
              <p className="dash-orcamentos__cliente-hint">
                Venda vinculada a este cliente.
                {clientePessoaId ? ' Filho de santo — ao guardar, cria cobrança.' : ''}
              </p>
            )}
            <label className="dash-event-sheet__field">
              <span>Nome da venda (opcional)</span>
              <input
                value={form.titulo}
                onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                placeholder="Ex.: Banho e consulta"
              />
            </label>
          </section>

          <section className="dash-orcamentos__passo" aria-labelledby="orc-passo-2">
            <h3 id="orc-passo-2">
              <span className="dash-orcamentos__passo-num" aria-hidden>
                2
              </span>
              Quais serviços incluir?
            </h3>
            <p className="dash-orcamentos__hint">
              Toque num serviço para adicionar. Use a estrela para fixar os mais usados.
            </p>

            <label className="dash-event-sheet__field">
              <span>Buscar no catálogo</span>
              <input
                type="search"
                value={buscaCatalogo}
                onChange={(e) => setBuscaCatalogo(e.target.value)}
                placeholder="Ex.: banho, consulta, ebó…"
                autoComplete="off"
              />
            </label>

            {catsFavoritos.length > 0 && !buscaCatalogo.trim() && (
              <div className="dash-orcamentos__fav-block">
                <span className="dash-orcamentos__mini-label">Mais usados</span>
                <div className="dash-orcamentos__cats">
                  {catsFavoritos.map((c) => (
                    <div key={c.opcaoKey ?? `${c.id}-${c.nome}`} className="dash-orcamentos__cat">
                      <button type="button" className="dash-btn-secondary dash-btn-min" onClick={() => addItem(c)}>
                        + {c.nome}
                        <span className="dash-orcamentos__cat-valor">{money(c.valor)}</span>
                      </button>
                      <button
                        type="button"
                        className="dash-btn-min dash-orcamentos__fav"
                        onClick={() => toggleFav(c.id)}
                        title="Remover dos favoritos"
                        aria-label={`Remover ${c.nome} dos favoritos`}
                      >
                        ★
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="dash-orcamentos__cats">
              {catsFiltrados.length === 0 ? (
                <p className="dash-muted dash-orcamentos__vazio-cat">
                  {buscaCatalogo.trim()
                    ? 'Nenhum serviço encontrado com esse nome.'
                    : 'Nenhum serviço no catálogo.'}
                </p>
              ) : (
                catsFiltrados.map((c) => (
                  <div key={c.opcaoKey ?? `${c.id}-${c.nome}`} className="dash-orcamentos__cat">
                    <button type="button" className="dash-btn-secondary dash-btn-min" onClick={() => addItem(c)}>
                      + {c.nome}
                      <span className="dash-orcamentos__cat-valor">{money(c.valor)}</span>
                    </button>
                    <button
                      type="button"
                      className="dash-btn-min dash-orcamentos__fav"
                      onClick={() => toggleFav(c.id)}
                      title={favoritos.includes(c.id) ? 'Remover dos favoritos' : 'Fixar nos mais usados'}
                      aria-label={
                        favoritos.includes(c.id)
                          ? `Remover ${c.nome} dos favoritos`
                          : `Fixar ${c.nome} nos favoritos`
                      }
                    >
                      {favoritos.includes(c.id) ? '★' : '☆'}
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="dash-orcamentos__selecionados">
              <span className="dash-orcamentos__mini-label">Nesta venda</span>
              {form.itens.length === 0 ? (
                <p className="dash-orcamentos__vazio-itens">
                  Ainda vazio. Adicione um serviço acima para montar o valor.
                </p>
              ) : (
                <ul className="dash-orcamentos__itens">
                  {form.itens.map((i, idx) => (
                    <li key={`${i.catalogo_id ?? i.nome}-${idx}`}>
                      <div className="dash-orcamentos__item-info">
                        <strong>{i.nome}</strong>
                        <span className="dash-muted">{money(Number(i.valor))} cada</span>
                      </div>
                      <div className="dash-orcamentos__qty" role="group" aria-label={`Quantidade de ${i.nome}`}>
                        <button
                          type="button"
                          className="dash-orcamentos__qty-btn"
                          onClick={() => setQty(idx, Number(i.quantidade || 1) - 1)}
                          aria-label="Diminuir"
                          disabled={Number(i.quantidade || 1) <= 1}
                        >
                          −
                        </button>
                        <span className="dash-orcamentos__qty-val">{i.quantidade || 1}</span>
                        <button
                          type="button"
                          className="dash-orcamentos__qty-btn"
                          onClick={() => setQty(idx, Number(i.quantidade || 1) + 1)}
                          aria-label="Aumentar"
                        >
                          +
                        </button>
                      </div>
                      <strong className="dash-orcamentos__item-subtotal">
                        {money(Number(i.valor) * Number(i.quantidade || 1))}
                      </strong>
                      <button
                        type="button"
                        className="dash-icon-remove"
                        aria-label={`Remover ${i.nome}`}
                        onClick={() => removeItem(idx)}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="dash-orcamentos__total">
                <span>Total</span>
                <strong>{money(total)}</strong>
              </p>
            </div>
          </section>

          <section className="dash-orcamentos__passo" aria-labelledby="orc-passo-3">
            <h3 id="orc-passo-3">
              <span className="dash-orcamentos__passo-num" aria-hidden>
                3
              </span>
              Mensagem para o cliente
            </h3>
            <p className="dash-orcamentos__hint">
              Prévia do texto que será enviado. Atualiza sozinha ao incluir serviços.
            </p>
            <div className="dash-orcamentos__preview" aria-live="polite">
              {mensagem}
            </div>
          </section>

          <div className="dash-orcamentos__footer">
            {canSend && (
              <div className="dash-orcamentos__enviar">
                <p className="dash-orcamentos__mini-label">Enviar agora</p>
                <div className="dash-orcamentos__enviar-btns">
                  <button
                    type="button"
                    className="dash-btn-primary dash-orcamentos__btn-wa"
                    disabled={!podeEnviar || saving}
                    onClick={() => void enviar('wa')}
                    title={!podeEnviar ? 'Escolha o cliente e inclua serviços' : undefined}
                  >
                    Enviar no WhatsApp
                  </button>
                  <button
                    type="button"
                    className="dash-btn-primary"
                    disabled={!podeEnviar || saving}
                    onClick={() => void enviar('mail')}
                    title={!podeEnviar ? 'Escolha o cliente e inclua serviços' : undefined}
                  >
                    Enviar por e-mail
                  </button>
                </div>
                    {!podeEnviar && (
                      <p className="dash-orcamentos__bloqueio">
                        {!clienteIdEfetivo && form.itens.length === 0
                          ? 'Escolha o cliente e inclua ao menos um serviço.'
                          : !clienteIdEfetivo
                            ? 'Escolha o cliente para poder enviar.'
                            : 'Inclua ao menos um serviço para poder enviar.'}
                      </p>
                    )}
              </div>
            )}
            <div className="dash-orcamentos__guardar">
              <p className="dash-orcamentos__mini-label">Ou só guardar</p>
              <div className="dash-orcamentos__guardar-btns">
                <button
                  type="button"
                  className="dash-btn-secondary"
                  disabled={saving}
                  onClick={() => void salvar('rascunho')}
                >
                  Guardar sem enviar
                </button>
                <button
                  type="button"
                  className="dash-btn-secondary"
                  disabled={saving}
                  onClick={() => void salvar('enviado', true)}
                >
                  Guardar e marcar na agenda
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
