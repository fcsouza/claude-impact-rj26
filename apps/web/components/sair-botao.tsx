'use client';

import { useRouter } from 'next/navigation';
import { signOut } from '@/lib/auth-client';

export function SairBotao() {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        await signOut();
        router.push('/login');
        router.refresh();
      }}
      style={{
        background: 'none',
        border: 'none',
        color: 'var(--fv-text-on-ink-3)',
        cursor: 'pointer',
        font: 'var(--fv-text-id)',
        marginLeft: 'auto',
      }}
      type="button"
    >
      sair
    </button>
  );
}
