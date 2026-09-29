import Header from '../Header/Header';
import Footer from '../Footer/Footer';
import Whatsapp from '../Whatsapp/Whatsapp';

const Layout = ({ children }) => (
  <div>
    <Header />
    <main>{children}</main>
    <Whatsapp />
    <Footer />
  </div>
);
export default Layout;
