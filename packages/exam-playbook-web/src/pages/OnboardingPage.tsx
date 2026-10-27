import { ArrowRight } from 'lucide-react';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shell } from '../components/TopNav';
import { ErrorPanel, Skeleton, useErrorText } from '../components/ui';
import { useDynamicT, useT } from '../i18n';
import type { Json } from '../lib/api';
import { usePlaybook } from '../lib/context';
import { BANDS, bandLabel, totalToBand } from '../lib/toeflScale';

const rec = (v: unknown): Json => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {});
const numOrNull = (v: string): number | null => (v.trim() === '' ? null : Number(v));
const str = (v: unknown) => (v == null ? '' : String(v));

const Field = ({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) => (
  <label className="field">
    <span>{label}</span>
    {children}
    {hint ? <small>{hint}</small> : null}
  </label>
);

export const OnboardingPage = () => {
  const t = useT();
  const dt = useDynamicT();
  const errorText = useErrorText();
  const navigate = useNavigate();
  const { config, api, access } = usePlaybook();
  const token = access.token!;
  const [form, setForm] = useState<Json | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const sat = config.exam === 'sat';

  useEffect(() => {
    let active = true;
    setLoadError(null);
    api.profile(token)
      .then(({ profile }) => {
        if (!active) return;
        const p = rec(profile);
        setForm({
          ...p,
          score_scale: p.score_scale ?? 'band_2026',
          current_section_scores: rec(p.current_section_scores),
          target_section_scores: rec(p.target_section_scores),
          section_current_bands: rec(p.section_current_bands),
          legacy_section_scores: rec(p.legacy_section_scores),
          purpose: p.purpose ?? 'university',
          prep_intensity: p.prep_intensity ?? 'balanced',
        });
      })
      .catch((error) => active && setLoadError(errorText(error)));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, token, attempt]);

  if (loadError) return <Shell narrow><ErrorPanel message={loadError} onRetry={() => setAttempt((n) => n + 1)} /></Shell>;
  if (!form) return <Shell narrow><Skeleton lines={8} /></Shell>;

  const set = (key: string, value: unknown) => setForm((f) => ({ ...f!, [key]: value }));
  const setNested = (key: string, sub: string, value: unknown) =>
    setForm((f) => ({ ...f!, [key]: { ...rec(f![key]), [sub]: value } }));
  const legacy = form.score_scale === 'legacy_120';

  const buildBody = (): Json => {
    const common: Json = {
      deadline_date: form.deadline_date || null,
      weakest_section: form.weakest_section || null,
      purpose: form.purpose,
      prep_intensity: form.prep_intensity,
      weekly_hours: form.weekly_hours === '' || form.weekly_hours == null ? null : Number(form.weekly_hours),
      onboarding: true,
    };
    const clean = (obj: unknown) => Object.fromEntries(Object.entries(rec(obj)).filter(([, v]) => v !== null && v !== '' && v !== undefined).map(([k, v]) => [k, Number(v)]));
    if (sat) {
      return {
        ...common,
        target_total_score: Number(form.target_total_score ?? 1200),
        current_section_scores: clean(form.current_section_scores),
        target_section_scores: clean(form.target_section_scores),
        ...(Object.keys(clean(form.current_section_scores)).length === 2 ? {} : { current_score_or_estimate: form.current_score_or_estimate === '' || form.current_score_or_estimate == null ? null : Number(form.current_score_or_estimate) }),
      };
    }
    return legacy
      ? {
        ...common,
        score_scale: 'legacy_120',
        target_total_score: Number(form.target_total_score ?? 90),
        current_score_or_estimate: form.current_score_or_estimate === '' || form.current_score_or_estimate == null ? null : Number(form.current_score_or_estimate),
        legacy_section_scores: clean(form.legacy_section_scores),
      }
      : {
        ...common,
        score_scale: 'band_2026',
        target_band: form.target_band == null || form.target_band === '' ? null : Number(form.target_band),
        current_band: form.current_band == null || form.current_band === '' ? null : Number(form.current_band),
        section_current_bands: clean(form.section_current_bands),
      };
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setSaveError(null);
    try {
      await api.saveProfile(token, buildBody());
      navigate('/diagnostic');
    } catch (error) {
      setSaveError(errorText(error));
    } finally {
      setSaving(false);
    }
  };

  const bandSelect = (value: unknown, onChange: (v: string) => void, id: string, allowEmpty = true) => (
    <select id={id} value={str(value)} onChange={(e) => onChange(e.target.value)}>
      {allowEmpty ? <option value="">{t('onboarding.notSure')}</option> : null}
      {BANDS.map((b) => <option key={b} value={String(b)}>{bandLabel(b)}</option>)}
    </select>
  );

  return (
    <Shell narrow>
      <section className="page-header">
        <div>
          <p className="eyebrow">{t('onboarding.eyebrow')}</p>
          <h1>{t('onboarding.title')}</h1>
          <p>{t('onboarding.lead', { exam: config.examName })}</p>
        </div>
      </section>
      <form className="panel form-panel" onSubmit={(e) => void submit(e)}>
        {sat ? (
          <>
            <fieldset>
              <legend>{t('onboarding.goal')}</legend>
              <Field label={t('onboarding.sat.target')} hint={t('onboarding.sat.targetHint')}>
                <input type="number" inputMode="numeric" min={400} max={1600} step={10} required value={str(form.target_total_score ?? 1200)} onChange={(e) => set('target_total_score', e.target.value)} />
              </Field>
              <div className="field-row">
                {config.sections.map((s) => (
                  <Field key={s} label={t('onboarding.sat.sectionTarget', { section: dt(`section.${s}`, s) })} hint={t('common.optional')}>
                    <input type="number" inputMode="numeric" min={200} max={800} step={10} value={str(rec(form.target_section_scores)[s])} onChange={(e) => setNested('target_section_scores', s, numOrNull(e.target.value))} />
                  </Field>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend>{t('onboarding.current')}</legend>
              <p className="muted-note">{t('onboarding.sat.currentHint', { exam: config.examName })}</p>
              <div className="field-row">
                {config.sections.map((s) => (
                  <Field key={s} label={dt(`section.${s}`, s)} hint="200–800">
                    <input type="number" inputMode="numeric" min={200} max={800} step={10} value={str(rec(form.current_section_scores)[s])} onChange={(e) => setNested('current_section_scores', s, numOrNull(e.target.value))} />
                  </Field>
                ))}
              </div>
              <Field label={t('onboarding.sat.currentTotal')} hint={t('onboarding.sat.currentTotalHint')}>
                <input type="number" inputMode="numeric" min={400} max={1600} step={10} value={str(form.current_score_or_estimate)} onChange={(e) => set('current_score_or_estimate', numOrNull(e.target.value))} />
              </Field>
            </fieldset>
          </>
        ) : (
          <>
            <fieldset>
              <legend>{t('onboarding.toefl.scale')}</legend>
              <div className="segmented" role="radiogroup" aria-label={t('onboarding.toefl.scale')}>
                <label><input type="radio" name="scale" checked={!legacy} onChange={() => set('score_scale', 'band_2026')} /> {t('onboarding.toefl.scaleNew')}</label>
                <label><input type="radio" name="scale" checked={legacy} onChange={() => set('score_scale', 'legacy_120')} /> {t('onboarding.toefl.scaleOld')}</label>
              </div>
              <p className="muted-note">{t('onboarding.toefl.scaleHint')}</p>
            </fieldset>
            {!legacy ? (
              <>
                <fieldset>
                  <legend>{t('onboarding.goal')}</legend>
                  <Field label={t('onboarding.toefl.targetBand')} hint={t('onboarding.toefl.bandHint')}>
                    {bandSelect(form.target_band, (v) => set('target_band', v), 'target-band')}
                  </Field>
                </fieldset>
                <fieldset>
                  <legend>{t('onboarding.current')}</legend>
                  <Field label={t('onboarding.toefl.currentBand')}>
                    {bandSelect(form.current_band, (v) => set('current_band', v), 'current-band')}
                  </Field>
                  <div className="field-row four">
                    {config.sections.map((s) => (
                      <Field key={s} label={dt(`section.${s}`, s)}>
                        {bandSelect(rec(form.section_current_bands)[s], (v) => setNested('section_current_bands', s, v === '' ? null : v), `band-${s}`)}
                      </Field>
                    ))}
                  </div>
                </fieldset>
              </>
            ) : (
              <>
                <fieldset>
                  <legend>{t('onboarding.goal')}</legend>
                  <Field label={t('onboarding.toefl.targetTotal')} hint={(() => {
                    const b = totalToBand(Number(form.target_total_score));
                    return b != null ? t('onboarding.toefl.equals', { band: bandLabel(b) }) : '0–120';
                  })()}>
                    <input type="number" inputMode="numeric" min={0} max={120} required value={str(form.target_total_score ?? 90)} onChange={(e) => set('target_total_score', e.target.value)} />
                  </Field>
                </fieldset>
                <fieldset>
                  <legend>{t('onboarding.current')}</legend>
                  <Field label={t('onboarding.toefl.currentTotal')} hint={(() => {
                    const b = form.current_score_or_estimate == null || form.current_score_or_estimate === '' ? null : totalToBand(Number(form.current_score_or_estimate));
                    return b != null ? t('onboarding.toefl.equals', { band: bandLabel(b) }) : t('common.optional');
                  })()}>
                    <input type="number" inputMode="numeric" min={0} max={120} value={str(form.current_score_or_estimate)} onChange={(e) => set('current_score_or_estimate', numOrNull(e.target.value))} />
                  </Field>
                  <div className="field-row four">
                    {config.sections.map((s) => (
                      <Field key={s} label={dt(`section.${s}`, s)} hint="0–30">
                        <input type="number" inputMode="numeric" min={0} max={30} value={str(rec(form.legacy_section_scores)[s])} onChange={(e) => setNested('legacy_section_scores', s, numOrNull(e.target.value))} />
                      </Field>
                    ))}
                  </div>
                </fieldset>
              </>
            )}
          </>
        )}

        <fieldset>
          <legend>{t('onboarding.plan')}</legend>
          <div className="field-row">
            <Field label={t('onboarding.testDate')} hint={t('common.optional')}>
              <input type="date" value={str(form.deadline_date)} onChange={(e) => set('deadline_date', e.target.value || null)} />
            </Field>
            <Field label={t('onboarding.weeklyHours')} hint={t('common.optional')}>
              <input type="number" inputMode="numeric" min={0} max={80} value={str(form.weekly_hours)} onChange={(e) => set('weekly_hours', e.target.value)} />
            </Field>
          </div>
          <div className="field-row">
            <Field label={t('onboarding.weakest')}>
              <select value={str(form.weakest_section)} onChange={(e) => set('weakest_section', e.target.value || null)}>
                <option value="">{t('onboarding.weakestAuto')}</option>
                {config.sections.map((s) => <option key={s} value={s}>{dt(`section.${s}`, s)}</option>)}
              </select>
            </Field>
            <Field label={t('onboarding.purpose')}>
              <select value={str(form.purpose)} onChange={(e) => set('purpose', e.target.value)}>
                {(sat ? ['university', 'scholarship', 'merit', 'placement', 'retake'] : ['university', 'graduate', 'scholarship', 'visa', 'placement', 'retake']).map((p) => (
                  <option key={p} value={p}>{dt(`purpose.${p}`, p)}</option>
                ))}
              </select>
            </Field>
          </div>
          <Field label={t('onboarding.intensity')}>
            <select value={str(form.prep_intensity)} onChange={(e) => set('prep_intensity', e.target.value)}>
              {['crash', 'balanced', 'thorough'].map((p) => <option key={p} value={p}>{dt(`intensity.${p}`, p)}</option>)}
            </select>
          </Field>
        </fieldset>
        {saveError ? <p className="alert error" role="alert">{saveError}</p> : null}
        <button className="btn solid" type="submit" disabled={saving}>
          {saving ? t('common.saving') : t('onboarding.submit')} <ArrowRight size={16} aria-hidden="true" />
        </button>
      </form>
    </Shell>
  );
};
