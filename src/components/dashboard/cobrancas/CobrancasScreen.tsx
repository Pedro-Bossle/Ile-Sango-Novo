import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchCaixaCategorias } from '../../../services/caixa';
import {
  cobrancaPassaFiltroIntervalo,
  deleteCobranca,
  fetchRelatorioValoresPagos,
  fetchCobrancasComMembros,
  filtroPeriodoVazio,
  insertCobranca,
  isCobrancaPendente,
  isCobrancaContabilizavel,
  cobrancaAposEntrada,
  isMensalidadeTipo,
  registrarPagamento,
  updateCobranca,
  valorSaldoCobranca,
  valorTotalCobranca,
  valorPagoCobranca,
  type CobrancaComMembro,
  type FiltroPeriodoCobranca,
  type LinhaRelatorioValoresPagos,
} from '../../../services/cobrancas';
import { matchesSearchFields } from '../../../utils/searchFold';
import { fetchPessoasOptions } from '../../../services/pessoasLookup';
import { fetchConfigIle, formatarEnderecoIle } from '../../../services/configIle';
import { writeAuditLog, buildAuditDiff } from '../../../services/auditLog';
import { enviarEmail } from '../../../services/enviarEmail';
import { buildWaMeLink, openExternal } from '../../../utils/whatsappLink';
import { formatDateBR } from '../../../utils/formatDate';
import { parseValorInput, sanitizeValorInput, valorToMaskedInput } from '../../../utils/money';
import { gerarPdfRelatorio, type LinhaRelatorio } from '../../../utils/pdfRelatorio';
import { carregarLogoBase64 } from '../../../utils/logoBase64';
import { saudacaoFilhoSanto } from '../../../utils/saudacaoFilhoSanto';
import { Toast } from '../Toast';
import { CobrancaForm, type CobrancaFormValues } from './CobrancaForm';
import { CobrancasTable, groupCobrancasPorMembro } from './CobrancasTable';
import { statusCobrancaUi } from './CobrancaRow';
import { PaginationControls } from '../PaginationControls';
import './Cobrancas.css';
import { SearchableSelect, type SearchableSelectOption } from '../SearchableSelect';
import { FORMA_PAGAMENTO_PADRAO, FORMAS_PAGAMENTO, type FormaPagamento } from '../../../lib/formasPagamento';
import { resolvePessoaIdCobranca } from '../../../types/database';
import { onModalOverlayClick } from '../../../utils/modalOverlay';

type Props = { canSend?: boolean };

const COBRANCA_FIELD_LABELS: Record<string, string> = {
  membro_nome: 'Membro',
  valor: 'Valor',
  data: 'Vencimento',
  descricao: 'Descrição',
  tipo: 'Categoria',
};

export function CobrancasScreen({ canSend = true }: Props) {
  const [rows, setRows] = useState<CobrancaComMembro[]>([]);
  const [loading, setLoading] = useState(true);
  const [rascunhoPeriodo, setRascunhoPeriodo] = useState<FiltroPeriodoCobranca>(filtroPeriodoVazio);
  const [periodoAplicado, setPeriodoAplicado] = useState<FiltroPeriodoCobranca | null>(null);
  const [toast, setToast] = useState<{ msg: string; variant: 'success' | 'error' } | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CobrancaComMembro | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CobrancaComMembro | null>(null);
  const [buscaMembro, setBuscaMembro] = useState('');
  const [statusFiltro, setStatusFiltro] = useState<'todas' | 'em_aberto' | 'atrasada'>('todas');
  const [ordenacao, setOrdenacao] = useState<'nome-asc' | 'nome-desc' | 'venc-asc' | 'venc-desc' | 'valor-desc'>('nome-asc');
  const [maisOpen, setMaisOpen] = useState(false);
  const [pixKey, setPixKey] = useState('');
  const [ileNome, setIleNome] = useState('Ilê');
  const [ileLogo, setIleLogo] = useState<string | null>(null);
  const [ileEndereco, setIleEndereco] = useState('');
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
    tipo: 'Obrigação',
    data: '',
    valor: valorToMaskedInput(50),
    descricao: '',
  });
  const [categoriaOptions, setCategoriaOptions] = useState<SearchableSelectOption[]>([]);
  const [mostrarPagas, setMostrarPagas] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkActionOpen, setBulkActionOpen] = useState<'pagar' | 'excluir' | null>(null);
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const [bulkPagamentoData, setBulkPagamentoData] = useState(new Date().toISOString().slice(0, 10));
  const [bulkPagamentoForma, setBulkPagamentoForma] = useState(FORMA_PAGAMENTO_PADRAO);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportRows, setReportRows] = useState<LinhaRelatorioValoresPagos[]>([]);
  const [reportFiltro, setReportFiltro] = useState<{
    de: string;
    ate: string;
    pessoaId: string;
    tipo: string;
  }>({
    de: '',
    ate: '',
    pessoaId: '',
    tipo: '',
  });

  const reload = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = Boolean(opts?.silent);
    if (!silent) setLoading(true);
    try {
      const data = await fetchCobrancasComMembros();
      setRows(data.filter((c) => !isMensalidadeTipo(c)));
    } catch (e) {
      setToast({ msg: e instanceof Error ? e.message : 'Erro ao carregar cobranças.', variant: 'error' });
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    fetchConfigIle()
      .then(async (c) => {
        setPixKey(c.chave_pix ?? '');
        setIleNome(c.nome_ile?.trim() || 'Ilê');
        setIleEndereco(formatarEnderecoIle(c));
        if (c.logo_base64) {
          setIleLogo(c.logo_base64);
        } else {
          const fallback = await carregarLogoBase64();
          setIleLogo(fallback);
        }
      })
      .catch(() => {
        void carregarLogoBase64().then(setIleLogo);
      });
    fetchCaixaCategorias()
      .then((cats) => {
        const opts = cats
          .filter((c) => (c.tipo === 'entrada' || c.tipo === 'ambos') && c.nome.toLowerCase() !== 'mensalidade')
          .map((c) => ({ value: c.nome, label: c.nome }));
        if (opts.length) {
          setCategoriaOptions(opts);
          setBulkValues((v) => {
            if (opts.some((o) => o.value === v.tipo)) return v;
            const prefer =
              opts.find((o) => o.value === 'Obrigação')?.value ||
              opts.find((o) => o.value === 'Cobrança')?.value ||
              opts.find((o) => o.value === 'Outro')?.value ||
              opts[0]!.value;
            return { ...v, tipo: prefer };
          });
        }
      })
      .catch(() => undefined);
  }, [reload]);

  const bulkCategoriaOptions = useMemo((): SearchableSelectOption[] => {
    if (!bulkValues.tipo) return categoriaOptions;
    if (categoriaOptions.some((o) => o.value === bulkValues.tipo)) return categoriaOptions;
    return [{ value: bulkValues.tipo, label: bulkValues.tipo }, ...categoriaOptions];
  }, [categoriaOptions, bulkValues.tipo]);

  const carregarCategoriasFluxo = useCallback(async () => {
    const cats = await fetchCaixaCategorias();
    const opts = cats
      .filter((c) => (c.tipo === 'entrada' || c.tipo === 'ambos') && c.nome.toLowerCase() !== 'mensalidade')
      .map((c) => ({ value: c.nome, label: c.nome }));
    setCategoriaOptions(opts);
    setBulkValues((v) => {
      if (opts.some((o) => o.value === v.tipo)) return v;
      const prefer =
        opts.find((o) => o.value === 'Obrigação')?.value ||
        opts.find((o) => o.value === 'Cobrança')?.value ||
        opts.find((o) => o.value === 'Outro')?.value ||
        opts[0]?.value ||
        'Obrigação';
      return { ...v, tipo: prefer };
    });
    return opts;
  }, []);

  const filtered = useMemo(() => {
    let list = rows;
    if (periodoAplicado?.de && periodoAplicado?.ate) {
      list = list.filter((c) => cobrancaPassaFiltroIntervalo(c, periodoAplicado));
    }
    const q = buscaMembro.trim();
    if (q) {
      list = list.filter((c) => {
        const nome = c.membro_nome || c.membro || '';
        const desc = c.descricao || '';
        return matchesSearchFields(q, nome, desc);
      });
    }
    if (statusFiltro !== 'todas') {
      list = list.filter((c) => statusCobrancaUi(c) === statusFiltro);
    }
    const sorted = [...list];
    sorted.sort((a, b) => {
      switch (ordenacao) {
        case 'nome-desc':
          return (b.membro_nome || '').localeCompare(a.membro_nome || '', 'pt-BR', { sensitivity: 'base' });
        case 'venc-asc':
          return (a.vencimento || '').localeCompare(b.vencimento || '');
        case 'venc-desc':
          return (b.vencimento || '').localeCompare(a.vencimento || '');
        case 'valor-desc':
          return valorSaldoCobranca(b) - valorSaldoCobranca(a);
        case 'nome-asc':
        default:
          return (a.membro_nome || '').localeCompare(b.membro_nome || '', 'pt-BR', { sensitivity: 'base' });
      }
    });
    return sorted;
  }, [rows, periodoAplicado, buscaMembro, statusFiltro, ordenacao]);

  const grupos = useMemo(() => {
    const g = groupCobrancasPorMembro(filtered);
    // Ordena grupos pelo critério atual (totais / nome / vencimento mais próximo).
    return [...g].sort((a, b) => {
      switch (ordenacao) {
        case 'nome-desc':
          return b.nome.localeCompare(a.nome, 'pt-BR', { sensitivity: 'base' });
        case 'venc-asc': {
          const va = a.items.map((c) => c.vencimento || '9999').sort()[0] || '';
          const vb = b.items.map((c) => c.vencimento || '9999').sort()[0] || '';
          return va.localeCompare(vb);
        }
        case 'venc-desc': {
          const va = a.items.map((c) => c.vencimento || '').sort().reverse()[0] || '';
          const vb = b.items.map((c) => c.vencimento || '').sort().reverse()[0] || '';
          return vb.localeCompare(va);
        }
        case 'valor-desc': {
          const sa = a.items.reduce((s, c) => s + valorSaldoCobranca(c), 0);
          const sb = b.items.reduce((s, c) => s + valorSaldoCobranca(c), 0);
          return sb - sa;
        }
        case 'nome-asc':
        default:
          return a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' });
      }
    });
  }, [filtered, ordenacao]);

  const totalGrupos = grupos.length;
  const gruposPaginados = useMemo(() => {
    const start = (page - 1) * pageSize;
    return grupos.slice(start, start + pageSize);
  }, [grupos, page, pageSize]);

  const kpis = useMemo(() => {
    let recebido = 0;
    let emAberto = 0;
    for (const c of filtered) {
      recebido += valorPagoCobranca(c);
      emAberto += valorSaldoCobranca(c);
    }
    return { recebido, emAberto };
  }, [filtered]);

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(totalGrupos / pageSize));
    if (page > totalPages) setPage(totalPages);
  }, [totalGrupos, page, pageSize]);

  useEffect(() => {
    localStorage.setItem('cobrancas_page_size', String(pageSize));
  }, [pageSize]);

  useEffect(() => {
    setPage(1);
  }, [buscaMembro, periodoAplicado?.de, periodoAplicado?.ate, statusFiltro, ordenacao]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [page, pageSize, buscaMembro, periodoAplicado?.de, periodoAplicado?.ate, statusFiltro]);

  const reportModalRef = useRef<HTMLDivElement | null>(null);
  const reportTableScrollRef = useRef<HTMLDivElement | null>(null);

  // Roda do mouse: scroll vertical do modal + horizontal da tabela (sem precisar de Shift).
  useEffect(() => {
    if (!reportOpen) return;
    const modal = reportModalRef.current;
    const tableScroll = reportTableScrollRef.current;
    if (!modal) return;

    const onWheel = (e: WheelEvent) => {
      const target = e.target as Node | null;
      if (tableScroll?.contains(target) && tableScroll.scrollWidth > tableScroll.clientWidth) {
        const delta = e.deltaX !== 0 ? e.deltaX : e.deltaY;
        if (delta !== 0) {
          e.preventDefault();
          tableScroll.scrollLeft += delta;
        }
        return;
      }

      if (modal.scrollHeight > modal.clientHeight && e.deltaY !== 0) {
        e.preventDefault();
        modal.scrollTop += e.deltaY;
      }
    };

    modal.addEventListener('wheel', onWheel, { passive: false });
    return () => modal.removeEventListener('wheel', onWheel);
  }, [reportOpen]);

  /** Soma dos saldos em aberto respeitando a mesma lista filtrada da tabela (período + nome). */
  const subtotalAberto = useMemo(() => {
    return filtered.filter((c) => isCobrancaContabilizavel(c)).reduce((a, c) => a + valorSaldoCobranca(c), 0);
  }, [filtered]);

  const formatBRL = (n: number) =>
    n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });

  /** Uma linha por pessoa: soma de todo o saldo em aberto dela. */
  const montarLinhasPdf = (lista: CobrancaComMembro[]): LinhaRelatorio[] => {
    const map = new Map<string, { nome: string; valor: number }>();
    for (const c of lista) {
      if (!isCobrancaContabilizavel(c)) continue;
      const saldo = valorSaldoCobranca(c);
      if (saldo <= 0) continue;
      const pid = resolvePessoaIdCobranca(c);
      const nome = (c.membro_nome || c.membro || 'Membro').trim() || 'Membro';
      const key = pid ? `p:${pid}` : `n:${nome.toLowerCase()}`;
      const cur = map.get(key) ?? { nome, valor: 0 };
      cur.valor += saldo;
      if (!cur.nome || cur.nome === 'Membro') cur.nome = nome;
      map.set(key, cur);
    }
    return [...map.values()]
      .filter((g) => g.valor > 0)
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }))
      .map((g) => ({
        nome: g.nome,
        data: '',
        descricao: '',
        valor: Math.round(g.valor * 100) / 100,
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
    setStatusFiltro('todas');
    setPage(1);
  };

  const copiarLista = async () => {
    const linhas = montarLinhasPdf(filtered);
    const total = linhas.reduce((a, b) => a + b.valor, 0);
    const texto = [
      'Cobranças em aberto',
      '',
      ...linhas.map((l) => `${l.nome} — ${formatBRL(l.valor)}`),
      '',
      `Total em aberto — ${formatBRL(total)}`,
    ].join('\n');
    try {
      await navigator.clipboard.writeText(texto);
      setToast({ msg: 'Lista copiada.', variant: 'success' });
    } catch {
      setToast({ msg: 'Não foi possível copiar.', variant: 'error' });
    }
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
    const valorNum = parseValorInput(values.valor);
    if (valorNum == null || valorNum < 0) {
      setToast({ msg: 'Informe um valor válido.', variant: 'error' });
      return;
    }
    if (!cobrancaAposEntrada(values.data, p?.data_entrada)) {
      setToast({
        msg: `Vencimento anterior à data de entrada do membro (${p?.data_entrada?.slice(0, 10) || '—'}).`,
        variant: 'error',
      });
      return;
    }
    const after = {
      membro_nome: nome,
      valor: valorNum,
      data: values.data,
      descricao: values.descricao || null,
      tipo: values.tipo,
    };
    if (editing) {
      const before = {
        membro_nome: editing.membro_nome,
        valor: valorTotalCobranca(editing),
        data: editing.vencimento,
        descricao: editing.descricao || null,
        tipo: editing.tipo,
      };
      await updateCobranca(editing.id, {
        pessoa_id: values.pessoa_id,
        membro_nome: nome,
        valor: valorNum,
        data: values.data,
        descricao: values.descricao || null,
        tipo: values.tipo,
      });
      await writeAuditLog({
        action: 'update',
        entity: 'cobrancas',
        entity_id: editing.id,
        resumo: nome,
        diff: buildAuditDiff('Cobranças', before, after, COBRANCA_FIELD_LABELS),
      });
      setToast({ msg: 'Cobrança atualizada.', variant: 'success' });
    } else {
      await insertCobranca({
        pessoa_id: values.pessoa_id,
        membro_nome: nome,
        valor: valorNum,
        data: values.data,
        descricao: values.descricao || null,
        tipo: values.tipo,
        parcelas: Number.parseInt(values.parcelas, 10) || 1,
      });
      await writeAuditLog({
        action: 'create',
        entity: 'cobrancas',
        resumo: nome,
        diff: buildAuditDiff('Cobranças', null, after, COBRANCA_FIELD_LABELS),
      });
      const nParc = Number.parseInt(values.parcelas, 10) || 1;
      setToast({
        msg: nParc > 1 ? `Cobrança criada em ${nParc} parcelas.` : 'Cobrança criada.',
        variant: 'success',
      });
    }
    await reload({ silent: true });
  };

  const msgCobranca = (c: CobrancaComMembro) => {
    const saldo = valorSaldoCobranca(c);
    const venc = formatDateBR(c.vencimento);
    const ref = c.descricao || c.tipo || 'pendência';
    const saldoFmt = saldo.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const pixLine = pixKey ? `\nPix: ${pixKey}` : '';
    const saudacao = saudacaoFilhoSanto({
      nome: c.membro_nome,
      orixaCabeca: c.membro_orixa_cabeca_nome,
      qualidadeCabeca: c.membro_orixa_cabeca_qualidade_nome,
    });
    // WhatsApp: mensagem curta numa linha
    return `${saudacao} Cobrança do ${ileNome}: ${ref} — saldo ${saldoFmt} (venc. ${venc}).${pixLine}\nObrigado!`;
  };

  const msgCobrancaEmail = (c: CobrancaComMembro) => {
    const saldo = valorSaldoCobranca(c);
    const venc = formatDateBR(c.vencimento);
    const ref = c.descricao || c.tipo || 'pendência';
    const saldoFmt = saldo.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    return [
      saudacaoFilhoSanto({
        nome: c.membro_nome,
        orixaCabeca: c.membro_orixa_cabeca_nome,
        qualidadeCabeca: c.membro_orixa_cabeca_qualidade_nome,
        fim: ',',
      }),
      '',
      `Segue o lembrete de cobrança do ${ileNome}.`,
      '',
      `Referência: ${ref}`,
      `Saldo em aberto: ${saldoFmt}`,
      `Vencimento: ${venc || '—'}`,
      ...(pixKey ? [`Pix: ${pixKey}`] : []),
      '',
      'Qualquer dúvida, estamos à disposição.',
      'Obrigado!',
    ].join('\n');
  };

  const enviarWhatsApp = (c: CobrancaComMembro) => {
    const url = buildWaMeLink(c.membro_contato, msgCobranca(c));
    if (!url) {
      setToast({ msg: 'Membro sem telefone cadastrado.', variant: 'error' });
      return;
    }
    openExternal(url);
  };

  const enviarEmailCobranca = (c: CobrancaComMembro) => {
    void (async () => {
      const to = String(c.membro_email ?? '').trim();
      if (!to) {
        setToast({ msg: 'Membro sem e-mail cadastrado.', variant: 'error' });
        return;
      }
      try {
        await enviarEmail({
          to,
          subject: `Cobrança — ${ileNome}`,
          title: 'Lembrete de cobrança',
          text: msgCobrancaEmail(c),
        });
        setToast({ msg: 'E-mail enviado pelo No-reply.', variant: 'success' });
      } catch (e) {
        setToast({
          msg: e instanceof Error ? e.message : 'Não foi possível enviar o e-mail.',
          variant: 'error',
        });
      }
    })();
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const targetId = deleteTarget.id;
    try {
      const before = {
        membro_nome: deleteTarget.membro_nome,
        valor: valorTotalCobranca(deleteTarget),
        data: deleteTarget.vencimento,
        descricao: deleteTarget.descricao || null,
        tipo: deleteTarget.tipo,
      };
      setRows((prev) => prev.filter((r) => String(r.id) !== String(targetId)));
      setDeleteTarget(null);
      await deleteCobranca(targetId);
      await writeAuditLog({
        action: 'delete',
        entity: 'cobrancas',
        entity_id: targetId,
        resumo: deleteTarget.membro_nome,
        diff: buildAuditDiff('Cobranças', before, null, COBRANCA_FIELD_LABELS),
      });
      setToast({ msg: 'Cobrança excluída.', variant: 'success' });
      await reload({ silent: true });
    } catch (e) {
      setToast({ msg: e instanceof Error ? e.message : 'Erro ao excluir.', variant: 'error' });
      await reload({ silent: true });
    }
  };

  const gerarRelatorioPorNome = () => {
    if (!buscaMembro.trim()) {
      setToast({ msg: 'Digite um nome na pesquisa antes de gerar o relatório por nome.', variant: 'error' });
      return;
    }
    const linhas = montarLinhasPdf(filtered);
    if (!linhas.length) {
      setToast({ msg: 'Nenhum valor em aberto para o relatório.', variant: 'error' });
      return;
    }
    const total = linhas.reduce((a, b) => a + b.valor, 0);
    gerarPdfRelatorio({
      periodo: periodoAplicado,
      linhas,
      total,
      tituloPrincipal: 'Cobranças em aberto — por nome',
      subtitulo: `Pesquisa: “${buscaMembro.trim()}”. Uma linha por pessoa — total devido.`,
      ileNome,
      ileEndereco,
      logoBase64: ileLogo,
      variante: 'aberto',
      totalLabel: 'Total em aberto',
      fileNamePrefix: 'cobrancas-aberto-nome',
    });
  };

  const gerarRelatorioObrigacoesAberto = () => {
    const linhas = montarLinhasPdf(filtered);
    if (!linhas.length) {
      setToast({ msg: 'Nenhum valor em aberto para o relatório.', variant: 'error' });
      return;
    }
    const total = linhas.reduce((a, b) => a + b.valor, 0);
    gerarPdfRelatorio({
      periodo: periodoAplicado,
      linhas,
      total,
      tituloPrincipal: 'Cobranças em aberto',
      subtitulo: 'Uma linha por pessoa — total devido.',
      ileNome,
      ileEndereco,
      logoBase64: ileLogo,
      variante: 'aberto',
      totalLabel: 'Total em aberto',
      fileNamePrefix: 'cobrancas-em-aberto',
    });
  };

  const abrirCobrancaEmMassa = () => {
    void carregarCategoriasFluxo().catch(() => undefined);
    setBulkOpen(true);
  };

  const criarCobrancaParaTodos = async () => {
    const data = bulkValues.data.trim();
    const valor = parseValorInput(bulkValues.valor) ?? NaN;
    const tipo = bulkValues.tipo.trim();
    if (!tipo) {
      setToast({ msg: 'Selecione a categoria do fluxo de caixa.', variant: 'error' });
      return;
    }
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
      // Garante lista atualizada das categorias do fluxo antes de gravar.
      const opts = await carregarCategoriasFluxo();
      if (!opts.length) {
        setToast({ msg: 'Cadastre categorias de entrada no fluxo de caixa antes de cobrar em massa.', variant: 'error' });
        return;
      }
      const tipoOk = opts.some((o) => o.value === tipo) ? tipo : opts[0]!.value;

      const pessoas = await fetchPessoasOptions();
      if (!pessoas.length) {
        setToast({ msg: 'Não há membros para cobrar.', variant: 'error' });
        return;
      }

      const elegiveis = pessoas.filter((p) => cobrancaAposEntrada(data, p.data_entrada));
      if (!elegiveis.length) {
        setToast({
          msg: 'Nenhum membro com data de entrada até a data do vencimento.',
          variant: 'error',
        });
        return;
      }

      for (const p of elegiveis) {
        await insertCobranca({
          pessoa_id: p.id,
          membro_nome: p.nome,
          valor,
          data,
          descricao: bulkValues.descricao.trim() || null,
          tipo: tipoOk,
        });
      }

      const pulados = pessoas.length - elegiveis.length;
      setToast({
        msg:
          pulados > 0
            ? `Cobrança criada para ${elegiveis.length} membro(s). ${pulados} ignorado(s) (antes da entrada).`
            : `Cobrança criada para ${elegiveis.length} membro(s).`,
        variant: 'success',
      });
      setBulkOpen(false);
      await reload({ silent: true });
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
    const ids = selectedRows.map((r) => r.id);
    try {
      setRows((prev) => prev.filter((r) => !ids.some((id) => String(id) === String(r.id))));
      setSelectedIds(new Set());
      setBulkActionOpen(null);
      for (const row of selectedRows) {
        await deleteCobranca(row.id);
      }
      setToast({ msg: `${selectedRows.length} cobrança(s) excluída(s) com sucesso.`, variant: 'success' });
      await reload({ silent: true });
    } catch (e) {
      setToast({ msg: e instanceof Error ? e.message : 'Erro ao excluir em lote.', variant: 'error' });
      await reload({ silent: true });
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
      await reload({ silent: true });
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

  const pessoasRelatorioOptions = useMemo(
    (): SearchableSelectOption[] => [
      { value: '', label: 'Todos' },
      ...pessoasRelatorio.map((p) => ({ value: p.id, label: p.nome })),
    ],
    [pessoasRelatorio],
  );

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
    const periodo =
      reportFiltro.de && reportFiltro.ate ? { de: reportFiltro.de, ate: reportFiltro.ate } : null;
    const linhas: LinhaRelatorio[] = reportRows.map((r) => ({
      nome: r.membro,
      data: formatDateBR(r.data_pagamento),
      descricao: r.descricao || '—',
      valor: r.valor,
      forma: r.forma_pagamento || '—',
    }));
    const total = linhas.reduce((a, b) => a + b.valor, 0);
    gerarPdfRelatorio({
      periodo,
      linhas,
      total,
      tituloPrincipal: 'Fluxo de caixa — Valores pagos',
      subtitulo: `${totaisRelatorio.quantidade} pagamento(s) · Ticket médio ${formatBRL(totaisRelatorio.ticketMedio)}`,
      ileNome,
      ileEndereco,
      logoBase64: ileLogo,
      variante: 'fluxo',
      totalLabel: 'Total recebido',
      fileNamePrefix: 'fluxo-valores-pagos',
    });
  };


  return (
    <div className="dash-cob" data-tour="cobrancas">
      <Toast message={toast?.msg ?? null} variant={toast?.variant} onDismiss={() => setToast(null)} />
      <header className="dash-page-head dash-cob__header">
        <div className="dash-page-head__titles">
          <h1>Cobranças</h1>
          <p className="dash-muted">
            Atribua cobranças a membros, registre pagamentos parciais ou totais e acompanhe a quitação. Cada pagamento
            gera lançamento no fluxo de caixa.
          </p>
        </div>
        <div className="dash-page-head__actions" data-tour="cobrancas-acoes">
          <button type="button" className="dash-btn-secondary dash-cob__copy" onClick={() => void copiarLista()}>
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
              <path
                fill="currentColor"
                d="M8 7V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-2v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h3Zm2 0h5a2 2 0 0 1 2 2v7h2V5H10v2ZM5 9v10h9V9H5Z"
              />
            </svg>
            Copiar lista
          </button>
          <div className="dash-cob__mais-wrap">
            <button
              type="button"
              className="dash-btn-secondary"
              aria-expanded={maisOpen}
              onClick={() => setMaisOpen((v) => !v)}
            >
              Mais
            </button>
            {maisOpen && (
              <div className="dash-cob__mais-menu" role="menu">
                <button type="button" role="menuitem" onClick={() => { setMaisOpen(false); abrirCobrancaEmMassa(); }}>
                  Cobrar todos os membros
                </button>
                <button type="button" role="menuitem" onClick={() => { setMaisOpen(false); gerarRelatorioObrigacoesAberto(); }}>
                  Relatório em aberto
                </button>
                <button type="button" role="menuitem" onClick={() => { setMaisOpen(false); setReportOpen(true); }}>
                  Valores pagos (fluxo)
                </button>
              </div>
            )}
          </div>
          <button type="button" className="dash-add-button" onClick={openNovo}>
            + Nova cobrança
          </button>
        </div>
      </header>

      <div className="dash-cob__toolbar" data-tour="cobrancas-filtros">
        <label className="dash-cob__busca">
          <span className="dash-visually-hidden">Buscar</span>
          <svg className="dash-cob__busca-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden>
            <path
              fill="currentColor"
              d="M10.5 3a7.5 7.5 0 0 1 5.9 12.1l3.75 3.75-1.4 1.4-3.75-3.75A7.5 7.5 0 1 1 10.5 3Zm0 2a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11Z"
            />
          </svg>
          <input
            type="search"
            placeholder="Buscar membro, descrição…"
            value={buscaMembro}
            onChange={(e) => setBuscaMembro(e.target.value)}
            autoComplete="off"
            aria-label="Buscar membro ou descrição"
          />
        </label>
        <label className="dash-cob__select">
          <span className="dash-visually-hidden">Status</span>
          <select value={statusFiltro} onChange={(e) => setStatusFiltro(e.target.value as typeof statusFiltro)} aria-label="Filtrar por status">
            <option value="todas">Todas</option>
            <option value="em_aberto">Em aberto</option>
            <option value="atrasada">Atrasadas</option>
          </select>
        </label>
        <label className="dash-cob__select">
          <span className="dash-visually-hidden">Ordenar</span>
          <select value={ordenacao} onChange={(e) => setOrdenacao(e.target.value as typeof ordenacao)} aria-label="Ordenar lista">
            <option value="nome-asc">Nome A-Z</option>
            <option value="nome-desc">Nome Z-A</option>
            <option value="venc-asc">Vencimento ↑</option>
            <option value="venc-desc">Vencimento ↓</option>
            <option value="valor-desc">Maior saldo</option>
          </select>
        </label>
      </div>

      <div className="dash-cob__kpis">
        <article className="dash-cob__kpi dash-cob__kpi--recebido">
          <h3>Recebido</h3>
          <p className="dash-cob__kpi-valor">{formatBRL(kpis.recebido)}</p>
        </article>
        <article className="dash-cob__kpi dash-cob__kpi--aberto">
          <h3>Em aberto</h3>
          <p className="dash-cob__kpi-valor">{formatBRL(kpis.emAberto)}</p>
        </article>
      </div>

      {loading ? (
        <p>Carregando…</p>
      ) : (
        <>
          <CobrancasTable
            groups={gruposPaginados}
            onEdit={openEdit}
            onDelete={setDeleteTarget}
            onRefresh={() => void reload({ silent: true })}
          />
          <PaginationControls
            totalItems={totalGrupos}
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
        <div
          className="dash-modal-overlay"
          role="dialog"
          aria-modal="true"
          onClick={onModalOverlayClick(() => setBulkOpen(false))}
        >
          <div className="dash-modal dash-modal--narrow" onClick={(e) => e.stopPropagation()}>
            <h2>Cobrança em massa</h2>
            <p className="dash-muted">Cria uma cobrança para cada membro da casa, com a categoria do fluxo de caixa.</p>
            <div className="dash-member-form">
              <label className="dash-field">
                <span>Categoria do fluxo</span>
                <SearchableSelect
                  options={bulkCategoriaOptions}
                  value={bulkValues.tipo}
                  onChange={(v) => setBulkValues((prev) => ({ ...prev, tipo: v }))}
                  searchPlaceholder="Buscar categoria…"
                  placeholder={categoriaOptions.length ? 'Selecionar categoria…' : 'Carregando categorias…'}
                  aria-label="Categoria do fluxo de caixa"
                />
              </label>
              <label className="dash-field">
                <span>Data vencimento</span>
                <input type="date" value={bulkValues.data} onChange={(e) => setBulkValues((v) => ({ ...v, data: e.target.value }))} />
              </label>
              <label className="dash-field">
                <span>Valor</span>
                <input
                  inputMode="decimal"
                  value={bulkValues.valor}
                  onChange={(e) => setBulkValues((v) => ({ ...v, valor: sanitizeValorInput(e.target.value) }))}
                  placeholder="R$ 0,00"
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
        <div
          className="dash-modal-overlay"
          role="dialog"
          aria-modal="true"
          onClick={onModalOverlayClick(() => setDeleteTarget(null))}
        >
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
        <div
          className="dash-modal-overlay"
          role="dialog"
          aria-modal="true"
          onClick={onModalOverlayClick(() => setBulkActionOpen(null))}
        >
          <div className="dash-modal dash-modal--narrow" onClick={(e) => e.stopPropagation()}>
            <h2>Pagar cobranças selecionadas</h2>
            <p className="dash-muted">Marcar {selectedRows.length} cobrança(s) como paga(s)?</p>
            <div className="dash-member-form">
              <label className="dash-field">
                <span>Data do pagamento</span>
                <input type="date" value={bulkPagamentoData} onChange={(e) => setBulkPagamentoData(e.target.value)} />
              </label>
              <label className="dash-field">
                <span>Tipo de pagamento</span>
                <select
                  value={bulkPagamentoForma}
                  onChange={(e) => setBulkPagamentoForma(e.target.value as FormaPagamento)}
                  aria-label="Tipo de pagamento"
                >
                  {FORMAS_PAGAMENTO.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
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
        <div
          className="dash-modal-overlay"
          role="dialog"
          aria-modal="true"
          onClick={onModalOverlayClick(() => setBulkActionOpen(null))}
        >
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
        <div
          className="dash-modal-overlay dash-modal-overlay--scrollable"
          role="dialog"
          aria-modal="true"
          onClick={onModalOverlayClick(() => setReportOpen(false))}
        >
          <div
            ref={reportModalRef}
            className="dash-modal dash-modal--historico dash-modal--relatorio-pagos"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dash-modal__head">
              <h2>Valores pagos — Fluxo de caixa</h2>
              <button type="button" className="dash-modal__close" aria-label="Fechar" onClick={() => setReportOpen(false)}>
                ×
              </button>
            </div>
            <div className="dash-modal-body-scroll">
              <div className="dash-relatorio-filtros">
                <label className="dash-field">
                  <span>Data início</span>
                  <input type="date" value={reportFiltro.de} onChange={(e) => setReportFiltro((r) => ({ ...r, de: e.target.value }))} />
                </label>
                <label className="dash-field">
                  <span>Data fim</span>
                  <input type="date" value={reportFiltro.ate} onChange={(e) => setReportFiltro((r) => ({ ...r, ate: e.target.value }))} />
                </label>
                <label className="dash-field">
                  <span>Categoria</span>
                  <SearchableSelect
                    options={[{ value: '', label: 'Todas' }, ...categoriaOptions]}
                    value={reportFiltro.tipo}
                    onChange={(v) => setReportFiltro((r) => ({ ...r, tipo: v }))}
                    searchPlaceholder="Buscar categoria…"
                    aria-label="Categoria do fluxo"
                  />
                </label>
                <label className="dash-field">
                  <span>Membro</span>
                  <SearchableSelect
                    options={pessoasRelatorioOptions}
                    value={reportFiltro.pessoaId}
                    onChange={(v) => setReportFiltro((r) => ({ ...r, pessoaId: v }))}
                    searchPlaceholder="Buscar membro…"
                    aria-label="Membro"
                  />
                </label>
                <div className="dash-field dash-relatorio-filtros__action">
                  <span className="dash-relatorio-filtros__action-label" aria-hidden="true">
                    &nbsp;
                  </span>
                  <button type="button" className="dash-btn-primary" onClick={() => void carregarRelatorioValoresPagos()} disabled={reportLoading}>
                    {reportLoading ? 'Carregando…' : 'Aplicar'}
                  </button>
                </div>
                <div className="dash-field dash-relatorio-filtros__exports">
                  <span className="dash-relatorio-filtros__action-label" aria-hidden="true">
                    &nbsp;
                  </span>
                  <div className="dash-relatorio-filtros__export-btns">
                    <button type="button" className="dash-btn-secondary" onClick={exportarRelatorioCsv} disabled={!reportRows.length}>
                      Exportar Excel (CSV)
                    </button>
                    <button type="button" className="dash-btn-secondary" onClick={exportarRelatorioPdf} disabled={!reportRows.length}>
                      Exportar PDF
                    </button>
                  </div>
                </div>
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
              <div className="dash-table-scroll" ref={reportTableScrollRef}>
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
    </div>
  );
}
