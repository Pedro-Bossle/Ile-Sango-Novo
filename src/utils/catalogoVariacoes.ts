/** Subcategoria precificada dentro de um item do catálogo. */
export type CatalogoVariacao = {
  nome: string;
  valor: number;
};

export type CatalogoOpcao = {
  /** id do registro pai em `catalogo` */
  id: number;
  nome: string;
  valor: number;
  categoria?: string | null;
  /** chave estável para lista/favoritos quando há subcategoria */
  opcaoKey: string;
};

/** Aceita legado ("Amor, Dinheiro") ou JSON ([{"nome":"Amor","valor":222}]). */
export function parseCatalogoVariacoes(
  raw: unknown,
  valorFallback = 0,
): CatalogoVariacao[] {
  if (raw == null || raw === '') return [];

  if (Array.isArray(raw)) {
    return raw
      .map((item) => normalizeVariacao(item, valorFallback))
      .filter((v): v is CatalogoVariacao => v != null);
  }

  if (typeof raw === 'object') {
    return Object.entries(raw as Record<string, unknown>)
      .map(([nome, valor]) =>
        normalizeVariacao({ nome, valor }, valorFallback),
      )
      .filter((v): v is CatalogoVariacao => v != null);
  }

  const s = String(raw).trim();
  if (!s) return [];

  if (s.startsWith('[') || s.startsWith('{')) {
    try {
      return parseCatalogoVariacoes(JSON.parse(s), valorFallback);
    } catch {
      /* cai no legado */
    }
  }

  return s
    .split(',')
    .map((nome) => nome.trim())
    .filter(Boolean)
    .map((nome) => ({ nome, valor: Number(valorFallback) || 0 }));
}

function normalizeVariacao(item: unknown, valorFallback: number): CatalogoVariacao | null {
  if (item == null) return null;
  if (typeof item === 'string') {
    const nome = item.trim();
    return nome ? { nome, valor: Number(valorFallback) || 0 } : null;
  }
  if (typeof item !== 'object') return null;
  const o = item as Record<string, unknown>;
  const nome = String(o.nome ?? o.name ?? '').trim();
  if (!nome) return null;
  const valorRaw = o.valor ?? o.price ?? o.preco;
  const valor = Number(valorRaw);
  return {
    nome,
    valor: Number.isFinite(valor) ? valor : Number(valorFallback) || 0,
  };
}

export function serializeCatalogoVariacoes(vars: CatalogoVariacao[]): string {
  const clean = vars
    .map((v) => ({
      nome: String(v.nome ?? '').trim(),
      valor: Number(v.valor) || 0,
    }))
    .filter((v) => v.nome);
  return clean.length ? JSON.stringify(clean) : '';
}

export function valorMinimoCatalogo(
  valorBase: number,
  variacoes: CatalogoVariacao[],
): number {
  if (!variacoes.length) return Number(valorBase) || 0;
  return Math.min(...variacoes.map((v) => Number(v.valor) || 0));
}

/** Expande itens do catálogo em opções selecionáveis (subcategoria = linha própria). */
export function expandCatalogoOpcoes(
  rows: Array<{
    id: number | string;
    nome: string;
    valor?: number | string | null;
    categoria?: string | null;
    variacoes?: unknown;
  }>,
): CatalogoOpcao[] {
  const out: CatalogoOpcao[] = [];
  for (const r of rows) {
    const id = Number(r.id);
    const baseValor = Number(r.valor) || 0;
    const vars = parseCatalogoVariacoes(r.variacoes, baseValor);
    if (vars.length) {
      for (const v of vars) {
        out.push({
          id,
          nome: `${r.nome} — ${v.nome}`,
          valor: v.valor,
          categoria: r.categoria ?? null,
          opcaoKey: `${id}:${v.nome}`,
        });
      }
    } else {
      out.push({
        id,
        nome: r.nome,
        valor: baseValor,
        categoria: r.categoria ?? null,
        opcaoKey: String(id),
      });
    }
  }
  return out;
}
