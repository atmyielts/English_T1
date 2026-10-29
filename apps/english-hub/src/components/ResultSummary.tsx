import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AskSchoodAI } from '../../../../packages/schood-ai-link/src/index.tsx';
import { useI18n, useT } from '../i18n';
import { useL1Library } from '../lib/l1';
import type { SkillKey } from '../lib/skills';
import { ScoreBadge } from '../ui/kit';
import { L1NoteBody } from './L1Why';
import { UpNextCard } from './UpNext';
import { XpEarned } from './XpWidgets';
import { DefaultResultShare, type ResultShareInfo } from './resultShare';
import './glue.css';

export type { ResultShareInfo } from './resultShare';

/** The mistake that matters most in this result; its first-language note is shown when one matches. */
export type MainMistake = {
  original?: string | null;
  corrected?: string | null;
  explanation?: string | null;
  topic?: string | null;
  /** A note id the server already matched. */
  noteId?: string | null;
};

const headingKey = (speakers: string): string => (speakers === 'ru' ? 'l1.why.ru' : speakers === 'uz' ? 'l1.why.uz' : 'l1.why.both');

/** "Why this happens for Russian/Uzbek speakers" for the main mistake, open by default. Nothing when no note matches. */
const MainMistakeNote = ({ mistake }: { mistake: MainMistake }) => {
  const t = useT();
  const { locale } = useI18n();
  const library = useL1Library();
  if (!library) return null;
  const note = mistake.noteId
    ? library.l1NoteById(mistake.noteId)
    : library.matchL1Notes({ original: mistake.original, corrected: mistake.corrected, explanation: mistake.explanation, topic: mistake.topic })[0] ?? null;
  if (!note) return null;
  return (
    <div className="en-result-l1">
      <p className="en-result-label">{t('glue.result.mainMistake')}</p>
      {mistake.original && mistake.corrected ? (
        <p className="en-diff" lang="en"><del>{mistake.original}</del> <span aria-hidden="true">→</span> <ins>{mistake.corrected}</ins></p>
      ) : null}
      <strong>{t(headingKey(note.speakers))}: {note.title[locale]}</strong>
      <L1NoteBody note={note} />
    </div>
  );
};

/**
 * The one result summary used everywhere a learner finishes something:
 * activities in every skill (through ResultPanel), role-plays, the speaking
 * mock, the progress check and review sessions. Same order every time:
 * score, what it means, XP earned, what was saved for review, the
 * first-language note for the main mistake, the screen's own details
 * (`children`), the share slot, Up next, then the screen's actions.
 */
export const ResultSummary = ({
  title,
  score,
  scoreSlot,
  summary,
  xp,
  saved,
  mainMistake,
  share,
  shareSlot,
  upNext,
  children,
  actions,
  headless = false,
}: {
  title?: ReactNode;
  /** 0..100, shown as the score badge. */
  score?: number | null;
  /** A different headline figure (an IELTS band, a level) instead of the badge. */
  scoreSlot?: ReactNode;
  summary?: ReactNode;
  /** XP for an activity just saved (looked up on the server), or a known amount. */
  xp?: { skill: SkillKey; slug?: string | null } | { amount: number } | null;
  saved?: { words?: number; mistakes?: number; questions?: number };
  mainMistake?: MainMistake | null;
  share?: ResultShareInfo | null;
  /** Replaces the default share slot for this screen. */
  shareSlot?: ReactNode;
  /** The best next step across all skills; false to leave it out. */
  upNext?: { skill: SkillKey; slug?: string | null } | false;
  children?: ReactNode;
  actions?: ReactNode;
  /** The screen already shows its own headline (the progress check): only the shared parts below it. */
  headless?: boolean;
}) => {
  const t = useT();
  const savedLines = [
    saved?.words ? t('activity.result.savedWords', { count: saved.words }) : null,
    saved?.questions ? t('glue.result.savedQuestions', { count: saved.questions }) : null,
    saved?.mistakes ? t('glue.result.savedMistakes', { count: saved.mistakes }) : null,
  ].filter((line): line is string => Boolean(line));
  const shareContent = shareSlot ?? (share ? <DefaultResultShare info={share} /> : null);

  return (
    <div className="en-result-summary">
      {headless ? null : <div className="en-result">
        {scoreSlot ?? (typeof score === 'number' ? <ScoreBadge score={score} /> : null)}
        <div className="en-stack" style={{ gap: '.5rem' }}>
          <h2 style={{ margin: 0 }}>{title ?? t('activity.result.title')}</h2>
          {summary ? <p style={{ margin: 0 }}>{summary}</p> : null}
          {xp && 'skill' in xp ? <XpEarned skill={xp.skill} slug={xp.slug} /> : null}
          {xp && 'amount' in xp && xp.amount > 0 ? (
            <p className="en-xp-earned"><span className="en-xp-pill">{t('xp.result.gain', { xp: xp.amount })}</span></p>
          ) : null}
          {savedLines.length ? (
            <p className="en-notice en-result-saved">
              {savedLines.join(' ')} <Link to="/review">{t('glue.result.openReview')}</Link>
            </p>
          ) : null}
        </div>
      </div>}
      {mainMistake && (mainMistake.noteId || mainMistake.original || mainMistake.topic) ? <MainMistakeNote mistake={mainMistake} /> : null}
      {children}
      {shareContent ? <div className="en-result-share">{shareContent}</div> : null}
      {upNext ? <UpNextCard skill={upNext.skill} slug={upNext.slug} /> : null}
      {actions ? <div className="en-actions">{actions}</div> : null}
      <p className="en-ask-ai"><AskSchoodAI source="english"/></p>
    </div>
  );
};
