import './Contato.css';

const Contato = () => {
  return (
    <section className="contato-page">
      <div className="contato-hero">
        <h2>Contato</h2>
        <p>Fale conosco para orientacoes, agendamentos e informacoes sobre atendimentos.</p>
      </div>

      <div className="contato-grid">
        <article className="contato-card">
          <h3>Fale com a casa</h3>
          <a className="contato-link" href="https://wa.me/555491556023?text=Ol%C3%A1!%20Vim%20pelo%20site%20e%20gostaria%20de%20mais%20informa%C3%A7%C3%B5es/">
            <img className="contato-icon" src="/images/icons/ico whatsapp.png" alt="" />
            (54) 9.9155-6023
          </a>
          <a className="contato-link" href="mailto:ile.de.ase@gmail.com?subject=Contato&body=Olá, gostaria de saber mais sobre a casa de religião.">
            <img className="contato-icon" src="/images/icons/ico mail.png" alt="" />
            ile.de.ase@gmail.com
          </a>
        </article>

        <article className="contato-card">
          <h3>Endereco</h3>
          <a className="contato-link" href="https://maps.app.goo.gl/xqmvGBdkY1wMJAtg7">
            <img className="contato-icon" src="/images/icons/ico location.png" alt="" />
            R. Visc. de Pelotas - Pio X, Caxias do Sul - RS, 95020-500
          </a>
        </article>

        <article className="contato-card">
          <h3>Atendimentos</h3>
          <p className="contato-text">
            <img className="contato-icon" src="/images/icons/ico relogio.svg" alt="" />
            10:00 as 20:00
          </p>
          <p className="contato-note">Atendimentos somente com horario marcado.</p>
        </article>
      </div>

      <div className="contato-social">
        <a className="contato-link" href="https://www.instagram.com/">
          <img className="contato-icon" src="/images/icons/ico instagram.png" alt="" />
          @ileasesangoosun
        </a>
        <a className="contato-link" href="https://www.facebook.com/">
          <img className="contato-icon" src="/images/icons/ico facebook.png" alt="" />
          Ile Ase Sango e Osun
        </a>
      </div>
    </section>
  );
};

export default Contato;
