import { useEffect, useState } from 'react';
import { proctorRequest, type Row } from '../../../packages/assessment-web/src/client';
import { useI18n } from '../../../packages/service-i18n/src/i18n.tsx';
import { useAppT } from './i18n/index.ts';

/** Integrity review outcomes the institution chose to explain to this candidate. */
export function IntegrityOutcomes({ tenant, user }: { tenant: string; user: string }) {
  const t = useAppT(), { date } = useI18n();
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    let active = true;
    setRows([]);
    // Monitoring is optional per institution: no outcomes is the normal case, so failures stay quiet.
    proctorRequest<Row[]>('candidate/outcomes', tenant, undefined, undefined, user).then((value) => { if (active) setRows(value); }).catch(() => undefined);
    return () => { active = false; };
  }, [tenant, user]);
  if (!rows.length) return null;
  return <section className="integrity-outcomes" aria-labelledby="integrity-outcomes-title">
    <h2 id="integrity-outcomes-title">{t('exam.integrity.title')}</h2>
    <ul className="records">{rows.map((row) => <li key={String(row.id)}>
      <strong>{String(row.sitting)}</strong>
      <span className={`badge integrity-${String(row.disposition)}`}>{t(row.disposition === 'confirmed' ? 'exam.integrity.confirmed' : row.disposition === 'clear' ? 'exam.integrity.clear' : 'exam.integrity.insufficient')}</span>
      <p>{String(row.summary)}</p>
      <span className="hint">{t('exam.integrity.when', { date: date(String(row.disclosed_at)) })}</span>
    </li>)}</ul>
    <p className="hint">{t('exam.integrity.contact')}</p>
  </section>;
}
