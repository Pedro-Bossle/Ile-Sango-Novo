import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import './Auth.css';

function getMensagemErroAuth(errorMessage) {
  const msg = (errorMessage || '').toLowerCase();

  if (msg.includes('invalid login credentials')) {
    return 'Email ou senha invalidos. Confira os dados e tente novamente.';
  }
  if (msg.includes('email not confirmed')) {
    return 'Seu email ainda nao foi confirmado.';
  }
  if (msg.includes('too many requests')) {
    return 'Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.';
  }
  if (msg.includes('email rate limit exceeded')) {
    return 'Voce atingiu o limite de envios de email. Tente novamente em alguns minutos.';
  }
  if (msg.includes('network request failed')) {
    return 'Falha de conexao. Verifique sua internet e tente novamente.';
  }

  return 'Nao foi possivel concluir a acao agora. Tente novamente em instantes.';
}

const Login = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleLogin = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    const normalizedEmail = email.trim().toLowerCase();
    const { error: loginError } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password: senha,
    });

    if (loginError) {
      setError(getMensagemErroAuth(loginError.message));
      setLoading(false);
      return;
    }

    setMessage('Login realizado com sucesso.');
    setLoading(false);
    navigate('/dashboard');
  };

  const handleForgotPassword = async () => {
    setError('');
    setMessage('');

    if (!email.trim()) {
      setError('Informe seu email para receber o link de redefinicao.');
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo: `${window.location.origin}/redefinir-senha`,
    });

    if (resetError) {
      setError(getMensagemErroAuth(resetError.message));
      return;
    }

    setMessage('Enviamos um link de redefinicao de senha para seu email.');
  };

  return (
    <section className="auth-page">
      <form className="auth-card" onSubmit={handleLogin}>
        <h2>Area Restrita</h2>
        <p>Entre com seu email e senha.</p>

        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="seuemail@dominio.com"
          required
        />

        <label htmlFor="senha">Senha</label>
        <div className="auth-password-row">
          <input
            id="senha"
            type={mostrarSenha ? 'text' : 'password'}
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            placeholder="Digite sua senha"
            required
          />
          <button
            className="auth-toggle-button"
            type="button"
            onClick={() => setMostrarSenha((prev) => !prev)}
            aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
            title={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
          >
            <span aria-hidden="true">{mostrarSenha ? '🙈' : '👁'}</span>
          </button>
        </div>

        <button className="auth-button" type="submit" disabled={loading}>
          {loading ? 'Entrando...' : 'Entrar'}
        </button>

        <button className="auth-link-button" type="button" onClick={handleForgotPassword}>
          Esqueci a senha
        </button>

        {message && <p className="auth-message">{message}</p>}
        {error && <p className="auth-error">{error}</p>}
      </form>
    </section>
  );
};

export default Login;
