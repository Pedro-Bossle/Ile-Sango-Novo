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

const PAGE_SIZE = 3;

const Catalogo = ({ modo = 'home' }) => {
    const [itens, setItens] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    const [filtroCategoria, setFiltroCategoria] = useState('todas');
    const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

    useEffect(() => {
        async function loadCatalogo() {
            setLoading(true);
            setError('');

            const { data, error } = await supabase
                .from('catalogo')
                .select('id, nome, categoria, valor, descricao, variacoes')
                .order('id', { ascending: true });

            if (error) setError(error.message);
            else setItens(data ?? []);

            setLoading(false);
        }

        loadCatalogo();
    }, []);

    if (loading) return <p>Carregando catálogo...</p>;
    if (error) return <p>Erro ao carregar catálogo: {error}</p>;

    const categorias = [...new Set(itens.map((item) => item.categoria).filter(Boolean))];
    const itensFiltrados = itens.filter((item) => {
        const texto = `${item.nome} ${item.descricao ?? ''} ${item.categoria ?? ''}`.toLowerCase();
        const bateBusca = texto.includes(search.toLowerCase().trim());
        const bateCategoria = filtroCategoria === 'todas' || item.categoria === filtroCategoria;
        return bateBusca && bateCategoria;
    });

    const itensVisiveis = itensFiltrados.slice(0, visibleCount);
    const hasMore = visibleCount < itensFiltrados.length;
    const mostrarFiltros = modo === 'catalogo';
    const mostrarVerTodos = modo === 'home';

    return (
        <section className="catalogo-section">
            <h2 className="catalogo-title">Catálogo</h2>

            {mostrarFiltros && (
                <div className="catalogo-filtros">
                    <input
                        className="catalogo-filtro-input"
                        type="text"
                        placeholder="Pesquisar por nome, categoria ou descrição"
                        value={search}
                        onChange={(e) => {
                            setSearch(e.target.value);
                            setVisibleCount(PAGE_SIZE);
                        }}
                    />
                    <select
                        className="catalogo-filtro-select"
                        value={filtroCategoria}
                        onChange={(e) => {
                            setFiltroCategoria(e.target.value);
                            setVisibleCount(PAGE_SIZE);
                        }}
                    >
                        <option value="todas">Todas as categorias</option>
                        {categorias.map((categoria) => (
                            <option key={categoria} value={categoria}>{categoria}</option>
                        ))}
                    </select>
                </div>
            )}

            {itens.length === 0 ? (
                <p>Nenhum item encontrado.</p>
            ) : (
                <>
                <div className="catalogo-grid">
                    {itensVisiveis.map((item) => (
                        <article key={item.id} className="catalogo-card">
                            <div className="catalogo-card-top">
                                <span className="catalogo-categoria-badge">{item.categoria || 'Sem categoria'}</span>
                                <span className="catalogo-categoria-icon-slot" aria-hidden="true" />
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
                    <button className="catalogo-showmore" onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}>
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