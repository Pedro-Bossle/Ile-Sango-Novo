import { useEffect, useRef, useState, useCallback } from 'react';
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';
import Layout from './components/Layout/Layout';
import Banner from './components/Banner/Banner';
import About from './components/About/About';
import Eventos from './components/Eventos/Eventos';

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
  return (
    <Layout showScrollTop={showScrollTop} onScrollTop={scrollToTop}>
      <div className="App">
        <Banner />
        <About />
        <Eventos />
        

      </div>
    </Layout>
  );  
}
export default App;
