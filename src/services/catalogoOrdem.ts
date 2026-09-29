import { supabase } from '../lib/supabaseClient';

/** Persiste a ordem das categorias do catálogo após drag-and-drop. */
export async function reorderCatalogoCategorias(orderedIds: Array<string | number>): Promise<void> {
  const results = await Promise.all(
    orderedIds.map((id, i) =>
      supabase.from('catalogo').update({ ordem: i + 1 }).eq('id', Number(id)),
    ),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) throw new Error(failed.error.message);
}
