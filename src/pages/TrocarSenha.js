import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import {
  isPasswordChangeRequired,
  markPasswordChangeCompleted,
} from '../services/passwordChangeRequired.ts';
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
    return 'Sessao invalida. Faca login novamente.';
  }
  if (msg.includes('network request failed') || msg.includes('failed to fetch')) {
    return 'Falha de conexao. Verifique sua internet e tente novamente.';
  }

  return 'Nao foi possivel atualizar a senha agora. Tente novamente em instantes.';
}

const TrocarSenha = () => {
  const navigate = useNavigate();
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmacaoSenha, setConfirmacaoSenha] = useState('');
  const [mostrarNovaSenha, setMostrarNovaSenha] = useState(false);
  const [mostrarConfirmacaoSenha, setMostrarConfirmacaoSenha] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [userId, setUserId] = useState(null);

  useEffect(() => {
    let mounted = true;

    (async () => {
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      if (!session?.user) {
        if (mounted) navigate('/login', { replace: true });
        return;
      }

      try {
        const required = await isPasswordChangeRequired(session.user.id);
        if (!mounted) return;
        if (!required) {
          navigate('/dashboard', { replace: true });
          return;
        }
        setUserId(session.user.id);
        setChecking(false);
      } catch {
        if (mounted) {
          setError('Nao foi possivel verificar a exigencia de troca de senha.');
          setChecking(false);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, [navigate]);

  const handleUpdatePassword = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');

    if (!userId) {
      setError('Sessao invalida. Faca login novamente.');
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

    try {
      await markPasswordChangeCompleted(userId);
    } catch {
      setError('Senha atualizada, mas nao foi possivel concluir o registro. Tente entrar novamente.');
      setLoading(false);
      return;
    }

    setMessage('Senha atualizada com sucesso. Abrindo a dashboard...');
    setLoading(false);
    // Depois da troca: dashboard (e tutorial automático, se ainda pendente).
    navigate('/dashboard', { replace: true });
  };

  if (checking) {
    return (
      <section className="auth-page">
        <div className="auth-card">
          <p>Verificando...</p>
        </div>
      </section>
    );
  }

  return (
    <section className="auth-page">
      <form className="auth-card" onSubmit={handleUpdatePassword}>
        <h1 className="auth-card__title">Troca de senha obrigatoria</h1>
        <p>Por seguranca, defina uma nova senha antes de continuar.</p>

        <label htmlFor="nova-senha">Nova senha</label>
        <div className="auth-password-row">
          <input
            id="nova-senha"
            type={mostrarNovaSenha ? 'text' : 'password'}
            value={novaSenha}
            onChange={(e) => setNovaSenha(e.target.value)}
            placeholder="Nova senha"
            required
            autoComplete="new-password"
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
            autoComplete="new-password"
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
          {loading ? 'Salvando...' : 'Atualizar senha'}
        </button>

        {message && <p className="auth-message">{message}</p>}
        {error && <p className="auth-error">{error}</p>}
      </form>
    </section>
  );
};

export default TrocarSenha;
