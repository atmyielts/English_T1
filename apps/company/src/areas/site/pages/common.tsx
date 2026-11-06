// Pieces the marketing pages share: a loading page, a not-found page, simple text
// filling, the "example" window around mock screens, and sample questions.
import React, { useState, type ReactNode } from 'react';
import { useAppT, type AppKey } from '../../../i18n/index.ts';
import { Link } from '../../../router.tsx';
import type { SampleQuestion } from '../industryData.ts';
import { SiteFrame } from '../SiteChrome.tsx';
import '../site-pages.css';

/** Fills `{name}` in a text from content files. */
export const fill = (text: string, values: Record<string, string | number>) => text.replace(/\{(\w+)\}/g, (whole, key) => key in values ? String(values[key]) : whole);

export function PageLoading({ path }: { path: string }) {
  const t = useAppT();
  return <SiteFrame seo={{ title: t('site.meta.title'), description: t('site.meta.description'), path }}><p role="status" className="site-page-status">{t('app.loading')}</p></SiteFrame>;
}

export function PageMissing({ path }: { path: string }) {
  const t = useAppT();
  return <SiteFrame seo={{ title: t('site.meta.title'), description: t('site.meta.description'), path, noindex: true }}>
    <section className="site-page-status">
      <h1>{t('common.notFound')}</h1>
      <p><Link className="button-link" to="/">{t('common.home')}</Link></p>
    </section>
  </SiteFrame>;
}

/** The frame that marks a drawn screen as an example, not a live product. */
export function MockWindow({ label, title, children }: { label: string; title?: string; children: ReactNode }) {
  return <figure className="site-mock">
    <div className="site-mock-bar"><span aria-hidden="true"/><span aria-hidden="true"/><span aria-hidden="true"/>{title && <strong>{title}</strong>}<em>{label}</em></div>
    <div className="site-mock-body">{children}</div>
  </figure>;
}

/** Try-it questions: answering shows at once whether it was right. They are examples, not the test bank. */
export function SampleQuestions({ questions, labels }: { questions: SampleQuestion[]; labels: { right: string; wrong: string } }) {
  const t = useAppT();
  const [chosen, setChosen] = useState<Record<number, number>>({});
  return <ol className="site-samples">
    {questions.map((question, index) => {
      const picked = chosen[index];
      return <li key={question.prompt} className="site-sample">
        <p className="site-sample-skill">{t(`skill.${question.skill}` as AppKey)}</p>
        {question.context && <p className="site-sample-context" lang="en">{question.context}</p>}
        <p className="site-sample-prompt" lang="en" id={`site-sample-${index}`}>{question.prompt}</p>
        <div className="site-sample-options" role="group" aria-labelledby={`site-sample-${index}`}>
          {question.options.map((option, optionIndex) => {
            const state = picked === undefined ? '' : optionIndex === question.answer ? 'site-option-right' : optionIndex === picked ? 'site-option-wrong' : '';
            return <button key={option} type="button" lang="en" className={`site-option ${state}`} aria-pressed={picked === optionIndex} onClick={() => setChosen({ ...chosen, [index]: optionIndex })}>{option}</button>;
          })}
        </div>
        {picked !== undefined && <p className={picked === question.answer ? 'site-sample-result site-good' : 'site-sample-result site-bad'} role="status">{picked === question.answer ? labels.right : labels.wrong}</p>}
      </li>;
    })}
  </ol>;
}
