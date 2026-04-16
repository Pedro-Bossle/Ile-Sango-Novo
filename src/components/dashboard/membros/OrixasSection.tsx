import type { Orixa } from '../../../types/database';
import type { CadastroFormState } from '../../../hooks/useMemberForm';
import { OrixaQualidadePair } from './OrixaQualidadePair';

type Props = {
  orixas: Orixa[];
  cadastro: CadastroFormState;
  setCadastroField: (field: keyof CadastroFormState, value: string) => void;
};

function nomeOrixaParaPlaceholder(orixas: { id: string; nome: string }[], orixaId: string, fallback: string): string {
  const nome = orixas.find((o) => o.id === orixaId)?.nome?.trim();
  return nome || fallback;
}

export function OrixasSection({ orixas, cadastro, setCadastroField }: Props) {
  return (
    <section className="dash-form-section">
      <h2 className="dash-form-section__title">Orixás</h2>
      <OrixaQualidadePair
        label="Orixá cabeça"
        orixas={orixas}
        orixaId={cadastro.orixa_cabeca_id}
        qualidadeId={cadastro.qualidade_cabeca_id}
        onOrixaChange={(id) => setCadastroField('orixa_cabeca_id', id)}
        onQualidadeChange={(id) => setCadastroField('qualidade_cabeca_id', id)}
        placeholderOrixaNome={nomeOrixaParaPlaceholder(orixas, cadastro.orixa_cabeca_id, 'Orixá cabeça')}
        rezaValue={cadastro.orixa_cabeca_reza}
        onRezaChange={(v) => setCadastroField('orixa_cabeca_reza', v)}
      />
      <OrixaQualidadePair
        label="Orixá corpo"
        orixas={orixas}
        orixaId={cadastro.orixa_corpo_id}
        qualidadeId={cadastro.qualidade_corpo_id}
        onOrixaChange={(id) => setCadastroField('orixa_corpo_id', id)}
        onQualidadeChange={(id) => setCadastroField('qualidade_corpo_id', id)}
        placeholderOrixaNome={nomeOrixaParaPlaceholder(orixas, cadastro.orixa_corpo_id, 'Orixá corpo')}
        rezaValue={cadastro.orixa_corpo_reza}
        onRezaChange={(v) => setCadastroField('orixa_corpo_reza', v)}
      />
      <OrixaQualidadePair
        label="Orixá Passagem"
        orixas={orixas}
        orixaId={cadastro.orixa_caminho_id}
        qualidadeId={cadastro.qualidade_caminho_id}
        onOrixaChange={(id) => setCadastroField('orixa_caminho_id', id)}
        onQualidadeChange={(id) => setCadastroField('qualidade_caminho_id', id)}
        placeholderOrixaNome={nomeOrixaParaPlaceholder(orixas, cadastro.orixa_caminho_id, 'Orixá caminho')}
        rezaValue={cadastro.orixa_caminho_reza}
        onRezaChange={(v) => setCadastroField('orixa_caminho_reza', v)}
      />
      <OrixaQualidadePair
        label="Orixá Saída"
        orixas={orixas}
        orixaId={cadastro.orixa_passagem_id}
        qualidadeId={cadastro.qualidade_passagem_id}
        onOrixaChange={(id) => setCadastroField('orixa_passagem_id', id)}
        onQualidadeChange={(id) => setCadastroField('qualidade_passagem_id', id)}
        placeholderOrixaNome={nomeOrixaParaPlaceholder(orixas, cadastro.orixa_passagem_id, 'Orixá passagem')}
        rezaValue={cadastro.orixa_passagem_reza}
        onRezaChange={(v) => setCadastroField('orixa_passagem_reza', v)}
      />
    </section>
  );
}
