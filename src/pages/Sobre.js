import { Link } from 'react-router-dom';
import './Sobre.css';
import HomeIntro from '../components/HomeIntro/HomeIntro';
import Card from '../components/Card/Card.js';
import { PageMeta } from '../components/Seo/PageMeta';

/**
 * Página institucional: bloco logo + texto, missão e cards dos dirigentes
 * (conteúdo antes na home). Ordem: logo/texto → missão → dirigentes.
 */
const Sobre = () => {
  return (
    <main className="sobre-page">
      <PageMeta
        title="Sobre Nós"
        path="/sobre"
        description="Ilê Asé Sàngó Aganjù e Oṣun Pandá: Nação Cambinda, Kimbanda Malei e Umbanda em Caxias do Sul. Conheça os dirigentes."
      />
      <header className="sobre-page__header">
        <h1 className="sobre-page__h1">Sobre nós</h1>
        <p className="sobre-page__lead">
          Conheça a história, a missão e quem conduz espiritualmente o Ilê Sàngó Aganjù e Oṣun Pandá.
        </p>
      </header>

      <HomeIntro />

      <section className="sobre-mission" aria-labelledby="sobre-missao">
        <h2 id="sobre-missao" className="sobre-mission__title">
          Nossa Missão
        </h2>
        <p className="sobre-mission__text">
          Servir como ponte entre o mundo material e espiritual, oferecendo orientação, cura e desenvolvimento
          espiritual a todos que buscam luz em suas jornadas.
        </p>
        <p className="sobre-mission__text sobre-mission__text--second">
          O Ilê Sàngó Aganjù e Oṣun Pandá é um espaço de acolhimento, respeito e transformação.
        </p>
      </section>

      <section className="sobre-dirigentes" aria-labelledby="sobre-dir">
        <h2 id="sobre-dir" className="sobre-dirigentes__title">
          Nossos Dirigentes Espirituais
        </h2>
        <p className="sobre-dirigentes__desc">
          Conheça os guias espirituais que conduzem nossa casa com amor, sabedoria e dedicação.
        </p>
        <Card />
      </section>

      <section className="sobre-cta" aria-labelledby="sobre-cta-title">
        <h2 id="sobre-cta-title" className="sobre-cta__title">
          Faça parte da nossa comunidade
        </h2>
        <p className="sobre-cta__text">
          Leia sobre os cultos que cultivamos, acompanhe a agenda ou envie uma mensagem — teremos prazer em
          acolhê-lo(a) com respeito.
        </p>
        <div className="sobre-cta__actions">
          <Link to="/cultos" className="sobre-cta__btn">
            Nossos cultos
          </Link>
          <Link to="/eventos" className="sobre-cta__btn sobre-cta__btn--outline">
            Eventos
          </Link>
          <Link to="/contato" className="sobre-cta__btn sobre-cta__btn--outline">
            Contato
          </Link>
        </div>
      </section>
    </main>
  );
};

export default Sobre;
