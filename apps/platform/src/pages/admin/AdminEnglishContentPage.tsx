import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AdminLayout } from '../../components/admin/AdminLayout';
import {
  AdminEnglishStudioError,
  adminEnglishContentList,
  adminEnglishContentSummary,
  adminEnglishContentUpdate,
  adminEnglishStudioDuplicate,
  adminEnglishStudioGet,
  type AdminEnglishContentItem,
  type AdminEnglishContentSummaryRow,
  type AdminEnglishStudioItem,
  type EnglishPresentationMeta,
} from '../../lib/platformClient';
import { AdminEnglishStudioEditor, newStudioDraft } from './AdminEnglishStudioEditor';
import { EnglishAdminSubnav, toFriendlyAdminError, useAdminAccessToken } from './AdminEnglishUtils';

/** Server message for studio failures, except auth/rate-limit errors which get the friendly text. */
const studioErrorText = (err: unknown, fallback: string): string =>
  err instanceof AdminEnglishStudioError && err.serverMessage && ![401, 403, 429].includes(err.status)
    ? err.serverMessage
    : toFriendlyAdminError(err, fallback);

type StudioState = { mode: 'new'; key: number } | { mode: 'edit'; key: number; data: AdminEnglishStudioItem } | null;

const SERVICES = [
  'reading',
  'listening',
  'writing',
  'speaking',
  'grammar',
  'vocabulary',
  'immersion',
] as const;

type ServiceKey = (typeof SERVICES)[number];

type ContentDraft = {
  title: string;
  status: string;
  sort_order: number;
  scene_label: string;
  hero_note: string;
  cover_style_key: string;
  coach_tone: string;
  difficulty_badge: string;
  support_mode_labels: string;
  target_badges: string;
  ambient_audio_key: string;
  celebration_copy: string;
  preview_media_url: string;
};

const emptyDraft: ContentDraft = {
  title: '',
  status: 'draft',
  sort_order: 100,
  scene_label: '',
  hero_note: '',
  cover_style_key: '',
  coach_tone: '',
  difficulty_badge: '',
  support_mode_labels: '',
  target_badges: '',
  ambient_audio_key: '',
  celebration_copy: '',
  preview_media_url: '',
};

const metaArrayToInput = (value: unknown): string => (Array.isArray(value) ? value.join('\n') : '');

const draftFromItem = (item: AdminEnglishContentItem | null): ContentDraft => {
  if (!item) return emptyDraft;
  const meta = (item.presentation_meta ?? {}) as EnglishPresentationMeta;
  return {
    title: item.title ?? '',
    status: item.status ?? 'draft',
    sort_order: typeof item.sort_order === 'number' ? item.sort_order : 100,
    scene_label: meta.scene_label ?? '',
    hero_note: meta.hero_note ?? '',
    cover_style_key: meta.cover_style_key ?? '',
    coach_tone: meta.coach_tone ?? '',
    difficulty_badge: meta.difficulty_badge ?? '',
    support_mode_labels: metaArrayToInput(meta.support_mode_labels),
    target_badges: metaArrayToInput(meta.target_badges),
    ambient_audio_key: meta.ambient_audio_key ?? '',
    celebration_copy: meta.celebration_copy ?? '',
    preview_media_url: meta.preview_media_url ?? '',
  };
};

const splitLines = (value: string): string[] =>
  value
    .split(/\r?\n|,/)
    .map((entry) => entry.trim())
    .filter(Boolean);

export const AdminEnglishContentPage: React.FC = () => {
  const { withFreshToken } = useAdminAccessToken();
  const [summary, setSummary] = useState<AdminEnglishContentSummaryRow[]>([]);
  const [serviceKey, setServiceKey] = useState<ServiceKey>('reading');
  const [items, setItems] = useState<AdminEnglishContentItem[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string>('');
  const [draft, setDraft] = useState<ContentDraft>(emptyDraft);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [studio, setStudio] = useState<StudioState>(null);
  const [studioBusy, setStudioBusy] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const preferredIdRef = useRef<string | null>(null);

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedId) ?? items[0] ?? null,
    [items, selectedId],
  );

  /** Re-reads the list and summary, keeping `preferId` selected. */
  const reloadList = (preferId?: string) => {
    preferredIdRef.current = preferId ?? selectedId ?? null;
    setReloadToken((value) => value + 1);
  };

  const openEditor = async (id: string) => {
    setStudioBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const data = await withFreshToken((token) => adminEnglishStudioGet(token, serviceKey, id));
      setStudio({ mode: 'edit', key: Date.now(), data });
    } catch (err) {
      setError(studioErrorText(err, 'Could not open this item.'));
    } finally {
      setStudioBusy(false);
    }
  };

  const duplicateItem = async (id: string) => {
    setStudioBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const data = await withFreshToken((token) => adminEnglishStudioDuplicate(token, { service_key: serviceKey, id }));
      reloadList(data.item.id);
      setStudio({ mode: 'edit', key: Date.now(), data });
      setSuccess(`Created draft copy "${data.item.title}".`);
    } catch (err) {
      const details =
        err instanceof AdminEnglishStudioError && err.fieldErrors.length
          ? ` ${err.fieldErrors.map((entry) => `${entry.field}: ${entry.message}`).join(' ')}`
          : '';
      setError(`${studioErrorText(err, 'Could not duplicate this item.')}${details}`);
    } finally {
      setStudioBusy(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    void withFreshToken((token) => adminEnglishContentSummary(token))
      .then((payload) => {
        if (cancelled) return;
        setSummary(payload.services ?? []);
      })
      .catch(() => {
        if (!cancelled) setSummary([]);
      });
    return () => {
      cancelled = true;
    };
  }, [withFreshToken, reloadToken]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void withFreshToken((token) => adminEnglishContentList(token, { service_key: serviceKey, limit: 300 }))
      .then((payload) => {
        if (cancelled) return;
        const list = payload.items ?? [];
        setItems(list);
        setNote(payload.note ?? null);
        const preferred = preferredIdRef.current;
        preferredIdRef.current = null;
        const chosen = list.find((entry) => entry.id === preferred) ?? list[0] ?? null;
        setSelectedId(chosen?.id ?? '');
        setDraft(draftFromItem(chosen));
      })
      .catch((err) => {
        if (cancelled) return;
        setItems([]);
        setNote(null);
        setSelectedId('');
        setDraft(emptyDraft);
        setError(toFriendlyAdminError(err, 'Could not load English content for this service.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [serviceKey, withFreshToken, reloadToken]);

  useEffect(() => {
    setDraft(draftFromItem(selectedItem));
  }, [selectedItem]);

  const selectedSummary = summary.find((row) => row.service_key === serviceKey);

  const handleSave = async () => {
    if (!selectedItem) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const patch = {
        title: draft.title.trim(),
        status: draft.status,
        sort_order: draft.sort_order,
        presentation_meta: {
          scene_label: draft.scene_label.trim() || undefined,
          hero_note: draft.hero_note.trim() || undefined,
          cover_style_key: draft.cover_style_key.trim() || undefined,
          coach_tone: draft.coach_tone.trim() || undefined,
          difficulty_badge: draft.difficulty_badge.trim() || undefined,
          support_mode_labels: splitLines(draft.support_mode_labels),
          target_badges: splitLines(draft.target_badges),
          ambient_audio_key: draft.ambient_audio_key.trim() || undefined,
          celebration_copy: draft.celebration_copy.trim() || undefined,
          preview_media_url: draft.preview_media_url.trim() || undefined,
        },
      };
      const { item } = await withFreshToken((token) =>
        adminEnglishContentUpdate(token, {
          service_key: serviceKey,
          id: selectedItem.id,
          patch,
        }),
      );
      setItems((prev) => prev.map((entry) => (entry.id === item.id ? item : entry)));
      setDraft(draftFromItem(item));
      setSuccess(`${item.title} updated.`);
    } catch (err) {
      setError(toFriendlyAdminError(err, 'Could not save English content changes.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <section className="rounded-[28px] border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <span className="inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-800">
                English Content Studio
              </span>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Content authoring</h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-600">
                  Create and edit lessons for every English skill: texts, questions, practice items, steps and word sets. Changes are
                  checked so learners can always be graded, and published items appear in the learner catalog.
                </p>
              </div>
            </div>
            <EnglishAdminSubnav active="content" />
          </div>
        </section>

        {error ? <div className="rounded-3xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{error}</div> : null}
        {success ? <div className="rounded-3xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-700">{success}</div> : null}

        <section className="rounded-[28px] border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap gap-2">
            {SERVICES.map((service) => {
              const row = summary.find((entry) => entry.service_key === service);
              return (
                <button
                  key={service}
                  type="button"
                  onClick={() => {
                    setServiceKey(service);
                    setStudio(null);
                    setError(null);
                    setSuccess(null);
                  }}
                  className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                    serviceKey === service
                      ? 'border-orange-300 bg-orange-50 text-orange-900'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:text-gray-900'
                  }`}
                >
                  {service}
                  {row ? ` · ${row.total_count}` : ''}
                </button>
              );
            })}
          </div>
          {selectedSummary ? (
            <div className="mt-4 flex flex-wrap gap-3 text-sm text-gray-600">
              <span>Total: {selectedSummary.total_count}</span>
              <span>Published: {selectedSummary.published_count}</span>
              <span>Drafts: {selectedSummary.draft_count}</span>
              <span>Readiness: {selectedSummary.readiness}</span>
            </div>
          ) : null}
        </section>

        {studio ? (
          <AdminEnglishStudioEditor
            key={studio.key}
            serviceKey={serviceKey}
            initial={studio.mode === 'edit' ? studio.data.editor : newStudioDraft(serviceKey)}
            existing={studio.mode === 'edit' ? studio.data : null}
            withFreshToken={withFreshToken}
            onSaved={(saved) => {
              setStudio((prev) => (prev ? { mode: 'edit', key: prev.key, data: saved } : prev));
              reloadList(saved.item.id);
            }}
            onClose={() => setStudio(null)}
          />
        ) : null}

        <section className={`grid gap-4 xl:grid-cols-[0.92fr_1.08fr] ${studio ? 'hidden' : ''}`}>
          <div className="rounded-[28px] border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Catalog</h2>
                <p className="mt-1 text-sm text-gray-600">Choose an item to edit, or start a new one.</p>
              </div>
              <div className="flex items-center gap-3">
                {loading ? <span className="text-sm text-gray-500">Loading...</span> : null}
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setSuccess(null);
                    setStudio({ mode: 'new', key: Date.now() });
                  }}
                  className="rounded-full bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600"
                >
                  New item
                </button>
              </div>
            </div>
            {note ? (
              <div className="mt-4 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm leading-6 text-gray-600">{note}</div>
            ) : null}
            <div className="mt-5 grid gap-3">
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(item.id);
                    setDraft(draftFromItem(item));
                  }}
                  className={`rounded-3xl border p-4 text-left transition ${
                    selectedItem?.id === item.id ? 'border-orange-300 bg-orange-50' : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <strong className="text-base text-gray-900">{item.title}</strong>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-gray-600">
                      {item.status ?? 'n/a'}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-gray-600">{item.summary ?? 'No summary provided.'}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(item.detail_badges ?? []).map((badge) => (
                      <span key={`${item.id}-${badge}`} className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">
                        {badge}
                      </span>
                    ))}
                  </div>
                </button>
              ))}
              {!loading && items.length === 0 && !note ? (
                <div className="rounded-3xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-500">
                  No authored content found for this service yet.
                </div>
              ) : null}
            </div>
          </div>

          <div className="rounded-[28px] border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Quick settings</h2>
                <p className="mt-1 text-sm text-gray-600">
                  Title, status, order and presentation. Use Edit content for the lesson itself.
                </p>
              </div>
              {selectedItem ? (
                <div className="flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => void openEditor(selectedItem.id)}
                    disabled={studioBusy}
                    className="rounded-full border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-800 disabled:opacity-50"
                  >
                    Edit content
                  </button>
                  <button
                    type="button"
                    onClick={() => void duplicateItem(selectedItem.id)}
                    disabled={studioBusy}
                    className="rounded-full border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-800 disabled:opacity-50"
                  >
                    Duplicate
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSave()}
                    disabled={saving}
                    className="rounded-full bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white disabled:bg-gray-300"
                  >
                    {saving ? 'Saving...' : 'Save changes'}
                  </button>
                </div>
              ) : null}
            </div>

            {!selectedItem ? (
              <div className="mt-6 rounded-3xl border border-dashed border-gray-200 bg-gray-50 px-5 py-10 text-sm text-gray-500">
                Select a content item to edit its presentation metadata.
              </div>
            ) : (
              <div className="mt-6 space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Title
                    <input
                      value={draft.title}
                      onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
                      className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-3"
                    />
                  </label>
                  <label className="block text-sm font-medium text-gray-700">
                    Status
                    <select
                      value={draft.status}
                      onChange={(event) => setDraft((prev) => ({ ...prev, status: event.target.value }))}
                      className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-3"
                    >
                      <option value="draft">draft</option>
                      <option value="published">published</option>
                      <option value="archived">archived</option>
                    </select>
                  </label>
                </div>

                <label className="block text-sm font-medium text-gray-700">
                  Sort order
                  <input
                    type="number"
                    value={draft.sort_order}
                    onChange={(event) => setDraft((prev) => ({ ...prev, sort_order: Number(event.target.value) || 0 }))}
                    className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-3"
                  />
                </label>

                {serviceKey !== 'vocabulary' ? (
                <>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Scene label
                    <input
                      value={draft.scene_label}
                      onChange={(event) => setDraft((prev) => ({ ...prev, scene_label: event.target.value }))}
                      className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-3"
                    />
                  </label>
                  <label className="block text-sm font-medium text-gray-700">
                    Difficulty badge
                    <input
                      value={draft.difficulty_badge}
                      onChange={(event) => setDraft((prev) => ({ ...prev, difficulty_badge: event.target.value }))}
                      className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-3"
                    />
                  </label>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Cover style key
                    <input
                      value={draft.cover_style_key}
                      onChange={(event) => setDraft((prev) => ({ ...prev, cover_style_key: event.target.value }))}
                      className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-3"
                    />
                  </label>
                  <label className="block text-sm font-medium text-gray-700">
                    Coach tone
                    <input
                      value={draft.coach_tone}
                      onChange={(event) => setDraft((prev) => ({ ...prev, coach_tone: event.target.value }))}
                      className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-3"
                    />
                  </label>
                </div>

                <label className="block text-sm font-medium text-gray-700">
                  Hero note
                  <textarea
                    rows={3}
                    value={draft.hero_note}
                    onChange={(event) => setDraft((prev) => ({ ...prev, hero_note: event.target.value }))}
                    className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-3"
                  />
                </label>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Support mode labels
                    <textarea
                      rows={4}
                      value={draft.support_mode_labels}
                      onChange={(event) => setDraft((prev) => ({ ...prev, support_mode_labels: event.target.value }))}
                      className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-3"
                      placeholder={'Guided mode\nFocus mode'}
                    />
                  </label>
                  <label className="block text-sm font-medium text-gray-700">
                    Target badges
                    <textarea
                      rows={4}
                      value={draft.target_badges}
                      onChange={(event) => setDraft((prev) => ({ ...prev, target_badges: event.target.value }))}
                      className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-3"
                      placeholder={'Inference\nDetail recall\nTask completion'}
                    />
                  </label>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Ambient audio key
                    <input
                      value={draft.ambient_audio_key}
                      onChange={(event) => setDraft((prev) => ({ ...prev, ambient_audio_key: event.target.value }))}
                      className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-3"
                    />
                  </label>
                  <label className="block text-sm font-medium text-gray-700">
                    Preview media URL
                    <input
                      value={draft.preview_media_url}
                      onChange={(event) => setDraft((prev) => ({ ...prev, preview_media_url: event.target.value }))}
                      className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-3"
                    />
                  </label>
                </div>

                <label className="block text-sm font-medium text-gray-700">
                  Celebration copy
                  <textarea
                    rows={3}
                    value={draft.celebration_copy}
                    onChange={(event) => setDraft((prev) => ({ ...prev, celebration_copy: event.target.value }))}
                    className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-3"
                  />
                </label>
                </>
                ) : null}

                {selectedItem.notes && selectedItem.notes.length > 0 ? (
                  <div className="rounded-3xl border border-gray-200 bg-gray-50 p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">Content notes</div>
                    <ul className="mt-3 space-y-2 text-sm text-gray-600">
                      {selectedItem.notes.map((entry) => (
                        <li key={entry}>• {entry}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </section>
      </div>
    </AdminLayout>
  );
};
