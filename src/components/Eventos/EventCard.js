import './EventCard.css';

// 🔵 ÍCONE: Mapeamento de tipos para ícones — adicione novos tipos aqui
export const EVENT_TYPE_ICONS = {
  umbanda: '/icons/Umbanda.png',
  quimbanda: '/icons/Quimbanda.png',
  nacao: '/icons/Nação.png',
  // 🔵 ÍCONE: "outro" usa imagem enviada pelo usuário (base64 após crop)
  outro: null,
};

const EVENT_TYPE_ICONS_FALLBACK = {
  umbanda: '/icons/umbanda.svg',
  quimbanda: '/icons/quimbanda.svg',
  nacao: '/icons/nacao.svg',
  outro: null,
};

function iconCandidatesByTipo(tipo) {
  if (tipo === 'outro') return [];
  if (tipo === 'umbanda') {
    return ['/icons/Umbanda.png', '/icons/umbanda.png', '/icons/umbanda.svg', '/icons/Umbanda.svg'];
  }
  if (tipo === 'quimbanda') {
    return ['/icons/Quimbanda.png', '/icons/quimbanda.png', '/icons/quimbanda.svg', '/icons/Quimbanda.svg'];
  }
  if (tipo === 'nacao') {
    return ['/icons/Nação.png', '/icons/nacao.png', '/icons/nacao.svg', '/icons/Nação.svg'];
  }
  return ['/icons/umbanda.svg'];
}

// 🔵 ÍCONE: Tamanho do ícone no card — mobile: 48px, desktop: 56px
export const ICON_SIZE = { mobile: 48, desktop: 56 };

export function resolverIconeEvento(evento) {
  if (evento?.tipo === 'outro' && evento?.icone_customizado) return evento.icone_customizado;
  return EVENT_TYPE_ICONS[evento?.tipo] || EVENT_TYPE_ICONS.umbanda;
}

function formatDataLonga(value) {
  if (!value) return '';
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

function formatHora(value) {
  if (!value) return '—';
  const m = String(value).match(/^(\d{1,2}):(\d{2})/);
  if (m) return `${m[1].padStart(2, '0')}:${m[2]}`;
  return String(value);
}

function textoLocal(value) {
  if (!value) return 'Endereço a definir';
  return String(value).trim();
}

export default function EventCard({ evento }) {
  const iconeSrc = resolverIconeEvento(evento);
  const fallbackIcon = EVENT_TYPE_ICONS_FALLBACK[evento?.tipo] || EVENT_TYPE_ICONS_FALLBACK.umbanda;
  const iconCandidates = iconCandidatesByTipo(evento?.tipo);
  const dataIso = evento.data ? String(evento.data).slice(0, 10) : undefined;

  return (
    <article className="event-card-compact">
      <header className="event-card-compact__header">
        <div className="event-card-compact__icon-wrap">
          <img
            src={iconeSrc}
            alt=""
            className="event-card-compact__icon"
            onError={(e) => {
              if (evento?.tipo === 'outro') return;
              const idx = Number(e.currentTarget.dataset.iconIdx ?? 0);
              const nextIdx = idx + 1;
              if (nextIdx < iconCandidates.length) {
                e.currentTarget.dataset.iconIdx = String(nextIdx);
                e.currentTarget.src = iconCandidates[nextIdx];
                return;
              }
              e.currentTarget.src = fallbackIcon;
            }}
            data-icon-idx="0"
          />
        </div>
        <div className="event-card-compact__head-main">
          <h3 className="event-card-compact__title">{evento.nome}</h3>
          <time className="event-card-compact__date" {...(dataIso ? { dateTime: dataIso } : {})}>
            {formatDataLonga(evento.data)}
          </time>
        </div>
      </header>

      <p className="event-card-compact__description">{evento.descricao || 'Evento da nossa casa.'}</p>

      <footer className="event-card-compact__footer">
        <ul className="event-card-compact__meta-list">
          <li className="event-card-compact__meta-item">
            <span className="event-card-compact__meta-key">Horário</span>
            <span className="event-card-compact__meta-val">{formatHora(evento.hora)}</span>
          </li>
          <li className="event-card-compact__meta-item">
            <span className="event-card-compact__meta-key">Endereço</span>
            <span className="event-card-compact__meta-val event-card-compact__meta-val--address">
              {textoLocal(evento.local)}
            </span>
          </li>
        </ul>
      </footer>
    </article>
  );
}
