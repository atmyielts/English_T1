import { certificateAdmissionPoints, type CertificateFormat, type CertificateGrade } from './certificate.ts';

// The learner's exam path: certificate sittings and the admission test, each with a date
// and a target. There is always a next step: retake to raise a grade, the admission test,
// or keeping knowledge fresh until the next sitting.

export type ExamCode = 'uz-admission' | 'uz-certificate-math';
export const EXAM_CODES: readonly ExamCode[] = ['uz-certificate-math', 'uz-admission'];
export const CERTIFICATE_GRADES: readonly CertificateGrade[] = ['A+', 'A', 'B+', 'B', 'C+', 'C'];

export interface Milestone {
  id: string;
  exam_code: ExamCode;
  sitting_date: string;
  target_points: number | null;
  target_grade: CertificateGrade | null;
  status: 'planned' | 'done' | 'skipped';
  result_points: number | null;
  /** `none`: sat the certificate but scored below the lowest grade. */
  result_grade: CertificateGrade | 'none' | null;
}

export type Suggestion =
  | { kind: 'retake_certificate'; from: CertificateGrade | null; to: CertificateGrade }
  | { kind: 'certificate_counts'; grade: CertificateGrade; points: { section_id: string; points: number }[] }
  | { kind: 'plan_admission' }
  | { kind: 'plan_certificate' }
  | { kind: 'keep_reviewing' };

/** The nearest planned exam on or after today (dates are YYYY-MM-DD). */
export function nextMilestone(milestones: readonly Milestone[], today: string): Milestone | null {
  return milestones.filter((row) => row.status === 'planned' && row.sitting_date >= today).sort((a, b) => a.sitting_date.localeCompare(b.sitting_date))[0] ?? null;
}

/** Planned exams whose date has passed and that still need a result. */
export function awaitingResult(milestones: readonly Milestone[], today: string): Milestone[] {
  return milestones.filter((row) => row.status === 'planned' && row.sitting_date < today);
}

const better = (a: CertificateGrade, b: CertificateGrade) => CERTIFICATE_GRADES.indexOf(a) < CERTIFICATE_GRADES.indexOf(b);

/** What to aim for next, from the whole path. Never empty: at worst, keep reviewing. */
export function suggestNext(milestones: readonly Milestone[], certificate: CertificateFormat, today: string): Suggestion[] {
  const suggestions: Suggestion[] = [];
  const planned = (code: ExamCode) => milestones.some((row) => row.exam_code === code && row.status === 'planned' && row.sitting_date >= today);
  const certificates = milestones.filter((row) => row.exam_code === 'uz-certificate-math' && row.status === 'done');
  const best = certificates.map((row) => row.result_grade).filter((grade): grade is CertificateGrade => (CERTIFICATE_GRADES as readonly unknown[]).includes(grade)).sort((a, b) => CERTIFICATE_GRADES.indexOf(a) - CERTIFICATE_GRADES.indexOf(b))[0] ?? null;
  if (best) {
    const points = ['compulsory_math', 'specialised_1', 'specialised_2']
      .map((section_id) => ({ section_id, points: certificateAdmissionPoints(certificate, section_id, best) }))
      .filter((row): row is { section_id: string; points: number } => row.points !== null);
    suggestions.push({ kind: 'certificate_counts', grade: best, points });
  }
  // A certificate below A leaves admission points on the table, and it can be retaken.
  const certificateAttempted = certificates.length > 0;
  if (!planned('uz-certificate-math') && (best === null ? certificateAttempted : better('A', best))) {
    suggestions.push({ kind: 'retake_certificate', from: best, to: 'A' });
  }
  if (!certificateAttempted && !planned('uz-certificate-math')) suggestions.push({ kind: 'plan_certificate' });
  if (!planned('uz-admission') && !milestones.some((row) => row.exam_code === 'uz-admission' && row.status === 'done')) suggestions.push({ kind: 'plan_admission' });
  if (!suggestions.some((row) => row.kind !== 'certificate_counts')) suggestions.push({ kind: 'keep_reviewing' });
  return suggestions;
}

/** Consecutive active days ending today, or yesterday when today has no activity yet. */
export function streak(activeDays: readonly string[], today: string): { current: number; best: number; active_today: boolean } {
  const days = [...new Set(activeDays)].sort();
  const step = (day: string, delta: number) => new Date(Date.parse(`${day}T00:00:00Z`) + delta * 86_400_000).toISOString().slice(0, 10);
  let best = 0, run = 0, previous = '';
  for (const day of days) {
    run = previous && step(previous, 1) === day ? run + 1 : 1;
    best = Math.max(best, run);
    previous = day;
  }
  const set = new Set(days), activeToday = set.has(today);
  let current = 0;
  for (let day = activeToday ? today : step(today, -1); set.has(day); day = step(day, -1)) current++;
  return { current, best, active_today: activeToday };
}
