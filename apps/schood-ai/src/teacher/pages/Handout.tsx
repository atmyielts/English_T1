import { useEffect, useState } from 'react';
import { LogIn, Printer } from 'lucide-react';
import type { Material } from '../../../../../packages/ai-core/src/materials/mod.ts';
import { ApiErrorState, BrandMark, Button, ButtonLink, LoadingState, signInUrl, useSession, useT } from '../../core/index.ts';
import { getHandout } from '../api.ts';
import { MaterialView } from '../MaterialView.tsx';

// A student's handout: the student version of an approved material, opened from the
// link in a Homework OS assignment or shared by the teacher. Students sign in with
// their Schood account; the link is the permission, and it never shows the key.

export default function HandoutPage({ params }: { params: Record<string, string> }) {
  const t = useT(), session = useSession();
  const [data, setData] = useState<{ material: Material; workspace: { name: string | null; branding: { logo_url: string | null; primary_color: string | null } } | null } | null>(null);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => { if (session.status === 'signed_in') getHandout(params.token).then(setData).catch(setError); }, [params.token, session.status]);
  if (session.status === 'loading') return <LoadingState/>;
  if (session.status !== 'signed_in') return <section className="mx-auto grid max-w-md gap-4 rounded-3xl border border-navy-line bg-white p-6 text-center">
    <h1 className="m-0 font-display text-2xl font-bold">{t('teacher.handout.title')}</h1>
    <p className="m-0 text-sm text-gray-700">{t('teacher.handout.signIn')}</p>
    <ButtonLink href={signInUrl()}><LogIn size={16} aria-hidden="true"/>{t('teacher.play.signInButton')}</ButtonLink>
  </section>;
  if (error) return <ApiErrorState error={error}/>;
  if (!data) return <LoadingState/>;
  const name = data.workspace?.name ?? 'Schood AI', color = data.workspace?.branding.primary_color ?? '#0f172a';
  return <article className="mx-auto max-w-3xl">
    <div className="print-hidden mb-3 flex justify-end"><Button variant="secondary" onClick={() => print()} icon={<Printer size={16} aria-hidden="true"/>}>{t('teacher.print.button')}</Button></div>
    <div className="print-sheet rounded-3xl border border-navy-line bg-white p-5 md:p-8 print:border-0 print:p-0">
      <header className="mb-4 flex items-center gap-3 border-b-2 pb-3" style={{ borderColor: color }}>
        <BrandMark name={name} logo={data.workspace?.branding.logo_url ?? null} color={color} size={36}/><span className="font-display font-bold" style={{ color }}>{name}</span>
      </header>
      <h1 className="m-0 mb-4 font-display text-2xl font-bold">{data.material.title}</h1>
      <MaterialView material={data.material} mode="student"/>
    </div>
  </article>;
}
