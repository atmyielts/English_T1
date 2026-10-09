import { supabase } from './supabase';

export type Teacher = {
  id: string;
  full_name: string;
  bio: string | null;
  subjects: string[];
  languages: string[];
  location: string | null;
  hourly_rate: number | null;
  currency: string;
  experience_years: number | null;
  certifications: string[];
  available: boolean;
  verified: boolean;
};
export type Profile = Teacher & { revision: number; is_public: boolean };
export type Job = {
  id: string;
  title: string;
  description: string | null;
  subjects: string[];
  employment_type: string;
  salary_min: number | null;
  salary_max: number | null;
  currency: string;
  location: string | null;
  remote_ok: boolean;
  created_at: string;
  expires_at: string | null;
  tenants: { name: string };
};
export type ManagedJob = Pick<Job, 'id' | 'title' | 'employment_type' | 'created_at' | 'expires_at'> & {
  status: string;
  application_count: number;
};
export type Tenant = { id: string; name: string; role: string };
export type Application = {
  id: string;
  listing_id: string;
  status: string;
  cover_note: string | null;
  applied_at: string;
  job_listings?: { id: string; title: string; tenants: { name: string } };
  teacher_profiles?: Pick<
    Teacher,
    'full_name' | 'bio' | 'subjects' | 'experience_years' | 'hourly_rate' | 'location' | 'available'
  >;
};
export type ProfileForm = {
  full_name: string;
  bio: string;
  subjects: string[];
  languages: string;
  certifications: string;
  location: string;
  hourly_rate: string;
  experience_years: string;
  available: boolean;
  is_public: boolean;
};
export type JobForm = {
  title: string;
  description: string;
  subjects: string[];
  employment_type: string;
  salary_min: string;
  salary_max: string;
  location: string;
  remote_ok: boolean;
  expires_in_days: string;
};
export type Pending = { action: string; payload: Record<string, unknown> };
export const emptyProfile: ProfileForm = {
  full_name: '',
  bio: '',
  subjects: [],
  languages: '',
  certifications: '',
  location: '',
  hourly_rate: '',
  experience_years: '',
  available: true,
  is_public: false,
};
export const emptyJob: JobForm = {
  title: '',
  description: '',
  subjects: [],
  employment_type: 'part_time',
  salary_min: '',
  salary_max: '',
  location: '',
  remote_ok: false,
  expires_in_days: '30',
};
export const subjects = ['ielts', 'sat', 'toefl', 'english', 'grammar', 'speaking', 'writing', 'reading'];
export const employment: Record<string, string> = {
  full_time: 'Full-time',
  part_time: 'Part-time',
  contract: 'Contract',
  freelance: 'Freelance',
};
export const uuid = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
export const record = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const textArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');
const numberOrNull = (v: unknown) => v === null || (typeof v === 'number' && Number.isFinite(v) && v >= 0);
export const validTeacher = (v: unknown): v is Teacher =>
  record(v) && uuid(v.id) && typeof v.full_name === 'string' && textArray(v.subjects) &&
  textArray(v.languages) && textArray(v.certifications) && numberOrNull(v.hourly_rate) &&
  numberOrNull(v.experience_years) && typeof v.currency === 'string' && typeof v.available === 'boolean' &&
  typeof v.verified === 'boolean' && (v.bio === null || typeof v.bio === 'string') &&
  (v.location === null || typeof v.location === 'string');
export const validProfile = (v: unknown): v is Profile =>
  record(v) && Number.isSafeInteger(v.revision) && Number(v.revision) >= 1 &&
  typeof v.is_public === 'boolean' && validTeacher(v);
export const validJob = (v: unknown): v is Job =>
  record(v) && uuid(v.id) && typeof v.title === 'string' && textArray(v.subjects) &&
  typeof v.employment_type === 'string' && numberOrNull(v.salary_min) && numberOrNull(v.salary_max) &&
  typeof v.currency === 'string' && typeof v.remote_ok === 'boolean' && typeof v.created_at === 'string' &&
  record(v.tenants) && typeof v.tenants.name === 'string' &&
  (v.description === null || typeof v.description === 'string') &&
  (v.location === null || typeof v.location === 'string') &&
  (v.expires_at === null || typeof v.expires_at === 'string');
export const validManagedJob = (v: unknown): v is ManagedJob =>
  record(v) && uuid(v.id) && typeof v.title === 'string' && typeof v.employment_type === 'string' &&
  ['open', 'closed', 'filled'].includes(String(v.status)) && Number.isSafeInteger(v.application_count) &&
  Number(v.application_count) >= 0 && typeof v.created_at === 'string' &&
  (v.expires_at === null || typeof v.expires_at === 'string');
export const validTenant = (v: unknown): v is Tenant =>
  record(v) && uuid(v.id) && typeof v.name === 'string' && ['owner', 'admin'].includes(String(v.role));
export const validApplication = (v: unknown): v is Application =>
  record(v) && uuid(v.id) && uuid(v.listing_id) &&
  ['pending', 'shortlisted', 'rejected', 'hired'].includes(String(v.status)) &&
  typeof v.applied_at === 'string' && (v.cover_note === null || typeof v.cover_note === 'string') &&
  (v.job_listings === undefined ||
    (record(v.job_listings) && v.job_listings.id === v.listing_id &&
      typeof v.job_listings.title === 'string' && record(v.job_listings.tenants) &&
      typeof v.job_listings.tenants.name === 'string')) &&
  (v.teacher_profiles === undefined ||
    (record(v.teacher_profiles) && typeof v.teacher_profiles.full_name === 'string' &&
      textArray(v.teacher_profiles.subjects) && numberOrNull(v.teacher_profiles.experience_years) &&
      numberOrNull(v.teacher_profiles.hourly_rate)));
export class MarketplaceError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.status = status;
  }
}
export const errorText = (e: unknown) =>
  e instanceof MarketplaceError ? e.message : 'Connection interrupted. Keep your draft and retry.';
export function rows<T>(value: unknown, validate: (value: unknown) => value is T): T[] {
  if (!Array.isArray(value) || !value.every(validate)) {
    throw new MarketplaceError('Could not confirm these records. Retry loading.', 502);
  }
  return value;
}
export async function session() {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      supabase.auth.getSession(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new MarketplaceError('Could not restore your session. Retry loading.')),
          10_000,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
export async function marketplace(action: string, payload: Record<string, unknown> = {}, actor = '') {
  let token = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (actor) {
    const { data, error } = await session();
    if (error || !data.session || data.session.user.id !== actor) {
      throw new MarketplaceError('Your session changed. Sign in again to continue.', 401);
    }
    token = data.session.access_token;
  }
  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/teacher-marketplace`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
      'X-Marketplace-Client-Version': '2',
    },
    body: JSON.stringify({ ...payload, action }),
    signal: AbortSignal.timeout(15_000),
  });
  const result: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new MarketplaceError(
      record(result) && typeof result.error === 'string'
        ? result.error
        : 'Could not complete the request. Keep your draft and retry.',
      response.status,
    );
  }
  if (!record(result)) {
    throw new MarketplaceError('Could not confirm the result. Keep your draft and retry.', 502);
  }
  return { result, ready: response.headers.get('X-Marketplace-Version') === '2' };
}
export function profileForm(profile: Profile): ProfileForm {
  return {
    full_name: profile.full_name,
    bio: profile.bio ?? '',
    subjects: profile.subjects,
    languages: profile.languages.join(', '),
    certifications: profile.certifications.join(', '),
    location: profile.location ?? '',
    hourly_rate: profile.hourly_rate === null ? '' : String(profile.hourly_rate),
    experience_years: profile.experience_years === null ? '' : String(profile.experience_years),
    available: profile.available,
    is_public: profile.is_public,
  };
}
const key = (actor: string) => 'schood.marketplace.recovery.v1.' + actor;
export function loadRecovery(actor: string): Pending | null {
  try {
    const raw = sessionStorage.getItem(key(actor));
    if (!raw || raw.length > 60_000) return null;
    const v: unknown = JSON.parse(raw);
    if (!record(v) || !record(v.payload)) return null;
    const p = v.payload;
    if (
      v.action === 'upsert_profile' && uuid(p.request_id) && typeof p.full_name === 'string' &&
      typeof p.bio === 'string' &&
      textArray(p.subjects) && textArray(p.languages) && textArray(p.certifications) &&
      typeof p.location === 'string' &&
      numberOrNull(p.hourly_rate) && numberOrNull(p.experience_years) &&
      Number.isSafeInteger(p.expected_revision) &&
      typeof p.available === 'boolean' && typeof p.is_public === 'boolean'
    ) return { action: v.action, payload: p };
    if (
      v.action === 'post_job' && uuid(p.request_id) && uuid(p.tenant_id) && typeof p.title === 'string' &&
      typeof p.description === 'string' &&
      textArray(p.subjects) && typeof p.location === 'string' && typeof p.employment_type === 'string' &&
      typeof p.remote_ok === 'boolean' &&
      numberOrNull(p.salary_min) && numberOrNull(p.salary_max) && Number.isSafeInteger(p.expires_in_days)
    ) return { action: v.action, payload: p };
    if (v.action === 'apply' && uuid(p.listing_id) && typeof p.cover_note === 'string') {
      return { action: v.action, payload: p };
    }
    if (v.action === 'close_job' && uuid(p.job_id)) return { action: v.action, payload: p };
    if (
      v.action === 'update_application_status' && uuid(p.request_id) && uuid(p.application_id) &&
      ['shortlisted', 'rejected', 'hired'].includes(String(p.status)) &&
      ['pending', 'shortlisted', 'rejected', 'hired'].includes(String(p.expected_status))
    ) return { action: v.action, payload: p };
    return null;
  } catch {
    return null;
  }
}
export function saveRecovery(actor: string, pending: Pending | null) {
  try {
    if (pending) sessionStorage.setItem(key(actor), JSON.stringify(pending));
    else sessionStorage.removeItem(key(actor));
    return true;
  } catch {
    return false;
  }
}
export const nullableNumber = (v: string) => v.trim() === '' ? null : Number(v);
export const commaList = (v: string) => v.split(',').map((s) => s.trim()).filter(Boolean);
export const money = (min: number | null, max: number | null, currency: string) =>
  min === null && max === null
    ? 'Salary negotiable'
    : `${min === null ? 'Unspecified' : min.toLocaleString()} – ${
      max === null ? 'Unspecified' : max.toLocaleString()
    } ${currency}`;
