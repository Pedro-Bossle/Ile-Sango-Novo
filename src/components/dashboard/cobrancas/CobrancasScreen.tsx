import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  cobrancaPassaFiltroIntervalo,
  deleteCobranca,
  fetchRelatorioValoresPagos,
  fetchCobrancasComMembros,
  filtroPeriodoVazio,
  insertCobranca,
  isCobrancaPendente,
  isMensalidadeTipo,
  registrarPagamento,
  updateCobranca,
  valorSaldoCobranca,
  type CobrancaComMembro,
  type FiltroPeriodoCobranca,
  type LinhaRelatorioValoresPagos,
} from '../../../services/cobrancas';
import { fetchPessoasOptions } from '../../../services/pessoasLookup';
import { formatDateBR } from '../../../utils/formatDate';
import { gerarPdfRelatorio, type LinhaRelatorio } from '../../../utils/pdfRelatorio';
import { Toast } from '../Toast';
import { CobrancaForm, type CobrancaFormValues } from './CobrancaForm';
import { CobrancasTable } from './CobrancasTable';
import { PaginationControls } from '../PaginationControls';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { resolvePessoaIdCobranca, type CobrancaTipo } from '../../../types/database';

type LenisLike = {
  stop?: () => void;
  start?: () => void;
};

export function CobrancasScreen() {
  const [rows, setRows] = useState<CobrancaComMembro[]>([]);
  const [loading, setLoading] = useState(true);
  const [rascunhoPeriodo, setRascunhoPeriodo] = useState<FiltroPeriodoCobranca>(filtroPeriodoVazio);
  const [periodoAplicado, setPeriodoAplicado] = useState<FiltroPeriodoCobranca | null>(null);
  const [toast, setToast] = useState<{ msg: string; variant: 'success' | 'error' } | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CobrancaComMembro | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CobrancaComMembro | null>(null);
  const [buscaMembro, setBuscaMembro] = useState('');
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(() => Number(localStorage.getItem('cobrancas_page_size') || '20'));
  const [bulkValues, setBulkValues] = useState<{
    tipo: CobrancaFormValues['tipo'];
    data: string;
    valor: string;
    descricao: string;
  }>({
    tipo: 'mensalidade',
    data: '',
    valor: '50.00',
    descricao: '',
  });
  const [mostrarPagas, setMostrarPagas] = useState(() => localStorage.getItem('cobrancas_mostrar_pagas') !== 'false');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkActionOpen, setBulkActionOpen] = useState<'pagar' | 'excluir' | null>(null);
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const [bulkPagamentoData, setBulkPagamentoData] = useState(new Date().toISOString().slice(0, 10));
  const [bulkPagamentoForma, setBulkPagamentoForma] = useState('PIX');
  const [reportOpen, setReportOpen] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportRows, setReportRows] = useState<LinhaRelatorioValoresPagos[]>([]);
  const [reportFiltro, setReportFiltro] = useState<{
    de: string;
    ate: string;
    pessoaId: string;
    tipo: CobrancaTipo | '';
  }>({
    de: '',
    ate: '',
    pessoaId: '',
    tipo: '',
  });

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchCobrancasComMembros();
      setRows(data);
    } catch (e) {
      setToast({ msg: e instanceof Error ? e.message : 'Erro ao carregar cobranças.', variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const filtered = useMemo(() => {
    let list = rows;
    if (!mostrarPagas) {
      list = list.filter((c) => isCobrancaPendente(c));
    }
    if (periodoAplicado?.de && periodoAplicado?.ate) {
      list = list.filter((c) => cobrancaPassaFiltroIntervalo(c, periodoAplicado));
    }
    const q = buscaMembro.trim().toLowerCase();
    if (q) {
      list = list.filter((c) => {
        const nome = (c.membro_nome || c.membro || '').toLowerCase();
        return nome.includes(q);
      });
    }
    return list;
  }, [rows, mostrarPagas, periodoAplicado, buscaMembro]);

  const totalCobrancas = filtered.length;
  const cobrancasPaginadas = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(totalCobrancas / pageSize));
    if (page > totalPages) setPage(totalPages);
  }, [totalCobrancas, page, pageSize]);

  useEffect(() => {
    localStorage.setItem('cobrancas_page_size', String(pageSize));
  }, [pageSize]);

  useEffect(() => {
    setPage(1);
  }, [buscaMembro, periodoAplicado?.de, periodoAplicado?.ate, mostrarPagas]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [page, pageSize, buscaMembro, periodoAplicado?.de, periodoAplicado?.ate, mostrarPagas]);

  useEffect(() => {
    localStorage.setItem('cobrancas_mostrar_pagas', mostrarPagas ? 'true' : 'false');
  }, [mostrarPagas]);

  useEffect(() => {
    const w = window as Window & { __lenis?: LenisLike | null };
    const lenis = w.__lenis;
    if (!lenis) return;

    if (reportOpen) {
      lenis.stop?.();
    } else {
      lenis.start?.();
    }

    return () => {
      lenis.start?.();
    };
  }, [reportOpen]);

  /** Soma dos saldos em aberto respeitando a mesma lista filtrada da tabela (período + nome). */
  const subtotalAberto = useMemo(() => {
    return filtered.filter((c) => isCobrancaPendente(c)).reduce((a, c) => a + valorSaldoCobranca(c), 0);
  }, [filtered]);

  const formatBRL = (n: number) =>
    n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });

  const montarLinhasPdf = (lista: CobrancaComMembro[]): LinhaRelatorio[] => {
    return lista
      .filter((c) => isCobrancaPendente(c))
      .map((c) => ({
        nome: c.membro_nome,
        data: formatDateBR(c.vencimento ?? c.created_at?.slice(0, 10) ?? null),
        descricao: c.descricao || '—',
        valor: valorSaldoCobranca(c),
        tipo: c.tipo,
      }));
  };

  const aplicarFiltro = () => {
    const { de, ate } = rascunhoPeriodo;
    if (!de || !ate) {
      setToast({ msg: 'Preencha data inicial e final.', variant: 'error' });
      return;
    }
    if (de > ate) {
      setToast({ msg: 'A data inicial não pode ser maior que a final.', variant: 'error' });
      return;
    }
    setPeriodoAplicado({ de, ate });
  };

  const limparFiltros = () => {
    setRascunhoPeriodo(filtroPeriodoVazio());
    setPeriodoAplicado(null);
    setBuscaMembro('');
    setPage(1);
  };

  const openNovo = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (c: CobrancaComMembro) => {
    setEditing(c);
    setFormOpen(true);
  };

  const salvar = async (values: CobrancaFormValues) => {
    const opts = await fetchPessoasOptions();
    const p = opts.find((x) => x.id === values.pessoa_id);
    const nome = p?.nome ?? '';
    if (!nome) {
      setToast({ msg: 'Membro não encontrado.', variant: 'error' });
      return;
    }
    if (editing) {
      await updateCobranca(editing.id, {
        pessoa_id: values.pessoa_id,
        membro_nome: nome,
        valor: values.valor,
        data: values.data,
        descricao: values.descricao || null,
        tipo: values.tipo,
      });
      setToast({ msg: 'Cobrança atualizada.', variant: 'success' });
    } else {
      await insertCobranca({
        pessoa_id: values.pessoa_id,
        membro_nome: nome,
        valor: values.valor,
        data: values.data,
        descricao: values.descricao || null,
        tipo: values.tipo,
      });
      setToast({ msg: 'Cobrança criada.', variant: 'success' });
    }
    await reload();
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteCobranca(deleteTarget.id);
      setDeleteTarget(null);
      setToast({ msg: 'Cobrança excluída.', variant: 'success' });
      await reload();
    } catch (e) {
      setToast({ msg: e instanceof Error ? e.message : 'Erro ao excluir.', variant: 'error' });
    }
  };

  const gerarRelatorioPorNome = () => {
    if (!buscaMembro.trim()) {
      setToast({ msg: 'Digite um nome na pesquisa antes de gerar o relatório por nome.', variant: 'error' });
      return;
    }
    const linhas = montarLinhasPdf(filtered);
    const total = linhas.reduce((a, b) => a + b.valor, 0);
    gerarPdfRelatorio({
      periodo: periodoAplicado,
      linhas,
      total,
      tituloPrincipal: 'Relatório por nome — saldos em aberto',
      subtitulo: `Pesquisa: “${buscaMembro.trim()}”.`,
    });
  };

  const gerarRelatorioMensalidadesAberto = () => {
    const linhas = montarLinhasPdf(filtered.filter((c) => isMensalidadeTipo(c)));
    const total = linhas.reduce((a, b) => a + b.valor, 0);
    gerarPdfRelatorio({
      periodo: periodoAplicado,
      linhas,
      total,
      tituloPrincipal: 'Mensalidades em aberto',
      subtitulo: 'Apenas cobranças do tipo Mensalidade com saldo pendente (filtros atuais).',
    });
  };

  const abrirCobrancaEmMassa = () => {
    setBulkOpen(true);
  };

  const criarCobrancaParaTodos = async () => {
    const data = bulkValues.data.trim();
    const valor = Number(bulkValues.valor);
    if (!data) {
      setToast({ msg: 'Informe o vencimento para cobrança em massa.', variant: 'error' });
      return;
    }
    if (!Number.isFinite(valor) || valor <= 0) {
      setToast({ msg: 'Informe um valor válido maior que zero.', variant: 'error' });
      return;
    }

    setBulkSaving(true);
    try {
      const pessoas = await fetchPessoasOptions();
      if (!pessoas.length) {
        setToast({ msg: 'Não há membros para cobrar.', variant: 'error' });
        return;
      }

      for (const p of pessoas) {
        await insertCobranca({
          pessoa_id: p.id,
          membro_nome: p.nome,
          valor,
          data,
          descricao: bulkValues.descricao.trim() || null,
          tipo: bulkValues.tipo,
        });
      }

      setToast({ msg: `Cobrança criada para ${pessoas.length} membro(s).`, variant: 'success' });
      setBulkOpen(false);
      await reload();
    } catch (e) {
      setToast({ msg: e instanceof Error ? e.message : 'Erro ao criar cobrança em massa.', variant: 'error' });
    } finally {
      setBulkSaving(false);
    }
  };

  const selectedRows = useMemo(() => rows.filter((r) => selectedIds.has(String(r.id))), [rows, selectedIds]);

  const toggleSelect = (id: string | number, checked: boolean) => {
    const key = String(id);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const toggleSelectAllVisible = (ids: Array<string | number>, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => {
        const key = String(id);
        if (checked) next.add(key);
        else next.delete(key);
      });
      return next;
    });
  };

  const executarExcluirEmLote = async () => {
    if (!selectedRows.length) return;
    setBulkActionLoading(true);
    try {
      for (const row of selectedRows) {
        await deleteCobranca(row.id);
      }
      setToast({ msg: `${selectedRows.length} cobrança(s) excluída(s) com sucesso.`, variant: 'success' });
      setSelectedIds(new Set());
      setBulkActionOpen(null);
      await reload();
    } catch (e) {
      setToast({ msg: e instanceof Error ? e.message : 'Erro ao excluir em lote.', variant: 'error' });
    } finally {
      setBulkActionLoading(false);
    }
  };

  const executarPagarEmLote = async () => {
    if (!selectedRows.length) return;
    if (!bulkPagamentoData) {
      setToast({ msg: 'Informe a data de pagamento.', variant: 'error' });
      return;
    }
    const pendentes = selectedRows.filter((r) => isCobrancaPendente(r));
    if (!pendentes.length) {
      setToast({ msg: 'Nenhuma cobrança pendente selecionada para pagamento.', variant: 'error' });
      return;
    }
    setBulkActionLoading(true);
    try {
      for (const row of pendentes) {
        const pessoaId = resolvePessoaIdCobranca(row);
        const saldo = valorSaldoCobranca(row);
        if (!pessoaId || saldo <= 0) continue;
        await registrarPagamento(row.id, pessoaId, saldo, bulkPagamentoData, bulkPagamentoForma);
      }
      setToast({ msg: `${pendentes.length} cobrança(s) marcada(s) como paga(s).`, variant: 'success' });
      setSelectedIds(new Set());
      setBulkActionOpen(null);
      await reload();
    } catch (e) {
      setToast({ msg: e instanceof Error ? e.message : 'Erro ao pagar cobranças em lote.', variant: 'error' });
    } finally {
      setBulkActionLoading(false);
    }
  };

  const carregarRelatorioValoresPagos = async () => {
    if (!reportFiltro.de || !reportFiltro.ate) {
      setToast({ msg: 'Informe o período para gerar o relatório de valores pagos.', variant: 'error' });
      return;
    }
    if (reportFiltro.de > reportFiltro.ate) {
      setToast({ msg: 'A data inicial do relatório não pode ser maior que a final.', variant: 'error' });
      return;
    }
    setReportLoading(true);
    try {
      const data = await fetchRelatorioValoresPagos(reportFiltro);
      setReportRows(data);
    } catch (e) {
      setToast({ msg: e instanceof Error ? e.message : 'Erro ao carregar relatório.', variant: 'error' });
    } finally {
      setReportLoading(false);
    }
  };

  const totaisRelatorio = useMemo(() => {
    const total = reportRows.reduce((acc, row) => acc + row.valor, 0);
    const quantidade = reportRows.length;
    const ticketMedio = quantidade ? total / quantidade : 0;
    const porForma = reportRows.reduce<Record<string, number>>((acc, row) => {
      const chave = row.forma_pagamento || 'Não informado';
      acc[chave] = (acc[chave] ?? 0) + row.valor;
      return acc;
    }, {});
    return { total, quantidade, ticketMedio, porForma };
  }, [reportRows]);

  const pessoasRelatorio = useMemo(() => {
    const map = new Map<string, string>();
    rows.forEach((r) => {
      const pessoaId = resolvePessoaIdCobranca(r);
      if (pessoaId && !map.has(pessoaId)) {
        map.set(pessoaId, r.membro_nome || r.membro || 'Membro não informado');
      }
    });
    return [...map.entries()].map(([id, nome]) => ({ id, nome }));
  }, [rows]);

  const exportarRelatorioCsv = () => {
    const header = ['Data Pagamento', 'Membro', 'Descrição', 'Valor', 'Forma Pagamento'];
    const lines = reportRows.map((r) => [
      r.data_pagamento,
      r.membro,
      r.descricao,
      r.valor.toFixed(2).replace('.', ','),
      r.forma_pagamento || '',
    ]);
    const csv = [header, ...lines].map((cols) => cols.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `valores-pagos-${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportarRelatorioPdf = () => {
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    doc.setFontSize(14);
    doc.text('Relatório de Valores Pagos', 40, 40);
    autoTable(doc, {
      startY: 58,
      head: [['Data', 'Membro', 'Descrição', 'Valor', 'Forma']],
      body: reportRows.map((r) => [r.data_pagamento, r.membro, r.descricao, formatBRL(r.valor), r.forma_pagamento || '—']),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [107, 28, 46] },
    });
    doc.save(`relatorio-valores-pagos-${Date.now()}.pdf`);
  };


  return (
    <>
      <Toast message={toast?.msg ?? null} variant={toast?.variant} onDismiss={() => setToast(null)} />
      <h1>Cobranças</h1>

      <div className="dash-filter-bar dash-filter-bar--periodo">
        <div className="dash-cob-layout-row">
          <label className="dash-field dash-field--busca-membro">
            <span>Pesquisar por membro</span>
            <input
              type="search"
              placeholder="Digite o nome…"
              value={buscaMembro}
              onChange={(e) => setBuscaMembro(e.target.value)}
              autoComplete="off"
              aria-label="Pesquisar cobranças por nome do membro"
            />
          </label>
          <div className="dash-date-range">
            <label className="dash-field dash-field--inline">
              <span>De:</span>
              <input
                type="date"
                value={rascunhoPeriodo.de}
                onChange={(e) => setRascunhoPeriodo((p) => ({ ...p, de: e.target.value }))}
              />
            </label>
            <label className="dash-field dash-field--inline">
              <span>Até:</span>
              <input
                type="date"
                value={rascunhoPeriodo.ate}
                onChange={(e) => setRascunhoPeriodo((p) => ({ ...p, ate: e.target.value }))}
              />
            </label>
          </div>
          <div className="dash-filter-bar__actions">
            <button type="button" className="dash-btn-primary" onClick={aplicarFiltro}>
              Filtrar
            </button>
            <button type="button" className="dash-btn-secondary" onClick={limparFiltros}>
              Limpar
            </button>
          </div>
        </div>

        <div className="dash-cob-layout-row dash-cob-layout-row--reports">
          <p className="dash-muted dash-cob-layout-title">Relatórios</p>
          <div className="dash-filter-bar__actions">
            {buscaMembro.trim() && (
              <button type="button" className="dash-btn-secondary" onClick={gerarRelatorioPorNome}>
                Relatório por nome
              </button>
            )}
            <button type="button" className="dash-btn-secondary" onClick={gerarRelatorioMensalidadesAberto}>
              Mensalidades em Aberto
            </button>
            <button type="button" className="dash-btn-secondary" onClick={() => setReportOpen(true)}>
              Valores Pagos
            </button>
          </div>
        </div>

        <div className="dash-cob-layout-row">
          <label className="dash-toggle-paid">
            <input type="checkbox" checked={mostrarPagas} onChange={(e) => setMostrarPagas(e.target.checked)} />
            <span>Exibir valores pagos</span>
          </label>
        </div>
      </div>

      <div className="dash-section-header">
        <p className="dash-muted">
          {periodoAplicado?.de && periodoAplicado?.ate
            ? `A mostrar cobranças com vencimento entre ${periodoAplicado.de} e ${periodoAplicado.ate}.`
            : 'Sem filtro de período — a mostrar todas as cobranças.'}{' '}
          {buscaMembro.trim()
            ? `Pesquisa ativa por nome (“${buscaMembro.trim()}”).`
            : null}{' '}
          {mostrarPagas ? 'Exibindo pagas e pendentes.' : 'Exibindo apenas pendentes.'}
        </p>
        <div className="dash-section-actions">
          <button type="button" className="dash-btn-secondary" onClick={abrirCobrancaEmMassa}>
            Cobrar todos os membros
          </button>
          <button type="button" className="dash-add-button" onClick={openNovo}>
            Nova cobrança
          </button>
        </div>
      </div>

      {loading ? (
        <p>Carregando…</p>
      ) : (
        <>
          {selectedRows.length > 0 && (
            <div className="dash-cob-bulk-bar">
              <strong>✓ {selectedRows.length} cobrança(s) selecionada(s)</strong>
              <div className="dash-form-actions">
                <button type="button" className="dash-btn-success" onClick={() => setBulkActionOpen('pagar')}>
                  💵 Pagar selecionadas
                </button>
                <button type="button" className="dash-btn-danger" onClick={() => setBulkActionOpen('excluir')}>
                  🗑️ Excluir selecionadas
                </button>
              </div>
            </div>
          )}
          <CobrancasTable
            rows={cobrancasPaginadas}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onToggleSelectAllVisible={toggleSelectAllVisible}
            onEdit={openEdit}
            onDelete={setDeleteTarget}
            onRefresh={reload}
          />
          <p className="dash-cob-subtotal" role="status">
            <strong>Subtotal em aberto (filtros atuais):</strong> {formatBRL(subtotalAberto)}
          </p>
          <PaginationControls
            totalItems={totalCobrancas}
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

      <CobrancaForm open={formOpen} initial={editing} onClose={() => setFormOpen(false)} onSave={salvar} />

      {bulkOpen && (
        <div className="dash-modal-overlay" role="dialog" aria-modal="true" onClick={() => setBulkOpen(false)}>
          <div className="dash-modal dash-modal--narrow" onClick={(e) => e.stopPropagation()}>
            <h2>Cobrança em massa</h2>
            <p className="dash-muted">Cria uma cobrança para cada membro da casa.</p>
            <div className="dash-member-form">
              <label className="dash-field">
                <span>Tipo</span>
                <select
                  value={bulkValues.tipo}
                  onChange={(e) => setBulkValues((v) => ({ ...v, tipo: e.target.value as CobrancaFormValues['tipo'] }))}
                >
                  <option value="mensalidade">Mensalidade</option>
                  <option value="obrigacao">Obrigação</option>
                  <option value="outros">Outros</option>
                </select>
              </label>
              <label className="dash-field">
                <span>Data vencimento</span>
                <input type="date" value={bulkValues.data} onChange={(e) => setBulkValues((v) => ({ ...v, data: e.target.value }))} />
              </label>
              <label className="dash-field">
                <span>Valor</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={bulkValues.valor}
                  onChange={(e) => setBulkValues((v) => ({ ...v, valor: e.target.value }))}
                />
              </label>
              <label className="dash-field">
                <span>Descrição</span>
                <textarea rows={3} value={bulkValues.descricao} onChange={(e) => setBulkValues((v) => ({ ...v, descricao: e.target.value }))} />
              </label>
            </div>
            <div className="dash-form-actions">
              <button type="button" className="dash-btn-secondary" onClick={() => setBulkOpen(false)} disabled={bulkSaving}>
                Cancelar
              </button>
              <button type="button" className="dash-btn-primary" onClick={() => void criarCobrancaParaTodos()} disabled={bulkSaving}>
                {bulkSaving ? 'Criando…' : 'Criar para todos'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="dash-modal-overlay" role="dialog" aria-modal="true">
          <div className="dash-modal dash-modal--narrow">
            <h2>Excluir cobrança?</h2>
            <p>Esta ação não pode ser desfeita.</p>
            <div className="dash-form-actions">
              <button type="button" className="dash-btn-secondary" onClick={() => setDeleteTarget(null)}>
                Cancelar
              </button>
              <button type="button" className="dash-btn-danger" onClick={() => void confirmDelete()}>
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {bulkActionOpen === 'pagar' && (
        <div className="dash-modal-overlay" role="dialog" aria-modal="true" onClick={() => setBulkActionOpen(null)}>
          <div className="dash-modal dash-modal--narrow" onClick={(e) => e.stopPropagation()}>
            <h2>Pagar cobranças selecionadas</h2>
            <p className="dash-muted">Marcar {selectedRows.length} cobrança(s) como paga(s)?</p>
            <div className="dash-member-form">
              <label className="dash-field">
                <span>Data do pagamento</span>
                <input type="date" value={bulkPagamentoData} onChange={(e) => setBulkPagamentoData(e.target.value)} />
              </label>
              <label className="dash-field">
                <span>Forma de pagamento</span>
                <select value={bulkPagamentoForma} onChange={(e) => setBulkPagamentoForma(e.target.value)}>
                  <option value="PIX">PIX</option>
                  <option value="Dinheiro">Dinheiro</option>
                  <option value="Cartão">Cartão</option>
                  <option value="Transferência">Transferência</option>
                </select>
              </label>
            </div>
            <div className="dash-form-actions">
              <button type="button" className="dash-btn-secondary" onClick={() => setBulkActionOpen(null)} disabled={bulkActionLoading}>
                Cancelar
              </button>
              <button type="button" className="dash-btn-primary" onClick={() => void executarPagarEmLote()} disabled={bulkActionLoading}>
                {bulkActionLoading ? 'Processando…' : 'Confirmar pagamento em lote'}
              </button>
            </div>
          </div>
        </div>
      )}

      {bulkActionOpen === 'excluir' && (
        <div className="dash-modal-overlay" role="dialog" aria-modal="true" onClick={() => setBulkActionOpen(null)}>
          <div className="dash-modal dash-modal--narrow" onClick={(e) => e.stopPropagation()}>
            <h2>Excluir cobranças selecionadas?</h2>
            <p>Excluir {selectedRows.length} cobrança(s)? Esta ação pode ser desfeita pela restauração via banco.</p>
            <div className="dash-form-actions">
              <button type="button" className="dash-btn-secondary" onClick={() => setBulkActionOpen(null)} disabled={bulkActionLoading}>
                Cancelar
              </button>
              <button type="button" className="dash-btn-danger" onClick={() => void executarExcluirEmLote()} disabled={bulkActionLoading}>
                {bulkActionLoading ? 'Excluindo…' : 'Confirmar exclusão'}
              </button>
            </div>
          </div>
        </div>
      )}

      {reportOpen && (
        <div className="dash-modal-overlay dash-modal-overlay--scrollable" role="dialog" aria-modal="true" onClick={() => setReportOpen(false)}>
          <div className="dash-modal dash-modal--historico dash-modal--relatorio-pagos" onClick={(e) => e.stopPropagation()}>
            <h2>Relatório de Valores Pagos</h2>
            <div className="dash-modal-body-scroll">
              <div className="dash-form-grid dash-form-grid--pair">
                <label className="dash-field">
                  <span>Data inicial</span>
                  <input type="date" value={reportFiltro.de} onChange={(e) => setReportFiltro((r) => ({ ...r, de: e.target.value }))} />
                </label>
                <label className="dash-field">
                  <span>Data final</span>
                  <input type="date" value={reportFiltro.ate} onChange={(e) => setReportFiltro((r) => ({ ...r, ate: e.target.value }))} />
                </label>
                <label className="dash-field">
                  <span>Membro (opcional)</span>
                  <select value={reportFiltro.pessoaId} onChange={(e) => setReportFiltro((r) => ({ ...r, pessoaId: e.target.value }))}>
                    <option value="">Todos</option>
                    {pessoasRelatorio.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nome}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="dash-field">
                  <span>Tipo (opcional)</span>
                  <select value={reportFiltro.tipo} onChange={(e) => setReportFiltro((r) => ({ ...r, tipo: e.target.value as CobrancaTipo | '' }))}>
                    <option value="">Todos</option>
                    <option value="mensalidade">Mensalidade</option>
                    <option value="obrigacao">Obrigação</option>
                    <option value="outros">Outros</option>
                  </select>
                </label>
              </div>
              <div className="dash-form-actions">
                <button type="button" className="dash-btn-primary" onClick={() => void carregarRelatorioValoresPagos()} disabled={reportLoading}>
                  {reportLoading ? 'Carregando…' : 'Aplicar filtros'}
                </button>
                <button type="button" className="dash-btn-secondary" onClick={exportarRelatorioPdf} disabled={!reportRows.length}>
                  Exportar PDF
                </button>
                <button type="button" className="dash-btn-secondary" onClick={exportarRelatorioCsv} disabled={!reportRows.length}>
                  Exportar Excel (CSV)
                </button>
              </div>
              <div className="dash-hist-resumo">
                <p>
                  <strong>Total recebido:</strong> {formatBRL(totaisRelatorio.total)}
                </p>
                <p>
                  <strong>Quantidade de pagamentos:</strong> {totaisRelatorio.quantidade}
                </p>
                <p>
                  <strong>Ticket médio:</strong> {formatBRL(totaisRelatorio.ticketMedio)}
                </p>
                <p>
                  <strong>Por forma:</strong>{' '}
                  {Object.entries(totaisRelatorio.porForma)
                    .map(([forma, valor]) => `${forma}: ${formatBRL(valor)}`)
                    .join(' | ') || '—'}
                </p>
              </div>
              <div className="dash-table-scroll">
                <table className="dash-table">
                  <thead>
                    <tr>
                      <th>Data Pagamento</th>
                      <th>Membro</th>
                      <th>Descrição</th>
                      <th>Valor</th>
                      <th>Forma</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!reportRows.length ? (
                      <tr>
                        <td colSpan={5}>
                          <span className="dash-muted">Nenhum pagamento encontrado para os filtros.</span>
                        </td>
                      </tr>
                    ) : (
                      reportRows.map((linha, idx) => (
                        <tr key={`${linha.data_pagamento}-${linha.membro}-${idx}`}>
                          <td>{formatDateBR(linha.data_pagamento)}</td>
                          <td>{linha.membro}</td>
                          <td>{linha.descricao}</td>
                          <td>{formatBRL(linha.valor)}</td>
                          <td>{linha.forma_pagamento || '—'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <div className="dash-form-actions dash-hist-footer">
                <button type="button" className="dash-btn-primary" onClick={() => setReportOpen(false)}>
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
