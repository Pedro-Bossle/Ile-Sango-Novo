import './Header.css';
import { useState } from 'react';
import { NavLink } from 'react-router-dom';

const Header = () => {
    const [menuAberto, setMenuAberto] = useState(false);

    const handleCloseMenu = () => setMenuAberto(false);

    return (
        <div className="header">
            <div className="header-logo-container">
                <img className="header-logo" src="/images/logo-ile.png" alt="logo" />
                <div className='header-title-container'>
                    <h1 className="header-title">Ilê Sàngó Aganjù e Oṣun Pandá</h1>
                    <p className='header-sub-title'>Tiago de Sàngó Aganjù e Rosangela de Oṣun Pandá</p>
                </div>
            </div>

            <button
                className="header-hamburger"
                type="button"
                aria-label="Abrir menu"
                onClick={() => setMenuAberto((prev) => !prev)}
            >
                <span></span>
                <span></span>
                <span></span>
            </button>

            <nav className={`header-nav ${menuAberto ? 'open' : ''}`}>
                <NavLink className="header-menu" to="/" onClick={handleCloseMenu}>Início</NavLink>
                <NavLink className="header-menu" to="/sobre" onClick={handleCloseMenu}>Sobre Nós</NavLink>
                <NavLink className="header-menu" to="/eventos" onClick={handleCloseMenu}>Eventos</NavLink>
                <NavLink className="header-menu" to="/catalogo" onClick={handleCloseMenu}>Catálogo</NavLink>
                <NavLink className="header-menu" to="/cultos" onClick={handleCloseMenu}>Cultos</NavLink>
                <NavLink className="header-menu" to="/contato" onClick={handleCloseMenu}>Contato</NavLink>
                <NavLink className="header-menu login-button" to="/login" onClick={handleCloseMenu}><img className='button_icon' src="/images/icons/user-icon.png" alt=''/> Área Restrita</NavLink>
            </nav>
        </div>
    )
}
export default Header;