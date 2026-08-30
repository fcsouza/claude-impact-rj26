'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/** Link da barra lateral que se marca sozinho quando é a tela aberta. */
export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const caminho = usePathname();
  const atual = caminho === href || caminho.startsWith(`${href}/`);

  return (
    <Link aria-current={atual ? 'page' : undefined} className="navlink" href={href}>
      {children}
    </Link>
  );
}
