import { useEffect, useState } from 'react';
import { AlarmClock, BookmarkPlus, GraduationCap, Library, Moon, ShieldCheck, Sparkles } from 'lucide-react';
import {
  practiceVocabFromMistakesGet,
  type VocabFromMistakesEntry,
} from '../lib/api';

// ============================================================
// Pre-test mode banner (T-7 ramp + final-week prep)
// ============================================================
// Activates when target_date is within 7 days. Replaces normal lab
// emphasis with a focused checklist + confidence drills + sleep/
// nutrition prompts. Higher-stakes UX than the regular plan.

interface PreTestProps {
  targetDate: string | null | undefined;
}

const TEST_DAY_CHECKLIST = [
  'ID document checked (passport/national ID with photo)',
  'Test centre printout or app QR ready',
  'Pens, pencils, eraser, sharpener in clear case',
  'Water bottle (transparent, label removed)',
  'Watch off — clocks are at the centre',
  'No phone, no smartwatch, no earphones in pocket',
];

const T1_ROUTINE = [
  'No new content today — only confidence drills',
  'Sleep before midnight, alarm set 1h earlier',
  'Light breakfast 90 min before the test',
  'Re-read your top 5 strongest writing essays',
  'Skim the Playbook’s strategy summary cards',
];

const T7_ROUTINE = [
  'Switch to retesting only — no new material',
  'Daily mock under exact timing once',
  'Limit new vocabulary; consolidate what you know',
  'Two days off in the last week is fine, not more',
  'Sleep target: 7.5+ hours every night',
];

export const PreTestModeBanner = ({ targetDate }: PreTestProps) => {
  if (!targetDate) return null;
  const days = Math.ceil((new Date(targetDate).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  if (days < 0 || days > 7) return null;
  const headline = days === 0 ? "Test day" : days === 1 ? "Test day tomorrow" : `${days} days to test`;
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
            <AlarmClock size={11} style={{ verticalAlign: -2, marginRight: 4 }} /> Pre-test mode
          </p>
          <h2 style={{ margin: '4px 0 4px', fontFamily: 'Fraunces, serif', fontWeight: 600 }}>
            {headline}
          </h2>
          <p className="muted" style={{ margin: 0 }}>
            {days <= 1
              ? "Final-stretch protocol below. Sleep wins this section."
              : "Switch into ramp-down. Consolidation beats new material this close to the test."}
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 18, marginTop: 18 }}>
        <div>
          <p className="eyebrow" style={{ margin: '0 0 8px', color: tone }}>
            <Moon size={11} style={{ verticalAlign: -2, marginRight: 4 }} />
            {days <= 1 ? 'Tonight & tomorrow' : 'This week'}
          </p>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 4 }}>
            {routine.map((item, i) => (
              <li key={i} style={{ fontSize: 13.5, lineHeight: 1.5, color: 'var(--ink-2)' }}>
                · {item}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="eyebrow" style={{ margin: '0 0 8px', color: tone }}>
            <ShieldCheck size={11} style={{ verticalAlign: -2, marginRight: 4 }} />
            Test-day kit
          </p>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 4 }}>
            {TEST_DAY_CHECKLIST.map((item, i) => (
              <li key={i} style={{ fontSize: 13.5, lineHeight: 1.5, color: 'var(--ink-2)' }}>
                ☐ {item}
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
// Sends users to the simulator's full-exam flow with a query
// parameter that flags this as a deliberate full mock so the
// simulator can apply strict-mode timing.

const SIMULATOR_FULL_EXAM_URL = 'https://ielts.schood.online/full-exam?source=practice&mode=mock';

export const MockTestEntryCard = () => {
  return (
    <section
      className="glass"
      style={{
        padding: 22,
        display: 'grid',
        gap: 14,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <p className="eyebrow"><GraduationCap size={11} style={{ verticalAlign: -2, marginRight: 4 }} /> Full mock</p>
          <h3 style={{ margin: '4px 0 0' }}>Take a full mock under exam conditions</h3>
          <p className="muted" style={{ margin: '4px 0 0', fontSize: 14 }}>
            All four sections, strict timing, no pause. Scored against the same rubric your
            certificate will use. Run one of these every 7–10 days.
          </p>
        </div>
        <a className="btn solid" href={SIMULATOR_FULL_EXAM_URL}>
          Start full mock <Sparkles size={14} style={{ marginLeft: 6 }} />
        </a>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 12.5 }}>
        <span className="muted">~3 hours</span>
        <span className="muted">·</span>
        <span className="muted">Reading 60 min</span>
        <span className="muted">·</span>
        <span className="muted">Listening 30 min</span>
        <span className="muted">·</span>
        <span className="muted">Writing 60 min</span>
        <span className="muted">·</span>
        <span className="muted">Speaking 14 min</span>
      </div>
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
        <p className="muted">Loading words from your mistakes…</p>
      </section>
    );
  }

  return (
    <section className="glass" style={{ padding: 22, display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <p className="eyebrow"><Library size={11} style={{ verticalAlign: -2, marginRight: 4 }} /> Vocabulary from mistakes</p>
          <h3 style={{ margin: '4px 0 0' }}>
            {total > 0 ? `${total} words captured` : 'No words yet'}
          </h3>
          <p className="muted" style={{ margin: '4px 0 0', fontSize: 14 }}>
            We automatically save words from gap-fill and completion questions you miss. Review
            them in your vocabulary notebook to lock them in.
          </p>
        </div>
        {total > 0 ? (
          <a className="btn ghost compact" href={VOCABULARY_APP_URL} target="_blank" rel="noreferrer">
            Open notebook <BookmarkPlus size={12} style={{ marginLeft: 4 }} />
          </a>
        ) : null}
      </div>
      {items.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>
          Complete a practice lab with gap-fill questions and any you miss will land here automatically.
        </p>
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
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
              <strong style={{ fontFamily: 'Fraunces, serif', fontWeight: 600, fontSize: 15 }}>{item.word}</strong>
              <p className="muted" style={{ margin: '4px 0 0', fontSize: 12, lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                {item.context_text ?? '—'}
              </p>
              <span className="muted" style={{ fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 6, display: 'inline-block' }}>
                Box {item.leitner_box} · {item.source_type}
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
