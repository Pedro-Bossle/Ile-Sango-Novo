import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchClientes, type Cliente } from '../../../services/atendimento';
import {
  fetchAgenda,
  saveCompromisso,
  softDeleteCompromisso,
  type AgendaCompromisso,
} from '../../../services/orcamentosAgenda';
import { fetchProfiles, type Profile } from '../../../services/profiles';
import { writeAuditLog } from '../../../services/auditLog';
import { buildWaMeLink, openExternal } from '../../../utils/whatsappLink';
import { downloadIcs, googleCalendarUrl } from '../../../utils/ics';
import { EventosCalendar, type CalendarioItem } from '../eventos/EventosCalendar';
import { SearchableSelect, type SearchableSelectOption } from '../SearchableSelect';
import { Toast } from '../Toast';

const FILTRO_TIPO_OPTIONS: SearchableSelectOption[] = [
  { value: 'todos', label: 'Eventos e compromissos' },
  { value: 'eventos', label: 'Só eventos' },
  { value: 'compromissos', label: 'Só compromissos' },
];

const COMPROMISSO_TIPO_OPTIONS: SearchableSelectOption[] = [
  { value: 'atendimento', label: 'Atendimento' },
  { value: 'compromisso', label: 'Compromisso' },
  { value: 'outro', label: 'Outro' },
];

export type EventoRow = {
  id: string | number;
  nome: string;
  data: string;
  hora?: string | null;
  local?: string | null;
  descricao?: string | null;
  tipo?: string | null;
  icone_customizado?: string | null;
  created_by?: string | null;
};

type FiltroTipo = 'todos' | 'eventos' | 'compromissos';

type Props = {
  eventos: EventoRow[];
  onRefresh: () => void;
  onNovoEvento: (isoDate?: string) => void;
  onEditEvento: (evento: EventoRow) => void;
  onOpenEnderecos: () => void;
  canCreateEvento?: boolean;
  canCreateCompromisso?: boolean;
  canSend?: boolean;
  initialClienteId?: string | null;
  onInitialClienteConsumed?: () => void;
};

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function monthRangeIso(viewMonth: Date) {
  const from = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1, 0, 0, 0, 0);
  const to = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0, 23, 59, 59, 999);
  // margem de 7 dias para células fora do mês
  from.setDate(from.getDate() - 7);
  to.setDate(to.getDate() + 7);
  return { from: from.toISOString(), to: to.toISOString() };
}

function profileLabel(p: Profile): string {
  return (p.nome_exibicao || p.email || p.user_id).trim();
}

export function CalendarioUnificadoScreen({
  eventos,
  onRefresh,
  onNovoEvento,
  onEditEvento,
  onOpenEnderecos,
  canCreateEvento = true,
  canCreateCompromisso = true,
  canSend = true,
  initialClienteId = null,
  onInitialClienteConsumed,
}: Props) {
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(new Date()));
  const [compromissos, setCompromissos] = useState<AgendaCompromisso[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [toast, setToast] = useState<{ msg: string; variant: 'success' | 'error' } | null>(null);
  const [filtroTipo, setFiltroTipo] = useState<FiltroTipo>('todos');
  const [filtroUser, setFiltroUser] = useState('');
  const [busca, setBusca] = useState('');
  const [dayMenu, setDayMenu] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);
  const [editComp, setEditComp] = useState<AgendaCompromisso | null>(null);
  const [form, setForm] = useState({
    titulo: '',
    inicio: new Date().toISOString().slice(0, 16),
    fim: '',
    cliente_id: '',
    local: '',
    notas: '',
    tipo: 'atendimento',
  });

  const nomePorUser = useMemo(() => {
    const map = new Map<string, string>();
    profiles.forEach((p) => map.set(p.user_id, profileLabel(p)));
    return map;
  }, [profiles]);

  const filtroUserOptions = useMemo(
    (): SearchableSelectOption[] =>
      profiles.map((p) => ({ value: p.user_id, label: profileLabel(p) })),
    [profiles],
  );

  const clienteOptions = useMemo(
    (): SearchableSelectOption[] => [
      { value: '', label: '—' },
      ...clientes.map((c) => ({ value: c.id, label: c.nome })),
    ],
    [clientes],
  );

  const reloadCompromissos = useCallback(async () => {
    const { from, to } = monthRangeIso(viewMonth);
    const rows = await fetchAgenda(from, to);
    setCompromissos(rows);
  }, [viewMonth]);

  useEffect(() => {
    void reloadCompromissos().catch((e) => setToast({ msg: e.message, variant: 'error' }));
  }, [reloadCompromissos]);

  useEffect(() => {
    void Promise.all([fetchProfiles(), fetchClientes()])
      .then(([p, c]) => {
        setProfiles(p.filter((x) => x.ativo));
        setClientes(c);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!initialClienteId) return;
    setEditComp(null);
    setForm({
      titulo: 'Atendimento',
      inicio: new Date().toISOString().slice(0, 16),
      fim: '',
      cliente_id: initialClienteId,
      local: '',
      notas: '',
      tipo: 'atendimento',
    });
    setSheet(true);
    onInitialClienteConsumed?.();
    // Consome o id uma vez; o callback do pai limpa o estado e não deve reabrir o sheet.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só reage a initialClienteId
  }, [initialClienteId]);

  const itemsAll: CalendarioItem[] = useMemo(() => {
    const evItems: CalendarioItem[] = eventos.map((e) => ({
      id: String(e.id),
      kind: 'evento',
      nome: e.nome,
      data: String(e.data).slice(0, 10),
      hora: e.hora,
      local: e.local,
      descricao: e.descricao,
      tipo: e.tipo,
      createdBy: e.created_by ?? null,
      createdByNome: e.created_by ? nomePorUser.get(e.created_by) ?? null : null,
      raw: e,
    }));

    const compItems: CalendarioItem[] = compromissos.map((c) => {
      const inicio = new Date(c.inicio);
      const data = Number.isNaN(inicio.getTime())
        ? String(c.inicio).slice(0, 10)
        : `${inicio.getFullYear()}-${String(inicio.getMonth() + 1).padStart(2, '0')}-${String(inicio.getDate()).padStart(2, '0')}`;
      const hora = Number.isNaN(inicio.getTime())
        ? null
        : `${String(inicio.getHours()).padStart(2, '0')}:${String(inicio.getMinutes()).padStart(2, '0')}`;
      return {
        id: c.id,
        kind: 'compromisso' as const,
        nome: c.titulo,
        data,
        hora,
        local: c.local,
        descricao: c.notas,
        tipo: c.tipo,
        createdBy: c.created_by,
        createdByNome: c.created_by ? nomePorUser.get(c.created_by) ?? null : null,
        raw: c,
      };
    });

    return [...evItems, ...compItems];
  }, [eventos, compromissos, nomePorUser]);

  const itemsFiltrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return itemsAll.filter((it) => {
      if (filtroTipo === 'eventos' && it.kind !== 'evento') return false;
      if (filtroTipo === 'compromissos' && it.kind !== 'compromisso') return false;
      if (filtroUser && it.createdBy !== filtroUser) return false;
      if (!q) return true;
      const blob = `${it.nome} ${it.local ?? ''} ${it.descricao ?? ''} ${it.createdByNome ?? ''} ${it.tipo ?? ''}`.toLowerCase();
      return blob.includes(q);
    });
  }, [itemsAll, filtroTipo, filtroUser, busca]);

  const openNovoCompromisso = (iso?: string) => {
    const base = iso ? `${iso}T09:00` : new Date().toISOString().slice(0, 16);
    setEditComp(null);
    setForm({
      titulo: '',
      inicio: base,
      fim: '',
      cliente_id: initialClienteId ?? '',
      local: '',
      notas: '',
      tipo: 'atendimento',
    });
    setDayMenu(null);
    setSheet(true);
  };

  const openEditCompromisso = (c: AgendaCompromisso) => {
    setEditComp(c);
    setForm({
      titulo: c.titulo,
      inicio: new Date(c.inicio).toISOString().slice(0, 16),
      fim: c.fim ? new Date(c.fim).toISOString().slice(0, 16) : '',
      cliente_id: c.cliente_id ?? '',
      local: c.local ?? '',
      notas: c.notas ?? '',
      tipo: c.tipo || 'atendimento',
    });
    setSheet(true);
  };

  const onDayClick = (iso: string) => {
    if (canCreateEvento && canCreateCompromisso) {
      setDayMenu(iso);
      return;
    }
    if (canCreateEvento) onNovoEvento(iso);
    else if (canCreateCompromisso) openNovoCompromisso(iso);
  };

  const onItemClick = (item: CalendarioItem) => {
    if (item.kind === 'evento') {
      onEditEvento(item.raw as EventoRow);
      return;
    }
    openEditCompromisso(item.raw as AgendaCompromisso);
  };

  const salvarCompromisso = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const id = await saveCompromisso({
        id: editComp?.id,
        titulo: form.titulo,
        inicio: new Date(form.inicio).toISOString(),
        fim: form.fim ? new Date(form.fim).toISOString() : null,
        cliente_id: form.cliente_id || null,
        local: form.local || null,
        notas: form.notas || null,
        tipo: form.tipo,
      });
      await writeAuditLog({
        action: editComp?.id ? 'update' : 'create',
        entity: 'agenda',
        entity_id: id,
        resumo: form.titulo,
      });
      setSheet(false);
      setEditComp(null);
      await reloadCompromissos();
      onRefresh();
      setToast({ msg: 'Compromisso salvo.', variant: 'success' });
    } catch (err) {
      setToast({ msg: err instanceof Error ? err.message : 'Erro', variant: 'error' });
    }
  };

  const excluirCompromisso = async () => {
    if (!editComp) return;
    if (!window.confirm('Excluir este compromisso?')) return;
    try {
      await softDeleteCompromisso(editComp.id);
      await writeAuditLog({ action: 'delete', entity: 'agenda', entity_id: editComp.id, resumo: editComp.titulo });
      setSheet(false);
      setEditComp(null);
      await reloadCompromissos();
      setToast({ msg: 'Compromisso excluído.', variant: 'success' });
    } catch (err) {
      setToast({ msg: err instanceof Error ? err.message : 'Erro', variant: 'error' });
    }
  };

  const confirmarWa = (c: AgendaCompromisso) => {
    const cli = clientes.find((x) => x.id === c.cliente_id);
    const when = new Date(c.inicio).toLocaleString('pt-BR');
    const text = `Olá${cli ? ` ${cli.nome}` : ''}! Confirmamos o seu horário em ${when}${c.local ? ` — ${c.local}` : ''}.`;
    openExternal(buildWaMeLink(cli?.whatsapp, text));
  };

  return (
    <div className="dash-calendario-unificado" data-tour="calendario-unificado">
      <Toast message={toast?.msg ?? null} variant={toast?.variant} onDismiss={() => setToast(null)} />

      <header className="dash-page-head">
        <div className="dash-page-head__titles">
          <h1>Agenda</h1>
          <p className="dash-muted">Eventos da casa e compromissos de atendimento no mesmo calendário.</p>
        </div>
        <div className="dash-page-head__actions" data-tour="eventos-toolbar">
          <button type="button" className="dash-add-button dash-add-button--secondary" data-tour="eventos-enderecos" onClick={onOpenEnderecos}>
            Endereços padrão
          </button>
          {canCreateEvento && (
            <button type="button" className="dash-add-button dash-add-button--secondary" data-tour="eventos-adicionar" onClick={() => onNovoEvento()}>
              + Evento
            </button>
          )}
          {canCreateCompromisso && (
            <button type="button" className="dash-add-button" data-tour="agenda-novo" onClick={() => openNovoCompromisso()}>
              + Compromisso
            </button>
          )}
        </div>
      </header>

      <div className="dash-toolbar dash-calendario-unificado__filters" data-tour="calendario-filtros">
        <input
          className="dash-clientes__busca"
          placeholder="Pesquisar título, local, pessoa…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          aria-label="Pesquisar no calendário"
        />
        <SearchableSelect
          options={FILTRO_TIPO_OPTIONS}
          value={filtroTipo}
          onChange={(v) => setFiltroTipo(v as FiltroTipo)}
          aria-label="Filtrar tipo"
        />
        <SearchableSelect
          options={filtroUserOptions}
          value={filtroUser}
          onChange={setFiltroUser}
          placeholder="Todos os usuários"
          allowClear
          aria-label="Filtrar usuário"
        />
      </div>

      <p className="dash-muted dash-calendario-unificado__legend">
        <span className="dash-cal__chip dash-cal__chip--evento">E Evento</span>
        <span className="dash-cal__chip dash-cal__chip--compromisso">C Compromisso (mostra quem criou)</span>
      </p>

      <EventosCalendar
        items={itemsFiltrados}
        viewMonth={viewMonth}
        onViewMonthChange={setViewMonth}
        onDayClick={onDayClick}
        onItemClick={onItemClick}
      />

      {dayMenu && (
        <div className="dash-modal-overlay" role="dialog" aria-modal="true">
          <div className="dash-modal dash-modal--narrow">
            <h3>Adicionar em {new Date(`${dayMenu}T12:00:00`).toLocaleDateString('pt-BR')}</h3>
            <div className="dash-form-actions">
              {canCreateEvento && (
                <button
                  type="button"
                  className="dash-btn-secondary"
                  onClick={() => {
                    const iso = dayMenu;
                    setDayMenu(null);
                    onNovoEvento(iso);
                  }}
                >
                  Evento da casa
                </button>
              )}
              {canCreateCompromisso && (
                <button type="button" className="dash-btn-primary" onClick={() => openNovoCompromisso(dayMenu)}>
                  Compromisso
                </button>
              )}
              <button type="button" className="dash-btn-secondary" onClick={() => setDayMenu(null)}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {sheet && (
        <div className="dash-modal-overlay dash-modal-overlay--event-sheet">
          <div className="dash-modal dash-event-sheet">
            <form className="dash-event-sheet__form" onSubmit={salvarCompromisso}>
              <header className="dash-event-sheet__bar">
                <button type="button" className="dash-event-sheet__bar-btn" onClick={() => setSheet(false)}>
                  Cancelar
                </button>
                <h2 className="dash-event-sheet__bar-title">{editComp ? 'Editar compromisso' : 'Novo compromisso'}</h2>
                <button type="submit" className="dash-event-sheet__bar-btn dash-event-sheet__bar-btn--primary">
                  Salvar
                </button>
              </header>
              <div className="dash-event-sheet__body">
                <input
                  className="dash-event-sheet__title-input"
                  required
                  placeholder="Título"
                  value={form.titulo}
                  onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                />
                <div className="dash-event-sheet__row">
                  <label className="dash-event-sheet__field">
                    <span>Início</span>
                    <input
                      type="datetime-local"
                      required
                      value={form.inicio}
                      onChange={(e) => setForm({ ...form, inicio: e.target.value })}
                    />
                  </label>
                  <label className="dash-event-sheet__field">
                    <span>Fim</span>
                    <input type="datetime-local" value={form.fim} onChange={(e) => setForm({ ...form, fim: e.target.value })} />
                  </label>
                </div>
                <label className="dash-event-sheet__field">
                  <span>Cliente</span>
                  <SearchableSelect
                    options={clienteOptions}
                    value={form.cliente_id}
                    onChange={(v) => setForm({ ...form, cliente_id: v })}
                    searchPlaceholder="Buscar cliente…"
                    aria-label="Cliente"
                  />
                </label>
                <label className="dash-event-sheet__field">
                  <span>Tipo</span>
                  <SearchableSelect
                    options={COMPROMISSO_TIPO_OPTIONS}
                    value={form.tipo}
                    onChange={(v) => setForm({ ...form, tipo: v })}
                    aria-label="Tipo de compromisso"
                  />
                </label>
                <label className="dash-event-sheet__field">
                  <span>Local</span>
                  <input value={form.local} onChange={(e) => setForm({ ...form, local: e.target.value })} />
                </label>
                <label className="dash-event-sheet__field">
                  <span>Notas</span>
                  <textarea
                    className="dash-event-sheet__textarea"
                    value={form.notas}
                    onChange={(e) => setForm({ ...form, notas: e.target.value })}
                  />
                </label>
                {editComp && (
                  <div className="dash-calendario-unificado__comp-meta">
                    {editComp.created_by && (
                      <p className="dash-muted">
                        Criado por: <strong>{nomePorUser.get(editComp.created_by) || '—'}</strong>
                      </p>
                    )}
                    <div className="dash-form-actions" style={{ justifyContent: 'flex-start' }}>
                      {canSend && (
                        <button type="button" className="dash-btn-secondary" onClick={() => confirmarWa(editComp)}>
                          WhatsApp
                        </button>
                      )}
                      <button
                        type="button"
                        className="dash-btn-secondary"
                        onClick={() =>
                          downloadIcs({
                            titulo: editComp.titulo,
                            inicio: new Date(editComp.inicio),
                            fim: editComp.fim ? new Date(editComp.fim) : null,
                            descricao: editComp.notas ?? undefined,
                            local: editComp.local ?? undefined,
                            uid: editComp.id,
                          })
                        }
                      >
                        ICS
                      </button>
                      <button
                        type="button"
                        className="dash-btn-secondary"
                        onClick={() =>
                          openExternal(
                            googleCalendarUrl({
                              titulo: editComp.titulo,
                              inicio: new Date(editComp.inicio),
                              fim: editComp.fim ? new Date(editComp.fim) : null,
                              descricao: editComp.notas ?? undefined,
                              local: editComp.local ?? undefined,
                            }),
                          )
                        }
                      >
                        Google
                      </button>
                      <button type="button" className="dash-event-sheet__delete" onClick={() => void excluirCompromisso()}>
                        Excluir
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
