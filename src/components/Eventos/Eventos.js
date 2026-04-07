import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import './Eventos.css';

const MESES = [
    'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

const PAGE_SIZE = 4;

function formatDataBR(value) {
    if (value == null || value === '') return '';
    if (typeof value === 'string') {
        const ymd = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (ymd) {
            const [, ano, mes, dia] = ymd;
            const mi = parseInt(mes, 10) - 1;
            if (mi >= 0 && mi < 12) return `${parseInt(dia, 10)} de ${MESES[mi]} de ${ano}`;
        }
    }
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}

function formatHora(value) {
    if (value == null || value === '') return '';
    if (typeof value === 'string') {
        const m = value.match(/^(\d{1,2}):(\d{2})/);
        if (m) return `${m[1].padStart(2, '0')}:${m[2]}`;
    }
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) {
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }
    return String(value);
}

export default function Eventos() {
    const [eventos, setEventos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

    useEffect(() => {
        async function load() {
            setLoading(true);
            setError('');

            const { data, error } = await supabase
                .from('eventos')
                .select('id, nome, data, hora, local, descricao')
                .order('data', { ascending: true });

            if (error) setError(error.message);
            else setEventos(data ?? []);

            setLoading(false);
        }

        load();
    }, []);

    const eventosVisiveis = eventos.slice(0, visibleCount);
    const hasMore = visibleCount < eventos.length;

    const handleShowMore = () => {
        setVisibleCount((prev) => prev + PAGE_SIZE);
    };

    if (loading) return <p>Carregando eventos...</p>;
    if (error) return <p>Erro ao carregar: {error}</p>;

    return (
        <section className='evento-section' id='eventos'>
            <h2>Próximos Eventos de Nossa Casa</h2>

            <div className='evento-container'>
                {eventosVisiveis.map((e) => (
                    <article key={e.id}>
                        <div className='evento-card'>
                            <div className='evento-card-name-container'>
                                <h3 className='evento-card-name'>{e.nome}</h3>
                                <p className='evento-card-data'>{formatDataBR(e.data)}</p>
                            </div>

                            <p className='evento-card-descricao'>{e.descricao}</p>
                            <p className='evento-card-local'>
                                <img className='evento-card-ico' src='./images/icons/ico location.png' alt='' />
                                {e.local}
                            </p>
                            <p className='evento-card-hora'>
                                <img className='evento-card-ico' src='./images/icons/ico relogio.svg' alt='' />
                                {formatHora(e.hora)}
                            </p>
                        </div>
                    </article>
                ))}
            </div>

            {hasMore && (
                <button className='evento-showmore' onClick={handleShowMore}>
                    Mostrar mais eventos
                </button>
            )}
        </section>
    );
}