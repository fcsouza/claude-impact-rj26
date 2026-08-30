'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { signIn } from '@/lib/auth-client';

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const mudarEmail = (e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value);
  const mudarSenha = (e: React.ChangeEvent<HTMLInputElement>) => setSenha(e.target.value);

  async function entrar(evento: React.FormEvent) {
    evento.preventDefault();
    setEnviando(true);
    setErro(null);

    const { error } = await signIn.email({ email, password: senha });
    setEnviando(false);

    if (error) {
      setErro('E-mail ou senha não conferem.');
      return;
    }
    router.push('/');
    router.refresh();
  }

  return (
    <main className="login">
      <form className="login-cartao" onSubmit={entrar}>
        <div style={{ marginBottom: 'var(--fv-space-6)' }}>
          <div className="eyebrow" style={{ color: 'var(--fv-primary)' }}>
            Prefeitura do Rio de Janeiro
          </div>
          <h1 style={{ marginTop: 4 }}>Fila Viva</h1>
          <p className="subtitulo">SME · convocação de creche</p>
        </div>

        <div className="campo">
          <label htmlFor="email">E-mail funcional</label>
          <input
            autoComplete="username"
            id="email"
            onChange={mudarEmail}
            required
            type="email"
            value={email}
          />
        </div>

        <div className="campo">
          <label htmlFor="senha">Senha</label>
          <input
            autoComplete="current-password"
            id="senha"
            onChange={mudarSenha}
            required
            type="password"
            value={senha}
          />
        </div>

        {erro ? (
          <p className="erro" style={{ marginTop: 'var(--fv-space-3)' }}>
            {erro}
          </p>
        ) : null}

        <button
          className="botao"
          disabled={enviando}
          style={{ justifyContent: 'center', marginTop: 'var(--fv-space-4)', width: '100%' }}
          type="submit"
        >
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </main>
  );
}
