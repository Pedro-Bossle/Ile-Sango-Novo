import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchPessoasLista, deletePessoa, fetchReferenciasPerfilMembro } from '../../../services/membros';
import {
  deleteCobranca,
  fetchCobrancasComMembros,
  pessoaEstaDevendo,
  updateCobranca,
  type CobrancaComMembro,
} from '../../../services/cobrancas';
import { fetchPessoasOptions } from '../../../services/pessoasLookup';
import type { UUID } from '../../../types/database';
import { resolvePessoaIdCobranca } from '../../../types/database';
import { useMemberForm } from '../../../hooks/useMemberForm';
import { Toast } from '../Toast';
import { PessoaisSection } from './PessoaisSection';
import { OrixasSection } from './OrixasSection';
import { OrumaleSection } from './OrumaleSection';
import { ExusSection } from './ExusSection';
import { UmbandaSection } from './UmbandaSection';
import { CobrancaForm, type CobrancaFormValues } from '../cobrancas/CobrancaForm';
import { CobrancasReadOnlySummary } from './CobrancasReadOnlySummary';
import type { PessoaListaItem } from '../../../services/membros';
import { PerfilImpressao } from './PerfilImpressao';
import { formatarTelefoneMascara, somenteDigitosTelefone } from '../../../utils/telefone';
import { fetchHistoricoOrumale, type HistoricoOrumaleItem } from '../../../services/orumaleHistorico';
import { gerarPdfPerfil } from '../../../services/gerarPdfPerfil';
import { carregarLogoBase64 } from '../../../utils/logoBase64';
import { formatDateBR } from '../../../utils/formatDate';
import { PaginationControls } from '../PaginationControls';

const BUSCA_MEMBROS_PLACEHOLDER = 'Pesquisar por nome, orisá de cabeça ou telefone';

type View = 'list' | 'form';
type SortKey = 'nome' | 'telefone' | 'orixa' | 'situacao';

function defaultDirFor(key: SortKey): 'asc' | 'desc' {
  if (key === 'situacao') return 'desc';
  return 'asc';
}

export function MembrosScreen() {
  const [view, setView] = useState<View>('list');
  const [editId, setEditId] = useState<UUID | null>(null);
  const [lista, setLista] = useState<PessoaListaItem[]>([]);
  const [cobrancas, setCobrancas] = useState<CobrancaComMembro[]>([]);
  const [cobrancaFormOpen, setCobrancaFormOpen] = useState(false);
  const [cobrancaEditing, setCobrancaEditing] = useState<CobrancaComMembro | null>(null);
  const [cobrancaDelete, setCobrancaDelete] = useState<CobrancaComMembro | null>(null);
  const [loadingLista, setLoadingLista] = useState(true);
  const [toast, setToast] = useState<{ msg: string; variant: 'success' | 'error' } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<UUID | null>(null);
  const [busca, setBusca] = useState('');
  const [qualidadeNomeById, setQualidadeNomeById] = useState<Record<string, string>>({});
  const [sobrenomeNomeById, setSobrenomeNomeById] = useState<Record<string, string>>({});
  const [historicoOrumaleById, setHistoricoOrumaleById] = useState<Record<string, HistoricoOrumaleItem[]>>({});
  const [pdfLoading, setPdfLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(() => Number(localStorage.getItem('membros_page_size') || '20'));
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'nome', dir: 'asc' });

  const reloadAll = useCallback(async () => {
    setLoadingLista(true);
    try {
      const [p, c] = await Promise.all([fetchPessoasLista(), fetchCobrancasComMembros()]);
      setLista(p);
      setCobrancas(c);
    } catch (e) {
      setToast({ msg: e instanceof Error ? e.message : 'Erro ao carregar membros.', variant: 'error' });
    } finally {
      setLoadingLista(false);
    }
  }, []);

  const salvarCobrancaPerfil = async (values: CobrancaFormValues) => {
    if (!cobrancaEditing) return;
    const opts = await fetchPessoasOptions();
    const p = opts.find((x) => x.id === values.pessoa_id);
    const nome = p?.nome ?? '';
    if (!nome) {
      setToast({ msg: 'Membro não encontrado.', variant: 'error' });
      return;
    }
    await updateCobranca(cobrancaEditing.id, {
      pessoa_id: values.pessoa_id,
      membro_nome: nome,
      valor: values.valor,
      data: values.data,
      descricao: values.descricao || null,
      tipo: values.tipo,
    });
    setToast({ msg: 'Cobrança atualizada.', variant: 'success' });
    await reloadAll();
    setCobrancaEditing(null);
  };

  const confirmDeleteCobranca = async () => {
    if (!cobrancaDelete) return;
    try {
      await deleteCobranca(cobrancaDelete.id);
      setCobrancaDelete(null);
      setToast({ msg: 'Cobrança excluída.', variant: 'success' });
      await reloadAll();
    } catch (e) {
      setToast({ msg: e instanceof Error ? e.message : 'Erro ao excluir.', variant: 'error' });
    }
  };

  useEffect(() => {
    reloadAll();
  }, [reloadAll]);

  const afterSave = useCallback(async () => {
    await reloadAll();
    setView('list');
    setEditId(null);
    setToast({ msg: 'Membro salvo com sucesso', variant: 'success' });
  }, [reloadAll]);

  const form = useMemberForm(editId, afterSave);

  const cobrancasDoPerfil = useMemo(() => {
    if (!editId) return [];
    return cobrancas.filter((c) => String(resolvePessoaIdCobranca(c)) === String(editId));
  }, [cobrancas, editId]);

  const listaFiltrada = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return lista;
    const qDigitos = somenteDigitosTelefone(q);
    return lista.filter((m) => {
      const base = `${m.nome} ${m.contato ?? ''} ${m.orixa_cabeca_nome ?? ''}`.toLowerCase();
      const contatoDigits = somenteDigitosTelefone(m.contato);
      return base.includes(q) || (qDigitos.length > 0 && contatoDigits.includes(qDigitos));
    });
  }, [lista, busca]);

  const listaOrdenada = useMemo(() => {
    const out = [...listaFiltrada];
    out.sort((a, b) => {
      const dirMul = sort.dir === 'asc' ? 1 : -1;
      const statusA = pessoaEstaDevendo(a.id, cobrancas) ? 1 : 0;
      const statusB = pessoaEstaDevendo(b.id, cobrancas) ? 1 : 0;
      switch (sort.key) {
        case 'nome':
          return dirMul * a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' });
        case 'telefone':
          return (
            dirMul *
            (somenteDigitosTelefone(a.contato).localeCompare(somenteDigitosTelefone(b.contato), 'pt-BR', {
              sensitivity: 'base',
            }))
          );
        case 'orixa':
          return dirMul * (a.orixa_cabeca_nome ?? '').localeCompare(b.orixa_cabeca_nome ?? '', 'pt-BR', { sensitivity: 'base' });
        case 'situacao':
          return dirMul * (statusA - statusB);
        default:
          return 0;
      }
    });
    return out;
  }, [listaFiltrada, sort, cobrancas]);

  const totalMembros = listaOrdenada.length;
  const membrosPaginados = useMemo(() => {
    const start = (page - 1) * pageSize;
    return listaOrdenada.slice(start, start + pageSize);
  }, [listaOrdenada, page, pageSize]);

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(totalMembros / pageSize));
    if (page > totalPages) setPage(totalPages);
  }, [totalMembros, page, pageSize]);

  useEffect(() => {
    localStorage.setItem('membros_page_size', String(pageSize));
  }, [pageSize]);

  useEffect(() => {
    setPage(1);
  }, [busca, sort.key, sort.dir]);

  const onSort = (key: SortKey) => {
    setSort((s) => {
      if (s.key === key) return { key, dir: s.dir === 'asc' ? 'desc' : 'asc' };
      return { key, dir: defaultDirFor(key) };
    });
  };

  const openCreate = () => {
    setEditId(null);
    // Evita reaproveitar estado do último cadastro quando editId já era null.
    form.resetForm();
    setView('form');
  };

  const openEdit = (id: UUID) => {
    setEditId(id);
    setView('form');
  };

  const backToList = () => {
    setView('list');
    setEditId(null);
    form.setError(null);
    setCobrancaFormOpen(false);
    setCobrancaEditing(null);
    setCobrancaDelete(null);
  };

  const handleDelete = async (id: UUID) => {
    try {
      await deletePessoa(id);
      if (String(editId) === String(id)) {
        backToList();
      } else {
        setDeleteConfirm(null);
      }
      await reloadAll();
      setToast({ msg: 'Membro excluído.', variant: 'success' });
    } catch (e) {
      setToast({ msg: e instanceof Error ? e.message : 'Não foi possível excluir.', variant: 'error' });
    }
  };

  const handlePessoaisChange = (
    field: 'nome' | 'dataNascimento' | 'contato' | 'email' | 'signo' | 'obs',
    value: string,
  ) => {
    if (field === 'nome') form.setNome(value);
    if (field === 'dataNascimento') form.setDataNascimento(value);
    if (field === 'contato') form.setContato(somenteDigitosTelefone(value));
    if (field === 'email') form.setEmail(value);
    if (field === 'signo') form.setSigno(value);
    if (field === 'obs') form.setObs(value);
  };

  useEffect(() => {
    let cancelled = false;
    // Reúne referências de IDs para imprimir nomes em vez de IDs na versão de impressão.
    const qualidadeIds = [
      form.cadastro.qualidade_cabeca_id,
      form.cadastro.qualidade_corpo_id,
      form.cadastro.qualidade_passagem_id,
      form.cadastro.qualidade_saida_id,
      ...form.orumale.map((r) => r.qualidade_id),
    ];
    const sobrenomeIds = [
      form.cadastro.sobrenome_orisa_cabeca_id,
      form.cadastro.sobrenome_orisa_corpo_id,
      form.cadastro.sobrenome_orisa_passagem_id,
      form.cadastro.sobrenome_orisa_saida_id,
      ...form.orumale.map((r) => r.sobrenome_orisa_id),
    ];

    void fetchReferenciasPerfilMembro(qualidadeIds, sobrenomeIds)
      .then((refs) => {
        if (!cancelled) {
          setQualidadeNomeById(refs.qualidades);
          setSobrenomeNomeById(refs.sobrenomes);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setQualidadeNomeById({});
          setSobrenomeNomeById({});
        }
      });

    return () => {
      cancelled = true;
    };
  }, [form.cadastro, form.orumale]);

  useEffect(() => {
    let cancelled = false;
    const ids = form.orumale.map((r) => String(r.id ?? '')).filter(Boolean);
    if (ids.length === 0) {
      setHistoricoOrumaleById({});
      return;
    }
    void Promise.all(ids.map((id) => fetchHistoricoOrumale(id).then((items) => ({ id, items }))))
      .then((pairs) => {
        if (cancelled) return;
        const map: Record<string, HistoricoOrumaleItem[]> = {};
        for (const pair of pairs) map[pair.id] = pair.items;
        setHistoricoOrumaleById(map);
      })
      .catch(() => {
        if (!cancelled) setHistoricoOrumaleById({});
      });
    return () => {
      cancelled = true;
    };
  }, [form.orumale]);

  const handleSalvarPdf = () => {
    setPdfLoading(true);
    void carregarLogoBase64()
      .then(async (logoBase64) => {
        // Recarrega referências no momento do clique para evitar nomes desatualizados no PDF.
        const qualidadeIds = [
          form.cadastro.qualidade_cabeca_id,
          form.cadastro.qualidade_corpo_id,
          form.cadastro.qualidade_passagem_id,
          form.cadastro.qualidade_saida_id,
          ...form.orumale.map((r) => r.qualidade_id),
        ];
        const sobrenomeIds = [
          form.cadastro.sobrenome_orisa_cabeca_id,
          form.cadastro.sobrenome_orisa_corpo_id,
          form.cadastro.sobrenome_orisa_passagem_id,
          form.cadastro.sobrenome_orisa_saida_id,
          ...form.orumale.map((r) => r.sobrenome_orisa_id),
        ];
        const refs = await fetchReferenciasPerfilMembro(qualidadeIds, sobrenomeIds);
        return { logoBase64, refs };
      })
      .then(({ logoBase64, refs }) => {
        const orixaNomeById = new Map(form.orixas.map((o) => [String(o.id), o.nome]));
        const toBloco = (orixaId: string, qualidadeId: string, sobrenomeId: string, digina: string, reza: string) => ({
          orisa: orixaNomeById.get(String(orixaId)) ?? '—',
          qualidade: refs.qualidades[String(qualidadeId)] ?? '—',
          sobrenome: refs.sobrenomes[String(sobrenomeId)] ?? '—',
          digina: digina || '—',
          reza: reza || '—',
        });
        const orunmila = form.orumale.map((row) => ({
          orisa: orixaNomeById.get(String(row.orixa_id)) ?? '—',
          qualidade: refs.qualidades[String(row.qualidade_id)] ?? '—',
          sobrenome: refs.sobrenomes[String(row.sobrenome_orisa_id)] ?? '—',
          digina: row.digina || '—',
          feitura: formatDateBR(row.data_feitura),
          historico: (row.id ? historicoOrumaleById[row.id] ?? [] : []).map((h) => ({
            data: formatDateBR(h.data),
            descricao: h.descricao,
          })),
        }));
        const cobrancasPdf = cobrancasDoPerfil.map((c) => ({
          nome: c.membro_nome || form.nome || '—',
          data: formatDateBR(c.vencimento ?? null),
          descricao: c.descricao || c.tipo || 'Sem descrição',
          valor: Number(c.valor_total ?? c.valor ?? 0),
        }));
        const totalDevido = cobrancasPdf.reduce((acc, c) => acc + c.valor, 0);

        gerarPdfPerfil({
          nome: form.nome || '—',
          nascimento: formatDateBR(form.dataNascimento),
          signo: form.signo || '—',
          telefone: formatarTelefoneMascara(form.contato),
          email: form.email || '—',
          observacoes: form.obs || '—',
          cabeca: {
            ...toBloco(
              form.cadastro.orixa_cabeca_id,
              form.cadastro.qualidade_cabeca_id,
              form.cadastro.sobrenome_orisa_cabeca_id,
              form.cadastro.digina_cabeca,
              form.cadastro.orixa_cabeca_reza,
            ),
            dataBori: formatDateBR(form.cadastro.data_feitura_bori),
          },
          corpo: toBloco(
            form.cadastro.orixa_corpo_id,
            form.cadastro.qualidade_corpo_id,
            form.cadastro.sobrenome_orisa_corpo_id,
            form.cadastro.digina_corpo,
            form.cadastro.orixa_corpo_reza,
          ),
          passagem: toBloco(
            form.cadastro.orixa_passagem_id,
            form.cadastro.qualidade_passagem_id,
            form.cadastro.sobrenome_orisa_passagem_id,
            form.cadastro.digina_passagem,
            form.cadastro.orixa_passagem_reza,
          ),
          saida: toBloco(
            form.cadastro.orixa_saida_id,
            form.cadastro.qualidade_saida_id,
            form.cadastro.sobrenome_orisa_saida_id,
            form.cadastro.digina_saida,
            form.cadastro.orixa_saida_reza,
          ),
          orunmila,
          exus: form.exus.map((e) => ({ nome: e.exu_nome || '—', feitura: formatDateBR(e.data_feitura) })),
          entidades: form.umbanda.map((u) => ({ nome: u.umbanda_nome || '—', feitura: formatDateBR(u.data_feitura) })),
          cobrancas: cobrancasPdf,
          totalDevido,
          logoBase64,
        });
      })
      .catch((e) => {
        setToast({ msg: e instanceof Error ? e.message : 'Erro ao gerar PDF.', variant: 'error' });
      })
      .finally(() => {
        setPdfLoading(false);
      });
  };

  if (view === 'form') {
    return (
      <>
        <Toast message={toast?.msg ?? null} variant={toast?.variant} onDismiss={() => setToast(null)} />
        <div className="dash-split-main">
          <div className="dash-split-main__bar">
            <button type="button" className="dash-btn-secondary" onClick={backToList}>
              ← Voltar à lista
            </button>
            <h1 className="dash-split-main__title">{editId ? 'Editar membro' : 'Novo membro'}</h1>
            {editId && (
              <div className="dash-split-main__bar-actions no-print">
                <button
                  type="button"
                  className="dash-btn-secondary btn-imprimir"
                  onClick={handleSalvarPdf}
                  disabled={pdfLoading}
                >
                  {pdfLoading ? 'Gerando PDF…' : '🖨 Salvar PDF'}
                </button>
                <button type="button" className="dash-btn-danger-outline" onClick={() => setDeleteConfirm(editId)}>
                  Excluir membro
                </button>
              </div>
            )}
          </div>

          {form.error && <p className="dash-error">{form.error}</p>}
          {form.loadingMeta || form.loadingPessoa ? (
            <p>Carregando formulário…</p>
          ) : (
            <form
              className="dash-member-form"
              onSubmit={(e) => {
                e.preventDefault();
                void form.submit();
              }}
            >
              <PessoaisSection
                nome={form.nome}
                dataNascimento={form.dataNascimento}
                contato={form.contato}
                email={form.email}
                signo={form.signo}
                obs={form.obs}
                onChange={handlePessoaisChange}
              />
              <OrixasSection orixas={form.orixas} cadastro={form.cadastro} setCadastroField={form.setCadastroField} />
              <OrumaleSection
                orixas={form.orixas}
                rows={form.orumale}
                addRow={form.addOrumale}
                removeRow={form.removeOrumale}
                updateRow={form.updateOrumale}
              />
              <ExusSection
                rows={form.exus}
                addRow={form.addExu}
                removeRow={form.removeExu}
                updateRow={form.updateExu}
              />
              <UmbandaSection
                rows={form.umbanda}
                addRow={form.addUmbanda}
                removeRow={form.removeUmbanda}
                updateRow={form.updateUmbanda}
              />
              {editId && (
                <CobrancasReadOnlySummary
                  cobrancas={cobrancasDoPerfil}
                  onEdit={(c) => {
                    setCobrancaEditing(c);
                    setCobrancaFormOpen(true);
                  }}
                  onDelete={setCobrancaDelete}
                />
              )}
              <div className="dash-form-actions">
                <button type="button" className="dash-btn-secondary" onClick={backToList}>
                  Cancelar
                </button>
                <button type="submit" className="dash-btn-primary" disabled={form.saving}>
                  {form.saving ? 'Salvando…' : 'Salvar membro'}
                </button>
              </div>
            </form>
          )}
        </div>
        <PerfilImpressao
          nome={form.nome}
          dataNascimento={form.dataNascimento}
          contatoFormatado={formatarTelefoneMascara(form.contato)}
          email={form.email}
          signo={form.signo}
          obs={form.obs}
          orixas={form.orixas}
          cadastro={form.cadastro}
          orumale={form.orumale}
          exus={form.exus}
          umbanda={form.umbanda}
          cobrancas={cobrancasDoPerfil}
          qualidadeNomeById={qualidadeNomeById}
          sobrenomeNomeById={sobrenomeNomeById}
        />

        <CobrancaForm
          open={cobrancaFormOpen}
          initial={cobrancaEditing}
          onClose={() => {
            setCobrancaFormOpen(false);
            setCobrancaEditing(null);
          }}
          onSave={salvarCobrancaPerfil}
        />

        {cobrancaDelete && (
          <div className="dash-modal-overlay" role="dialog" aria-modal="true">
            <div className="dash-modal dash-modal--narrow">
              <h2>Excluir cobrança?</h2>
              <p>Esta ação não pode ser desfeita.</p>
              <div className="dash-form-actions">
                <button type="button" className="dash-btn-secondary" onClick={() => setCobrancaDelete(null)}>
                  Cancelar
                </button>
                <button type="button" className="dash-btn-danger" onClick={() => void confirmDeleteCobranca()}>
                  Excluir
                </button>
              </div>
            </div>
          </div>
        )}

        {deleteConfirm && (
          <div className="dash-modal-overlay" role="dialog" aria-modal="true">
            <div className="dash-modal dash-modal--narrow">
              <h2>Excluir membro?</h2>
              <p>Esta ação não pode ser desfeita.</p>
              <div className="dash-form-actions">
                <button type="button" className="dash-btn-secondary" onClick={() => setDeleteConfirm(null)}>
                  Cancelar
                </button>
                <button type="button" className="dash-btn-danger" onClick={() => void handleDelete(deleteConfirm)}>
                  Excluir
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <Toast message={toast?.msg ?? null} variant={toast?.variant} onDismiss={() => setToast(null)} />
      <h1>Membros</h1>
      <div className="dash-section-header">
        <div className="dash-filtros">
          <input
            placeholder={BUSCA_MEMBROS_PLACEHOLDER}
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            aria-label={BUSCA_MEMBROS_PLACEHOLDER}
          />
        </div>
        <button type="button" className="dash-add-button" onClick={openCreate}>
          Adicionar membro
        </button>
      </div>

      <div className="dash-filtros-mobile">
        <input
          placeholder={BUSCA_MEMBROS_PLACEHOLDER}
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          aria-label={BUSCA_MEMBROS_PLACEHOLDER}
        />
      </div>

      {loadingLista ? (
        <p>Carregando…</p>
      ) : (
        <>
          <div className="dash-table-scroll">
            <table className="dash-table dash-table--membros">
              <thead>
                <tr>
                  <th scope="col" aria-sort={sort.key === 'nome' ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                    <button type="button" className="dash-th-sort" onClick={() => onSort('nome')} title="Ordenar por membro">
                      <span>Membro</span>
                      <span className="dash-th-sort__icons" aria-hidden>
                        {sort.key === 'nome' ? (sort.dir === 'asc' ? '▲' : '▼') : '⇅'}
                      </span>
                    </button>
                  </th>
                  <th scope="col" aria-sort={sort.key === 'telefone' ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                    <button type="button" className="dash-th-sort" onClick={() => onSort('telefone')} title="Ordenar por telefone">
                      <span>Telefone</span>
                      <span className="dash-th-sort__icons" aria-hidden>
                        {sort.key === 'telefone' ? (sort.dir === 'asc' ? '▲' : '▼') : '⇅'}
                      </span>
                    </button>
                  </th>
                  <th scope="col" aria-sort={sort.key === 'orixa' ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                    <button type="button" className="dash-th-sort" onClick={() => onSort('orixa')} title="Ordenar por orisá de cabeça">
                      <span>Orisá cabeça</span>
                      <span className="dash-th-sort__icons" aria-hidden>
                        {sort.key === 'orixa' ? (sort.dir === 'asc' ? '▲' : '▼') : '⇅'}
                      </span>
                    </button>
                  </th>
                  <th scope="col" aria-sort={sort.key === 'situacao' ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                    <button type="button" className="dash-th-sort" onClick={() => onSort('situacao')} title="Ordenar por situação">
                      <span>Situação</span>
                      <span className="dash-th-sort__icons" aria-hidden>
                        {sort.key === 'situacao' ? (sort.dir === 'asc' ? '▲' : '▼') : '⇅'}
                      </span>
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {membrosPaginados.map((m) => {
                  const devendo = pessoaEstaDevendo(m.id, cobrancas);
                  return (
                    <tr
                      key={m.id}
                      className="dash-row-clickable"
                      role="button"
                      tabIndex={0}
                      onClick={() => openEdit(m.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          openEdit(m.id);
                        }
                      }}
                      aria-label={`Abrir perfil de ${m.nome}`}
                    >
                      <td>{m.nome}</td>
                      <td>{m.contato ? formatarTelefoneMascara(m.contato) : '—'}</td>
                      <td>{m.orixa_cabeca_nome || '—'}</td>
                      <td>
                        <span className={`dash-badge ${devendo ? 'dash-badge--devendo' : 'dash-badge--ok'}`}>
                          {devendo ? 'Devendo' : 'Em dia'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <PaginationControls
            totalItems={totalMembros}
            currentPage={page}
            pageSize={pageSize}
            onPageChange={(p) => {
              setPage(p);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onPageSizeChange={setPageSize}
          />
        </>
      )}
    </>
  );
}
