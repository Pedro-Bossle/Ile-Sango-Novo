import Eventos from '../components/Eventos/Eventos';
import { PageMeta } from '../components/Seo/PageMeta';

const Calendario = () => {
  return (
    <>
      <PageMeta
        title="Eventos"
        path="/eventos"
        description="Eventos e giras do Ilê Sàngó Aganjù e Oṣun Pandá."
      />
      <Eventos modo="calendario" />
    </>
  );
};

export default Calendario;
