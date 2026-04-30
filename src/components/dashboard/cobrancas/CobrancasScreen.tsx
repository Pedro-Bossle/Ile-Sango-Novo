import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  cobrancaPassaFiltroIntervalo,
  deleteCobranca,
  fetchCobrancasComMembros,
  filtroPeriodoVazio,
  insertCobranca,
  isCobrancaPendente,
  isMensalidadeTipo,
  updateCobranca,
  valorSaldoCobranca,
  type CobrancaComMembro,
  type FiltroPeriodoCobranca,
} from '../../../services/cobrancas';
import { fetchPessoasOptions } from '../../../services/pessoasLookup';
import { formatDateBR } from '../../../utils/formatDate';
import { gerarPdfRelatorio, type LinhaRelatorio } from '../../../utils/pdfRelatorio';
import { Toast } from '../Toast';
import { CobrancaForm, type CobrancaFormValues } from './CobrancaForm';
import { CobrancasTable } from './CobrancasTable';
import { PaginationControls } from '../PaginationControls';

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
  }, [rows, periodoAplicado, buscaMembro]);

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
  }, [buscaMembro, periodoAplicado?.de, periodoAplicado?.ate]);

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

  const gerarRelatorio = () => {
    if (!periodoAplicado?.de || !periodoAplicado?.ate) {
      setToast({ msg: 'Aplique um período (De / Até) antes de gerar o relatório.', variant: 'error' });
      return;
    }
    const linhas = montarLinhasPdf(filtered);
    const total = linhas.reduce((a, b) => a + b.valor, 0);
    const subt =
      buscaMembro.trim().length > 0 ? `Filtro de nome ativo: “${buscaMembro.trim()}”.` : undefined;
    gerarPdfRelatorio({
      periodo: periodoAplicado,
      linhas,
      total,
      tituloPrincipal: 'Relatório por período — saldos em aberto',
      subtitulo: subt,
    });
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

  return (
    <>
      <Toast message={toast?.msg ?? null} variant={toast?.variant} onDismiss={() => setToast(null)} />
      <h1>Cobranças</h1>

      <div className="dash-filter-bar dash-filter-bar--periodo">
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
          <span className="dash-date-range__ate" aria-hidden>
            até
          </span>
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
          {periodoAplicado?.de && periodoAplicado?.ate && (
            <button type="button" className="dash-btn-primary" onClick={gerarRelatorio}>
              Gerar relatório (período)
            </button>
          )}
          <button type="button" className="dash-btn-secondary" onClick={gerarRelatorioPorNome}>
            Gerar relatório por nome
          </button>
          <button type="button" className="dash-btn-secondary" onClick={gerarRelatorioMensalidadesAberto}>
            Mensalidades em aberto (PDF)
          </button>
        </div>
      </div>

      <div className="dash-section-header">
        <p className="dash-muted">
          {periodoAplicado?.de && periodoAplicado?.ate
            ? `A mostrar cobranças com vencimento entre ${periodoAplicado.de} e ${periodoAplicado.ate}.`
            : 'Sem filtro de período — a mostrar todas as cobranças.'}{' '}
          {buscaMembro.trim()
            ? `Pesquisa ativa por nome (“${buscaMembro.trim()}”).`
            : null}
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
          <CobrancasTable rows={cobrancasPaginadas} onEdit={openEdit} onDelete={setDeleteTarget} onRefresh={reload} />
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
    </>
  );
}
