import { edge } from './api';
import type { CefrLevel } from './skills';

/** The skills the placement test and the monthly check measure, in certificate order. */
export const CERTIFICATE_SKILLS = ['reading', 'listening', 'writing', 'grammar'] as const;
export type CertificateSkill = (typeof CERTIFICATE_SKILLS)[number];

export type Certificate = {
  code: string;
  display_name: string;
  overall: CefrLevel;
  per_skill: Partial<Record<CertificateSkill, CefrLevel>>;
  measured_by: 'placement' | 'check';
  measured_at: string;
  activities_count: number;
  issued_at: string;
};

export type OwnCertificate = Certificate & { revoked_at: string | null };

export type LatestMeasurement =
  | ({ status: 'ok' } & Pick<Certificate, 'overall' | 'per_skill' | 'measured_by' | 'measured_at'>)
  | { status: 'self_assessed'; measured_at: string }
  | { status: 'none' };

export type CertificatesResponse = {
  latest: LatestMeasurement;
  default_name: string | null;
  certificates: OwnCertificate[];
};

export const getCertificates = (signal?: AbortSignal) =>
  edge<CertificatesResponse>('hub', '/certificates', { query: { language_code: 'en' }, signal });

export const issueCertificate = (displayName: string) =>
  edge<{ ok: boolean; created: boolean; certificate: OwnCertificate }>('hub', '/certificate', {
    query: { language_code: 'en' },
    body: { display_name: displayName },
  });

export const revokeCertificate = (code: string) =>
  edge<{ ok: boolean; certificate: OwnCertificate }>('hub', '/certificate/revoke', {
    query: { language_code: 'en' },
    body: { code },
  });

/** Works signed out: the hub answers this route before checking for a session. */
export const getPublicCertificate = (code: string, signal?: AbortSignal) =>
  edge<{ ok: boolean; certificate: Certificate }>('hub', `/public/certificate/${encodeURIComponent(code)}`, { signal });

/** "ABCDEFGHJKMN" → "ABCD-EFGH-JKMN". */
export const formatCode = (code: string): string => code.match(/.{1,4}/g)?.join('-') ?? code;

/** The public page for a certificate, on whichever host is serving the app. */
export const certificateUrl = (code: string): string => {
  const origin = typeof window === 'undefined' ? 'https://english.schood.online' : window.location.origin;
  return `${origin}/c/${formatCode(code)}`;
};

export const sameMoment = (a: string, b: string): boolean => Date.parse(a) === Date.parse(b);
