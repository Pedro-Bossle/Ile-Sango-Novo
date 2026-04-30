import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import './Auth.css';

function getMensagemErroAuth(errorMessage) {
  const msg = (errorMessage || '').toLowerCase();

  if (msg.includes('same password')) {
    return 'A nova senha nao pode ser igual a senha atual.';
  }
  if (msg.includes('password should be at least')) {
    return 'A senha deve ter no minimo 6 caracteres.';
  }
  if (msg.includes('session not found') || msg.includes('jwt')) {
    return 'Sessao de recuperacao invalida. Abra novamente o link recebido por email.';
  }
  if (msg.includes('network request failed')) {
    return 'Falha de conexao. Verifique sua internet e tente novamente.';
  }

  return 'Nao foi possivel atualizar a senha agora. Tente novamente em instantes.';
}

const RedefinirSenha = () => {
  const navigate = useNavigate();
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmacaoSenha, setConfirmacaoSenha] = useState('');
  const [mostrarNovaSenha, setMostrarNovaSenha] = useState(false);
  const [mostrarConfirmacaoSenha, setMostrarConfirmacaoSenha] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [authFlowType, setAuthFlowType] = useState('recovery');

  useEffect(() => {
    let mounted = true;

    async function prepareRecoverySession() {
      setError('');
      const currentUrl = new URL(window.location.href);
      const code = currentUrl.searchParams.get('code');
      const queryType = currentUrl.searchParams.get('type');
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const hashType = hashParams.get('type');
      const flowType = queryType || hashType || '';
      const isAllowedAuthFlow = flowType === 'recovery' || flowType === 'invite';
      const hasExplicitDisallowedType = Boolean(flowType) && !isAllowedAuthFlow;
      const hasRecoveryLikeSignal = Boolean(code) || isAllowedAuthFlow;

      if (hasExplicitDisallowedType || !hasRecoveryLikeSignal) {
        if (mounted) {
          setError('Link de redefinicao invalido ou expirado. Solicite outro email.');
          setReady(false);
        }
        return;
      }

      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) {
          if (mounted) {
            setError('Link de redefinicao invalido ou expirado. Solicite outro email.');
            setReady(false);
          }
          return;
        }
      }

      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        if (mounted) {
          setError('Sessao de recuperacao nao encontrada. Abra o link recebido por email novamente.');
          setReady(false);
        }
        return;
      }

      if (mounted) {
        setAuthFlowType(flowType === 'invite' ? 'invite' : 'recovery');
        setReady(true);
      }
    }

    prepareRecoverySession();
    return () => {
      mounted = false;
    };
  }, []);

  const handleUpdatePassword = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    if (!ready) {
      setError('Link de redefinicao invalido ou expirado.');
      return;
    }

    if (novaSenha.length < 6) {
      setError('A nova senha deve ter no minimo 6 caracteres.');
      return;
    }

    if (novaSenha !== confirmacaoSenha) {
      setError('A confirmacao de senha nao confere.');
      return;
    }

    setLoading(true);

    const { error: updateError } = await supabase.auth.updateUser({
      password: novaSenha,
    });

    if (updateError) {
      setError(getMensagemErroAuth(updateError.message));
      setLoading(false);
      return;
    }

    setMessage(
      authFlowType === 'invite'
        ? 'Convite aceito com sucesso. Sua senha foi cadastrada e voce ja pode fazer login.'
        : 'Senha atualizada com sucesso. Voce ja pode fazer login.'
    );
    setLoading(false);
    setTimeout(() => navigate('/login'), 1200);
  };

  return (
    <section className="auth-page">
      <form className="auth-card" onSubmit={handleUpdatePassword}>
        <h2>{authFlowType === 'invite' ? 'Aceitar convite' : 'Redefinir senha'}</h2>
        <p>
          {authFlowType === 'invite'
            ? 'Defina sua senha para concluir o acesso ao sistema.'
            : 'Digite sua nova senha para concluir.'}
        </p>

        <label htmlFor="nova-senha">Nova senha</label>
        <div className="auth-password-row">
          <input
            id="nova-senha"
            type={mostrarNovaSenha ? 'text' : 'password'}
            value={novaSenha}
            onChange={(e) => setNovaSenha(e.target.value)}
            placeholder="Nova senha"
            required
          />
          <button
            className="auth-toggle-button"
            type="button"
            onClick={() => setMostrarNovaSenha((prev) => !prev)}
            aria-label={mostrarNovaSenha ? 'Ocultar nova senha' : 'Mostrar nova senha'}
            title={mostrarNovaSenha ? 'Ocultar nova senha' : 'Mostrar nova senha'}
          >
            <span aria-hidden="true">{mostrarNovaSenha ? '🙈' : '👁'}</span>
          </button>
        </div>

        <label htmlFor="confirmacao-senha">Confirmar nova senha</label>
        <div className="auth-password-row">
          <input
            id="confirmacao-senha"
            type={mostrarConfirmacaoSenha ? 'text' : 'password'}
            value={confirmacaoSenha}
            onChange={(e) => setConfirmacaoSenha(e.target.value)}
            placeholder="Confirmar nova senha"
            required
          />
          <button
            className="auth-toggle-button"
            type="button"
            onClick={() => setMostrarConfirmacaoSenha((prev) => !prev)}
            aria-label={mostrarConfirmacaoSenha ? 'Ocultar confirmacao de senha' : 'Mostrar confirmacao de senha'}
            title={mostrarConfirmacaoSenha ? 'Ocultar confirmacao de senha' : 'Mostrar confirmacao de senha'}
          >
            <span aria-hidden="true">{mostrarConfirmacaoSenha ? '🙈' : '👁'}</span>
          </button>
        </div>

        <button className="auth-button" type="submit" disabled={loading}>
          {loading ? 'Salvando...' : authFlowType === 'invite' ? 'Cadastrar senha' : 'Atualizar senha'}
        </button>

        {message && <p className="auth-message">{message}</p>}
        {error && <p className="auth-error">{error}</p>}
      </form>
    </section>
  );
};

export default RedefinirSenha;
