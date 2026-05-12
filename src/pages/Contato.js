import './Contato.css';
import { PageMeta } from '../components/Seo/PageMeta';

/** Incorporar mapa — pin da casa (Google Maps). */
const MAP_EMBED_SRC =
  'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3484.2729597930265!2d-51.18454130000001!3d-29.156627599999997!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x951ea3e50d7e0383%3A0x90871c860797fbd1!2sCasa%20de%20Ax%C3%A9%20-%20Na%C3%A7ao%20Kabinda%20-%20Kimbanda%20Malei%20-%20Pai%20Tiago%20d%27%20S%C3%A0ngo%20e%20Ros%C3%A2ngela%20d%27%20Ossun!5e0!3m2!1spt-BR!2sbr!4v1776476230462!5m2!1spt-BR!2sbr';

const Contato = () => {
  return (
    <section className="contato-page">
      <PageMeta
        title="Contato"
        path="/contato"
        description="Telefone, e-mail, endereço e horários do Ilê Sàngó Aganjù e Oṣun Pandá em Caxias do Sul."
      />
      <div className="contato-page__inner">
        <header className="contato-hero">
          <h1 className="contato-hero__title">Contato</h1>
          <p className="contato-hero__lead">
            Fale conosco para orientações, agendamentos e informações sobre atendimentos. Respeito e acolhimento em
            cada retorno.
          </p>
        </header>

        <div className="contato-grid">
          <article className="contato-card">
            <h2 className="contato-card__title">Fale com a casa</h2>
            <a
              className="contato-link"
              href="https://wa.me/555491556023?text=Ol%C3%A1!%20Vim%20pelo%20site%20e%20gostaria%20de%20mais%20informa%C3%A7%C3%B5es/"
            >
              <img className="contato-icon" src="/images/icons/ico whatsapp.png" alt="" />
              (54) 9.9155-6023
            </a>
            <a
              className="contato-link"
              href="mailto:ile.de.ase@gmail.com?subject=Contato&body=Olá, gostaria de saber mais sobre a casa de religião."
            >
              <img className="contato-icon" src="/images/icons/ico mail.png" alt="" />
              ile.de.ase@gmail.com
            </a>
          </article>

          <article className="contato-card">
            <h2 className="contato-card__title">Endereço</h2>
            <a className="contato-link" href="https://maps.app.goo.gl/xqmvGBdkY1wMJAtg7">
              <img className="contato-icon" src="/images/icons/ico location.png" alt="" />
              R. Visc. de Pelotas - Pio X, Caxias do Sul - RS, 95034385
            </a>
          </article>

          <article className="contato-card">
            <h2 className="contato-card__title">Atendimentos</h2>
            <p className="contato-text">
              <img className="contato-icon" src="/images/icons/ico relogio.svg" alt="" />
              10:00 às 20:00
            </p>
            <p className="contato-note">Atendimentos somente com horário marcado.</p>
          </article>
        </div>

        <div className="contato-map-wrap">
          <h2 className="contato-map__title">Localização</h2>
          <div className="contato-map-frame">
            <iframe
              className="contato-map"
              src={MAP_EMBED_SRC}
              title="Localização Ilê Sàngó Aganjù e Oṣun Pandá no mapa"
              width="100%"
              height="450"
              allowFullScreen
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
        </div>

        <section className="contato-social" aria-labelledby="contato-social-title">
          <h2 id="contato-social-title" className="contato-social__title">
            Redes sociais
          </h2>
          <div className="contato-social__links">
            <a
              className="contato-social-link"
              href="https://www.instagram.com/ile_sango_osun/"
              target="_blank"
              rel="noopener noreferrer"
            >
              <img className="contato-icon" src="/images/icons/ico instagram.png" alt="" />
              @ile_sango_osun
            </a>
            <a
              className="contato-social-link"
              href="https://www.facebook.com/profile.php?id=61569272685776"
              target="_blank"
              rel="noopener noreferrer"
            >
              <img className="contato-icon" src="/images/icons/ico facebook.png" alt="" />
              Ilê Asè Sàngó Aganjù e Osun Pandà
            </a>
          </div>
        </section>
      </div>
    </section>
  );
};

export default Contato;
