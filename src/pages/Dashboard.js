import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import './Dashboard.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Cropper from 'react-easy-crop';
import { MembrosScreen } from '../components/dashboard/membros/MembrosScreen.tsx';
import { CobrancasScreen } from '../components/dashboard/cobrancas/CobrancasScreen.tsx';
import { MensalidadesScreen } from '../components/dashboard/cobrancas/MensalidadesScreen.tsx';
import { AtrasadosScreen } from '../components/dashboard/cobrancas/AtrasadosScreen.tsx';
import { OrixasConfigScreen } from '../components/dashboard/orixas/OrixasConfigScreen.tsx';
import { DashboardTour, tourButtonLabel } from '../components/dashboard/DashboardTour.tsx';
import { FinanceiroScreen } from '../components/dashboard/financeiro/FinanceiroScreen.tsx';
import { DadosIleScreen } from '../components/dashboard/config/DadosIleScreen.tsx';
import { AcessosAdminScreen } from '../components/dashboard/admin/AcessosAdminScreen.tsx';
import { ClientesScreen } from '../components/dashboard/atendimento/ClientesScreen.tsx';
import { OrcamentosScreen } from '../components/dashboard/atendimento/OrcamentosScreen.tsx';
import { CalendarioUnificadoScreen } from '../components/dashboard/atendimento/CalendarioUnificadoScreen.tsx';
import {
  ENDERECO_EVENTO_PADRAO,
  filtrarEnderecosPadrao,
  loadEnderecosPadrao,
  saveEnderecosPadrao,
} from '../utils/enderecosPadrao.ts';
import { isPasswordChangeRequired } from '../services/passwordChangeRequired.ts';
import { fetchCurrentProfile } from '../services/profiles.ts';
import { can } from '../lib/permissions.ts';
import { writeAuditLog } from '../services/auditLog.ts';
import { SearchableSelect } from '../components/dashboard/SearchableSelect.tsx';

const EVENTO_TIPO_OPTIONS = [
  { value: 'umbanda', label: 'Umbanda' },
  { value: 'quimbanda', label: 'Quimbanda' },
  { value: 'nacao', label: 'Nação' },
  { value: 'outro', label: 'Outro' },
];

const MENUS = [
  'visao-geral',
  'eventos',
  'catalogo',
  'membros',
  'cobrancas',
  'mensalidades',
  'atrasados',
  'caixa',
  'clientes',
  'orcamentos',
  'agenda',
  'dados-ile',
  'orixas',
  'acessos',
];

const RESOURCE_BY_MENU = {
  'visao-geral': 'visao_geral',
  eventos: 'eventos',
  catalogo: 'catalogo',
  membros: 'membros',
  cobrancas: 'cobrancas',
  mensalidades: 'cobrancas',
  atrasados: 'cobrancas',
  caixa: 'caixa',
  clientes: 'clientes',
  orcamentos: 'orcamentos',
  agenda: 'agenda',
  'dados-ile': 'dados_ile',
  orixas: 'orixas',
  acessos: 'acessos',
};

const defaultEvento = { id: null, nome: '', data: '', hora: '', local: '', descricao: '', tipo: 'umbanda', icone_customizado: null };
const defaultCatalogo = { id: null, nome: '', categoria: '', valor: '', descricao: '', variacoes: '' };

async function gerarImagemCropada(src, area) {
  const img = await new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = src;
  });
  const canvas = document.createElement('canvas');
  // 🔵 ÍCONE: Tamanho final do ícone salvo para uso no card
  const size = 256;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Não foi possível processar a imagem.');
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, size, size);
  return canvas.toDataURL('image/png');
}

const Dashboard = () => {
  const navigate = useNavigate();
  const [menuAtivo, setMenuAtivo] = useState(MENUS[0]);
  const [sidebarAberta, setSidebarAberta] = useState(false);
  const [sidebarFixa, setSidebarFixa] = useState(() => localStorage.getItem('dash_sidebar_fixa') === 'true');
  const [sidebarHover, setSidebarHover] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [eventos, setEventos] = useState([]);
  const [catalogo, setCatalogo] = useState([]);
  const [totalPessoas, setTotalPessoas] = useState(0);
  const [totalCobrancas, setTotalCobrancas] = useState(0);
  const [totalEntrada30d, setTotalEntrada30d] = useState(0);
  const [totalEmAberto, setTotalEmAberto] = useState(0);
  const [buscaCatalogo, setBuscaCatalogo] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('todas');
  const [eventoForm, setEventoForm] = useState(defaultEvento);
  const [catalogoForm, setCatalogoForm] = useState(defaultCatalogo);
  const [mostrarModalEvento, setMostrarModalEvento] = useState(false);
  const [mostrarModalCatalogo, setMostrarModalCatalogo] = useState(false);
  const [mostrarModalEnderecos, setMostrarModalEnderecos] = useState(false);
  const [mostrarCropEvento, setMostrarCropEvento] = useState(false);
  const [imagemTempEvento, setImagemTempEvento] = useState('');
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [areaCrop, setAreaCrop] = useState(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [userId, setUserId] = useState(null);
  const [tourRestartNonce, setTourRestartNonce] = useState(0);
  const [enderecosPadrao, setEnderecosPadrao] = useState(() => loadEnderecosPadrao());
  const [enderecoDraft, setEnderecoDraft] = useState('');
  const [enderecoEditIndex, setEnderecoEditIndex] = useState(null);
  const [enderecoFocus, setEnderecoFocus] = useState(false);
  const [profile, setProfile] = useState(null);
  const [profileError, setProfileError] = useState('');
  const [grupoAberto, setGrupoAberto] = useState(() => {
    const saved = sessionStorage.getItem('dash_grp_open');
    if (saved === 'fin' || saved === 'atend' || saved === 'cfg') return saved;
    return 'fin';
  });
  const [aniversarios, setAniversarios] = useState([]);
  const [atendResumo, setAtendResumo] = useState({ compromissosHoje: 0, orcamentosEnviados: 0, proximos48h: [] });
  const [proximoCompromisso, setProximoCompromisso] = useState(null);
  const [saldoMes, setSaldoMes] = useState(0);
  const [mensalidadesPendentes, setMensalidadesPendentes] = useState({ membros: 0, competencias: 0, valor: 0 });
  const [atendClienteId, setAtendClienteId] = useState(null);
  const modalRef = useRef(null);
  const sidebarExpandidaDesktop = sidebarFixa || sidebarHover;

  useEffect(() => {
    localStorage.setItem('dash_sidebar_fixa', sidebarFixa ? 'true' : 'false');
  }, [sidebarFixa]);

  useEffect(() => {
    const onScroll = () => {
      setShowScrollTop(window.scrollY > 220);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const scrollToTop = () => {
    const lenis = window.__lenis;
    if (lenis?.scrollTo) {
      lenis.scrollTo(0, { duration: 0.9 });
      return;
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const carregarDados = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setError('');

    const { data: sessao } = await supabase.auth.getSession();
    if (!sessao?.session) {
      navigate('/login', { replace: true });
      return;
    }

    const uid = sessao.session.user?.id ?? null;
    setUserId(uid);

    // Fluxo: Login → troca de senha (antes de carregar a dashboard) → dashboard + tutorial
    try {
      if (uid && (await isPasswordChangeRequired(uid))) {
        navigate('/trocar-senha', { replace: true });
        return;
      }
    } catch {
      /* se a verificação falhar, não bloqueia o acesso */
    }

    const hojeIso = new Date().toISOString().slice(0, 10);
    // Exclui automaticamente eventos passados (dia seguinte ao evento em diante).
    await supabase.from('eventos').delete().lt('data', hojeIso).is('deleted_at', null);

    const ha30 = new Date();
    ha30.setDate(ha30.getDate() - 30);
    const ha30Iso = ha30.toISOString().slice(0, 10);

    const mes = new Date().getMonth() + 1;
    const ano = new Date().getFullYear();
    const mesFrom = `${ano}-${String(mes).padStart(2, '0')}-01`;
    const mesTo = `${ano}-${String(mes).padStart(2, '0')}-${String(new Date(ano, mes, 0).getDate()).padStart(2, '0')}`;

    const agora = new Date();
    const hojeInicio = `${hojeIso}T00:00:00`;
    const hojeFim = `${hojeIso}T23:59:59`;
    const em48 = new Date(agora.getTime() + 48 * 60 * 60 * 1000).toISOString();

    const [
      { data: eventosData, error: eventosError },
      { data: catalogoData, error: catalogoError },
      { data: pessoasIds, error: pessoasError },
      { data: cobrancasIds, error: cobrancasCountError },
      { data: pagamentos30d, error: pagamentosError },
      { data: cobrancasSaldo, error: saldoError },
      { data: anivData },
      profileRow,
      { data: agendaHoje },
      { data: agenda48 },
      { data: orcEnviados },
      { data: proxComp },
      { data: caixaMes },
      { data: mensPendRows },
      { data: pessoasEntradaRows },
    ] = await Promise.all([
      supabase.from('eventos').select('id, nome, data, hora, local, descricao, tipo, icone_customizado, created_by').is('deleted_at', null).order('data', { ascending: true }),
      supabase.from('catalogo').select('id, nome, categoria, valor, descricao, variacoes').is('deleted_at', null).order('id', { ascending: true }),
      supabase.from('pessoas').select('id').is('deleted_at', null),
      supabase.from('cobrancas').select('id, tipo').is('deleted_at', null),
      supabase.from('cobranca_pagamentos').select('valor').gte('data_pagamento', ha30Iso).lte('data_pagamento', hojeIso),
      supabase
        .from('cobrancas')
        .select('pessoa_id, membro_id, valor_saldo, valor_total, valor_pago, valor, tipo, vencimento')
        .is('deleted_at', null),
      supabase.from('pessoas').select('id, nome, data_nascimento').is('deleted_at', null).not('data_nascimento', 'is', null),
      fetchCurrentProfile().catch(() => null),
      supabase
        .from('agenda_compromissos')
        .select('id, titulo, inicio')
        .is('deleted_at', null)
        .gte('inicio', hojeInicio)
        .lte('inicio', hojeFim),
      supabase
        .from('agenda_compromissos')
        .select('id, titulo, inicio')
        .is('deleted_at', null)
        .gte('inicio', agora.toISOString())
        .lte('inicio', em48)
        .order('inicio', { ascending: true })
        .limit(5),
      supabase.from('orcamentos').select('id').eq('status', 'enviado').is('deleted_at', null),
      supabase
        .from('agenda_compromissos')
        .select('id, titulo, inicio, fim, local, tipo, notas')
        .is('deleted_at', null)
        .gte('inicio', agora.toISOString())
        .order('inicio', { ascending: true })
        .limit(1),
      supabase
        .from('caixa_lancamentos')
        .select('tipo, valor')
        .is('deleted_at', null)
        .gte('data', mesFrom)
        .lte('data', mesTo),
      supabase
        .from('mensalidades')
        .select('pessoa_id, valor, status, mes')
        .eq('ano', ano)
        .eq('status', 'aberto'),
      supabase.from('pessoas').select('id, data_entrada'),
    ]);

    if (!profileRow) {
      setProfile(null);
      setProfileError('Sem perfil de acesso. Peça ao administrador para liberar a sua conta.');
    } else {
      setProfile(profileRow);
      setProfileError('');
    }

    if (eventosError || catalogoError || pessoasError || cobrancasCountError || pagamentosError || saldoError) {
      setError('Falha ao carregar dados da dashboard. Verifique se as tabelas existem no Supabase.');
    }

    const entrada = (pagamentos30d ?? []).reduce((acc, p) => acc + Number(p.valor ?? 0), 0);
    const entradaByPessoa = new Map(
      (pessoasEntradaRows ?? []).map((p) => [String(p.id), p.data_entrada ? String(p.data_entrada).slice(0, 10) : null]),
    );
    const cobrancaConta = (c) => {
      const pid = String(c.pessoa_id || c.membro_id || '');
      const dataEnt = entradaByPessoa.get(pid);
      if (!dataEnt) return true;
      const venc = (c.vencimento || '').slice(0, 10);
      if (!venc) return true;
      return venc >= dataEnt;
    };
    const mensConta = (r) => {
      const dataEnt = entradaByPessoa.get(String(r.pessoa_id || ''));
      if (!dataEnt) return true;
      const ey = Number(dataEnt.slice(0, 4));
      const em = Number(dataEnt.slice(5, 7));
      if (ano < ey) return false;
      if (ano > ey) return true;
      return Number(r.mes) >= em;
    };
    const isMensTipo = (t) => String(t || '').toLowerCase() === 'mensalidade';
    const emAberto = (cobrancasSaldo ?? [])
      .filter((c) => !isMensTipo(c.tipo) && cobrancaConta(c))
      .reduce((acc, c) => {
        if (c.valor_saldo != null && c.valor_saldo !== '') {
          const s = Number(c.valor_saldo);
          return acc + (Number.isNaN(s) ? 0 : Math.max(0, s));
        }
        const total = Number(c.valor_total ?? c.valor ?? 0);
        const pago = Number(c.valor_pago ?? 0);
        return acc + Math.max(0, total - pago);
      }, 0);

    const diaHoje = new Date().getDate();
    const aniv = (anivData ?? [])
      .filter((p) => {
        const d = String(p.data_nascimento).slice(5, 7);
        return Number(d) === mes;
      })
      .map((p) => {
        const iso = String(p.data_nascimento).slice(0, 10);
        const dia = Number(iso.slice(8, 10));
        const anoNasc = Number(iso.slice(0, 4));
        const idadeCompleta = ano - anoNasc;
        const passado = dia < diaHoje;
        const dm = `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}`;
        const detalhe = passado
          ? `fez ${idadeCompleta} anos em ${dm}`
          : `faz ${idadeCompleta} anos em ${dm}`;
        return {
          id: p.id,
          nome: p.nome,
          dia,
          passado,
          detalhe,
        };
      })
      .sort((a, b) => a.dia - b.dia);

    const saldoCaixaMes = (caixaMes ?? []).reduce((acc, r) => {
      const v = Number(r.valor ?? 0);
      return acc + (r.tipo === 'saida' ? -v : v);
    }, 0);

    const mensPendentes = (mensPendRows ?? []).filter((c) => mensConta(c));
    const membrosPendSet = new Set(mensPendentes.map((c) => c.pessoa_id).filter(Boolean).map(String));
    const valorMensPend = mensPendentes.reduce((acc, c) => acc + Math.max(0, Number(c.valor ?? 0)), 0);
    const obrigacoesCount = (cobrancasIds ?? []).filter((c) => !isMensTipo(c.tipo)).length;

    setAniversarios(aniv);
    setProximoCompromisso(proxComp?.[0] ?? null);
    setSaldoMes(saldoCaixaMes);
    setMensalidadesPendentes({
      membros: membrosPendSet.size || mensPendentes.length,
      competencias: mensPendentes.length,
      valor: valorMensPend,
    });
    setAtendResumo({
      compromissosHoje: agendaHoje?.length ?? 0,
      orcamentosEnviados: orcEnviados?.length ?? 0,
      proximos48h: agenda48 ?? [],
    });
    setEventos(eventosData ?? []);
    setCatalogo(catalogoData ?? []);
    setTotalPessoas(pessoasIds?.length ?? 0);
    setTotalCobrancas(obrigacoesCount);
    setTotalEntrada30d(entrada);
    setTotalEmAberto(emAberto);
    setLoading(false);
  }, [navigate]);

  useEffect(() => {
    carregarDados();
  }, [carregarDados]);

  useEffect(() => {
    const handleClickFora = (event) => {
      if (!mostrarModalEvento && !mostrarModalCatalogo && !mostrarCropEvento && !mostrarModalEnderecos) return;
      if (modalRef.current && !modalRef.current.contains(event.target)) {
        setMostrarModalEvento(false);
        setMostrarModalCatalogo(false);
        setMostrarCropEvento(false);
        setMostrarModalEnderecos(false);
        setEventoForm(defaultEvento);
        setCatalogoForm(defaultCatalogo);
        setEnderecoFocus(false);
      }
    };
    document.addEventListener('mousedown', handleClickFora);
    return () => document.removeEventListener('mousedown', handleClickFora);
  }, [mostrarModalEvento, mostrarModalCatalogo, mostrarCropEvento, mostrarModalEnderecos]);

  const eventosProximos = useMemo(() => eventos.slice(0, 3), [eventos]);
  const categorias = useMemo(() => [...new Set(catalogo.map((c) => c.categoria).filter(Boolean))], [catalogo]);

  const catalogoCategoriaOptions = useMemo(
    () => [{ value: 'todas', label: 'Todas as categorias' }, ...categorias.map((c) => ({ value: c, label: c }))],
    [categorias],
  );

  const sugestoesEndereco = useMemo(() => {
    if (!enderecoFocus) return [];
    return filtrarEnderecosPadrao(enderecosPadrao, eventoForm.local ?? '');
  }, [enderecoFocus, enderecosPadrao, eventoForm.local]);

  const catalogoFiltrado = useMemo(
    () =>
      catalogo.filter((item) => {
        const txt = `${item.nome} ${item.categoria ?? ''} ${item.descricao ?? ''}`.toLowerCase();
        const bateBusca = txt.includes(buscaCatalogo.toLowerCase().trim());
        const bateCategoria = filtroCategoria === 'todas' || item.categoria === filtroCategoria;
        return bateBusca && bateCategoria;
      }),
    [catalogo, buscaCatalogo, filtroCategoria],
  );

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  const salvarEvento = async (e) => {
    e.preventDefault();
    const payload = {
      nome: eventoForm.nome,
      data: eventoForm.data,
      hora: eventoForm.hora,
      // Se o local ficar vazio, aplica o endereço padrão solicitado.
      local: String(eventoForm.local ?? '').trim() || ENDERECO_EVENTO_PADRAO,
      descricao: eventoForm.descricao,
      tipo: eventoForm.tipo || 'umbanda',
      icone_customizado: eventoForm.tipo === 'outro' ? eventoForm.icone_customizado || null : null,
    };
    const { data: sessao } = await supabase.auth.getSession();
    const { error: saveError } = eventoForm.id
      ? await supabase.from('eventos').update(payload).eq('id', eventoForm.id)
      : await supabase.from('eventos').insert({
          ...payload,
          created_by: sessao?.session?.user?.id ?? null,
        });
    if (saveError) {
      setError('Nao foi possivel salvar o evento.');
      return;
    }
    await writeAuditLog({
      action: eventoForm.id ? 'update' : 'create',
      entity: 'eventos',
      entity_id: eventoForm.id,
      resumo: payload.nome,
    });
    setEventoForm(defaultEvento);
    setMostrarModalEvento(false);
    carregarDados({ silent: true });
  };

  const salvarCatalogo = async (e) => {
    e.preventDefault();
    const payload = {
      nome: catalogoForm.nome,
      categoria: catalogoForm.categoria,
      valor: catalogoForm.valor,
      descricao: catalogoForm.descricao,
      variacoes: catalogoForm.variacoes,
    };
    const { error: saveError } = catalogoForm.id
      ? await supabase.from('catalogo').update(payload).eq('id', catalogoForm.id)
      : await supabase.from('catalogo').insert(payload);
    if (saveError) {
      setError('Nao foi possivel salvar o item do catalogo.');
      return;
    }
    await writeAuditLog({
      action: catalogoForm.id ? 'update' : 'create',
      entity: 'catalogo',
      entity_id: catalogoForm.id,
      resumo: payload.nome,
    });
    setCatalogoForm(defaultCatalogo);
    setMostrarModalCatalogo(false);
    carregarDados({ silent: true });
  };

  const deletarRegistro = async (tabela, id) => {
    const { error: deleteError } = await supabase
      .from(tabela)
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
    if (deleteError) {
      setError(`Nao foi possivel excluir o registro: ${deleteError.message}`);
      return;
    }
    await writeAuditLog({ action: 'delete', entity: tabela, entity_id: id });
    carregarDados({ silent: true });
  };

  const pode = (resource, action) => can(Boolean(profile?.is_admin), profile?.permissions, resource, action);

  const grupoDoMenu = (id) => {
    if (id === 'cobrancas' || id === 'mensalidades' || id === 'caixa' || id === 'atrasados') return 'fin';
    if (id === 'clientes' || id === 'orcamentos' || id === 'agenda') return 'atend';
    if (id === 'dados-ile' || id === 'orixas' || id === 'acessos') return 'cfg';
    return null;
  };

  const grupoAtivo = grupoDoMenu(menuAtivo);

  const goMenu = (id) => {
    setMenuAtivo(id);
    const g = grupoDoMenu(id);
    if (g) {
      setGrupoAberto(g);
      sessionStorage.setItem('dash_grp_open', g);
    }
    setSidebarAberta(false);
  };

  const abrirGrupo = (id) => {
    // Um grupo de cada vez; o grupo do submenu ativo não pode fechar pelo próprio toggle.
    if (grupoAberto === id) {
      if (grupoAtivo === id) return;
      setGrupoAberto(null);
      sessionStorage.setItem('dash_grp_open', '');
      return;
    }
    setGrupoAberto(id);
    sessionStorage.setItem('dash_grp_open', id);
  };

  const abrirEdicaoEvento = (evento) => {
    setEventoForm({ ...defaultEvento, ...evento });
    setMostrarModalEvento(true);
  };

  const abrirEdicaoCatalogo = (item) => {
    setCatalogoForm({ ...defaultCatalogo, ...item });
    setMostrarModalCatalogo(true);
  };

  const abrirAdicaoEvento = (dataIso) => {
    const data =
      typeof dataIso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dataIso)
        ? dataIso
        : '';
    setEventoForm({ ...defaultEvento, data });
    setMostrarModalEvento(true);
  };


  const selecionarTipoEvento = (tipo) => {
    setEventoForm((prev) => ({
      ...prev,
      tipo,
      icone_customizado: tipo === 'outro' ? prev.icone_customizado : null,
    }));
  };

  const onUploadIconeEvento = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setImagemTempEvento(String(reader.result ?? ''));
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setMostrarCropEvento(true);
    };
    reader.readAsDataURL(file);
  };

  const confirmarCropEvento = async () => {
    if (!imagemTempEvento || !areaCrop) return;
    try {
      const base64 = await gerarImagemCropada(imagemTempEvento, areaCrop);
      setEventoForm((prev) => ({ ...prev, tipo: 'outro', icone_customizado: base64 }));
      setMostrarCropEvento(false);
      setImagemTempEvento('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao recortar ícone.');
    }
  };

  const abrirAdicaoCatalogo = () => {
    setCatalogoForm(defaultCatalogo);
    setMostrarModalCatalogo(true);
  };

  const abrirModalEnderecos = () => {
    setEnderecosPadrao(loadEnderecosPadrao());
    setEnderecoDraft('');
    setEnderecoEditIndex(null);
    setMostrarModalEnderecos(true);
  };

  const salvarEnderecoPadrao = (e) => {
    e.preventDefault();
    const valor = enderecoDraft.trim();
    if (!valor) return;
    const next = [...enderecosPadrao];
    if (enderecoEditIndex != null) {
      next[enderecoEditIndex] = valor;
    } else {
      next.push(valor);
    }
    const saved = saveEnderecosPadrao(next);
    setEnderecosPadrao(saved);
    setEnderecoDraft('');
    setEnderecoEditIndex(null);
  };

  const editarEnderecoPadrao = (index) => {
    setEnderecoDraft(enderecosPadrao[index] ?? '');
    setEnderecoEditIndex(index);
  };

  const excluirEnderecoPadrao = (index) => {
    const next = enderecosPadrao.filter((_, i) => i !== index);
    const saved = saveEnderecosPadrao(next);
    setEnderecosPadrao(saved);
    if (enderecoEditIndex === index) {
      setEnderecoDraft('');
      setEnderecoEditIndex(null);
    } else if (enderecoEditIndex != null && enderecoEditIndex > index) {
      setEnderecoEditIndex(enderecoEditIndex - 1);
    }
  };

  const selecionarSugestaoEndereco = (valor) => {
    setEventoForm((prev) => ({ ...prev, local: valor }));
    setEnderecoFocus(false);
  };

  const prepararUiTour = useCallback(() => {
    setSidebarAberta(false);
    setSidebarHover(false);
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, []);

  const setSidebarAbertaTour = useCallback((open) => {
    const mobile = window.matchMedia('(max-width: 980px)').matches;
    if (mobile) {
      setSidebarAberta(open);
      return;
    }
    if (open) {
      setSidebarHover(true);
      setSidebarFixa(true);
    } else {
      setSidebarHover(false);
    }
  }, []);

  const reiniciarTutorial = () => {
    setTourRestartNonce((n) => n + 1);
  };

  if (loading) return <section className="dash-page"><p>Carregando dashboard...</p></section>;

  if (profileError || !profile) {
    return (
      <section className="dash-page">
        <p className="dash-error">{profileError || 'Sem perfil de acesso.'}</p>
        <button type="button" className="dash-btn-primary" onClick={handleLogout}>
          Sair
        </button>
      </section>
    );
  }

  const MENU_ICONS = {
    'visao-geral': '⌂',
    eventos: '▦',
    catalogo: '☰',
    membros: '☺',
    cobrancas: '◈',
    mensalidades: '▦',
    atrasados: '⚠',
    caixa: '◇',
    clientes: '◎',
    orcamentos: '▤',
    agenda: '▣',
    'dados-ile': '◈',
    orixas: '✶',
    acessos: '⚙',
  };

  const menuBtn = (id, label, tour, { child = false } = {}) => {
    if (id === 'eventos') {
      if (!pode('eventos', 'r') && !pode('agenda', 'r')) return null;
    } else {
      const res = RESOURCE_BY_MENU[id];
      if (res && !pode(res, 'r')) return null;
    }
    return (
      <button
        key={id}
        data-tour={tour || `menu-${id}`}
        className={`dash-menu${child ? ' dash-menu--child' : ''}${menuAtivo === id || (id === 'eventos' && menuAtivo === 'agenda') ? ' active' : ''}`}
        type="button"
        onClick={() => goMenu(id)}
      >
        <span className="dash-menu__icon" aria-hidden>
          {MENU_ICONS[id] || '•'}
        </span>
        <span className="dash-sidebar-label">{label}</span>
      </button>
    );
  };

  const brandNome = profile?.nome_exibicao || 'Ilê De Asè';
  const brandEmail = profile?.email || '';

  return (
    <section className={`dash-page${showScrollTop ? ' dash-page--has-scroll-top' : ''}`}>
      {/* Tutorial só depois do gate de senha e dos dados carregados */}
      <DashboardTour
        userId={userId}
        menuAtivo={menuAtivo}
        restartNonce={tourRestartNonce}
        onPrepareStart={prepararUiTour}
        onSidebarOpen={setSidebarAbertaTour}
      />
      <button
        className="dash-hamburger"
        type="button"
        aria-label="Abrir menu da dashboard"
        onClick={() => setSidebarAberta((prev) => !prev)}
      >
        <span></span>
        <span></span>
        <span></span>
      </button>

      {sidebarAberta && <div className="dash-sidebar-backdrop" onClick={() => setSidebarAberta(false)} />}

      <aside
        data-tour="sidebar"
        className={`dash-sidebar ${sidebarAberta ? 'open' : ''} ${sidebarExpandidaDesktop ? 'is-expanded' : 'is-collapsed'}`}
        onMouseEnter={() => setSidebarHover(true)}
        onMouseLeave={() => setSidebarHover(false)}
      >
        <div className="dash-sidebar-brand">
          <img src="/images/logo-ile.png" alt="" className="dash-sidebar-brand__logo" />
          <div className="dash-sidebar-brand__text">
            <strong>Área Restrita</strong>
            <span>Ilê De Asè</span>
          </div>
        </div>
        <div className="dash-sidebar-mini-logo" aria-hidden={sidebarExpandidaDesktop}>
          <img src="/images/logo-ile.png" alt="Logo do terreiro" />
        </div>
        <div className="dash-sidebar-nav">
          {menuBtn('visao-geral', 'Visão geral', 'menu-visao-geral')}
          {menuBtn('eventos', 'Agenda', 'menu-eventos')}
          {menuBtn('catalogo', 'Catálogo', 'menu-catalogo')}
          {menuBtn('membros', 'Membros', 'menu-membros')}

          {(pode('cobrancas', 'r') || pode('caixa', 'r')) && (
            <div
              className={`dash-menu-group${grupoAberto === 'fin' ? ' is-open' : ''}${
                grupoAtivo === 'fin' ? ' has-active' : ''
              }`}
              data-tour="grupo-financeiro"
            >
              <button
                type="button"
                className={`dash-menu-group__toggle${grupoAberto === 'fin' ? ' is-open' : ''}${
                  grupoAtivo === 'fin' ? ' is-locked' : ''
                }`}
                aria-expanded={grupoAberto === 'fin'}
                title={grupoAtivo === 'fin' ? 'Grupo do ecrã atual' : undefined}
                onClick={() => abrirGrupo('fin')}
              >
                <span className="dash-menu__icon" aria-hidden>
                  ◈
                </span>
                <span className="dash-sidebar-label dash-menu-group__label">Financeiro</span>
                <span className="dash-menu-group__chevron" aria-hidden>
                  {grupoAberto === 'fin' ? '▴' : '▾'}
                </span>
              </button>
              <div className={`dash-menu-group__items${grupoAberto === 'fin' ? ' is-open' : ''}`}>
                {menuBtn('caixa', 'Fluxo de caixa', 'menu-caixa', { child: true })}
                {pode('cobrancas', 'r') && menuBtn('mensalidades', 'Mensalidades', 'menu-mensalidades', { child: true })}
                {pode('cobrancas', 'r') && menuBtn('atrasados', 'Atrasados', 'menu-atrasados', { child: true })}
                {pode('cobrancas', 'r') && menuBtn('cobrancas', 'Obrigações', 'menu-cobrancas', { child: true })}
              </div>
            </div>
          )}

          {(pode('clientes', 'r') || pode('orcamentos', 'r')) && (
            <div
              className={`dash-menu-group${grupoAberto === 'atend' ? ' is-open' : ''}${
                grupoAtivo === 'atend' ? ' has-active' : ''
              }`}
              data-tour="grupo-atendimento"
            >
              <button
                type="button"
                className={`dash-menu-group__toggle${grupoAberto === 'atend' ? ' is-open' : ''}${
                  grupoAtivo === 'atend' ? ' is-locked' : ''
                }`}
                aria-expanded={grupoAberto === 'atend'}
                title={grupoAtivo === 'atend' ? 'Grupo do ecrã atual' : undefined}
                onClick={() => abrirGrupo('atend')}
              >
                <span className="dash-menu__icon" aria-hidden>
                  ◎
                </span>
                <span className="dash-sidebar-label dash-menu-group__label">Atendimento</span>
                <span className="dash-menu-group__chevron" aria-hidden>
                  {grupoAberto === 'atend' ? '▴' : '▾'}
                </span>
              </button>
              <div className={`dash-menu-group__items${grupoAberto === 'atend' ? ' is-open' : ''}`}>
                {menuBtn('clientes', 'Clientes', 'menu-clientes', { child: true })}
                {menuBtn('orcamentos', 'Orçamentos', 'menu-orcamentos', { child: true })}
              </div>
            </div>
          )}

          {(pode('dados_ile', 'r') || pode('orixas', 'r') || pode('acessos', 'r')) && (
            <div
              className={`dash-menu-group${grupoAberto === 'cfg' ? ' is-open' : ''}${
                grupoAtivo === 'cfg' ? ' has-active' : ''
              }`}
              data-tour="grupo-config"
            >
              <button
                type="button"
                className={`dash-menu-group__toggle${grupoAberto === 'cfg' ? ' is-open' : ''}${
                  grupoAtivo === 'cfg' ? ' is-locked' : ''
                }`}
                aria-expanded={grupoAberto === 'cfg'}
                title={grupoAtivo === 'cfg' ? 'Grupo do ecrã atual' : undefined}
                onClick={() => abrirGrupo('cfg')}
              >
                <span className="dash-menu__icon" aria-hidden>
                  ⚙
                </span>
                <span className="dash-sidebar-label dash-menu-group__label">Configurações</span>
                <span className="dash-menu-group__chevron" aria-hidden>
                  {grupoAberto === 'cfg' ? '▴' : '▾'}
                </span>
              </button>
              <div className={`dash-menu-group__items${grupoAberto === 'cfg' ? ' is-open' : ''}`}>
                {menuBtn('dados-ile', 'Dados do Ilê', 'menu-dados-ile', { child: true })}
                {menuBtn('orixas', 'Orixás', 'menu-orixas', { child: true })}
                {menuBtn('acessos', 'Acessos de Admin', 'menu-acessos', { child: true })}
              </div>
            </div>
          )}
        </div>
        <div className="dash-sidebar-footer">
          <div className="dash-sidebar-user dash-sidebar-label">
            <strong title={brandNome}>{brandNome}</strong>
            {brandEmail ? <span title={brandEmail}>{brandEmail}</span> : null}
          </div>
          <div className="dash-sidebar-footer__actions">
            <button
              type="button"
              data-tour="sidebar-tour"
              className="dash-sidebar-tour"
              aria-label={tourButtonLabel(menuAtivo)}
              title={tourButtonLabel(menuAtivo)}
              onClick={reiniciarTutorial}
            >
              <span className="dash-sidebar-tour__icon" aria-hidden>
                ?
              </span>
              <span className="dash-sidebar-label">{tourButtonLabel(menuAtivo)}</span>
            </button>
            <button
              type="button"
              data-tour="sidebar-pin"
              className={`dash-sidebar-pin ${sidebarFixa ? 'is-active' : ''}`}
              aria-label={sidebarFixa ? 'Desafixar barra lateral' : 'Fixar barra lateral'}
              title={sidebarFixa ? 'Desafixar barra lateral' : 'Fixar barra lateral'}
              onClick={() => setSidebarFixa((prev) => !prev)}
            >
              {sidebarFixa ? '📌' : '📍'}
            </button>
          </div>
          <button className="dash-logout" onClick={handleLogout} title="Sair" type="button">
            <span className="dash-menu__icon" aria-hidden>
              →
            </span>
            <span className="dash-sidebar-label">Sair</span>
          </button>
        </div>
      </aside>

      <div className={`dash-content ${sidebarExpandidaDesktop ? 'dash-content--sidebar-expanded' : 'dash-content--sidebar-collapsed'}`}>
        {error && <p className="dash-error">{error}</p>}

        {menuAtivo === 'visao-geral' && (
          <>
            <h1>Visão Geral</h1>
            <div className="dash-overview" data-tour="stats">
              <article
                className="dash-overview-card dash-overview-card--wide"
                role="button"
                tabIndex={0}
                data-tour="atendimento-hoje"
                onClick={() => goMenu('eventos')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    goMenu('eventos');
                  }
                }}
              >
                <header className="dash-overview-card__head">
                  <span className="dash-overview-card__title">
                    <span className="dash-overview-card__icon" aria-hidden>
                      ▢
                    </span>
                    Próximo compromisso
                  </span>
                  {proximoCompromisso?.tipo && (
                    <span className="dash-overview-card__badge">{proximoCompromisso.tipo}</span>
                  )}
                </header>
                {proximoCompromisso ? (
                  <>
                    <h3 className="dash-overview-card__headline">{proximoCompromisso.titulo}</h3>
                    <p className="dash-overview-card__meta">
                      {new Date(proximoCompromisso.inicio).toLocaleString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                    {proximoCompromisso.local && (
                      <p className="dash-overview-card__meta">{proximoCompromisso.local}</p>
                    )}
                  </>
                ) : (
                  <>
                    <h3 className="dash-overview-card__headline">Nenhum</h3>
                    <p className="dash-overview-card__meta">Sem compromissos futuros na agenda</p>
                  </>
                )}
              </article>

              <article
                className="dash-overview-card"
                role="button"
                tabIndex={0}
                onClick={() => goMenu('caixa')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    goMenu('caixa');
                  }
                }}
              >
                <header className="dash-overview-card__head">
                  <span className="dash-overview-card__title">
                    <span className="dash-overview-card__icon" aria-hidden>
                      ▣
                    </span>
                    Saldo do mês
                  </span>
                </header>
                <p className={`dash-overview-card__value${saldoMes >= 0 ? ' is-positive' : ' is-negative'}`}>
                  {saldoMes.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </p>
                <p className="dash-overview-card__meta">
                  {new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })} · resultado do fluxo
                </p>
              </article>

              <article
                className="dash-overview-card"
                role="button"
                tabIndex={0}
                onClick={() => goMenu('mensalidades')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    goMenu('mensalidades');
                  }
                }}
              >
                <header className="dash-overview-card__head">
                  <span className="dash-overview-card__title">
                    <span className="dash-overview-card__icon" aria-hidden>
                      ◇
                    </span>
                    Mensalidades pendentes
                  </span>
                </header>
                <p className="dash-overview-card__value">
                  {mensalidadesPendentes.membros} membro{mensalidadesPendentes.membros === 1 ? '' : 's'}
                </p>
                <p className="dash-overview-card__meta">
                  {mensalidadesPendentes.competencias} competência
                  {mensalidadesPendentes.competencias === 1 ? '' : 's'} ·{' '}
                  {mensalidadesPendentes.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </p>
              </article>

              <article
                className="dash-overview-card"
                role="button"
                tabIndex={0}
                data-tour="proximos-eventos"
                onClick={() => goMenu('eventos')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    goMenu('eventos');
                  }
                }}
              >
                <header className="dash-overview-card__head">
                  <span className="dash-overview-card__title">
                    <span className="dash-overview-card__icon" aria-hidden>
                      ▢
                    </span>
                    Próximo evento
                  </span>
                </header>
                {eventosProximos[0] ? (
                  <>
                    <h3 className="dash-overview-card__headline">{eventosProximos[0].nome}</h3>
                    <p className="dash-overview-card__meta">
                      {eventosProximos[0].data}
                      {eventosProximos[0].hora ? ` · ${eventosProximos[0].hora}` : ''}
                    </p>
                    {eventosProximos[0].local && (
                      <p className="dash-overview-card__meta">{eventosProximos[0].local}</p>
                    )}
                  </>
                ) : (
                  <>
                    <h3 className="dash-overview-card__headline">Nenhum</h3>
                    <p className="dash-overview-card__meta">—</p>
                  </>
                )}
              </article>

              <article className="dash-overview-card dash-overview-card--birthdays" data-tour="aniversarios-mes">
                <header className="dash-overview-card__head">
                  <span className="dash-overview-card__title">
                    <span className="dash-overview-card__icon" aria-hidden>
                      ✶
                    </span>
                    Aniversariantes do mês
                  </span>
                </header>
                {aniversarios.length ? (
                  <ul className="dash-aniversarios-list">
                    {aniversarios.map((a) => (
                      <li key={a.id} className={a.passado ? 'is-passado' : a.dia === new Date().getDate() ? 'is-hoje' : undefined}>
                        <span className="dash-aniversarios-list__nome">{a.nome}</span>
                        <span className="dash-aniversarios-list__detalhe">{a.detalhe}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="dash-overview-card__meta">Nenhum aniversário neste mês.</p>
                )}
              </article>
            </div>

            <h2>Finanças e resumo</h2>
            <div className="dash-grid-stats">
              <article className="dash-card" role="button" tabIndex={0} onClick={() => goMenu('cobrancas')}>
                <h3>Obrigações</h3>
                <p className="dash-big">{totalCobrancas}</p>
              </article>
              <article className="dash-card">
                <h3>Itens no catálogo</h3>
                <p className="dash-big">{catalogo.length}</p>
              </article>
              <article className="dash-card" role="button" tabIndex={0} onClick={() => goMenu('membros')}>
                <h3>Membros</h3>
                <p className="dash-big">{totalPessoas}</p>
              </article>
              <article className="dash-card dash-card--money" role="button" tabIndex={0} onClick={() => goMenu('caixa')}>
                <h3>Entradas (30 dias)</h3>
                <p className="dash-big dash-big--money">
                  {totalEntrada30d.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </p>
              </article>
              <article className="dash-card dash-card--money" role="button" tabIndex={0} onClick={() => goMenu('cobrancas')}>
                <h3>Em aberto</h3>
                <p className="dash-big dash-big--money">
                  {totalEmAberto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </p>
              </article>
              <article className="dash-card" role="button" tabIndex={0} onClick={() => goMenu('orcamentos')}>
                <h3>Orçamentos enviados</h3>
                <p className="dash-big">{atendResumo.orcamentosEnviados}</p>
              </article>
            </div>
          </>
        )}

        {(menuAtivo === 'eventos' || menuAtivo === 'agenda') && (
          <CalendarioUnificadoScreen
            eventos={eventos}
            onRefresh={() => carregarDados({ silent: true })}
            onNovoEvento={(iso) => abrirAdicaoEvento(iso)}
            onEditEvento={abrirEdicaoEvento}
            onOpenEnderecos={abrirModalEnderecos}
            canCreateEvento={pode('eventos', 'c')}
            canCreateCompromisso={pode('agenda', 'c')}
            canSend={pode('agenda', 's')}
            initialClienteId={atendClienteId}
            onInitialClienteConsumed={() => setAtendClienteId(null)}
          />
        )}

        {menuAtivo === 'catalogo' && (
          <>
            <h1>Catalogo</h1>
            <div className="dash-section-header" data-tour="catalogo-filtros">
              <div className="dash-filtros">
                <input placeholder="Pesquisar item" value={buscaCatalogo} onChange={(e) => setBuscaCatalogo(e.target.value)} />
                <SearchableSelect
                  options={catalogoCategoriaOptions}
                  value={filtroCategoria}
                  onChange={setFiltroCategoria}
                  searchPlaceholder="Buscar categoria…"
                  aria-label="Filtrar categoria"
                />
              </div>
              <button className="dash-add-button" data-tour="catalogo-adicionar" onClick={abrirAdicaoCatalogo}>
                Adicionar item
              </button>
            </div>

            <div className="dash-filtros-mobile" data-tour="catalogo-filtros-mobile">
              <input placeholder="Pesquisar item" value={buscaCatalogo} onChange={(e) => setBuscaCatalogo(e.target.value)} />
              <SearchableSelect
                options={catalogoCategoriaOptions}
                value={filtroCategoria}
                onChange={setFiltroCategoria}
                searchPlaceholder="Buscar categoria…"
                aria-label="Filtrar categoria"
              />
            </div>

            <div className="dash-grid-3" data-tour="catalogo-lista">
              {catalogoFiltrado.map((item) => (
                <article className="dash-card" key={item.id}>
                  <h3>{item.nome}</h3>
                  <p>{item.categoria}</p>
                  <p>R$ {item.valor}</p>
                  <p>{item.descricao}</p>
                  <p>{item.variacoes}</p>
                  <div className="dash-actions">
                    <button onClick={() => abrirEdicaoCatalogo(item)}>Editar</button>
                    <button onClick={() => deletarRegistro('catalogo', item.id)}>Excluir</button>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}

        {menuAtivo === 'membros' && (
          <MembrosScreen canExcel={pode('membros', 'excel')} canRestore={pode('restaurar', 'u')} />
        )}
        {menuAtivo === 'mensalidades' && (
          <MensalidadesScreen canEdit={pode('cobrancas', 'u') || pode('cobrancas', 'c')} />
        )}
        {menuAtivo === 'cobrancas' && <CobrancasScreen canSend={pode('cobrancas', 's')} />}
        {menuAtivo === 'atrasados' && <AtrasadosScreen canSend={pode('cobrancas', 's')} />}
        {menuAtivo === 'caixa' && (
          <FinanceiroScreen
            canCreate={pode('caixa', 'c')}
            canDelete={pode('caixa', 'd')}
            canUpdate={pode('caixa', 'u')}
          />
        )}
        {menuAtivo === 'clientes' && (
          <ClientesScreen
            canCreate={pode('clientes', 'c')}
            canUpdate={pode('clientes', 'u')}
            canDelete={pode('clientes', 'd')}
            canSend={pode('clientes', 's')}
            canRestore={pode('restaurar', 'u')}
            onNovoOrcamento={(id) => {
              setAtendClienteId(id);
              goMenu('orcamentos');
            }}
            onAgendar={(id) => {
              setAtendClienteId(id);
              goMenu('eventos');
            }}
          />
        )}
        {menuAtivo === 'orcamentos' && (
          <OrcamentosScreen initialClienteId={atendClienteId} canSend={pode('orcamentos', 's')} />
        )}
        {menuAtivo === 'dados-ile' && <DadosIleScreen canEdit={pode('dados_ile', 'u')} />}
        {menuAtivo === 'orixas' && <OrixasConfigScreen />}
        {menuAtivo === 'acessos' && <AcessosAdminScreen />}
      </div>

      {mostrarModalEvento && (
        <div className="dash-modal-overlay dash-modal-overlay--event-sheet">
          <div className="dash-modal dash-event-sheet" ref={modalRef} role="dialog" aria-modal="true">
            <form className="dash-event-sheet__form" onSubmit={salvarEvento}>
              <header className="dash-event-sheet__bar">
                <button
                  type="button"
                  className="dash-event-sheet__bar-btn"
                  onClick={() => {
                    setMostrarModalEvento(false);
                    setEnderecoFocus(false);
                  }}
                >
                  Cancelar
                </button>
                <h2 className="dash-event-sheet__bar-title">{eventoForm.id ? 'Editar evento' : 'Novo evento'}</h2>
                <button type="submit" className="dash-event-sheet__bar-btn dash-event-sheet__bar-btn--primary">
                  Salvar
                </button>
              </header>

              <div className="dash-event-sheet__body">
                <input
                  className="dash-event-sheet__title-input"
                  placeholder="Título"
                  value={eventoForm.nome}
                  onChange={(e) => setEventoForm({ ...eventoForm, nome: e.target.value })}
                  required
                />

                <div className="dash-event-sheet__row">
                  <label className="dash-event-sheet__field">
                    <span>Data</span>
                    <input
                      type="date"
                      value={eventoForm.data}
                      onChange={(e) => setEventoForm({ ...eventoForm, data: e.target.value })}
                      required
                    />
                  </label>
                  <label className="dash-event-sheet__field">
                    <span>Horário</span>
                    <input
                      type="time"
                      value={eventoForm.hora}
                      onChange={(e) => setEventoForm({ ...eventoForm, hora: e.target.value })}
                      required
                    />
                  </label>
                </div>

                <label className="dash-event-sheet__field">
                  <span>Tipo</span>
                  <SearchableSelect
                    options={EVENTO_TIPO_OPTIONS}
                    value={eventoForm.tipo}
                    onChange={selecionarTipoEvento}
                    aria-label="Tipo de evento"
                  />
                </label>

                <div className="dash-event-sheet__field dash-endereco-field">
                  <span>Endereço</span>
                  <input
                    placeholder="Endereço"
                    value={eventoForm.local}
                    onChange={(e) => setEventoForm({ ...eventoForm, local: e.target.value })}
                    onFocus={() => setEnderecoFocus(true)}
                    onBlur={() => {
                      window.setTimeout(() => setEnderecoFocus(false), 150);
                    }}
                    aria-label="Endereço do evento"
                    autoComplete="off"
                  />
                  {sugestoesEndereco.length > 0 && (
                    <ul className="dash-endereco-suggestions" role="listbox">
                      {sugestoesEndereco.map((sugestao) => (
                        <li key={sugestao}>
                          <button
                            type="button"
                            className="dash-endereco-suggestions__opt"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => selecionarSugestaoEndereco(sugestao)}
                          >
                            {sugestao}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <label className="dash-event-sheet__field">
                  <span>Descrição</span>
                  <textarea
                    className="dash-event-sheet__textarea"
                    placeholder="Notas"
                    rows={3}
                    value={eventoForm.descricao}
                    onChange={(e) => setEventoForm({ ...eventoForm, descricao: e.target.value })}
                  />
                </label>

                {eventoForm.tipo === 'outro' && (
                  <div className="dash-event-sheet__field">
                    <span>Ícone personalizado</span>
                    <div className="dash-file-field">
                      <label className="dash-file-field__btn">
                        {eventoForm.icone_customizado ? 'Trocar imagem' : 'Escolher arquivo'}
                        <input
                          type="file"
                          accept="image/*"
                          hidden
                          onChange={(e) => {
                            onUploadIconeEvento(e.target.files?.[0]);
                            e.target.value = '';
                          }}
                        />
                      </label>
                      <span className="dash-file-field__name">
                        {eventoForm.icone_customizado ? 'Ícone selecionado' : 'Nenhum arquivo escolhido'}
                      </span>
                      {eventoForm.icone_customizado && (
                        <img
                          src={eventoForm.icone_customizado}
                          alt=""
                          className="dash-file-field__preview"
                        />
                      )}
                    </div>
                  </div>
                )}

                {eventoForm.id && (
                  <button
                    type="button"
                    className="dash-event-sheet__delete"
                    onClick={() => {
                      if (window.confirm('Excluir este evento?')) {
                        void deletarRegistro('eventos', eventoForm.id);
                        setMostrarModalEvento(false);
                        setEnderecoFocus(false);
                      }
                    }}
                  >
                    Excluir evento
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {mostrarCropEvento && (
        <div className="dash-modal-overlay">
          <div className="dash-modal dash-modal--narrow" ref={modalRef}>
            <div className="dash-modal__head">
              <h2>Recortar ícone do evento</h2>
              <button type="button" className="dash-modal__close" aria-label="Fechar" onClick={() => setMostrarCropEvento(false)}>
                ×
              </button>
            </div>
            <div className="dash-crop-area">
              <Cropper
                image={imagemTempEvento}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
                showGrid={false}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={(_, croppedAreaPixels) => setAreaCrop(croppedAreaPixels)}
              />
            </div>
            <label className="dash-field">
              <span>Zoom</span>
              <input type="range" min={1} max={3} step={0.05} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} />
            </label>
            <div className="dash-form-actions">
              <button type="button" className="dash-btn-secondary" onClick={() => setMostrarCropEvento(false)}>
                Cancelar
              </button>
              <button type="button" className="dash-btn-primary" onClick={() => void confirmarCropEvento()}>
                Aplicar recorte
              </button>
            </div>
          </div>
        </div>
      )}

      {mostrarModalCatalogo && (
        <div className="dash-modal-overlay">
          <div className="dash-modal" ref={modalRef}>
            <div className="dash-modal__head">
              <h2>{catalogoForm.id ? 'Editar item do catalogo' : 'Adicionar item ao catalogo'}</h2>
              <button type="button" className="dash-modal__close" aria-label="Fechar" onClick={() => setMostrarModalCatalogo(false)}>
                ×
              </button>
            </div>
            <form className="dash-form" onSubmit={salvarCatalogo}>
              <input
                placeholder="Nome"
                value={catalogoForm.nome}
                onChange={(e) => setCatalogoForm({ ...catalogoForm, nome: e.target.value })}
                required
              />
              <input
                placeholder="Categoria"
                value={catalogoForm.categoria}
                onChange={(e) => setCatalogoForm({ ...catalogoForm, categoria: e.target.value })}
                required
              />
              <input
                placeholder="Valor"
                value={catalogoForm.valor}
                onChange={(e) => setCatalogoForm({ ...catalogoForm, valor: e.target.value })}
                required
              />
              <input
                placeholder="Descricao"
                value={catalogoForm.descricao}
                onChange={(e) => setCatalogoForm({ ...catalogoForm, descricao: e.target.value })}
              />
              <input
                placeholder="Variacoes (separe por virgula)"
                value={catalogoForm.variacoes}
                onChange={(e) => setCatalogoForm({ ...catalogoForm, variacoes: e.target.value })}
              />
              <button type="submit">Salvar item</button>
            </form>
            <button className="dash-close" onClick={() => setMostrarModalCatalogo(false)}>
              Fechar
            </button>
          </div>
        </div>
      )}

      {mostrarModalEnderecos && (
        <div className="dash-modal-overlay">
          <div className="dash-modal dash-modal--narrow" ref={modalRef}>
            <div className="dash-modal__head">
              <h2>Endereços padrão</h2>
              <button type="button" className="dash-modal__close" aria-label="Fechar" onClick={() => setMostrarModalEnderecos(false)}>
                ×
              </button>
            </div>
            <p className="dash-muted">
              Estes endereços aparecem como sugestões ao digitar no campo Endereço do evento (com ao menos 1 caractere).
            </p>
            <form className="dash-form dash-form--stack" onSubmit={salvarEnderecoPadrao}>
              <label className="dash-field">
                <span>{enderecoEditIndex != null ? 'Editar endereço' : 'Novo endereço'}</span>
                <input
                  value={enderecoDraft}
                  onChange={(e) => setEnderecoDraft(e.target.value)}
                  placeholder="Ex.: R. Visc. de Pelotas, 2576..."
                  required
                />
              </label>
              <div className="dash-form-actions dash-form-actions--modal-end">
                {enderecoEditIndex != null && (
                  <button
                    type="button"
                    className="dash-btn-secondary"
                    onClick={() => {
                      setEnderecoDraft('');
                      setEnderecoEditIndex(null);
                    }}
                  >
                    Cancelar edição
                  </button>
                )}
                <button type="submit" className="dash-btn-primary">
                  {enderecoEditIndex != null ? 'Atualizar' : 'Adicionar'}
                </button>
              </div>
            </form>
            <ul className="dash-endereco-list">
              {enderecosPadrao.map((item, index) => (
                <li key={`${item}-${index}`} className="dash-endereco-list__item">
                  <span>{item}</span>
                  <div className="dash-endereco-list__actions">
                    <button type="button" onClick={() => editarEnderecoPadrao(index)}>
                      Editar
                    </button>
                    <button type="button" className="dash-endereco-list__delete" onClick={() => excluirEnderecoPadrao(index)}>
                      Excluir
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            <div className="dash-form-actions dash-form-actions--modal-end">
              <button type="button" className="dash-btn-secondary" onClick={() => setMostrarModalEnderecos(false)}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {showScrollTop && (
        <button
          type="button"
          className="dash-scroll-top"
          onClick={scrollToTop}
          aria-label="Voltar ao topo"
          title="Voltar ao topo"
        >
          ↑
        </button>
      )}
    </section>
  );
};

export default Dashboard;


