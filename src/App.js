import { useEffect, useRef, useState, useCallback } from 'react';
import { Route, Routes } from 'react-router-dom';
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
import Dashboard from './pages/Dashboard';

function App() {
  const lenisRef = useRef(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  useEffect(() => {
    const lenis = new Lenis();
    lenisRef.current = lenis;
    let rafId;
    function raf(time) {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    }
    rafId = requestAnimationFrame(raf);
    const onScroll = () => {
      setShowScrollTop(lenis.scroll > 200);
    };
    lenis.on('scroll', onScroll);
    return () => {
      cancelAnimationFrame(rafId);
      lenis.destroy();
      lenisRef.current = null;
    };
  }, []);
  const scrollToTop = useCallback(() => {
    lenisRef.current?.scrollTo(0, { duration: 1.2 });
  }, []);

  const renderWithLayout = (page) => (
    <Layout showScrollTop={showScrollTop} onScrollTop={scrollToTop}>
      {page}
    </Layout>
  );

  return (
    <Routes>
      <Route path="/" element={renderWithLayout(<Home />)} />
      <Route path="/sobre" element={renderWithLayout(<Sobre />)} />
      <Route path="/eventos" element={renderWithLayout(<Calendario />)} />
      <Route path="/catalogo" element={renderWithLayout(<Catalogo />)} />
      <Route path="/contato" element={renderWithLayout(<Contato />)} />
      <Route path="/login" element={renderWithLayout(<Login />)} />
      <Route path="/redefinir-senha" element={renderWithLayout(<RedefinirSenha />)} />
      <Route path="/dashboard" element={<Dashboard />} />
    </Routes>
  );
}
export default App;
