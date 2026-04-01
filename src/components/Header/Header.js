import './Header.css';
const Header = () => {
    return (
        <div className="header">
            <div className="header-logo-container">
                <img className="header-logo" src="/images/logo-ile.png" alt="logo" />
                <div className='header-title-container'>
                    <h1 className="header-title">Ilê Sàngó Aganjù e Oṣun Pandá</h1>
                    <p className='header-sub-title'>Tiago de Sàngó Aganjù e Rosangela de Oṣun Pandá</p>
                </div>
            </div>
            <nav className='header-nav'>
                <a className="header-menu" href='https://youtube.com'>Início</a>
                <a className="header-menu" href='https://youtube.com'>Sobre Nós</a>
                <a className="header-menu" href='https://youtube.com'>Calendário</a>
                <a className="header-menu" href='https://youtube.com'>Catálogo</a>
                <a className="header-menu" href='https://youtube.com'>Contato</a>
                <a className="header-menu login-button" href='https://youtube.com'><img className='button_icon' src="/images/icons/user-icon.png" alt=''/> Área Restrita</a>
            </nav>
        </div>
    )


}
export default Header;