import { useEffect, useMemo, useState } from 'react';
import {
  clienteEhFilhoDeSanto,
  emAbertoCliente,
  fetchClientes,
  fetchMembrosParaMatch,
  fetchVisitas,
  restoreCliente,
  saveCliente,
  saveVisita,
  softDeleteCliente,
  softDeleteVisita,
  type Cliente,
  type ClienteVisita,
  type MembroMatch,
} from '../../../services/atendimento';
import { fetchConfigIle } from '../../../services/configIle';
import { buildMailtoLink, buildWaMeLink, openExternal } from '../../../utils/whatsappLink';
import { formatarTelefoneMascara, somenteDigitosTelefone } from '../../../utils/telefone';
import { formatMoneyBRL, parseValorInput, sanitizeValorInput } from '../../../utils/money';
import { formatDateBR } from '../../../utils/formatDate';
import { baixarReciboAtendimento } from '../../../utils/reciboAtendimento';
import { writeAuditLog, buildAuditDiff } from '../../../services/auditLog';
import { SearchableSelect, type SearchableSelectOption } from '../SearchableSelect';
import { Toast } from '../Toast';

const VISITA_PAGO_FILTRO_OPTIONS: SearchableSelectOption[] = [
  { value: 'todos', label: 'Todas' },
  { value: 'pago', label: 'Só pagas' },
  { value: 'aberto', label: 'Só em aberto' },
];

const VISITA_ORDEM_OPTIONS: SearchableSelectOption[] = [
  { value: 'recente', label: 'Mais recentes' },
  { value: 'antigo', label: 'Mais antigas' },
];

const CLIENTE_FIELD_LABELS: Record<string, string> = {
  nome: 'Nome',
  data_nascimento: 'Data de nascimento',
  whatsapp: 'WhatsApp',
  email: 'E-mail',
  obs: 'Observações',
  pessoa_id: 'Membro (filho de santo)',
};

function FilhoDeSantoTag() {
  return <span className="dash-clientes__tag-fds">Filho de santo</span>;
}

type VisitaPagoFiltro = 'todos' | 'pago' | 'aberto';
type VisitaOrdem = 'recente' | 'antigo';

function valorToInput(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return '';
  return String(Number(n)).replace('.', ',');
}

type Props = {
  canCreate?: boolean;
  canUpdate?: boolean;
  canDelete?: boolean;
  canSend?: boolean;
  canRestore?: boolean;
  onNovoOrcamento?: (clienteId: string) => void;
  onAgendar?: (clienteId: string) => void;
};

export function ClientesScreen({
  canCreate = true,
  canUpdate = true,
  canDelete = true,
  canSend = true,
  canRestore = false,
  onNovoOrcamento,
  onAgendar,
}: Props) {
  const [lista, setLista] = useState<Cliente[]>([]);
  const [membros, setMembros] = useState<MembroMatch[]>([]);
  const [busca, setBusca] = useState('');
  const [soEmAberto, setSoEmAberto] = useState(false);
  const [verExcluidos, setVerExcluidos] = useState(false);
  const [abertos, setAbertos] = useState<Record<string, number>>({});
  const [sel, setSel] = useState<Cliente | null>(null);
  const [visitas, setVisitas] = useState<ClienteVisita[]>([]);
  const [visitaBusca, setVisitaBusca] = useState('');
  const [visitaPagoFiltro, setVisitaPagoFiltro] = useState<VisitaPagoFiltro>('todos');
  const [visitaOrdem, setVisitaOrdem] = useState<VisitaOrdem>('recente');
  const [editVisitaId, setEditVisitaId] = useState<string | null>(null);
  const [deleteVisita, setDeleteVisita] = useState<ClienteVisita | null>(null);
  const [deletingVisita, setDeletingVisita] = useState(false);
  const [toast, setToast] = useState<{ msg: string; variant: 'success' | 'error' } | null>(null);
  const [sheet, setSheet] = useState<'cliente' | 'visita' | null>(null);
  const [clienteAba, setClienteAba] = useState<'ficha' | 'acoes' | 'visitas'>('ficha');
  const [pix, setPix] = useState('');
  const [pixTipo, setPixTipo] = useState<string | null>(null);
  const [pixQr, setPixQr] = useState<string | null>(null);
  const [ileNome, setIleNome] = useState('');
  const [ileLogo, setIleLogo] = useState<string | null>(null);
  const [form, setForm] = useState({
    nome: '',
    data_nascimento: '',
    whatsapp: '',
    email: '',
    obs: '',
    pessoa_id: '',
  });
  const [visitaForm, setVisitaForm] = useState({
    data: new Date().toISOString().slice(0, 10),
    resumo: '',
    valor: '',
    pago: false,
  });

  const reload = async () => {
    const [rows, mems] = await Promise.all([fetchClientes(verExcluidos), fetchMembrosParaMatch()]);
    setLista(rows);
    setMembros(mems);
    const map: Record<string, number> = {};
    await Promise.all(
      rows
        .filter((c) => !c.deleted_at)
        .map(async (c) => {
          map[c.id] = await emAbertoCliente(c.id);
        }),
    );
    setAbertos(map);
  };

  useEffect(() => {
    void reload().catch((e) => setToast({ msg: e.message, variant: 'error' }));
    fetchConfigIle()
      .then((c) => {
        setPix(c.chave_pix ?? '');
        setPixTipo(c.chave_pix_tipo ?? null);
        setPixQr(c.pix_qr_base64 ?? null);
        setIleNome(c.nome_ile ?? '');
        setIleLogo(c.logo_base64 ?? null);
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recarrega ao mudar filtro de inativados
  }, [verExcluidos]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const qDigits = somenteDigitosTelefone(busca);
    return lista.filter((c) => {
      if (soEmAberto && !(abertos[c.id] > 0)) return false;
      if (!q) return true;
      const blob = `${c.nome} ${c.whatsapp ?? ''} ${c.email ?? ''}`.toLowerCase();
      const wa = somenteDigitosTelefone(c.whatsapp);
      return blob.includes(q) || (qDigits.length > 0 && wa.includes(qDigits));
    });
  }, [lista, busca, soEmAberto, abertos]);

  const membroOptions = useMemo(
    (): SearchableSelectOption[] => [
      { value: '', label: '— Não vinculado —' },
      ...membros.map((m) => ({ value: m.id, label: m.nome })),
    ],
    [membros],
  );

  const isFilhoDeSanto = (c: Cliente) => Boolean(clienteEhFilhoDeSanto(c, membros));

  const visitasFiltradas = useMemo(() => {
    const q = visitaBusca.trim().toLowerCase();
    const rows = visitas.filter((v) => {
      if (visitaPagoFiltro === 'pago' && !v.pago) return false;
      if (visitaPagoFiltro === 'aberto' && v.pago) return false;
      if (!q) return true;
      const blob = `${v.resumo ?? ''} ${v.data} ${v.valor ?? ''} ${v.pago ? 'pago' : 'aberto'}`.toLowerCase();
      return blob.includes(q) || formatDateBR(v.data).toLowerCase().includes(q);
    });
    rows.sort((a, b) => {
      const cmp = String(a.data).localeCompare(String(b.data));
      return visitaOrdem === 'recente' ? -cmp : cmp;
    });
    return rows;
  }, [visitas, visitaBusca, visitaPagoFiltro, visitaOrdem]);

  const backToList = () => {
    setSel(null);
    setVisitas([]);
    setSheet(null);
    setClienteAba('ficha');
    setEditVisitaId(null);
    setDeleteVisita(null);
    setVisitaBusca('');
    setVisitaPagoFiltro('todos');
    setVisitaOrdem('recente');
  };

  const openCliente = async (c: Cliente) => {
    setSel(c);
    setClienteAba('ficha');
    setVisitaBusca('');
    setVisitaPagoFiltro('todos');
    setVisitaOrdem('recente');
    setEditVisitaId(null);
    setDeleteVisita(null);
    setVisitas(await fetchVisitas(c.id));
  };

  const abrirNovaVisita = () => {
    setEditVisitaId(null);
    setVisitaForm({
      data: new Date().toISOString().slice(0, 10),
      resumo: '',
      valor: '',
      pago: false,
    });
    setSheet('visita');
  };

  const abrirEditarVisita = (v: ClienteVisita) => {
    setEditVisitaId(v.id);
    setVisitaForm({
      data: v.data.slice(0, 10),
      resumo: v.resumo ?? '',
      valor: valorToInput(v.valor),
      pago: v.pago,
    });
    setSheet('visita');
  };

  const salvarCliente = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const isUpdate = Boolean(sel && sheet === 'cliente' && sel.id);
      const before = isUpdate
        ? {
            nome: sel!.nome,
            data_nascimento: sel!.data_nascimento || '',
            whatsapp: somenteDigitosTelefone(sel!.whatsapp) || '',
            email: sel!.email || '',
            obs: sel!.obs || '',
            pessoa_id: sel!.pessoa_id || '',
          }
        : null;
      const after = {
        nome: form.nome,
        data_nascimento: form.data_nascimento || '',
        whatsapp: somenteDigitosTelefone(form.whatsapp) || '',
        email: form.email || '',
        obs: form.obs || '',
        pessoa_id: form.pessoa_id || '',
      };
      // Se não vinculou manualmente, tenta casar por e-mail/WhatsApp com um membro
      let pessoaId = form.pessoa_id || null;
      if (!pessoaId) {
        const match = clienteEhFilhoDeSanto(
          { pessoa_id: null, whatsapp: form.whatsapp, email: form.email },
          membros,
        );
        if (match) pessoaId = match.id;
      }
      const id = await saveCliente({
        id: isUpdate ? sel!.id : undefined,
        nome: form.nome,
        data_nascimento: form.data_nascimento || null,
        whatsapp: somenteDigitosTelefone(form.whatsapp) || null,
        email: form.email || null,
        obs: form.obs || null,
        pessoa_id: pessoaId,
      });
      await writeAuditLog({
        action: isUpdate ? 'update' : 'create',
        entity: 'clientes',
        entity_id: id,
        resumo: form.nome,
        diff: buildAuditDiff('Clientes', before, after, CLIENTE_FIELD_LABELS),
      });
      setSheet(null);
      await reload();
      const again = (await fetchClientes(verExcluidos)).find((x) => x.id === id);
      if (again) await openCliente(again);
      setToast({ msg: 'Cliente salvo.', variant: 'success' });
    } catch (err) {
      setToast({ msg: err instanceof Error ? err.message : 'Erro', variant: 'error' });
    }
  };

  const salvarVisita = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sel) return;
    const wasEdit = Boolean(editVisitaId);
    try {
      await saveVisita({
        id: editVisitaId ?? undefined,
        cliente_id: sel.id,
        data: visitaForm.data,
        resumo: visitaForm.resumo,
        valor: parseValorInput(visitaForm.valor),
        pago: visitaForm.pago,
      });
      setSheet(null);
      setEditVisitaId(null);
      setVisitaForm({
        data: new Date().toISOString().slice(0, 10),
        resumo: '',
        valor: '',
        pago: false,
      });
      setVisitas(await fetchVisitas(sel.id));
      await reload();
      setToast({ msg: wasEdit ? 'Visita atualizada.' : 'Visita registada.', variant: 'success' });
    } catch (err) {
      setToast({ msg: err instanceof Error ? err.message : 'Erro', variant: 'error' });
    }
  };

  const confirmarExcluirVisita = async () => {
    if (!sel || !deleteVisita) return;
    setDeletingVisita(true);
    try {
      await softDeleteVisita(deleteVisita.id);
      await writeAuditLog({
        action: 'delete',
        entity: 'cliente_visitas',
        entity_id: deleteVisita.id,
        resumo: `${sel.nome} — ${formatDateBR(deleteVisita.data)}`,
      });
      setDeleteVisita(null);
      setVisitas(await fetchVisitas(sel.id));
      await reload();
      setToast({ msg: 'Visita excluída.', variant: 'success' });
    } catch (err) {
      setToast({ msg: err instanceof Error ? err.message : 'Erro', variant: 'error' });
    } finally {
      setDeletingVisita(false);
    }
  };

  const marcarVisitaPaga = async (v: ClienteVisita) => {
    if (!sel) return;
    try {
      await saveVisita({ ...v, cliente_id: sel.id, data: v.data, pago: true });
      setVisitas(await fetchVisitas(sel.id));
      await reload();
      setToast({ msg: 'Visita marcada como paga.', variant: 'success' });
    } catch (err) {
      setToast({ msg: err instanceof Error ? err.message : 'Erro', variant: 'error' });
    }
  };

  const excluirCliente = async (c: Cliente) => {
    if (!window.confirm(`Excluir o cliente “${c.nome}”?`)) return;
    try {
      await softDeleteCliente(c.id);
      await writeAuditLog({
        action: 'delete',
        entity: 'clientes',
        entity_id: c.id,
        resumo: c.nome,
        diff: buildAuditDiff(
          'Clientes',
          {
            nome: c.nome,
            data_nascimento: c.data_nascimento || '',
            whatsapp: somenteDigitosTelefone(c.whatsapp) || '',
            email: c.email || '',
            obs: c.obs || '',
          },
          null,
          CLIENTE_FIELD_LABELS,
        ),
      });
      await reload();
      if (sel?.id === c.id) backToList();
      setToast({ msg: 'Cliente excluído.', variant: 'success' });
    } catch (err) {
      setToast({ msg: err instanceof Error ? err.message : 'Erro', variant: 'error' });
    }
  };

  const emitirRecibo = (v: ClienteVisita, cliente: Cliente) => {
    try {
      baixarReciboAtendimento({
        ileNome,
        logoBase64: ileLogo,
        chavePix: pix,
        chavePixTipo: pixTipo,
        pixQrBase64: pixQr,
        clienteNome: cliente.nome,
        data: v.data,
        resumo: v.resumo,
        valor: v.valor != null ? Number(v.valor) : null,
        pago: v.pago,
      });
    } catch (err) {
      setToast({ msg: err instanceof Error ? err.message : 'Erro ao gerar recibo.', variant: 'error' });
    }
  };

  const msgCobranca = (c: Cliente, valor: number) =>
    [
      `Olá ${c.nome},`,
      '',
      `Lembramos o valor em aberto de ${formatMoneyBRL(valor)} referente a atendimentos em ${ileNome || 'nossa casa'}.`,
      pix ? `Pix: ${pix}` : '',
      '',
      'Obrigado!',
    ]
      .filter(Boolean)
      .join('\n');

  if (sel) {
    const emAberto = abertos[sel.id] || 0;
    const abrirEdicaoCliente = () => {
      const match = clienteEhFilhoDeSanto(sel, membros);
      setForm({
        nome: sel.nome,
        data_nascimento: sel.data_nascimento ?? '',
        whatsapp: somenteDigitosTelefone(sel.whatsapp),
        email: sel.email ?? '',
        obs: sel.obs ?? '',
        pessoa_id: sel.pessoa_id || match?.id || '',
      });
      setSheet('cliente');
    };

    return (
      <div className="dash-clientes" data-tour="atendimento-clientes">
        <Toast message={toast?.msg ?? null} variant={toast?.variant} onDismiss={() => setToast(null)} />

        <div className="dash-split-main__bar">
          <button type="button" className="dash-btn-secondary" onClick={backToList}>
            ← Voltar à lista
          </button>
          <h1 className="dash-split-main__title">
            {sel.nome}
            {isFilhoDeSanto(sel) && <FilhoDeSantoTag />}
          </h1>
        </div>

        <nav className="dash-tabs dash-clientes__tabs" data-tour="atendimento-clientes-abas" aria-label="Secções do cliente">
          <button type="button" className={clienteAba === 'ficha' ? 'active' : ''} onClick={() => setClienteAba('ficha')}>
            Ficha
          </button>
          <button type="button" className={clienteAba === 'acoes' ? 'active' : ''} onClick={() => setClienteAba('acoes')}>
            Ações
          </button>
          <button
            type="button"
            className={clienteAba === 'visitas' ? 'active' : ''}
            onClick={() => setClienteAba('visitas')}
          >
            Visitas{visitas.length ? ` (${visitas.length})` : ''}
          </button>
        </nav>

        <div className="dash-clientes__detail" data-tour="atendimento-clientes-ficha">
          {clienteAba === 'ficha' && (
            <section className="dash-form-section dash-clientes__resumo">
              <div className="dash-clientes__resumo-grid">
                <div>
                  <span className="dash-clientes__label">WhatsApp</span>
                  <strong>{sel.whatsapp ? formatarTelefoneMascara(sel.whatsapp) : '—'}</strong>
                </div>
                <div>
                  <span className="dash-clientes__label">E-mail</span>
                  <strong>{sel.email || '—'}</strong>
                </div>
                <div>
                  <span className="dash-clientes__label">Nascimento</span>
                  <strong>{sel.data_nascimento ? formatDateBR(sel.data_nascimento) : '—'}</strong>
                </div>
                <div>
                  <span className="dash-clientes__label">Em aberto</span>
                  <strong className={emAberto > 0 ? 'dash-clientes__warn' : undefined}>
                    {emAberto > 0 ? formatMoneyBRL(emAberto) : 'Nada'}
                  </strong>
                </div>
              </div>
              {sel.obs && <p className="dash-muted dash-clientes__obs">{sel.obs}</p>}
            </section>
          )}

          {clienteAba === 'acoes' && (
            <section className="dash-form-section dash-clientes__acoes" data-tour="atendimento-clientes-acoes">
              <h2 className="dash-form-section__title">Ações</h2>
              {sel.deleted_at ? (
                <p className="dash-muted">Cliente inativado — restaure na lista para usar as ações.</p>
              ) : (
                <div className="dash-clientes__acoes-grid">
                  {canUpdate && (
                    <button type="button" className="dash-btn-secondary" onClick={abrirEdicaoCliente}>
                      Editar
                    </button>
                  )}
                  <button
                    type="button"
                    className="dash-btn-secondary"
                    onClick={() => {
                      setClienteAba('visitas');
                      abrirNovaVisita();
                    }}
                  >
                    + Visita
                  </button>
                  {onNovoOrcamento && (
                    <button type="button" className="dash-btn-secondary" onClick={() => onNovoOrcamento(sel.id)}>
                      Orçamento
                    </button>
                  )}
                  {onAgendar && (
                    <button type="button" className="dash-btn-secondary" onClick={() => onAgendar(sel.id)}>
                      Agendar
                    </button>
                  )}
                  {canSend && (
                    <>
                      <button
                        type="button"
                        className="dash-btn-secondary"
                        onClick={() => openExternal(buildWaMeLink(sel.whatsapp, msgCobranca(sel, emAberto)))}
                      >
                        WhatsApp
                      </button>
                      <button
                        type="button"
                        className="dash-btn-secondary"
                        onClick={() =>
                          openExternal(
                            buildMailtoLink(sel.email, `Atendimento — ${ileNome || 'Ilê'}`, msgCobranca(sel, emAberto)),
                          )
                        }
                      >
                        E-mail
                      </button>
                    </>
                  )}
                  {canDelete && (
                    <button type="button" className="dash-btn-danger-outline" onClick={() => void excluirCliente(sel)}>
                      Excluir
                    </button>
                  )}
                </div>
              )}
            </section>
          )}

          {sel.deleted_at && canRestore && clienteAba === 'ficha' && (
            <section className="dash-form-section">
              <p>Este cliente está inativado.</p>
              <button
                type="button"
                className="dash-btn-primary"
                onClick={() =>
                  void restoreCliente(sel.id)
                    .then(reload)
                    .then(async () => {
                      const again = (await fetchClientes(false)).find((x) => x.id === sel.id);
                      if (again) await openCliente(again);
                    })
                }
              >
                Restaurar
              </button>
            </section>
          )}

          {clienteAba === 'visitas' && !sel.deleted_at && (
            <section className="dash-form-section" data-tour="atendimento-clientes-visitas">
              <div className="dash-clientes__visitas-head">
                <h2 className="dash-form-section__title">Histórico de visitas</h2>
                <button type="button" className="dash-btn-secondary" onClick={abrirNovaVisita}>
                  + Visita
                </button>
              </div>

              {visitas.length > 0 ? (
                <>
                  <div className="dash-toolbar dash-clientes__visita-filters">
                    <input
                      className="dash-clientes__busca"
                      placeholder="Buscar por data ou descrição…"
                      value={visitaBusca}
                      onChange={(e) => setVisitaBusca(e.target.value)}
                      aria-label="Buscar visitas"
                    />
                    <SearchableSelect
                      options={VISITA_PAGO_FILTRO_OPTIONS}
                      value={visitaPagoFiltro}
                      onChange={(v) => setVisitaPagoFiltro(v as VisitaPagoFiltro)}
                      aria-label="Filtrar por pagamento"
                    />
                    <SearchableSelect
                      options={VISITA_ORDEM_OPTIONS}
                      value={visitaOrdem}
                      onChange={(v) => setVisitaOrdem(v as VisitaOrdem)}
                      aria-label="Ordenar visitas"
                    />
                  </div>

                  <div className="dash-table-scroll">
                    <table className="dash-table dash-clientes__visitas-table">
                      <thead>
                        <tr>
                          <th scope="col">Data</th>
                          <th scope="col">Descrição</th>
                          <th scope="col">Valor</th>
                          <th scope="col">Status</th>
                          <th scope="col" className="dash-th-static">
                            Ações
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {visitasFiltradas.map((v) => (
                          <tr key={v.id}>
                            <td>
                              <strong>{formatDateBR(v.data)}</strong>
                            </td>
                            <td className="dash-clientes__visita-desc">{v.resumo?.trim() || '—'}</td>
                            <td className="dash-clientes__visita-valor">
                              {v.valor != null ? formatMoneyBRL(Number(v.valor)) : '—'}
                            </td>
                            <td>
                              <span className={v.pago ? 'dash-clientes__badge-ok' : 'dash-clientes__badge-warn'}>
                                {v.pago ? 'Pago' : 'Em aberto'}
                              </span>
                            </td>
                            <td className="dash-clientes__visita-acoes-cell">
                              <div className="dash-clientes__row-actions">
                                <button type="button" className="dash-btn-table" onClick={() => emitirRecibo(v, sel)}>
                                  Recibo
                                </button>
                                <button
                                  type="button"
                                  className="dash-btn-table dash-btn-table--edit"
                                  onClick={() => abrirEditarVisita(v)}
                                >
                                  Editar
                                </button>
                                {!v.pago && (
                                  <button
                                    type="button"
                                    className="dash-btn-table dash-btn-table--pay"
                                    onClick={() => void marcarVisitaPaga(v)}
                                  >
                                    Marcar pago
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className="dash-btn-table dash-btn-table--danger"
                                  onClick={() => setDeleteVisita(v)}
                                >
                                  Excluir
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                        {!visitasFiltradas.length && (
                          <tr>
                            <td colSpan={5} className="dash-muted">
                              Nenhuma visita com estes filtros.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <p className="dash-muted">Nenhuma visita registada ainda.</p>
              )}
            </section>
          )}

          {clienteAba === 'visitas' && sel.deleted_at && (
            <section className="dash-form-section">
              <p className="dash-muted">Cliente inativado — o histórico de visitas fica oculto até restaurar.</p>
            </section>
          )}
        </div>

        {sheet === 'cliente' && renderClienteSheet()}
        {sheet === 'visita' && renderVisitaSheet()}

        {deleteVisita && (
          <div className="dash-modal-overlay" role="presentation" onClick={() => !deletingVisita && setDeleteVisita(null)}>
            <div
              className="dash-modal dash-modal--narrow"
              role="dialog"
              aria-modal="true"
              aria-labelledby="visita-delete-title"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="dash-modal__head">
                <h2 id="visita-delete-title">Confirmar exclusão</h2>
                <button
                  type="button"
                  className="dash-modal__close"
                  aria-label="Fechar"
                  disabled={deletingVisita}
                  onClick={() => setDeleteVisita(null)}
                >
                  ×
                </button>
              </div>
              <p>
                Excluir a visita de <strong>{formatDateBR(deleteVisita.data)}</strong>
                {deleteVisita.resumo?.trim() ? (
                  <>
                    {' '}
                    (<em>{deleteVisita.resumo.trim()}</em>)
                  </>
                ) : null}
                {deleteVisita.valor != null ? <> — {formatMoneyBRL(Number(deleteVisita.valor))}</> : null}?
              </p>
              <div className="dash-form-actions dash-form-actions--modal-end">
                <button
                  type="button"
                  className="dash-btn-secondary"
                  disabled={deletingVisita}
                  onClick={() => setDeleteVisita(null)}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="dash-btn-danger"
                  disabled={deletingVisita}
                  onClick={() => void confirmarExcluirVisita()}
                >
                  {deletingVisita ? 'Excluindo…' : 'Excluir'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  function renderClienteSheet() {
    return (
      <div className="dash-modal-overlay dash-modal-overlay--event-sheet">
        <div className="dash-modal dash-event-sheet">
          <form className="dash-event-sheet__form" onSubmit={salvarCliente}>
            <header className="dash-event-sheet__bar">
              <button type="button" className="dash-event-sheet__bar-btn" onClick={() => setSheet(null)}>
                Cancelar
              </button>
              <h2 className="dash-event-sheet__bar-title">{sel?.id ? 'Editar' : 'Novo'} cliente</h2>
              <button type="submit" className="dash-event-sheet__bar-btn dash-event-sheet__bar-btn--primary">
                Salvar
              </button>
            </header>
            <div className="dash-event-sheet__body">
              <input
                className="dash-event-sheet__title-input"
                required
                placeholder="Nome"
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
              />
              <div className="dash-event-sheet__row">
                <label className="dash-event-sheet__field">
                  <span>Nascimento</span>
                  <input
                    type="date"
                    value={form.data_nascimento}
                    onChange={(e) => setForm({ ...form, data_nascimento: e.target.value })}
                  />
                </label>
                <label className="dash-event-sheet__field">
                  <span>WhatsApp</span>
                  <input
                    value={formatarTelefoneMascara(form.whatsapp)}
                    onChange={(e) => setForm({ ...form, whatsapp: somenteDigitosTelefone(e.target.value) })}
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="(00)0.0000-0000"
                  />
                </label>
              </div>
              <label className="dash-event-sheet__field">
                <span>E-mail</span>
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </label>
              <label className="dash-event-sheet__field">
                <span>Membro do terreiro</span>
                <SearchableSelect
                  options={membroOptions}
                  value={form.pessoa_id}
                  onChange={(v) => setForm({ ...form, pessoa_id: v })}
                  placeholder="— Não vinculado —"
                  searchPlaceholder="Buscar membro…"
                  allowClear
                  aria-label="Vincular a membro do terreiro"
                />
                <span className="dash-field-hint">Se for filho de santo, vincule ao cadastro de Membros</span>
              </label>
              <label className="dash-event-sheet__field">
                <span>Observações</span>
                <textarea
                  className="dash-event-sheet__textarea"
                  value={form.obs}
                  onChange={(e) => setForm({ ...form, obs: e.target.value })}
                />
              </label>
            </div>
          </form>
        </div>
      </div>
    );
  }

  function renderVisitaSheet() {
    if (!sel) return null;
    return (
      <div className="dash-modal-overlay dash-modal-overlay--event-sheet">
        <div className="dash-modal dash-event-sheet">
          <form className="dash-event-sheet__form" onSubmit={salvarVisita}>
            <header className="dash-event-sheet__bar">
              <button type="button" className="dash-event-sheet__bar-btn" onClick={() => { setSheet(null); setEditVisitaId(null); }}>
                Cancelar
              </button>
              <h2 className="dash-event-sheet__bar-title">{editVisitaId ? 'Editar visita' : 'Nova visita'}</h2>
              <button type="submit" className="dash-event-sheet__bar-btn dash-event-sheet__bar-btn--primary">
                Salvar
              </button>
            </header>
            <div className="dash-event-sheet__body">
              <label className="dash-event-sheet__field">
                <span>Data</span>
                <input
                  type="date"
                  required
                  value={visitaForm.data}
                  onChange={(e) => setVisitaForm({ ...visitaForm, data: e.target.value })}
                />
              </label>
              <label className="dash-event-sheet__field">
                <span>O que foi feito</span>
                <textarea
                  className="dash-event-sheet__textarea"
                  value={visitaForm.resumo}
                  onChange={(e) => setVisitaForm({ ...visitaForm, resumo: e.target.value })}
                />
              </label>
              <label className="dash-event-sheet__field">
                <span>Valor</span>
                <input
                  inputMode="decimal"
                  value={visitaForm.valor}
                  onChange={(e) => setVisitaForm({ ...visitaForm, valor: sanitizeValorInput(e.target.value) })}
                  placeholder="0,00"
                />
              </label>
              <label className="dash-field dash-field--inline">
                <input
                  type="checkbox"
                  checked={visitaForm.pago}
                  onChange={(e) => setVisitaForm({ ...visitaForm, pago: e.target.checked })}
                />
                <span>Já pago</span>
              </label>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="dash-clientes" data-tour="atendimento-clientes">
      <Toast message={toast?.msg ?? null} variant={toast?.variant} onDismiss={() => setToast(null)} />
      <header className="dash-page-head" data-tour="atendimento-clientes-header">
        <div className="dash-page-head__titles">
          <h1>Clientes</h1>
          <p className="dash-muted">Atendimento e histórico de visitas.</p>
        </div>
        <div className="dash-page-head__actions dash-clientes__toolbar">
          {canCreate && (
            <button
              type="button"
              className="dash-add-button"
              onClick={() => {
                setSel(null);
                setForm({ nome: '', data_nascimento: '', whatsapp: '', email: '', obs: '', pessoa_id: '' });
                setSheet('cliente');
              }}
            >
              + Cliente
            </button>
          )}
        </div>
      </header>

      <div className="dash-toolbar dash-clientes__filters" data-tour="atendimento-clientes-filtros">
        <input
          className="dash-clientes__busca"
          placeholder="Buscar nome, WhatsApp, e-mail"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <label className="dash-toggle-paid dash-toggle-paid--compact">
          <input type="checkbox" checked={soEmAberto} onChange={(e) => setSoEmAberto(e.target.checked)} />
          <span>Só em aberto</span>
        </label>
        {canRestore && (
          <label className="dash-toggle-paid dash-toggle-paid--compact">
            <input type="checkbox" checked={verExcluidos} onChange={(e) => setVerExcluidos(e.target.checked)} />
            <span>Ver inativados</span>
          </label>
        )}
      </div>

      <div className="dash-table-scroll" data-tour="atendimento-clientes-lista">
        <table className="dash-table dash-clientes__table">
          <thead>
            <tr>
              <th scope="col">Nome</th>
              <th scope="col">WhatsApp</th>
              <th scope="col">E-mail</th>
              <th scope="col">Em aberto</th>
              <th scope="col" className="dash-th-static">
                Ações
              </th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map((c) => {
              const aberto = abertos[c.id] || 0;
              return (
                <tr
                  key={c.id}
                  className="dash-row-clickable"
                  onClick={() => void openCliente(c)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      void openCliente(c);
                    }
                  }}
                  tabIndex={0}
                >
                  <td>
                    <span className="dash-clientes__nome-cell">
                      <strong>{c.nome}</strong>
                      {isFilhoDeSanto(c) && <FilhoDeSantoTag />}
                      {c.deleted_at && <em className="dash-muted"> · inativado</em>}
                    </span>
                  </td>
                  <td>{c.whatsapp ? formatarTelefoneMascara(c.whatsapp) : '—'}</td>
                  <td>{c.email || '—'}</td>
                  <td className={aberto > 0 ? 'dash-clientes__warn' : undefined}>
                    {aberto > 0 ? formatMoneyBRL(aberto) : '—'}
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div className="dash-clientes__row-actions">
                      {!c.deleted_at && (
                        <button type="button" className="dash-btn-min" onClick={() => void openCliente(c)}>
                          Abrir
                        </button>
                      )}
                      {c.deleted_at && canRestore && (
                        <button
                          type="button"
                          className="dash-btn-min"
                          onClick={() => void restoreCliente(c.id).then(reload)}
                        >
                          Restaurar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {!filtrados.length && (
              <tr>
                <td colSpan={5} className="dash-muted">
                  Nenhum cliente encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {sheet === 'cliente' && renderClienteSheet()}
    </div>
  );
}
