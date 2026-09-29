import { useCallback, useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  createCaixaCategoria,
  createCaixaManual,
  fetchCaixaCategorias,
  fetchCaixaPeriodo,
  fetchCaixaSaldoAntes,
  reorderCaixaCategorias,
  softDeleteCaixa,
  softDeleteCaixaCategoria,
  updateCaixaManual,
  type CaixaCategoria,
  type CaixaLancamento,
} from '../../../services/caixa';
import { writeAuditLog, buildAuditDiff } from '../../../services/auditLog';
import { formatDateBR } from '../../../utils/formatDate';
import { parseValorInput, sanitizeValorInput, valorToMaskedInput } from '../../../utils/money';
import { matchesSearchFields } from '../../../utils/searchFold';
import { gerarPdfRelatorio } from '../../../utils/pdfRelatorio';
import { carregarLogoBase64 } from '../../../utils/logoBase64';
import { fetchConfigIle, formatarEnderecoIle } from '../../../services/configIle';
import { onModalOverlayClick } from '../../../utils/modalOverlay';
import { useConfirmAction } from '../ConfirmActionModal';
import { SearchableSelect, type SearchableSelectOption } from '../SearchableSelect';
import { SortableCategoryList } from '../SortableCategoryList';
import { Toast } from '../Toast';
import { FORMA_PAGAMENTO_PADRAO, FORMAS_PAGAMENTO } from '../../../lib/formasPagamento';

const CAIXA_TIPO_OPTIONS: SearchableSelectOption[] = [
  { value: 'entrada', label: 'Entrada' },
  { value: 'saida', label: 'Saída' },
];

const CAIXA_FIELD_LABELS: Record<string, string> = {
  data: 'Data',
  tipo: 'Tipo',
  categoria: 'Categoria',
  descricao: 'Descrição',
  valor: 'Valor',
  forma_pagamento: 'Tipo de pagamento',
};

const MESES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

function money(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

type Draft = {
  id?: string;
  data: string;
  tipo: 'entrada' | 'saida';
  categoria: string;
  descricao: string;
  valor: string;
  forma_pagamento: string;
};

type Props = { canCreate?: boolean; canDelete?: boolean; canUpdate?: boolean };

type SortKey = 'data' | 'tipo' | 'categoria' | 'pgto' | 'descricao' | 'valor';

function sortCaixaItems(items: CaixaLancamento[], key: SortKey, dir: 'asc' | 'desc') {
  const mul = dir === 'asc' ? 1 : -1;
  return [...items].sort((a, b) => {
    let cmp = 0;
    switch (key) {
      case 'data':
        cmp = a.data.localeCompare(b.data);
        break;
      case 'tipo':
        cmp = a.tipo.localeCompare(b.tipo);
        break;
      case 'categoria':
        cmp = (a.categoria || '').localeCompare(b.categoria || '', 'pt-BR', { sensitivity: 'base' });
        break;
      case 'pgto':
        cmp = (a.forma_pagamento || '').localeCompare(b.forma_pagamento || '', 'pt-BR', {
          sensitivity: 'base',
        });
        break;
      case 'descricao': {
        const da = (a.descricao || a.membro_nome || '').toLowerCase();
        const db = (b.descricao || b.membro_nome || '').toLowerCase();
        cmp = da.localeCompare(db, 'pt-BR');
        break;
      }
      case 'valor':
        cmp = Number(a.valor) - Number(b.valor);
        break;
      default:
        cmp = 0;
    }
    if (cmp !== 0) return cmp * mul;
    return a.id.localeCompare(b.id) * mul;
  });
}

function SortTh({
  label,
  sortKey,
  activeKey,
  dir,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  dir: 'asc' | 'desc';
  onSort: (key: SortKey) => void;
}) {
  const active = activeKey === sortKey;
  return (
    <th scope="col" aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className="dash-th-sort" onClick={() => onSort(sortKey)} title={`Ordenar por ${label.toLowerCase()}`}>
        <span>{label}</span>
        <span className="dash-th-sort__icons" aria-hidden>
          {active ? (dir === 'asc' ? '▲' : '▼') : '↕'}
        </span>
      </button>
    </th>
  );
}

export function FinanceiroScreen({ canCreate = true, canDelete = true, canUpdate = true }: Props) {
  const yearNow = new Date().getFullYear();
  const [ano, setAno] = useState(yearNow);
  const [busca, setBusca] = useState('');
  const [filtroCat, setFiltroCat] = useState('');
  const [rows, setRows] = useState<CaixaLancamento[]>([]);
  const [saldoAnterior, setSaldoAnterior] = useState(0);
  const [categorias, setCategorias] = useState<CaixaCategoria[]>([]);
  const [toast, setToast] = useState<{ msg: string; variant: 'success' | 'error' } | null>(null);
  const [sheet, setSheet] = useState(false);
  const { ask: askConfirm, modal: confirmModal } = useConfirmAction();
  const [catsOpen, setCatsOpen] = useState(false);
  const [novaCat, setNovaCat] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'data', dir: 'desc' });
  const [ileNome, setIleNome] = useState('Ilê');
  const [ileLogo, setIleLogo] = useState<string | null>(null);
  const [ileEndereco, setIleEndereco] = useState('');
  const [draft, setDraft] = useState<Draft>({
    data: new Date().toISOString().slice(0, 10),
    tipo: 'entrada',
    categoria: '',
    descricao: '',
    valor: '',
    forma_pagamento: FORMA_PAGAMENTO_PADRAO,
  });

  const from = `${ano}-01-01`;
  const to = `${ano}-12-31`;

  const reload = useCallback(async () => {
    try {
      const [caixa, saldo, cats] = await Promise.all([
        fetchCaixaPeriodo(from, to),
        fetchCaixaSaldoAntes(from),
        fetchCaixaCategorias(),
      ]);
      setRows(caixa);
      setSaldoAnterior(saldo);
      setCategorias(cats);
      setDraft((d) => (d.categoria ? d : { ...d, categoria: cats[0]?.nome ?? 'Outro' }));
    } catch (e) {
      setToast({ msg: e instanceof Error ? e.message : 'Erro', variant: 'error' });
    }
  }, [from, to]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    fetchConfigIle()
      .then(async (c) => {
        setIleNome(c.nome_ile?.trim() || 'Ilê');
        setIleEndereco(formatarEnderecoIle(c));
        if (c.logo_base64) setIleLogo(c.logo_base64);
        else setIleLogo(await carregarLogoBase64());
      })
      .catch(() => {
        void carregarLogoBase64().then(setIleLogo);
      });
  }, []);

  const filtrados = useMemo(() => {
    const q = busca.trim();
    return rows.filter((r) => {
      if (filtroCat && r.categoria !== filtroCat) return false;
      if (!q) return true;
      return matchesSearchFields(q, r.descricao, r.categoria, r.forma_pagamento, r.membro_nome);
    });
  }, [rows, busca, filtroCat]);

  const kpis = useMemo(() => {
    const entradas = filtrados.filter((r) => r.tipo === 'entrada').reduce((a, r) => a + Number(r.valor), 0);
    const saidas = filtrados.filter((r) => r.tipo === 'saida').reduce((a, r) => a + Number(r.valor), 0);
    const resultado = entradas - saidas;
    return {
      restante: saldoAnterior,
      entradas,
      saidas,
      resultado,
      saldoAtual: saldoAnterior + resultado,
    };
  }, [filtrados, saldoAnterior]);

  const porMes = useMemo(() => {
    const map = new Map<string, CaixaLancamento[]>();
    for (const r of filtrados) {
      const key = r.data.slice(0, 7);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [filtrados]);

  useEffect(() => {
    if (!porMes.length) return;
    setExpanded((prev) => {
      if (Object.keys(prev).length) return prev;
      const next: Record<string, boolean> = {};
      porMes.forEach(([k], i) => {
        next[k] = i === 0;
      });
      return next;
    });
  }, [porMes]);

  const onSort = (key: SortKey) => {
    setSort((s) => {
      if (s.key === key) return { key, dir: s.dir === 'asc' ? 'desc' : 'asc' };
      return { key, dir: key === 'data' || key === 'valor' ? 'desc' : 'asc' };
    });
  };

  const abrirNovo = () => {
    setDraft({
      data: new Date().toISOString().slice(0, 10),
      tipo: 'entrada',
      categoria: categorias[0]?.nome ?? 'Outro',
      descricao: '',
      valor: '',
      forma_pagamento: FORMA_PAGAMENTO_PADRAO,
    });
    setSheet(true);
  };

  const abrirEditar = (r: CaixaLancamento) => {
    setDraft({
      id: r.id,
      data: r.data,
      tipo: r.tipo,
      categoria: r.categoria,
      descricao: r.descricao ?? '',
      valor: valorToMaskedInput(r.valor),
      forma_pagamento: r.forma_pagamento || FORMA_PAGAMENTO_PADRAO,
    });
    setSheet(true);
  };

  const excluirLancamento = async (r: CaixaLancamento) => {
    const label = r.descricao || r.membro_nome || r.categoria;
    const vinculadoPagamento = Boolean(r.pagamento_id);
    const vinculadoMensalidade =
      Boolean(r.mensalidade_id) ||
      /Mensalidade\s+[A-Za-zÇç]{3}\/\d{4}/i.test(String(r.descricao ?? '')) ||
      String(r.categoria ?? '').toLowerCase() === 'mensalidade' ||
      r.origem === 'mensalidade';
    const ok = await askConfirm({
      title: 'Confirmar exclusão',
      message: (
        <>
          Excluir o lançamento <strong>{label}</strong>?
          {vinculadoPagamento
            ? ' Isso também remove o pagamento do histórico da cobrança e recalcula a quitação.'
            : null}
          {vinculadoMensalidade ? ' A mensalidade ligada voltará para em aberto.' : null}
        </>
      ),
      confirmLabel: 'Excluir',
    });
    if (!ok) return;
    try {
      setRows((prev) => prev.filter((x) => x.id !== r.id));
      await softDeleteCaixa(r.id);
      const before = {
        data: r.data,
        tipo: r.tipo,
        categoria: r.categoria,
        descricao: r.descricao,
        valor: r.valor,
      };
      await writeAuditLog({
        action: 'delete',
        entity: 'caixa_lancamentos',
        entity_id: r.id,
        resumo: r.descricao ?? r.categoria,
        diff: buildAuditDiff('Fluxo de caixa', before, null, CAIXA_FIELD_LABELS),
      });
      await reload();
      setToast({ msg: 'Lançamento excluído.', variant: 'success' });
    } catch (err) {
      setToast({ msg: err instanceof Error ? err.message : 'Erro', variant: 'error' });
      await reload();
    }
  };

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        data: draft.data,
        tipo: draft.tipo,
        categoria: draft.categoria || 'Outro',
        descricao: draft.descricao.trim(),
        valor: parseValorInput(draft.valor) ?? 0,
        forma_pagamento: draft.forma_pagamento || FORMA_PAGAMENTO_PADRAO,
      };
      if (!payload.descricao) throw new Error('Informe a descrição.');
      if (draft.id) {
        const prev = rows.find((x) => x.id === draft.id);
        const before = prev
          ? {
              data: prev.data,
              tipo: prev.tipo,
              categoria: prev.categoria,
              descricao: prev.descricao,
              valor: prev.valor,
            }
          : null;
        await updateCaixaManual(draft.id, payload);
        await writeAuditLog({
          action: 'update',
          entity: 'caixa_lancamentos',
          entity_id: draft.id,
          resumo: payload.descricao,
          diff: buildAuditDiff('Fluxo de caixa', before, payload, CAIXA_FIELD_LABELS),
        });
      } else {
        await createCaixaManual(payload);
        await writeAuditLog({
          action: 'create',
          entity: 'caixa_lancamentos',
          resumo: payload.descricao,
          diff: buildAuditDiff('Fluxo de caixa', null, payload, CAIXA_FIELD_LABELS),
        });
      }
      setSheet(false);
      await reload();
      setToast({ msg: 'Lançamento salvo.', variant: 'success' });
    } catch (err) {
      setToast({ msg: err instanceof Error ? err.message : 'Erro', variant: 'error' });
    }
  };

  const exportExcel = () => {
    const header = ['Data', 'Tipo', 'Categoria', 'Pgto', 'Descrição', 'Valor', 'Origem', 'Membro'];
    const body = filtrados.map((r) => [
      r.data,
      r.tipo,
      r.categoria,
      r.forma_pagamento ?? '',
      r.descricao ?? '',
      Number(r.valor),
      r.origem,
      r.membro_nome ?? '',
    ]);
    const ws = XLSX.utils.aoa_to_sheet([header, ...body]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Caixa ${ano}`);
    XLSX.writeFile(wb, `caixa_${ano}.xlsx`);
  };

  const exportPdf = () => {
    gerarPdfRelatorio({
      periodo: { de: from, ate: to },
      tituloPrincipal: `Fluxo de caixa — ${ano}`,
      subtitulo: `Entradas ${money(kpis.entradas)} · Saídas ${money(kpis.saidas)} · Resultado ${money(kpis.resultado)}`,
      total: kpis.resultado,
      totalLabel: 'Resultado do período',
      ileNome,
      ileEndereco,
      logoBase64: ileLogo,
      variante: 'caixa',
      fileNamePrefix: `fluxo-caixa-${ano}`,
      linhas: filtrados.map((r) => ({
        nome: r.categoria || '—',
        data: formatDateBR(r.data),
        descricao: (r.descricao ?? r.membro_nome ?? '').trim() || '—',
        valor: Number(r.valor) || 0,
        tipo: r.tipo,
        forma: r.forma_pagamento?.trim() || '—',
      })),
    });
  };

  const catsFiltradas = categorias.filter(
    (c) => c.tipo === 'ambos' || c.tipo === draft.tipo || !draft.tipo,
  );

  const anoOptions = useMemo(
    (): SearchableSelectOption[] =>
      [yearNow, yearNow - 1, yearNow - 2, yearNow - 3].map((y) => ({ value: String(y), label: String(y) })),
    [yearNow],
  );

  const categoriaFiltroOptions = useMemo(
    (): SearchableSelectOption[] => categorias.map((c) => ({ value: c.nome, label: c.nome })),
    [categorias],
  );

  const categoriaDraftOptions = useMemo(
    (): SearchableSelectOption[] => catsFiltradas.map((c) => ({ value: c.nome, label: c.nome })),
    [catsFiltradas],
  );

  return (
    <div className="dash-caixa" data-tour="financeiro-caixa">
      <Toast message={toast?.msg ?? null} variant={toast?.variant} onDismiss={() => setToast(null)} />
      {confirmModal}

      <header className="dash-page-head dash-caixa__header" data-tour="caixa-header">
        <div className="dash-page-head__titles">
          <h1>Fluxo de caixa</h1>
          <p className="dash-muted">Entradas, saídas e relatórios financeiros do terreiro.</p>
        </div>
        {canCreate && (
          <div className="dash-page-head__actions">
            <button type="button" className="dash-btn-primary" data-tour="caixa-novo" onClick={abrirNovo}>
              + Novo lançamento
            </button>
          </div>
        )}
      </header>

      <div className="dash-toolbar dash-caixa__toolbar" data-tour="caixa-toolbar">
        <input
          className="dash-caixa__busca"
          placeholder="Buscar descrição, categoria…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <SearchableSelect
          options={anoOptions}
          value={String(ano)}
          onChange={(v) => setAno(Number(v))}
          aria-label="Ano"
        />
        <SearchableSelect
          options={categoriaFiltroOptions}
          value={filtroCat}
          onChange={setFiltroCat}
          placeholder="Categorias"
          allowClear
          searchPlaceholder="Buscar categoria…"
          aria-label="Categoria"
        />
        <div className="dash-caixa__tools">
          <button type="button" className="dash-add-button dash-add-button--secondary" onClick={exportExcel}>
            Excel
          </button>
          <button type="button" className="dash-add-button dash-add-button--secondary" onClick={exportPdf}>
            PDF
          </button>
          <button type="button" className="dash-add-button dash-add-button--secondary" onClick={() => setCatsOpen(true)}>
            Categorias
          </button>
        </div>
      </div>

      <div className="dash-grid-stats dash-caixa__kpis" data-tour="caixa-kpis">
        <article className="dash-card">
          <h3>Restante de {ano - 1}</h3>
          <p className="dash-big dash-big--money">{money(kpis.restante)}</p>
        </article>
        <article className="dash-card">
          <h3>Total de entradas</h3>
          <p className="dash-big dash-big--money dash-caixa__in">{money(kpis.entradas)}</p>
        </article>
        <article className="dash-card">
          <h3>Total de saídas</h3>
          <p className="dash-big dash-big--money dash-caixa__out">{money(kpis.saidas)}</p>
        </article>
        <article className="dash-card">
          <h3>Resultado do período</h3>
          <p className="dash-big dash-big--money">{money(kpis.resultado)}</p>
        </article>
        <article className="dash-card">
          <h3>Saldo atual do caixa</h3>
          <p className="dash-big dash-big--money">{money(kpis.saldoAtual)}</p>
        </article>
      </div>

      <div className="dash-caixa__month-controls" data-tour="caixa-meses">
        <span className="dash-muted">Meses: mais recentes</span>
        <button
          type="button"
          className="dash-btn-min"
          onClick={() => {
            const next: Record<string, boolean> = {};
            porMes.forEach(([k]) => {
              next[k] = true;
            });
            setExpanded(next);
          }}
        >
          Expandir todos
        </button>
        <button
          type="button"
          className="dash-btn-min"
          onClick={() => {
            const next: Record<string, boolean> = {};
            porMes.forEach(([k]) => {
              next[k] = false;
            });
            setExpanded(next);
          }}
        >
          Fechar todos
        </button>
      </div>

      {porMes.map(([ym, items]) => {
        const [y, m] = ym.split('-').map(Number);
        const open = expanded[ym] ?? false;
        const sortedItems = sortCaixaItems(items, sort.key, sort.dir);
        const ent = items.filter((i) => i.tipo === 'entrada').reduce((a, i) => a + Number(i.valor), 0);
        const sai = items.filter((i) => i.tipo === 'saida').reduce((a, i) => a + Number(i.valor), 0);
        return (
          <section key={ym} className="dash-caixa__month">
            <button
              type="button"
              className="dash-caixa__month-head"
              onClick={() => setExpanded((p) => ({ ...p, [ym]: !open }))}
              aria-expanded={open}
            >
              <strong>
                {MESES[m - 1]} de {y} ({items.length} lançamento{items.length === 1 ? '' : 's'})
              </strong>
              <span>
                <span className="dash-caixa__in">{money(ent)}</span>
                {' · '}
                <span className="dash-caixa__out">{money(sai)}</span>
              </span>
            </button>
            {open && (
              <div className="dash-table-scroll">
                <table className="dash-table dash-caixa__table">
                  <thead>
                    <tr>
                      <SortTh label="Data" sortKey="data" activeKey={sort.key} dir={sort.dir} onSort={onSort} />
                      <SortTh label="Tipo" sortKey="tipo" activeKey={sort.key} dir={sort.dir} onSort={onSort} />
                      <SortTh label="Categoria" sortKey="categoria" activeKey={sort.key} dir={sort.dir} onSort={onSort} />
                      <SortTh label="Pgto" sortKey="pgto" activeKey={sort.key} dir={sort.dir} onSort={onSort} />
                      <SortTh label="Descrição" sortKey="descricao" activeKey={sort.key} dir={sort.dir} onSort={onSort} />
                      <SortTh label="Valor" sortKey="valor" activeKey={sort.key} dir={sort.dir} onSort={onSort} />
                      <th scope="col" className="dash-th-static">
                        Ações
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedItems.map((r) => (
                      <tr key={r.id}>
                        <td>{formatDateBR(r.data)}</td>
                        <td>
                          <span className={r.tipo === 'entrada' ? 'dash-caixa__badge-in' : 'dash-caixa__badge-out'}>
                            {r.tipo === 'entrada' ? 'Entrada' : 'Saída'}
                          </span>
                        </td>
                        <td>{r.categoria}</td>
                        <td>{r.forma_pagamento?.trim() || '—'}</td>
                        <td>{r.descricao || r.membro_nome || '—'}</td>
                        <td className={r.tipo === 'entrada' ? 'dash-caixa__in' : 'dash-caixa__out'}>
                          {r.tipo === 'entrada' ? '+ ' : '− '}
                          {money(Number(r.valor))}
                        </td>
                        <td>
                          <div className="dash-caixa__row-actions">
                            {canUpdate && (
                              <button
                                type="button"
                                className="dash-icon-action dash-icon-action--edit"
                                onClick={() => abrirEditar(r)}
                                title="Editar"
                                aria-label="Editar lançamento"
                              >
                                ✎
                              </button>
                            )}
                            {canDelete && (
                              <button
                                type="button"
                                className="dash-icon-action dash-icon-action--danger"
                                title="Excluir"
                                aria-label="Excluir lançamento"
                                onClick={() => void excluirLancamento(r)}
                              >
                                🗑
                              </button>
                            )}
                            {!canUpdate && !canDelete && <span className="dash-muted">—</span>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}
      {!porMes.length && <p className="dash-muted">Nenhum lançamento no período.</p>}

      {sheet && (
        <div className="dash-modal-overlay" onClick={onModalOverlayClick(() => setSheet(false))}>
          <div className="dash-modal dash-modal--caixa-lanc" role="dialog" aria-modal="true">
            <div className="dash-modal__head">
              <div>
                <h2>{draft.id ? 'Editar lançamento' : 'Novo lançamento'}</h2>
                <p className="dash-muted">Movimentação do caixa do terreiro.</p>
              </div>
              <button type="button" className="dash-modal__close" onClick={() => setSheet(false)} aria-label="Fechar">
                ×
              </button>
            </div>
            <form className="dash-caixa-lanc-form" onSubmit={salvar}>
              <div className="dash-event-sheet__row">
                <label className="dash-event-sheet__field">
                  <span>Tipo</span>
                  <SearchableSelect
                    options={CAIXA_TIPO_OPTIONS}
                    value={draft.tipo}
                    onChange={(v) => setDraft({ ...draft, tipo: v as 'entrada' | 'saida' })}
                    aria-label="Tipo"
                  />
                </label>
                <label className="dash-event-sheet__field">
                  <span>Categoria</span>
                  <SearchableSelect
                    options={categoriaDraftOptions}
                    value={draft.categoria}
                    onChange={(v) => setDraft({ ...draft, categoria: v })}
                    searchPlaceholder="Buscar categoria…"
                    aria-label="Categoria"
                  />
                </label>
              </div>
              <label className="dash-event-sheet__field">
                <span>Descrição *</span>
                <input
                  required
                  placeholder="Ex.: Compra de insumos para a hospitalaria"
                  value={draft.descricao}
                  onChange={(e) => setDraft({ ...draft, descricao: e.target.value })}
                />
              </label>
              <div className="dash-event-sheet__row">
                <label className="dash-event-sheet__field">
                  <span>Valor</span>
                  <input
                    required
                    inputMode="decimal"
                    value={draft.valor}
                    onChange={(e) => setDraft({ ...draft, valor: sanitizeValorInput(e.target.value) })}
                    placeholder="R$ 0,00"
                  />
                </label>
                <label className="dash-event-sheet__field">
                  <span>Data</span>
                  <input type="date" required value={draft.data} onChange={(e) => setDraft({ ...draft, data: e.target.value })} />
                </label>
              </div>
              <label className="dash-event-sheet__field">
                <span>Tipo de pagamento</span>
                <select
                  value={draft.forma_pagamento}
                  onChange={(e) => setDraft({ ...draft, forma_pagamento: e.target.value })}
                  aria-label="Tipo de pagamento"
                >
                  {FORMAS_PAGAMENTO.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="dash-form-actions dash-form-actions--modal-end">
                <button type="button" className="dash-btn-secondary" onClick={() => setSheet(false)}>
                  Cancelar
                </button>
                <button type="submit" className="dash-btn-primary">
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {catsOpen && (
        <div className="dash-modal-overlay" onClick={onModalOverlayClick(() => setCatsOpen(false))}>
          <div className="dash-modal dash-modal--narrow" role="dialog">
            <div className="dash-modal__head">
              <h2>Categorias</h2>
              <button type="button" className="dash-modal__close" onClick={() => setCatsOpen(false)}>
                ×
              </button>
            </div>
            <p className="dash-muted" style={{ padding: '0 1rem', margin: '0 0 0.5rem' }}>
              Arraste para reordenar. A ordem vale nos filtros e lançamentos.
            </p>
            <SortableCategoryList
              className="dash-caixa-cats-list"
              items={categorias}
              onItemsChange={setCategorias}
              onReorder={(ids) =>
                reorderCaixaCategorias(ids).catch((err) => {
                  setToast({ msg: err instanceof Error ? err.message : 'Erro ao reordenar.', variant: 'error' });
                  void reload();
                })
              }
              renderItem={(c) => (
                <>
                  <span>{c.nome}</span>
                  <button
                    type="button"
                    className="dash-btn-min"
                    onClick={() =>
                      void (async () => {
                        const ok = await askConfirm({
                          title: 'Confirmar exclusão',
                          message: (
                            <>
                              Remover a categoria <strong>{c.nome}</strong>?
                            </>
                          ),
                          confirmLabel: 'Remover',
                          confirmingLabel: 'Removendo…',
                        });
                        if (!ok) return;
                        void softDeleteCaixaCategoria(c.id)
                          .then(reload)
                          .catch((err) => setToast({ msg: err instanceof Error ? err.message : 'Erro', variant: 'error' }));
                      })()
                    }
                  >
                    Remover
                  </button>
                </>
              )}
            />
            <form
              className="dash-caixa-cats-add"
              onSubmit={(e) => {
                e.preventDefault();
                void createCaixaCategoria(novaCat)
                  .then(() => {
                    setNovaCat('');
                    return reload();
                  })
                  .catch((err) => setToast({ msg: err instanceof Error ? err.message : 'Erro', variant: 'error' }));
              }}
            >
              <input
                placeholder="Nova categoria"
                value={novaCat}
                onChange={(e) => setNovaCat(e.target.value)}
                required
              />
              <button type="submit" className="dash-btn-primary">
                Adicionar
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
