import type { ReactNode } from 'react';
import type { SkillKey } from '../lib/skills';
import { useT } from '../i18n';
import { ShareCardButton } from './ShareCardButton';

/**
 * What a finished result can share: enough for a share button to build its
 * text or card. Every result screen passes one to <ResultSummary share={...}>.
 */
export type ResultShareInfo = {
  kind: 'activity' | 'roleplay' | 'mock' | 'check' | 'review';
  skill?: SkillKey | null;
  slug?: string | null;
  title?: string | null;
  /** 0..100 */
  score?: number | null;
  /** IELTS band (speaking mock). */
  band?: number | null;
  /** CEFR level (progress check). */
  level?: string | null;
};

/**
 * The share slot on every result screen. It renders nothing today: a share
 * feature fills it HERE, once, and the button appears on every result
 * (activities in all seven skills, role-plays, the speaking mock, the
 * progress check and review sessions). A screen can also pass its own
 * `shareSlot` to <ResultSummary> to replace it.
 */
export const DefaultResultShare = ({ info }: { info: ResultShareInfo }): ReactNode => {
  const t = useT();
  // A speaking mock band is worth a card; other results share from their own moments
  // (level-up, certificate, streak, league, duel, monthly check).
  if (info.kind !== 'mock' || typeof info.band !== 'number') return null;
  const band = info.band.toFixed(1);
  return (
    <ShareCardButton
      card={{ kind: 'exam', label: t('social.card.exam.label'), big: band, headline: t('social.card.mock.headline', { band }), detail: t('social.card.exam.detail') }}
    />
  );
};
