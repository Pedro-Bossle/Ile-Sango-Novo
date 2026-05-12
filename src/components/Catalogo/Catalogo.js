import './Catalogo.css';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';

function formatValorBRL(value) {
    if (value == null || value === '') return '';
    const n = Number(value);
    if (Number.isNaN(n)) return String(value);
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatVariacoes(value) {
    if (value == null || value === '') return '';
    if (Array.isArray(value)) return value.join(', ');
    if (typeof value === 'object') return Object.values(value).join(', ');
    return String(value);
}

function getVariacoesList(value) {
    const raw = formatVariacoes(value);
    if (!raw) return [];
    return raw
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
}

const PAGE_SIZE_HOME = 3;
const PAGE_SIZE_CATALOGO = 12;

const Catalogo = ({ modo = 'home' }) => {
    const pageChunk = modo === 'catalogo' ? PAGE_SIZE_CATALOGO : PAGE_SIZE_HOME;
    const [itens, setItens] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    const [filtroCategoria, setFiltroCategoria] = useState('todas');
    const [visibleCount, setVisibleCount] = useState(pageChunk);

    useEffect(() => {
        async function loadCatalogo() {
            setLoading(true);
            setError('');

            const { data, error: supaError } = await supabase
                .from('catalogo')
                .select('id, nome, categoria, valor, descricao, variacoes')
                .order('id', { ascending: true });

            if (supaError) setError(supaError.message);
            else setItens(data ?? []);

            setLoading(false);
        }

        loadCatalogo();
    }, []);

    const mostrarFiltros = modo === 'catalogo';
    const mostrarVerTodos = modo === 'home';
    const isHome = modo === 'home';
    const sectionClass = `catalogo-section${mostrarFiltros ? ' catalogo-section--page' : ''}${isHome ? ' catalogo-section--home' : ''}`;

    if (loading) {
        return (
            <section className={sectionClass}>
                <div className="catalogo-state catalogo-state--loading" aria-busy="true" aria-live="polite">
                    <span className="catalogo-state__spinner" aria-hidden="true" />
                    <p className="catalogo-state__text">Carregando catálogo…</p>
                </div>
            </section>
        );
    }

    if (error) {
        return (
            <section className={sectionClass}>
                <div className="catalogo-state catalogo-state--error" role="alert">
                    <p className="catalogo-state__text">Não foi possível carregar o catálogo.</p>
                    <p className="catalogo-state__detail">{error}</p>
                </div>
            </section>
        );
    }

    const categorias = [...new Set(itens.map((item) => item.categoria).filter(Boolean))];
    const itensFiltrados = itens.filter((item) => {
        const texto = `${item.nome} ${item.descricao ?? ''} ${item.categoria ?? ''}`.toLowerCase();
        const bateBusca = texto.includes(search.toLowerCase().trim());
        const bateCategoria = filtroCategoria === 'todas' || item.categoria === filtroCategoria;
        return bateBusca && bateCategoria;
    });

    const itensVisiveis = isHome
        ? itensFiltrados.slice(0, PAGE_SIZE_HOME)
        : itensFiltrados.slice(0, visibleCount);
    const hasMore = !isHome && visibleCount < itensFiltrados.length;

    return (
        <section className={sectionClass}>
            {mostrarFiltros ? (
                <header className="catalogo-hero">
                    <h1 className="catalogo-hero__title">Catálogo</h1>
                    <p className="catalogo-hero__lead">
                        Itens da casa para apoio ao terreiro e à comunidade. Consulte variações e peça pelo WhatsApp com um clique.
                    </p>
                </header>
            ) : (
                <h2 className="catalogo-title">Catálogo</h2>
            )}

            {mostrarFiltros && (
                <div className="catalogo-filtros-card">
                    <div className="catalogo-filtros">
                        <label className="catalogo-filtro-label">
                            <span className="catalogo-filtro-label__text">Buscar</span>
                            <input
                                className="catalogo-filtro-input"
                                type="search"
                                placeholder="Nome, categoria ou descrição"
                                value={search}
                                onChange={(e) => {
                                    setSearch(e.target.value);
                                    setVisibleCount(pageChunk);
                                }}
                                autoComplete="off"
                            />
                        </label>
                        <label className="catalogo-filtro-label">
                            <span className="catalogo-filtro-label__text">Categoria</span>
                            <select
                                className="catalogo-filtro-select"
                                value={filtroCategoria}
                                onChange={(e) => {
                                    setFiltroCategoria(e.target.value);
                                    setVisibleCount(pageChunk);
                                }}
                            >
                                <option value="todas">Todas as categorias</option>
                                {categorias.map((categoria) => (
                                    <option key={categoria} value={categoria}>
                                        {categoria}
                                    </option>
                                ))}
                            </select>
                        </label>
                    </div>
                    {itens.length > 0 && (
                        <p className="catalogo-resultados" role="status">
                            {itensFiltrados.length === itens.length
                                ? `${itens.length} ${itens.length === 1 ? 'item' : 'itens'} no catálogo`
                                : `${itensFiltrados.length} de ${itens.length} itens com os filtros atuais`}
                        </p>
                    )}
                </div>
            )}

            {itens.length === 0 ? (
                <p className="catalogo-empty">Nenhum item no catálogo no momento.</p>
            ) : itensFiltrados.length === 0 ? (
                <p className="catalogo-empty">
                    Nenhum produto corresponde à sua busca. Tente outros termos ou escolha outra categoria.
                </p>
            ) : (
                <>
                    <div className={`catalogo-grid${mostrarFiltros ? ' catalogo-grid--page' : ''}`}>
                        {itensVisiveis.map((item) => (
                            <article key={item.id} className="catalogo-card">
                                <div className="catalogo-card-top">
                                    <span className="catalogo-categoria-badge">{item.categoria || 'Sem categoria'}</span>
                                </div>

                                <div className="catalogo-nome-valor">
                                    <h3 className="catalogo-nome">{item.nome}</h3>
                                    <p className="catalogo-valor">{formatValorBRL(item.valor)}</p>
                                </div>

                                {item.descricao && <p className="catalogo-descricao">{item.descricao}</p>}

                                <div className="catalogo-card-bottom">
                                    <div className="catalogo-variacoes-wrap">
                                        {getVariacoesList(item.variacoes).map((variacao, idx) => (
                                            <span key={`${item.id}-${idx}`} className="catalogo-variacao-badge">
                                                {variacao}
                                            </span>
                                        ))}
                                    </div>

                                    <a
                                        className="catalogo-whatsapp-button"
                                        href={`https://wa.me/555491556023?text=${encodeURIComponent(`Olá! Tenho interesse no produto "${item.nome}".`)}`}
                                        target="_blank"
                                        rel="noreferrer"
                                    >
                                        Pedir no WhatsApp
                                    </a>
                                </div>
                            </article>
                        ))}
                    </div>
                    {hasMore && (
                        <button
                            type="button"
                            className="catalogo-showmore"
                            onClick={() => setVisibleCount((prev) => prev + pageChunk)}
                        >
                            Mostrar mais produtos
                        </button>
                    )}
                    {mostrarVerTodos && (
                        <Link className="catalogo-showmore catalogo-link-button" to="/catalogo">
                            Ver catálogo completo
                        </Link>
                    )}
                </>
            )}
        </section>
    );
};

export default Catalogo;
