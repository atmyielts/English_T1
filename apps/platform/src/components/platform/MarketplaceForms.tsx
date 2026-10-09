import type { Dispatch, SetStateAction } from 'react';
import { employment, subjects } from '../../lib/marketplace';
import type { JobForm, ProfileForm } from '../../lib/marketplace';

export const marketplaceInput =
  'w-full min-w-0 rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-800';
export const marketplaceButton =
  'min-h-11 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-black disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-800';
export const marketplaceSecondary =
  'min-h-11 rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-800';

function Subjects({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  return (
    <fieldset>
      <legend className='mb-2 text-sm font-medium'>Subjects</legend>
      <div className='flex flex-wrap gap-2'>
        {subjects.map((s) => (
          <label
            key={s}
            className='flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-gray-300 px-3 text-sm'
          >
            <input
              type='checkbox'
              checked={value.includes(s)}
              onChange={() =>
                onChange(
                  value.includes(s) ? value.filter((v) => v !== s) : [...value, s],
                )}
            />
            {s.toUpperCase()}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
export function MarketplaceProfileForm(
  { value, setValue, disabled, onSave, currency }: {
    value: ProfileForm;
    setValue: Dispatch<SetStateAction<ProfileForm>>;
    disabled: boolean;
    onSave: () => void;
    currency: string;
  },
) {
  const change = <K extends keyof ProfileForm>(key: K, next: ProfileForm[K]) =>
    setValue((old) => ({ ...old, [key]: next }));
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
      aria-label='Teacher profile'
      className='space-y-5'
    >
      <fieldset disabled={disabled} className='min-w-0 space-y-5'>
        <label className='block space-y-1 text-sm font-medium'>
          <span>Full name</span>
          <input
            required
            maxLength={120}
            value={value.full_name}
            onChange={(e) => change('full_name', e.target.value)}
            className={marketplaceInput}
            autoComplete='name'
          />
        </label>
        <label className='block space-y-1 text-sm font-medium'>
          <span>About your teaching</span>
          <textarea
            maxLength={2000}
            rows={5}
            value={value.bio}
            onChange={(e) => change('bio', e.target.value)}
            className={marketplaceInput}
          />
        </label>
        <Subjects value={value.subjects} onChange={(v) => change('subjects', v)} />
        <div className='grid gap-4 sm:grid-cols-2'>
          <label className='block space-y-1 text-sm font-medium'>
            <span>Location</span>
            <input
              maxLength={120}
              value={value.location}
              onChange={(e) => change('location', e.target.value)}
              className={marketplaceInput}
            />
          </label>
          <label className='block space-y-1 text-sm font-medium'>
            <span>Languages, separated by commas</span>
            <input
              maxLength={1000}
              value={value.languages}
              onChange={(e) => change('languages', e.target.value)}
              className={marketplaceInput}
            />
          </label>
          <div className='space-y-1'>
            <label htmlFor='market-rate' className='block text-sm font-medium'>
              Hourly rate ({currency})
            </label>
            <input
              id='market-rate'
              aria-describedby='market-rate-help'
              type='number'
              min={0}
              max={2147483647}
              step={1}
              value={value.hourly_rate}
              onChange={(e) => change('hourly_rate', e.target.value)}
              className={marketplaceInput}
            />
            <p id='market-rate-help' className='text-xs text-gray-600'>
              Leave blank if unspecified. Zero is saved as zero.
            </p>
          </div>
          <label className='block space-y-1 text-sm font-medium'>
            <span>Years of experience</span>
            <input
              type='number'
              min={0}
              max={2147483647}
              step={1}
              value={value.experience_years}
              onChange={(e) => change('experience_years', e.target.value)}
              className={marketplaceInput}
            />
          </label>
        </div>
        <label className='block space-y-1 text-sm font-medium'>
          <span>Certifications, separated by commas</span>
          <input
            maxLength={1000}
            value={value.certifications}
            onChange={(e) => change('certifications', e.target.value)}
            className={marketplaceInput}
          />
        </label>
        <label className='flex min-h-11 items-start gap-3 text-sm'>
          <input
            className='mt-1'
            type='checkbox'
            checked={value.available}
            onChange={(e) => change('available', e.target.checked)}
          />
          <span>Available for teaching opportunities</span>
        </label>
        <label className='flex min-h-11 items-start gap-3 text-sm'>
          <input
            className='mt-1'
            type='checkbox'
            checked={value.is_public}
            onChange={(e) => change('is_public', e.target.checked)}
          />
          <span>
            Show my profile in the public teacher directory<span className='mt-1 block text-xs text-gray-600'>
              Your name, bio, subjects, languages, location, rate, experience and certifications will be
              public while available. A private profile can still be shared with a listing’s managers when you
              apply.
            </span>
          </span>
        </label>
        <button className={marketplaceButton} type='submit'>Save profile</button>
      </fieldset>
    </form>
  );
}
export function MarketplaceJobForm(
  { value, setValue, disabled, onSave }: {
    value: JobForm;
    setValue: Dispatch<SetStateAction<JobForm>>;
    disabled: boolean;
    onSave: () => void;
  },
) {
  const change = <K extends keyof JobForm>(key: K, next: JobForm[K]) =>
    setValue((old) => ({ ...old, [key]: next }));
  return (
    <form
      aria-label='Job posting'
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
      className='space-y-5'
    >
      <fieldset disabled={disabled} className='min-w-0 space-y-5'>
        <label className='block space-y-1 text-sm font-medium'>
          <span>Job title</span>
          <input
            required
            maxLength={160}
            value={value.title}
            onChange={(e) => change('title', e.target.value)}
            className={marketplaceInput}
          />
        </label>
        <label className='block space-y-1 text-sm font-medium'>
          <span>Job description</span>
          <textarea
            maxLength={3000}
            rows={5}
            value={value.description}
            onChange={(e) => change('description', e.target.value)}
            className={marketplaceInput}
          />
        </label>
        <Subjects value={value.subjects} onChange={(v) => change('subjects', v)} />
        <div className='grid gap-4 sm:grid-cols-2'>
          <label className='block space-y-1 text-sm font-medium'>
            <span>Employment type</span>
            <select
              value={value.employment_type}
              onChange={(e) => change('employment_type', e.target.value)}
              className={marketplaceInput}
            >
              {Object.entries(employment).map(([key, label]) => <option key={key} value={key}>{label}
              </option>)}
            </select>
          </label>
          <label className='block space-y-1 text-sm font-medium'>
            <span>Location</span>
            <input
              maxLength={120}
              value={value.location}
              onChange={(e) => change('location', e.target.value)}
              className={marketplaceInput}
            />
          </label>
          <label className='block space-y-1 text-sm font-medium'>
            <span>Minimum salary (UZS)</span>
            <input
              type='number'
              min={0}
              max={2147483647}
              step={1}
              value={value.salary_min}
              onChange={(e) => change('salary_min', e.target.value)}
              className={marketplaceInput}
            />
          </label>
          <label className='block space-y-1 text-sm font-medium'>
            <span>Maximum salary (UZS)</span>
            <input
              type='number'
              min={value.salary_min || 0}
              max={2147483647}
              step={1}
              value={value.salary_max}
              onChange={(e) => change('salary_max', e.target.value)}
              className={marketplaceInput}
            />
          </label>
        </div>
        <label className='block space-y-1 text-sm font-medium'>
          <span>Accept applications for (days)</span>
          <input
            type='number'
            required
            min={1}
            max={365}
            step={1}
            value={value.expires_in_days}
            onChange={(e) => change('expires_in_days', e.target.value)}
            className={marketplaceInput}
          />
        </label>
        <label className='flex min-h-11 items-center gap-3 text-sm'>
          <input
            type='checkbox'
            checked={value.remote_ok}
            onChange={(e) => change('remote_ok', e.target.checked)}
          />Remote work available
        </label>
        <button type='submit' className={marketplaceButton}>Publish job</button>
      </fieldset>
    </form>
  );
}
