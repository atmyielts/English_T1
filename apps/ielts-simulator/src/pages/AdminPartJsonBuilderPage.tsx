import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AdminLayout } from '../components/admin/AdminLayout';
import { IELTS_PRODUCT_ID } from '../lib/constants';
import { adminBuilderLoad, adminBuilderSave, adminTestsList, type AdminBuilderPayload, type AdminTestRow } from '../lib/platformClient';
import { useAccess } from '../lib/useAccess';

type Scope = 'listening' | 'reading';
type Mode = 'replace' | 'append';
type Deleted = { section_ids: string[]; part_ids: string[]; unit_ids: string[] };

const LISTENING_TEMPLATE = {
  section_type: 'listening',
  replace_existing: true,
  target_part_index: 1,
  part_payload: {
    name: 'Part 1',
    metadata: {},
    content_units: [
      { type: 'instruction', data: { text: 'Questions 1-10. Listen and answer.' }, metadata: {} },
      { type: 'audio', data: { play_once: true, auto_start: false, storage: { bucket: '', path: '' } }, metadata: {} },
      {
        type: 'question_single_choice',
        data: { prompt: 'Question 1', options: [{ id: 'A', label: 'Option A' }, { id: 'B', label: 'Option B' }, { id: 'C', label: 'Option C' }] },
        metadata: { question_number: 1 },
        answer_key: { correct: { option_id: 'A' } },
      },
    ],
  },
};

const READING_TEMPLATE = {
  section_type: 'reading',
  replace_existing: true,
  target_part_index: 1,
  part_payload: {
    name: 'Passage 1',
    metadata: {},
    content_units: [
      { type: 'instruction', data: { text: 'Read Passage 1 and answer Questions 1-13.' }, metadata: {} },
      { type: 'reading_passage', data: { title: 'Sample passage', text: 'Paste passage text here...' }, metadata: {} },
      {
        type: 'question_gap_fill',
        data: { prompt: 'Complete the notes below.', text: 'The {{1}} is increasing.', blanks: [{ id: '1', placeholder: 'Q1' }] },
        metadata: { question_number: 1 },
        answer_key: { correct: { blanks: { '1': ['population'] } } },
      },
    ],
  },
};

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const s = (v: unknown) => (typeof v === 'string' ? v : '');
const b = (v: unknown, fb = false) => (typeof v === 'boolean' ? v : fb);
const n = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim()) {
    const p = Number(v);
    if (Number.isFinite(p)) return p;
  }
  return null;
};
const uuid = () => ((globalThis as any).crypto?.randomUUID ? (globalThis as any).crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
const secType = (section: AdminBuilderPayload['sections'][number]) =>
  String((isObj(section.metadata) ? (section.metadata as any).type : '') ?? '')
    .toLowerCase()
    .trim();
const label = (scope: Scope) => (scope === 'listening' ? 'Part' : 'Passage');
const secLabel = (scope: Scope) => (scope === 'listening' ? 'Listening' : 'Reading');
const secDuration = (scope: Scope) => (scope === 'listening' ? 2400 : 3600);

const normalizeDeleted = (value: unknown): Deleted => ({
  section_ids: Array.isArray((value as any)?.section_ids) ? (value as any).section_ids.map(String) : [],
  part_ids: Array.isArray((value as any)?.part_ids) ? (value as any).part_ids.map(String) : [],
  unit_ids: Array.isArray((value as any)?.unit_ids) ? (value as any).unit_ids.map(String) : [],
});

const dedupe = (values: string[]) => Array.from(new Set(values.filter(Boolean)));

const toTemplate = (scope: Scope, mode: Mode, idx: string, name: string): string => {
  const root = JSON.parse(JSON.stringify(scope === 'listening' ? LISTENING_TEMPLATE : READING_TEMPLATE));
  root.section_type = scope;
  root.replace_existing = mode === 'replace';
  if (mode === 'replace') {
    const num = n(idx);
    if (num && num > 0) root.target_part_index = Math.floor(num);
    const clean = name.trim();
    if (clean) root.target_part_name = clean;
  } else {
    delete root.target_part_index;
    delete root.target_part_name;
  }
  return JSON.stringify(root, null, 2);
};

const buildSavePayload = (payload: AdminBuilderPayload, deleted: Deleted): AdminBuilderPayload => ({
  ...payload,
  sections: payload.sections.map((section, sIdx) => ({
    ...section,
    id: section.id ?? uuid(),
    display_order: sIdx + 1,
    metadata: isObj(section.metadata) ? section.metadata : {},
    parts: section.parts.map((part, pIdx) => ({
      ...part,
      id: part.id ?? uuid(),
      display_order: pIdx + 1,
      metadata: isObj(part.metadata) ? part.metadata : {},
      content_units: part.content_units.map((unit, uIdx) => ({
        ...unit,
        id: unit.id ?? uuid(),
        display_order: uIdx + 1,
        data: isObj(unit.data) ? unit.data : {},
        metadata: isObj(unit.metadata) ? unit.metadata : {},
        answer_key:
          isObj(unit.answer_key) && isObj((unit.answer_key as any).correct)
            ? { correct: (unit.answer_key as any).correct, metadata: isObj((unit.answer_key as any).metadata) ? (unit.answer_key as any).metadata : {} }
            : null,
      })),
    })),
  })),
  deleted: { section_ids: dedupe(deleted.section_ids), part_ids: dedupe(deleted.part_ids), unit_ids: dedupe(deleted.unit_ids) },
});

const applyPartJson = (
  payload: AdminBuilderPayload,
  deleted: Deleted,
  jsonText: string,
  defaults: { scope: Scope; mode: Mode; targetIndex: number | null; targetName: string },
): { ok: true; payload: AdminBuilderPayload; deleted: Deleted; msg: string } | { ok: false; err: string } => {
  let root: Record<string, unknown>;
  try {
    const parsed = JSON.parse(jsonText);
    if (!isObj(parsed)) return { ok: false, err: 'JSON must be an object.' };
    root = parsed;
  } catch (e) {
    return { ok: false, err: e instanceof Error ? e.message : 'Invalid JSON.' };
  }

  const partPayload = isObj((root as any).part_payload) ? ((root as any).part_payload as Record<string, unknown>) : root;
  const explicit = String((root as any).section_type ?? '').toLowerCase().trim();
  if (explicit && explicit !== 'listening' && explicit !== 'reading') return { ok: false, err: 'section_type must be listening or reading.' };
  const scope = (explicit || defaults.scope) as Scope;

  const units = Array.isArray((partPayload as any).content_units) ? ((partPayload as any).content_units as unknown[]) : [];
  if (units.length === 0) return { ok: false, err: 'part_payload.content_units must be a non-empty array.' };

  const rawIdx = n((root as any).target_part_index);
  const targetIndex = rawIdx != null ? Math.floor(rawIdx) - 1 : defaults.targetIndex;
  if (targetIndex != null && targetIndex < 0) return { ok: false, err: 'target_part_index must be positive (1-based).' };
  const targetName = s((root as any).target_part_name).trim() || defaults.targetName;
  const replace = typeof (root as any).replace_existing === 'boolean' ? b((root as any).replace_existing, false) : defaults.mode === 'replace';

  if (!replace && (targetIndex != null || targetName)) {
    return { ok: false, err: 'Append mode does not support target_part_index/target_part_name.' };
  }

  const sectionIdx = payload.sections.findIndex((x) => secType(x) === scope);
  const existingSection = sectionIdx >= 0 ? payload.sections[sectionIdx] : null;
  const section: AdminBuilderPayload['sections'][number] =
    existingSection ?? { id: uuid(), name: secLabel(scope), metadata: { type: scope, duration_seconds: secDuration(scope) }, parts: [] };

  const sectionMeta = isObj(section.metadata) ? { ...section.metadata } : {};
  (sectionMeta as any).type = scope;
  if (!n((sectionMeta as any).duration_seconds) || (n((sectionMeta as any).duration_seconds) ?? 0) <= 0) {
    (sectionMeta as any).duration_seconds = secDuration(scope);
  }

  const nextPart: AdminBuilderPayload['sections'][number]['parts'][number] = {
    id: uuid(),
    name: s((partPayload as any).name).trim(),
    metadata: isObj((partPayload as any).metadata) ? (partPayload as any).metadata : {},
    content_units: units.map((u, i) => {
      const unit = isObj(u) ? u : {};
      return {
        id: uuid(),
        type: s((unit as any).type).trim() || 'instruction',
        display_order: i + 1,
        data: isObj((unit as any).data) ? (unit as any).data : {},
        metadata: isObj((unit as any).metadata) ? (unit as any).metadata : {},
        answer_key:
          isObj((unit as any).answer_key) && isObj(((unit as any).answer_key as any).correct)
            ? {
                correct: ((unit as any).answer_key as any).correct,
                metadata: isObj(((unit as any).answer_key as any).metadata) ? ((unit as any).answer_key as any).metadata : {},
              }
            : null,
      };
    }),
  };

  const parts = [...section.parts];
  const removedUnits: string[] = [];
  let action = 'appended';
  let partNo = parts.length + 1;

  if (replace && parts.length > 0) {
    let idx = -1;
    if (targetIndex != null) {
      if (targetIndex >= parts.length) return { ok: false, err: `target_part_index ${targetIndex + 1} out of range.` };
      idx = targetIndex;
    } else if (targetName) {
      idx = parts.findIndex((p) => s(p.name).trim().toLowerCase() === targetName.toLowerCase());
      if (idx < 0) return { ok: false, err: `${label(scope)} "${targetName}" not found.` };
    } else {
      return { ok: false, err: 'Replace mode requires target index or name.' };
    }

    const oldPart = parts[idx];
    const oldUnits = oldPart.content_units ?? [];
    const mergedUnits = nextPart.content_units.map((u, i) => ({ ...u, id: oldUnits[i]?.id ?? u.id ?? uuid() }));
    oldUnits.slice(mergedUnits.length).forEach((u) => u.id && removedUnits.push(u.id));
    parts[idx] = { ...nextPart, id: oldPart.id ?? nextPart.id ?? uuid(), content_units: mergedUnits };
    action = 'replaced';
    partNo = idx + 1;
  } else {
    parts.push(nextPart);
  }

  const normalizedParts = parts.map((p, i) => ({
    ...p,
    id: p.id ?? uuid(),
    name: s(p.name).trim() || `${label(scope)} ${i + 1}`,
    display_order: i + 1,
    metadata: isObj(p.metadata) ? p.metadata : {},
    content_units: p.content_units.map((u, j) => ({ ...u, id: u.id ?? uuid(), display_order: j + 1 })),
  }));

  const nextSection = { ...section, id: section.id ?? uuid(), name: s(section.name).trim() || secLabel(scope), metadata: sectionMeta, parts: normalizedParts };
  const remaining = sectionIdx >= 0 ? payload.sections.filter((_, i) => i !== sectionIdx) : payload.sections;
  const nextSections = [...remaining, nextSection].sort((a, b) => {
    const ra = secType(a) === 'listening' ? 0 : secType(a) === 'reading' ? 1 : secType(a) === 'writing' ? 2 : 99;
    const rb = secType(b) === 'listening' ? 0 : secType(b) === 'reading' ? 1 : secType(b) === 'writing' ? 2 : 99;
    return ra - rb;
  });

  return {
    ok: true,
    payload: { ...payload, sections: nextSections },
    deleted: { section_ids: dedupe(deleted.section_ids), part_ids: dedupe(deleted.part_ids), unit_ids: dedupe([...deleted.unit_ids, ...removedUnits]) },
    msg: `${action === 'replaced' ? 'Replaced' : 'Appended'} ${label(scope).toLowerCase()} #${partNo}.`,
  };
};

export const AdminPartJsonBuilderPage: React.FC = () => {
  const { accessToken } = useAccess();
  const location = useLocation();
  const navigate = useNavigate();
  const queryId = useMemo(() => new URLSearchParams(location.search).get('experience_id') ?? '', [location.search]);

  const [tests, setTests] = useState<AdminTestRow[]>([]);
  const [selectedExperienceId, setSelectedExperienceId] = useState(queryId);
  const [payload, setPayload] = useState<AdminBuilderPayload | null>(null);
  const [deleted, setDeleted] = useState<Deleted>({ section_ids: [], part_ids: [], unit_ids: [] });
  const [scope, setScope] = useState<Scope>('listening');
  const [mode, setMode] = useState<Mode>('replace');
  const [targetIndex, setTargetIndex] = useState('1');
  const [targetName, setTargetName] = useState('');
  const [jsonDraft, setJsonDraft] = useState(() => JSON.stringify(LISTENING_TEMPLATE, null, 2));
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => setSelectedExperienceId(queryId), [queryId]);

  useEffect(() => {
    if (!accessToken) return;
    const run = async () => {
      try {
        const res = await adminTestsList(accessToken, IELTS_PRODUCT_ID);
        setTests(res.experiences ?? []);
      } catch {
        setTests([]);
      }
    };
    void run();
  }, [accessToken]);

  const loadExperience = async (id: string) => {
    if (!accessToken || !id) return;
    setLoading(true);
    setError(null);
    setStatus(null);
    try {
      const res = await adminBuilderLoad(accessToken, id);
      setPayload(res.payload);
      setDeleted(normalizeDeleted(res.payload.deleted));
      setDirty(false);
      setStatus(`Loaded "${res.payload.experience.name}".`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load test.');
      setPayload(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!accessToken || !selectedExperienceId || payload) return;
    void loadExperience(selectedExperienceId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, selectedExperienceId]);

  const listening = useMemo(() => payload?.sections.find((x) => secType(x) === 'listening') ?? null, [payload]);
  const reading = useMemo(() => payload?.sections.find((x) => secType(x) === 'reading') ?? null, [payload]);

  const apply = () => {
    if (!payload) return;
    setError(null);
    setStatus(null);
    const res = applyPartJson(payload, deleted, jsonDraft, {
      scope,
      mode,
      targetIndex: mode === 'replace' && targetIndex.trim() ? Math.max(0, (Math.floor(Number(targetIndex) || 1) - 1)) : null,
      targetName: mode === 'replace' ? targetName.trim() : '',
    });
    if (!res.ok) {
      setError(res.err);
      return;
    }
    setPayload(res.payload);
    setDeleted(res.deleted);
    setDirty(true);
    setStatus(res.msg);
  };

  const save = async () => {
    if (!accessToken || !payload) return;
    if (!payload.experience?.id) {
      setError('Load existing test first.');
      return;
    }
    setSaving(true);
    setError(null);
    setStatus(null);
    try {
      const saved = await adminBuilderSave(accessToken, buildSavePayload(payload, deleted));
      setDirty(false);
      setDeleted({ section_ids: [], part_ids: [], unit_ids: [] });
      setStatus(`Saved. Version ${saved.version}.`);
      await loadExperience(saved.experience_id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-4">
        <div className="bg-white border border-gray-200 rounded-2xl p-4 sm:p-6">
          <h2 className="text-xl font-bold text-gray-900">Part JSON Builder</h2>
          <p className="text-sm text-gray-600 mt-1">Standalone builder for Listening parts and Reading passages.</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-4 sm:p-6 space-y-2">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_auto] gap-2">
            <select
              value={selectedExperienceId}
              onChange={(e) => {
                const id = e.target.value;
                setSelectedExperienceId(id);
                setPayload(null);
                setDirty(false);
                navigate({ pathname: '/admin/part-builder', search: id ? `?experience_id=${encodeURIComponent(id)}` : '' }, { replace: true });
              }}
              className="px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm"
            >
              <option value="">Select test</option>
              {tests.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} {t.is_active ? '(active)' : '(draft)'}
                </option>
              ))}
            </select>
            <button type="button" className="px-3 py-2 rounded-lg border border-gray-200 text-sm font-semibold hover:bg-gray-50 disabled:opacity-60" onClick={() => void loadExperience(selectedExperienceId)} disabled={!selectedExperienceId || loading}>
              {loading ? 'Loading...' : 'Load'}
            </button>
            <button type="button" className="px-3 py-2 rounded-lg border border-gray-200 text-sm font-semibold hover:bg-gray-50 disabled:opacity-60" onClick={() => navigate(`/admin/test/${selectedExperienceId}`)} disabled={!selectedExperienceId}>
              Open test
            </button>
          </div>
        </div>

        {payload ? (
          <>
            <div className="bg-white border border-gray-200 rounded-2xl p-4 sm:p-6 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                <label className="text-xs text-gray-600 space-y-1"><span className="font-semibold">Section</span><select value={scope} onChange={(e) => setScope(e.target.value as Scope)} className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm"><option value="listening">Listening</option><option value="reading">Reading</option></select></label>
                <label className="text-xs text-gray-600 space-y-1"><span className="font-semibold">Mode</span><select value={mode} onChange={(e) => setMode(e.target.value as Mode)} className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm"><option value="replace">Replace</option><option value="append">Append</option></select></label>
                <label className="text-xs text-gray-600 space-y-1"><span className="font-semibold">Target index</span><input value={targetIndex} onChange={(e) => setTargetIndex(e.target.value)} disabled={mode === 'append'} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="1" /></label>
                <label className="text-xs text-gray-600 space-y-1"><span className="font-semibold">Target name (optional)</span><input value={targetName} onChange={(e) => setTargetName(e.target.value)} disabled={mode === 'append'} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder={scope === 'listening' ? 'Part 2' : 'Passage 2'} /></label>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="px-3 py-2 rounded-lg border border-gray-200 text-xs font-semibold hover:bg-gray-50" onClick={() => { setScope('listening'); setJsonDraft(toTemplate('listening', mode, targetIndex, targetName)); }}>Load listening template</button>
                <button type="button" className="px-3 py-2 rounded-lg border border-gray-200 text-xs font-semibold hover:bg-gray-50" onClick={() => { setScope('reading'); setJsonDraft(toTemplate('reading', mode, targetIndex, targetName)); }}>Load reading template</button>
                <button type="button" className="px-3 py-2 rounded-lg border border-gray-200 text-xs font-semibold hover:bg-gray-50" onClick={() => setJsonDraft(toTemplate(scope, mode, targetIndex, targetName))}>Regenerate from config</button>
              </div>
              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">Append mode does not support target fields. Use Replace mode for targeted updates.</div>
            </div>

            <div className="bg-white border border-gray-200 rounded-2xl p-4 sm:p-6 space-y-3">
              <textarea value={jsonDraft} onChange={(e) => setJsonDraft(e.target.value)} rows={20} className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-xs" />
              <div className="flex flex-wrap gap-2">
                <button type="button" className="px-3 py-2 rounded-lg border border-gray-200 text-sm font-semibold hover:bg-gray-50" onClick={apply}>Apply JSON</button>
                <button type="button" className="px-3 py-2 rounded-lg border border-gray-200 text-sm font-semibold hover:bg-gray-50 disabled:opacity-60" onClick={() => void save()} disabled={!dirty || saving}>{saving ? 'Saving...' : 'Save changes'}</button>
                <button type="button" className="px-3 py-2 rounded-lg border border-gray-200 text-sm font-semibold hover:bg-gray-50" onClick={() => void loadExperience(selectedExperienceId)}>Reload</button>
              </div>
              {status ? <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-2">{status}</div> : null}
              {error ? <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">{error}</div> : null}
            </div>

            <div className="bg-white border border-gray-200 rounded-2xl p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div className="rounded-xl border border-gray-200 p-3"><div className="text-sm font-semibold text-gray-900">Listening</div>{!listening ? <div className="text-xs text-gray-500 mt-2">No section.</div> : <div className="space-y-2 mt-2">{listening.parts.map((p, i) => <div key={p.id ?? `l-${i}`} className="rounded-lg border border-gray-100 p-2 text-xs text-gray-700">#{i + 1} {s(p.name).trim() || `Part ${i + 1}`} - {p.content_units.length} unit(s)</div>)}</div>}</div>
              <div className="rounded-xl border border-gray-200 p-3"><div className="text-sm font-semibold text-gray-900">Reading</div>{!reading ? <div className="text-xs text-gray-500 mt-2">No section.</div> : <div className="space-y-2 mt-2">{reading.parts.map((p, i) => <div key={p.id ?? `r-${i}`} className="rounded-lg border border-gray-100 p-2 text-xs text-gray-700">#{i + 1} {s(p.name).trim() || `Passage ${i + 1}`} - {p.content_units.length} unit(s)</div>)}</div>}</div>
            </div>
          </>
        ) : null}
      </div>
    </AdminLayout>
  );
};

