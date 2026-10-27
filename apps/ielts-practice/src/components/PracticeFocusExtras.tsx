import { useEffect, useState } from 'react';
import { AlarmClock, BookmarkPlus, GraduationCap, Library, Moon, ShieldCheck, Sparkles, TrendingUp } from 'lucide-react';
import {
  practiceScoreImpactGet,
  practiceVocabFromMistakesGet,
  type ScoreImpactResponse,
  type VocabFromMistakesEntry,
} from '../lib/api';
import { formatPracticeLabel } from '../lib/practiceExperience';
import { sectionLabel, useAppT, useFormat, type AppKey } from '../i18n';

// ============================================================
// Pre-test mode banner (T-7 ramp + final-week prep)
// ============================================================
// Activates when target_date is within 7 days. Replaces normal lab
// emphasis with a focused checklist + confidence drills + sleep/
// nutrition prompts. Higher-stakes UX than the regular plan.

interface PreTestProps {
  targetDate: string | null | undefined;
}

const TEST_DAY_CHECKLIST: AppKey[] = ['pre.kit1', 'pre.kit2', 'pre.kit3', 'pre.kit4', 'pre.kit5'];
const T1_ROUTINE: AppKey[] = ['pre.t1.1', 'pre.t1.2', 'pre.t1.3', 'pre.t1.4', 'pre.t1.5'];
const T7_ROUTINE: AppKey[] = ['pre.t7.1', 'pre.t7.2', 'pre.t7.3', 'pre.t7.4', 'pre.t7.5'];

export const PreTestModeBanner = ({ targetDate }: PreTestProps) => {
  const t = useAppT();
  if (!targetDate) return null;
  const days = Math.ceil((new Date(targetDate).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  if (days < 0 || days > 7) return null;
  const headline = days === 0 ? t('pre.today') : days === 1 ? t('pre.tomorrow') : t('pre.days', { count: days });
  const tone = days <= 1 ? '#9b2c2c' : '#b08020';
  const routine = days <= 1 ? T1_ROUTINE : T7_ROUTINE;

  return (
    <section
      className="glass"
      style={{
        padding: 22,
        marginBottom: 20,
        border: `2px solid ${tone}`,
        background: `color-mix(in srgb, ${tone} 5%, white)`,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <p className="eyebrow" style={{ color: tone, margin: 0 }}>
            <AlarmClock size={11} style={{ verticalAlign: -2, marginRight: 4 }} aria-hidden="true" /> {t('pre.eyebrow')}
          </p>
          <h2 style={{ margin: '4px 0 4px', fontFamily: 'Fraunces, serif', fontWeight: 600 }}>
            {headline}
          </h2>
          <p className="muted" style={{ margin: 0 }}>
            {days <= 1 ? t('pre.leadFinal') : t('pre.leadWeek')}
          </p>
        </div>
        <div
          style={{
            padding: '6px 14px',
            borderRadius: 999,
            background: tone,
            color: 'white',
            fontFamily: 'Fraunces, serif',
            fontWeight: 600,
            fontSize: 22,
          }}
        >
          T-{days}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(260px, 100%), 1fr))', gap: 18, marginTop: 18 }}>
        <div>
          <p className="eyebrow" style={{ margin: '0 0 8px', color: tone }}>
            <Moon size={11} style={{ verticalAlign: -2, marginRight: 4 }} />
            {days <= 1 ? t('pre.tonight') : t('pre.week')}
          </p>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 4 }}>
            {routine.map((item, i) => (
              <li key={i} style={{ fontSize: 13.5, lineHeight: 1.5, color: 'var(--ink-2)' }}>
                · {t(item)}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="eyebrow" style={{ margin: '0 0 8px', color: tone }}>
            <ShieldCheck size={11} style={{ verticalAlign: -2, marginRight: 4 }} />
            {t('pre.kit')}
          </p>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 4 }}>
            {TEST_DAY_CHECKLIST.map((item, i) => (
              <li key={i} style={{ fontSize: 13.5, lineHeight: 1.5, color: 'var(--ink-2)' }}>
                ☐ {t(item)}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
};

// ============================================================
// Mock test entry card
// ============================================================
// IELTS Simulator is a separate product. The card says so plainly and shows
// whether the learner's access (per access-effective, which includes bundles
// such as IELTS Complete) covers it, linking to pricing when it does not.

const SIMULATOR_FULL_EXAM_URL = 'https://ielts.schood.online/full-exam?source=practice&mode=mock';

interface MockEntryProps {
  /** null while access is still loading */
  hasSimulatorAccess: boolean | null;
  pricingUrl: string;
}

export const MockTestEntryCard = ({ hasSimulatorAccess, pricingUrl }: MockEntryProps) => {
  const t = useAppT();
  return (
    <section className="glass dash-card" data-testid="full-mock-card">
      <div>
        <p className="eyebrow"><GraduationCap size={11} style={{ verticalAlign: -2, marginRight: 4 }} aria-hidden="true" /> {t('mock.eyebrow')}</p>
        <h3>{t('mock.title')}</h3>
        <p className="muted" style={{ fontSize: 14 }}>{t('mock.lead')}</p>
      </div>
      {hasSimulatorAccess == null ? (
        <span className="access-pill">{t('mock.checking')}</span>
      ) : hasSimulatorAccess ? (
        <>
          <span className="access-pill ok"><ShieldCheck size={12} aria-hidden="true" /> {t('mock.included')}</span>
          <a className="btn solid compact" href={SIMULATOR_FULL_EXAM_URL} style={{ justifySelf: 'start' }}>
            {t('mock.start')} <Sparkles size={14} style={{ marginLeft: 6 }} aria-hidden="true" />
          </a>
        </>
      ) : (
        <>
          <span className="access-pill">{t('mock.notIncluded')}</span>
          <a className="btn solid compact" href={pricingUrl} style={{ justifySelf: 'start' }}>{t('mock.plans')}</a>
        </>
      )}
    </section>
  );
};

// ============================================================
// Vocabulary from mistakes card
// ============================================================

interface VocabSurfaceProps {
  accessToken: string | null;
}

const VOCABULARY_APP_URL = 'https://vocabulary.english.schood.online';

export const VocabFromMistakesCard = ({ accessToken }: VocabSurfaceProps) => {
  const t = useAppT();
  const [items, setItems] = useState<VocabFromMistakesEntry[] | null>(null);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    if (!accessToken) return;
    practiceVocabFromMistakesGet(accessToken).then((res) => {
      setItems(res.items);
      setTotal(res.total);
    }).catch(() => null);
  }, [accessToken]);

  if (items == null) {
    return (
      <section className="glass" style={{ padding: 22 }}>
        <p className="muted">{t('vocab.loading')}</p>
      </section>
    );
  }

  return (
    <section className="glass" style={{ padding: 22, display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <p className="eyebrow"><Library size={11} style={{ verticalAlign: -2, marginRight: 4 }} aria-hidden="true" /> {t('vocab.eyebrow')}</p>
          <h3 style={{ margin: '4px 0 0' }}>
            {total > 0 ? t('vocab.count', { count: total }) : t('vocab.none')}
          </h3>
          <p className="muted" style={{ margin: '4px 0 0', fontSize: 14 }}>
            {t('vocab.lead')}
          </p>
        </div>
        {total > 0 ? (
          <a className="btn ghost compact" href={VOCABULARY_APP_URL} target="_blank" rel="noreferrer">
            {t('vocab.open')} <BookmarkPlus size={12} style={{ marginLeft: 4 }} />
          </a>
        ) : null}
      </div>
      {items.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>
          {t('vocab.empty')}
        </p>
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(180px, 100%), 1fr))', gap: 10 }}>
          {items.slice(0, 8).map((item) => (
            <li
              key={item.id}
              style={{
                padding: '10px 14px',
                border: '1px solid var(--card-border)',
                borderRadius: 8,
                background: 'var(--card-subtle)',
              }}
            >
              <strong style={{ fontFamily: 'Fraunces, serif', fontWeight: 600, fontSize: 15, overflowWrap: 'anywhere' }}>{item.word}</strong>
              <p className="muted" style={{ margin: '4px 0 0', fontSize: 12, lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                {item.context_text ?? '—'}
              </p>
              <span className="muted" style={{ fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 6, display: 'inline-block' }}>
                {t('common.box', { box: item.leitner_box })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

// ============================================================
// Section dividers for "arrange them neatly"
// ============================================================
// Used on the dashboard to group widgets into clear scannable
// sections so the page doesn't read as a wall of cards.

interface SectionTitleProps {
  eyebrow: string;
  title: string;
  hint?: string;
  anchorId?: string;
}

export const DashboardSectionTitle = ({ eyebrow, title, hint, anchorId }: SectionTitleProps) => (
  <header id={anchorId} style={{ marginTop: 32, marginBottom: 16, scrollMarginTop: 16 }}>
    <p className="eyebrow" style={{ margin: 0 }}>{eyebrow}</p>
    <h2 style={{ margin: '6px 0 4px' }}>{title}</h2>
    {hint ? <p className="muted" style={{ margin: 0, fontSize: 14 }}>{hint}</p> : null}
  </header>
);

// ============================================================
// Biggest repair targets
// ============================================================
// The learner's most frequent open mistake patterns with measured accuracy.
// No projected band gain: that would be a guess presented as a number.

interface ScoreImpactProps {
  accessToken: string | null;
}

export const ScoreImpactCallout = ({ accessToken }: ScoreImpactProps) => {
  const t = useAppT();
  const fmt = useFormat();
  const [data, setData] = useState<ScoreImpactResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!accessToken) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    practiceScoreImpactGet(accessToken)
      .then((res) => { if (active) setData(res); })
      .catch(() => { if (active) setData(null); })
      .finally(() => { if (active) setLoading(false); });
    return () => {
      active = false;
    };
  }, [accessToken]);

  if (!accessToken) return null;

  return (
    <article className="glass dash-card" data-testid="repair-targets">
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <TrendingUp size={20} style={{ color: '#1f8a55', flexShrink: 0, marginTop: 2 }} aria-hidden="true" />
        <div style={{ minWidth: 0, flex: 1 }}>
          <p className="eyebrow" style={{ margin: 0 }}>{t('impact.eyebrow')}</p>
          <h3>{t('impact.title')}</h3>
          {loading ? <p className="muted">{t('impact.loading')}</p> : !data || data.areas.length === 0 ? (
            <p className="muted">{t('impact.empty')}</p>
          ) : (
            <>
              <p className="muted" style={{ fontSize: 13.5 }}>{t('impact.lead')}</p>
              <ul className="history-list" style={{ marginTop: 10 }}>
                {data.areas.map((area) => (
                  <li key={`${area.section_type}-${area.question_type}`} className="history-row">
                    <span>
                      <strong>{formatPracticeLabel(area.question_type)}</strong>
                      <span className="muted"> · {sectionLabel(t, area.section_type)}</span>
                    </span>
                    <span className="muted">
                      {t('impact.misses', { count: area.error_frequency })} ·{' '}
                      {area.rolling_accuracy != null && area.attempts > 0
                        ? t('impact.accuracy', { value: fmt.percent(area.rolling_accuracy), attempts: area.attempts })
                        : t('impact.noAccuracy')}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </article>
  );
};
