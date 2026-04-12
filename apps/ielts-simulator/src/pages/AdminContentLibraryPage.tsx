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
    setError(null);
    setStatus(`${moduleLabel(moduleType)} draft ready.`);
  };

  const saveTemplate = async () => {
    if (!accessToken) return;
    setSaving(true);
    setError(null);
    setStatus(null);
    try {
      const parsed = JSON.parse(jsonText) as unknown;
      const canonical = normalizePartTemplateInput(parsed, editorModuleType);
      const templateName = canonical.name || editorTemplateName.trim() || `${moduleLabel(editorModuleType)} item`;
      const templateKey = canonical.template_key?.trim() || editorTemplateKey.trim() || slugifyTemplateKey(templateName, 'part-template');

      const response = await adminBuilderPartTemplateUpsert(accessToken, {
        product_id: IELTS_PRODUCT_ID,
        template_id: selectedTemplateId,
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
      setStatus(`Saved ${response.template_name} (v${response.version}).`);
      await loadTemplates({ preserveSelection: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save template.');
    } finally {
      setSaving(false);
    }
  };

  const exportCurrent = () => {
    try {
      const parsed = JSON.parse(jsonText) as unknown;
      const canonical = normalizePartTemplateInput(parsed, editorModuleType);
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
      setStatus(`Imported ${file.name} into the ${moduleLabel(canonical.module_type)} editor.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to import JSON file.');
    }
  };

  const duplicateCurrent = () => {
    try {
      const parsed = JSON.parse(jsonText) as unknown;
      const canonical = normalizePartTemplateInput(parsed, editorModuleType);
      const next = { ...canonical, template_key: '' };
      setJsonText(toJson(next));
      setSelectedTemplateId(null);
      setSelectedTemplateVersionId(null);
      setEditorTemplateKey('');
      setEditorTemplateName(`${canonical.name} Copy`);
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
                <input value={editorTemplateName} readOnly className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50" />
              </label>
              <label className="text-xs text-gray-600 space-y-1">
                <span className="font-semibold">Template key</span>
                <input value={editorTemplateKey || '(new)'} readOnly className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50" />
              </label>
              <label className="text-xs text-gray-600 space-y-1 md:col-span-3">
                <span className="font-semibold">Loaded state</span>
                <input
                  value={selectedTemplateVersionId ? 'Existing template version loaded' : 'New draft'}
                  readOnly
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50"
                />
              </label>
            </div>

            <textarea
              value={jsonText}
              onChange={(event) => {
                setJsonText(event.target.value);
                setError(null);
                setStatus(null);
              }}
              rows={28}
              className="w-full px-3 py-2 border border-gray-300 rounded-xl font-mono text-xs"
              spellCheck={false}
            />

            <div className="text-xs text-gray-500">
              Use the canonical part format only. Saving normalizes the JSON and creates a new version when the template already exists.
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
};
