import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { createCaixaManual } from '../../../services/caixa';
import { writeAuditLog } from '../../../services/auditLog';
import { SearchableSelect, type SearchableSelectOption } from '../SearchableSelect';
import { Toast } from '../Toast';

type Props = { canEdit?: boolean };

type PopoverTarget = {
  pessoaId: string;
  mes: number;
};

const STATUS_OPCOES: { value: MensalidadeStatus; label: string }[] = [
  { value: 'aberto', label: 'Em aberto' },
  { value: 'pago', label: 'Pago ✓' },
  { value: 'isento', label: 'Isento' },
  { value: 'desligado', label: 'Desligado' },
];

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

export function MensalidadesScreen({ canEdit = true }: Props) {
  const yearNow = new Date().getFullYear();
  const mesNow = new Date().getMonth() + 1;
  const [ano, setAno] = useState(yearNow);
  const [busca, setBusca] = useState('');
  const [dataPagamento, setDataPagamento] = useState(() => new Date().toISOString().slice(0, 10));
  const [semCaixa, setSemCaixa] = useState(false);
  const [valorPadrao, setValorPadrao] = useState(20);
  const [membros, setMembros] = useState<MembroMensalidade[]>([]);
  const [rows, setRows] = useState<MensalidadeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; variant: 'success' | 'error' } | null>(null);
  const [popover, setPopover] = useState<PopoverTarget | null>(null);
  const [incluirOpen, setIncluirOpen] = useState(false);
  const [incluirMembroId, setIncluirMembroId] = useState('');
  const [bulkOpen, setBulkOpen] = useState(false);
  const popRef = useRef<HTMLDivElement>(null);

  const reload = useCallback(async () => {
    setLoading(true);
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
      setLoading(false);
    }
  }, [ano]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!popover) return;
    const onDoc = (ev: MouseEvent | TouchEvent) => {
      if (popRef.current?.contains(ev.target as Node)) return;
      setPopover(null);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('touchstart', onDoc);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('touchstart', onDoc);
    };
  }, [popover]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return membros
      .filter((m) => membroApareceNoAno(m, ano))
      .filter((m) => !q || m.nome.toLowerCase().includes(q))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [membros, ano, busca]);

  const kpis = useMemo(
    () => resumirGrade(filtrados, ano, rows, valorPadrao),
    [filtrados, ano, rows, valorPadrao],
  );

  const anoOptions = useMemo((): SearchableSelectOption[] => {
    const anos: number[] = [];
    for (let y = yearNow + 1; y >= yearNow - 5; y -= 1) anos.push(y);
    return anos.map((y) => ({ value: String(y), label: String(y) }));
  }, [yearNow]);

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

  const mesBulk = ano === yearNow ? mesNow : ano < yearNow ? 12 : 0;

  const textoLista = () => formatListaWhatsApp(filtrados, ano, rows, valorPadrao);

  const copiarLista = async () => {
    try {
      await navigator.clipboard.writeText(textoLista());
      setToast({ msg: 'Lista copiada para a área de transferência.', variant: 'success' });
    } catch {
      setToast({ msg: 'Não foi possível copiar.', variant: 'error' });
    }
  };

  const compartilhar = async () => {
    const texto = textoLista();
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: `Mensalidades ${ano}`, text: texto });
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(texto);
      setToast({ msg: 'Lista copiada (compartilhamento indisponível neste navegador).', variant: 'success' });
    } catch {
      setToast({ msg: 'Não foi possível compartilhar.', variant: 'error' });
    }
  };

  const persistStatus = async (
    membro: MembroMensalidade,
    mes: number,
    status: MensalidadeStatus,
    valor: number,
  ) => {
    const rowId = await setMensalidadeStatus({
      pessoa_id: membro.id,
      ano,
      mes,
      status,
      valor,
      data_pagamento: status === 'pago' ? dataPagamento : null,
      forma_pagamento: status === 'pago' ? 'PIX' : null,
    });

    if (status === 'pago' && !semCaixa) {
      await createCaixaManual({
        data: dataPagamento,
        tipo: 'entrada',
        categoria: 'Mensalidade',
        descricao: `Mensalidade ${MESES_LABEL[mes - 1]}/${ano} — ${membro.nome}`,
        valor,
        forma_pagamento: 'PIX',
      });
    }

    await writeAuditLog({
      action: 'update',
      entity: 'mensalidades',
      entity_id: rowId,
      resumo: `${membro.nome} — ${MESES_LABEL[mes - 1]}/${ano}: ${status}`,
    });
  };

  const aplicarStatus = async (
    membro: MembroMensalidade,
    mes: number,
    status: MensalidadeStatus,
    valor: number,
  ) => {
    if (!canEdit || saving) return;
    setSaving(true);
    setPopover(null);
    try {
      await persistStatus(membro, mes, status, valor);
      const fresh = await fetchMensalidadesAno(ano);
      setRows(fresh);
      setToast({ msg: 'Mensalidade atualizada.', variant: 'success' });
    } catch (e) {
      setToast({ msg: e instanceof Error ? e.message : 'Erro ao salvar.', variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const incluirMembro = async () => {
    if (!incluirMembroId || !canEdit) return;
    setSaving(true);
    try {
      await incluirMembroNoAno(incluirMembroId, ano, valorPadrao);
      await reload();
      setIncluirOpen(false);
      setIncluirMembroId('');
      setToast({ msg: 'Membro incluído na grade do ano.', variant: 'success' });
    } catch (e) {
      setToast({ msg: e instanceof Error ? e.message : 'Erro ao incluir membro.', variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const marcarMesAtualPagoFiltrados = async () => {
    if (!canEdit || !mesBulk || saving) return;
    setBulkOpen(false);
    setSaving(true);
    try {
      let qtd = 0;
      for (const m of filtrados) {
        const cells = montarGradeMembro(m, ano, rows, valorPadrao);
        const c = cells.find((x) => x.mes === mesBulk);
        if (!c || c.status !== 'aberto') continue;
        await persistStatus(m, mesBulk, 'pago', c.valor);
        qtd += 1;
      }
      const fresh = await fetchMensalidadesAno(ano);
      setRows(fresh);
      setToast({
        msg:
          qtd > 0
            ? `${qtd} mensalidade${qtd === 1 ? '' : 's'} de ${MESES_LABEL[mesBulk - 1]} marcada${qtd === 1 ? '' : 's'} como paga.`
            : 'Nenhuma mensalidade em aberto no mês para os filtrados.',
        variant: 'success',
      });
    } catch (e) {
      setToast({ msg: e instanceof Error ? e.message : 'Erro na ação em lote.', variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const renderPopover = (m: MembroMensalidade, c: CelulaMensalidade) => (
    <div className="dash-mens__pop" ref={popRef} role="menu">
      {STATUS_OPCOES.map((op) => (
        <button
          key={op.value}
          type="button"
          role="menuitem"
          className={c.status === op.value ? 'is-active' : ''}
          onClick={() => void aplicarStatus(m, c.mes, op.value, c.valor)}
        >
          {op.label}
        </button>
      ))}
    </div>
  );

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
          <button type="button" className="dash-add-button dash-add-button--secondary" onClick={() => void compartilhar()}>
            Compartilhar
          </button>
          {canEdit && (
            <button
              type="button"
              className="dash-btn-primary"
              onClick={() => setIncluirOpen((v) => !v)}
            >
              + Incluir membro
            </button>
          )}
        </div>
      </header>

      {incluirOpen && canEdit && (
        <div className="dash-mens__incluir">
          <SearchableSelect
            options={incluirOptions}
            value={incluirMembroId}
            onChange={setIncluirMembroId}
            placeholder="Membro ativo no ano…"
            searchPlaceholder="Buscar membro…"
            aria-label="Incluir membro"
          />
          <button type="button" className="dash-btn-primary" disabled={!incluirMembroId || saving} onClick={() => void incluirMembro()}>
            Incluir
          </button>
          <button type="button" className="dash-add-button dash-add-button--secondary" onClick={() => setIncluirOpen(false)}>
            Cancelar
          </button>
        </div>
      )}

      <div className="dash-mens__toolbar">
        <div className="dash-mens__filters">
          <SearchableSelect
            options={anoOptions}
            value={String(ano)}
            onChange={(v) => setAno(Number(v))}
            aria-label="Ano"
          />
          <input
            type="search"
            className="dash-mens__busca"
            placeholder="Buscar nome…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            aria-label="Buscar nome"
          />
        </div>
        <div className="dash-mens__tools">
          <label className="dash-mens__date">
            <span>Pagamento</span>
            <input
              type="date"
              value={dataPagamento}
              onChange={(e) => setDataPagamento(e.target.value)}
              disabled={!canEdit}
              aria-label="Data do pagamento"
            />
          </label>
          <label className="dash-mens__check">
            <input
              type="checkbox"
              checked={semCaixa}
              onChange={(e) => setSemCaixa(e.target.checked)}
              disabled={!canEdit}
            />
            Sem caixa
          </label>
          {canEdit && (
            <div className="dash-mens__bulk-wrap">
              <button
                type="button"
                className="dash-add-button dash-add-button--secondary"
                disabled={!mesBulk}
                onClick={() => setBulkOpen((v) => !v)}
              >
                Ações em lote
              </button>
              {bulkOpen && mesBulk > 0 && (
                <div className="dash-mens__bulk-menu">
                  <button type="button" disabled={saving} onClick={() => void marcarMesAtualPagoFiltrados()}>
                    Marcar {MESES_LABEL[mesBulk - 1]} pago (filtrados)
                  </button>
                </div>
              )}
            </div>
          )}
          {saving && <span className="dash-muted dash-mens__saving">Atualizando…</span>}
        </div>
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
          <h3>Atrasado (após dia 15)</h3>
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

      {/* Desktop: tabela */}
      <div className="dash-mens__table-wrap dash-mens__desktop-only">
        {loading ? (
          <p className="dash-muted dash-mens__loading">Carregando grade…</p>
        ) : (
          <table className="dash-mens__table">
            <thead>
              <tr>
                <th className="dash-mens__col-membro">Membro</th>
                {MESES_LABEL.map((label) => (
                  <th key={label} className="dash-mens__col-mes">
                    {label}
                  </th>
                ))}
                <th className="dash-mens__col-num">Abertos</th>
                <th className="dash-mens__col-total">Total em aberto</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((m) => {
                const cells = montarGradeMembro(m, ano, rows, valorPadrao);
                const abertos = cells.filter((c) => c.status === 'aberto');
                const totalAberto = abertos.reduce((a, c) => a + c.valor, 0);
                return (
                  <tr key={m.id}>
                    <th scope="row" className="dash-mens__col-membro" title={m.nome}>
                      {m.nome}
                    </th>
                    {cells.map((c) => {
                      const editavel = celulaEditavel(c, canEdit);
                      const isPop = popover?.pessoaId === m.id && popover?.mes === c.mes;
                      return (
                        <td key={c.mes} className="dash-mens__cell-wrap">
                          <button
                            type="button"
                            className={`dash-mens__cell dash-mens__cell--${modifierCelula(c.status)}`}
                            disabled={!editavel || saving}
                            title={`${MESES_LABEL[c.mes - 1]} — ${statusLabel(c.status)}`}
                            aria-label={`${m.nome}, ${MESES_LABEL[c.mes - 1]}: ${statusLabel(c.status)}`}
                            onClick={() => {
                              if (!editavel) return;
                              setPopover(isPop ? null : { pessoaId: m.id, mes: c.mes });
                            }}
                          >
                            {letraCelula(c.status)}
                          </button>
                          {isPop && renderPopover(m, c)}
                        </td>
                      );
                    })}
                    <td className="dash-mens__col-num">{abertos.length}</td>
                    <td className="dash-mens__col-total">{money(totalAberto)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {!loading && !filtrados.length && (
          <p className="dash-muted dash-mens__loading">Nenhum membro para os filtros atuais.</p>
        )}
      </div>

      {/* Mobile: cards com grade 4×3 */}
      <div className="dash-mens__cards dash-mens__mobile-only">
        {loading && <p className="dash-muted dash-mens__loading">Carregando grade…</p>}
        {!loading &&
          filtrados.map((m) => {
            const cells = montarGradeMembro(m, ano, rows, valorPadrao);
            const abertos = cells.filter((c) => c.status === 'aberto');
            const totalAberto = abertos.reduce((a, c) => a + c.valor, 0);
            return (
              <article key={m.id} className="dash-mens__card">
                <header className="dash-mens__card-head">
                  <h3 className="dash-mens__card-nome">{m.nome}</h3>
                  <p className="dash-mens__card-resumo">
                    {abertos.length} aberto{abertos.length === 1 ? '' : 's'} {money(totalAberto)}
                  </p>
                </header>
                <div className="dash-mens__month-grid">
                  {cells.map((c) => {
                    const editavel = celulaEditavel(c, canEdit);
                    const isPop = popover?.pessoaId === m.id && popover?.mes === c.mes;
                    return (
                      <div key={c.mes} className="dash-mens__tile-wrap">
                        <button
                          type="button"
                          className={`dash-mens__tile dash-mens__tile--${modifierCelula(c.status)}`}
                          disabled={!editavel || saving}
                          title={`${MESES_LABEL[c.mes - 1]} — ${statusLabel(c.status)}`}
                          aria-label={`${m.nome}, ${MESES_LABEL[c.mes - 1]}: ${statusLabel(c.status)}`}
                          onClick={() => {
                            if (!editavel) return;
                            setPopover(isPop ? null : { pessoaId: m.id, mes: c.mes });
                          }}
                        >
                          <span className="dash-mens__tile-mes">{MESES_LABEL[c.mes - 1]}</span>
                          <span className="dash-mens__tile-cod">{codigoCelula(c.status)}</span>
                        </button>
                        {isPop && renderPopover(m, c)}
                      </div>
                    );
                  })}
                </div>
              </article>
            );
          })}
        {!loading && !filtrados.length && (
          <p className="dash-muted dash-mens__loading">Nenhum membro para os filtros atuais.</p>
        )}
      </div>
    </div>
  );
}
