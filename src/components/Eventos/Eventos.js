import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import EventCard from './EventCard';
import './Eventos.css';

const PAGE_SIZE_HOME = 3;
const PAGE_SIZE_CALENDARIO = 9;
// ⏱ TEMPO: Intervalo do autoplay em milissegundos — atualmente 35s
const AUTOPLAY_INTERVAL = 35000;
const MOBILE_BREAKPOINT = 800;

export default function Eventos({ modo = 'home' }) {
  const isHome = modo === 'home';
  const isCalendario = modo === 'calendario';
  const pageChunk = isHome ? PAGE_SIZE_HOME : PAGE_SIZE_CALENDARIO;
  const sectionClass = `evento-section${isCalendario ? ' evento-section--page' : ''}${isHome ? ' evento-section--home' : ''}`;

  const [eventos, setEventos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filtroLocal, setFiltroLocal] = useState('todos');
  const [visibleCount, setVisibleCount] = useState(pageChunk);
  const [homeGroupIndex, setHomeGroupIndex] = useState(0);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth <= MOBILE_BREAKPOINT : false,
  );
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

  const useCarousel = isHome && isMobile;
  // 🎠 CARROSSEL: Quantidade de cards visíveis por vez na home
  const CARDS_PER_VIEW = {
    mobile: 1,
    desktop: 2,
  };
  const cardsPerView = isMobile ? CARDS_PER_VIEW.mobile : CARDS_PER_VIEW.desktop;
  const totalHome = eventosFiltrados.length;
  const totalPages = Math.ceil(totalHome / cardsPerView);
  const start = homeGroupIndex * cardsPerView;
  const eventosHomeVisiveis = eventosFiltrados.slice(start, start + cardsPerView);
  const gruposHome = Array.from({ length: totalPages }).map((_, i) =>
    eventosFiltrados.slice(i * cardsPerView, i * cardsPerView + cardsPerView),
  );
  const eventosVisiveis = eventosFiltrados.slice(0, visibleCount);
  const eventosHomeDesktop = eventosFiltrados.slice(0, 3);
  const hasMore = isCalendario && visibleCount < eventosFiltrados.length;

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

  if (loading) {
    return (
      <section className={sectionClass} id="eventos">
        <div className="evento-state evento-state--loading" aria-busy="true" aria-live="polite">
          <span className="evento-state__spinner" aria-hidden="true" />
          <p className="evento-state__text">Carregando eventos…</p>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className={sectionClass} id="eventos">
        <div className="evento-state evento-state--error" role="alert">
          <p className="evento-state__text">Não foi possível carregar os eventos.</p>
          <p className="evento-state__detail">{error}</p>
        </div>
      </section>
    );
  }

  return (
    <section className={sectionClass} id="eventos">
      {isCalendario ? (
        <header className="evento-hero">
          <h1 className="evento-hero__title">Eventos</h1>
          <p className="evento-hero__lead">
            Giras, festas e encontros do Ilê. Confira datas, horários e local — use a busca ou filtre por espaço da
            casa.
          </p>
        </header>
      ) : (
        <h2 className="evento-section__title">Próximos eventos da casa</h2>
      )}

      {isCalendario && (
        <div className="evento-filtros-card">
          <div className="evento-filtros">
            <label className="evento-filtro-label">
              <span className="evento-filtro-label__text">Buscar</span>
              <input
                className="evento-filtro-input"
                type="search"
                placeholder="Nome, local ou descrição"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setVisibleCount(pageChunk);
                }}
                autoComplete="off"
              />
            </label>
            <label className="evento-filtro-label">
              <span className="evento-filtro-label__text">Local</span>
              <select
                className="evento-filtro-select"
                value={filtroLocal}
                onChange={(e) => {
                  setFiltroLocal(e.target.value);
                  setVisibleCount(pageChunk);
                }}
              >
                <option value="todos">Todos os locais</option>
                {locais.map((local) => (
                  <option key={local} value={local}>
                    {local}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {eventos.length > 0 && (
            <p className="evento-resultados" role="status">
              {eventosFiltrados.length === eventos.length
                ? `${eventos.length} ${eventos.length === 1 ? 'evento' : 'eventos'} na agenda`
                : `${eventosFiltrados.length} de ${eventos.length} eventos com os filtros atuais`}
            </p>
          )}
        </div>
      )}

      {eventos.length === 0 ? (
        <p className="evento-empty">Nenhum evento cadastrado no momento.</p>
      ) : eventosFiltrados.length === 0 ? (
        <p className="evento-empty">Nenhum evento corresponde à sua busca. Tente outros termos ou outro local.</p>
      ) : useCarousel ? (
        <div className="evento-carousel">
          {eventosHomeVisiveis.length ? (
            <>
              {totalPages > 1 && (
                <button
                  type="button"
                  className="evento-carousel-btn evento-carousel-btn--prev"
                  onClick={() => irParaGrupo(homeGroupIndex - 1)}
                  aria-label="Evento anterior"
                >
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
                    <article
                      className={`evento-carousel-slide ${grupo.length === 1 ? 'is-single' : ''}`}
                      key={`slide-${idx}`}
                    >
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
                <button
                  type="button"
                  className="evento-carousel-btn evento-carousel-btn--next"
                  onClick={() => irParaGrupo(homeGroupIndex + 1)}
                  aria-label="Próximo evento"
                >
                  ›
                </button>
              )}
            </>
          ) : (
            <p className="evento-empty">Nenhum evento encontrado.</p>
          )}

          {totalPages > 1 && (
            <div className="evento-carousel-dots" role="tablist" aria-label="Selecionar página de eventos">
              {Array.from({ length: totalPages }).map((_, i) => (
                <button
                  type="button"
                  key={`grupo-${i}`}
                  className={`evento-carousel-dot ${i === homeGroupIndex ? 'is-active' : ''}`}
                  onClick={() => irParaGrupo(i)}
                  aria-label={`Ir para página ${i + 1}`}
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
            <p className="evento-empty">Nenhum evento encontrado.</p>
          )}
        </div>
      ) : (
        <div className="evento-container evento-container--page-grid">
          {eventosVisiveis.map((e) => (
            <EventCard key={e.id} evento={e} />
          ))}
        </div>
      )}

      {hasMore && (
        <button type="button" className="evento-showmore" onClick={() => setVisibleCount((prev) => prev + pageChunk)}>
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
