import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const edgeBase = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
type Teacher = { id: string; full_name: string; bio: string | null; subjects: string[]; languages: string[]; location: string | null; hourly_rate: number | null; currency: string; experience_years: number | null; certifications: string[]; available: boolean; verified: boolean };
type Job = { id: string; title: string; description: string | null; subjects: string[]; employment_type: string; salary_min: number | null; salary_max: number | null; currency: string; location: string | null; remote_ok: boolean; created_at: string; tenants?: { name: string } };
type Profile = { id: string; full_name: string; bio: string | null; avatar_url: string | null; subjects: string[]; languages: string[]; location: string | null; timezone: string | null; hourly_rate: number | null; currency: string; experience_years: number | null; certifications: string[]; available: boolean; is_public: boolean };

const SUBJECTS = ['ielts', 'sat', 'toefl', 'english', 'grammar', 'speaking', 'writing', 'reading'];
const EMPLOYMENT = { full_time: 'Full-time', part_time: 'Part-time', contract: 'Contract', freelance: 'Freelance' };

export const TeacherMarketplacePage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const defaultTab = searchParams.get('tab') as 'teachers' | 'jobs' | 'profile' | 'post' || 'teachers';
  const [tab, setTab] = useState(defaultTab);
  const [token, setToken] = useState<string | null>(null);
  const [_userId, setUserId] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [myProfile, setMyProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileForm, setProfileForm] = useState({ full_name: '', bio: '', subjects: [] as string[], location: '', hourly_rate: '', experience_years: '', available: true, is_public: true, certifications: [] as string[] });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [jobForm, setJobForm] = useState({ title: '', description: '', subjects: [] as string[], employment_type: 'part_time', salary_min: '', salary_max: '', location: '', remote_ok: false });
  const [postingJob, setPostingJob] = useState(false);
  const [myApps, setMyApps] = useState<any[]>([]);
  const [applyingTo, setApplyingTo] = useState<string | null>(null);
  const [coverNote, setCoverNote] = useState('');
  const [filterSubject, setFilterSubject] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) { setLoading(false); return; }
      const tok = data.session.access_token;
      setToken(tok); setUserId(data.session.user.id);

      // Load everything in parallel
      const [tr, jo, prof, acads] = await Promise.all([
        fetch(`${edgeBase}/teacher-marketplace?action=teachers`, { headers: { Authorization: `Bearer ${tok}` } }).then((r) => r.json()),
        fetch(`${edgeBase}/teacher-marketplace?action=jobs`, { headers: { Authorization: `Bearer ${tok}` } }).then((r) => r.json()),
        fetch(`${edgeBase}/teacher-marketplace?action=get_my_profile`, { method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'get_my_profile' }) }).then((r) => r.json()),
        fetch(`${edgeBase}/academy?action=academies`, { headers: { Authorization: `Bearer ${tok}` } }).then((r) => r.json()),
      ]);
      setTeachers(tr.teachers ?? []); setJobs(jo.jobs ?? []);
      if (prof.profile) { setMyProfile(prof.profile); setProfileForm({ full_name: prof.profile.full_name, bio: prof.profile.bio ?? '', subjects: prof.profile.subjects ?? [], location: prof.profile.location ?? '', hourly_rate: prof.profile.hourly_rate !== null ? String(prof.profile.hourly_rate) : '', experience_years: prof.profile.experience_years !== null ? String(prof.profile.experience_years) : '', available: prof.profile.available, is_public: prof.profile.is_public, certifications: prof.profile.certifications ?? [] }); }
      setTenantId(acads.academies?.[0]?.id ?? null);

      if (prof.profile?.id) {
        fetch(`${edgeBase}/teacher-marketplace`, { method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'my_applications' }) }).then((r) => r.json()).then((d) => setMyApps(d.applications ?? []));
      }
      setLoading(false);
    });
  }, []);

  const saveProfile = async () => {
    if (!token) return;
    setSaving(true); setSaved(false);
    const res = await fetch(`${edgeBase}/teacher-marketplace`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'upsert_profile', ...profileForm, hourly_rate: profileForm.hourly_rate ? Number(profileForm.hourly_rate) : null, experience_years: profileForm.experience_years ? Number(profileForm.experience_years) : null }) }).then((r) => r.json());
    if (res.profile) { setMyProfile(res.profile); setSaved(true); }
    setSaving(false);
  };

  const postJob = async () => {
    if (!token || !tenantId || !jobForm.title) return;
    setPostingJob(true);
    const res = await fetch(`${edgeBase}/teacher-marketplace`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'post_job', tenant_id: tenantId, ...jobForm, salary_min: jobForm.salary_min ? Number(jobForm.salary_min) : null, salary_max: jobForm.salary_max ? Number(jobForm.salary_max) : null, expires_in_days: 30 }) }).then((r) => r.json());
    if (res.job) { setJobs((prev) => [res.job, ...prev]); setTab('jobs'); setJobForm({ title: '', description: '', subjects: [], employment_type: 'part_time', salary_min: '', salary_max: '', location: '', remote_ok: false }); }
    setPostingJob(false);
  };

  const apply = async (jobId: string) => {
    if (!token) { navigate('/auth?returnTo=/marketplace?tab=jobs', { replace: true }); return; }
    if (!myProfile) { setTab('profile'); return; }
    await fetch(`${edgeBase}/teacher-marketplace`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'apply', listing_id: jobId, cover_note: coverNote }) });
    setApplyingTo(null); setCoverNote('');
    const d = await fetch(`${edgeBase}/teacher-marketplace`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'my_applications' }) }).then((r) => r.json());
    setMyApps(d.applications ?? []);
  };

  const toggleSubject = (arr: string[], s: string, set: (v: string[]) => void) => set(arr.includes(s) ? arr.filter((x) => x !== s) : [...arr, s]);
  const fmtDate = (s: string) => new Date(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const fmtSalary = (min: number | null, max: number | null, cur: string) => min || max ? `${min ? min.toLocaleString() : '?'}–${max ? max.toLocaleString() : '?'} ${cur}` : 'Negotiable';

  const filteredTeachers = filterSubject ? teachers.filter((t) => t.subjects.includes(filterSubject)) : teachers;
  const TABS = [{ key: 'teachers', label: `Teachers (${filteredTeachers.length})` }, { key: 'jobs', label: `Jobs (${jobs.length})` }, { key: 'profile', label: myProfile ? 'My Profile' : 'Create Profile' }, ...(tenantId ? [{ key: 'post', label: 'Post a Job' }] : [])];

  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="text-gray-400">Loading…</div></div>;

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      <div className="bg-white border-b border-gray-200 px-4 py-5">
        <div className="max-w-4xl mx-auto">
          <button onClick={() => navigate(-1)} className="text-xs text-gray-400 mb-1 block">← Back</button>
          <h1 className="text-xl font-bold text-gray-900">Teacher Marketplace</h1>
          <p className="text-sm text-gray-500">Find teachers · Post jobs · Apply for positions</p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="flex gap-1 mb-6 border-b border-gray-200 overflow-x-auto">
          {TABS.map((t) => <button key={t.key} onClick={() => setTab(t.key as any)} className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap ${tab === t.key ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>{t.label}</button>)}
        </div>

        {/* Teachers */}
        {tab === 'teachers' && (
          <div className="space-y-4">
            <div className="flex gap-2 flex-wrap">
              <button onClick={() => setFilterSubject('')} className={`px-3 py-1.5 rounded-xl text-xs font-medium border ${!filterSubject ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>All</button>
              {SUBJECTS.map((s) => <button key={s} onClick={() => setFilterSubject(s === filterSubject ? '' : s)} className={`px-3 py-1.5 rounded-xl text-xs font-medium border capitalize ${filterSubject === s ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>{s}</button>)}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredTeachers.map((t) => (
                <div key={t.id} className="bg-white border border-gray-200 rounded-2xl p-5">
                  <div className="flex items-start justify-between">
                    <div><div className="font-semibold text-gray-900">{t.full_name}{t.verified && <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">✓ Verified</span>}</div>{t.location && <div className="text-xs text-gray-400 mt-0.5">📍 {t.location}</div>}</div>
                    {t.hourly_rate && <div className="text-sm font-bold text-gray-900">{t.hourly_rate.toLocaleString()} <span className="text-xs text-gray-400">{t.currency}/hr</span></div>}
                  </div>
                  {t.bio && <p className="text-sm text-gray-600 mt-2 line-clamp-2">{t.bio}</p>}
                  <div className="flex flex-wrap gap-1.5 mt-3">{t.subjects.map((s) => <span key={s} className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full capitalize">{s}</span>)}</div>
                  {t.experience_years && <div className="text-xs text-gray-400 mt-2">{t.experience_years} years experience</div>}
                </div>
              ))}
            </div>
            {filteredTeachers.length === 0 && <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-2xl text-gray-400">No teachers match this filter yet.</div>}
          </div>
        )}

        {/* Jobs */}
        {tab === 'jobs' && (
          <div className="space-y-3">
            {jobs.map((j) => {
              const applied = myApps.some((a) => a.job_listings?.title === j.title);
              return (
                <div key={j.id} className="bg-white border border-gray-200 rounded-2xl p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-gray-900">{j.title}</div>
                      <div className="text-sm text-gray-500 mt-0.5">{(j.tenants as any)?.name} · {EMPLOYMENT[j.employment_type as keyof typeof EMPLOYMENT] ?? j.employment_type}{j.remote_ok ? ' · Remote OK' : ''}</div>
                      {j.description && <p className="text-sm text-gray-600 mt-2 line-clamp-2">{j.description}</p>}
                      <div className="flex gap-2 mt-2 flex-wrap">{j.subjects.map((s) => <span key={s} className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full capitalize">{s}</span>)}</div>
                      <div className="text-xs text-gray-400 mt-2">{fmtSalary(j.salary_min, j.salary_max, j.currency)}{j.location ? ` · ${j.location}` : ''} · {fmtDate(j.created_at)}</div>
                    </div>
                    {applied ? <span className="shrink-0 text-xs bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded-xl">Applied</span> : (
                      applyingTo === j.id ? (
                        <div className="shrink-0 space-y-2 min-w-[200px]">
                          <textarea value={coverNote} onChange={(e) => setCoverNote(e.target.value)} rows={3} className="w-full border border-gray-300 rounded-xl px-2 py-1.5 text-xs focus:outline-none" placeholder="Optional cover note…" />
                          <div className="flex gap-2"><button onClick={() => setApplyingTo(null)} className="flex-1 border border-gray-200 rounded-xl py-1.5 text-xs hover:bg-gray-50">Cancel</button><button onClick={() => apply(j.id)} className="flex-1 bg-gray-900 text-white rounded-xl py-1.5 text-xs font-semibold hover:bg-black">Apply</button></div>
                        </div>
                      ) : (
                        <button onClick={() => { setApplyingTo(j.id); setCoverNote(''); }} className="shrink-0 px-4 py-2 bg-gray-900 text-white text-sm rounded-xl hover:bg-black">Apply</button>
                      )
                    )}
                  </div>
                </div>
              );
            })}
            {jobs.length === 0 && <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-2xl text-gray-400">No job listings yet.</div>}
          </div>
        )}

        {/* Profile */}
        {tab === 'profile' && (
          <div className="max-w-xl space-y-4">
            {saved && <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-800">Profile saved!</div>}
            <div><label className="block text-xs font-semibold text-gray-600 mb-1">Full Name *</label><input value={profileForm.full_name} onChange={(e) => setProfileForm((f) => ({ ...f, full_name: e.target.value }))} className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none" /></div>
            <div><label className="block text-xs font-semibold text-gray-600 mb-1">Bio</label><textarea value={profileForm.bio} onChange={(e) => setProfileForm((f) => ({ ...f, bio: e.target.value }))} rows={4} className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none" /></div>
            <div><label className="block text-xs font-semibold text-gray-600 mb-2">Subjects</label><div className="flex flex-wrap gap-2">{SUBJECTS.map((s) => <button key={s} type="button" onClick={() => toggleSubject(profileForm.subjects, s, (v) => setProfileForm((f) => ({ ...f, subjects: v })))} className={`px-3 py-1.5 rounded-xl text-xs font-medium border capitalize ${profileForm.subjects.includes(s) ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>{s}</button>)}</div></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs font-semibold text-gray-600 mb-1">Location</label><input value={profileForm.location} onChange={(e) => setProfileForm((f) => ({ ...f, location: e.target.value }))} className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none" placeholder="Tashkent" /></div>
              <div><label className="block text-xs font-semibold text-gray-600 mb-1">Hourly Rate (UZS)</label><input type="number" value={profileForm.hourly_rate} onChange={(e) => setProfileForm((f) => ({ ...f, hourly_rate: e.target.value }))} className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none" placeholder="200000" /></div>
              <div><label className="block text-xs font-semibold text-gray-600 mb-1">Years Experience</label><input type="number" value={profileForm.experience_years} onChange={(e) => setProfileForm((f) => ({ ...f, experience_years: e.target.value }))} className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none" /></div>
            </div>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={profileForm.available} onChange={(e) => setProfileForm((f) => ({ ...f, available: e.target.checked }))} />Available for hire</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={profileForm.is_public} onChange={(e) => setProfileForm((f) => ({ ...f, is_public: e.target.checked }))} />Public profile</label>
            </div>
            <button onClick={saveProfile} disabled={saving || !profileForm.full_name} className="w-full bg-gray-900 text-white py-3 rounded-xl font-semibold text-sm disabled:bg-gray-300 hover:bg-black">{saving ? 'Saving…' : 'Save Profile'}</button>
          </div>
        )}

        {/* Post job */}
        {tab === 'post' && (
          <div className="max-w-xl space-y-4">
            {!tenantId && <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">No academy found. Create an academy first.</div>}
            <div><label className="block text-xs font-semibold text-gray-600 mb-1">Job Title *</label><input value={jobForm.title} onChange={(e) => setJobForm((f) => ({ ...f, title: e.target.value }))} className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none" placeholder="IELTS Teacher (Part-time)" /></div>
            <div><label className="block text-xs font-semibold text-gray-600 mb-1">Description</label><textarea value={jobForm.description} onChange={(e) => setJobForm((f) => ({ ...f, description: e.target.value }))} rows={4} className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none" /></div>
            <div><label className="block text-xs font-semibold text-gray-600 mb-2">Subjects</label><div className="flex flex-wrap gap-2">{SUBJECTS.map((s) => <button key={s} type="button" onClick={() => toggleSubject(jobForm.subjects, s, (v) => setJobForm((f) => ({ ...f, subjects: v })))} className={`px-3 py-1.5 rounded-xl text-xs font-medium border capitalize ${jobForm.subjects.includes(s) ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>{s}</button>)}</div></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs font-semibold text-gray-600 mb-1">Employment Type</label><select value={jobForm.employment_type} onChange={(e) => setJobForm((f) => ({ ...f, employment_type: e.target.value }))} className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm">{Object.entries(EMPLOYMENT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
              <div><label className="block text-xs font-semibold text-gray-600 mb-1">Location</label><input value={jobForm.location} onChange={(e) => setJobForm((f) => ({ ...f, location: e.target.value }))} className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none" /></div>
              <div><label className="block text-xs font-semibold text-gray-600 mb-1">Salary Min (UZS)</label><input type="number" value={jobForm.salary_min} onChange={(e) => setJobForm((f) => ({ ...f, salary_min: e.target.value }))} className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none" /></div>
              <div><label className="block text-xs font-semibold text-gray-600 mb-1">Salary Max (UZS)</label><input type="number" value={jobForm.salary_max} onChange={(e) => setJobForm((f) => ({ ...f, salary_max: e.target.value }))} className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none" /></div>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={jobForm.remote_ok} onChange={(e) => setJobForm((f) => ({ ...f, remote_ok: e.target.checked }))} />Remote OK</label>
            <button onClick={postJob} disabled={postingJob || !jobForm.title || !tenantId} className="w-full bg-gray-900 text-white py-3 rounded-xl font-semibold text-sm disabled:bg-gray-300 hover:bg-black">{postingJob ? 'Posting…' : 'Post Job (30 days)'}</button>
          </div>
        )}
      </div>
    </div>
  );
};
