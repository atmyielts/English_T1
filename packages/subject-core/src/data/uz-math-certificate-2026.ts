import type { CertificateFormat } from '../certificate.ts';

// The national Mathematics certificate. Draft: every number below comes from
// prep sites that report it, so check the agency's specification before publishing.
export const UZ_MATH_CERTIFICATE_2026: CertificateFormat = {
  code: 'uz-certificate-math',
  version: '2026.1',
  status: 'draft',
  subject: 'math',
  source_url: null,
  checked_at: '2026-10-22',
  sources: [
    {
      url: 'https://testmakon.uz/milliy-sertifikat/matematika/',
      kind: 'secondary',
      note: 'Rasch model on a 75-point scale, grade bands, 3-year validity, conversion to admission points, no calculator.',
    },
    {
      url: 'https://5ball.uz/matematika-sertifikat/',
      kind: 'secondary',
      note: 'Mock format of 45 tasks in 150 minutes; same grade bands.',
    },
  ],
  tasks: 45,
  duration_minutes: 150,
  scale_max: 75,
  validity_years: 3,
  grades: [
    { grade: 'A+', min_score: 70 },
    { grade: 'A', min_score: 65 },
    { grade: 'B+', min_score: 60 },
    { grade: 'B', min_score: 55 },
    { grade: 'C+', min_score: 50 },
    { grade: 'C', min_score: 46 },
  ],
  admission_points: {
    compulsory_math: { 'A+': 11, A: 11, 'B+': 11, B: 11, 'C+': 11, C: 11 },
    specialised_1: { 'A+': 93, A: 93, 'B+': 85.8, B: 78.7, 'C+': 71.5, C: 65.8 },
    specialised_2: { 'A+': 63, A: 63, 'B+': 58.2, B: 53.3, 'C+': 48.5, C: 44.6 },
  },
  verify: [
    'official specification',
    'task count, task types and duration',
    'B+ in the first specialised subject (sources give 85.8 and 85.9)',
    'session dates',
  ],
};
