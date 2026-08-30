import Link from 'next/link';
import { redirect } from 'next/navigation';
import { SairBotao } from '@/components/sair-botao';
import { api, sessaoAtual } from '@/lib/api';

interface Unidade {
  bairro: string | null;
  creId: number | null;
  escCodigo: string;
  nome: string;
}

const LIMITE_LATERAL = 8;

function rotuloPapel(papel: string | undefined, creId: number | undefined) {
  if (papel === 'secretaria') {
    return 'SME · rede';
  }
  return papel === 'cre' ? `CRE ${creId ?? ''}` : 'unidade';
}

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const sessao = await sessaoAtual();
  if (!sessao?.user) {
    redirect('/login');
  }

  const usuario = sessao.user;
  const unidades = await api<Unidade[]>('/api/fila/unidades').catch(() => []);
  const iniciais = usuario.name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="orgao">Prefeitura do Rio de Janeiro</span>
          <span className="nome">Fila Viva</span>
          <span className="sub">SME · convocação de creche</span>
        </div>

        <span className="navgrupo">Operação</span>
        {unidades.slice(0, LIMITE_LATERAL).map((u) => (
          <Link className="navlink" href={`/fila/${u.escCodigo}`} key={u.escCodigo}>
            <span>{u.nome.length > 22 ? `${u.nome.slice(0, 22)}…` : u.nome}</span>
            <span className="conta">{u.escCodigo}</span>
          </Link>
        ))}

        {unidades.length > LIMITE_LATERAL ? (
          <span className="navlink" style={{ color: 'var(--fv-text-on-ink-3)' }}>
            e mais {unidades.length - LIMITE_LATERAL} unidades
          </span>
        ) : null}

        {usuario.papel === 'unidade' && usuario.unidadeId ? (
          <Link className="navlink" href={`/unidade/${usuario.unidadeId}`}>
            <span>Meu dia</span>
          </Link>
        ) : null}

        {usuario.papel === 'cre' || usuario.papel === 'secretaria' ? (
          <>
            <span className="navgrupo">Coordenadoria</span>
            <Link className="navlink" href="/painel">
              <span>Painel de gargalos</span>
            </Link>
            <Link className="navlink" href="/auditoria">
              <span>Auditoria</span>
            </Link>
          </>
        ) : null}

        {usuario.papel === 'secretaria' ? (
          <>
            <span className="navgrupo">Secretaria</span>
            <Link className="navlink" href="/secretaria">
              <span>Visão da rede</span>
            </Link>
          </>
        ) : null}

        <span className="navgrupo">Registro</span>
        <Link className="navlink" href="/regua">
          <span>Régua de pontuação</span>
        </Link>

        <div className="usuario">
          <span className="avatar">{iniciais}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ font: 'var(--fv-text-row)' }}>{usuario.name}</div>
            <div className="conta">{rotuloPapel(usuario.papel, usuario.creId)}</div>
          </div>
          <SairBotao />
        </div>
      </aside>

      <main className="conteudo">{children}</main>
    </div>
  );
}
