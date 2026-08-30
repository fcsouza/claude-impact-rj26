import { redirect } from 'next/navigation';
import { MenuLateral } from '@/components/menu-lateral';
import { NavLink } from '@/components/navlink';
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
  const { total, unidades } = await api<{ total: number; unidades: Unidade[] }>(
    `/api/fila/unidades?limite=${LIMITE_LATERAL}`
  ).catch(() => ({ total: 0, unidades: [] }));
  // Quem responde pela rede não opera unidade: oito nomes truncados só empurram
  // a navegação real para baixo. A CRE e a Secretaria chegam às unidades pelo painel.
  const listarUnidades = usuario.papel === 'unidade' || total <= LIMITE_LATERAL;

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

        <MenuLateral>
          <nav className="sidebar-nav">
            {listarUnidades ? (
              <>
                <span className="navgrupo">Operação</span>
                {unidades.map((u) => (
                  <NavLink href={`/fila/${u.escCodigo}`} key={u.escCodigo}>
                    <span>{u.nome.length > 22 ? `${u.nome.slice(0, 22)}…` : u.nome}</span>
                    <span className="conta">{u.escCodigo}</span>
                  </NavLink>
                ))}
              </>
            ) : null}

            {listarUnidades && total > unidades.length ? (
              <span className="navlink" style={{ color: 'var(--fv-text-on-ink-3)' }}>
                e mais {total - unidades.length} unidades
              </span>
            ) : null}

            {usuario.papel === 'unidade' && usuario.unidadeId ? (
              <NavLink href={`/unidade/${usuario.unidadeId}`}>
                <span>Meu dia</span>
              </NavLink>
            ) : null}

            {usuario.papel === 'cre' || usuario.papel === 'secretaria' ? (
              <>
                <span className="navgrupo">Coordenadoria</span>
                <NavLink href="/painel">
                  <span>Painel de gargalos</span>
                </NavLink>
                <NavLink href="/auditoria">
                  <span>Auditoria</span>
                </NavLink>
              </>
            ) : null}

            {usuario.papel === 'secretaria' ? (
              <>
                <span className="navgrupo">Secretaria</span>
                <NavLink href="/secretaria">
                  <span>Visão da rede</span>
                </NavLink>
              </>
            ) : null}

            <span className="navgrupo">Registro</span>
            <NavLink href="/regua">
              <span>Régua de pontuação</span>
            </NavLink>
          </nav>

          <div className="usuario">
            <span className="avatar">{iniciais}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ font: 'var(--fv-text-row)' }}>{usuario.name}</div>
              <div className="conta">{rotuloPapel(usuario.papel, usuario.creId)}</div>
            </div>
            <SairBotao />
          </div>
        </MenuLateral>
      </aside>

      <main className="conteudo">{children}</main>
    </div>
  );
}
