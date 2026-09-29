import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { createPortal } from 'react-dom';
import {
  fetchValorMensalidadePadrao,
  fetchMembrosMensalidade,
  fetchMensalidadesAno,
  garantirAbertosAno,
  membroApareceNoAno,
  montarGradeMembro,
  setMensalidadeStatus,
  formatListaWhatsApp,
  resumirGrade,
  incluirMembroNoAno,
  MESES_LABEL,
  type MensalidadeStatus,
  type MembroMensalidade,
  type MensalidadeRow,
  type CelulaMensalidade,
} from '../../../services/mensalidades';
import { writeAuditLog } from '../../../services/auditLog';
import { matchesSearch } from '../../../utils/searchFold';
import { SearchableSelect, type SearchableSelectOption } from '../SearchableSelect';
import { Toast } from '../Toast';
import {
  FORMA_PAGAMENTO_PADRAO,
  FORMAS_PAGAMENTO,
  type FormaPagamento,
} from '../../../lib/formasPagamento';
import './MensalidadesScreen.css';

type Props = { canEdit?: boolean; canLote?: boolean; canSemCaixa?: boolean };

type PopoverTarget = {
  pessoaId: string;
  mes: number;
  anchor: DOMRect;
};

type SortKey = 'nome' | 'abertos' | 'total' | `mes-${number}`;

const STATUS_OPCOES: { value: MensalidadeStatus; label: string }[] = [
  { value: 'aberto', label: 'Em aberto' },
  { value: 'pago', label: 'Pago' },
  { value: 'isento', label: 'Isento' },
  { value: 'desligado', label: 'Desligado' },
];

/** Ordem para ordenar por mês: aberto → pago → isento → desligado → vazio */
const STATUS_RANK: Record<CelulaMensalidade['status'], number> = {
  aberto: 0,
  pago: 1,
  isento: 2,
  desligado: 3,
  vazio: 4,
};

function money(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function letraCelula(status: CelulaMensalidade['status']) {
  switch (status) {
    case 'aberto':
      return 'A';
    case 'pago':
      return 'P';
    case 'isento':
      return 'I';
    case 'desligado':
      return 'D';
    default:
      return '';
  }
}

/** Código de 3 letras exibido nos tiles mobile (padrão do print). */
function codigoCelula(status: CelulaMensalidade['status']) {
  switch (status) {
    case 'aberto':
      return 'ABE';
    case 'pago':
      return 'PAG';
    case 'isento':
      return 'ISE';
    case 'desligado':
      return 'DES';
    default:
      return 'FUT';
  }
}

function statusLabel(status: CelulaMensalidade['status']) {
  if (status === 'vazio') return 'Futuro / sem competência';
  return STATUS_OPCOES.find((o) => o.value === status)?.label ?? status;
}

function modifierCelula(status: CelulaMensalidade['status']) {
  if (status === 'vazio') return 'vazio';
  return status;
}

function celulaEditavel(c: CelulaMensalidade, canEdit: boolean) {
  if (!canEdit) return false;
  if (c.bloqueado) return false;
  if (c.status === 'desligado' && c.virtual) return false;
  return true;
}

function defaultDirFor(key: SortKey): 'asc' | 'desc' {
  if (key === 'nome') return 'asc';
  return 'desc';
}

function SortTh({
  label,
  sortKey,
  activeKey,
  dir,
  onSort,
  title,
  className,
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  dir: 'asc' | 'desc';
  onSort: (key: SortKey) => void;
  title: string;
  className?: string;
}) {
  const active = activeKey === sortKey;
  const ariaSort = active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none';
  return (
    <th scope="col" className={className} aria-sort={ariaSort}>
      <button type="button" className="dash-th-sort" onClick={() => onSort(sortKey)} title={title}>
        <span>{label}</span>
        <span className="dash-th-sort__icons" aria-hidden>
          {active ? (dir === 'asc' ? '▲' : '▼') : '↕'}
        </span>
      </button>
    </th>
  );
}

const COLSPAN_GRADE = 1 + MESES_LABEL.length + 2; // membro + 12 meses + abertos + total

function IncluirMembroBar({
  open,
  options,
  value,
  saving,
  onOpen,
  onChange,
  onIncluir,
  onCancel,
}: {
  open: boolean;
  options: SearchableSelectOption[];
  value: string;
  saving: boolean;
  onOpen: () => void;
  onChange: (id: string) => void;
  onIncluir: () => void;
  onCancel: () => void;
}) {
  if (!open) {
    return (
      <button type="button" className="dash-mens__incluir-link" onClick={onOpen}>
        Incluir membro
      </button>
    );
  }
  return (
    <div className="dash-mens__incluir">
      <SearchableSelect
        options={options}
        value={value}
        onChange={onChange}
        placeholder="Membro ativo no ano…"
        searchPlaceholder="Buscar membro…"
        aria-label="Incluir membro"
      />
      <button type="button" className="dash-btn-primary" disabled={!value || saving} onClick={onIncluir}>
        Incluir
      </button>
      <button type="button" className="dash-add-button dash-add-button--secondary" onClick={onCancel}>
        Cancelar
      </button>
    </div>
  );
}

export function MensalidadesScreen({ canEdit = true, canLote = false, canSemCaixa = false }: Props) {
  const yearNow = new Date().getFullYear();
  const [ano, setAno] = useState(yearNow);
  const [busca, setBusca] = useState('');
  const [dataPagamento, setDataPagamento] = useState(() => new Date().toISOString().slice(0, 10));
  const [formaPagamento, setFormaPagamento] = useState<FormaPagamento>(FORMA_PAGAMENTO_PADRAO);
  const [valorPadrao, setValorPadrao] = useState(20);
  const [membros, setMembros] = useState<MembroMensalidade[]>([]);
  const [rows, setRows] = useState<MensalidadeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; variant: 'success' | 'error' } | null>(null);
  const [popover, setPopover] = useState<PopoverTarget | null>(null);
  const [incluirOpen, setIncluirOpen] = useState(false);
  const [incluirMembroId, setIncluirMembroId] = useState('');
  const [extrasOpen, setExtrasOpen] = useState(false);
  const [baixarSemCaixa, setBaixarSemCaixa] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'nome', dir: 'asc' });
  const popRef = useRef<HTMLDivElement>(null);
  const extrasRef = useRef<HTMLDivElement>(null);

  const reload = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = Boolean(opts?.silent);
    if (!silent) setLoading(true);
    try {
      const valor = await fetchValorMensalidadePadrao();
      setValorPadrao(valor);
      await garantirAbertosAno(ano, valor);
      const [membrosData, rowsData] = await Promise.all([
        fetchMembrosMensalidade(),
        fetchMensalidadesAno(ano),
      ]);
      setMembros(membrosData);
      setRows(rowsData);
    } catch (e) {
      setToast({ msg: e instanceof Error ? e.message : 'Erro ao carregar mensalidades.', variant: 'error' });
    } finally {
      if (!silent) setLoading(false);
    }
  }, [ano]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!popover) return;
    const onDoc = (ev: MouseEvent) => {
      const t = ev.target as Node | null;
      if (popRef.current?.contains(t)) return;
      setPopover(null);
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') setPopover(null);
    };
    // Adia o listener para o próximo tick — o mesmo click que abre não fecha na hora.
    // Usa bubble (não capture) para o onClick do item do menu rodar antes.
    const timer = window.setTimeout(() => {
      document.addEventListener('click', onDoc);
    }, 0);
    document.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('click', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [popover]);

  useLayoutEffect(() => {
    if (!popover) return;
    const onScrollOrResize = () => setPopover(null);
    window.addEventListener('resize', onScrollOrResize);
    window.addEventListener('scroll', onScrollOrResize, true);
    return () => {
      window.removeEventListener('resize', onScrollOrResize);
      window.removeEventListener('scroll', onScrollOrResize, true);
    };
  }, [popover]);

  useEffect(() => {
    if (!extrasOpen) return;
    const onDoc = (ev: MouseEvent | TouchEvent) => {
      if (extrasRef.current?.contains(ev.target as Node)) return;
      setExtrasOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('touchstart', onDoc);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('touchstart', onDoc);
    };
  }, [extrasOpen]);

  useEffect(() => {
    if (!canSemCaixa) setBaixarSemCaixa(false);
  }, [canSemCaixa]);

  const filtrados = useMemo(() => {
    const q = busca.trim();
    return membros
      .filter((m) => membroApareceNoAno(m, ano))
      .filter((m) => !q || matchesSearch(m.nome, q));
  }, [membros, ano, busca]);

  const linhas = useMemo(() => {
    return filtrados.map((m) => {
      const cells = montarGradeMembro(m, ano, rows, valorPadrao);
      const abertos = cells.filter((c) => c.status === 'aberto');
      const totalAberto = abertos.reduce((a, c) => a + c.valor, 0);
      return { membro: m, cells, abertosCount: abertos.length, totalAberto };
    });
  }, [filtrados, ano, rows, valorPadrao]);

  const ordenados = useMemo(() => {
    const list = [...linhas];
    const { key, dir } = sort;
    const mul = dir === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      let cmp = 0;
      if (key === 'nome') {
        cmp = a.membro.nome.localeCompare(b.membro.nome, 'pt-BR');
      } else if (key === 'abertos') {
        cmp = a.abertosCount - b.abertosCount;
      } else if (key === 'total') {
        cmp = a.totalAberto - b.totalAberto;
      } else if (key.startsWith('mes-')) {
        const mes = Number(key.slice(4));
        const sa = a.cells.find((c) => c.mes === mes)?.status ?? 'vazio';
        const sb = b.cells.find((c) => c.mes === mes)?.status ?? 'vazio';
        cmp = STATUS_RANK[sa] - STATUS_RANK[sb];
      }
      if (cmp !== 0) return cmp * mul;
      return a.membro.nome.localeCompare(b.membro.nome, 'pt-BR');
    });
    return list;
  }, [linhas, sort]);

  const onSort = (key: SortKey) => {
    setSort((s) => {
      if (s.key === key) return { key, dir: s.dir === 'asc' ? 'desc' : 'asc' };
      return { key, dir: defaultDirFor(key) };
    });
  };

  const kpis = useMemo(
    () => resumirGrade(filtrados, ano, rows, valorPadrao),
    [filtrados, ano, rows, valorPadrao],
  );

  const anoOptions = useMemo((): SearchableSelectOption[] => {
    return [2027, 2026, 2025].map((y) => ({ value: String(y), label: String(y) }));
  }, []);

  const incluirOptions = useMemo((): SearchableSelectOption[] => {
    const idsComLinha = new Set(rows.map((r) => r.pessoa_id));
    return membros
      .filter((m) => membroApareceNoAno(m, ano))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
      .map((m) => ({
        value: m.id,
        label: idsComLinha.has(m.id) ? m.nome : `${m.nome} (novo no ano)`,
      }));
  }, [membros, ano, rows]);

  const textoLista = () => {
    const porNome = [...filtrados].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    return formatListaWhatsApp(porNome, ano, rows, valorPadrao);
  };

  const copiarLista = async () => {
    try {
      await navigator.clipboard.writeText(textoLista());
      setToast({ msg: 'Lista copiada para a área de transferência.', variant: 'success' });
    } catch {
      setToast({ msg: 'Não foi possível copiar.', variant: 'error' });
    }
  };

  const persistStatus = async (
    membro: MembroMensalidade,
    mes: number,
    status: MensalidadeStatus,
    valor: number,
  ): Promise<string> => {
    // Caixa: trigger sync_mensalidade_to_caixa no banco ao marcar pago (exceto sem_caixa).
    const rowId = await setMensalidadeStatus({
      pessoa_id: membro.id,
      ano,
      mes,
      status,
      valor,
      data_pagamento: status === 'pago' ? dataPagamento : null,
      forma_pagamento: status === 'pago' ? formaPagamento : null,
      sem_caixa: status === 'pago' && canSemCaixa && baixarSemCaixa,
    });

    await writeAuditLog({
      action: 'update',
      entity: 'mensalidades',
      entity_id: rowId,
      resumo: `${membro.nome} — ${MESES_LABEL[mes - 1]}/${ano}: ${status}${
        status === 'pago' && canSemCaixa && baixarSemCaixa ? ' (sem caixa)' : ''
      }`,
    });

    return rowId;
  };

  const patchRowLocal = (
    membro: MembroMensalidade,
    mes: number,
    status: MensalidadeStatus,
    valor: number,
    rowId: string,
  ) => {
    setRows((prev) => {
      const idx = prev.findIndex((r) => r.pessoa_id === membro.id && Number(r.mes) === mes && Number(r.ano) === ano);
      const nextRow: MensalidadeRow = {
        id: rowId,
        pessoa_id: membro.id,
        ano,
        mes,
        status,
        valor,
        data_pagamento: status === 'pago' ? dataPagamento : null,
        forma_pagamento: status === 'pago' ? formaPagamento : null,
        obs: idx >= 0 ? prev[idx].obs : null,
      };
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = nextRow;
        return copy;
      }
      return [...prev, nextRow];
    });
  };

  const aplicarStatus = async (
    membro: MembroMensalidade,
    mes: number,
    status: MensalidadeStatus,
    valor: number,
  ) => {
    if (!canEdit) return;
    const prev = rows.find((r) => r.pessoa_id === membro.id && Number(r.mes) === mes && Number(r.ano) === ano);
    setPopover(null);
    // Atualiza a grade na hora; persiste em segundo plano (caixa via trigger no banco).
    patchRowLocal(membro, mes, status, valor, prev?.id ?? `tmp-${membro.id}-${mes}`);
    try {
      const rowId = await persistStatus(membro, mes, status, valor);
      patchRowLocal(membro, mes, status, valor, rowId);
    } catch (e) {
      if (prev) {
        patchRowLocal(membro, mes, prev.status, prev.valor, prev.id);
      } else {
        setRows((list) =>
          list.filter((r) => !(r.pessoa_id === membro.id && Number(r.mes) === mes && Number(r.ano) === ano)),
        );
      }
      setToast({ msg: e instanceof Error ? e.message : 'Erro ao salvar.', variant: 'error' });
    }
  };

  const incluirMembro = async () => {
    if (!incluirMembroId || !canEdit) return;
    setSaving(true);
    try {
      await incluirMembroNoAno(incluirMembroId, ano, valorPadrao);
      await reload({ silent: true });
      setIncluirOpen(false);
      setIncluirMembroId('');
      setToast({ msg: 'Membro incluído na grade do ano.', variant: 'success' });
    } catch (e) {
      setToast({ msg: e instanceof Error ? e.message : 'Erro ao incluir membro.', variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const aplicarLoteTodosMeses = async (status: MensalidadeStatus) => {
    if (!canEdit || !canLote || saving) return;
    setExtrasOpen(false);
    setSaving(true);
    try {
      let qtd = 0;
      for (const m of filtrados) {
        const cells = montarGradeMembro(m, ano, rows, valorPadrao);
        for (const c of cells) {
          if (!celulaEditavel(c, canEdit)) continue;
          if (c.status === status) continue;
          if (c.status === 'vazio' || c.status === 'desligado') continue;
          if (status === 'pago' && c.status !== 'aberto' && c.status !== 'isento') continue;
          if (status === 'aberto' && c.status !== 'pago' && c.status !== 'isento') continue;
          if (status === 'isento' && c.status !== 'aberto' && c.status !== 'pago') continue;
          await persistStatus(m, c.mes, status, c.valor);
          qtd += 1;
        }
      }
      await reload({ silent: true });
      if (!qtd) {
        setToast({
          msg: 'Nenhuma célula elegível no ano (com os filtros atuais).',
          variant: 'error',
        });
      } else {
        const acao =
          status === 'pago' ? 'paga(s)' : status === 'aberto' ? 'reaberta(s)' : 'isentada(s)';
        setToast({
          msg: `${qtd} mensalidade(s) ${acao}${
            status === 'pago' && canSemCaixa && baixarSemCaixa ? ' sem caixa' : ''
          }.`,
          variant: 'success',
        });
      }
    } catch (e) {
      setToast({ msg: e instanceof Error ? e.message : 'Erro na ação em lote.', variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const abrirPopover = (m: MembroMensalidade, c: CelulaMensalidade, btn: HTMLButtonElement | null) => {
    if (!btn) return;
    const isPop = popover?.pessoaId === m.id && popover?.mes === c.mes;
    if (isPop) {
      setPopover(null);
      return;
    }
    setPopover({ pessoaId: m.id, mes: c.mes, anchor: btn.getBoundingClientRect() });
  };

  const renderPopover = (m: MembroMensalidade, c: CelulaMensalidade) => {
    if (!popover || popover.pessoaId !== m.id || popover.mes !== c.mes) return null;
    const a = popover.anchor;
    const width = 168;
    const left = Math.min(Math.max(8, a.left + a.width / 2 - width / 2), window.innerWidth - width - 8);
    const openUp = a.bottom + 160 > window.innerHeight;
    const top = openUp ? Math.max(8, a.top - 8) : a.bottom + 4;
    const style: CSSProperties = openUp
      ? { position: 'fixed', left, bottom: window.innerHeight - top, width, zIndex: 10050 }
      : { position: 'fixed', left, top, width, zIndex: 10050 };

    return createPortal(
      <div
        className="dash-mens__pop dash-mens__pop--portal"
        ref={popRef}
        role="menu"
        style={style}
        onClick={(e) => e.stopPropagation()}
      >
        {STATUS_OPCOES.map((op) => (
          <button
            key={op.value}
            type="button"
            role="menuitem"
            className={c.status === op.value ? 'is-active' : ''}
            disabled={saving}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              void aplicarStatus(m, c.mes, op.value, c.valor);
            }}
          >
            {op.label}
          </button>
        ))}
      </div>,
      document.body,
    );
  };

  return (
    <div className="dash-mens" data-tour="mensalidades">
      <Toast message={toast?.msg ?? null} variant={toast?.variant} onDismiss={() => setToast(null)} />

      <header className="dash-page-head dash-mens__header">
        <div className="dash-page-head__titles">
          <h1>Mensalidades</h1>
          <p className="dash-muted dash-mens__subtitle">
            Valor {money(valorPadrao)} · clique no mês para alterar o status · a partir da data de entrada
          </p>
        </div>
        <div className="dash-page-head__actions dash-mens__actions">
          <button type="button" className="dash-add-button dash-add-button--secondary" onClick={() => void copiarLista()}>
            Copiar lista
          </button>
        </div>
      </header>

      <div className="dash-mens__toolbar">
        <label className="dash-mens__field dash-mens__field--ano">
          <span>Ano</span>
          <SearchableSelect
            options={anoOptions}
            value={String(ano)}
            onChange={(v) => setAno(Number(v))}
            aria-label="Ano"
          />
        </label>
        <label className="dash-mens__field dash-mens__field--busca">
          <span>Busca</span>
          <input
            type="search"
            className="dash-mens__busca"
            placeholder="Buscar nome…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            aria-label="Buscar nome"
          />
        </label>
        <label className="dash-mens__field dash-mens__field--pagamento">
          <span>Pagamento</span>
          <input
            type="date"
            value={dataPagamento}
            onChange={(e) => setDataPagamento(e.target.value)}
            disabled={!canEdit}
            aria-label="Data do pagamento"
          />
        </label>
        {canEdit && (
          <label className="dash-mens__field dash-mens__field--tipo">
            <span>Tipo</span>
            <select
              value={formaPagamento}
              onChange={(e) => setFormaPagamento(e.target.value as typeof formaPagamento)}
              aria-label="Tipo de pagamento"
            >
              {FORMAS_PAGAMENTO.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {canEdit && canLote && (
          <div className="dash-mens__extras" ref={extrasRef}>
            <button
              type="button"
              className={`dash-add-button dash-add-button--secondary${extrasOpen ? ' is-open' : ''}`}
              aria-expanded={extrasOpen}
              aria-haspopup="true"
              onClick={() => setExtrasOpen((v) => !v)}
            >
              Opções
            </button>
            {extrasOpen && (
              <div className="dash-mens__extras-menu" role="menu">
                {canSemCaixa && (
                  <label className="dash-mens__extras-check">
                    <input
                      type="checkbox"
                      checked={baixarSemCaixa}
                      onChange={(e) => setBaixarSemCaixa(e.target.checked)}
                    />
                    <span>Baixar sem caixa</span>
                  </label>
                )}
                <div className="dash-mens__extras-lote">
                  <button
                    type="button"
                    className="dash-mens__extras-lote-action dash-add-button dash-add-button--secondary"
                    disabled={saving}
                    onClick={() => void aplicarLoteTodosMeses('pago')}
                  >
                    Pagar todas
                  </button>
                  <button
                    type="button"
                    className="dash-mens__extras-lote-action dash-add-button dash-add-button--secondary"
                    disabled={saving}
                    onClick={() => void aplicarLoteTodosMeses('aberto')}
                  >
                    Abrir todas
                  </button>
                  <button
                    type="button"
                    className="dash-mens__extras-lote-action dash-add-button dash-add-button--secondary"
                    disabled={saving}
                    onClick={() => void aplicarLoteTodosMeses('isento')}
                  >
                    Isentar todas
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="dash-grid-stats dash-mens__kpis">
        <article className="dash-card dash-mens__kpi dash-mens__kpi--recebido">
          <h3>Recebido</h3>
          <p className="dash-big dash-big--money">{money(kpis.recebido)}</p>
        </article>
        <article className="dash-card dash-mens__kpi dash-mens__kpi--aberto">
          <h3>Em aberto</h3>
          <p className="dash-big dash-big--money">{money(kpis.emAberto)}</p>
        </article>
        <article className="dash-card dash-mens__kpi dash-mens__kpi--atrasado">
          <h3>Atrasado (após 10 dias)</h3>
          <p className="dash-big dash-big--money">{money(kpis.atrasado)}</p>
        </article>
      </div>

      <div className="dash-mens__legend dash-mens__desktop-only" aria-hidden="true">
        <span className="dash-mens__legend-item">
          <i className="dash-mens__cell dash-mens__cell--aberto">A</i> Aberto
        </span>
        <span className="dash-mens__legend-item">
          <i className="dash-mens__cell dash-mens__cell--pago">P</i> Pago
        </span>
        <span className="dash-mens__legend-item">
          <i className="dash-mens__cell dash-mens__cell--isento">I</i> Isento
        </span>
        <span className="dash-mens__legend-item">
          <i className="dash-mens__cell dash-mens__cell--desligado">D</i> Desligado
        </span>
        <span className="dash-mens__legend-item">
          <i className="dash-mens__cell dash-mens__cell--vazio" /> Futuro / antes da entrada
        </span>
      </div>

      <div className="dash-mens__scroll">
      {/* Desktop: tabela */}
      <div className="dash-mens__table-wrap dash-mens__desktop-only">
        {loading ? (
          <p className="dash-muted dash-mens__loading">Carregando grade…</p>
        ) : (
          <table className="dash-mens__table">
            <thead>
              <tr>
                <SortTh
                  label="Membro"
                  sortKey="nome"
                  activeKey={sort.key}
                  dir={sort.dir}
                  onSort={onSort}
                  title="Ordenar por membro (A–Z / Z–A)"
                  className="dash-mens__col-membro"
                />
                {MESES_LABEL.map((label, i) => {
                  const mes = (i + 1) as number;
                  const key = `mes-${mes}` as SortKey;
                  return (
                    <SortTh
                      key={label}
                      label={label}
                      sortKey={key}
                      activeKey={sort.key}
                      dir={sort.dir}
                      onSort={onSort}
                      title={`Ordenar por ${label} (status)`}
                      className="dash-mens__col-mes"
                    />
                  );
                })}
                <SortTh
                  label="Abertos"
                  sortKey="abertos"
                  activeKey={sort.key}
                  dir={sort.dir}
                  onSort={onSort}
                  title="Ordenar por quantidade em aberto"
                  className="dash-mens__col-num"
                />
                <SortTh
                  label="Total em aberto"
                  sortKey="total"
                  activeKey={sort.key}
                  dir={sort.dir}
                  onSort={onSort}
                  title="Ordenar por total em aberto"
                  className="dash-mens__col-total"
                />
              </tr>
            </thead>
            <tbody>
              {ordenados.map(({ membro: m, cells, abertosCount, totalAberto }) => (
                <tr key={m.id}>
                  <th scope="row" className="dash-mens__col-membro" title={m.nome}>
                    {m.nome}
                  </th>
                  {cells.map((c) => {
                    const editavel = celulaEditavel(c, canEdit);
                    return (
                      <td key={c.mes} className="dash-mens__cell-wrap">
                        <button
                          type="button"
                          className={`dash-mens__cell dash-mens__cell--${modifierCelula(c.status)}`}
                          disabled={!editavel || saving}
                          title={`${MESES_LABEL[c.mes - 1]} — ${statusLabel(c.status)}`}
                          aria-label={`${m.nome}, ${MESES_LABEL[c.mes - 1]}: ${statusLabel(c.status)}`}
                          onClick={(e) => {
                            if (!editavel) return;
                            abrirPopover(m, c, e.currentTarget);
                          }}
                        >
                          {letraCelula(c.status)}
                        </button>
                        {renderPopover(m, c)}
                      </td>
                    );
                  })}
                  <td className="dash-mens__col-num">{abertosCount}</td>
                  <td className="dash-mens__col-total">{money(totalAberto)}</td>
                </tr>
              ))}
            </tbody>
            {canEdit && (
              <tfoot>
                <tr className="dash-mens__incluir-row">
                  <td colSpan={COLSPAN_GRADE} className="dash-mens__incluir-cell">
                    <IncluirMembroBar
                      open={incluirOpen}
                      options={incluirOptions}
                      value={incluirMembroId}
                      saving={saving}
                      onOpen={() => setIncluirOpen(true)}
                      onChange={setIncluirMembroId}
                      onIncluir={() => void incluirMembro()}
                      onCancel={() => {
                        setIncluirOpen(false);
                        setIncluirMembroId('');
                      }}
                    />
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        )}
        {!loading && !ordenados.length && (
          <p className="dash-muted dash-mens__loading">Nenhum membro para os filtros atuais.</p>
        )}
      </div>

      {/* Mobile: cards com grade 4×3 */}
      <div className="dash-mens__cards dash-mens__mobile-only">
        {loading && <p className="dash-muted dash-mens__loading">Carregando grade…</p>}
        {!loading &&
          ordenados.map(({ membro: m, cells, abertosCount, totalAberto }) => (
            <article key={m.id} className="dash-mens__card">
              <header className="dash-mens__card-head">
                <h3 className="dash-mens__card-nome">{m.nome}</h3>
                <p className="dash-mens__card-resumo">
                  {abertosCount} aberto{abertosCount === 1 ? '' : 's'} {money(totalAberto)}
                </p>
              </header>
              <div className="dash-mens__month-grid">
                {cells.map((c) => {
                  const editavel = celulaEditavel(c, canEdit);
                  return (
                    <div key={c.mes} className="dash-mens__tile-wrap">
                      <button
                        type="button"
                        className={`dash-mens__tile dash-mens__tile--${modifierCelula(c.status)}`}
                        disabled={!editavel || saving}
                        title={`${MESES_LABEL[c.mes - 1]} — ${statusLabel(c.status)}`}
                        aria-label={`${m.nome}, ${MESES_LABEL[c.mes - 1]}: ${statusLabel(c.status)}`}
                        onClick={(e) => {
                          if (!editavel) return;
                          abrirPopover(m, c, e.currentTarget);
                        }}
                      >
                        <span className="dash-mens__tile-mes">{MESES_LABEL[c.mes - 1]}</span>
                        <span className="dash-mens__tile-cod">{codigoCelula(c.status)}</span>
                      </button>
                      {renderPopover(m, c)}
                    </div>
                  );
                })}
              </div>
            </article>
          ))}
        {canEdit && !loading && (
          <div className="dash-mens__incluir-foot">
            <IncluirMembroBar
              open={incluirOpen}
              options={incluirOptions}
              value={incluirMembroId}
              saving={saving}
              onOpen={() => setIncluirOpen(true)}
              onChange={setIncluirMembroId}
              onIncluir={() => void incluirMembro()}
              onCancel={() => {
                setIncluirOpen(false);
                setIncluirMembroId('');
              }}
            />
          </div>
        )}
        {!loading && !ordenados.length && (
          <p className="dash-muted dash-mens__loading">Nenhum membro para os filtros atuais.</p>
        )}
      </div>
      </div>
    </div>
  );
}
