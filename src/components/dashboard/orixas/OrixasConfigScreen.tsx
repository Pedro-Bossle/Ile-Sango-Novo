import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import type { Orixa, Qualidade, UUID } from '../../../types/database';
import {
  createOrixa,
  createQualidade,
  deleteOrixa,
  deleteQualidade,
  fetchOrixas,
  fetchQualidadesPorOrixa,
  updateOrixa,
  updateQualidade,
} from '../../../services/orixasQualidades';
import {
  createDigina,
  deleteDigina,
  fetchDiginasPorOrixa,
  updateDigina,
  type DiginaOrisaRow,
} from '../../../services/sobrenomesOrisa';
import { SearchableSelect, type SearchableSelectOption } from '../SearchableSelect';
import { Toast } from '../Toast';
import { onModalOverlayClick } from '../../../utils/modalOverlay';
import { matchesSearch, matchesSearchFields } from '../../../utils/searchFold';

type Aba = 'orixas' | 'qualidades' | 'diginas';

type ModalState =
  | { kind: 'orixa'; id: UUID | null; nome: string }
  | { kind: 'qualidade'; id: Qualidade['id'] | null; nome: string; orixaId: string }
  | { kind: 'digina'; id: string | null; nome: string; orixaId: string; qualidadeId: string }
  | null;

type ConfigCardProps = {
  nome: string;
  meta?: string;
  onEditar: () => void;
  onExcluir: () => void;
  onNomeClick?: () => void;
};

function ConfigCard({ nome, meta, onEditar, onExcluir, onNomeClick }: ConfigCardProps) {
  return (
    <li className="dash-orixa-config__item">
      {onNomeClick ? (
        <button type="button" className="dash-orixa-config__item-main is-clickable" onClick={onNomeClick}>
          <strong className="dash-orixa-config__item-nome">{nome}</strong>
          {meta ? <span className="dash-orixa-config__item-meta">{meta}</span> : null}
        </button>
      ) : (
        <div className="dash-orixa-config__item-main">
          <strong className="dash-orixa-config__item-nome">{nome}</strong>
          {meta ? <span className="dash-orixa-config__item-meta">{meta}</span> : null}
        </div>
      )}
      <div className="dash-orixa-config__item-actions">
        <button type="button" className="dash-orixa-config__btn-edit" onClick={onEditar}>
          Editar
        </button>
        <button type="button" className="dash-orixa-config__btn-delete" onClick={onExcluir}>
          Excluir
        </button>
      </div>
    </li>
  );
}

export function OrixasConfigScreen() {
  const [aba, setAba] = useState<Aba>('orixas');
  const [orixas, setOrixas] = useState<Orixa[]>([]);
  const [qualidades, setQualidades] = useState<Qualidade[]>([]);
  const [diginas, setDiginas] = useState<DiginaOrisaRow[]>([]);
  const [filtroOrixaId, setFiltroOrixaId] = useState('');
  const [busca, setBusca] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; variant: 'success' | 'error' } | null>(null);
  const [modal, setModal] = useState<ModalState>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<
    | { kind: 'orixa'; id: UUID; nome: string }
    | { kind: 'qualidade'; id: Qualidade['id']; nome: string }
    | { kind: 'digina'; id: string; nome: string }
    | null
  >(null);

  const showToast = (msg: string, variant: 'success' | 'error' = 'success') => {
    setToast({ msg, variant });
  };

  const carregarOrixas = useCallback(async () => {
    const data = await fetchOrixas();
    setOrixas(data);
    return data;
  }, []);

  const carregarQualidades = useCallback(async (orixaId: string) => {
    if (!orixaId) {
      setQualidades([]);
      return;
    }
    const data = await fetchQualidadesPorOrixa(orixaId);
    setQualidades(data);
  }, []);

  const carregarDiginas = useCallback(async (orixaId: string) => {
    if (!orixaId) {
      setDiginas([]);
      return;
    }
    const data = await fetchDiginasPorOrixa(orixaId);
    setDiginas(data);
  }, []);

  const carregarTudo = useCallback(async () => {
    setLoading(true);
    try {
      const lista = await carregarOrixas();
      const primeiro = filtroOrixaId || lista[0]?.id || '';
      if (!filtroOrixaId && primeiro) setFiltroOrixaId(String(primeiro));
      const orixaAtivo = filtroOrixaId || primeiro;
      if (orixaAtivo) {
        await Promise.all([carregarQualidades(String(orixaAtivo)), carregarDiginas(String(orixaAtivo))]);
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Erro ao carregar orixás.', 'error');
    } finally {
      setLoading(false);
    }
  }, [carregarDiginas, carregarOrixas, carregarQualidades, filtroOrixaId]);

  useEffect(() => {
    void carregarTudo();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- carga inicial
  }, []);

  useEffect(() => {
    if (!filtroOrixaId) return;
    let cancelled = false;
    (async () => {
      try {
        await Promise.all([carregarQualidades(filtroOrixaId), carregarDiginas(filtroOrixaId)]);
      } catch (e) {
        if (!cancelled) showToast(e instanceof Error ? e.message : 'Erro ao filtrar.', 'error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [carregarDiginas, carregarQualidades, filtroOrixaId]);

  const orixaNomeById = useMemo(() => {
    const map = new Map<string, string>();
    orixas.forEach((o) => map.set(String(o.id), o.nome));
    return map;
  }, [orixas]);

  const qualidadeNomeById = useMemo(() => {
    const map = new Map<string, string>();
    qualidades.forEach((q) => map.set(String(q.id), q.nome));
    return map;
  }, [qualidades]);

  const termo = busca.trim();

  const orixasFiltrados = useMemo(
    () => orixas.filter((o) => matchesSearch(o.nome, termo)),
    [orixas, termo],
  );

  const qualidadesFiltradas = useMemo(
    () => qualidades.filter((q) => matchesSearch(q.nome, termo)),
    [qualidades, termo],
  );

  const diginasFiltradas = useMemo(
    () =>
      diginas.filter((d) => {
        const oNome = orixaNomeById.get(String(d.orixa_id ?? filtroOrixaId)) ?? '';
        const qNome = d.qualidade_id != null ? qualidadeNomeById.get(String(d.qualidade_id)) ?? '' : '';
        return matchesSearchFields(termo, d.nome, oNome, qNome);
      }),
    [diginas, filtroOrixaId, orixaNomeById, qualidadeNomeById, termo],
  );

  const abrirNovo = () => {
    if (aba === 'orixas') {
      setModal({ kind: 'orixa', id: null, nome: '' });
      return;
    }
    if (!filtroOrixaId) {
      showToast('Selecione um orixá primeiro.', 'error');
      return;
    }
    if (aba === 'qualidades') {
      setModal({ kind: 'qualidade', id: null, nome: '', orixaId: filtroOrixaId });
      return;
    }
    setModal({ kind: 'digina', id: null, nome: '', orixaId: filtroOrixaId, qualidadeId: '' });
  };

  const salvarModal = async (e: FormEvent) => {
    e.preventDefault();
    if (!modal) return;
    setSaving(true);
    try {
      if (modal.kind === 'orixa') {
        if (modal.id) {
          await updateOrixa(modal.id, modal.nome);
          showToast('Orixá atualizado.');
        } else {
          const criado = await createOrixa(modal.nome);
          showToast('Orixá adicionado.');
          setFiltroOrixaId(String(criado.id));
        }
        await carregarOrixas();
      } else if (modal.kind === 'qualidade') {
        if (modal.id != null) {
          await updateQualidade(modal.id, modal.nome);
          showToast('Qualidade atualizada.');
        } else {
          await createQualidade(modal.orixaId, modal.nome);
          showToast('Qualidade adicionada.');
        }
        await carregarQualidades(modal.orixaId);
      } else {
        const orixaNome = orixaNomeById.get(String(modal.orixaId)) ?? '';
        const qualidadeNome = modal.qualidadeId
          ? qualidadeNomeById.get(String(modal.qualidadeId)) ?? ''
          : orixaNome;
        if (modal.id) {
          await updateDigina(modal.id, {
            nome: modal.nome,
            qualidadeId: modal.qualidadeId || null,
            qualidadeNome,
            orixaNome,
          });
          showToast('Digina atualizada.');
        } else {
          await createDigina({
            orixaId: modal.orixaId,
            orixaNome,
            qualidadeId: modal.qualidadeId || null,
            qualidadeNome,
            nome: modal.nome,
          });
          showToast('Digina adicionada.');
        }
        await carregarDiginas(modal.orixaId);
      }
      setModal(null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Não foi possível salvar.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const confirmarExclusao = async () => {
    if (!deleteConfirm) return;
    setSaving(true);
    try {
      if (deleteConfirm.kind === 'orixa') {
        await deleteOrixa(deleteConfirm.id);
        showToast('Orixá excluído.');
        const lista = await carregarOrixas();
        if (filtroOrixaId === String(deleteConfirm.id)) {
          setFiltroOrixaId(lista[0] ? String(lista[0].id) : '');
        }
      } else if (deleteConfirm.kind === 'qualidade') {
        await deleteQualidade(deleteConfirm.id);
        showToast('Qualidade excluída.');
        if (filtroOrixaId) await carregarQualidades(filtroOrixaId);
      } else {
        await deleteDigina(deleteConfirm.id);
        showToast('Digina excluída.');
        if (filtroOrixaId) await carregarDiginas(filtroOrixaId);
      }
      setDeleteConfirm(null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Não foi possível excluir.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const tituloAba = aba === 'orixas' ? 'Orixás' : aba === 'qualidades' ? 'Qualidades' : 'Diginas';
  const placeholderBusca =
    aba === 'orixas' ? 'Pesquisar orixá' : aba === 'qualidades' ? 'Pesquisar qualidade' : 'Pesquisar digina';

  const metaDigina = (d: DiginaOrisaRow) => {
    const orixa = orixaNomeById.get(String(d.orixa_id ?? filtroOrixaId)) || '—';
    const qualidade =
      d.qualidade_id != null ? qualidadeNomeById.get(String(d.qualidade_id)) || '—' : null;
    return qualidade ? `${orixa} · ${qualidade}` : orixa;
  };

  const orixaSelectOptions = useMemo(
    (): SearchableSelectOption[] => [
      { value: '', label: 'Selecione…' },
      ...orixas.map((o) => ({ value: String(o.id), label: o.nome })),
    ],
    [orixas],
  );

  const qualidadeSelectOptions = useMemo(
    (): SearchableSelectOption[] => [
      { value: '', label: 'Sem qualidade' },
      ...qualidades.map((q) => ({ value: String(q.id), label: q.nome })),
    ],
    [qualidades],
  );

  return (
    <div className="dash-orixa-config">
      <header className="dash-page-head dash-orixa-config__header">
        <div className="dash-page-head__titles">
          <h1>Orixás</h1>
          <p className="dash-muted">Configure orixás, qualidades e diginas cadastrados no sistema.</p>
        </div>
      </header>

      <div className="dash-orixa-config__tabs" role="tablist" aria-label="Seções de configuração" data-tour="orixas-abas">
        {(
          [
            ['orixas', 'Orixás'],
            ['qualidades', 'Qualidades'],
            ['diginas', 'Diginas'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={aba === id}
            className={`dash-orixa-config__tab ${aba === id ? 'is-active' : ''}`}
            onClick={() => {
              setAba(id);
              setBusca('');
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="dash-orixa-config__toolbar" data-tour="orixas-toolbar">
        {aba !== 'orixas' && (
          <label className="dash-field dash-orixa-config__filtro">
            <span>Orixá</span>
            <SearchableSelect
              options={orixaSelectOptions}
              value={filtroOrixaId}
              onChange={(v) => {
                setFiltroOrixaId(v);
                setBusca('');
              }}
              searchPlaceholder="Buscar orixá…"
              aria-label="Orixá"
            />
          </label>
        )}
        <label className="dash-field dash-orixa-config__busca">
          <span className="dash-visually-hidden">Pesquisar</span>
          <input
            type="search"
            placeholder={placeholderBusca}
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            aria-label={placeholderBusca}
          />
        </label>
        <button type="button" className="dash-add-button" onClick={abrirNovo}>
          Adicionar {tituloAba.slice(0, -1).toLowerCase()}
        </button>
      </div>

      {loading ? (
        <p className="dash-muted">Carregando…</p>
      ) : aba === 'orixas' ? (
        <ul className="dash-orixa-config__list" data-tour="orixas-lista">
          {orixasFiltrados.length === 0 && <li className="dash-orixa-config__empty">Nenhum orixá encontrado.</li>}
          {orixasFiltrados.map((o) => (
            <ConfigCard
              key={o.id}
              nome={o.nome}
              onNomeClick={() => {
                setFiltroOrixaId(String(o.id));
                setAba('qualidades');
                setBusca('');
              }}
              onEditar={() => setModal({ kind: 'orixa', id: o.id, nome: o.nome })}
              onExcluir={() => setDeleteConfirm({ kind: 'orixa', id: o.id, nome: o.nome })}
            />
          ))}
        </ul>
      ) : aba === 'qualidades' ? (
        <ul className="dash-orixa-config__list" data-tour="orixas-lista">
          {!filtroOrixaId && <li className="dash-orixa-config__empty">Selecione um orixá para ver as qualidades.</li>}
          {filtroOrixaId && qualidadesFiltradas.length === 0 && (
            <li className="dash-orixa-config__empty">Nenhuma qualidade cadastrada para este orixá.</li>
          )}
          {qualidadesFiltradas.map((q) => (
            <ConfigCard
              key={String(q.id)}
              nome={q.nome}
              meta={orixaNomeById.get(String(q.orixa_id)) || '—'}
              onEditar={() =>
                setModal({ kind: 'qualidade', id: q.id, nome: q.nome, orixaId: String(q.orixa_id) })
              }
              onExcluir={() => setDeleteConfirm({ kind: 'qualidade', id: q.id, nome: q.nome })}
            />
          ))}
        </ul>
      ) : (
        <ul className="dash-orixa-config__list" data-tour="orixas-lista">
          {!filtroOrixaId && <li className="dash-orixa-config__empty">Selecione um orixá para ver as diginas.</li>}
          {filtroOrixaId && diginasFiltradas.length === 0 && (
            <li className="dash-orixa-config__empty">Nenhuma digina cadastrada para este orixá.</li>
          )}
          {diginasFiltradas.map((d) => (
            <ConfigCard
              key={d.id}
              nome={d.nome}
              meta={metaDigina(d)}
              onEditar={() =>
                setModal({
                  kind: 'digina',
                  id: d.id,
                  nome: d.nome,
                  orixaId: String(d.orixa_id ?? filtroOrixaId),
                  qualidadeId: d.qualidade_id != null ? String(d.qualidade_id) : '',
                })
              }
              onExcluir={() => setDeleteConfirm({ kind: 'digina', id: d.id, nome: d.nome })}
            />
          ))}
        </ul>
      )}

      {modal && (
        <div className="dash-modal-overlay" onClick={onModalOverlayClick(() => setModal(null))}>
          <div className="dash-modal dash-modal--narrow" role="dialog" aria-modal="true">
            <div className="dash-modal__head">
              <h2>
                {modal.kind === 'orixa' && (modal.id ? 'Editar orixá' : 'Adicionar orixá')}
                {modal.kind === 'qualidade' && (modal.id != null ? 'Editar qualidade' : 'Adicionar qualidade')}
                {modal.kind === 'digina' && (modal.id ? 'Editar digina' : 'Adicionar digina')}
              </h2>
              <button type="button" className="dash-modal__close" aria-label="Fechar" onClick={() => setModal(null)}>
                ×
              </button>
            </div>
            <form className="dash-form dash-form--stack" onSubmit={(e) => void salvarModal(e)}>
              {(modal.kind === 'qualidade' || modal.kind === 'digina') && (
                <label className="dash-field">
                  <span>Orixá</span>
                  <SearchableSelect
                    options={orixaSelectOptions}
                    value={modal.orixaId}
                    onChange={(orixaId) => {
                      if (modal.kind === 'qualidade') setModal({ ...modal, orixaId });
                      else setModal({ ...modal, orixaId, qualidadeId: '' });
                      void carregarQualidades(orixaId);
                    }}
                    required
                    searchPlaceholder="Buscar orixá…"
                    aria-label="Orixá"
                  />
                </label>
              )}
              {modal.kind === 'digina' && (
                <label className="dash-field">
                  <span>Qualidade (opcional)</span>
                  <SearchableSelect
                    options={qualidadeSelectOptions}
                    value={modal.qualidadeId}
                    onChange={(qualidadeId) => setModal({ ...modal, qualidadeId })}
                    searchPlaceholder="Buscar qualidade…"
                    aria-label="Qualidade"
                  />
                </label>
              )}
              <label className="dash-field">
                <span>Nome</span>
                <input
                  value={modal.nome}
                  onChange={(e) => setModal({ ...modal, nome: e.target.value })}
                  required
                  autoFocus
                />
              </label>
              <div className="dash-form-actions dash-form-actions--modal-end">
                <button type="button" className="dash-btn-secondary" onClick={() => setModal(null)} disabled={saving}>
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

      {deleteConfirm && (
        <div
          className="dash-modal-overlay"
          onClick={onModalOverlayClick(() => !saving && setDeleteConfirm(null))}
        >
          <div className="dash-modal dash-modal--narrow" role="dialog" aria-modal="true">
            <div className="dash-modal__head">
              <h2>Confirmar exclusão</h2>
              <button
                type="button"
                className="dash-modal__close"
                aria-label="Fechar"
                onClick={() => setDeleteConfirm(null)}
              >
                ×
              </button>
            </div>
            <p>
              Excluir <strong>{deleteConfirm.nome}</strong>? Esta ação não pode ser desfeita.
            </p>
            <div className="dash-form-actions dash-form-actions--modal-end">
              <button
                type="button"
                className="dash-btn-secondary"
                onClick={() => setDeleteConfirm(null)}
                disabled={saving}
              >
                Cancelar
              </button>
              <button type="button" className="dash-btn-danger" onClick={() => void confirmarExclusao()} disabled={saving}>
                {saving ? 'Excluindo…' : 'Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}

      <Toast message={toast?.msg ?? null} variant={toast?.variant} onDismiss={() => setToast(null)} />
    </div>
  );
}
