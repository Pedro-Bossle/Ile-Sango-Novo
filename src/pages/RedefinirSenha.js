import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { markPasswordChangeCompleted, rememberPasswordChangedLocally } from '../services/passwordChangeRequired.ts';
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

function limparParamsAuthDaUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete('code');
  url.searchParams.delete('type');
  url.hash = '';
  window.history.replaceState({}, document.title, `${url.pathname}${url.search}`);
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
      const accessToken = hashParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token');
      const flowType = queryType || hashType || '';
      const hasExplicitDisallowedType = Boolean(flowType) && flowType !== 'recovery' && flowType !== 'invite';

      if (hasExplicitDisallowedType) {
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
      } else if (accessToken && refreshToken) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (sessionError) {
          if (mounted) {
            setError('Link de redefinicao invalido ou expirado. Solicite outro email.');
            setReady(false);
          }
          return;
        }
      }

      // O cliente Supabase pode ter consumido o hash antes deste efeito correr.
      // Nesse caso ainda há sessão válida mesmo sem type/code na URL.
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        if (mounted) {
          setError('Sessao de recuperacao nao encontrada. Abra o link recebido por email novamente.');
          setReady(false);
        }
        return;
      }

      limparParamsAuthDaUrl();

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

    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id ?? null;

    const { error: updateError } = await supabase.auth.updateUser({
      password: novaSenha,
    });

    if (updateError) {
      setError(getMensagemErroAuth(updateError.message));
      setLoading(false);
      return;
    }

    if (userId) {
      rememberPasswordChangedLocally(userId);
      try {
        await markPasswordChangeCompleted(userId);
      } catch {
        /* a senha já foi atualizada; o flag local evita bloqueio no próximo login */
      }
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

        <button className="auth-button" type="submit" disabled={loading || !ready}>
          {loading ? 'Salvando...' : authFlowType === 'invite' ? 'Cadastrar senha' : 'Atualizar senha'}
        </button>

        {message && <p className="auth-message">{message}</p>}
        {error && <p className="auth-error">{error}</p>}
      </form>
    </section>
  );
};

export default RedefinirSenha;
