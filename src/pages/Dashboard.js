import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import './Dashboard.css';

const MENUS = ['visao-geral', 'eventos', 'catalogo', 'membros', 'cobrancas'];

const defaultEvento = { id: null, nome: '', data: '', hora: '', local: '', descricao: '' };
const defaultCatalogo = { id: null, nome: '', categoria: '', valor: '', descricao: '', variacoes: '' };
const defaultMembro = { id: null, nome: '', iniciacao: '', contato: '', orixas: '', obs: '' };
const defaultCobranca = { valor: '', vencimento: '', descricao: '' };

const Dashboard = () => {
  const navigate = useNavigate();
  const [menuAtivo, setMenuAtivo] = useState(MENUS[0]);
  const [sidebarAberta, setSidebarAberta] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [eventos, setEventos] = useState([]);
  const [catalogo, setCatalogo] = useState([]);
  const [membros, setMembros] = useState([]);
  const [cobrancas, setCobrancas] = useState([]);
  const [buscaEventos, setBuscaEventos] = useState('');
  const [buscaCatalogo, setBuscaCatalogo] = useState('');
  const [buscaMembros, setBuscaMembros] = useState('');
  const [buscaCobrancas, setBuscaCobrancas] = useState('');
  const [filtroLocal, setFiltroLocal] = useState('todos');
  const [filtroCategoria, setFiltroCategoria] = useState('todas');
  const [eventoForm, setEventoForm] = useState(defaultEvento);
  const [catalogoForm, setCatalogoForm] = useState(defaultCatalogo);
  const [membroForm, setMembroForm] = useState(defaultMembro);
  const [mostrarModalEvento, setMostrarModalEvento] = useState(false);
  const [mostrarModalCatalogo, setMostrarModalCatalogo] = useState(false);
  const [mostrarModalMembro, setMostrarModalMembro] = useState(false);
  const [cobrancaForm, setCobrancaForm] = useState(defaultCobranca);
  const modalRef = useRef(null);

  const carregarDados = async () => {
    setLoading(true);
    setError('');

    const [{ data: sessao }, { data: eventosData, error: eventosError }, { data: catalogoData, error: catalogoError }, { data: membrosData, error: membrosError }, { data: cobrancasData, error: cobrancasError }] = await Promise.all([
      supabase.auth.getSession(),
      supabase.from('eventos').select('id, nome, data, hora, local, descricao').order('data', { ascending: true }),
      supabase.from('catalogo').select('id, nome, categoria, valor, descricao, variacoes').order('id', { ascending: true }),
      supabase.from('membros').select('id, nome, iniciacao, contato, orixas, obs').order('nome', { ascending: true }),
      supabase.from('cobrancas').select('id, valor, vencimento, membro, membro_id, descricao').order('vencimento', { ascending: true }),
    ]);

    if (!sessao?.session) {
      navigate('/login');
      return;
    }

    if (eventosError || catalogoError || membrosError || cobrancasError) {
      setError('Falha ao carregar dados da dashboard. Verifique se as tabelas existem no Supabase.');
    }

    setEventos(eventosData ?? []);
    setCatalogo(catalogoData ?? []);
    setMembros(membrosData ?? []);
    setCobrancas(cobrancasData ?? []);
    setLoading(false);
  };

  useEffect(() => {
    carregarDados();
  }, []);

  useEffect(() => {
    const handleClickFora = (event) => {
      if (!mostrarModalMembro && !mostrarModalEvento && !mostrarModalCatalogo) return;
      if (modalRef.current && !modalRef.current.contains(event.target)) {
        setMostrarModalMembro(false);
        setMostrarModalEvento(false);
        setMostrarModalCatalogo(false);
        setMembroForm(defaultMembro);
        setEventoForm(defaultEvento);
        setCatalogoForm(defaultCatalogo);
        setCobrancaForm(defaultCobranca);
      }
    };
    document.addEventListener('mousedown', handleClickFora);
    return () => document.removeEventListener('mousedown', handleClickFora);
  }, [mostrarModalMembro, mostrarModalEvento, mostrarModalCatalogo]);

  const eventosProximos = useMemo(() => eventos.slice(0, 3), [eventos]);
  const locais = useMemo(() => [...new Set(eventos.map((e) => e.local).filter(Boolean))], [eventos]);
  const categorias = useMemo(() => [...new Set(catalogo.map((c) => c.categoria).filter(Boolean))], [catalogo]);

  const eventosFiltrados = useMemo(() => eventos.filter((e) => {
    const txt = `${e.nome} ${e.local ?? ''} ${e.descricao ?? ''}`.toLowerCase();
    const bateBusca = txt.includes(buscaEventos.toLowerCase().trim());
    const bateLocal = filtroLocal === 'todos' || e.local === filtroLocal;
    return bateBusca && bateLocal;
  }), [eventos, buscaEventos, filtroLocal]);

  const catalogoFiltrado = useMemo(() => catalogo.filter((item) => {
    const txt = `${item.nome} ${item.categoria ?? ''} ${item.descricao ?? ''}`.toLowerCase();
    const bateBusca = txt.includes(buscaCatalogo.toLowerCase().trim());
    const bateCategoria = filtroCategoria === 'todas' || item.categoria === filtroCategoria;
    return bateBusca && bateCategoria;
  }), [catalogo, buscaCatalogo, filtroCategoria]);

  const membrosFiltrados = useMemo(() => membros.filter((m) => {
    const orixasTxt = Array.isArray(m.orixas) ? m.orixas.join(', ') : (m.orixas ?? '');
    const txt = `${m.nome} ${m.contato ?? ''} ${orixasTxt} ${m.obs ?? ''}`.toLowerCase();
    return txt.includes(buscaMembros.toLowerCase().trim());
  }), [membros, buscaMembros]);

  const cobrancasComMembro = useMemo(() => {
    const mapaMembros = new Map(membros.map((m) => [String(m.id), m.nome]));
    return cobrancas.map((c) => ({
      ...c,
      membro_nome: c.membro || mapaMembros.get(String(c.membro_id)) || 'Membro nao informado',
    }));
  }, [cobrancas, membros]);

  const cobrancasFiltradas = useMemo(() => {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    return cobrancasComMembro
      .filter((c) => {
        const txt = `${c.membro_nome} ${c.valor ?? ''} ${c.vencimento ?? ''} ${c.descricao ?? ''}`.toLowerCase();
        return txt.includes(buscaCobrancas.toLowerCase().trim());
      })
      .sort((a, b) => {
        const da = a.vencimento ? new Date(a.vencimento) : new Date('9999-12-31');
        const db = b.vencimento ? new Date(b.vencimento) : new Date('9999-12-31');
        return da - db;
      });
  }, [cobrancasComMembro, buscaCobrancas]);

  const getStatusCobranca = (vencimento) => {
    if (!vencimento) return { label: 'Sem vencimento', className: 'status-neutro' };
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const dataVenc = new Date(vencimento);
    dataVenc.setHours(0, 0, 0, 0);
    if (dataVenc < hoje) return { label: 'Vencida', className: 'status-vencida' };
    if (dataVenc.getTime() === hoje.getTime()) return { label: 'Vence hoje', className: 'status-hoje' };
    return { label: 'Em dia', className: 'status-em-dia' };
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  const salvarEvento = async (e) => {
    e.preventDefault();
    const payload = { nome: eventoForm.nome, data: eventoForm.data, hora: eventoForm.hora, local: eventoForm.local, descricao: eventoForm.descricao };
    const { error: saveError } = eventoForm.id
      ? await supabase.from('eventos').update(payload).eq('id', eventoForm.id)
      : await supabase.from('eventos').insert(payload);
    if (saveError) {
      setError('Nao foi possivel salvar o evento.');
      return;
    }
    setEventoForm(defaultEvento);
    setMostrarModalEvento(false);
    carregarDados();
  };

  const salvarCatalogo = async (e) => {
    e.preventDefault();
    const payload = { nome: catalogoForm.nome, categoria: catalogoForm.categoria, valor: catalogoForm.valor, descricao: catalogoForm.descricao, variacoes: catalogoForm.variacoes };
    const { error: saveError } = catalogoForm.id
      ? await supabase.from('catalogo').update(payload).eq('id', catalogoForm.id)
      : await supabase.from('catalogo').insert(payload);
    if (saveError) {
      setError('Nao foi possivel salvar o item do catalogo.');
      return;
    }
    setCatalogoForm(defaultCatalogo);
    setMostrarModalCatalogo(false);
    carregarDados();
  };

  const salvarMembro = async (e) => {
    e.preventDefault();
    const orixasArray = membroForm.orixas
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    const payload = {
      nome: membroForm.nome,
      iniciacao: membroForm.iniciacao || null,
      contato: membroForm.contato,
      orixas: orixasArray,
      obs: membroForm.obs,
    };
    const { error: saveError } = membroForm.id
      ? await supabase.from('membros').update(payload).eq('id', membroForm.id)
      : await supabase.from('membros').insert(payload);
    if (saveError) {
      setError(`Nao foi possivel salvar o membro: ${saveError.message}`);
      return;
    }
    setMembroForm(defaultMembro);
    setMostrarModalMembro(false);
    carregarDados();
  };

  const salvarCobranca = async (e) => {
    e.preventDefault();
    if (!membroForm.id) {
      setError('Selecione um membro para vincular a cobranca.');
      return;
    }

    const payload = {
      membro_id: membroForm.id,
      membro: membroForm.nome,
      valor: cobrancaForm.valor,
      vencimento: cobrancaForm.vencimento || null,
      descricao: cobrancaForm.descricao || null,
    };

    const { error: saveError } = await supabase.from('cobrancas').insert(payload);
    if (saveError) {
      setError(`Nao foi possivel salvar a cobranca: ${saveError.message}`);
      return;
    }

    setCobrancaForm(defaultCobranca);
    carregarDados();
  };

  const deletarRegistro = async (tabela, id) => {
    const { error: deleteError } = await supabase.from(tabela).delete().eq('id', id);
    if (deleteError) {
      setError(`Nao foi possivel excluir o registro: ${deleteError.message}`);
      return;
    }
    carregarDados();
  };

  const abrirEdicaoMembro = (m) => {
    setMembroForm({
      ...defaultMembro,
      ...m,
      iniciacao: m.iniciacao || '',
      contato: m.contato || '',
      obs: m.obs || '',
      orixas: Array.isArray(m.orixas) ? m.orixas.join(', ') : (m.orixas || ''),
    });
    setCobrancaForm(defaultCobranca);
    setMostrarModalMembro(true);
  };

  const abrirEdicaoEvento = (evento) => {
    setEventoForm({ ...defaultEvento, ...evento });
    setMostrarModalEvento(true);
  };

  const abrirEdicaoCatalogo = (item) => {
    setCatalogoForm({ ...defaultCatalogo, ...item });
    setMostrarModalCatalogo(true);
  };

  const cobrancasDoMembro = useMemo(() => {
    if (!membroForm.id) return [];
    return cobrancas.filter((c) => String(c.membro_id) === String(membroForm.id));
  }, [cobrancas, membroForm.id]);

  if (loading) return <section className="dash-page"><p>Carregando dashboard...</p></section>;

  return (
    <section className="dash-page">
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

      <aside className={`dash-sidebar drawer ${sidebarAberta ? 'open' : ''}`}>
        <h2>Area Restrita</h2>
        <button className={`dash-menu ${menuAtivo === 'visao-geral' ? 'active' : ''}`} onClick={() => { setMenuAtivo('visao-geral'); setSidebarAberta(false); }}>Visao geral</button>
        <button className={`dash-menu ${menuAtivo === 'eventos' ? 'active' : ''}`} onClick={() => { setMenuAtivo('eventos'); setSidebarAberta(false); }}>Eventos</button>
        <button className={`dash-menu ${menuAtivo === 'catalogo' ? 'active' : ''}`} onClick={() => { setMenuAtivo('catalogo'); setSidebarAberta(false); }}>Catalogo</button>
        <button className={`dash-menu ${menuAtivo === 'membros' ? 'active' : ''}`} onClick={() => { setMenuAtivo('membros'); setSidebarAberta(false); }}>Membros</button>
        <button className={`dash-menu ${menuAtivo === 'cobrancas' ? 'active' : ''}`} onClick={() => { setMenuAtivo('cobrancas'); setSidebarAberta(false); }}>Cobrancas</button>
        <button className="dash-logout" onClick={handleLogout}>Sair</button>
      </aside>

      <div className="dash-content">
        {error && <p className="dash-error">{error}</p>}

        {menuAtivo === 'visao-geral' && (
          <>
            <h1>Visao geral</h1>
            <div className="dash-grid-3">
              <article className="dash-card"><h3>Cobrancas</h3><p className="dash-big">{cobrancas.length}</p></article>
              <article className="dash-card"><h3>Itens no catalogo</h3><p className="dash-big">{catalogo.length}</p></article>
              <article className="dash-card"><h3>Membros</h3><p className="dash-big">{membros.length}</p></article>
            </div>
            <h2>Proximos eventos</h2>
            <div className="dash-grid-3">
              {eventosProximos.map((e) => (
                <article key={e.id} className="dash-card">
                  <h3>{e.nome}</h3>
                  <p>{e.data}</p>
                  <p>{e.local}</p>
                </article>
              ))}
            </div>
          </>
        )}

        {menuAtivo === 'eventos' && (
          <>
            <h1>Eventos</h1>
            <form className="dash-form" onSubmit={salvarEvento}>
              <input placeholder="Nome" value={eventoForm.nome} onChange={(e) => setEventoForm({ ...eventoForm, nome: e.target.value })} required />
              <input type="date" value={eventoForm.data} onChange={(e) => setEventoForm({ ...eventoForm, data: e.target.value })} required />
              <input type="time" value={eventoForm.hora} onChange={(e) => setEventoForm({ ...eventoForm, hora: e.target.value })} required />
              <input placeholder="Local" value={eventoForm.local} onChange={(e) => setEventoForm({ ...eventoForm, local: e.target.value })} required />
              <input placeholder="Descricao" value={eventoForm.descricao} onChange={(e) => setEventoForm({ ...eventoForm, descricao: e.target.value })} />
              <button type="submit">{eventoForm.id ? 'Atualizar evento' : 'Adicionar evento'}</button>
            </form>

            <div className="dash-filtros">
              <input placeholder="Pesquisar evento" value={buscaEventos} onChange={(e) => setBuscaEventos(e.target.value)} />
              <select value={filtroLocal} onChange={(e) => setFiltroLocal(e.target.value)}>
                <option value="todos">Todos os locais</option>
                {locais.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>

            <div className="dash-grid-3">
              {eventosFiltrados.map((e) => (
                <article className="dash-card" key={e.id}>
                  <h3>{e.nome}</h3>
                  <p>{e.data} - {e.hora}</p>
                  <p>{e.local}</p>
                  <p>{e.descricao}</p>
                  <div className="dash-actions">
                    <button onClick={() => abrirEdicaoEvento(e)}>Editar</button>
                    <button onClick={() => deletarRegistro('eventos', e.id)}>Excluir</button>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}

        {menuAtivo === 'catalogo' && (
          <>
            <h1>Catalogo</h1>
            <form className="dash-form" onSubmit={salvarCatalogo}>
              <input placeholder="Nome" value={catalogoForm.nome} onChange={(e) => setCatalogoForm({ ...catalogoForm, nome: e.target.value })} required />
              <input placeholder="Categoria" value={catalogoForm.categoria} onChange={(e) => setCatalogoForm({ ...catalogoForm, categoria: e.target.value })} required />
              <input placeholder="Valor" value={catalogoForm.valor} onChange={(e) => setCatalogoForm({ ...catalogoForm, valor: e.target.value })} required />
              <input placeholder="Descricao" value={catalogoForm.descricao} onChange={(e) => setCatalogoForm({ ...catalogoForm, descricao: e.target.value })} />
              <input placeholder="Variacoes (separe por virgula)" value={catalogoForm.variacoes} onChange={(e) => setCatalogoForm({ ...catalogoForm, variacoes: e.target.value })} />
              <button type="submit">{catalogoForm.id ? 'Atualizar item' : 'Adicionar item'}</button>
            </form>

            <div className="dash-filtros">
              <input placeholder="Pesquisar item" value={buscaCatalogo} onChange={(e) => setBuscaCatalogo(e.target.value)} />
              <select value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value)}>
                <option value="todas">Todas as categorias</option>
                {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div className="dash-grid-3">
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
          <>
            <h1>Membros</h1>
            <form className="dash-form" onSubmit={salvarMembro}>
              <input placeholder="Nome" value={membroForm.nome} onChange={(e) => setMembroForm({ ...membroForm, nome: e.target.value })} required />
              <input type="date" title="Data de iniciacao" aria-label="Data de iniciacao" value={membroForm.iniciacao} onChange={(e) => setMembroForm({ ...membroForm, iniciacao: e.target.value })} />
              <input placeholder="Contato" value={membroForm.contato} onChange={(e) => setMembroForm({ ...membroForm, contato: e.target.value })} />
              <input placeholder="Orixas (separe por virgula)" value={membroForm.orixas} onChange={(e) => setMembroForm({ ...membroForm, orixas: e.target.value })} />
              <input placeholder="Observacoes" value={membroForm.obs} onChange={(e) => setMembroForm({ ...membroForm, obs: e.target.value })} />
              <button type="submit">{membroForm.id ? 'Atualizar membro' : 'Adicionar membro'}</button>
            </form>

            <div className="dash-filtros">
              <input placeholder="Pesquisar membro" value={buscaMembros} onChange={(e) => setBuscaMembros(e.target.value)} />
            </div>

            <div className="dash-grid-3">
              {membrosFiltrados.map((m) => (
                <article className="dash-card" key={m.id}>
                  <h3>{m.nome}</h3>
                  <p>Iniciacao: {m.iniciacao || '-'}</p>
                  <p>Contato: {m.contato || '-'}</p>
                  <p>Orixas: {Array.isArray(m.orixas) ? m.orixas.join(', ') : (m.orixas || '-')}</p>
                  <p>{m.obs}</p>
                  <div className="dash-actions">
                    <button onClick={() => abrirEdicaoMembro(m)}>Editar</button>
                    <button onClick={() => deletarRegistro('membros', m.id)}>Excluir</button>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}

        {menuAtivo === 'cobrancas' && (
          <>
            <h1>Cobrancas proximas</h1>
            <div className="dash-filtros">
              <input
                placeholder="Pesquisar por membro, valor ou vencimento"
                value={buscaCobrancas}
                onChange={(e) => setBuscaCobrancas(e.target.value)}
              />
            </div>
            <div className="dash-grid-3">
              {cobrancasFiltradas.map((c) => (
                <article className="dash-card" key={c.id}>
                  <span className={`dash-status ${getStatusCobranca(c.vencimento).className}`}>
                    {getStatusCobranca(c.vencimento).label}
                  </span>
                  <h3>{c.membro_nome}</h3>
                  <p><strong>Descricao:</strong> {c.descricao || '-'}</p>
                  <p><strong>Valor:</strong> R$ {Number(c.valor || 0).toFixed(2)}</p>
                  <p><strong>Vencimento:</strong> {c.vencimento || '-'}</p>
                </article>
              ))}
            </div>
          </>
        )}
      </div>

      {mostrarModalEvento && (
        <div className="dash-modal-overlay">
          <div className="dash-modal" ref={modalRef}>
            <h2>Editar evento</h2>
            <form className="dash-form" onSubmit={salvarEvento}>
              <input placeholder="Nome" value={eventoForm.nome} onChange={(e) => setEventoForm({ ...eventoForm, nome: e.target.value })} required />
              <input type="date" value={eventoForm.data} onChange={(e) => setEventoForm({ ...eventoForm, data: e.target.value })} required />
              <input type="time" value={eventoForm.hora} onChange={(e) => setEventoForm({ ...eventoForm, hora: e.target.value })} required />
              <input placeholder="Local" value={eventoForm.local} onChange={(e) => setEventoForm({ ...eventoForm, local: e.target.value })} required />
              <input placeholder="Descricao" value={eventoForm.descricao} onChange={(e) => setEventoForm({ ...eventoForm, descricao: e.target.value })} />
              <button type="submit">Salvar evento</button>
            </form>
            <button className="dash-close" onClick={() => setMostrarModalEvento(false)}>Fechar</button>
          </div>
        </div>
      )}

      {mostrarModalCatalogo && (
        <div className="dash-modal-overlay">
          <div className="dash-modal" ref={modalRef}>
            <h2>Editar item do catalogo</h2>
            <form className="dash-form" onSubmit={salvarCatalogo}>
              <input placeholder="Nome" value={catalogoForm.nome} onChange={(e) => setCatalogoForm({ ...catalogoForm, nome: e.target.value })} required />
              <input placeholder="Categoria" value={catalogoForm.categoria} onChange={(e) => setCatalogoForm({ ...catalogoForm, categoria: e.target.value })} required />
              <input placeholder="Valor" value={catalogoForm.valor} onChange={(e) => setCatalogoForm({ ...catalogoForm, valor: e.target.value })} required />
              <input placeholder="Descricao" value={catalogoForm.descricao} onChange={(e) => setCatalogoForm({ ...catalogoForm, descricao: e.target.value })} />
              <input placeholder="Variacoes (separe por virgula)" value={catalogoForm.variacoes} onChange={(e) => setCatalogoForm({ ...catalogoForm, variacoes: e.target.value })} />
              <button type="submit">Salvar item</button>
            </form>
            <button className="dash-close" onClick={() => setMostrarModalCatalogo(false)}>Fechar</button>
          </div>
        </div>
      )}

      {mostrarModalMembro && (
        <div className="dash-modal-overlay">
          <div className="dash-modal" ref={modalRef}>
            <h2>Editar membro</h2>
            <form className="dash-form" onSubmit={salvarMembro}>
              <input placeholder="Nome" value={membroForm.nome} onChange={(e) => setMembroForm({ ...membroForm, nome: e.target.value })} required />
              <input type="date" title="Data de iniciacao" aria-label="Data de iniciacao" value={membroForm.iniciacao} onChange={(e) => setMembroForm({ ...membroForm, iniciacao: e.target.value })} />
              <input placeholder="Contato" value={membroForm.contato} onChange={(e) => setMembroForm({ ...membroForm, contato: e.target.value })} />
              <input placeholder="Orixas (separe por virgula)" value={membroForm.orixas} onChange={(e) => setMembroForm({ ...membroForm, orixas: e.target.value })} />
              <input placeholder="Observacoes" value={membroForm.obs} onChange={(e) => setMembroForm({ ...membroForm, obs: e.target.value })} />
              <button type="submit">Salvar membro</button>
            </form>

            <h3>Cobrancas do membro</h3>
            <form className="dash-form" onSubmit={salvarCobranca}>
              <input
                type="number"
                step="0.01"
                placeholder="Valor da cobranca"
                value={cobrancaForm.valor}
                onChange={(e) => setCobrancaForm({ ...cobrancaForm, valor: e.target.value })}
                required
              />
              <input
                type="text"
                placeholder="Descricao da cobranca"
                value={cobrancaForm.descricao}
                onChange={(e) => setCobrancaForm({ ...cobrancaForm, descricao: e.target.value })}
                required
              />
              <input
                type="date"
                title="Data de vencimento"
                aria-label="Data de vencimento"
                value={cobrancaForm.vencimento}
                onChange={(e) => setCobrancaForm({ ...cobrancaForm, vencimento: e.target.value })}
                required
              />
              <button type="submit">Adicionar cobranca</button>
            </form>

            <div className="dash-grid-3">
              {cobrancasDoMembro.map((c) => (
                <article className="dash-card" key={`${c.id}-${c.vencimento}`}>
                  <span className={`dash-status ${getStatusCobranca(c.vencimento).className}`}>
                    {getStatusCobranca(c.vencimento).label}
                  </span>
                  <p><strong>Descricao:</strong> {c.descricao || '-'}</p>
                  <p><strong>Valor:</strong> R$ {c.valor}</p>
                  <p><strong>Vencimento:</strong> {c.vencimento || '-'}</p>
                  <div className="dash-actions">
                    <button onClick={() => deletarRegistro('cobrancas', c.id)}>Excluir cobranca</button>
                  </div>
                </article>
              ))}
            </div>

            <button className="dash-close" onClick={() => setMostrarModalMembro(false)}>Fechar</button>
          </div>
        </div>
      )}
    </section>
  );
};

export default Dashboard;
