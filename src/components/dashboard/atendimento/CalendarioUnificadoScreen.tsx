import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { fetchClientes, type Cliente } from '../../../services/atendimento';
import {
  fetchAgenda,
  saveCompromisso,
  softDeleteCompromisso,
  type AgendaCompromisso,
  type RecorrenciaFreq,
} from '../../../services/orcamentosAgenda';
import { fetchProfiles, type Profile } from '../../../services/profiles';
import { fetchConfigIle, formatarEnderecoIle, localOuEnderecoIle, type ConfigIle } from '../../../services/configIle';
import {
  createAgendaCategoria,
  corCategoriaPorTipo,
  defaultAgendaCategorias,
  estiloBarraCategoria,
  fetchAgendaCategorias,
  reorderAgendaCategorias,
  softDeleteAgendaCategoria,
  updateAgendaCategoria,
  type AgendaCategoria,
} from '../../../services/agendaCategorias';
import { writeAuditLog } from '../../../services/auditLog';
import { onModalOverlayClick } from '../../../utils/modalOverlay';
import { ENDERECO_EVENTO_PADRAO } from '../../../utils/enderecosPadrao';
import { buildWaMeLink, openExternal } from '../../../utils/whatsappLink';
import { downloadIcs, googleCalendarUrl } from '../../../utils/ics';
import { parseDataBusca, toIsoDateLocal } from '../../../utils/parseDataBusca';
import { matchesSearchFields } from '../../../utils/searchFold';
import { buildCopiaRapidaAgenda, COPIA_RAPIDA_EVENTOS_KEY } from '../../../utils/copiaRapidaAgenda';
import { useConfirmAction } from '../ConfirmActionModal';
import { SortableCategoryList } from '../SortableCategoryList';
import { EventosCalendar, type CalendarioItem } from '../eventos/EventosCalendar';
import { SearchableSelect, type SearchableSelectOption } from '../SearchableSelect';
import { Toast } from '../Toast';

const FILTRO_TIPO_OPTIONS: SearchableSelectOption[] = [
  { value: 'todos', label: 'Eventos e compromissos' },
  { value: 'eventos', label: 'Só eventos (site)' },
  { value: 'compromissos', label: 'Só compromissos' },
];

const COMPROMISSO_TIPO_OPTIONS: SearchableSelectOption[] = [
  { value: 'Atendimento', label: 'Atendimento' },
  { value: 'Compromisso', label: 'Compromisso' },
  { value: 'Outro', label: 'Outro' },
];

const EVENTO_TIPO_OPTIONS: SearchableSelectOption[] = [
  { value: 'umbanda', label: 'Umbanda' },
  { value: 'quimbanda', label: 'Quimbanda' },
  { value: 'nacao', label: 'Nação' },
  { value: 'outro', label: 'Outro' },
];

const RECORRENCIA_OPTIONS: SearchableSelectOption[] = [
  { value: 'diaria', label: 'Todos os dias' },
  { value: 'semanal', label: 'Toda semana' },
  { value: 'quinzenal', label: 'A cada 15 dias' },
  { value: 'mensal', label: 'Todo mês' },
  { value: 'anual', label: 'Todo ano' },
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

type AgendaForm = {
  titulo: string;
  /** true = vai para o site (tabela eventos) */
  publico: boolean;
  evento_tipo: string;
  inicio: string;
  fim: string;
  local: string;
  notas: string;
  /** Avançado — compromisso */
  cliente_id: string;
  atribuido_user_id: string;
  tipo: string;
  repetir: boolean;
  recorrencia_freq: RecorrenciaFreq;
  recorrencia_ate: string;
};

type Props = {
  eventos: EventoRow[];
  onRefresh: () => void;
  /** @deprecated fluxo unificado no modal da Agenda */
  onNovoEvento?: (isoDate?: string) => void;
  /** @deprecated */
  onEditEvento?: (evento: EventoRow) => void;
  canCreateEvento?: boolean;
  canCreateCompromisso?: boolean;
  canSend?: boolean;
  initialClienteId?: string | null;
  onInitialClienteConsumed?: () => void;
  /** Abre comanda ao vivo (cliente + opcional compromisso). */
  onAbrirAtendimento?: (clienteId: string, compromissoId?: string) => void;
};

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function monthRangeIso(viewMonth: Date) {
  const from = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1, 0, 0, 0, 0);
  const to = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0, 23, 59, 59, 999);
  from.setDate(from.getDate() - 7);
  to.setDate(to.getDate() + 7);
  return { from: from.toISOString(), to: to.toISOString() };
}

function profileLabel(p: Profile): string {
  return (p.nome_exibicao || p.email || p.user_id).trim();
}

function toDatetimeLocalValue(d: Date): string {
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function emptyAgendaForm(iso?: string, clienteId = '', publico = false): AgendaForm {
  const base = iso ? `${iso}T09:00` : toDatetimeLocalValue(new Date());
  return {
    titulo: '',
    publico,
    evento_tipo: 'umbanda',
    inicio: base,
    fim: '',
    local: '',
    notas: '',
    cliente_id: clienteId,
    atribuido_user_id: '',
    tipo: 'Atendimento',
    repetir: false,
    recorrencia_freq: 'semanal',
    recorrencia_ate: '',
  };
}

export function CalendarioUnificadoScreen({
  eventos,
  onRefresh,
  canCreateEvento = true,
  canCreateCompromisso = true,
  canSend = true,
  initialClienteId = null,
  onInitialClienteConsumed,
  onAbrirAtendimento,
}: Props) {
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(new Date()));
  const [compromissos, setCompromissos] = useState<AgendaCompromisso[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [toast, setToast] = useState<{ msg: string; variant: 'success' | 'error' } | null>(null);
  const [filtroTipo, setFiltroTipo] = useState<FiltroTipo>('todos');
  const [filtroUser, setFiltroUser] = useState('');
  const [busca, setBusca] = useState('');
  const [sheet, setSheet] = useState(false);
  const [avancadoOpen, setAvancadoOpen] = useState(false);
  const [editComp, setEditComp] = useState<AgendaCompromisso | null>(null);
  const [editEvento, setEditEvento] = useState<EventoRow | null>(null);
  const [form, setForm] = useState<AgendaForm>(() => emptyAgendaForm());
  const [configIle, setConfigIle] = useState<ConfigIle | null>(null);
  const [categorias, setCategorias] = useState<AgendaCategoria[]>(() => defaultAgendaCategorias());
  const [bootReady, setBootReady] = useState(false);
  const [catsOpen, setCatsOpen] = useState(false);
  const [novaCatNome, setNovaCatNome] = useState('');
  const [novaCatCor, setNovaCatCor] = useState('#2e5a44');
  const [catsSaving, setCatsSaving] = useState(false);
  const [copiaRapidaOpen, setCopiaRapidaOpen] = useState(false);
  const [copiaCats, setCopiaCats] = useState<Set<string>>(() => new Set());
  const { ask: askConfirm, modal: confirmModal } = useConfirmAction();

  const enderecoIle = useMemo(
    () => (configIle ? formatarEnderecoIle(configIle) : ''),
    [configIle],
  );

  const editando = Boolean(editComp || editEvento);
  const podePublico = canCreateEvento || Boolean(editEvento);
  const podePrivado = canCreateCompromisso || Boolean(editComp);

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

  const atribuidoOptions = useMemo(
    (): SearchableSelectOption[] => [
      { value: '', label: 'Todos os usuários' },
      ...profiles.map((p) => ({ value: p.user_id, label: profileLabel(p) })),
    ],
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
    void reloadCompromissos()
      .catch((e) => setToast({ msg: e.message, variant: 'error' }))
      .finally(() => setBootReady(true));
  }, [reloadCompromissos]);

  const tipoOptions = useMemo((): SearchableSelectOption[] => {
    if (!categorias.length) return COMPROMISSO_TIPO_OPTIONS;
    return categorias.map((c) => ({ value: c.nome, label: c.nome }));
  }, [categorias]);

  const reloadCategorias = useCallback(async () => {
    const rows = await fetchAgendaCategorias();
    setCategorias(rows);
  }, []);

  useEffect(() => {
    void Promise.all([fetchProfiles(), fetchClientes(), fetchConfigIle(), fetchAgendaCategorias()])
      .then(([p, c, cfg, cats]) => {
        setProfiles(p.filter((x) => x.ativo));
        setClientes(c);
        setConfigIle(cfg);
        setCategorias(cats);
      })
      .catch((e) => setToast({ msg: e.message, variant: 'error' }));
  }, []);

  useEffect(() => {
    if (!initialClienteId) return;
    setEditComp(null);
    setEditEvento(null);
    setAvancadoOpen(false);
    setForm({
      ...emptyAgendaForm(undefined, initialClienteId, false),
      titulo: 'Atendimento',
    });
    setSheet(true);
    onInitialClienteConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só reage a initialClienteId
  }, [initialClienteId]);

  const itemsAll: CalendarioItem[] = useMemo(() => {
    const evItems: CalendarioItem[] = eventos.map((e) => ({
      id: String(e.id),
      kind: 'evento',
      nome: e.nome,
      data: String(e.data).slice(0, 10),
      hora: e.hora,
      local: configIle ? localOuEnderecoIle(e.local, configIle) : e.local,
      descricao: e.descricao,
      tipo: e.tipo,
      createdBy: e.created_by ?? null,
      createdByNome: e.created_by ? nomePorUser.get(e.created_by) ?? null : null,
      raw: e,
    }));

    const compItems: CalendarioItem[] = compromissos.map((c) => {
      const inicio = new Date(c.inicio);
      const fim = c.fim ? new Date(c.fim) : null;
      const data = Number.isNaN(inicio.getTime())
        ? String(c.inicio).slice(0, 10)
        : `${inicio.getFullYear()}-${String(inicio.getMonth() + 1).padStart(2, '0')}-${String(inicio.getDate()).padStart(2, '0')}`;
      const dataFim =
        fim && !Number.isNaN(fim.getTime())
          ? `${fim.getFullYear()}-${String(fim.getMonth() + 1).padStart(2, '0')}-${String(fim.getDate()).padStart(2, '0')}`
          : null;
      const hora = Number.isNaN(inicio.getTime())
        ? null
        : `${String(inicio.getHours()).padStart(2, '0')}:${String(inicio.getMinutes()).padStart(2, '0')}`;
      return {
        id: c.id,
        kind: 'compromisso' as const,
        nome: c.titulo,
        data,
        dataFim: dataFim && dataFim > data ? dataFim : null,
        hora,
        local: configIle ? localOuEnderecoIle(c.local, configIle) : c.local,
        descricao: c.notas,
        tipo: c.tipo,
        cor: corCategoriaPorTipo(c.tipo, categorias),
        createdBy: c.created_by,
        createdByNome: c.created_by ? nomePorUser.get(c.created_by) ?? null : null,
        raw: c,
      };
    });

    return [...evItems, ...compItems];
  }, [eventos, compromissos, nomePorUser, configIle, categorias]);

  const dataBuscada = useMemo(() => parseDataBusca(busca), [busca]);

  const itemsFiltrados = useMemo(() => {
    const q = dataBuscada ? '' : busca.trim();
    const diaIso = dataBuscada ? toIsoDateLocal(dataBuscada) : null;
    return itemsAll.filter((it) => {
      if (filtroTipo === 'eventos' && it.kind !== 'evento') return false;
      if (filtroTipo === 'compromissos' && it.kind !== 'compromisso') return false;
      if (filtroUser) {
        if (it.kind === 'compromisso') {
          const raw = it.raw as AgendaCompromisso;
          const atr = raw.atribuido_user_id;
          if (atr && atr !== filtroUser) return false;
        } else if (it.createdBy !== filtroUser) {
          return false;
        }
      }
      if (diaIso) {
        const start = it.data;
        const end = it.dataFim && it.dataFim > start ? it.dataFim : start;
        if (diaIso < start || diaIso > end) return false;
      }
      if (!q) return true;
      return matchesSearchFields(q, it.nome, it.local, it.descricao, it.createdByNome, it.tipo);
    });
  }, [itemsAll, filtroTipo, filtroUser, busca, dataBuscada]);

  const onBuscaChange = (value: string) => {
    setBusca(value);
    const parsed = parseDataBusca(value);
    if (parsed) setViewMonth(startOfMonth(parsed));
  };

  const opcoesCopiaRapida = useMemo(() => {
    const cats = categorias.map((c) => ({ key: c.nome, label: c.nome }));
    return [{ key: COPIA_RAPIDA_EVENTOS_KEY, label: 'Eventos (site)' }, ...cats];
  }, [categorias]);

  const abrirCopiaRapida = () => {
    setCopiaCats(new Set(opcoesCopiaRapida.map((o) => o.key)));
    setCopiaRapidaOpen(true);
  };

  const previewCopiaRapida = useMemo(
    () => buildCopiaRapidaAgenda(itemsFiltrados, viewMonth, copiaCats),
    [itemsFiltrados, viewMonth, copiaCats],
  );

  const copiarAgendaRapida = async () => {
    const texto = buildCopiaRapidaAgenda(itemsFiltrados, viewMonth, copiaCats);
    try {
      await navigator.clipboard.writeText(texto);
      setCopiaRapidaOpen(false);
      setToast({ msg: 'Mensagem copiada para a área de transferência.', variant: 'success' });
    } catch {
      setToast({ msg: 'Não foi possível copiar. Tente novamente.', variant: 'error' });
    }
  };

  const fecharSheet = () => {
    setSheet(false);
    setEditComp(null);
    setEditEvento(null);
    setAvancadoOpen(false);
  };

  const openNovo = (iso?: string) => {
    const publicoPadrao = !canCreateCompromisso && canCreateEvento;
    const tipoPadrao = categorias[0]?.nome || 'Atendimento';
    setEditComp(null);
    setEditEvento(null);
    setAvancadoOpen(false);
    setForm({ ...emptyAgendaForm(iso, '', publicoPadrao), tipo: tipoPadrao });
    setSheet(true);
  };

  const openEditCompromisso = (c: AgendaCompromisso) => {
    setEditEvento(null);
    setEditComp(c);
    setAvancadoOpen(false);
    setForm({
      ...emptyAgendaForm(),
      titulo: c.titulo,
      publico: false,
      inicio: toDatetimeLocalValue(new Date(c.inicio)),
      fim: c.fim ? toDatetimeLocalValue(new Date(c.fim)) : '',
      cliente_id: c.cliente_id ?? '',
      local: c.local ?? '',
      notas: c.notas ?? '',
      tipo: c.tipo || categorias[0]?.nome || 'Atendimento',
      atribuido_user_id: c.atribuido_user_id ?? '',
      repetir: false,
      recorrencia_freq: (c.recorrencia_freq as RecorrenciaFreq) || 'semanal',
      recorrencia_ate: c.recorrencia_ate ?? '',
    });
    setSheet(true);
  };

  const openEditEvento = (e: EventoRow) => {
    setEditComp(null);
    setEditEvento(e);
    setAvancadoOpen(false);
    const data = String(e.data).slice(0, 10);
    const hora = String(e.hora ?? '09:00').slice(0, 5);
    setForm({
      ...emptyAgendaForm(),
      titulo: e.nome,
      publico: true,
      evento_tipo: e.tipo || 'umbanda',
      inicio: `${data}T${hora}`,
      fim: '',
      local: e.local ?? '',
      notas: e.descricao ?? '',
    });
    setSheet(true);
  };

  const onDayClick = (iso: string) => {
    if (canCreateCompromisso || canCreateEvento) openNovo(iso);
  };

  const onItemClick = (item: CalendarioItem) => {
    if (item.kind === 'evento') {
      openEditEvento(item.raw as EventoRow);
      return;
    }
    openEditCompromisso(item.raw as AgendaCompromisso);
  };

  const salvarAgenda = async (ev: React.FormEvent) => {
    ev.preventDefault();
    try {
      if (form.publico) {
        if (!podePublico) {
          setToast({ msg: 'Sem permissão para publicar no site.', variant: 'error' });
          return;
        }
        const data = form.inicio.slice(0, 10);
        const hora = form.inicio.slice(11, 16) || '09:00';
        const local =
          String(form.local ?? '').trim() ||
          (configIle ? formatarEnderecoIle(configIle) : '') ||
          ENDERECO_EVENTO_PADRAO;
        const payload = {
          nome: form.titulo.trim(),
          data,
          hora,
          local,
          descricao: form.notas || null,
          tipo: form.evento_tipo || 'umbanda',
          icone_customizado: null as string | null,
        };
        const { data: sessao } = await supabase.auth.getSession();
        if (editEvento?.id) {
          const { error } = await supabase.from('eventos').update(payload).eq('id', editEvento.id);
          if (error) throw new Error(error.message);
          await writeAuditLog({
            action: 'update',
            entity: 'eventos',
            entity_id: editEvento.id,
            resumo: payload.nome,
          });
        } else {
          const { data: inserted, error } = await supabase
            .from('eventos')
            .insert({ ...payload, created_by: sessao?.session?.user?.id ?? null })
            .select('id')
            .maybeSingle();
          if (error) throw new Error(error.message);
          await writeAuditLog({
            action: 'create',
            entity: 'eventos',
            entity_id: inserted?.id,
            resumo: payload.nome,
          });
        }
        fecharSheet();
        onRefresh();
        setToast({ msg: 'Evento público salvo.', variant: 'success' });
        return;
      }

      if (!podePrivado) {
        setToast({ msg: 'Sem permissão para criar compromisso.', variant: 'error' });
        return;
      }
      if (form.repetir && !editComp) {
        if (!form.recorrencia_ate) {
          setToast({ msg: 'Informe até quando repetir.', variant: 'error' });
          return;
        }
        const ate = parseDataBusca(form.recorrencia_ate) || new Date(`${form.recorrencia_ate}T12:00:00`);
        const inicio = new Date(form.inicio);
        if (Number.isNaN(ate.getTime()) || ate.getTime() < inicio.getTime()) {
          setToast({ msg: 'A data “até” precisa ser igual ou depois do início.', variant: 'error' });
          return;
        }
      }
      const id = await saveCompromisso({
        id: editComp?.id,
        titulo: form.titulo,
        inicio: new Date(form.inicio).toISOString(),
        fim: form.fim ? new Date(form.fim).toISOString() : null,
        cliente_id: form.cliente_id || null,
        local: configIle ? localOuEnderecoIle(form.local, configIle) : form.local.trim() || null,
        notas: form.notas || null,
        tipo: form.tipo,
        atribuido_user_id: form.atribuido_user_id || null,
        repetir: !editComp && form.repetir,
        recorrencia_freq: !editComp && form.repetir ? form.recorrencia_freq : null,
        recorrencia_ate:
          !editComp && form.repetir
            ? toIsoDateLocal(parseDataBusca(form.recorrencia_ate) || new Date(`${form.recorrencia_ate}T12:00:00`))
            : null,
      });
      await writeAuditLog({
        action: editComp?.id ? 'update' : 'create',
        entity: 'agenda',
        entity_id: id,
        resumo: form.titulo,
      });
      fecharSheet();
      await reloadCompromissos();
      onRefresh();
      setToast({
        msg: form.repetir && !editComp ? 'Série de compromissos criada.' : 'Compromisso salvo.',
        variant: 'success',
      });
    } catch (err) {
      setToast({ msg: err instanceof Error ? err.message : 'Erro', variant: 'error' });
    }
  };

  const excluirItem = async () => {
    if (editComp) {
      const ok = await askConfirm({
        title: 'Confirmar exclusão',
        message: (
          <>
            Excluir o compromisso <strong>{editComp.titulo || 'sem título'}</strong>?
          </>
        ),
        confirmLabel: 'Excluir',
      });
      if (!ok) return;
      try {
        await softDeleteCompromisso(editComp.id);
        await writeAuditLog({ action: 'delete', entity: 'agenda', entity_id: editComp.id, resumo: editComp.titulo });
        fecharSheet();
        await reloadCompromissos();
        setToast({ msg: 'Compromisso excluído.', variant: 'success' });
      } catch (err) {
        setToast({ msg: err instanceof Error ? err.message : 'Erro', variant: 'error' });
      }
      return;
    }
    if (editEvento) {
      const ok = await askConfirm({
        title: 'Confirmar exclusão',
        message: (
          <>
            Excluir o evento <strong>{editEvento.nome || 'sem nome'}</strong> do site?
          </>
        ),
        confirmLabel: 'Excluir',
      });
      if (!ok) return;
      try {
        const { error } = await supabase
          .from('eventos')
          .update({ deleted_at: new Date().toISOString() })
          .eq('id', editEvento.id);
        if (error) throw new Error(error.message);
        await writeAuditLog({
          action: 'delete',
          entity: 'eventos',
          entity_id: editEvento.id,
          resumo: editEvento.nome,
        });
        fecharSheet();
        onRefresh();
        setToast({ msg: 'Evento excluído.', variant: 'success' });
      } catch (err) {
        setToast({ msg: err instanceof Error ? err.message : 'Erro', variant: 'error' });
      }
    }
  };

  const confirmarWa = (c: AgendaCompromisso) => {
    const cli = clientes.find((x) => x.id === c.cliente_id);
    const when = new Date(c.inicio).toLocaleString('pt-BR');
    const local = configIle ? localOuEnderecoIle(c.local, configIle) : String(c.local ?? '').trim();
    const text = `Olá${cli ? ` ${cli.nome}` : ''}! Confirmamos o seu horário em ${when}${local ? ` — ${local}` : ''}.`;
    openExternal(buildWaMeLink(cli?.whatsapp, text));
  };

  return (
    <div className="dash-calendario-unificado" data-tour="calendario-unificado">
      <Toast message={toast?.msg ?? null} variant={toast?.variant} onDismiss={() => setToast(null)} />
      {confirmModal}

      <header className="dash-page-head">
        <div className="dash-page-head__titles">
          <h1>Agenda</h1>
          <p className="dash-muted">
            Clique num dia para adicionar. Pesquise por título ou digite uma data (ex.: 20/10/2026).
          </p>
        </div>
        <div className="dash-page-head__actions">
          <button
            type="button"
            className="dash-icon-btn"
            aria-label="Configurar categorias da Agenda"
            title="Categorias"
            onClick={() => setCatsOpen(true)}
          >
            ⚙
          </button>
        </div>
      </header>

      <div className="dash-toolbar dash-calendario-unificado__filters" data-tour="calendario-filtros">
        <input
          className="dash-clientes__busca"
          placeholder="Pesquisar título, local, pessoa ou data…"
          value={busca}
          onChange={(e) => onBuscaChange(e.target.value)}
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

      {!bootReady ? (
        <p className="dash-muted">Carregando agenda…</p>
      ) : (
        <>
      <p className="dash-muted dash-calendario-unificado__legend" aria-label="Legenda da Agenda">
        <span className="dash-cal__chip dash-cal__chip--evento" title="Evento público no site">
          E Público (site)
        </span>
        {categorias.map((c) => {
          const estilo = estiloBarraCategoria(c.cor);
          return (
            <span
              key={c.id}
              className="dash-cal__chip dash-cal__chip--custom dash-calendario-unificado__legend-cat"
              style={{
                background: estilo.background,
                color: estilo.color,
                borderLeft: estilo.borderLeft,
              }}
              title={c.nome}
            >
              {c.nome}
            </span>
          );
        })}
      </p>

      <EventosCalendar
        items={itemsFiltrados}
        viewMonth={viewMonth}
        onViewMonthChange={setViewMonth}
        onDayClick={onDayClick}
        onItemClick={onItemClick}
        toolbarExtra={
          <button type="button" className="dash-cal__copia" onClick={abrirCopiaRapida}>
            Cópia rápida
          </button>
        }
      />
        </>
      )}

      {copiaRapidaOpen && (
        <div
          className="dash-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="copia-rapida-title"
          onClick={onModalOverlayClick(() => setCopiaRapidaOpen(false))}
        >
          <div className="dash-modal dash-modal--narrow" onClick={(e) => e.stopPropagation()}>
            <header className="dash-modal__head">
              <div>
                <h2 id="copia-rapida-title">Cópia rápida</h2>
                <p className="dash-muted">Selecione as categorias do mês em exibição para a mensagem.</p>
              </div>
              <button
                type="button"
                className="dash-modal__close"
                onClick={() => setCopiaRapidaOpen(false)}
                aria-label="Fechar"
              >
                ×
              </button>
            </header>

            <div className="dash-copia-rapida-cats">
              {opcoesCopiaRapida.map((o) => (
                <label key={o.key}>
                  <input
                    type="checkbox"
                    checked={copiaCats.has(o.key)}
                    onChange={(e) => {
                      setCopiaCats((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(o.key);
                        else next.delete(o.key);
                        return next;
                      });
                    }}
                  />
                  {o.label}
                </label>
              ))}
            </div>

            <pre className="dash-copia-rapida-preview" aria-label="Pré-visualização da mensagem">
              {previewCopiaRapida}
            </pre>

            <div className="dash-form-actions">
              <button type="button" className="dash-btn-secondary" onClick={() => setCopiaRapidaOpen(false)}>
                Cancelar
              </button>
              <button
                type="button"
                className="dash-btn-primary"
                disabled={copiaCats.size === 0}
                onClick={() => void copiarAgendaRapida()}
              >
                Copiar
              </button>
            </div>
          </div>
        </div>
      )}

      {sheet && (
        <div
          className="dash-modal-overlay dash-modal-overlay--event-sheet"
          onClick={onModalOverlayClick(fecharSheet)}
        >
          <div className="dash-modal dash-event-sheet">
            <form className="dash-event-sheet__form" onSubmit={(e) => void salvarAgenda(e)}>
              <header className="dash-event-sheet__bar">
                <button type="button" className="dash-event-sheet__bar-btn" onClick={fecharSheet}>
                  Cancelar
                </button>
                <h2 className="dash-event-sheet__bar-title">
                  {editando ? 'Editar' : 'Novo'} {form.publico ? 'evento' : 'compromisso'}
                </h2>
                <button type="submit" className="dash-event-sheet__bar-btn dash-event-sheet__bar-btn--primary">
                  Salvar
                </button>
              </header>
              <div className="dash-event-sheet__body">
                <div className="dash-event-sheet__title-row">
                  <input
                    className="dash-event-sheet__title-input"
                    required
                    placeholder="Título"
                    value={form.titulo}
                    onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                  />
                  <label
                    className={`dash-event-sheet__publico ${form.publico ? 'is-on' : ''}`}
                    title="Se marcado, aparece no site"
                  >
                    <input
                      type="checkbox"
                      checked={form.publico}
                      disabled={editando}
                      onChange={(e) => {
                        const publico = e.target.checked;
                        if (publico && !podePublico) return;
                        if (!publico && !podePrivado) return;
                        setForm({ ...form, publico });
                        if (publico) setAvancadoOpen(false);
                      }}
                    />
                    <span>Público</span>
                  </label>
                </div>

                {form.publico && (
                  <label className="dash-event-sheet__field dash-event-sheet__field--full">
                    <span>Tipo</span>
                    <SearchableSelect
                      options={EVENTO_TIPO_OPTIONS}
                      value={form.evento_tipo}
                      onChange={(v) => setForm({ ...form, evento_tipo: v })}
                      aria-label="Tipo de evento no site"
                    />
                  </label>
                )}

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
                    <input
                      type="datetime-local"
                      value={form.fim}
                      onChange={(e) => setForm({ ...form, fim: e.target.value })}
                      disabled={form.publico}
                      title={form.publico ? 'Eventos públicos usam só o horário de início' : undefined}
                    />
                  </label>
                </div>

                <label className="dash-event-sheet__field dash-event-sheet__field--half">
                  <span>Local</span>
                  <input
                    value={form.local}
                    onChange={(e) => setForm({ ...form, local: e.target.value })}
                    placeholder={enderecoIle || 'Endereço do Ilê (se vazio)'}
                    aria-label="Local — vazio usa o endereço do Ilê"
                  />
                </label>

                <label className="dash-event-sheet__field dash-event-sheet__field--half">
                  <span>Notas</span>
                  <textarea
                    className="dash-event-sheet__textarea"
                    value={form.notas}
                    onChange={(e) => setForm({ ...form, notas: e.target.value })}
                  />
                </label>

                {!form.publico && (
                  <div className="dash-event-sheet__avancado">
                    <button
                      type="button"
                      className="dash-event-sheet__avancado-toggle"
                      aria-expanded={avancadoOpen}
                      onClick={() => setAvancadoOpen((v) => !v)}
                    >
                      Avançado <span aria-hidden>{avancadoOpen ? '▴' : '▾'}</span>
                    </button>
                    {avancadoOpen && (
                      <div className="dash-event-sheet__avancado-body">
                        <label className="dash-event-sheet__field">
                          <span>Usuário</span>
                          <SearchableSelect
                            options={atribuidoOptions}
                            value={form.atribuido_user_id}
                            onChange={(v) => setForm({ ...form, atribuido_user_id: v })}
                            searchPlaceholder="Buscar usuário…"
                            aria-label="Vincular a usuário"
                          />
                        </label>
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
                            options={tipoOptions}
                            value={form.tipo}
                            onChange={(v) => setForm({ ...form, tipo: v })}
                            aria-label="Tipo de compromisso"
                          />
                        </label>
                        {!editComp && (
                          <>
                            <label className="dash-event-sheet__check">
                              <input
                                type="checkbox"
                                checked={form.repetir}
                                onChange={(e) => setForm({ ...form, repetir: e.target.checked })}
                              />
                              <span>Repetir</span>
                            </label>
                            {form.repetir && (
                              <div className="dash-event-sheet__row">
                                <label className="dash-event-sheet__field">
                                  <span>Quando repetir</span>
                                  <SearchableSelect
                                    options={RECORRENCIA_OPTIONS}
                                    value={form.recorrencia_freq}
                                    onChange={(v) => setForm({ ...form, recorrencia_freq: v as RecorrenciaFreq })}
                                    aria-label="Frequência de repetição"
                                  />
                                </label>
                                <label className="dash-event-sheet__field">
                                  <span>Até</span>
                                  <input
                                    type="date"
                                    required={form.repetir}
                                    value={form.recorrencia_ate}
                                    onChange={(e) => setForm({ ...form, recorrencia_ate: e.target.value })}
                                  />
                                </label>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}

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
                            local: configIle
                              ? localOuEnderecoIle(editComp.local, configIle)
                              : editComp.local ?? undefined,
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
                              local: configIle
                                ? localOuEnderecoIle(editComp.local, configIle)
                                : editComp.local ?? undefined,
                            }),
                          )
                        }
                      >
                        Google
                      </button>
                      {onAbrirAtendimento && editComp.cliente_id && (
                        <button
                          type="button"
                          className="dash-btn-primary"
                          onClick={() => {
                            onAbrirAtendimento(editComp.cliente_id!, editComp.id);
                            fecharSheet();
                          }}
                        >
                          Abrir atendimento
                        </button>
                      )}
                      <button type="button" className="dash-event-sheet__delete" onClick={() => void excluirItem()}>
                        Excluir
                      </button>
                    </div>
                  </div>
                )}

                {editEvento && (
                  <div className="dash-form-actions" style={{ justifyContent: 'flex-start' }}>
                    <button type="button" className="dash-event-sheet__delete" onClick={() => void excluirItem()}>
                      Excluir
                    </button>
                  </div>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {catsOpen && (
        <div
          className="dash-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="agenda-cats-title"
          onClick={onModalOverlayClick(() => !catsSaving && setCatsOpen(false))}
        >
          <div className="dash-modal dash-modal--narrow" onClick={(e) => e.stopPropagation()}>
            <div className="dash-modal__head">
              <h2 id="agenda-cats-title">Categorias da Agenda</h2>
              <button
                type="button"
                className="dash-modal__close"
                aria-label="Fechar"
                disabled={catsSaving}
                onClick={() => setCatsOpen(false)}
              >
                ×
              </button>
            </div>
            <p className="dash-muted">Nome e cor usados nas barras do calendário. Arraste para reordenar.</p>
            <SortableCategoryList
              className="dash-agenda-cats"
              items={categorias}
              disabled={catsSaving}
              onItemsChange={setCategorias}
              onReorder={(ids) =>
                reorderAgendaCategorias(ids).catch((err) => {
                  setToast({ msg: err instanceof Error ? err.message : 'Erro ao reordenar.', variant: 'error' });
                  void reloadCategorias();
                })
              }
              itemClassName="dash-agenda-cats__row"
              renderItem={(c) => (
                <>
                  <input
                    type="color"
                    className="dash-agenda-cats__color"
                    value={/^#[0-9a-fA-F]{6}$/.test(c.cor) ? c.cor : '#2e5a44'}
                    aria-label={`Cor de ${c.nome}`}
                    disabled={catsSaving}
                    onChange={(e) => {
                      const cor = e.target.value;
                      setCategorias((prev) => prev.map((x) => (x.id === c.id ? { ...x, cor } : x)));
                      void updateAgendaCategoria(c.id, { cor })
                        .then(() => setToast({ msg: 'Cor atualizada.', variant: 'success' }))
                        .catch((err) => {
                          setToast({ msg: err instanceof Error ? err.message : 'Erro', variant: 'error' });
                          void reloadCategorias();
                        });
                    }}
                  />
                  <input
                    className="dash-agenda-cats__nome"
                    value={c.nome}
                    aria-label={`Nome de ${c.nome}`}
                    disabled={catsSaving}
                    onFocus={(e) => {
                      e.currentTarget.dataset.baseline = e.currentTarget.value;
                    }}
                    onChange={(e) => {
                      const nome = e.target.value;
                      setCategorias((prev) => prev.map((x) => (x.id === c.id ? { ...x, nome } : x)));
                    }}
                    onBlur={(e) => {
                      const input = e.currentTarget;
                      const nome = input.value.trim();
                      const baseline = (input.dataset.baseline ?? '').trim();
                      if (!nome) {
                        void reloadCategorias();
                        return;
                      }
                      if (nome === baseline) {
                        if (input.value !== nome) {
                          setCategorias((prev) => prev.map((x) => (x.id === c.id ? { ...x, nome } : x)));
                        }
                        return;
                      }
                      void updateAgendaCategoria(c.id, { nome })
                        .then(() => {
                          setCategorias((prev) => prev.map((x) => (x.id === c.id ? { ...x, nome } : x)));
                          if (input.isConnected) input.dataset.baseline = nome;
                          setToast({ msg: 'Nome atualizado.', variant: 'success' });
                        })
                        .catch((err) => {
                          setToast({ msg: err instanceof Error ? err.message : 'Erro', variant: 'error' });
                          void reloadCategorias();
                        });
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        e.currentTarget.blur();
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="dash-btn-min"
                    disabled={catsSaving || categorias.length <= 1}
                    onClick={() => {
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
                        setCatsSaving(true);
                        void softDeleteAgendaCategoria(c.id)
                          .then(() => reloadCategorias())
                          .then(() => setToast({ msg: 'Categoria removida.', variant: 'success' }))
                          .catch((err) => setToast({ msg: err instanceof Error ? err.message : 'Erro', variant: 'error' }))
                          .finally(() => setCatsSaving(false));
                      })();
                    }}
                  >
                    Remover
                  </button>
                </>
              )}
            />
            <form
              className="dash-agenda-cats__add"
              onSubmit={(e) => {
                e.preventDefault();
                setCatsSaving(true);
                void createAgendaCategoria({ nome: novaCatNome, cor: novaCatCor })
                  .then(() => {
                    setNovaCatNome('');
                    setNovaCatCor('#2e5a44');
                    return reloadCategorias();
                  })
                  .then(() => setToast({ msg: 'Categoria criada.', variant: 'success' }))
                  .catch((err) => setToast({ msg: err instanceof Error ? err.message : 'Erro', variant: 'error' }))
                  .finally(() => setCatsSaving(false));
              }}
            >
              <input
                type="color"
                className="dash-agenda-cats__color"
                value={novaCatCor}
                onChange={(e) => setNovaCatCor(e.target.value)}
                aria-label="Cor da nova categoria"
              />
              <input
                placeholder="Nova categoria"
                value={novaCatNome}
                onChange={(e) => setNovaCatNome(e.target.value)}
                required
                disabled={catsSaving}
              />
              <button type="submit" className="dash-btn-primary" disabled={catsSaving}>
                Adicionar
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
