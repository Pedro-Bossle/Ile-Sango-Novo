import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { writeAuditLog } from '../../../services/auditLog';
import { reorderCatalogoCategorias } from '../../../services/catalogoOrdem';
import {
  parseCatalogoVariacoes,
  serializeCatalogoVariacoes,
  valorMinimoCatalogo,
  type CatalogoVariacao,
} from '../../../utils/catalogoVariacoes';
import { formatMoneyBRL, parseValorInput, sanitizeValorInput, valorToMaskedInput } from '../../../utils/money';
import { matchesSearchFields } from '../../../utils/searchFold';
import { onModalOverlayClick } from '../../../utils/modalOverlay';
import { useConfirmAction } from '../ConfirmActionModal';
import { SearchableSelect, type SearchableSelectOption } from '../SearchableSelect';
import { SortableCategoryList } from '../SortableCategoryList';
import { Toast } from '../Toast';

export type CatalogoRow = {
  id: number;
  nome: string;
  categoria: string;
  valor: number;
  descricao: string;
  variacoes: string;
  ordem?: number;
};

type Props = {
  items: CatalogoRow[];
  onRefresh: () => void;
  canCreate?: boolean;
  canUpdate?: boolean;
  canDelete?: boolean;
};

type CatForm = {
  id: number | null;
  nome: string;
  descricao: string;
  grupo: string;
};

type ItemForm = {
  catalogoId: number | null;
  /** índice na lista de variações; null = novo */
  index: number | null;
  nome: string;
  valor: string;
  nomeOriginal: string;
};

const emptyCat = (): CatForm => ({ id: null, nome: '', descricao: '', grupo: '' });
const emptyItem = (): ItemForm => ({
  catalogoId: null,
  index: null,
  nome: '',
  valor: '',
  nomeOriginal: '',
});

export function CatalogoScreen({
  items,
  onRefresh,
  canCreate = true,
  canUpdate = true,
  canDelete = true,
}: Props) {
  const { ask: askConfirm, modal: confirmModal } = useConfirmAction();
  const [busca, setBusca] = useState('');
  const [filtroGrupo, setFiltroGrupo] = useState('todas');
  const [openIds, setOpenIds] = useState<Set<number>>(() => new Set());
  const [catModal, setCatModal] = useState<CatForm | null>(null);
  const [itemModal, setItemModal] = useState<ItemForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; variant: 'success' | 'error' } | null>(null);
  const [listaLocal, setListaLocal] = useState<CatalogoRow[]>(items);

  useEffect(() => {
    setListaLocal(
      [...items].sort((a, b) => (Number(a.ordem) || 0) - (Number(b.ordem) || 0) || a.id - b.id),
    );
  }, [items]);

  const grupos = useMemo(
    () => [...new Set(listaLocal.map((i) => i.categoria).filter(Boolean))].sort(),
    [listaLocal],
  );

  const grupoOptions: SearchableSelectOption[] = useMemo(
    () => [{ value: 'todas', label: 'Todos os grupos' }, ...grupos.map((g) => ({ value: g, label: g }))],
    [grupos],
  );

  const filtrando = Boolean(busca.trim()) || filtroGrupo !== 'todas';

  const filtrados = useMemo(() => {
    const q = busca.trim();
    return listaLocal.filter((item) => {
      if (filtroGrupo !== 'todas' && item.categoria !== filtroGrupo) return false;
      if (!q) return true;
      const subs = parseCatalogoVariacoes(item.variacoes, item.valor)
        .map((s) => s.nome)
        .join(' ');
      return matchesSearchFields(q, item.nome, item.descricao, item.categoria, subs);
    });
  }, [listaLocal, busca, filtroGrupo]);

  useEffect(() => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const row of items) {
        if (!next.has(row.id)) {
          next.add(row.id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [items]);

  const toggleOpen = (id: number) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const itensDaCategoria = (row: CatalogoRow): CatalogoVariacao[] =>
    parseCatalogoVariacoes(row.variacoes, row.valor);

  const persistCategoria = async (
    row: CatalogoRow,
    nextItens: CatalogoVariacao[],
    patch?: Partial<Pick<CatalogoRow, 'nome' | 'descricao' | 'categoria'>>,
  ) => {
    const valor = nextItens.length
      ? valorMinimoCatalogo(0, nextItens)
      : Number(row.valor) || 0;
    const payload = {
      nome: patch?.nome ?? row.nome,
      descricao: patch?.descricao ?? row.descricao ?? '',
      categoria: patch?.categoria ?? row.categoria ?? row.nome,
      valor,
      variacoes: serializeCatalogoVariacoes(nextItens),
    };
    const { error } = await supabase.from('catalogo').update(payload).eq('id', row.id);
    if (error) throw new Error(error.message);
    await writeAuditLog({
      action: 'update',
      entity: 'catalogo',
      entity_id: row.id,
      resumo: payload.nome,
    });
  };

  const salvarCategoria = async (e: FormEvent) => {
    e.preventDefault();
    if (!catModal?.nome.trim()) return;
    setSaving(true);
    try {
      if (catModal.id) {
        const row = items.find((i) => i.id === catModal.id);
        if (!row) throw new Error('Categoria não encontrada.');
        await persistCategoria(row, itensDaCategoria(row), {
          nome: catModal.nome.trim(),
          descricao: catModal.descricao.trim(),
          categoria: catModal.grupo.trim() || catModal.nome.trim(),
        });
        setToast({ msg: 'Categoria atualizada.', variant: 'success' });
      } else {
        const payload = {
          nome: catModal.nome.trim(),
          descricao: catModal.descricao.trim(),
          categoria: catModal.grupo.trim() || catModal.nome.trim(),
          valor: 0,
          variacoes: '',
          ordem: listaLocal.reduce((m, r) => Math.max(m, Number(r.ordem) || 0), 0) + 1,
        };
        const { data, error } = await supabase.from('catalogo').insert(payload).select('id').single();
        if (error) throw new Error(error.message);
        await writeAuditLog({
          action: 'create',
          entity: 'catalogo',
          entity_id: data?.id,
          resumo: payload.nome,
        });
        if (data?.id) setOpenIds((prev) => new Set(prev).add(Number(data.id)));
        setToast({ msg: 'Categoria criada. Adicione os itens.', variant: 'success' });
      }
      setCatModal(null);
      onRefresh();
    } catch (err) {
      setToast({ msg: err instanceof Error ? err.message : 'Erro ao salvar.', variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const salvarItem = async (e: FormEvent) => {
    e.preventDefault();
    if (!itemModal?.catalogoId || !itemModal.nome.trim()) return;
    const valor = parseValorInput(itemModal.valor);
    if (valor == null) {
      setToast({ msg: 'Informe um valor válido.', variant: 'error' });
      return;
    }
    const row = items.find((i) => i.id === itemModal.catalogoId);
    if (!row) return;
    setSaving(true);
    try {
      const list = [...itensDaCategoria(row)];
      const entry = { nome: itemModal.nome.trim(), valor };
      if (itemModal.index != null && itemModal.index >= 0) {
        list[itemModal.index] = entry;
      } else {
        if (list.some((x) => x.nome.toLowerCase() === entry.nome.toLowerCase())) {
          throw new Error('Já existe um item com esse nome nesta categoria.');
        }
        list.push(entry);
      }
      await persistCategoria(row, list);
      setToast({ msg: itemModal.index != null ? 'Item atualizado.' : 'Item adicionado.', variant: 'success' });
      setItemModal(null);
      setOpenIds((prev) => new Set(prev).add(row.id));
      onRefresh();
    } catch (err) {
      setToast({ msg: err instanceof Error ? err.message : 'Erro ao salvar item.', variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const excluirCategoria = async (row: CatalogoRow) => {
    const ok = await askConfirm({
      title: 'Excluir categoria',
      message: (
        <>
          Excluir <strong>{row.nome}</strong> e todos os itens? Esta ação não pode ser desfeita.
        </>
      ),
      confirmLabel: 'Excluir',
    });
    if (!ok) return;
    const { error } = await supabase
      .from('catalogo')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', row.id);
    if (error) {
      setToast({ msg: error.message, variant: 'error' });
      return;
    }
    await writeAuditLog({ action: 'delete', entity: 'catalogo', entity_id: row.id, resumo: row.nome });
    setToast({ msg: 'Categoria excluída.', variant: 'success' });
    onRefresh();
  };

  const excluirItem = async (row: CatalogoRow, index: number) => {
    const list = itensDaCategoria(row);
    const alvo = list[index];
    if (!alvo) return;
    const ok = await askConfirm({
      title: 'Excluir item',
      message: (
        <>
          Excluir <strong>{alvo.nome}</strong> de {row.nome}?
        </>
      ),
      confirmLabel: 'Excluir',
    });
    if (!ok) return;
    try {
      const next = list.filter((_, i) => i !== index);
      await persistCategoria(row, next);
      setToast({ msg: 'Item excluído.', variant: 'success' });
      onRefresh();
    } catch (err) {
      setToast({ msg: err instanceof Error ? err.message : 'Erro ao excluir.', variant: 'error' });
    }
  };

  const abrirNovoItem = (catalogoId?: number) => {
    if (!canCreate) return;
    const id = catalogoId ?? (filtrados.length === 1 ? filtrados[0].id : null);
    if (!id) {
      setToast({ msg: 'Escolha uma categoria (botão + na categoria) ou crie uma antes.', variant: 'error' });
      return;
    }
    setItemModal({ ...emptyItem(), catalogoId: id });
  };

  return (
    <div className="dash-cat" data-tour="catalogo-lista">
      {confirmModal}
      <Toast message={toast?.msg ?? null} variant={toast?.variant} onDismiss={() => setToast(null)} />

      <header className="dash-page-head dash-cat__head">
        <div className="dash-page-head__titles">
          <h1>Catálogo</h1>
        </div>
        {canCreate && (
          <div className="dash-page-head__actions dash-cat__head-actions">
            <button
              type="button"
              className="dash-btn-secondary"
              data-tour="catalogo-adicionar"
              onClick={() => setCatModal(emptyCat())}
            >
              + Categoria
            </button>
            <button type="button" className="dash-btn-primary" onClick={() => abrirNovoItem()}>
              + Item
            </button>
          </div>
        )}
      </header>

      <div className="dash-cat__filtros" data-tour="catalogo-filtros">
        <input
          type="search"
          className="dash-cat__busca"
          placeholder="Pesquisar categoria ou item…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          aria-label="Pesquisar catálogo"
        />
        <div className="dash-cat__grupo">
          <SearchableSelect
            options={grupoOptions}
            value={filtroGrupo}
            onChange={setFiltroGrupo}
            searchPlaceholder="Buscar grupo…"
            aria-label="Filtrar grupo"
          />
        </div>
      </div>

      {filtrados.length === 0 ? (
        <p className="dash-muted dash-cat__empty">
          {listaLocal.length === 0
            ? 'Nenhuma categoria ainda. Crie a primeira com “+ Categoria”.'
            : 'Nenhum resultado com os filtros atuais.'}
        </p>
      ) : (
        <SortableCategoryList
          className="dash-cat__list"
          items={filtrados}
          disabled={filtrando || !canUpdate}
          onItemsChange={(next) => {
            if (filtrando) return;
            setListaLocal(next);
          }}
          onReorder={(ids) => {
            if (filtrando) return;
            void reorderCatalogoCategorias(ids)
              .then(() => onRefresh())
              .catch((err) => {
                setToast({ msg: err instanceof Error ? err.message : 'Erro ao reordenar.', variant: 'error' });
                onRefresh();
              });
          }}
          itemClassName={(row) => `dash-cat-block${openIds.has(row.id) ? ' is-open' : ''}`}
          renderItem={(row) => {
            const itens = itensDaCategoria(row);
            const aberto = openIds.has(row.id);
            const totalLabel =
              itens.length > 0
                ? `${itens.length} ${itens.length === 1 ? 'item' : 'itens'} · a partir de ${formatMoneyBRL(valorMinimoCatalogo(row.valor, itens))}`
                : Number(row.valor) > 0
                  ? formatMoneyBRL(Number(row.valor))
                  : 'Sem itens';

            return (
              <>
                <div className="dash-cat-block__bar">
                  <button
                    type="button"
                    className="dash-cat-block__toggle"
                    aria-expanded={aberto}
                    onClick={() => toggleOpen(row.id)}
                  >
                    <span className="dash-cat-block__chevron" aria-hidden>
                      {aberto ? '▾' : '▸'}
                    </span>
                    <span className="dash-cat-block__titles">
                      <strong className="dash-cat-block__nome">{row.nome}</strong>
                      <span className="dash-cat-block__meta">
                        {row.descricao ? `${row.descricao} · ` : ''}
                        {totalLabel}
                      </span>
                    </span>
                  </button>
                  <div className="dash-cat-block__actions">
                    {canCreate && (
                      <button
                        type="button"
                        className="dash-cat-icon"
                        title="Adicionar item"
                        aria-label={`Adicionar item em ${row.nome}`}
                        onClick={() => abrirNovoItem(row.id)}
                      >
                        +
                      </button>
                    )}
                    {canUpdate && (
                      <button
                        type="button"
                        className="dash-cat-icon"
                        title="Editar categoria"
                        aria-label={`Editar ${row.nome}`}
                        onClick={() =>
                          setCatModal({
                            id: row.id,
                            nome: row.nome,
                            descricao: row.descricao ?? '',
                            grupo: row.categoria ?? '',
                          })
                        }
                      >
                        ✎
                      </button>
                    )}
                    {canDelete && (
                      <button
                        type="button"
                        className="dash-cat-icon dash-cat-icon--danger"
                        title="Excluir categoria"
                        aria-label={`Excluir ${row.nome}`}
                        onClick={() => void excluirCategoria(row)}
                      >
                        🗑
                      </button>
                    )}
                  </div>
                </div>

                {aberto && (
                  <ul className="dash-cat-block__itens">
                    {itens.length === 0 ? (
                      <li className="dash-cat-block__vazio dash-muted">
                        Nenhum item. Use + para adicionar (ex.: Amor, Dinheiro…).
                      </li>
                    ) : (
                      itens.map((it, idx) => (
                        <li key={`${row.id}-${it.nome}-${idx}`} className="dash-cat-item">
                          <div className="dash-cat-item__info">
                            <strong>{it.nome}</strong>
                            <span>{formatMoneyBRL(it.valor)}</span>
                          </div>
                          <div className="dash-cat-item__actions">
                            {canUpdate && (
                              <button
                                type="button"
                                className="dash-cat-icon"
                                title="Editar item"
                                aria-label={`Editar ${it.nome}`}
                                onClick={() =>
                                  setItemModal({
                                    catalogoId: row.id,
                                    index: idx,
                                    nome: it.nome,
                                    valor: valorToMaskedInput(it.valor),
                                    nomeOriginal: it.nome,
                                  })
                                }
                              >
                                ✎
                              </button>
                            )}
                            {canDelete && (
                              <button
                                type="button"
                                className="dash-cat-icon dash-cat-icon--danger"
                                title="Excluir item"
                                aria-label={`Excluir ${it.nome}`}
                                onClick={() => void excluirItem(row, idx)}
                              >
                                🗑
                              </button>
                            )}
                          </div>
                        </li>
                      ))
                    )}
                  </ul>
                )}
              </>
            );
          }}
        />
      )}

      {catModal && (
        <div
          className="dash-modal-overlay dash-modal-overlay--catalogo"
          onClick={onModalOverlayClick(() => setCatModal(null))}
        >
          <div className="dash-modal dash-modal--catalogo" onClick={(e) => e.stopPropagation()}>
            <header className="dash-modal__head">
              <h2>{catModal.id ? 'Editar categoria' : 'Nova categoria'}</h2>
              <button type="button" className="dash-modal__close" onClick={() => setCatModal(null)} aria-label="Fechar">
                ×
              </button>
            </header>
            <form className="dash-form dash-form--stack" onSubmit={(e) => void salvarCategoria(e)}>
              <label className="dash-field">
                <span>Nome</span>
                <input
                  required
                  placeholder="Ex.: Banho de Ervas"
                  value={catModal.nome}
                  onChange={(e) => setCatModal({ ...catModal, nome: e.target.value })}
                />
              </label>
              <label className="dash-field">
                <span>Descrição</span>
                <textarea
                  rows={2}
                  placeholder="Para X fins — veja as opções de item"
                  value={catModal.descricao}
                  onChange={(e) => setCatModal({ ...catModal, descricao: e.target.value })}
                />
              </label>
              <label className="dash-field">
                <span>Grupo (filtro)</span>
                <input
                  placeholder="Ex.: Banhos"
                  value={catModal.grupo}
                  onChange={(e) => setCatModal({ ...catModal, grupo: e.target.value })}
                />
              </label>
              <div className="dash-form-actions">
                <button type="button" className="dash-btn-secondary" onClick={() => setCatModal(null)} disabled={saving}>
                  Cancelar
                </button>
                <button type="submit" className="dash-btn-primary" disabled={saving}>
                  {saving ? 'Salvando…' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {itemModal && (
        <div
          className="dash-modal-overlay dash-modal-overlay--catalogo"
          onClick={onModalOverlayClick(() => setItemModal(null))}
        >
          <div className="dash-modal dash-modal--catalogo dash-modal--narrow" onClick={(e) => e.stopPropagation()}>
            <header className="dash-modal__head">
              <div>
                <h2>{itemModal.index != null ? 'Editar item' : 'Novo item'}</h2>
                <p className="dash-muted">
                  {items.find((i) => i.id === itemModal.catalogoId)?.nome || 'Categoria'}
                </p>
              </div>
              <button type="button" className="dash-modal__close" onClick={() => setItemModal(null)} aria-label="Fechar">
                ×
              </button>
            </header>
            <form className="dash-form dash-form--stack" onSubmit={(e) => void salvarItem(e)}>
              <label className="dash-field">
                <span>Nome do item</span>
                <input
                  required
                  placeholder="Ex.: Amor"
                  value={itemModal.nome}
                  onChange={(e) => setItemModal({ ...itemModal, nome: e.target.value })}
                />
              </label>
              <label className="dash-field">
                <span>Valor</span>
                <input
                  required
                  inputMode="decimal"
                  placeholder="R$ 0,00"
                  value={itemModal.valor}
                  onChange={(e) =>
                    setItemModal({ ...itemModal, valor: sanitizeValorInput(e.target.value) })
                  }
                />
              </label>
              <div className="dash-form-actions">
                <button type="button" className="dash-btn-secondary" onClick={() => setItemModal(null)} disabled={saving}>
                  Cancelar
                </button>
                <button type="submit" className="dash-btn-primary" disabled={saving}>
                  {saving ? 'Salvando…' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
