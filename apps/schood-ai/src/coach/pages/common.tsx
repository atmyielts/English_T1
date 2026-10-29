import { useEffect, useState } from 'react';
import { Link2, LogIn, Send } from 'lucide-react';
import { Button, ButtonLink, Card, Link, signInUrl, useT } from '../../core/index.ts';
import { insideTelegram, onTelegramLink, openOutside, telegramLink } from '../telegram.ts';

// What a coach page shows to someone who is not signed in: on the web, sign in;
// inside Telegram, link the Schood account (one account for the web and every bot).

export function useTelegramLink() {
  const [state, setState] = useState(telegramLink());
  useEffect(() => onTelegramLink(() => setState(telegramLink())), []);
  return state;
}

export function SignedOut({ pack }: { pack?: string }) {
  const t = useT(), link = useTelegramLink();
  if (insideTelegram()) {
    if (link.state === 'failed') return <Card><h2 className="m-0 font-display text-xl font-bold">{t('coach.signin.failedTitle')}</h2><p className="mb-0 text-sm text-gray-700">{t(link.code === 'session_unavailable' ? 'coach.signin.useWeb' : 'coach.signin.failed')}</p></Card>;
    return <Card className="flex flex-col gap-3">
      <h2 className="m-0 font-display text-xl font-bold">{t('coach.link.title')}</h2>
      <p className="m-0 text-sm leading-6 text-gray-700">{t('coach.link.lead')}</p>
      {link.linkUrl && <Button onClick={() => openOutside(link.linkUrl!)} icon={<Link2 size={16} aria-hidden="true"/>}>{t('coach.link.open')}</Button>}
      {pack && <Link to={`/coach/${pack}/samples`} className="text-sm font-semibold text-gray-900 underline underline-offset-2">{t('coach.samples.see')}</Link>}
    </Card>;
  }
  return <Card className="flex flex-col gap-3">
    <h2 className="m-0 font-display text-xl font-bold">{t('coach.signin.title')}</h2>
    <p className="m-0 text-sm leading-6 text-gray-700">{t('coach.signin.lead')}</p>
    <div className="flex flex-wrap gap-2">
      <ButtonLink href={signInUrl()}><LogIn size={16} aria-hidden="true"/>{t('coach.signin.button')}</ButtonLink>
      {pack && <Link to={`/coach/${pack}/samples`} className="inline-flex min-h-11 items-center rounded-full border border-navy-line bg-white px-4 text-sm font-semibold text-gray-900 no-underline">{t('coach.samples.see')}</Link>}
    </div>
  </Card>;
}

/** "Open the coach in Telegram", where the practice happens. */
export function OpenBot({ bot, label }: { bot: string | null; label?: string }) {
  const t = useT();
  if (!bot) return <p className="m-0 text-sm text-gray-600">{t('coach.bot.soon')}</p>;
  return <Button variant="spark" onClick={() => openOutside(bot)} icon={<Send size={16} aria-hidden="true"/>}>{label ?? t('coach.bot.open')}</Button>;
}
