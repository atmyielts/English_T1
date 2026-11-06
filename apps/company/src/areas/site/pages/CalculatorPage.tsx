// /calculator: arithmetic on the visitor's own numbers. Nothing is sent anywhere, and
// no benchmark or price of ours appears on the page.
import React, { useMemo, useState } from 'react';
import { useI18n } from '../../../../../../packages/service-i18n/src/i18n.tsx';
import { useAppT } from '../../../i18n/index.ts';
import { Link } from '../../../router.tsx';
import { calculate, parseAmount, type CalcInput, type CalcResult } from '../calc.ts';
import { PAGES, useContent } from '../content.ts';
import { SiteFrame } from '../SiteChrome.tsx';
import { fill, PageLoading } from './common.tsx';

const INPUTS: (keyof CalcInput)[] = ['people', 'spend', 'leavers', 'costPerLeaver', 'hoursPerWeek', 'weeks', 'hourlyCost', 'quote', 'avoidablePercent'];
const ROWS: (keyof CalcResult)[] = ['spendPerPerson', 'turnoverCost', 'timeCost', 'totalToday', 'addressable', 'saving', 'net', 'breakEvenPercent', 'breakEvenLeavers', 'breakEvenHours'];
const EMPTY = Object.fromEntries(INPUTS.map((key) => [key, ''])) as Record<keyof CalcInput, string>;

export function CalculatorPage() {
  const t = useAppT();
  const { number } = useI18n();
  const text = useContent(PAGES);
  const [values, setValues] = useState(EMPTY);
  const input = useMemo(() => Object.fromEntries(INPUTS.map((key) => [key, parseAmount(values[key])])) as unknown as CalcInput, [values]);
  const result = useMemo(() => calculate(input), [input]);
  if (!text) return <PageLoading path="/calculator"/>;
  const c = text.calculator;
  const show = (value: number | null) => value === null ? '—' : number(value, { maximumFractionDigits: Math.abs(value) < 100 ? 1 : 0 });
  const named: Record<string, string> = { ...Object.fromEntries(INPUTS.map((key) => [key, show(input[key])])), addressable: show(result.addressable), saving: show(result.saving) };
  const visible = ROWS.filter((key) => result[key] !== null);
  const suffix = (key: keyof CalcResult) => key === 'breakEvenPercent' ? '%' : '';
  return <SiteFrame seo={{ title: c.metaTitle, description: c.metaDescription, path: '/calculator' }}>
    <section className="site-page-hero">
      <p className="site-eyebrow">{c.eyebrow}</p>
      <h1>{c.title}</h1>
      <p className="site-lead">{c.lead}</p>
    </section>
    <section className="site-calc">
      <form className="site-form site-calc-form" onSubmit={(event) => event.preventDefault()}>
        <h2 className="site-h3">{c.inputsTitle}</h2>
        <div className="site-form-grid">
          {INPUTS.map((key) => <label key={key}>
            {c.inputs[key].label}
            <input inputMode="decimal" autoComplete="off" maxLength={18} value={values[key]} aria-describedby={`site-calc-${key}`} aria-invalid={values[key] !== '' && input[key] === null ? true : undefined} onChange={(event) => setValues({ ...values, [key]: event.target.value })}/>
            <span className="hint" id={`site-calc-${key}`}>{c.inputs[key].hint}</span>
          </label>)}
        </div>
        <p><button type="button" className="quiet" onClick={() => setValues(EMPTY)}>{c.reset}</button></p>
      </form>
      <div className="site-calc-results" aria-live="polite">
        <h2 className="site-h3">{c.resultsTitle}</h2>
        {visible.length === 0 ? <p className="hint">{c.empty}</p> : <dl>
          {visible.map((key) => <div key={key} className={key === 'totalToday' || key === 'net' ? 'site-calc-strong' : ''}>
            <dt>{c.rows[key]}</dt>
            <dd>{show(result[key])}{suffix(key)}</dd>
            <dd className="site-calc-formula">{fill(c.formula[key], named)}</dd>
          </div>)}
        </dl>}
        <p className="site-note">{c.disclaimer}</p>
        {visible.length > 0 && <p className="site-no-print"><button type="button" className="quiet" onClick={() => print()}>{c.print}</button></p>}
      </div>
    </section>
    <section className="site-pilot site-section-tight site-no-print">
      <div>
        <h2 className="site-h2">{c.ctaTitle}</h2>
        <p className="site-section-lead">{c.ctaLead}</p>
      </div>
      <div className="site-ctas">
        <Link className="button-link site-cta" to="/start">{t('site.cta.pilot')}</Link>
        <Link className="button-link quiet site-cta" to="/#demo">{t('site.cta.demo')}</Link>
      </div>
    </section>
  </SiteFrame>;
}
