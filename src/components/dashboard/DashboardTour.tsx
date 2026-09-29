import { useCallback, useEffect, useMemo, useState } from 'react';
import { EVENTS, Joyride, STATUS, type EventHandler, type Step } from 'react-joyride';
import {
  clearTutorialCompleted,
  isTutorialCompleted,
  markTutorialCompleted,
} from '../../services/dashboardTutorials';

/** Usuário que vê o tutorial automático uma vez (persistido em `dashboard_tutorials`). */
export const DASH_TOUR_USER_ID = 'fd74d483-f27a-499f-9e2a-d1226922f5eb';

export const TOUR_SCREEN_LABELS: Record<string, string> = {
  'visao-geral': 'Visão geral',
  eventos: 'Agenda',
  catalogo: 'Catálogo',
  membros: 'Membros',
  cobrancas: 'Cobranças',
  mensalidades: 'Mensalidades',
  atrasados: 'Atrasados',
  caixa: 'Fluxo de caixa',
  clientes: 'Clientes',
  agenda: 'Agenda',
  'dados-ile': 'Dados do Ilê',
  orixas: 'Orixás',
  acessos: 'Acessos',
};

export function tourButtonLabel(menuAtivo: string): string {
  const nome = TOUR_SCREEN_LABELS[menuAtivo] ?? 'Dashboard';
  return `Tutorial: ${nome}`;
}

type Props = {
  userId: string | null;
  menuAtivo: string;
  /** Incrementar para reiniciar o tour da tela atual. */
  restartNonce?: number;
  /** Abre/fecha a sidebar (mobile drawer / estado aberto). */
  onSidebarOpen: (open: boolean) => void;
  /** Preparação inicial: fecha sidebar, scroll, etc. */
  onPrepareStart: () => void;
};

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function isMobileViewport(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 980px)').matches;
}

type BuildCtx = {
  openSidebar: () => Promise<void>;
  closeSidebar: () => Promise<void>;
};

function buildStepsForScreen(screen: string, ctx: BuildCtx): Step[] {
  const withSidebar = (step: Step): Step => ({
    ...step,
    before: async (data) => {
      await ctx.openSidebar();
      if (step.before) await step.before(data);
    },
    after: (data) => {
      void ctx.closeSidebar();
      if (step.after) step.after(data);
    },
  });

  if (screen === 'visao-geral') {
    const steps: Step[] = [
      {
        target: 'body',
        placement: 'center',
        title: 'Visão geral',
        content:
          'Resumo do terreiro em cartões: próximo compromisso, saldo do mês, mensalidades, próximo evento e aniversariantes.',
        skipScroll: true,
      },
      {
        target: '[data-tour="stats"]',
        placement: 'bottom',
        title: 'Indicadores',
        content: 'Toque em um cartão para ir direto à Agenda, Caixa, Mensalidades ou Cobranças.',
      },
      {
        target: '[data-tour="atendimento-hoje"]',
        placement: 'bottom',
        title: 'Próximo compromisso',
        content: 'Mostra o próximo compromisso de atendimento. Toque para abrir a Agenda unificada.',
      },
      {
        target: '[data-tour="aniversarios-mes"]',
        placement: 'top',
        title: 'Aniversários',
        content: 'Aniversariantes do mês: nome à esquerda e data à direita. Datas já passadas aparecem riscadas.',
      },
      {
        target: '[data-tour="proximos-eventos"]',
        placement: 'top',
        title: 'Próximo evento',
        content: 'O próximo evento da casa. Toque para abrir a Agenda (eventos e compromissos).',
      },
      withSidebar({
        target: '[data-tour="sidebar"]',
        placement: isMobileViewport() ? 'left' : 'right',
        title: isMobileViewport() ? 'Menu Mais' : 'Menu lateral',
        content: isMobileViewport()
          ? 'No celular, toque em Mais na barra inferior para abrir o restante dos menus (Catálogo, Membros, Financeiro, etc.).'
          : 'Navegue por Financeiro, Clientes e Configurações. Passe o mouse para expandir ou fixe com o pin.',
      }),
    ];

    if (!isMobileViewport()) {
      steps.push(
        withSidebar({
          target: '[data-tour="sidebar-pin"]',
          placement: 'right',
          title: 'Fixar menu',
          content: 'No computador, fixe a barra para mantê-la aberta enquanto trabalha.',
        }),
      );
    }

    steps.push(
      isMobileViewport()
        ? {
            target: '[data-tour="sidebar-tour-mobile"]',
            placement: 'top',
            title: 'Tutorial por tela',
            content:
              'O botão “Tutorial” no rodapé reinicia o guia da tela em que você está. Cada tela tem o seu próprio tutorial.',
          }
        : withSidebar({
            target: '[data-tour="sidebar-tour"]',
            placement: 'right',
            title: 'Tutorial por tela',
            content:
              'O botão “Tutorial: Nome da tela” reinicia o guia da tela em que você está. Cada tela tem o seu próprio tutorial.',
          }),
    );

    return steps;
  }

  if (screen === 'eventos' || screen === 'agenda') {
    return [
      {
        target: 'body',
        placement: 'center',
        title: 'Agenda',
        content:
          'Calendário unificado: eventos da casa (E) e compromissos de atendimento (C). Nos compromissos aparece o nome de quem criou.',
        skipScroll: true,
      },
      {
        target: '[data-tour="calendario-filtros"]',
        placement: 'bottom',
        title: 'Filtros',
        content: 'Pesquise por título/local ou digite uma data (ex.: 20/10/2026). Filtre por tipo ou usuário.',
      },
      {
        target: '[data-tour="eventos-calendario"]',
        placement: 'top',
        title: 'Calendário',
        content: 'Navegue pelos meses. Clique num dia para escolher Evento ou Compromisso; clique num chip para editar.',
      },
    ];
  }

  if (screen === 'catalogo') {
    return [
      {
        target: 'body',
        placement: 'center',
        title: 'Catálogo',
        content: 'Categorias com descrição e itens com valor individual, usados em vendas e atendimentos.',
        skipScroll: true,
      },
      {
        target: '[data-tour="catalogo-filtros"]',
        placement: 'bottom',
        title: 'Pesquisa e grupos',
        content: 'Busque por categoria ou item e filtre por grupo.',
      },
      {
        target: '[data-tour="catalogo-adicionar"]',
        placement: 'bottom',
        title: 'Nova categoria',
        content: 'Crie uma categoria e depois adicione os itens com preço.',
      },
      {
        target: '[data-tour="catalogo-lista"]',
        placement: 'top',
        title: 'Categorias e itens',
        content: 'Expanda cada categoria para ver, editar ou excluir os itens.',
      },
    ];
  }

  if (screen === 'membros') {
    const filtrosTarget = '[data-tour="membros-filtros"]';
    return [
      {
        target: 'body',
        placement: 'center',
        title: 'Membros',
        content:
          'Cadastro completo: dados pessoais, orixás, orumalé, exus, umbanda e vínculo com cobranças. A ficha usa a largura toda da tela.',
        skipScroll: true,
      },
      {
        target: filtrosTarget,
        placement: 'bottom',
        title: 'Busca e atalhos',
        content:
          'Pesquise por nome, orisá ou telefone. Filtre por Ativos, Inativos ou Todos. O menu Excel exporta modelo ou importa planilha.',
      },
      {
        target: '[data-tour="membros-adicionar"]',
        placement: 'bottom',
        title: 'Novo membro',
        content: 'Abre a ficha completa para incluir alguém. No final, Salvar fica no botão flutuante.',
      },
      {
        target: '[data-tour="membros-lista"]',
        placement: 'top',
        title: 'Lista',
        content:
          'Toque numa linha para editar. Ordene pelas colunas e veja a situação financeira. Inativar remove da lista ativa (pode restaurar depois).',
      },
    ];
  }

  if (screen === 'mensalidades') {
    return [
      {
        target: 'body',
        placement: 'center',
        title: 'Mensalidades',
        content:
          'Grade anual por membro: A (aberto), P (pago), I (isento), D (desligado). No dia 1 vincula 1 mensalidade a cada integrante ativo; fica atrasada 10 dias depois.',
        skipScroll: true,
      },
      {
        target: '.dash-mens__toolbar',
        placement: 'bottom',
        title: 'Ano e pagamento',
        content: 'Troque o ano, busque pelo nome e defina a data do pagamento. “Sem fluxo de caixa” evita lançar entrada automática.',
      },
      {
        target: '.dash-mens__kpis',
        placement: 'bottom',
        title: 'Resumo',
        content: 'Recebido, em aberto e atrasado (10 dias após o dia 1) do ano selecionado.',
      },
      {
        target: '.dash-mens__table-wrap',
        placement: 'top',
        title: 'Grade',
        content: 'Clique numa célula para alterar o status. Membros inativos no ano seguinte não aparecem na lista.',
      },
    ];
  }

  if (screen === 'cobrancas') {
    return [
      {
        target: 'body',
        placement: 'center',
        title: 'Cobranças',
        content: 'Acompanhe recebidos e em aberto, quite parcial ou total e registre no fluxo de caixa.',
        skipScroll: true,
      },
      {
        target: '[data-tour="cobrancas-filtros"]',
        placement: 'bottom',
        title: 'Busca e filtros',
        content: 'Busque por membro ou descrição, filtre por status (todas, em aberto, atrasadas, pagas) e ordene a lista.',
      },
      {
        target: '[data-tour="cobrancas-acoes"]',
        placement: 'bottom',
        title: 'Ações',
        content: 'Copie a lista em aberto, crie nova cobrança ou use Mais para cobrança em massa e relatórios.',
      },
      {
        target: '[data-tour="cobrancas-lista"]',
        placement: 'top',
        title: 'Lista',
        content: 'Cada item mostra progresso, status e atalhos para pagar, histórico, editar ou excluir.',
      },
    ];
  }

  if (screen === 'atrasados') {
    return [
      {
        target: 'body',
        placement: 'center',
        title: 'Atrasados',
        content:
          'Quem está com cobrança em aberto ou atrasada. Ideal para cobrança rápida com mensagem pronta e Pix.',
        skipScroll: true,
      },
      {
        target: '[data-tour="atrasados-toolbar"]',
        placement: 'bottom',
        title: 'Filtros',
        content: 'Escolha o ano, busque pelo nome, marque “Só atrasados” e gere o relatório.',
      },
      {
        target: '[data-tour="atrasados-kpis"]',
        placement: 'bottom',
        title: 'Resumo',
        content: 'Quantidade de membros na lista, quantos têm atraso e o total em aberto.',
      },
      {
        target: '[data-tour="atrasados-lista"]',
        placement: 'top',
        title: 'Lista por membro',
        content: 'Copie a mensagem ou abra o WhatsApp. O texto já inclui o valor e a chave Pix do Ilê (se cadastrada).',
      },
    ];
  }

  if (screen === 'caixa') {
    return [
      {
        target: 'body',
        placement: 'center',
        title: 'Fluxo de caixa',
        content:
          'Entradas e saídas do período — incluindo pagamentos sincronizados das cobranças — e lançamentos manuais.',
        skipScroll: true,
      },
      {
        target: '[data-tour="caixa-toolbar"]',
        placement: 'bottom',
        title: 'Ferramentas',
        content: 'Busque, filtre por ano/categoria, exporte Excel ou PDF e gerencie as categorias do caixa.',
      },
      {
        target: '[data-tour="caixa-kpis"]',
        placement: 'bottom',
        title: 'Indicadores',
        content: 'Restante do ano anterior, entradas, saídas, resultado do período e saldo atual.',
      },
      {
        target: '[data-tour="caixa-meses"]',
        placement: 'top',
        title: 'Lançamentos por mês',
        content:
          'Expanda um mês para ver a tabela. Edite ou exclua lançamentos manuais. Use “+ Novo lançamento” no topo para criar.',
      },
    ];
  }

  if (screen === 'clientes') {
    return [
      {
        target: 'body',
        placement: 'center',
        title: 'Clientes',
        content:
          'Lista em largura total. Abra um cliente para ver dados, vendas e visitas. Vendas só existem dentro da ficha do cliente.',
        skipScroll: true,
      },
      {
        target: '[data-tour="atendimento-clientes-filtros"]',
        placement: 'bottom',
        title: 'Busca e filtros',
        content: 'Busque por nome, WhatsApp ou e-mail. Filtre “Só em aberto” ou “Ver inativados”.',
      },
      {
        target: '[data-tour="atendimento-clientes-lista"]',
        placement: 'top',
        title: 'Tabela de clientes',
        content: 'Toque numa linha para abrir a ficha. Lá pode criar venda (precisa dos dados do cliente) e registar visitas.',
      },
    ];
  }

  if (screen === 'dados-ile') {
    return [
      {
        target: 'body',
        placement: 'center',
        title: 'Dados do Ilê',
        content:
          'Identidade da casa: nome, logo, Pix (chave + QR Code PNG) e endereço. Usados em cobranças, recibos e PDFs.',
        skipScroll: true,
      },
      {
        target: '[data-tour="dados-ile-identidade"]',
        placement: 'bottom',
        title: 'Identidade',
        content: 'Nome do Ilê e logo (opcional). A logo aparece em relatórios e no recibo de atendimento.',
      },
      {
        target: '[data-tour="dados-ile-pix"]',
        placement: 'bottom',
        title: 'Pix e QR Code',
        content:
          'Tipo e chave Pix para WhatsApp. Envie o PNG do QR Code — ele entra no recibo PDF de cada visita.',
      },
      {
        target: '[data-tour="dados-ile-endereco"]',
        placement: 'top',
        title: 'Endereço',
        content: 'Informe o CEP para preencher rua, bairro, cidade e UF automaticamente. Depois ajuste o número se precisar.',
      },
    ];
  }

  if (screen === 'acessos') {
    return [
      {
        target: 'body',
        placement: 'center',
        title: 'Acessos de Admin',
        content:
          'Defina o que cada pessoa pode fazer em cada tela (ver, criar, editar, excluir, enviar). Só administradores alteram acessos.',
        skipScroll: true,
      },
      {
        target: '[data-tour="acessos-abas"]',
        placement: 'bottom',
        title: 'Duas abas',
        content:
          '“Pessoas e permissões” para editar acessos. “Histórico de alterações” mostra quem mudou o quê (antigo → atual).',
      },
      {
        target: '[data-tour="acessos-pessoas"]',
        placement: 'right',
        title: 'Lista de pessoas',
        content: 'Escolha alguém à esquerda. À direita: nome de exibição, administrador, conta ativa e permissões.',
      },
      {
        target: '[data-tour="acessos-admin"]',
        placement: 'bottom',
        title: 'Como configurar',
        content:
          'Defina o nome (aparece nos compromissos da Agenda). Use um atalho pronto e ajuste tela a tela. Salve no botão do topo.',
      },
    ];
  }

  if (screen === 'orixas') {
    return [
      {
        target: 'body',
        placement: 'center',
        title: 'Orixás',
        content: 'Catálogo espiritual: orixás, qualidades e diginas usados nas fichas de membros.',
        skipScroll: true,
      },
      {
        target: '[data-tour="orixas-abas"]',
        placement: 'bottom',
        title: 'Abas',
        content: 'Alterne entre Orixás, Qualidades e Diginas. Qualidades e diginas dependem do orixá escolhido.',
      },
      {
        target: '[data-tour="orixas-toolbar"]',
        placement: 'bottom',
        title: 'Busca e inclusão',
        content: 'Pesquise e adicione registros. Em Qualidades/Diginas, filtre pelo orixá.',
      },
      {
        target: '[data-tour="orixas-lista"]',
        placement: 'top',
        title: 'Lista',
        content: 'Edite ou exclua. Em orixás, toque no nome para ir às qualidades daquele orixá.',
      },
    ];
  }

  return [
    {
      target: 'body',
      placement: 'center',
      title: 'Tutorial',
      content: 'Selecione uma tela no menu para ver o tutorial específico dela.',
      skipScroll: true,
    },
  ];
}

export function DashboardTour({
  userId,
  menuAtivo,
  restartNonce = 0,
  onSidebarOpen,
  onPrepareStart,
}: Props) {
  const [run, setRun] = useState(false);
  const [activeScreen, setActiveScreen] = useState(menuAtivo);
  const [readyAuto, setReadyAuto] = useState(false);

  const openSidebar = useCallback(async () => {
    onSidebarOpen(true);
    await wait(isMobileViewport() ? 320 : 200);
  }, [onSidebarOpen]);

  const closeSidebar = useCallback(async () => {
    onSidebarOpen(false);
    await wait(isMobileViewport() ? 280 : 120);
  }, [onSidebarOpen]);

  const steps = useMemo(
    () => buildStepsForScreen(activeScreen, { openSidebar, closeSidebar }),
    [activeScreen, openSidebar, closeSidebar],
  );

  const startTour = useCallback(
    (screen: string) => {
      if (!userId) return;
      setActiveScreen(screen);
      onPrepareStart();
      setRun(false);
      window.setTimeout(() => setRun(true), 400);
    },
    [onPrepareStart, userId],
  );

  // Auto: uma vez por utilizador alvo, se ainda não concluído no banco.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!userId) return;
      if (userId !== DASH_TOUR_USER_ID) {
        setReadyAuto(true);
        return;
      }
      if (menuAtivo !== 'visao-geral') {
        setReadyAuto(true);
        return;
      }
      try {
        const done = await isTutorialCompleted(userId, 'visao-geral');
        if (cancelled) return;
        setReadyAuto(true);
        if (!done) startTour('visao-geral');
      } catch {
        if (!cancelled) setReadyAuto(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, menuAtivo, startTour]);

  // Manual: botão da sidebar.
  useEffect(() => {
    if (!restartNonce || !userId) return;
    let cancelled = false;
    (async () => {
      try {
        await clearTutorialCompleted(userId, menuAtivo);
      } catch {
        /* segue mesmo se falhar limpeza */
      }
      if (!cancelled) startTour(menuAtivo);
    })();
    return () => {
      cancelled = true;
    };
  }, [restartNonce, userId, menuAtivo, startTour]);

  const handleEvent = useCallback<EventHandler>(
    (data) => {
      if (!userId) return;
      if (data.type === EVENTS.TOUR_END || data.status === STATUS.FINISHED || data.status === STATUS.SKIPPED) {
        void markTutorialCompleted(userId, activeScreen).catch(() => undefined);
        setRun(false);
        onSidebarOpen(false);
      }
    },
    [userId, activeScreen, onSidebarOpen],
  );

  if (!userId || (!readyAuto && !restartNonce)) return null;

  return (
    <Joyride
      run={run}
      steps={steps}
      continuous
      scrollToFirstStep
      onEvent={handleEvent}
      locale={{
        back: 'Voltar',
        close: 'Fechar',
        last: 'Concluir',
        next: 'Próximo',
        nextWithProgress: 'Próximo ({current}/{total})',
        open: 'Abrir',
        skip: 'Pular',
      }}
      options={{
        skipBeacon: true,
        showProgress: true,
        primaryColor: '#530505',
        overlayColor: 'rgba(0, 0, 0, 0.5)',
        zIndex: 12000,
        buttons: ['back', 'skip', 'primary'],
        closeButtonAction: 'skip',
        spotlightPadding: 8,
        spotlightRadius: 10,
        width: isMobileViewport() ? 'min(340px, 92vw)' : 380,
      }}
    />
  );
}
