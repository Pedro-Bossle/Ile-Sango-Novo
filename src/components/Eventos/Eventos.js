import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import EventCard from './EventCard';
import './Eventos.css';

const PAGE_SIZE = 3;
// ⏱ TEMPO: Intervalo do autoplay em milissegundos — atualmente 35s
const AUTOPLAY_INTERVAL = 35000;
const MOBILE_BREAKPOINT = 800;

export default function Eventos({ modo = 'home' }) {
  const [eventos, setEventos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filtroLocal, setFiltroLocal] = useState('todos');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [homeGroupIndex, setHomeGroupIndex] = useState(0);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= MOBILE_BREAKPOINT);
  const swipeStartX = useRef(null);
  const swipeDragging = useRef(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError('');
      const { data, error: e } = await supabase
        .from('eventos')
        .select('id, nome, data, hora, local, descricao, tipo, icone_customizado')
        .order('data', { ascending: true });
      if (e) setError(e.message);
      else setEventos(data ?? []);
      setLoading(false);
    }
    load();
  }, []);

  const locais = [...new Set(eventos.map((e) => e.local).filter(Boolean))];
  const eventosFiltrados = eventos.filter((e) => {
    const texto = `${e.nome} ${e.descricao ?? ''} ${e.local ?? ''}`.toLowerCase();
    const bateBusca = texto.includes(search.toLowerCase().trim());
    const bateLocal = filtroLocal === 'todos' || e.local === filtroLocal;
    return bateBusca && bateLocal;
  });

  const isHome = modo === 'home';
  const useCarousel = isHome && isMobile;
  // 🎠 CARROSSEL: Quantidade de cards visíveis por vez na home
  const CARDS_PER_VIEW = {
    mobile: 1,
    desktop: 2,
  };
  const cardsPerView = isMobile ? CARDS_PER_VIEW.mobile : CARDS_PER_VIEW.desktop;
  const totalHome = eventosFiltrados.length;
  // 🎠 CARROSSEL: Só exibe navegação quando houver mais de 1 página/grupo
  const totalPages = Math.ceil(totalHome / cardsPerView);
  const start = homeGroupIndex * cardsPerView;
  const eventosHomeVisiveis = eventosFiltrados.slice(start, start + cardsPerView);
  const gruposHome = Array.from({ length: totalPages }).map((_, i) =>
    eventosFiltrados.slice(i * cardsPerView, i * cardsPerView + cardsPerView),
  );
  const eventosVisiveis = eventosFiltrados.slice(0, visibleCount);
  const eventosHomeDesktop = eventosFiltrados.slice(0, 3);
  const hasMore = visibleCount < eventosFiltrados.length;

  const irParaGrupo = (index) => {
    if (!totalPages) return;
    const next = ((index % totalPages) + totalPages) % totalPages;
    setHomeGroupIndex(next);
  };

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= MOBILE_BREAKPOINT);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    setHomeGroupIndex(0);
  }, [eventos.length, search, filtroLocal, cardsPerView]);

  useEffect(() => {
    if (!useCarousel || totalPages <= 1) return undefined;
    const id = window.setInterval(() => {
      setHomeGroupIndex((prev) => ((prev + 1) % totalPages + totalPages) % totalPages);
    }, AUTOPLAY_INTERVAL);
    return () => window.clearInterval(id);
  }, [useCarousel, totalPages]);

  const onSwipeStart = (clientX) => {
    swipeStartX.current = clientX;
    swipeDragging.current = true;
  };

  const onSwipeEnd = (clientX) => {
    if (!swipeDragging.current || swipeStartX.current == null) return;
    const delta = clientX - swipeStartX.current;
    swipeDragging.current = false;
    swipeStartX.current = null;
    if (Math.abs(delta) < 45) return;
    if (delta < 0) irParaGrupo(homeGroupIndex + 1);
    else irParaGrupo(homeGroupIndex - 1);
  };

  if (loading) return <p>Carregando eventos...</p>;
  if (error) return <p>Erro ao carregar: {error}</p>;

  return (
    <section className="evento-section" id="eventos">
      <h2>Próximos Eventos de Nossa Casa</h2>

      {!isHome && (
        <div className="evento-filtros">
          <input
            className="evento-filtro-input"
            type="text"
            placeholder="Pesquisar por nome, local ou descrição"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setVisibleCount(PAGE_SIZE);
            }}
          />
          <select
            className="evento-filtro-select"
            value={filtroLocal}
            onChange={(e) => {
              setFiltroLocal(e.target.value);
              setVisibleCount(PAGE_SIZE);
            }}
          >
            <option value="todos">Todos os locais</option>
            {locais.map((local) => (
              <option key={local} value={local}>
                {local}
              </option>
            ))}
          </select>
        </div>
      )}

      {useCarousel ? (
        <div className="evento-carousel">
          {eventosHomeVisiveis.length ? (
            <>
              {totalPages > 1 && (
                <button className="evento-carousel-btn evento-carousel-btn--prev" onClick={() => irParaGrupo(homeGroupIndex - 1)} aria-label="Evento anterior">
                  ‹
                </button>
              )}
              <div
                className="evento-carousel-viewport"
                onTouchStart={(e) => onSwipeStart(e.touches[0].clientX)}
                onTouchEnd={(e) => onSwipeEnd(e.changedTouches[0].clientX)}
              >
                <div className="evento-carousel-track" style={{ transform: `translateX(-${homeGroupIndex * 100}%)` }}>
                  {gruposHome.map((grupo, idx) => (
                    <article className={`evento-carousel-slide ${grupo.length === 1 ? 'is-single' : ''}`} key={`slide-${idx}`}>
                      <div className={`evento-carousel-row ${grupo.length === 1 ? 'is-single' : ''}`}>
                        {grupo.map((evento) => (
                          <EventCard key={evento.id} evento={evento} />
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              </div>
              {totalPages > 1 && (
                <button className="evento-carousel-btn evento-carousel-btn--next" onClick={() => irParaGrupo(homeGroupIndex + 1)} aria-label="Próximo evento">
                  ›
                </button>
              )}
            </>
          ) : (
            <p>Nenhum evento encontrado.</p>
          )}

          {totalPages > 1 && (
            <div className="evento-carousel-dots" role="tablist" aria-label="Selecionar evento">
              {Array.from({ length: totalPages }).map((_, i) => (
                <button
                  key={`grupo-${i}`}
                  className={`evento-carousel-dot ${i === homeGroupIndex ? 'is-active' : ''}`}
                  onClick={() => irParaGrupo(i)}
                  aria-label={`Ir para grupo ${i + 1}`}
                  aria-current={i === homeGroupIndex ? 'true' : undefined}
                />
              ))}
            </div>
          )}
        </div>
      ) : isHome ? (
        <div className="evento-container evento-container--home-desktop">
          {eventosHomeDesktop.length ? (
            eventosHomeDesktop.map((e) => <EventCard key={e.id} evento={e} />)
          ) : (
            <p>Nenhum evento encontrado.</p>
          )}
        </div>
      ) : (
        <div className="evento-container">
          {eventosVisiveis.map((e) => (
            <EventCard key={e.id} evento={e} />
          ))}
        </div>
      )}

      {!isHome && hasMore && (
        <button className="evento-showmore" onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}>
          Mostrar mais eventos
        </button>
      )}

      {isHome && (
        <Link className="evento-showmore evento-link-button" to="/eventos">
          Ver todos os eventos
        </Link>
      )}
    </section>
  );
}
