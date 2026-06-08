import { useState } from 'react';
import { GraduationCap, X } from 'lucide-react';
import {
  getCoachLang,
  practiceTeach,
  setCoachLang,
  type CoachLang,
  type PracticeSkillLesson,
} from '../lib/api';

const LANGS: Array<{ id: CoachLang; label: string }> = [
  { id: 'en', label: 'EN' },
  { id: 'uz', label: 'UZ' },
  { id: 'ru', label: 'RU' },
];

interface TeachSkillButtonProps {
  accessToken: string | null;
  sectionType: string;
  questionType: string;
}

// "Teach me this skill" — opens an on-demand AI strategy micro-lesson for a
// question type, so the learner can understand the technique before drilling.
export const TeachSkillButton = ({ accessToken, sectionType, questionType }: TeachSkillButtonProps) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [lesson, setLesson] = useState<PracticeSkillLesson | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lang, setLang] = useState<CoachLang>(() => getCoachLang());

  const load = async (useLang: CoachLang) => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const res = await practiceTeach(accessToken, { question_type: questionType, section_type: sectionType, lang: useLang });
      setLesson(res.lesson);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the lesson');
    } finally {
      setLoading(false);
    }
  };

  const openPanel = () => {
    setOpen(true);
    if (!lesson && !loading) void load(lang);
  };

  const chooseLang = (next: CoachLang) => {
    setLang(next);
    setCoachLang(next);
    void load(next);
  };

  return (
    <>
      <button type="button" className="btn ghost compact" onClick={openPanel} title="Learn the strategy for this question type">
        <GraduationCap size={13} style={{ verticalAlign: -2, marginRight: 4 }} />
        Learn
      </button>

      {open ? (
        <div
          onClick={() => setOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(15,20,25,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="glass"
            style={{ width: '100%', maxWidth: 560, maxHeight: '85vh', overflowY: 'auto', padding: 24, display: 'grid', gap: 14 }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <p className="eyebrow" style={{ margin: 0 }}>
                <GraduationCap size={11} style={{ verticalAlign: -2, marginRight: 4 }} /> Strategy lesson
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ display: 'inline-flex', gap: 2, border: '1px solid var(--card-border)', borderRadius: 999, padding: 2 }} title="Lesson language">
                  {LANGS.map((l) => (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => chooseLang(l.id)}
                      className="btn compact"
                      style={{ padding: '2px 8px', borderRadius: 999, fontSize: 11, background: lang === l.id ? 'var(--accent-soft)' : 'transparent', fontWeight: lang === l.id ? 700 : 500 }}
                      aria-pressed={lang === l.id}
                    >
                      {l.label}
                    </button>
                  ))}
                </div>
                <button type="button" className="btn ghost compact" onClick={() => setOpen(false)} aria-label="Close">
                  <X size={15} />
                </button>
              </div>
            </div>

            {loading ? <p className="muted">Preparing your lesson…</p> : null}
            {error ? <p className="error-text">{error}</p> : null}

            {lesson && !loading ? (
              <>
                <h3 style={{ margin: 0 }}>{lesson.title}</h3>
                <p className="muted" style={{ margin: 0 }}>{lesson.what_it_tests}</p>

                {lesson.steps.length > 0 ? (
                  <div>
                    <strong style={{ fontSize: 13 }}>How to do it</strong>
                    <ol style={{ margin: '6px 0 0', paddingLeft: 20, display: 'grid', gap: 6 }}>
                      {lesson.steps.map((s, i) => <li key={i} style={{ fontSize: 14, lineHeight: 1.5 }}>{s}</li>)}
                    </ol>
                  </div>
                ) : null}

                {lesson.common_traps.length > 0 ? (
                  <div>
                    <strong style={{ fontSize: 13 }}>Watch out for</strong>
                    <ul style={{ margin: '6px 0 0', paddingLeft: 20, display: 'grid', gap: 6 }}>
                      {lesson.common_traps.map((t, i) => <li key={i} style={{ fontSize: 14, lineHeight: 1.5 }}>{t}</li>)}
                    </ul>
                  </div>
                ) : null}

                {lesson.worked_example ? (
                  <div style={{ background: 'var(--card-subtle)', border: '1px solid var(--card-border)', borderRadius: 10, padding: 14 }}>
                    <strong style={{ fontSize: 13 }}>Worked example</strong>
                    <p style={{ margin: '6px 0 0', fontSize: 14, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{lesson.worked_example}</p>
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
};
