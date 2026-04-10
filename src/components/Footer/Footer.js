import "./Footer.css"

const Footer = () => {
    return (
        <section id="footer">
            <div className="footer">
                <div className="footer-container">
                    <div>
                        <div className="footer-message">
                            <img className="footer-logo" src="/images/logo-ile.png" alt="logo"></img>

                            <div className="footer-message-title_container">
                                <h2 className="footer-main_title" >Ilê Sàngó Aganjù e Oṣun Pandá</h2>
                                <p className="footer-sub_title" >Tiago de Sàngó Aganjù e Rosangela de Oṣun Pandá</p>
                            </div>
                        </div>
                        <p className="footer-text">Um espaço sagrado dedicado ao crescimento espiritual, cura e orientação.<br></br> Há mais de 4 anos servindo nossa comunidade com amor e dedicação.
                        </p>
                        <ul className="ul-social">
                            <a className="footer-social_link" href="https://www.instagram.com/"><img className="icon" src="/images/icons/ico instagram.png" alt="instagram icon"></img>@ileasesangoosun</a>
                            <a className="footer-social_link" href="https://www.facebook.com/"><img className="icon" src="/images/icons/ico facebook.png" alt="facebook icon"></img>Ilê Asé Sango e Osun</a>
                        </ul>
                    </div>
                    <div className="footer-contacts">
                        <h3 className="footer-section-title" >Contato</h3>
                        <ul>
                            <a className="footer-list_item" href="https://wa.me/555491556023?text=Ol%C3%A1!%20Vim%20pelo%20site%20e%20gostaria%20de%20mais%20informa%C3%A7%C3%B5es/"><img className="icon" src="/images/icons/ico whatsapp.png" alt="facebook icon"></img>(54) 9.9155-6023</a>
                            <a className="footer-list_item" href="mailto:ile.de.ase@gmail.com?subject=Contato&body=Olá, gostaria de saber mais sobre a casa de religião."><img className="icon" src="/images/icons/ico mail.png" alt="mail icon"></img>ile.de.ase@gmail.com</a>
                            <a className="footer-list_item" href="https://maps.app.goo.gl/xqmvGBdkY1wMJAtg7"><img className="icon" src="/images/icons/ico location.png" alt="pin icon"></img>R. Visc. de Pelotas - Pio X,<br></br> Caxias do Sul - RS, 95020-500</a>
                        </ul>
                    </div>
                    <div className="footer-activity">
                        <h3 className="footer-section-title" >Atendimentos</h3>
                        <ul>
                            <p className="footer-list_item" ><img className="icon" src="/images/icons/ico relogio.svg" alt="clock icon"></img>10:00 às 20:00</p>
                            <p className="footer-list_item apointment-warn" >Atendimentos somente com horário marcado</p>

                        </ul>
                    </div>
                </div>

                <ul className="ul-copyright">
                    <p className="footer__copyright"> © 2025 Ilê Asé Sàngó Aganjù e Osun Pandá. Todos os direitos reservados.<br></br> Feito por <a className="footer__copyright-link" href="https://www.linkedin.com/in/pedro-bossle-sandi-685625277/" target="_blank" rel="noreferrer">Pedro Bossle Sandi</a></p>
                    <div>
                        <a href="https://youtube.com">Política de Privacidade</a>
                        <a href="https://youtube.com">Termos de uso</a>

                    </div>
                </ul>
            </div>
        </section >
    );
}

export default Footer;