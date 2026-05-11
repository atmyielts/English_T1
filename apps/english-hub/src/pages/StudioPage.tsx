import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { GrammarDecoderCard, VocabInContextCard } from '../components/AIFeatureCards';
import { EssayGraderCard, IdiomExplorerCard, TranslationCompareCard } from '../components/AIIter3Cards';
import { CulturalNotesCard, DailyChallengeCard, DictationDrillCard } from '../components/AIIter4Cards';
import { GoalTemplateCard, RubricCalibrationCard, ThemedWeekCard } from '../components/AIIter5Cards';
import { ContentRecommendCard, PlacementTestCard, ShadowingPracticeCard } from '../components/AIIter6Cards';
import { PronunciationDrillCard, TutorCard } from '../components/AIIter7Cards';
import { VoiceConversationCard } from '../components/AIIter8Cards';

interface Props {
  accessToken: string;
}

type TabKey = 'tutor' | 'diagnose' | 'plan' | 'practice' | 'discover';

const TABS: Array<{
  key: TabKey;
  label: string;
  blurb: string;
  ariaLabel: string;
}> = [
  { key: 'tutor', label: 'Tutor', ariaLabel: 'Tutor', blurb: 'Live conversation, voice + text' },
  { key: 'diagnose', label: 'Diagnose', ariaLabel: 'Diagnose', blurb: 'Find your level + your gaps' },
  { key: 'plan', label: 'Plan', ariaLabel: 'Plan', blurb: 'Decide what to do next' },
  { key: 'practice', label: 'Practice', ariaLabel: 'Practice', blurb: 'Drills calibrated to you' },
  { key: 'discover', label: 'Discover', ariaLabel: 'Discover', blurb: 'Real content, idioms, culture' },
];

const isTabKey = (v: string): v is TabKey => TABS.some((t) => t.key === v);

export const StudioPage = ({ accessToken }: Props) => {
  const location = useLocation();
  const navigate = useNavigate();

  const initialTab = useMemo<TabKey>(() => {
    const fromHash = location.hash.replace('#', '');
    return isTabKey(fromHash) ? fromHash : 'tutor';
  }, [location.hash]);

  const [tab, setTab] = useState<TabKey>(initialTab);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  const switchTab = (next: TabKey) => {
    setTab(next);
    navigate({ pathname: '/studio', hash: `#${next}` }, { replace: true });
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="studio-page">
      <section className="frame studio-hero">
        <p className="kicker">AI Studio</p>
        <h1 style={{ margin: 0, fontFamily: 'Outfit, sans-serif', fontSize: 'clamp(28px, 3.4vw, 42px)', lineHeight: 1.05 }}>
          Every English AI tool, organised by what you're trying to do.
        </h1>
        <p style={{ margin: 0, color: 'var(--ink-700)', maxWidth: '60ch', lineHeight: 1.55 }}>
          Pick a phase. Each tab groups the AI features that share a goal — so you don't scroll past
          eighteen cards looking for the one you actually need.
        </p>
      </section>

      <nav className="frame studio-tabs" aria-label="AI studio sections">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`studio-tab${tab === t.key ? ' is-active' : ''}`}
            onClick={() => switchTab(t.key)}
            aria-current={tab === t.key ? 'page' : undefined}
          >
            <span>{t.label}</span>
            <small>{t.blurb}</small>
          </button>
        ))}
      </nav>

      {tab === 'tutor' ? (
        <section className="studio-section">
          <TutorCard accessToken={accessToken} />
          <VoiceConversationCard accessToken={accessToken} />
        </section>
      ) : null}

      {tab === 'diagnose' ? (
        <section className="studio-section">
          <PlacementTestCard accessToken={accessToken} />
          <PronunciationDrillCard accessToken={accessToken} />
          <EssayGraderCard accessToken={accessToken} />
          <GrammarDecoderCard accessToken={accessToken} />
        </section>
      ) : null}

      {tab === 'plan' ? (
        <section className="studio-section">
          <GoalTemplateCard accessToken={accessToken} />
          <ThemedWeekCard accessToken={accessToken} />
          <DailyChallengeCard accessToken={accessToken} />
          <RubricCalibrationCard accessToken={accessToken} />
        </section>
      ) : null}

      {tab === 'practice' ? (
        <section className="studio-section">
          <DictationDrillCard accessToken={accessToken} />
          <ShadowingPracticeCard accessToken={accessToken} />
          <VocabInContextCard accessToken={accessToken} />
          <IdiomExplorerCard accessToken={accessToken} />
        </section>
      ) : null}

      {tab === 'discover' ? (
        <section className="studio-section">
          <ContentRecommendCard accessToken={accessToken} />
          <TranslationCompareCard accessToken={accessToken} />
          <CulturalNotesCard accessToken={accessToken} />
        </section>
      ) : null}
    </div>
  );
};
