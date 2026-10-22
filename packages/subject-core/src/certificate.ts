// National subject certificates: a Rasch-scaled score maps to a grade, and the
// grade converts to admission points for the section the subject is used in.

export type CertificateGrade = 'A+' | 'A' | 'B+' | 'B' | 'C+' | 'C';

export interface CertificateFormat {
  code: string;
  version: string;
  status: 'draft' | 'published';
  subject: string;
  source_url: string | null;
  checked_at: string | null;
  sources: { url: string; kind: 'official' | 'secondary'; note: string }[];
  tasks: number | null;
  duration_minutes: number | null;
  scale_max: number;
  validity_years: number | null;
  /** Lowest scaled score for each grade, highest grade first. Below the last one there is no certificate. */
  grades: { grade: CertificateGrade; min_score: number }[];
  /** Admission points each grade gives, per admission-test section. */
  admission_points: Record<string, Partial<Record<CertificateGrade, number>>>;
  verify: string[];
}

export function certificateGrade(format: CertificateFormat, score: number): CertificateGrade | null {
  if (!(score >= 0 && score <= format.scale_max)) return null;
  return format.grades.find((row) => score >= row.min_score)?.grade ?? null;
}

/** Admission points the certificate gives in a section, or null when it gives none. */
export function certificateAdmissionPoints(format: CertificateFormat, sectionId: string, grade: CertificateGrade | null): number | null {
  if (!grade) return null;
  return format.admission_points[sectionId]?.[grade] ?? null;
}

export function certificateProblems(format: CertificateFormat): string[] {
  const problems: string[] = [];
  for (let i = 1; i < format.grades.length; i++) {
    if (format.grades[i].min_score >= format.grades[i - 1].min_score) problems.push(`grades.${format.grades[i].grade}`);
  }
  for (const [section, points] of Object.entries(format.admission_points)) {
    let previous = Infinity;
    for (const { grade } of format.grades) {
      const value = points[grade];
      if (value === undefined) continue;
      if (value > previous) problems.push(`admission_points.${section}.${grade}`);
      previous = value;
    }
  }
  return problems;
}
