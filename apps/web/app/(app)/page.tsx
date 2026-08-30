import { redirect } from 'next/navigation';
import { api, sessaoAtual } from '@/lib/api';

interface Unidade {
  escCodigo: string;
}

export default async function Inicio() {
  const sessao = await sessaoAtual();
  if (!sessao?.user) {
    redirect('/login');
  }
  if (sessao.user.papel === 'secretaria') {
    redirect('/secretaria');
  }
  if (sessao.user.papel === 'cre') {
    redirect('/painel');
  }
  if (sessao.user.unidadeId) {
    redirect(`/unidade/${sessao.user.unidadeId}`);
  }

  const unidades = await api<Unidade[]>('/api/fila/unidades').catch(() => []);
  if (unidades[0]) {
    redirect(`/fila/${unidades[0].escCodigo}`);
  }

  return <p className="vazio">Nenhuma unidade vinculada a este usuário.</p>;
}
