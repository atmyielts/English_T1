import React, { useEffect, useMemo, useState } from 'react';
import { AdminLayout } from '../../components/admin/AdminLayout';
import {
  adminEnglishRulesGet,
  adminEnglishRulesPatch,
  type AdminEnglishRuleConfig,
} from '../../lib/platformClient';
import { EnglishAdminSubnav, toFriendlyAdminError, useAdminAccessToken } from './AdminEnglishUtils';

type RuleDraft = {
  enabled: boolean;
  thresholdsJson: string;
  notes: string;
};

const keyForRule = (rule: Pick<AdminEnglishRuleConfig, 'ruleKey' | 'serviceKey'>): string => `${rule.serviceKey}:${rule.ruleKey}`;

export const AdminEnglishRulesPage: React.FC = () => {
  const { withFreshToken } = useAdminAccessToken();
  const [rules, setRules] = useState<AdminEnglishRuleConfig[]>([]);
  const [drafts, setDrafts] = useState<Record<string, RuleDraft>>({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void withFreshToken((token) => adminEnglishRulesGet(token))
      .then((payload) => {
        if (cancelled) return;
        setRules(payload.rules ?? []);
        const nextDrafts: Record<string, RuleDraft> = {};
        for (const rule of payload.rules ?? []) {
          nextDrafts[keyForRule(rule)] = {
            enabled: rule.enabled,
            thresholdsJson: JSON.stringify(rule.thresholds ?? {}, null, 2),
            notes: rule.notes ?? '',
          };
        }
        setDrafts(nextDrafts);
      })
      .catch((err) => {
        if (!cancelled) setError(toFriendlyAdminError(err, 'Could not load English rules right now.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [withFreshToken]);

  const dirtyCount = useMemo(() => {
    let count = 0;
    for (const rule of rules) {
      const draft = drafts[keyForRule(rule)];
      if (!draft) continue;
      const baseline = JSON.stringify(rule.thresholds ?? {}, null, 2);
      if (draft.enabled !== rule.enabled || draft.notes !== (rule.notes ?? '') || draft.thresholdsJson !== baseline) count += 1;
    }
    return count;
  }, [drafts, rules]);

  const saveRule = async (rule: AdminEnglishRuleConfig) => {
    const draft = drafts[keyForRule(rule)];
    if (!draft) return;
    setSavingKey(keyForRule(rule));
    setError(null);
    setSuccess(null);
    try {
      const thresholds = JSON.parse(draft.thresholdsJson) as Record<string, unknown>;
      const payload = await withFreshToken((token) =>
        adminEnglishRulesPatch(token, [{
          rule_key: rule.ruleKey,
          service_key: rule.serviceKey,
          enabled: draft.enabled,
          thresholds,
          notes: draft.notes.trim() || null,
        }]),
      );
      setRules(payload.rules);
      setSuccess(`${rule.ruleKey} updated.`);
      const nextDrafts: Record<string, RuleDraft> = {};
      for (const nextRule of payload.rules) {
        nextDrafts[keyForRule(nextRule)] = {
          enabled: nextRule.enabled,
          thresholdsJson: JSON.stringify(nextRule.thresholds ?? {}, null, 2),
          notes: nextRule.notes ?? '',
        };
      }
      setDrafts(nextDrafts);
    } catch (err) {
      setError(toFriendlyAdminError(err, 'Could not save English rule changes.'));
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <section className="rounded-[28px] border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <span className="inline-flex rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-indigo-800">
                English Rules
              </span>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Recommendation and transfer rules</h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-600">
                  Tune thresholds visually, keep an audit-friendly view of the logic, and preview impact by rule before saving.
                </p>
              </div>
            </div>
            <EnglishAdminSubnav active="rules" />
          </div>
          <div className="mt-4 flex flex-wrap gap-3 text-sm text-gray-600">
            <span>Loaded rules: {rules.length}</span>
            <span>Unsaved edits: {dirtyCount}</span>
          </div>
        </section>

        {error ? <div className="rounded-3xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{error}</div> : null}
        {success ? <div className="rounded-3xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-700">{success}</div> : null}
        {loading ? <div className="rounded-3xl border border-gray-200 bg-white px-5 py-4 text-sm text-gray-500 shadow-sm">Loading rule configs...</div> : null}

        <section className="grid gap-4">
          {rules.map((rule) => {
            const draft = drafts[keyForRule(rule)];
            const thresholdKeys = Object.keys(rule.thresholds ?? {});
            const dirty = draft
              ? draft.enabled !== rule.enabled ||
                draft.notes !== (rule.notes ?? '') ||
                draft.thresholdsJson !== JSON.stringify(rule.thresholds ?? {}, null, 2)
              : false;
            return (
              <article key={keyForRule(rule)} className="rounded-[28px] border border-gray-200 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">{rule.serviceKey}</div>
                    <h2 className="mt-2 text-xl font-bold text-gray-900">{rule.ruleKey}</h2>
                    <p className="mt-2 text-sm leading-6 text-gray-600">
                      Impact summary: {thresholdKeys.length} threshold values currently control this rule. Saving will update
                      {' '}
                      {dirty ? 'the active recommendation behavior immediately.' : 'no active behavior until you change a value.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void saveRule(rule)}
                    disabled={!draft || savingKey === keyForRule(rule)}
                    className="rounded-full bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white disabled:bg-gray-300"
                  >
                    {savingKey === keyForRule(rule) ? 'Saving...' : dirty ? 'Save rule' : 'Save'}
                  </button>
                </div>

                {draft ? (
                  <div className="mt-5 grid gap-4 xl:grid-cols-[0.32fr_0.68fr]">
                    <div className="space-y-4">
                      <label className="flex items-center gap-3 rounded-2xl border border-gray-200 px-4 py-3 text-sm font-medium text-gray-700">
                        <input
                          type="checkbox"
                          checked={draft.enabled}
                          onChange={(event) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [keyForRule(rule)]: { ...draft, enabled: event.target.checked },
                            }))
                          }
                        />
                        Rule enabled
                      </label>

                      <label className="block text-sm font-medium text-gray-700">
                        Notes
                        <textarea
                          rows={5}
                          value={draft.notes}
                          onChange={(event) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [keyForRule(rule)]: { ...draft, notes: event.target.value },
                            }))
                          }
                          className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-3"
                        />
                      </label>
                    </div>

                    <label className="block text-sm font-medium text-gray-700">
                      Thresholds JSON
                      <textarea
                        rows={12}
                        value={draft.thresholdsJson}
                        onChange={(event) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [keyForRule(rule)]: { ...draft, thresholdsJson: event.target.value },
                          }))
                        }
                        className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-3 font-mono text-sm"
                      />
                    </label>
                  </div>
                ) : null}
              </article>
            );
          })}
        </section>
      </div>
    </AdminLayout>
  );
};
