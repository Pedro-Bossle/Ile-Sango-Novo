import Banner from '../components/Banner/Banner';
import About from '../components/About/About';
import Eventos from '../components/Eventos/Eventos';
import Catalogo from '../components/Catalogo/Catalogo';

const Home = () => {
  return (
    <div className="App">
      <Banner />
      <About />
      <Eventos modo="home" />
      <Catalogo modo="home" />
    </div>
  );
};

export default Home;
