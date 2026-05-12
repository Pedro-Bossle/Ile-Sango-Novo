import { Link } from 'react-router-dom';
import './Cultos.css';
import { PageMeta } from '../components/Seo/PageMeta';

const Cultos = () => {
  return (
    <div className="cultos-page-shell">
      <div className="cultos-page">
        <PageMeta
          title="Cultos"
          path="/cultos"
          description="Conheça Nação Cabinda, Quimbanda Malei e Umbanda no Ilê Sàngó Aganjù e Oṣun Pandá."
        />
        <header className="cultos-hero">
          <h1 className="cultos-hero__title">Cultos</h1>
          <p className="cultos-hero__lead">
            Três expressões da nossa vivência espiritual — cada uma com fundamento, ritual e respeito à ancestralidade.
          </p>
        </header>

        <section className="cultos-section cultos-section--cabinda" aria-labelledby="cultos-cabinda">
          <h2 id="cultos-cabinda" className="cultos-section__title">
            Nação Cabinda
          </h2>
          <div className="cultos-section__grid cultos-section__grid--text-right">
            <div className="cultos-section__text">
              <p>
                O Batuque Cabinda é uma das nações do Batuque do Rio Grande do Sul, religião afro-brasileira de
                matriz africana fortemente influenciada pelas tradições do povo bantu, especialmente da região de
                Cabinda, em Angola. Essa vertente preserva elementos culturais, linguísticos e religiosos que remontam
                às origens africanas, sendo uma importante forma de resistência e continuidade cultural.
              </p>
              <p>
                No Batuque Cabinda, o culto é voltado aos Orixás, forças divinas ligadas à natureza e à vida humana.
                Cada Orixá possui características próprias, cores, comidas, cantigas e rituais específicos. A
                organização religiosa é estruturada, com iniciações, obrigações e uma hierarquia bem definida dentro
                da casa.
              </p>
              <p>
                As práticas clássicas incluem toques de tambor (alujás), oferendas, sacrifícios ritualísticos
                (realizados dentro dos preceitos religiosos), além de festas e cerimônias dedicadas aos Orixás. A
                tradição valoriza a ancestralidade, o respeito aos mais velhos e a preservação dos fundamentos,
                sendo passada de geração em geração.
              </p>
            </div>
            <div className="cultos-section__gallery" role="group" aria-label="Imagens Nação Cabinda">
              <img src="/images/Xango.png" alt="Representação de Xangô" className="cultos-section__img" />
              <img src="/images/Oxum.png" alt="Representação de Oxum" className="cultos-section__img" />
            </div>
          </div>
        </section>

        <section className="cultos-section cultos-section--malei" aria-labelledby="cultos-malei">
          <h2 id="cultos-malei" className="cultos-section__title">
            Quimbanda Malei
          </h2>
          <div className="cultos-section__grid cultos-section__grid--text-left">
            <div className="cultos-section__gallery" role="group" aria-label="Imagens Quimbanda Malei">
              <img src="/images/Sete_Saias.png" alt="Representação Sete Saias" className="cultos-section__img" />
              <img src="/images/Exu_Mare.png" alt="Representação Exu Maré" className="cultos-section__img" />
            </div>
            <div className="cultos-section__text">
              <p>
                A Quimbanda Malei é uma vertente tradicional das religiões afro-brasileiras, com raízes profundas nos
                cultos de origem bantu trazidos ao Brasil durante o período colonial. Diferente de visões distorcidas
                populares, a Quimbanda é uma prática espiritual séria, voltada ao equilíbrio entre forças, à justiça
                espiritual e ao desenvolvimento pessoal por meio da relação com entidades conhecidas como Exus e
                Pombagiras.
              </p>
              <p>
                Historicamente, a Quimbanda se desenvolveu em paralelo à Umbanda, preservando características mais
                antigas e menos sincretizadas. A vertente Malei, em especial, mantém fundamentos mais ligados às
                tradições africanas, com forte ênfase em rituais estruturados, hierarquia e conhecimento transmitido
                oralmente entre gerações.
              </p>
              <p>
                Entre as práticas clássicas estão oferendas ritualísticas, firmezas, trabalhos espirituais voltados à
                abertura de caminhos, proteção e resolução de demandas espirituais. Os rituais são conduzidos com
                respeito, disciplina e dentro de fundamentos específicos, sempre considerando a responsabilidade
                espiritual envolvida.
              </p>
            </div>
          </div>
        </section>

        <section className="cultos-section cultos-section--umbanda" aria-labelledby="cultos-umbanda">
          <h2 id="cultos-umbanda" className="cultos-section__title">
            Umbanda
          </h2>
          <div className="cultos-section__grid cultos-section__grid--text-right">
            <div className="cultos-section__text">
              <p>
                A Umbanda é uma religião brasileira que surgiu no início do século XX, caracterizada pela união de
                elementos africanos, indígenas, espíritas e católicos. É conhecida por sua mensagem de caridade, amor
                ao próximo e evolução espiritual, sendo uma das religiões mais acessíveis e acolhedoras do país.
              </p>
              <p>
                Sua origem é frequentemente associada à manifestação do Caboclo das Sete Encruzilhadas, através do
                médium Zélio Fernandino de Moraes, marcando o início de uma nova forma de prática espiritual que
                integrava diferentes tradições em uma proposta universalista.
              </p>
              <p>
                Na Umbanda, são cultuadas diversas linhas de trabalho espiritual, como Caboclos, Pretos-Velhos,
                Crianças, Exus e Pombagiras, cada uma com sua função e forma de atuação. As práticas incluem giras
                (sessões espirituais), passes, atendimentos, orientações espirituais e trabalhos voltados à cura,
                equilíbrio e auxílio aos necessitados.
              </p>
              <p>
                A Umbanda valoriza a prática da caridade como principal caminho de evolução, buscando sempre o
                bem-estar espiritual e material das pessoas, dentro de princípios éticos e de respeito às diversas
                crenças.
              </p>
            </div>
            <div className="cultos-section__gallery" role="group" aria-label="Imagens Umbanda">
              <img src="/images/Caboclo.png" alt="Representação Caboclo" className="cultos-section__img" />
              <img src="/images/Preta_Velha.png" alt="Representação Preta-Velha" className="cultos-section__img" />
            </div>
          </div>
        </section>

        <section className="cultos-cta" aria-labelledby="cultos-cta-title">
          <h2 id="cultos-cta-title" className="cultos-cta__title">
            Quer visitar ou saber mais?
          </h2>
          <p className="cultos-cta__text">
            Estamos em Caxias do Sul. Fale conosco com respeito e carinho — ou veja eventos e horários na agenda da
            casa.
          </p>
          <div className="cultos-cta__actions">
            <Link to="/contato" className="cultos-cta__btn">
              Entre em contato
            </Link>
            <Link to="/eventos" className="cultos-cta__btn cultos-cta__btn--outline">
              Calendário de eventos
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
};

export default Cultos;
