import { useEffect, useState } from 'react';
import { Target } from 'lucide-react';
import {
  practiceMistakeCauses,
  practiceRecordMistakeCause,
  type MistakeCause,
  type MistakeCausesResponse,
} from '../lib/api';

const CAUSE_META: Record<MistakeCause, { short: string; label: string }> = {
  misread: { short: 'Misread', label: 'Misread the question' },
  vocabulary: { short: 'Vocabulary', label: 'Vocabulary gap' },
  distractor: { short: 'Distractor', label: 'Fell for a distractor' },
  timing: { short: 'Timing', label: 'Ran out of time' },
  careless: { short: 'Careless', label: 'Careless slip' },
  other: { short: 'Other', label: 'Other reason' },
};

const TAG_OPTIONS: MistakeCause[] = ['misread', 'vocabulary', 'distractor', 'timing', 'careless'];

// Compact per-question tagger shown next to each coached mistake on the results page.
export const MistakeCauseTagger = ({
  accessToken,
  sessionId,
  sectionType,
  questionType,
}: {
  accessToken: string | null;
  sessionId?: string;
  sectionType: string;
  questionType: string;
}) => {
  const [chosen, setChosen] = useState<MistakeCause | null>(null);
  const [saving, setSaving] = useState(false);

  const tag = async (cause: MistakeCause) => {
    if (!accessToken || saving) return;
    setSaving(true);
    setChosen(cause);
    try {
      await practiceRecordMistakeCause(accessToken, {
        cause,
        session_id: sessionId,
        section_type: sectionType,
        question_type: questionType,
      });
    } catch {
      setChosen(null);
    } finally {
      setSaving(false);
    }
  };

  if (chosen) {
    return <span className="muted" style={{ fontSize: 12 }}>✓ Logged: {CAUSE_META[chosen].label}</span>;
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <span className="muted" style={{ fontSize: 12 }}>Why did you miss it?</span>
      {TAG_OPTIONS.map((c) => (
        <button
          key={c}
          type="button"
          className="btn ghost compact"
          style={{ fontSize: 11, padding: '2px 8px' }}
          disabled={saving}
          onClick={() => void tag(c)}
        >
          {CAUSE_META[c].short}
        </button>
      ))}
    </span>
  );
};

// Dashboard "where you lose marks" breakdown. Plain glass section — safe in the
// single-column .practice-main grid (no stat-card grid-column classes).
export const MistakeCausesCard = ({ accessToken }: { accessToken: string | null }) => {
  const [data, setData] = useState<MistakeCausesResponse | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    practiceMistakeCauses(accessToken).then((r) => { if (!cancelled) setData(r); }).catch(() => null);
    return () => { cancelled = true; };
  }, [accessToken]);

  if (!data) return null;

  return (
    <section className="glass" style={{ padding: 22, marginBottom: 20, display: 'grid', gap: 12 }}>
      <div>
        <p className="eyebrow"><Target size={11} style={{ verticalAlign: -2, marginRight: 4 }} /> Where you lose marks</p>
        <h3 style={{ margin: '4px 0 0' }}>Your mistake patterns (last 30 days)</h3>
      </div>

      {data.total === 0 ? (
        <p className="muted" style={{ margin: 0, fontSize: 14 }}>
          Tag a missed question with "Why did you miss it?" on any results page, and your patterns will show up here —
          so you can target the real cause (misreading, vocabulary, traps, timing).
        </p>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {data.breakdown.map((row) => {
            const pct = Math.round((row.count / data.total) * 100);
            return (
              <div key={row.cause} style={{ display: 'grid', gap: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span>{CAUSE_META[row.cause]?.label ?? row.cause}</span>
                  <span className="muted">{row.count} ({pct}%)</span>
                </div>
                <div className="progress-track" style={{ height: 6 }}>
                  <div className="progress-fill" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
