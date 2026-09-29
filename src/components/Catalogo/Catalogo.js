import './Catalogo.css';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { parseCatalogoVariacoes } from '../../utils/catalogoVariacoes.ts';
import { matchesSearchFields } from '../../utils/searchFold';

function formatValorBRL(value) {
    if (value == null || value === '') return '';
    const n = Number(value);
    if (Number.isNaN(n)) return String(value);
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
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
                .is('deleted_at', null)
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
        const subcats = parseCatalogoVariacoes(item.variacoes, item.valor)
            .map((v) => v.nome)
            .join(' ');
        const bateBusca = matchesSearchFields(search, item.nome, item.descricao, item.categoria, subcats);
        const bateCategoria = filtroCategoria === 'todas' || item.categoria === filtroCategoria;
        return bateBusca && bateCategoria;
    });

    /** Uma subcategoria = um card (título/desc da categoria + opção e preço). */
    const cards = itensFiltrados.flatMap((item) => {
        const subcats = parseCatalogoVariacoes(item.variacoes, item.valor);
        if (subcats.length) {
            return subcats.map((s) => ({
                key: `${item.id}:${s.nome}`,
                grupo: item.categoria,
                titulo: item.nome,
                descricao: item.descricao || '',
                opcao: s.nome,
                valor: s.valor,
            }));
        }
        return [
            {
                key: String(item.id),
                grupo: item.categoria,
                titulo: item.nome,
                descricao: item.descricao || '',
                opcao: null,
                valor: Number(item.valor) || 0,
            },
        ];
    });

    const cardsVisiveis = isHome ? cards.slice(0, PAGE_SIZE_HOME) : cards.slice(0, visibleCount);
    const hasMore = !isHome && visibleCount < cards.length;

    return (
        <section className={sectionClass}>
            {mostrarFiltros ? (
                <header className="catalogo-hero">
                    <h1 className="catalogo-hero__title">Catálogo</h1>
                    <p className="catalogo-hero__lead">
                        Cada opção do catálogo com seu valor. Consulte e peça pelo WhatsApp.
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
                                placeholder="Nome, opção ou descrição"
                                value={search}
                                onChange={(e) => {
                                    setSearch(e.target.value);
                                    setVisibleCount(pageChunk);
                                }}
                                autoComplete="off"
                            />
                        </label>
                        <label className="catalogo-filtro-label">
                            <span className="catalogo-filtro-label__text">Grupo</span>
                            <select
                                className="catalogo-filtro-select"
                                value={filtroCategoria}
                                onChange={(e) => {
                                    setFiltroCategoria(e.target.value);
                                    setVisibleCount(pageChunk);
                                }}
                            >
                                <option value="todas">Todos os grupos</option>
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
                            {cards.length === 0
                                ? 'Nenhuma opção com os filtros atuais'
                                : `${cards.length} ${cards.length === 1 ? 'opção' : 'opções'} no catálogo`}
                        </p>
                    )}
                </div>
            )}

            {itens.length === 0 ? (
                <p className="catalogo-empty">Nenhum item no catálogo no momento.</p>
            ) : cards.length === 0 ? (
                <p className="catalogo-empty">
                    Nenhum produto corresponde à sua busca. Tente outros termos ou escolha outro grupo.
                </p>
            ) : (
                <>
                    <div className={`catalogo-grid${mostrarFiltros ? ' catalogo-grid--page' : ''}`}>
                        {cardsVisiveis.map((card) => {
                            const tituloWa = card.opcao ? `${card.titulo} — ${card.opcao}` : card.titulo;
                            const waText = `Olá! Tenho interesse em "${tituloWa}"${
                                card.valor > 0 ? ` (${formatValorBRL(card.valor)})` : ''
                            }.`;

                            return (
                                <article key={card.key} className="catalogo-card">
                                    <header className="catalogo-card__head">
                                        {card.grupo ? (
                                            <span className="catalogo-categoria-badge">{card.grupo}</span>
                                        ) : null}
                                        <h3 className="catalogo-nome">{card.titulo}</h3>
                                        {card.descricao ? (
                                            <p className="catalogo-descricao">{card.descricao}</p>
                                        ) : null}
                                    </header>

                                    <div className="catalogo-card__opcao">
                                        {card.opcao ? (
                                            <strong className="catalogo-card__opcao-nome">{card.opcao}</strong>
                                        ) : (
                                            <strong className="catalogo-card__opcao-nome">Valor</strong>
                                        )}
                                        <span className="catalogo-valor">{formatValorBRL(card.valor)}</span>
                                    </div>

                                    <div className="catalogo-card-bottom">
                                        <a
                                            className="catalogo-whatsapp-button"
                                            href={`https://wa.me/555491556023?text=${encodeURIComponent(waText)}`}
                                            target="_blank"
                                            rel="noreferrer"
                                        >
                                            Pedir no WhatsApp
                                        </a>
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                    {hasMore && (
                        <button
                            type="button"
                            className="catalogo-showmore"
                            onClick={() => setVisibleCount((prev) => prev + pageChunk)}
                        >
                            Mostrar mais
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
