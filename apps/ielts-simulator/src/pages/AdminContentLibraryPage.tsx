import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AdminLayout } from '../components/admin/AdminLayout';
import { IELTS_PRODUCT_ID } from '../lib/constants';
import {
  adminBuilderPartTemplatePayload,
  adminBuilderPartTemplates,
  adminBuilderPartTemplateUpsert,
  type AdminPartTemplateSummary,
} from '../lib/platformClient';
import {
  downloadJsonFile,
  moduleLabel,
  normalizePartTemplateInput,
  slugifyTemplateKey,
  type IeltsPartTemplateV1,
  type ModuleType,
} from '../lib/ieltsContent';
import { useAccess } from '../lib/useAccess';

const createExamplePart = (moduleType: ModuleType): IeltsPartTemplateV1 => {
  if (moduleType === 'reading') {
    return {
      schema_version: 'ielts.content.v1',
      entity_type: 'part',
      module_type: 'reading',
      template_key: '',
      name: 'Passage 1',
      metadata: {},
      content_units: [
        { type: 'instruction', display_order: 1, data: { text: 'Read the passage and answer Questions 1-13.' }, metadata: {} },
        { type: 'reading_passage', display_order: 2, data: { title: 'Sample passage', text: 'Paste passage text here...' }, metadata: {} },
        {
          type: 'question_gap_fill',
          display_order: 3,
          data: {
            prompt: 'Complete the notes below.',
            text: 'The {{1}} is increasing in urban areas.',
            blanks: [{ id: '1', placeholder: 'Q1' }],
          },
          metadata: { question_number: 1 },
          answer_key: { correct: { blanks: { '1': ['population'] } }, metadata: {} },
        },
      ],
    };
  }

  if (moduleType === 'writing') {
    return {
      schema_version: 'ielts.content.v1',
      entity_type: 'part',
      module_type: 'writing',
      template_key: '',
      name: 'Task 1',
      metadata: {},
      content_units: [
        { type: 'instruction', display_order: 1, data: { text: 'Write at least 150 words.' }, metadata: {} },
        {
          type: 'question_text',
          display_order: 2,
          data: {
            prompt: 'Summarise the information by selecting and reporting the main features.',
            task_type: 'task1',
            min_words: 150,
            rows: 14,
            show_word_count: true,
          },
          metadata: {},
          answer_key: null,
        },
      ],
    };
  }

  return {
    schema_version: 'ielts.content.v1',
    entity_type: 'part',
    module_type: 'listening',
    template_key: '',
    name: 'Part 1',
    metadata: {},
    content_units: [
      { type: 'instruction', display_order: 1, data: { text: 'Questions 1-10. Listen and answer.' }, metadata: {} },
      {
        type: 'audio',
        display_order: 2,
        data: { play_once: true, auto_start: false, storage: { bucket: '', path: '' } },
        metadata: {},
      },
      {
        type: 'question_single_choice',
        display_order: 3,
        data: {
          prompt: 'Question 1',
          options: [
            { id: 'A', label: 'Option A' },
            { id: 'B', label: 'Option B' },
            { id: 'C', label: 'Option C' },
          ],
        },
        metadata: { question_number: 1 },
        answer_key: { correct: { option_id: 'A' }, metadata: {} },
      },
    ],
  };
};

const toJson = (value: unknown) => JSON.stringify(value, null, 2);
const readString = (value: unknown): string => (typeof value === 'string' ? value : '');
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

export const AdminContentLibraryPage: React.FC = () => {
  const { accessToken } = useAccess();
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [templates, setTemplates] = useState<AdminPartTemplateSummary[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [selectedTemplateVersionId, setSelectedTemplateVersionId] = useState<string | null>(null);
  const [jsonText, setJsonText] = useState<string>(toJson(createExamplePart('listening')));
  const [editorModuleType, setEditorModuleType] = useState<ModuleType>('listening');
  const [editorTemplateName, setEditorTemplateName] = useState<string>('Part 1');
  const [editorTemplateKey, setEditorTemplateKey] = useState<string>('');
  const [loadedTemplateIdentity, setLoadedTemplateIdentity] = useState<{ templateName: string; templateKey: string } | null>(null);

  const syncEditorFieldsFromJson = (nextJsonText: string) => {
    try {
      const parsed = JSON.parse(nextJsonText) as unknown;
      if (!isObject(parsed)) return;
      const nextModuleType = readString(parsed.module_type).trim();
      if (nextModuleType === 'listening' || nextModuleType === 'reading' || nextModuleType === 'writing') {
        setEditorModuleType(nextModuleType);
      }
      setEditorTemplateName(readString(parsed.name));
      setEditorTemplateKey(readString(parsed.template_key));
    } catch {
      // Ignore partial JSON edits while the user is typing.
    }
  };

  const patchJsonRoot = (patch: { name?: string; templateKey?: string }) => {
    setJsonText((current) => {
      try {
        const parsed = JSON.parse(current) as unknown;
        if (!isObject(parsed)) return current;
        const next: Record<string, unknown> = { ...parsed };
        if (patch.name !== undefined) next.name = patch.name;
        if (patch.templateKey !== undefined) next.template_key = patch.templateKey;
        return toJson(next);
      } catch {
        return current;
      }
    });
  };

  const buildEditorCanonical = () => {
    const parsed = JSON.parse(jsonText) as unknown;
    const canonical = normalizePartTemplateInput(parsed, editorModuleType);
    const templateName = editorTemplateName.trim() || canonical.name || `${moduleLabel(canonical.module_type)} item`;
    const templateKey = editorTemplateKey.trim();
    return normalizePartTemplateInput(
      {
        ...canonical,
        module_type: canonical.module_type,
        name: templateName,
        template_key: templateKey,
      },
      canonical.module_type,
    );
  };

  const loadTemplates = async (opts?: { preserveSelection?: boolean }) => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const res = await adminBuilderPartTemplates(accessToken, IELTS_PRODUCT_ID);
      setTemplates(res.templates ?? []);
      if (!opts?.preserveSelection) {
        setSelectedTemplateId(null);
        setSelectedTemplateVersionId(null);
        setLoadedTemplateIdentity(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load content library.');
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  const groupedTemplates = useMemo(() => {
    const next: Record<ModuleType, AdminPartTemplateSummary[]> = {
      listening: [],
      reading: [],
      writing: [],
    };
    for (const template of templates) {
      const moduleType = template.module_type as ModuleType;
      if (moduleType in next) next[moduleType].push(template);
    }
    return next;
  }, [templates]);

  const loadTemplate = async (templateVersionId: string) => {
    if (!accessToken) return;
    setError(null);
    setStatus(null);
    try {
      const payload = await adminBuilderPartTemplatePayload(accessToken, templateVersionId);
      const canonical = normalizePartTemplateInput(
        {
          entity_type: 'part',
          module_type: payload.module_type,
          template_key: payload.template_key,
          ...(typeof payload.part_payload === 'object' && payload.part_payload ? payload.part_payload : {}),
        },
        payload.module_type,
      );
      setJsonText(toJson(canonical));
      setEditorModuleType(canonical.module_type);
      setEditorTemplateName(canonical.name);
      setEditorTemplateKey(payload.template_key);
      setSelectedTemplateId(payload.template_id);
      setSelectedTemplateVersionId(payload.template_version_id);
      setLoadedTemplateIdentity({
        templateName: payload.template_name,
        templateKey: payload.template_key,
      });
      setStatus(`Loaded ${payload.template_name} (v${payload.version}).`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load template.');
    }
  };

  const newDraft = (moduleType: ModuleType) => {
    const next = createExamplePart(moduleType);
    setJsonText(toJson(next));
    setEditorModuleType(moduleType);
    setEditorTemplateName(next.name);
    setEditorTemplateKey('');
    setSelectedTemplateId(null);
    setSelectedTemplateVersionId(null);
    setLoadedTemplateIdentity(null);
    setError(null);
    setStatus(`${moduleLabel(moduleType)} draft ready.`);
  };

  const editorTemplateNamePreview =
    editorTemplateName.trim() || (editorModuleType === 'reading' ? 'Passage 1' : editorModuleType === 'writing' ? 'Task 1' : 'Part 1');
  const editorTemplateKeyPreview = editorTemplateKey.trim() || slugifyTemplateKey(editorTemplateNamePreview, 'part-template');
  const isDetachedDraft =
    Boolean(selectedTemplateId) &&
    Boolean(loadedTemplateIdentity) &&
    (editorTemplateNamePreview !== loadedTemplateIdentity?.templateName || editorTemplateKeyPreview !== loadedTemplateIdentity?.templateKey);

  const saveTemplate = async (opts?: { asNew?: boolean }) => {
    if (!accessToken) return;
    setSaving(true);
    setError(null);
    setStatus(null);
    try {
      const canonical = buildEditorCanonical();
      const templateName = canonical.name || `${moduleLabel(editorModuleType)} item`;
      const templateKey = canonical.template_key?.trim() || slugifyTemplateKey(templateName, 'part-template');
      const shouldCreateNew =
        Boolean(opts?.asNew) ||
        (Boolean(selectedTemplateId) &&
          Boolean(loadedTemplateIdentity) &&
          (templateName !== loadedTemplateIdentity?.templateName || templateKey !== loadedTemplateIdentity?.templateKey));

      const response = await adminBuilderPartTemplateUpsert(accessToken, {
        product_id: IELTS_PRODUCT_ID,
        template_id: shouldCreateNew ? null : selectedTemplateId,
        template_name: templateName,
        template_key: templateKey,
        module_type: canonical.module_type,
        part_payload: {
          name: canonical.name,
          metadata: canonical.metadata ?? {},
          content_units: canonical.content_units,
        },
      });

      setEditorTemplateName(response.template_name);
      setEditorTemplateKey(response.template_key);
      setSelectedTemplateId(response.template_id);
      setSelectedTemplateVersionId(response.template_version_id);
      setLoadedTemplateIdentity({
        templateName: response.template_name,
        templateKey: response.template_key,
      });
      setJsonText(toJson({ ...canonical, name: response.template_name, template_key: response.template_key }));
      setStatus(`${shouldCreateNew ? 'Saved new template' : 'Saved'} ${response.template_name} (v${response.version}).`);
      await loadTemplates({ preserveSelection: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save template.');
    } finally {
      setSaving(false);
    }
  };

  const exportCurrent = () => {
    try {
      const canonical = buildEditorCanonical();
      const filename = `${canonical.template_key || slugifyTemplateKey(canonical.name, 'part-template')}.json`;
      downloadJsonFile(filename, canonical);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Current JSON is invalid.');
    }
  };

  const importCurrent = async (file: File | null) => {
    if (!file) return;
    setError(null);
    setStatus(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      const canonical = normalizePartTemplateInput(parsed, editorModuleType);
      setJsonText(toJson(canonical));
      setEditorModuleType(canonical.module_type);
      setEditorTemplateName(canonical.name);
      setEditorTemplateKey(canonical.template_key ?? '');
      setSelectedTemplateId(null);
      setSelectedTemplateVersionId(null);
      setLoadedTemplateIdentity(null);
      setStatus(`Imported ${file.name} into the ${moduleLabel(canonical.module_type)} editor.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to import JSON file.');
    }
  };

  const duplicateCurrent = () => {
    try {
      const canonical = buildEditorCanonical();
      const next = { ...canonical, name: `${canonical.name} Copy`, template_key: '' };
      setJsonText(toJson(next));
      setSelectedTemplateId(null);
      setSelectedTemplateVersionId(null);
      setLoadedTemplateIdentity(null);
      setEditorTemplateKey('');
      setEditorTemplateName(next.name);
      setStatus('Duplicate draft created. Saving will create a new template.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Current JSON is invalid.');
    }
  };

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-xs font-semibold tracking-wider uppercase text-gray-500">Content Library</div>
                <div className="text-lg font-bold text-gray-900">Reusable Parts</div>
              </div>
              <button
                type="button"
                className="px-3 py-2 rounded-lg border border-gray-200 text-sm font-semibold hover:bg-gray-50"
                onClick={() => void loadTemplates({ preserveSelection: true })}
                disabled={loading}
              >
                Refresh
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="px-3 py-2 rounded-lg border border-gray-200 text-xs font-semibold hover:bg-gray-50" onClick={() => newDraft('listening')}>
                New Listening Part
              </button>
              <button type="button" className="px-3 py-2 rounded-lg border border-gray-200 text-xs font-semibold hover:bg-gray-50" onClick={() => newDraft('reading')}>
                New Reading Passage
              </button>
              <button type="button" className="px-3 py-2 rounded-lg border border-gray-200 text-xs font-semibold hover:bg-gray-50" onClick={() => newDraft('writing')}>
                New Writing Task
              </button>
            </div>
          </div>

          {(['listening', 'reading', 'writing'] as ModuleType[]).map((moduleType) => (
            <div key={moduleType} className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3">
              <div className="text-sm font-bold text-gray-900">{moduleLabel(moduleType)}</div>
              {loading ? (
                <div className="text-sm text-gray-500">Loading...</div>
              ) : groupedTemplates[moduleType].length === 0 ? (
                <div className="text-sm text-gray-500">No templates yet.</div>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {groupedTemplates[moduleType].map((template) => (
                    <button
                      key={template.template_id}
                      type="button"
                      onClick={() => void loadTemplate(template.latest_version_id)}
                      className={`w-full text-left rounded-xl border p-3 transition-colors ${
                        selectedTemplateId === template.template_id
                          ? 'border-gray-900 bg-gray-50'
                          : 'border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <div className="font-semibold text-gray-900">{template.template_name}</div>
                      <div className="text-[11px] text-gray-500 mt-1">
                        {template.template_key} - v{template.latest_version}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div>
                <div className="text-xs font-semibold tracking-wider uppercase text-gray-500">Canonical JSON</div>
                <div className="text-xl font-bold text-gray-900">`ielts.content.v1` Part Editor</div>
                <div className="text-sm text-gray-500 mt-1">
                  Create individual Listening parts, Reading passages, and Writing tasks with one standard JSON shape.
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="px-3 py-2 rounded-lg border border-gray-200 text-sm font-semibold hover:bg-gray-50" onClick={duplicateCurrent}>
                  Duplicate
                </button>
                <button
                  type="button"
                  className="px-3 py-2 rounded-lg border border-gray-200 text-sm font-semibold hover:bg-gray-50"
                  onClick={() => importInputRef.current?.click()}
                >
                  Import JSON
                </button>
                <button type="button" className="px-3 py-2 rounded-lg border border-gray-200 text-sm font-semibold hover:bg-gray-50" onClick={exportCurrent}>
                  Export JSON
                </button>
                <button
                  type="button"
                  className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-semibold hover:bg-gray-50 disabled:text-gray-400 disabled:hover:bg-white"
                  onClick={() => void saveTemplate({ asNew: true })}
                  disabled={saving}
                >
                  Save As New
                </button>
                <button
                  type="button"
                  className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-semibold hover:bg-black disabled:bg-gray-400"
                  onClick={() => void saveTemplate()}
                  disabled={saving}
                >
                  {saving ? 'Saving...' : 'Save Template'}
                </button>
                <input
                  ref={importInputRef}
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  onChange={(event) => {
                    void importCurrent(event.target.files?.[0] ?? null);
                    event.currentTarget.value = '';
                  }}
                />
              </div>
            </div>

            {error ? <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">{error}</div> : null}
            {status ? <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-3">{status}</div> : null}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <label className="text-xs text-gray-600 space-y-1">
                <span className="font-semibold">Module</span>
                <input value={editorModuleType} readOnly className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50" />
              </label>
              <label className="text-xs text-gray-600 space-y-1">
                <span className="font-semibold">Template name</span>
                <input
                  value={editorTemplateName}
                  onChange={(event) => {
                    setEditorTemplateName(event.target.value);
                    patchJsonRoot({ name: event.target.value });
                    setError(null);
                    setStatus(null);
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white"
                />
              </label>
              <label className="text-xs text-gray-600 space-y-1">
                <span className="font-semibold">Template key</span>
                <input
                  value={editorTemplateKey}
                  onChange={(event) => {
                    setEditorTemplateKey(event.target.value);
                    patchJsonRoot({ templateKey: event.target.value });
                    setError(null);
                    setStatus(null);
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white"
                  placeholder="part-1"
                />
              </label>
              <label className="text-xs text-gray-600 space-y-1 md:col-span-3">
                <span className="font-semibold">Loaded state</span>
                <input
                  value={
                    isDetachedDraft
                      ? 'Detached draft from existing template'
                      : selectedTemplateVersionId
                        ? 'Existing template version loaded'
                        : 'New draft'
                  }
                  readOnly
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50"
                />
              </label>
            </div>

            <textarea
              value={jsonText}
              onChange={(event) => {
                setJsonText(event.target.value);
                syncEditorFieldsFromJson(event.target.value);
                setError(null);
                setStatus(null);
              }}
              rows={28}
              className="w-full px-3 py-2 border border-gray-300 rounded-xl font-mono text-xs"
              spellCheck={false}
            />

            <div className="text-xs text-gray-500">
              Renaming a loaded template now detaches it into a new draft automatically. `Save Template` updates only when the current name/key still match the loaded template.
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
};
