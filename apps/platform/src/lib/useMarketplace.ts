import { useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';
import {
  commaList,
  emptyJob,
  emptyProfile,
  errorText,
  loadRecovery,
  marketplace,
  MarketplaceError,
  nullableNumber,
  profileForm,
  record,
  rows,
  saveRecovery,
  session,
  uuid,
  validApplication,
  validJob,
  validManagedJob,
  validProfile,
  validTeacher,
  validTenant,
} from './marketplace';
import type {
  Application,
  Job,
  JobForm,
  ManagedJob,
  Pending,
  Profile,
  ProfileForm,
  Teacher,
  Tenant,
} from './marketplace';
type Resource<T> = { data: T[]; loading: boolean; error: string };
const resource = <T>(): Resource<T> => ({ data: [], loading: true, error: '' });
const invalidReceipt = () =>
  new MarketplaceError(
    'Could not confirm the save. Your original request is retained; retry confirmation.',
    502,
  );

export function useMarketplace() {
  const [actor, setActor] = useState('');
  const actorRef = useRef('');
  const epoch = useRef(0);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState('');
  const [reload, setReload] = useState(0);
  const [teachers, setTeachers] = useState(resource<Teacher>);
  const [jobs, setJobs] = useState(resource<Job>);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileReady, setProfileReady] = useState(false);
  const [profileDraft, setProfileDraft] = useState<ProfileForm>(emptyProfile);
  const [draftRevision, setDraftRevision] = useState(0);
  const profileHydrated = useRef(false);
  const [jobDraft, setJobDraft] = useState<JobForm>(emptyJob);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [applications, setApplications] = useState<Application[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState('');
  const [privateLoading, setPrivateLoading] = useState(false);
  const [privateError, setPrivateError] = useState('');
  const [ready, setReady] = useState(false);
  const [ownedJobs, setOwnedJobs] = useState(resource<ManagedJob>);
  const [reviewJob, setReviewJob] = useState('');
  const [candidates, setCandidates] = useState(resource<Application>);
  const [candidateReload, setCandidateReload] = useState(0);
  const [pending, setPending] = useState<Pending | null>(null);
  const pendingRef = useRef<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [conflict, setConflict] = useState(false);
  const refresh = () => setReload((v) => v + 1);

  useEffect(() => {
    let active = true;
    const restore = (id: string) => {
      if (!active) return;
      setAuthReady(true);
      setAuthError('');
      if (actorRef.current === id && epoch.current !== 0) return;
      if (actorRef.current && actorRef.current !== id) saveRecovery(actorRef.current, null);
      epoch.current += 1;
      actorRef.current = id;
      setActor(id);
      setProfile(null);
      setProfileReady(false);
      profileHydrated.current = false;
      setProfileDraft(emptyProfile);
      setDraftRevision(0);
      setJobDraft(emptyJob);
      setNotes({});
      setApplications([]);
      setTenants([]);
      setTenantId('');
      setReviewJob('');
      setOwnedJobs(resource());
      setCandidates(resource());
      setReady(false);
      setPrivateError('');
      setError('');
      setNotice('');
      setConflict(false);
      busyRef.current = false;
      setBusy(false);
      const recovered = id ? loadRecovery(id) : null;
      pendingRef.current = recovered;
      setPending(recovered);
      if (recovered?.action === 'upsert_profile') {
        const p = recovered.payload;
        if (
          typeof p.full_name === 'string' && typeof p.bio === 'string' && Array.isArray(p.subjects) &&
          Array.isArray(p.languages) && Array.isArray(p.certifications)
        ) {
          setProfileDraft({
            ...emptyProfile,
            full_name: p.full_name,
            bio: p.bio,
            subjects: p.subjects as string[],
            languages: p.languages.join(', '),
            certifications: p.certifications.join(', '),
            location: String(p.location ?? ''),
            hourly_rate: p.hourly_rate == null ? '' : String(p.hourly_rate),
            experience_years: p.experience_years == null ? '' : String(p.experience_years),
            available: p.available === true,
            is_public: p.is_public === true,
          });
          profileHydrated.current = true;
          setDraftRevision(Number(p.expected_revision));
        }
      }
      if (recovered?.action === 'post_job') {
        const p = recovered.payload;
        setJobDraft({
          ...emptyJob,
          title: String(p.title ?? ''),
          description: String(p.description ?? ''),
          subjects: Array.isArray(p.subjects) ? p.subjects as string[] : [],
          employment_type: String(p.employment_type ?? 'part_time'),
          salary_min: p.salary_min == null ? '' : String(p.salary_min),
          salary_max: p.salary_max == null ? '' : String(p.salary_max),
          location: String(p.location ?? ''),
          remote_ok: p.remote_ok === true,
          expires_in_days: String(p.expires_in_days ?? 30),
        });
      }
      if (recovered?.action === 'apply' && uuid(recovered.payload.listing_id)) {
        setNotes({ [recovered.payload.listing_id]: String(recovered.payload.cover_note ?? '') });
      }
    };
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, data) =>
      restore(data?.user.id ?? '')
    );
    const initialEpoch = epoch.current;
    session().then(({ data, error: failure }) => {
      if (!active || epoch.current !== initialEpoch) return;
      if (failure) throw failure;
      restore(data.session?.user.id ?? '');
    })
      .catch(() => {
        if (active && epoch.current === initialEpoch) {
          setAuthReady(true);
          setAuthError('Could not restore your session. Retry loading.');
        }
      });
    return () => {
      active = false;
      epoch.current += 1;
      subscription.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let active = true;
    setTeachers((v) => ({ ...v, loading: true, error: '' }));
    setJobs((v) => ({ ...v, loading: true, error: '' }));
    marketplace('teachers').then(({ result }) => {
      const data = rows(result.teachers, validTeacher);
      if (active) setTeachers({ data, loading: false, error: '' });
    }).catch((e) => {
      if (active) setTeachers((v) => ({ ...v, loading: false, error: errorText(e) }));
    });
    marketplace('jobs').then(({ result }) => {
      const data = rows(result.jobs, validJob);
      if (active) setJobs({ data, loading: false, error: '' });
    }).catch((e) => {
      if (active) setJobs((v) => ({ ...v, loading: false, error: errorText(e) }));
    });
    return () => {
      active = false;
    };
  }, [reload]);

  useEffect(() => {
    if (!actor) return;
    let active = true;
    const generation = epoch.current;
    setPrivateLoading(true);
    setPrivateError('');
    setReady(false);
    Promise.all([
      marketplace('get_my_profile', {}, actor),
      marketplace('my_applications', {}, actor),
      marketplace('manageable_tenants', {}, actor),
    ])
      .then(([p, a, t]) => {
        if (!active || epoch.current !== generation) return;
        if (!p.ready || !a.ready || !t.ready) {
          throw new MarketplaceError(
            'Saving is unavailable during the Marketplace update. Please retry shortly.',
          );
        }
        if (p.result.profile !== null && !validProfile(p.result.profile)) throw invalidReceipt();
        const current = p.result.profile as Profile | null;
        const apps = rows(a.result.applications, validApplication);
        const centers = rows(t.result.tenants, validTenant);
        setProfile(current);
        setProfileReady(true);
        setApplications(apps);
        setTenants(centers);
        setReady(true);
        if (!profileHydrated.current) {
          setProfileDraft(current ? profileForm(current) : emptyProfile);
          setDraftRevision(current?.revision ?? 0);
          profileHydrated.current = true;
        }
        setTenantId((old) =>
          centers.some((t) => t.id === old) ? old : centers.length === 1 ? centers[0].id : ''
        );
      }).catch((e) => {
        if (active && epoch.current === generation) setPrivateError(errorText(e));
      })
      .finally(() => {
        if (active && epoch.current === generation) setPrivateLoading(false);
      });
    return () => {
      active = false;
    };
  }, [actor, reload]);

  useEffect(() => {
    setReviewJob('');
    setCandidates({ data: [], loading: false, error: '' });
    if (!actor || !tenantId || !ready) {
      setOwnedJobs({ data: [], loading: false, error: '' });
      return;
    }
    let active = true;
    const generation = epoch.current;
    setOwnedJobs(resource());
    marketplace('my_jobs', { tenant_id: tenantId }, actor).then(({ result, ready: supported }) => {
      if (!supported) throw invalidReceipt();
      const data = rows(result.jobs, validManagedJob);
      if (active && epoch.current === generation) setOwnedJobs({ data, loading: false, error: '' });
    }).catch((e) => {
      if (active && epoch.current === generation) {
        setOwnedJobs({ data: [], loading: false, error: errorText(e) });
      }
    });
    return () => {
      active = false;
    };
  }, [actor, tenantId, ready, reload]);

  useEffect(() => {
    if (!actor || !reviewJob || !ready) {
      setCandidates({ data: [], loading: false, error: '' });
      return;
    }
    let active = true;
    const generation = epoch.current;
    setCandidates(resource());
    marketplace('list_applications', { job_id: reviewJob }, actor).then(({ result, ready: supported }) => {
      if (!supported) throw invalidReceipt();
      const data = rows(result.applications, validApplication);
      if (data.some((a) => a.listing_id !== reviewJob || !a.teacher_profiles)) throw invalidReceipt();
      if (active && epoch.current === generation) setCandidates({ data, loading: false, error: '' });
    }).catch((e) => {
      if (active && epoch.current === generation) {
        setCandidates({ data: [], loading: false, error: errorText(e) });
      }
    });
    return () => {
      active = false;
    };
  }, [actor, reviewJob, ready, candidateReload]);

  async function execute(next: Pending) {
    if (!actor || !ready || busyRef.current || (pendingRef.current && pendingRef.current !== next)) return;
    const generation = epoch.current;
    const owner = actor;
    setError('');
    setNotice('');
    if (!saveRecovery(owner, next)) {
      setError('Could not retain your request in this browser. Enable tab storage before saving.');
      return;
    }
    pendingRef.current = next;
    setPending(next);
    busyRef.current = true;
    setBusy(true);
    try {
      const { result, ready: supported } = await marketplace(next.action, next.payload, owner);
      if (epoch.current !== generation || actorRef.current !== owner) return;
      if (!supported) throw invalidReceipt();
      if (next.action === 'upsert_profile') {
        if (
          !validProfile(result.profile) || result.request_id !== next.payload.request_id ||
          result.profile.revision !== Number(next.payload.expected_revision) + 1 ||
          result.profile.full_name !== String(next.payload.full_name).trim() ||
          result.profile.is_public !== next.payload.is_public
        ) throw invalidReceipt();
        const confirmed = result.profile;
        setDraftRevision(confirmed.revision);
        setProfile((old) => !old || old.revision <= confirmed.revision ? confirmed : old);
        setNotice('Profile save confirmed.');
        setConflict(false);
      } else if (next.action === 'post_job') {
        if (
          !record(result.job) || !uuid(result.job.id) || result.job.request_id !== next.payload.request_id ||
          result.job.title !== String(next.payload.title).trim()
        ) throw invalidReceipt();
        setJobDraft(emptyJob);
        setNotice('Job posting confirmed. It is available to applicants while open and before its expiry.');
      } else if (next.action === 'apply') {
        if (
          !record(result.application) || !uuid(result.application.id) ||
          result.application.listing_id !== next.payload.listing_id ||
          !['pending', 'shortlisted', 'rejected', 'hired'].includes(String(result.application.status))
        ) throw invalidReceipt();
        const id = next.payload.listing_id as string;
        setNotes((old) => ({ ...old, [id]: '' }));
        setNotice('Application confirmed. Resending keeps the original application and hiring status.');
      } else if (next.action === 'close_job') {
        if (
          result.ok !== true || !record(result.job) || result.job.id !== next.payload.job_id ||
          result.job.status !== 'closed'
        ) throw invalidReceipt();
        setNotice('Listing closed. Existing applications remain available to its managers.');
      } else {
        if (
          result.ok !== true || !record(result.decision) ||
          result.decision.request_id !== next.payload.request_id ||
          result.decision.application_id !== next.payload.application_id ||
          result.decision.from_status !== next.payload.expected_status ||
          result.decision.to_status !== next.payload.status || !record(result.application) ||
          result.application.id !== next.payload.application_id ||
          !['pending', 'shortlisted', 'rejected', 'hired'].includes(String(result.application.status))
        ) throw invalidReceipt();
        const status = result.application.status as string;
        setCandidates((v) => ({
          ...v,
          data: v.data.map((a) => a.id === next.payload.application_id ? { ...a, status } : a),
        }));
        setNotice(`Hiring decision confirmed. Current status: ${status}.`);
      }
      saveRecovery(owner, null);
      pendingRef.current = null;
      setPending(null);
      if (next.action !== 'update_application_status') refresh();
    } catch (e) {
      if (epoch.current !== generation || actorRef.current !== owner) return;
      setError(errorText(e));
      // These statuses are explicit refusals. Ambiguous network/5xx/invalid
      // receipts retain the exact request, blocking replacement writes.
      if (e instanceof MarketplaceError && [400, 403, 404, 409].includes(e.status)) {
        saveRecovery(owner, null);
        pendingRef.current = null;
        setPending(null);
        if (e.status === 409 && next.action === 'upsert_profile') setConflict(true);
      }
    } finally {
      if (epoch.current === generation) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  }
  const saveProfile = () =>
    execute({
      action: 'upsert_profile',
      payload: {
        ...profileDraft,
        languages: commaList(profileDraft.languages),
        certifications: commaList(profileDraft.certifications),
        hourly_rate: nullableNumber(profileDraft.hourly_rate),
        experience_years: nullableNumber(profileDraft.experience_years),
        expected_revision: draftRevision,
        request_id: crypto.randomUUID(),
      },
    });
  const postJob = () =>
    execute({
      action: 'post_job',
      payload: {
        ...jobDraft,
        tenant_id: tenantId,
        salary_min: nullableNumber(jobDraft.salary_min),
        salary_max: nullableNumber(jobDraft.salary_max),
        expires_in_days: Number(jobDraft.expires_in_days),
        request_id: crypto.randomUUID(),
      },
    });
  const apply = (listingId: string) =>
    execute({ action: 'apply', payload: { listing_id: listingId, cover_note: notes[listingId] ?? '' } });
  const closeJob = (jobId: string) => execute({ action: 'close_job', payload: { job_id: jobId } });
  const decide = (application: Application, status: string) =>
    execute({
      action: 'update_application_status',
      payload: {
        application_id: application.id,
        expected_status: application.status,
        status,
        request_id: crypto.randomUUID(),
      },
    });
  const reloadProfile = async () => {
    if (!actor || busyRef.current || pendingRef.current) return;
    const generation = epoch.current;
    try {
      const { result, ready: supported } = await marketplace('get_my_profile', {}, actor);
      if (!supported || (result.profile !== null && !validProfile(result.profile))) throw invalidReceipt();
      if (generation !== epoch.current) return;
      const p = result.profile as Profile | null;
      setProfile(p);
      setProfileDraft(p ? profileForm(p) : emptyProfile);
      setDraftRevision(p?.revision ?? 0);
      setConflict(false);
      setError('');
      setNotice('Current saved profile loaded. Review it before saving.');
    } catch (e) {
      if (generation === epoch.current) setError(errorText(e));
    }
  };
  return {
    actor,
    authReady,
    authError,
    teachers,
    jobs,
    profile,
    profileReady,
    profileDraft,
    setProfileDraft,
    jobDraft,
    setJobDraft,
    notes,
    setNotes,
    applications,
    tenants,
    tenantId,
    setTenantId,
    privateLoading,
    privateError,
    ready,
    ownedJobs,
    reviewJob,
    setReviewJob,
    candidates,
    pending,
    busy,
    error,
    notice,
    conflict,
    refresh,
    refreshCandidates: () => setCandidateReload((v) => v + 1),
    saveProfile,
    postJob,
    apply,
    closeJob,
    decide,
    reloadProfile,
    retry: () => pendingRef.current && execute(pendingRef.current),
  };
}
