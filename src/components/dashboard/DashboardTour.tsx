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
  eventos: 'Eventos',
  catalogo: 'Catálogo',
  membros: 'Membros',
  cobrancas: 'Cobranças',
  orixas: 'Orixás',
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
          'Esta é a tela inicial da área restrita. Aqui você vê um resumo rápido do terreiro: totais, finanças e próximos eventos.',
        skipScroll: true,
      },
      {
        target: '[data-tour="stats"]',
        placement: 'bottom',
        title: 'Indicadores',
        content:
          'Cobranças, catálogo, membros, entradas dos últimos 30 dias e valores em aberto — tudo na primeira linha.',
      },
      {
        target: '[data-tour="proximos-eventos"]',
        placement: 'top',
        title: 'Próximos eventos',
        content: 'Os próximos eventos cadastrados aparecem aqui para consulta rápida.',
      },
      withSidebar({
        target: '[data-tour="sidebar"]',
        placement: isMobileViewport() ? 'left' : 'right',
        title: 'Menu lateral',
        content: isMobileViewport()
          ? 'No celular, abra o menu pelo botão ☰ no canto. Use-o para trocar de tela: Eventos, Catálogo, Membros, Cobranças e Orixás.'
          : 'Use a barra lateral para navegar entre as telas. Passe o mouse para expandir ou fixe com o pin.',
      }),
    ];

    if (!isMobileViewport()) {
      steps.push(
        withSidebar({
          target: '[data-tour="sidebar-pin"]',
          placement: 'right',
          title: 'Fixar menu',
          content: 'No desktop, fixe a barra para mantê-la aberta enquanto trabalha.',
        }),
      );
    }

    steps.push(
      withSidebar({
        target: '[data-tour="sidebar-tour"]',
        placement: isMobileViewport() ? 'top' : 'right',
        title: 'Tutorial por tela',
        content:
          'O botão “Tutorial: Nome da tela” reinicia o guia da tela em que você está. Cada tela tem o seu próprio tutorial.',
      }),
    );

    return steps;
  }

  if (screen === 'eventos') {
    const filtrosTarget = isMobileViewport()
      ? '[data-tour="eventos-filtros-mobile"]'
      : '[data-tour="eventos-filtros"]';
    return [
      {
        target: 'body',
        placement: 'center',
        title: 'Eventos',
        content: 'Nesta tela você gerencia a agenda do terreiro: criar, editar, pesquisar e excluir eventos.',
        skipScroll: true,
      },
      {
        target: filtrosTarget,
        placement: 'bottom',
        title: 'Pesquisa e filtros',
        content: 'Filtre por texto ou local para achar eventos rapidamente.',
      },
      {
        target: '[data-tour="eventos-enderecos"]',
        placement: 'bottom',
        title: 'Endereços padrão',
        content:
          'Configure endereços reutilizáveis. No formulário do evento, ao digitar no campo Endereço, as sugestões aparecem automaticamente.',
      },
      {
        target: '[data-tour="eventos-adicionar"]',
        placement: 'bottom',
        title: 'Adicionar evento',
        content: 'Abre o formulário para cadastrar título, data, horário, tipo, endereço e descrição.',
      },
      {
        target: '[data-tour="eventos-lista"]',
        placement: 'top',
        title: 'Lista de eventos',
        content: 'Cada card mostra os dados do evento com ações de Editar e Excluir.',
      },
    ];
  }

  if (screen === 'catalogo') {
    const filtrosTarget = isMobileViewport()
      ? '[data-tour="catalogo-filtros-mobile"]'
      : '[data-tour="catalogo-filtros"]';
    return [
      {
        target: 'body',
        placement: 'center',
        title: 'Catálogo',
        content: 'Gerencie os itens do catálogo do terreiro: nomes, categorias, valores e variações.',
        skipScroll: true,
      },
      {
        target: filtrosTarget,
        placement: 'bottom',
        title: 'Pesquisa e categorias',
        content: 'Pesquise por nome/descrição e filtre por categoria.',
      },
      {
        target: '[data-tour="catalogo-adicionar"]',
        placement: 'bottom',
        title: 'Adicionar item',
        content: 'Cadastre um novo item do catálogo pelo formulário.',
      },
      {
        target: '[data-tour="catalogo-lista"]',
        placement: 'top',
        title: 'Itens cadastrados',
        content: 'Os cards listam cada item com opções de Editar e Excluir.',
      },
    ];
  }

  if (screen === 'membros') {
    const filtrosTarget = isMobileViewport()
      ? '[data-tour="membros-filtros-mobile"]'
      : '[data-tour="membros-filtros"]';
    return [
      {
        target: 'body',
        placement: 'center',
        title: 'Membros',
        content:
          'Cadastro completo dos membros: dados pessoais, orixás, orumalé, exus, umbanda e vínculo com cobranças.',
        skipScroll: true,
      },
      {
        target: filtrosTarget,
        placement: 'bottom',
        title: 'Pesquisar membros',
        content: 'Busque por nome, orisá de cabeça ou telefone.',
      },
      {
        target: '[data-tour="membros-adicionar"]',
        placement: 'bottom',
        title: 'Adicionar membro',
        content: 'Abre o formulário completo para incluir um novo membro.',
      },
      {
        target: '[data-tour="membros-lista"]',
        placement: 'top',
        title: 'Lista de membros',
        content: 'Toque em uma linha para editar. Ordene pelas colunas e acompanhe a situação financeira.',
      },
    ];
  }

  if (screen === 'cobrancas') {
    return [
      {
        target: 'body',
        placement: 'center',
        title: 'Cobranças',
        content: 'Controle mensalidades e obrigações: filtros, pagamentos, lotes e relatórios.',
        skipScroll: true,
      },
      {
        target: '[data-tour="cobrancas-filtros"]',
        placement: 'bottom',
        title: 'Filtros e período',
        content: 'Filtre por membro, período e visualize cobranças pagas ou em aberto.',
      },
      {
        target: '[data-tour="cobrancas-acoes"]',
        placement: 'bottom',
        title: 'Ações',
        content: 'Crie cobranças individuais ou em massa e acesse relatórios de valores pagos.',
      },
      {
        target: '[data-tour="cobrancas-lista"]',
        placement: 'top',
        title: 'Tabela de cobranças',
        content: 'Acompanhe saldos, registre pagamentos, edite ou exclua. No mobile, role horizontalmente a tabela.',
      },
    ];
  }

  if (screen === 'orixas') {
    return [
      {
        target: 'body',
        placement: 'center',
        title: 'Orixás',
        content: 'Configure o catálogo espiritual: orixás, qualidades e diginas usados nos cadastros.',
        skipScroll: true,
      },
      {
        target: '[data-tour="orixas-abas"]',
        placement: 'bottom',
        title: 'Abas',
        content: 'Alterne entre Orixás, Qualidades e Diginas. Qualidades e diginas dependem do orixá selecionado.',
      },
      {
        target: '[data-tour="orixas-toolbar"]',
        placement: 'bottom',
        title: 'Busca e inclusão',
        content: 'Pesquise itens e adicione novos registros. Em Qualidades/Diginas, escolha o orixá no filtro.',
      },
      {
        target: '[data-tour="orixas-lista"]',
        placement: 'top',
        title: 'Lista configurável',
        content: 'Edite ou exclua cada item. Em orixás, toque no nome para ir às qualidades daquele orixá.',
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
