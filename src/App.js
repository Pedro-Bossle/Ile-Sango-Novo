import { useEffect, useRef } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';
import Layout from './components/Layout/Layout';
import Home from './pages/Home';
import Sobre from './pages/Sobre';
import Calendario from './pages/Calendario';
import Catalogo from './pages/Catalogo';
import Contato from './pages/Contato';
import Login from './pages/Login';
import RedefinirSenha from './pages/RedefinirSenha';
import Cultos from './pages/Cultos';
import TermosDeUso from './pages/TermosDeUso';
import PoliticaPrivacidade from './pages/PoliticaPrivacidade';
import TrocarSenha from './pages/TrocarSenha';
import Dashboard from './pages/Dashboard';
import CadastroMembroPublico from './pages/CadastroMembroPublico';

function App() {
  const location = useLocation();
  const lenisRef = useRef(null);

  // Lenis só no site público. Na dashboard, `stop()` aplica overflow:clip e
  // preventDefault na roda — bloqueia o scroll nativo (ex.: editar membro).
  useEffect(() => {
    const onDashboard = location.pathname.startsWith('/dashboard');

    if (onDashboard) {
      window.scrollTo(0, 0);
      return;
    }

    const lenis = new Lenis();
    lenisRef.current = lenis;
    window.__lenis = lenis;
    let rafId;
    function raf(time) {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    }
    rafId = requestAnimationFrame(raf);
    lenis.scrollTo(0, { immediate: true });

    return () => {
      cancelAnimationFrame(rafId);
      lenis.destroy();
      lenisRef.current = null;
      window.__lenis = null;
    };
  }, [location.pathname]);

  const renderWithLayout = (page) => <Layout>{page}</Layout>;

  return (
    <Routes>
      <Route path="/" element={renderWithLayout(<Home />)} />
      <Route path="/sobre" element={renderWithLayout(<Sobre />)} />
      <Route path="/eventos" element={renderWithLayout(<Calendario />)} />
      <Route path="/catalogo" element={renderWithLayout(<Catalogo />)} />
      <Route path="/contato" element={renderWithLayout(<Contato />)} />
      <Route path="/cultos" element={renderWithLayout(<Cultos />)} />
      <Route path="/termos-de-uso" element={renderWithLayout(<TermosDeUso />)} />
      <Route path="/politica-de-privacidade" element={renderWithLayout(<PoliticaPrivacidade />)} />
      <Route path="/login" element={renderWithLayout(<Login />)} />
      <Route path="/redefinir-senha" element={renderWithLayout(<RedefinirSenha />)} />
      <Route path="/trocar-senha" element={renderWithLayout(<TrocarSenha />)} />
      <Route path="/cadastrar_membro" element={renderWithLayout(<CadastroMembroPublico />)} />
      <Route path="/cadastro/:token" element={renderWithLayout(<CadastroMembroPublico />)} />
      <Route path="/dashboard" element={<Dashboard />} />
    </Routes>
  );
}
export default App;
