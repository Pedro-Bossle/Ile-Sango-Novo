import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import './Dashboard.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Cropper from 'react-easy-crop';
import { MembrosScreen } from '../components/dashboard/membros/MembrosScreen.tsx';
import { CobrancasScreen } from '../components/dashboard/cobrancas/CobrancasScreen.tsx';

const MENUS = ['visao-geral', 'eventos', 'catalogo', 'membros', 'cobrancas'];
const ENDERECO_EVENTO_PADRAO = 'R. Visc. de Pelotas, 2576 - Pio X, Caxias do Sul - RS, 95020-500';

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
  const [buscaEventos, setBuscaEventos] = useState('');
  const [buscaCatalogo, setBuscaCatalogo] = useState('');
  const [filtroLocal, setFiltroLocal] = useState('todos');
  const [filtroCategoria, setFiltroCategoria] = useState('todas');
  const [eventoForm, setEventoForm] = useState(defaultEvento);
  const [catalogoForm, setCatalogoForm] = useState(defaultCatalogo);
  const [mostrarModalEvento, setMostrarModalEvento] = useState(false);
  const [mostrarModalCatalogo, setMostrarModalCatalogo] = useState(false);
  const [mostrarCropEvento, setMostrarCropEvento] = useState(false);
  const [imagemTempEvento, setImagemTempEvento] = useState('');
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [areaCrop, setAreaCrop] = useState(null);
  const modalRef = useRef(null);
  const sidebarExpandidaDesktop = sidebarFixa || sidebarHover;

  useEffect(() => {
    localStorage.setItem('dash_sidebar_fixa', sidebarFixa ? 'true' : 'false');
  }, [sidebarFixa]);

  const carregarDados = useCallback(async () => {
    setLoading(true);
    setError('');
    const hojeIso = new Date().toISOString().slice(0, 10);
    // Exclui automaticamente eventos passados (dia seguinte ao evento em diante).
    await supabase.from('eventos').delete().lt('data', hojeIso);

    const [
      { data: sessao },
      { data: eventosData, error: eventosError },
      { data: catalogoData, error: catalogoError },
      { data: pessoasIds, error: pessoasError },
      { data: cobrancasIds, error: cobrancasCountError },
    ] = await Promise.all([
      supabase.auth.getSession(),
      supabase.from('eventos').select('id, nome, data, hora, local, descricao, tipo, icone_customizado').order('data', { ascending: true }),
      supabase.from('catalogo').select('id, nome, categoria, valor, descricao, variacoes').order('id', { ascending: true }),
      // `count` + head:true pode devolver valor errado em alguns casos; o tamanho da lista de ids
      // corresponde ao que o utilizador pode ver (RLS) e à contagem real de linhas.
      supabase.from('pessoas').select('id'),
      supabase.from('cobrancas').select('id').is('deleted_at', null),
    ]);

    if (!sessao?.session) {
      navigate('/login');
      return;
    }

    if (eventosError || catalogoError || pessoasError || cobrancasCountError) {
      setError('Falha ao carregar dados da dashboard. Verifique se as tabelas existem no Supabase.');
    }

    setEventos(eventosData ?? []);
    setCatalogo(catalogoData ?? []);
    setTotalPessoas(pessoasIds?.length ?? 0);
    setTotalCobrancas(cobrancasIds?.length ?? 0);
    setLoading(false);
  }, [navigate]);

  useEffect(() => {
    carregarDados();
  }, [carregarDados]);

  useEffect(() => {
    const handleClickFora = (event) => {
      if (!mostrarModalEvento && !mostrarModalCatalogo && !mostrarCropEvento) return;
      if (modalRef.current && !modalRef.current.contains(event.target)) {
        setMostrarModalEvento(false);
        setMostrarModalCatalogo(false);
        setMostrarCropEvento(false);
        setEventoForm(defaultEvento);
        setCatalogoForm(defaultCatalogo);
      }
    };
    document.addEventListener('mousedown', handleClickFora);
    return () => document.removeEventListener('mousedown', handleClickFora);
  }, [mostrarModalEvento, mostrarModalCatalogo, mostrarCropEvento]);

  const eventosProximos = useMemo(() => eventos.slice(0, 3), [eventos]);
  const locais = useMemo(() => [...new Set(eventos.map((e) => e.local).filter(Boolean))], [eventos]);
  const categorias = useMemo(() => [...new Set(catalogo.map((c) => c.categoria).filter(Boolean))], [catalogo]);

  const eventosFiltrados = useMemo(
    () =>
      eventos.filter((e) => {
        const txt = `${e.nome} ${e.local ?? ''} ${e.descricao ?? ''}`.toLowerCase();
        const bateBusca = txt.includes(buscaEventos.toLowerCase().trim());
        const bateLocal = filtroLocal === 'todos' || e.local === filtroLocal;
        return bateBusca && bateLocal;
      }),
    [eventos, buscaEventos, filtroLocal],
  );

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
    setCatalogoForm(defaultCatalogo);
    setMostrarModalCatalogo(false);
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

  const abrirEdicaoEvento = (evento) => {
    setEventoForm({ ...defaultEvento, ...evento });
    setMostrarModalEvento(true);
  };

  const abrirEdicaoCatalogo = (item) => {
    setCatalogoForm({ ...defaultCatalogo, ...item });
    setMostrarModalCatalogo(true);
  };

  const abrirAdicaoEvento = () => {
    setEventoForm(defaultEvento);
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

      <aside
        className={`dash-sidebar ${sidebarAberta ? 'open' : ''} ${sidebarExpandidaDesktop ? 'is-expanded' : 'is-collapsed'}`}
        onMouseEnter={() => setSidebarHover(true)}
        onMouseLeave={() => setSidebarHover(false)}
      >
        <div className="dash-sidebar-mini-logo" aria-hidden={sidebarExpandidaDesktop}>
          <img src="/images/logo-ile.png" alt="Logo do terreiro" />
        </div>
        <h2 className="dash-sidebar-label">Area Restrita</h2>
        <button
          className={`dash-menu ${menuAtivo === 'visao-geral' ? 'active' : ''}`}
          onClick={() => {
            setMenuAtivo('visao-geral');
            setSidebarAberta(false);
          }}
        >
          <span className="dash-sidebar-label">Visao geral</span>
        </button>
        <button
          className={`dash-menu ${menuAtivo === 'eventos' ? 'active' : ''}`}
          onClick={() => {
            setMenuAtivo('eventos');
            setSidebarAberta(false);
          }}
        >
          <span className="dash-sidebar-label">Eventos</span>
        </button>
        <button
          className={`dash-menu ${menuAtivo === 'catalogo' ? 'active' : ''}`}
          onClick={() => {
            setMenuAtivo('catalogo');
            setSidebarAberta(false);
          }}
        >
          <span className="dash-sidebar-label">Catalogo</span>
        </button>
        <button
          className={`dash-menu ${menuAtivo === 'membros' ? 'active' : ''}`}
          onClick={() => {
            setMenuAtivo('membros');
            setSidebarAberta(false);
          }}
        >
          <span className="dash-sidebar-label">Membros</span>
        </button>
        <button
          className={`dash-menu ${menuAtivo === 'cobrancas' ? 'active' : ''}`}
          onClick={() => {
            setMenuAtivo('cobrancas');
            setSidebarAberta(false);
          }}
        >
          <span className="dash-sidebar-label">Cobrancas</span>
        </button>
        <button className="dash-logout" onClick={handleLogout} title="Sair">
          <span className="dash-sidebar-label">Sair</span>
        </button>
        <button
          type="button"
          className={`dash-sidebar-pin ${sidebarFixa ? 'is-active' : ''}`}
          aria-label={sidebarFixa ? 'Desafixar barra lateral' : 'Fixar barra lateral'}
          title={sidebarFixa ? 'Desafixar barra lateral' : 'Fixar barra lateral'}
          onClick={() => setSidebarFixa((prev) => !prev)}
        >
          {sidebarFixa ? '📌' : '📍'}
        </button>
      </aside>

      <div className={`dash-content ${sidebarExpandidaDesktop ? 'dash-content--sidebar-expanded' : 'dash-content--sidebar-collapsed'}`}>
        {error && <p className="dash-error">{error}</p>}

        {menuAtivo === 'visao-geral' && (
          <>
            <h1>Visao geral</h1>
            <div className="dash-grid-3">
              <article className="dash-card">
                <h3>Cobrancas</h3>
                <p className="dash-big">{totalCobrancas}</p>
              </article>
              <article className="dash-card">
                <h3>Itens no catalogo</h3>
                <p className="dash-big">{catalogo.length}</p>
              </article>
              <article className="dash-card">
                <h3>Membros</h3>
                <p className="dash-big">{totalPessoas}</p>
              </article>
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
            <div className="dash-section-header">
              <div className="dash-filtros">
                <input placeholder="Pesquisar evento" value={buscaEventos} onChange={(e) => setBuscaEventos(e.target.value)} />
                <select value={filtroLocal} onChange={(e) => setFiltroLocal(e.target.value)}>
                  <option value="todos">Todos os locais</option>
                  {locais.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
              <button className="dash-add-button" onClick={abrirAdicaoEvento}>
                Adicionar evento
              </button>
            </div>

            <div className="dash-filtros-mobile">
              <input placeholder="Pesquisar evento" value={buscaEventos} onChange={(e) => setBuscaEventos(e.target.value)} />
              <select value={filtroLocal} onChange={(e) => setFiltroLocal(e.target.value)}>
                <option value="todos">Todos os locais</option>
                {locais.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>

            <div className="dash-grid-3">
              {eventosFiltrados.map((e) => (
                <article className="dash-card" key={e.id}>
                  <h3>{e.nome}</h3>
                  <p>
                    {e.data} - {e.hora}
                  </p>
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
            <div className="dash-section-header">
              <div className="dash-filtros">
                <input placeholder="Pesquisar item" value={buscaCatalogo} onChange={(e) => setBuscaCatalogo(e.target.value)} />
                <select value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value)}>
                  <option value="todas">Todas as categorias</option>
                  {categorias.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <button className="dash-add-button" onClick={abrirAdicaoCatalogo}>
                Adicionar item
              </button>
            </div>

            <div className="dash-filtros-mobile">
              <input placeholder="Pesquisar item" value={buscaCatalogo} onChange={(e) => setBuscaCatalogo(e.target.value)} />
              <select value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value)}>
                <option value="todas">Todas as categorias</option>
                {categorias.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
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

        {menuAtivo === 'membros' && <MembrosScreen />}
        {menuAtivo === 'cobrancas' && <CobrancasScreen />}
      </div>

      {mostrarModalEvento && (
        <div className="dash-modal-overlay">
          <div className="dash-modal" ref={modalRef}>
            <h2>{eventoForm.id ? 'Editar evento' : 'Adicionar evento'}</h2>
            <form className="dash-form dash-form--evento-modal" onSubmit={salvarEvento}>
              <label className="dash-field">
                <span>Título</span>
                <input
                  placeholder="Título"
                  value={eventoForm.nome}
                  onChange={(e) => setEventoForm({ ...eventoForm, nome: e.target.value })}
                  required
                />
              </label>
              <label className="dash-field">
                <span>Data</span>
                <input type="date" value={eventoForm.data} onChange={(e) => setEventoForm({ ...eventoForm, data: e.target.value })} required />
              </label>
              <label className="dash-field">
                <span>Horário</span>
                <input type="time" value={eventoForm.hora} onChange={(e) => setEventoForm({ ...eventoForm, hora: e.target.value })} required />
              </label>
              <div className="dash-field dash-event-type-wrap">
                <span>Tipo do Evento</span>
                <select value={eventoForm.tipo} onChange={(e) => selecionarTipoEvento(e.target.value)}>
                  <option value="umbanda">Umbanda</option>
                  <option value="quimbanda">Quimbanda</option>
                  <option value="nacao">Nação</option>
                  <option value="outro">Outro</option>
                </select>
              </div>
              <label className="dash-field">
                <span>Endereço</span>
                <input
                  placeholder="Endereço"
                  value={eventoForm.local}
                  onChange={(e) => setEventoForm({ ...eventoForm, local: e.target.value })}
                  aria-label="Endereço do evento"
                />
              </label>
              <label className="dash-field">
                <span>Descrição</span>
                <input
                  placeholder="Descrição"
                  value={eventoForm.descricao}
                  onChange={(e) => setEventoForm({ ...eventoForm, descricao: e.target.value })}
                />
              </label>
              <div className="dash-field dash-field--full">
                {eventoForm.tipo === 'outro' && (
                  <label className="dash-field dash-field--full">
                    <span>Ícone personalizado</span>
                    <input type="file" accept="image/*" onChange={(e) => onUploadIconeEvento(e.target.files?.[0])} />
                  </label>
                )}
              </div>
              <div className="dash-form-actions dash-form-actions--modal-end">
                <button type="button" className="dash-btn-secondary" onClick={() => setMostrarModalEvento(false)}>
                  Fechar
                </button>
                <button type="submit" className="dash-btn-primary">
                  Salvar evento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {mostrarCropEvento && (
        <div className="dash-modal-overlay">
          <div className="dash-modal dash-modal--narrow" ref={modalRef}>
            <h2>Recortar ícone do evento</h2>
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
            <h2>{catalogoForm.id ? 'Editar item do catalogo' : 'Adicionar item ao catalogo'}</h2>
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
    </section>
  );
};

export default Dashboard;
