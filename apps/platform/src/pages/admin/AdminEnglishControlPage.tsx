import React, { useCallback, useEffect, useState } from 'react';
import { AdminLayout } from '../../components/admin/AdminLayout';
import { useAdminPermission } from '../../components/platform/adminAccess';
import {
  AdminEnglishControlError,
  adminEnglishAiUsage,
  adminEnglishControlGet,
  adminEnglishControlUpdate,
  adminEnglishLearnerLookup,
  type EnglishAiUsage,
  type EnglishControlPatch,
  type EnglishControlService,
  type EnglishControlState,
  type EnglishLearnerSupport,
} from '../../lib/platformClient';
import { EnglishAdminSubnav, toFriendlyAdminError, useAdminAccessToken } from './AdminEnglishUtils';

const SERVICE_LABELS: Record<EnglishControlService, string> = {
  reading: 'Reading',
  writing: 'Writing',
  listening: 'Listening',
  speaking: 'Speaking',
  grammar: 'Grammar',
  vocabulary: 'Vocabulary',
  immersion: 'Immersion',
  tutor: 'AI tutor (chat + voice)',
  classes: 'Classes (teachers and their learners)',
  duels: 'Vocabulary duels (web + Telegram)',
};

const card = 'rounded-[28px] border border-gray-200 bg-white p-6 shadow-sm';
const num = (value: number | null | undefined): string => (value == null ? '–' : new Intl.NumberFormat('en-US').format(value));
const when = (iso: string | null | undefined): string => (iso ? new Date(iso).toLocaleString() : '–');

const errorText = (err: unknown, fallback: string): string => {
  if (err instanceof AdminEnglishControlError) {
    if (err.status === 401 || err.status === 403 || err.status === 429) return toFriendlyAdminError(new Error(String(err.status)), fallback);
    return err.reasons.length ? err.reasons.join(' ') : err.message;
  }
  return toFriendlyAdminError(err, fallback);
};

const Switch: React.FC<{ checked: boolean; disabled?: boolean; label: string; onChange: (next: boolean) => void }> = ({ checked, disabled, label, onChange }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 disabled:cursor-not-allowed disabled:opacity-50 ${
      checked ? 'bg-emerald-500' : 'bg-gray-300'
    }`}
  >
    <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
  </button>
);

const NumberField: React.FC<{
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  disabled?: boolean;
  onSave: (value: number) => void;
}> = ({ label, hint, value, min, max, disabled, onSave }) => {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const parsed = Number(draft);
  const valid = Number.isInteger(parsed) && parsed >= min && parsed <= max;
  return (
    <div className="rounded-3xl border border-gray-200 bg-gray-50 p-4">
      <label className="text-sm font-semibold text-gray-900">
        {label}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            type="number"
            min={min}
            max={max}
            value={draft}
            disabled={disabled}
            onChange={(event) => setDraft(event.target.value)}
            className="w-28 rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm"
          />
          <button
            type="button"
            disabled={disabled || !valid || parsed === value}
            onClick={() => onSave(parsed)}
            className="rounded-full bg-gray-900 px-4 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </label>
      <p className="mt-2 text-xs text-gray-500">{hint}</p>
      {!valid ? <p className="mt-1 text-xs text-red-600">Whole number from {min} to {max}.</p> : null}
    </div>
  );
};

const Bar: React.FC<{ value: number; max: number; tone?: string }> = ({ value, max, tone = 'bg-orange-400' }) => (
  <div className="h-2 w-full rounded-full bg-gray-100" aria-hidden="true">
    <div className={`h-2 rounded-full ${tone}`} style={{ width: `${max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0}%` }} />
  </div>
);

export const AdminEnglishControlPage: React.FC = () => {
  const { withFreshToken } = useAdminAccessToken();
  const canEdit = useAdminPermission('admin.settings.manage');
  const [control, setControl] = useState<EnglishControlState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const [days, setDays] = useState(7);
  const [usage, setUsage] = useState<EnglishAiUsage | null>(null);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [usageLoading, setUsageLoading] = useState(true);

  const [email, setEmail] = useState('');
  const [learner, setLearner] = useState<EnglishLearnerSupport | null>(null);
  const [learnerError, setLearnerError] = useState<string | null>(null);
  const [learnerLoading, setLearnerLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void withFreshToken((token) => adminEnglishControlGet(token))
      .then((payload) => { if (!cancelled) { setControl(payload); setError(null); } })
      .catch((err) => { if (!cancelled) setError(errorText(err, 'Could not load the English settings right now.')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [withFreshToken]);

  useEffect(() => {
    let cancelled = false;
    setUsageLoading(true);
    void withFreshToken((token) => adminEnglishAiUsage(token, days))
      .then((payload) => { if (!cancelled) { setUsage(payload); setUsageError(null); } })
      .catch((err) => { if (!cancelled) setUsageError(errorText(err, 'Could not load AI usage right now.')); })
      .finally(() => { if (!cancelled) setUsageLoading(false); });
    return () => { cancelled = true; };
  }, [withFreshToken, days]);

  const save = useCallback(async (patch: EnglishControlPatch, done: string) => {
    setSaving(true);
    setNotice(null);
    try {
      const next = await withFreshToken((token) => adminEnglishControlUpdate(token, patch));
      setControl(next);
      setError(null);
      setNotice(`${done} Running functions pick this up within about a minute.`);
    } catch (err) {
      setError(errorText(err, 'Could not save the change.'));
    } finally {
      setSaving(false);
    }
  }, [withFreshToken]);

  const lookUp = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim()) return;
    setLearnerLoading(true);
    setLearnerError(null);
    setLearner(null);
    try {
      setLearner(await withFreshToken((token) => adminEnglishLearnerLookup(token, email)));
    } catch (err) {
      setLearnerError(errorText(err, 'Could not look up this learner.'));
    } finally {
      setLearnerLoading(false);
    }
  };

  const settings = control?.settings ?? null;
  const locked = !canEdit || saving || !settings;
  const featureMax = Math.max(1, ...(usage?.by_feature ?? []).map((row) => row.calls));
  const dayMax = Math.max(1, ...(usage?.by_day ?? []).map((row) => row.calls));

  return (
    <AdminLayout>
      <div className="space-y-6">
        <section className={card}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <span className="inline-flex rounded-full bg-orange-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-orange-800">
                English Control
              </span>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">English control center</h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-600">
                  Switch skills and AI features on or off, set the free tier and AI limits, watch AI usage, and look up one learner for support.
                  Changes apply to every English function within about a minute.
                </p>
              </div>
            </div>
            <EnglishAdminSubnav active="control" />
          </div>
        </section>

        {!canEdit ? (
          <div className="rounded-3xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
            You can view these settings. Changing them needs the admin.settings.manage permission.
          </div>
        ) : null}
        {control && !control.table_ready ? (
          <div className="rounded-3xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
            The settings table is not in the database yet (migration 20261025100000 pending). Learners get the defaults shown here; saving will fail until it is applied.
          </div>
        ) : null}
        {error ? <div role="alert" className="rounded-3xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{error}</div> : null}
        {notice ? <div role="status" className="rounded-3xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-800">{notice}</div> : null}
        {loading ? <div className="rounded-3xl border border-gray-200 bg-white px-5 py-4 text-sm text-gray-500 shadow-sm">Loading English settings...</div> : null}

        {settings ? (
          <section className="grid gap-4 xl:grid-cols-2">
            <div className={card}>
              <h2 className="text-xl font-bold text-gray-900">Services</h2>
              <p className="mt-1 text-sm text-gray-600">
                A paused skill shows learners a calm "paused for a little while" note and refuses new activities. Saved work, review and Today keep working. Admins can still use it.
              </p>
              <ul className="mt-5 space-y-2">
                {(control?.services ?? []).map((service) => (
                  <li key={service} className="flex items-center justify-between gap-3 rounded-2xl bg-gray-50 px-4 py-3">
                    <span className="text-sm font-semibold text-gray-900">
                      {SERVICE_LABELS[service] ?? service}
                      {!settings.services[service] ? <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">Paused</span> : null}
                    </span>
                    <Switch
                      label={`${SERVICE_LABELS[service] ?? service} on`}
                      checked={settings.services[service]}
                      disabled={locked}
                      onChange={(next) => void save({ services: { [service]: next } }, `${SERVICE_LABELS[service] ?? service} ${next ? 'is on' : 'is paused'}.`)}
                    />
                  </li>
                ))}
              </ul>
            </div>

            <div className="space-y-4">
              <div className={card}>
                <h2 className="text-xl font-bold text-gray-900">Free tier</h2>
                <p className="mt-1 text-sm text-gray-600">Activities a day, across skills they have not bought, for signed-in learners without a plan. Day follows Tashkent time. 0 turns the free tier off.</p>
                <div className="mt-4">
                  <NumberField
                    label="Free activities per day"
                    hint={`Default: ${control?.defaults.free_activities_per_day ?? 1}.`}
                    value={settings.free_activities_per_day}
                    min={0}
                    max={20}
                    disabled={locked}
                    onSave={(value) => void save({ free_activities_per_day: value }, `Free tier set to ${value} a day.`)}
                  />
                </div>
              </div>

              <div className={card}>
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-xl font-bold text-gray-900">AI</h2>
                  <Switch
                    label="All English AI on"
                    checked={settings.ai.enabled}
                    disabled={locked}
                    onChange={(next) => void save({ ai: { enabled: next } }, next ? 'English AI is on.' : 'English AI is off; learners get the basic (non-AI) feedback.')}
                  />
                </div>
                <p className="mt-1 text-sm text-gray-600">
                  Off: every English AI feature returns its basic fallback and nothing is sent to a provider. No learner credits are taken.
                </p>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-2xl bg-gray-50 px-4 py-3">
                    <dt className="text-xs uppercase tracking-[0.14em] text-gray-500">Provider</dt>
                    <dd className="mt-1 font-semibold text-gray-900">{control?.runtime.provider ?? '–'}{control?.runtime.fallback === 'openrouter' ? ' (+ OpenRouter fallback)' : ''}</dd>
                  </div>
                  <div className="rounded-2xl bg-gray-50 px-4 py-3">
                    <dt className="text-xs uppercase tracking-[0.14em] text-gray-500">Model</dt>
                    <dd className="mt-1 break-all font-semibold text-gray-900">{control?.runtime.model ?? '–'}</dd>
                  </div>
                  <div className="col-span-2 rounded-2xl bg-gray-50 px-4 py-3 text-gray-600">
                    {control?.runtime.configured ? 'A provider key is set.' : 'No provider key is set: AI answers fall back to basic feedback.'}
                    {' '}Provider and model are set by Supabase secrets (ENGLISH_AI_PROVIDER, ENGLISH_AI_MODEL), not here.
                  </div>
                </dl>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <NumberField
                    label="AI credits per learner per day"
                    hint={`One credit per AI answer (UTC day); failed calls are refunded.${control?.runtime.env_daily_limit ? ` Env ENGLISH_AI_DAILY_LIMIT is ${control.runtime.env_daily_limit}; this setting wins.` : ''}`}
                    value={settings.ai.daily_limit}
                    min={1}
                    max={500}
                    disabled={locked}
                    onSave={(value) => void save({ ai: { daily_limit: value } }, `AI credits set to ${value} a day.`)}
                  />
                  <NumberField
                    label="New word meanings per day"
                    hint="Tap-to-translate AI lookups per learner day. Words already looked up by anyone are always free."
                    value={settings.ai.word_lookup_daily_limit}
                    min={0}
                    max={500}
                    disabled={locked}
                    onSave={(value) => void save({ ai: { word_lookup_daily_limit: value } }, `Word lookups set to ${value} a day.`)}
                  />
                </div>
              </div>
            </div>

            {settings.classes ? (
              <div className={`${card} xl:col-span-2`}>
                <h2 className="text-xl font-bold text-gray-900">Classes</h2>
                <p className="mt-1 text-sm text-gray-600">
                  Any signed-in user can open a class in Schood English (/classes) and set work; learners join with a code after consenting.
                  Switch the whole feature on or off under Services. Classes never unlock skills.
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <NumberField
                    label="Open classes per teacher"
                    hint={`Archived classes do not count. Default: ${control?.defaults.classes?.max_classes_per_teacher ?? 10}.`}
                    value={settings.classes.max_classes_per_teacher}
                    min={1}
                    max={50}
                    disabled={locked}
                    onSave={(value) => void save({ classes: { max_classes_per_teacher: value } }, `Teachers can now run ${value} classes.`)}
                  />
                  <NumberField
                    label="Learners per class"
                    hint={`Joining stops when a class is full. Default: ${control?.defaults.classes?.max_students_per_class ?? 60}.`}
                    value={settings.classes.max_students_per_class}
                    min={2}
                    max={300}
                    disabled={locked}
                    onSave={(value) => void save({ classes: { max_students_per_class: value } }, `Classes now hold up to ${value} learners.`)}
                  />
                </div>
              </div>
            ) : null}

            <div className={`${card} xl:col-span-2`}>
              <h2 className="text-xl font-bold text-gray-900">AI features</h2>
              <p className="mt-1 text-sm text-gray-600">Turn off one AI feature without touching the rest (for example if it costs too much or misbehaves). New features are on until switched off.</p>
              <ul className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {(control?.features ?? []).map((feature) => {
                  const on = settings.ai.features[feature] !== false;
                  return (
                    <li key={feature} className="flex items-center justify-between gap-3 rounded-2xl bg-gray-50 px-4 py-3">
                      <code className="break-all text-xs font-semibold text-gray-800">{feature}</code>
                      <Switch
                        label={`${feature} on`}
                        checked={on && settings.ai.enabled}
                        disabled={locked || !settings.ai.enabled}
                        onChange={(next) => void save({ ai: { features: { [feature]: next } } }, `${feature} ${next ? 'is on' : 'is off'}.`)}
                      />
                    </li>
                  );
                })}
              </ul>
            </div>
          </section>
        ) : null}

        <section className={card}>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-gray-900">AI usage</h2>
              <p className="mt-1 text-sm text-gray-600">Every English AI call, by UTC day. No prompts or answers are stored.</p>
            </div>
            <div className="flex gap-2" role="group" aria-label="Period">
              {[1, 7, 30].map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={days === value}
                  onClick={() => setDays(value)}
                  className={`rounded-full border px-4 py-2 text-xs font-semibold ${days === value ? 'border-orange-300 bg-orange-50 text-orange-900' : 'border-gray-200 bg-white text-gray-600'}`}
                >
                  {value === 1 ? 'Today' : `${value} days`}
                </button>
              ))}
            </div>
          </div>

          {usageError ? <div role="alert" className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{usageError}</div> : null}
          {usageLoading && !usage ? <p className="mt-4 text-sm text-gray-500">Loading AI usage...</p> : null}
          {usage && !usage.totals?.calls ? <p className="mt-4 text-sm text-gray-500">No English AI calls in this period yet.</p> : null}

          {usage?.totals?.calls ? (
            <div className="mt-5 space-y-6">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {[
                  ['Calls', num(usage.totals.calls)],
                  ['Answered', num(usage.totals.ok)],
                  ['Failed', num(usage.totals.failed)],
                  ['Refused (off / limit)', num(usage.totals.disabled + usage.totals.unconfigured + usage.totals.over_limit)],
                  ['Learners', num(usage.totals.learners)],
                  ['Avg latency', usage.totals.avg_latency_ms != null ? `${num(usage.totals.avg_latency_ms)} ms` : '–'],
                  ['Prompt tokens', num(usage.totals.prompt_tokens)],
                  ['Output tokens', num(usage.totals.completion_tokens)],
                  ['Hit daily limit', num(usage.totals.over_limit)],
                  ['Switched off', num(usage.totals.disabled)],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-3xl bg-gray-50 p-4">
                    <div className="text-xs uppercase tracking-[0.14em] text-gray-500">{label}</div>
                    <div className="mt-2 text-2xl font-bold text-gray-900">{value}</div>
                  </div>
                ))}
              </div>

              {days > 1 ? (
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-gray-500">By day</h3>
                  <ul className="mt-3 space-y-2">
                    {(usage.by_day ?? []).map((row) => (
                      <li key={row.day} className="grid grid-cols-[6.5rem_1fr_7rem] items-center gap-3 text-sm">
                        <span className="text-gray-600">{row.day}</span>
                        <Bar value={row.calls} max={dayMax} />
                        <span className="text-right text-gray-900">{num(row.calls)}{row.failed ? <span className="text-red-600"> · {row.failed} failed</span> : null}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="overflow-x-auto">
                <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-gray-500">By feature</h3>
                <table className="mt-3 min-w-full text-left text-sm">
                  <thead className="text-xs uppercase tracking-[0.14em] text-gray-500">
                    <tr>
                      <th className="pb-2 pr-4">Feature</th>
                      <th className="pb-2 pr-4">Calls</th>
                      <th className="pb-2 pr-4">Failed</th>
                      <th className="pb-2 pr-4">Refused</th>
                      <th className="pb-2 pr-4">Avg ms</th>
                      <th className="pb-2">Tokens in / out</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(usage.by_feature ?? []).map((row) => (
                      <tr key={row.feature} className="border-t border-gray-100">
                        <td className="py-2 pr-4">
                          <code className="text-xs font-semibold text-gray-900">{row.feature}</code>
                          <div className="mt-1 w-40"><Bar value={row.calls} max={featureMax} /></div>
                        </td>
                        <td className="py-2 pr-4 text-gray-900">{num(row.calls)}</td>
                        <td className={`py-2 pr-4 ${row.failed ? 'text-red-600' : 'text-gray-600'}`}>{num(row.failed)}</td>
                        <td className="py-2 pr-4 text-gray-600">{num(row.refused)}</td>
                        <td className="py-2 pr-4 text-gray-600">{num(row.avg_latency_ms)}</td>
                        <td className="py-2 text-gray-600">{num(row.prompt_tokens)} / {num(row.completion_tokens)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="overflow-x-auto">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-gray-500">By model</h3>
                  <table className="mt-3 min-w-full text-left text-sm">
                    <thead className="text-xs uppercase tracking-[0.14em] text-gray-500">
                      <tr><th className="pb-2 pr-4">Provider / model</th><th className="pb-2 pr-4">Calls</th><th className="pb-2 pr-4">Avg ms</th><th className="pb-2">Tokens</th></tr>
                    </thead>
                    <tbody>
                      {(usage.by_model ?? []).map((row) => (
                        <tr key={`${row.provider}-${row.model}`} className="border-t border-gray-100">
                          <td className="py-2 pr-4 text-gray-900"><span className="font-semibold">{row.provider}</span> <span className="break-all text-xs text-gray-500">{row.model}</span></td>
                          <td className="py-2 pr-4 text-gray-600">{num(row.calls)}</td>
                          <td className="py-2 pr-4 text-gray-600">{num(row.avg_latency_ms)}</td>
                          <td className="py-2 text-gray-600">{num(row.prompt_tokens + row.completion_tokens)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="overflow-x-auto">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-gray-500">Heaviest learners</h3>
                  <table className="mt-3 min-w-full text-left text-sm">
                    <thead className="text-xs uppercase tracking-[0.14em] text-gray-500">
                      <tr><th className="pb-2 pr-4">Learner id</th><th className="pb-2 pr-4">Calls</th><th className="pb-2">Hit limit</th></tr>
                    </thead>
                    <tbody>
                      {(usage.top_learners ?? []).map((row) => (
                        <tr key={row.user_id} className="border-t border-gray-100">
                          <td className="py-2 pr-4"><code className="break-all text-xs text-gray-700">{row.user_id}</code></td>
                          <td className="py-2 pr-4 text-gray-900">{num(row.calls)}</td>
                          <td className="py-2 text-gray-600">{num(row.over_limit)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {(usage.recent_errors ?? []).length ? (
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-gray-500">Latest failures</h3>
                  <ul className="mt-3 space-y-2">
                    {(usage.recent_errors ?? []).map((row, index) => (
                      <li key={`${row.created_at}-${index}`} className="rounded-2xl bg-red-50 px-4 py-3 text-xs text-red-800">
                        <span className="font-semibold">{when(row.created_at)} · {row.feature} · {row.provider ?? '–'}</span>
                        <div className="mt-1 break-all">{row.error ?? 'No message'}</div>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>

        <section className={card}>
          <h2 className="text-xl font-bold text-gray-900">Learner lookup</h2>
          <p className="mt-1 text-sm text-gray-600">For support: what one learner can open, their free activities today, level, streak, recent activity and AI use.</p>
          <form onSubmit={lookUp} className="mt-4 flex flex-wrap gap-2">
            <label className="sr-only" htmlFor="english-learner-email">Learner email</label>
            <input
              id="english-learner-email"
              type="email"
              autoComplete="off"
              placeholder="learner@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="min-w-0 flex-1 rounded-xl border border-gray-300 px-3 py-2 text-sm sm:max-w-sm"
            />
            <button type="submit" disabled={learnerLoading || !email.trim()} className="rounded-full bg-gray-900 px-5 py-2 text-sm font-semibold text-white disabled:opacity-40">
              {learnerLoading ? 'Looking up...' : 'Look up'}
            </button>
          </form>
          {learnerError ? <div role="alert" className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{learnerError}</div> : null}
          {learner ? (
            <div className="mt-5 space-y-4">
              <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                {[
                  ['User id', <code key="id" className="break-all text-xs">{learner.learner.user_id}</code>],
                  ['Role', learner.learner.role],
                  ['Level', `${learner.level.current ?? '–'}${learner.level.target ? ` → ${learner.level.target}` : ''}${learner.level.placement_done ? '' : ' (no placement yet)'}`],
                  ['Streak', `${learner.streak} day${learner.streak === 1 ? '' : 's'}`],
                  ['Free left today', learner.free.left_today == null ? 'Admin (unlimited)' : `${learner.free.left_today} of ${learner.free.per_day}`],
                  ['Telegram', learner.learner.telegram_linked ? 'Linked' : 'Not linked'],
                  ['AI credits used today', `${learner.ai_today.credits_used}`],
                  ['AI calls today', `${learner.ai_today.calls} (${learner.ai_today.ok} ok, ${learner.ai_today.failed} failed, ${learner.ai_today.over_limit} over limit)`],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-2xl bg-gray-50 px-4 py-3">
                    <dt className="text-xs uppercase tracking-[0.14em] text-gray-500">{label}</dt>
                    <dd className="mt-1 font-semibold text-gray-900">{value}</dd>
                  </div>
                ))}
              </dl>
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-gray-500">English products</h3>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {learner.entitlements.map((row) => (
                    <li key={row.skill} className={`rounded-full px-3 py-1 text-xs font-semibold ${row.active ? 'bg-emerald-50 text-emerald-800' : 'bg-gray-100 text-gray-500'}`}>
                      {row.skill}{row.active ? (row.ends_at ? ` · until ${new Date(row.ends_at).toLocaleDateString()}` : ' · active') : row.ends_at ? ` · ended ${new Date(row.ends_at).toLocaleDateString()}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="overflow-x-auto">
                <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-gray-500">Last 10 attempts</h3>
                {learner.recent_attempts.length === 0 ? <p className="mt-2 text-sm text-gray-500">No English activity yet.</p> : (
                  <table className="mt-2 min-w-full text-left text-sm">
                    <thead className="text-xs uppercase tracking-[0.14em] text-gray-500">
                      <tr><th className="pb-2 pr-4">When</th><th className="pb-2 pr-4">Skill</th><th className="pb-2 pr-4">Activity</th><th className="pb-2 pr-4">Status</th><th className="pb-2">Score</th></tr>
                    </thead>
                    <tbody>
                      {learner.recent_attempts.map((row) => (
                        <tr key={row.id} className="border-t border-gray-100">
                          <td className="py-2 pr-4 text-gray-600">{when(row.at)}</td>
                          <td className="py-2 pr-4 text-gray-900">{row.skill}</td>
                          <td className="py-2 pr-4 text-gray-600">{row.title ?? '–'}</td>
                          <td className="py-2 pr-4 text-gray-600">{row.status}</td>
                          <td className="py-2 text-gray-900">{row.score_percent != null ? `${row.score_percent}%` : '–'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </AdminLayout>
  );
};
