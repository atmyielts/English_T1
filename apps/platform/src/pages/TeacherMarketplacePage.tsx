import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMarketplace } from '../lib/useMarketplace';
import { SiteHeader } from '../components/layout/SiteHeader';
import { employment, money, subjects } from '../lib/marketplace';
import {
  marketplaceButton as button,
  marketplaceInput as input,
  MarketplaceJobForm,
  MarketplaceProfileForm,
  marketplaceSecondary as secondary,
} from '../components/platform/MarketplaceForms';

type Tab = 'teachers' | 'jobs' | 'profile' | 'post';
const tabs: { id: Tab; label: string }[] = [
  { id: 'teachers', label: 'Find teachers' },
  { id: 'jobs', label: 'Find jobs' },
  { id: 'profile', label: 'My profile' },
  { id: 'post', label: 'Employer workspace' },
];
const date = (v: string) =>
  new Date(v).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
const panel = 'min-w-0 rounded-2xl border border-gray-200 bg-white p-4 sm:p-6';
function LoadState(
  { loading, error, count, empty, retry }: {
    loading: boolean;
    error: string;
    count: number;
    empty: string;
    retry: () => void;
  },
) {
  if (loading) return <p role='status' className='py-5 text-sm text-gray-600'>Loading records…</p>;
  if (error) {
    return (
      <div role='alert' className='space-y-3 py-4 text-sm text-gray-800'>
        <p>{error}</p>
        <button onClick={retry} className={secondary}>Retry loading</button>
      </div>
    );
  }
  return count ? null : <p className='py-5 text-sm text-gray-600'>{empty}</p>;
}
export const TeacherMarketplacePage: React.FC = () => {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const rawTab = params.get('tab');
  const tab = tabs.some((t) => t.id === rawTab) ? rawTab as Tab : 'teachers';
  const setTab = (v: Tab) => setParams({ tab: v }, { replace: true });
  const [subject, setSubject] = useState('');
  const m = useMarketplace();
  const frozen = !m.ready || m.busy || Boolean(m.pending);
  const teacherRows = m.teachers.data.filter((t) => !subject || t.subjects.includes(subject));
  const signIn = () => navigate('/auth?returnTo=' + encodeURIComponent('/marketplace?tab=' + tab));
  const selectedJob = m.ownedJobs.data.find((j) => j.id === m.reviewJob);
  return (
    <main className='min-h-screen bg-gray-50 pb-12 text-gray-900'>
      <SiteHeader
        showLanguageSwitcher={false}
        navItems={[
          {
            id: 'home',
            label: 'Home',
            onClick: () => navigate('/'),
          },
          { id: 'plans', label: 'Plans', onClick: () => navigate('/plans') },
          { id: 'support', label: 'Support', onClick: () => navigate('/contact') },
        ]}
        actions={[{
          id: 'account',
          label: m.actor ? 'Account' : 'Sign in',
          onClick: () => m.actor ? navigate('/account') : signIn(),
          primary: true,
        }]}
      />
      <header className='border-b border-gray-200 bg-white px-4 py-6'>
        <div className='mx-auto max-w-5xl'>
          <h1 className='text-2xl font-bold tracking-tight'>Teacher Marketplace</h1>
          <p className='mt-2 max-w-2xl text-sm leading-6 text-gray-600'>
            Browse teaching opportunities, build your profile and review applicants for the academies you
            manage.
          </p>
        </div>
      </header>
      <div className='mx-auto max-w-5xl space-y-5 px-4 py-6'>
        <nav aria-label='Marketplace sections' className='grid grid-cols-2 gap-2 sm:grid-cols-4'>
          {tabs.map((t) => (
            <button
              key={t.id}
              aria-current={tab === t.id ? 'page' : undefined}
              onClick={() => setTab(t.id)}
              className={tab === t.id ? button : secondary}
            >
              {t.label}
            </button>
          ))}
        </nav>
        {m.authError && (
          <div role='alert' className={panel}>
            <p>{m.authError}</p>
            <button className={secondary} onClick={() => location.reload()}>Retry session</button>
          </div>
        )}
        {m.error && (
          <p role='alert' className='rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900'>
            {m.error}
          </p>
        )}
        {m.notice && (
          <p role='status' className='rounded-xl border border-gray-300 bg-white p-4 text-sm'>{m.notice}</p>
        )}
        {m.pending && (
          <section className={panel} aria-label='Unconfirmed request'>
            <h2 className='text-base font-semibold'>Confirm your previous request</h2>
            <p className='my-3 text-sm leading-6 text-gray-600'>
              Your original {m.pending.action === 'upsert_profile'
                ? 'profile save'
                : m.pending.action === 'post_job'
                ? 'job posting'
                : m.pending.action === 'apply'
                ? 'application'
                : m.pending.action === 'close_job'
                ? 'listing closure'
                : 'hiring decision'}{' '}
              is retained in this tab. Retry confirmation before starting another change. The original content
              will be sent again.
            </p>
            <button
              onClick={() => {
                void m.retry();
              }}
              disabled={!m.ready || m.busy}
              className={button}
            >
              {m.busy ? 'Confirming…' : 'Retry confirmation'}
            </button>
          </section>
        )}
        {tab === 'teachers' && (
          <section className={panel} aria-labelledby='market-teachers'>
            <div className='mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between'>
              <div>
                <h2 id='market-teachers' className='text-lg font-semibold'>Available teachers</h2>
                <p className='mt-1 text-sm text-gray-600'>
                  Up to 50 public, available profiles. Certification details are supplied by teachers.
                </p>
              </div>
              <label className='block text-sm font-medium'>
                Subject<select
                  className={input + ' mt-1'}
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                >
                  <option value=''>All subjects</option>
                  {subjects.map((s) => <option key={s} value={s}>{s.toUpperCase()}</option>)}
                </select>
              </label>
            </div>
            <LoadState
              loading={m.teachers.loading}
              error={m.teachers.error}
              count={teacherRows.length}
              empty='No available public profiles match this subject.'
              retry={m.refresh}
            />
            {!m.teachers.loading && !m.teachers.error && (
              <div className='divide-y divide-gray-200'>
                {teacherRows.map((t) => (
                  <article key={t.id} className='break-words py-5'>
                    <div className='flex flex-wrap items-center gap-2'>
                      <h3 className='text-base font-semibold'>{t.full_name}</h3>
                      {t.verified && (
                        <span className='rounded-md bg-gray-100 px-2 py-1 text-xs font-medium'>
                          Verification on file
                        </span>
                      )}
                    </div>
                    <p className='mt-2 text-sm leading-6 text-gray-600'>
                      {t.bio || 'Teaching bio not provided.'}
                    </p>
                    <p className='mt-3 text-sm font-medium'>
                      {t.subjects.map((s) => s.toUpperCase()).join(' · ') || 'Subjects not specified'}
                    </p>
                    <p className='mt-2 text-sm text-gray-600'>
                      {t.location || 'Location not specified'} · {t.experience_years === null
                        ? 'Experience not specified'
                        : `${t.experience_years} years of experience`} · {t.hourly_rate === null
                        ? 'Rate not specified'
                        : `${t.hourly_rate.toLocaleString()} ${t.currency}/hour`}
                    </p>
                    {t.languages.length > 0 && (
                      <p className='mt-2 text-sm text-gray-600'>Languages: {t.languages.join(', ')}</p>
                    )}
                    {t.certifications.length > 0 && (
                      <p className='mt-2 text-sm text-gray-600'>
                        Certifications: {t.certifications.join(', ')}
                      </p>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>
        )}
        {tab === 'jobs' && (
          <>
            <section className={panel} aria-labelledby='market-jobs'>
              <h2 id='market-jobs' className='text-lg font-semibold'>Open teaching positions</h2>
              <p className='mb-3 mt-1 text-sm text-gray-600'>
                Up to 50 current listings. Applying shares your teaching profile and cover note with that
                listing’s managers.
              </p>
              <LoadState
                loading={m.jobs.loading}
                error={m.jobs.error}
                count={m.jobs.data.length}
                empty='No open positions are available right now.'
                retry={m.refresh}
              />
              {!m.jobs.loading && !m.jobs.error && (
                <div className='divide-y divide-gray-200'>
                  {m.jobs.data.map((job) => {
                    const application = m.applications.find((a) => a.listing_id === job.id);
                    return (
                      <article key={job.id} aria-label={job.title} className='min-w-0 break-words py-5'>
                        <h3 className='text-base font-semibold'>{job.title}</h3>
                        <p className='mt-1 text-sm text-gray-600'>
                          {job.tenants.name} · {employment[job.employment_type] || job.employment_type} ·{' '}
                          {job.remote_ok ? 'Remote available' : job.location || 'Location not specified'}
                        </p>
                        <p className='mt-3 whitespace-pre-wrap text-sm leading-6'>
                          {job.description || 'No description supplied.'}
                        </p>
                        <p className='mt-3 text-sm font-medium'>
                          {money(job.salary_min, job.salary_max, job.currency)}
                        </p>
                        <p className='mt-2 text-sm text-gray-600'>
                          {job.subjects.map((s) => s.toUpperCase()).join(' · ')}
                          {job.expires_at ? ` · Closes ${date(job.expires_at)}` : ''}
                        </p>
                        {!m.authReady
                          ? <p className='mt-4 text-sm'>Restoring session…</p>
                          : !m.actor
                          ? <button onClick={signIn} className={secondary + ' mt-4'}>Sign in to apply</button>
                          : application
                          ? (
                            <p className='mt-4 text-sm font-semibold'>
                              Application status: {application.status}
                            </p>
                          )
                          : !m.profileReady || !m.ready
                          ? (
                            <p className='mt-4 text-sm text-gray-600'>
                              Applications will be available after your account details load.
                            </p>
                          )
                          : !m.profile
                          ? (
                            <button className={secondary + ' mt-4'} onClick={() => setTab('profile')}>
                              Create profile to apply
                            </button>
                          )
                          : (
                            <form
                              className='mt-4 space-y-3'
                              aria-label={'Apply for ' + job.title}
                              onSubmit={(e) => {
                                e.preventDefault();
                                void m.apply(job.id);
                              }}
                            >
                              <label className='block space-y-1 text-sm font-medium'>
                                <span>Cover note for {job.title}</span>
                                <textarea
                                  maxLength={2000}
                                  rows={3}
                                  disabled={frozen}
                                  value={m.notes[job.id] ?? ''}
                                  onChange={(e) =>
                                    m.setNotes((old) => ({ ...old, [job.id]: e.target.value }))}
                                  className={input}
                                />
                              </label>
                              <button type='submit' className={button} disabled={frozen}>
                                Apply for this position
                              </button>
                            </form>
                          )}
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
            {m.actor && (
              <section className={panel}>
                <h2 className='text-lg font-semibold'>My applications</h2>
                <p className='mt-1 text-sm text-gray-600'>
                  Your latest 50 applications, including positions that have closed.
                </p>
                <LoadState
                  loading={m.privateLoading}
                  error={m.privateError}
                  count={m.applications.length}
                  empty='You have no applications yet.'
                  retry={m.refresh}
                />
                {!m.privateLoading && !m.privateError &&
                  m.applications.map((a) => (
                    <article key={a.id} className='mt-4 break-words border-t border-gray-200 pt-4'>
                      <h3 className='font-semibold'>{a.job_listings?.title}</h3>
                      <p className='mt-1 text-sm text-gray-600'>
                        {a.job_listings?.tenants.name} · {date(a.applied_at)}
                      </p>
                      <p className='mt-2 text-sm font-semibold'>Status: {a.status}</p>
                      {a.cover_note && (
                        <p className='mt-2 whitespace-pre-wrap text-sm text-gray-600'>{a.cover_note}</p>
                      )}
                    </article>
                  ))}
              </section>
            )}
          </>
        )}
        {(tab === 'profile' || tab === 'post') && (
          <>
            {!m.authReady ? <p role='status'>Restoring session…</p> : !m.actor
              ? (
                <section className={panel}>
                  <h2 className='text-lg font-semibold'>Sign in to continue</h2>
                  <p className='my-3 text-sm text-gray-600'>
                    Use your Schood account to manage your teaching profile and academy listings.
                  </p>
                  <button className={button} onClick={signIn}>Sign in</button>
                </section>
              )
              : (
                <>
                  {m.privateLoading && (
                    <p role='status' className='text-sm text-gray-600'>Loading account details…</p>
                  )}
                  {m.privateError && (
                    <div role='alert' className={panel}>
                      <p className='mb-3 text-sm'>{m.privateError}</p>
                      <button className={secondary} onClick={m.refresh}>Retry loading</button>
                    </div>
                  )}
                  {tab === 'profile' && (
                    <section className={panel}>
                      <h2 className='text-lg font-semibold'>Your teaching profile</h2>
                      <p className='mb-5 mt-2 text-sm leading-6 text-gray-600'>
                        {m.profileReady
                          ? m.profile?.is_public && m.profile.available
                            ? 'Saved visibility: public and available.'
                            : 'Saved visibility: excluded from the public directory.'
                          : 'Loading saved visibility…'} Unsaved changes take effect only after confirmation.
                      </p>
                      {m.conflict && (
                        <div className='mb-5 space-y-3 rounded-xl border border-gray-300 p-4'>
                          <p className='text-sm'>
                            The saved profile changed. Load its current version before editing again. This
                            replaces the form below.
                          </p>
                          <button
                            className={secondary}
                            disabled={m.busy || Boolean(m.pending)}
                            onClick={() => {
                              void m.reloadProfile();
                            }}
                          >
                            Reload saved profile
                          </button>
                        </div>
                      )}
                      <MarketplaceProfileForm
                        currency={m.profileReady ? m.profile?.currency ?? 'UZS' : 'loading…'}
                        value={m.profileDraft}
                        setValue={m.setProfileDraft}
                        disabled={frozen || m.conflict}
                        onSave={() => {
                          void m.saveProfile();
                        }}
                      />
                    </section>
                  )}
                  {tab === 'post' && m.ready && (
                    <section className={panel}>
                      <h2 className='text-lg font-semibold'>Academy hiring</h2>
                      <p className='mb-5 mt-2 text-sm text-gray-600'>
                        Only active owners and administrators can publish positions and review applications.
                      </p>
                      {!m.tenants.length
                        ? (
                          <p className='text-sm'>
                            You do not currently manage an academy. Ask its owner to grant the appropriate
                            access.
                          </p>
                        )
                        : (
                          <>
                            <label className='mb-6 block space-y-1 text-sm font-medium'>
                              <span>Academy</span>
                              <select
                                className={input}
                                value={m.tenantId}
                                disabled={m.busy || Boolean(m.pending)}
                                onChange={(e) => m.setTenantId(e.target.value)}
                              >
                                <option value=''>Choose an academy</option>
                                {m.tenants.map((t) => (
                                  <option key={t.id} value={t.id}>{t.name} ({t.role})</option>
                                ))}
                              </select>
                            </label>
                            {m.tenantId && (
                              <>
                                <h3 className='mb-4 text-base font-semibold'>Publish a position</h3>
                                <MarketplaceJobForm
                                  value={m.jobDraft}
                                  setValue={m.setJobDraft}
                                  disabled={frozen}
                                  onSave={() => {
                                    void m.postJob();
                                  }}
                                />
                                <div className='mt-8 border-t border-gray-200 pt-6'>
                                  <h3 className='text-base font-semibold'>Your academy’s listings</h3>
                                  <p className='mt-1 text-sm text-gray-600'>
                                    Latest 50 listings. Open listings stop accepting new applications after
                                    expiry.
                                  </p>
                                  <LoadState
                                    loading={m.ownedJobs.loading}
                                    error={m.ownedJobs.error}
                                    count={m.ownedJobs.data.length}
                                    empty='No positions have been posted for this academy.'
                                    retry={m.refresh}
                                  />
                                  {m.ownedJobs.data.map((j) => (
                                    <article
                                      key={j.id}
                                      className='mt-4 space-y-3 rounded-xl border border-gray-200 p-4'
                                    >
                                      <h4 className='break-words font-semibold'>{j.title}</h4>
                                      <p className='text-sm text-gray-600'>
                                        {j.status} · {j.application_count}{' '}
                                        applications{j.expires_at ? ' · Closes ' + date(j.expires_at) : ''}
                                      </p>
                                      <div className='flex flex-wrap gap-2'>
                                        <button
                                          className={secondary}
                                          disabled={m.busy || Boolean(m.pending)}
                                          onClick={() => m.setReviewJob(j.id)}
                                        >
                                          Review applicants for {j.title}
                                        </button>
                                        {j.status === 'open' && (
                                          <button
                                            className={secondary}
                                            disabled={frozen}
                                            onClick={() => {
                                              void m.closeJob(j.id);
                                            }}
                                          >
                                            Close listing: {j.title}
                                          </button>
                                        )}
                                      </div>
                                    </article>
                                  ))}
                                </div>
                                {selectedJob && (
                                  <section
                                    aria-label='Applicant review'
                                    className='mt-8 border-t border-gray-200 pt-6'
                                  >
                                    <h3 className='break-words text-base font-semibold'>
                                      Applicants for {selectedJob.title}
                                    </h3>
                                    <p className='mt-1 text-sm text-gray-600'>
                                      Latest 100 applications. A decision is recorded only after confirmation.
                                    </p>
                                    <LoadState
                                      loading={m.candidates.loading}
                                      error={m.candidates.error}
                                      count={m.candidates.data.length}
                                      empty='No applications for this listing yet.'
                                      retry={m.refreshCandidates}
                                    />
                                    {!m.candidates.loading && !m.candidates.error &&
                                      m.candidates.data.map((a) => (
                                        <article
                                          key={a.id}
                                          className='mt-4 space-y-3 rounded-xl border border-gray-200 p-4'
                                        >
                                          <h4 className='break-words font-semibold'>
                                            {a.teacher_profiles?.full_name}
                                          </h4>
                                          <p className='break-words text-sm text-gray-600'>
                                            {a.teacher_profiles?.subjects.map((s) => s.toUpperCase()).join(
                                              ' · ',
                                            )} · {a.teacher_profiles?.experience_years === null
                                              ? 'Experience not specified'
                                              : `${a.teacher_profiles?.experience_years} years of experience`}
                                          </p>
                                          <p className='whitespace-pre-wrap break-words text-sm'>
                                            {a.cover_note || 'No cover note supplied.'}
                                          </p>
                                          <p className='text-sm font-semibold'>Status: {a.status}</p>
                                          <div className='flex flex-wrap gap-2'>
                                            {['shortlisted', 'hired', 'rejected'].map((status) => (
                                              <button
                                                key={status}
                                                className={secondary}
                                                disabled={frozen || a.status === status}
                                                onClick={() => {
                                                  void m.decide(a, status);
                                                }}
                                              >
                                                {status === 'shortlisted'
                                                  ? 'Shortlist'
                                                  : status === 'hired'
                                                  ? 'Mark hired'
                                                  : 'Reject'}
                                              </button>
                                            ))}
                                          </div>
                                        </article>
                                      ))}
                                  </section>
                                )}
                              </>
                            )}
                          </>
                        )}
                    </section>
                  )}
                </>
              )}
          </>
        )}
      </div>
    </main>
  );
};
