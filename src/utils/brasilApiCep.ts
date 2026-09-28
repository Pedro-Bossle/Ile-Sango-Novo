export type BrasilApiCep = {
  cep: string;
  state: string;
  city: string;
  neighborhood: string;
  street: string;
};

export async function fetchCepBrasilApi(cepRaw: string): Promise<BrasilApiCep> {
  const cep = String(cepRaw).replace(/\D/g, '');
  if (cep.length !== 8) throw new Error('CEP deve ter 8 dígitos.');
  const res = await fetch(`https://brasilapi.com.br/api/cep/v1/${cep}`);
  if (!res.ok) throw new Error('CEP não encontrado.');
  const data = await res.json();
  return {
    cep: data.cep ?? cep,
    state: data.state ?? '',
    city: data.city ?? '',
    neighborhood: data.neighborhood ?? '',
    street: data.street ?? '',
  };
}
