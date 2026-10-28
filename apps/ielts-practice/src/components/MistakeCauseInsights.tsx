import { useEffect, useState } from 'react';
import { Target } from 'lucide-react';
import {
  practiceMistakeCauses,
  practiceRecordMistakeCause,
  type MistakeCause,
  type MistakeCausesResponse,
} from '../lib/api';
import { useAppT, useFormat, type AppKey } from '../i18n';

const CAUSES: MistakeCause[] = ['misread', 'vocabulary', 'distractor', 'timing', 'careless', 'other'];
const causeKey = (cause: string, part: 'short' | 'label'): AppKey =>
  `cause.${(CAUSES as string[]).includes(cause) ? cause : 'other'}.${part}` as AppKey;

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
  const t = useAppT();
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
    return <span className="muted" style={{ fontSize: 12 }}>✓ {t('cause.logged', { label: t(causeKey(chosen, 'label')) })}</span>;
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <span className="muted" style={{ fontSize: 12 }}>{t('cause.ask')}</span>
      {TAG_OPTIONS.map((c) => (
        <button
          key={c}
          type="button"
          className="btn ghost compact"
          style={{ fontSize: 11, padding: '2px 8px' }}
          disabled={saving}
          onClick={() => void tag(c)}
        >
          {t(causeKey(c, 'short'))}
        </button>
      ))}
    </span>
  );
};

// Dashboard "where you lose marks" breakdown. Plain glass section — safe in the
// single-column .practice-main grid (no stat-card grid-column classes).
export const MistakeCausesCard = ({ accessToken }: { accessToken: string | null }) => {
  const t = useAppT();
  const fmt = useFormat();
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
        <p className="eyebrow"><Target size={11} style={{ verticalAlign: -2, marginRight: 4 }} aria-hidden="true" /> {t('cause.card.eyebrow')}</p>
        <h3 style={{ margin: '4px 0 0' }}>{t('cause.card.title')}</h3>
      </div>

      {data.total === 0 ? (
        <p className="muted" style={{ margin: 0, fontSize: 14 }}>
          {t('cause.card.empty')}
        </p>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {data.breakdown.map((row) => {
            const pct = Math.round((row.count / data.total) * 100);
            const ratio = row.count / data.total;
            return (
              <div key={row.cause} style={{ display: 'grid', gap: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span>{t(causeKey(row.cause, 'label'))}</span>
                  <span className="muted">{t('cause.card.count', { count: row.count, pct: fmt.percent(ratio) })}</span>
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
