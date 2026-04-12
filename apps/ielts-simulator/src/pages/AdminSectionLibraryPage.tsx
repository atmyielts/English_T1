import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AdminLayout } from '../components/admin/AdminLayout';
import { IELTS_PRODUCT_ID } from '../lib/constants';
import {
  adminBuilderPartTemplatePayload,
  adminBuilderPartTemplates,
  adminBuilderTemplatePayload,
  adminBuilderTemplates,
  adminBuilderTemplateUpsert,
  type AdminPartTemplateSummary,
  type AdminSectionTemplateSummary,
} from '../lib/platformClient';
import {
  canonicalSectionToTemplatePayload,
  downloadJsonFile,
  expectedPartCount,
  moduleLabel,
  normalizeSectionTemplateInput,
  partTemplatePayloadToCanonical,
  sectionTemplatePayloadToCanonical,
  slugifyTemplateKey,
  type IeltsSectionTemplateV1,
  type ModuleType,
} from '../lib/ieltsContent';
import { useAccess } from '../lib/useAccess';

const createSectionExample = (moduleType: ModuleType): IeltsSectionTemplateV1 =>
  normalizeSectionTemplateInput(
    {
      entity_type: 'section',
      module_type: moduleType,
      template_key: '',
      name: moduleLabel(moduleType),
      metadata: { type: moduleType, duration_seconds: moduleType === 'listening' ? 2400 : 3600 },
      parts: Array.from({ length: expectedPartCount(moduleType) }).map((_, index) => ({
        name: moduleType === 'reading' ? `Passage ${index + 1}` : moduleType === 'writing' ? `Task ${index + 1}` : `Part ${index + 1}`,
        metadata: {},
        content_units: [],
      })),
    },
    moduleType,
  );

const toJson = (value: unknown) => JSON.stringify(value, null, 2);

export const AdminSectionLibraryPage: React.FC = () => {
  const { accessToken } = useAccess();
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [templates, setTemplates] = useState<AdminSectionTemplateSummary[]>([]);
  const [partTemplates, setPartTemplates] = useState<AdminPartTemplateSummary[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [selectedTemplateVersionId, setSelectedTemplateVersionId] = useState<string | null>(null);
  const [jsonText, setJsonText] = useState<string>(toJson(createSectionExample('listening')));
  const [editorModuleType, setEditorModuleType] = useState<ModuleType>('listening');
  const [editorTemplateName, setEditorTemplateName] = useState<string>('Listening');
  const [editorTemplateKey, setEditorTemplateKey] = useState<string>('');
  const [assemblyModuleType, setAssemblyModuleType] = useState<ModuleType>('listening');
  const [assemblySelections, setAssemblySelections] = useState<string[]>(Array.from({ length: expectedPartCount('listening') }, () => ''));

  const loadData = async (opts?: { preserveSelection?: boolean }) => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const [sectionsRes, partsRes] = await Promise.all([
        adminBuilderTemplates(accessToken, IELTS_PRODUCT_ID),
        adminBuilderPartTemplates(accessToken, IELTS_PRODUCT_ID),
      ]);
      setTemplates(sectionsRes.templates ?? []);
      setPartTemplates(partsRes.templates ?? []);
      if (!opts?.preserveSelection) {
        setSelectedTemplateId(null);
        setSelectedTemplateVersionId(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load section library.');
      setTemplates([]);
      setPartTemplates([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  useEffect(() => {
    setAssemblySelections(Array.from({ length: expectedPartCount(assemblyModuleType) }, () => ''));
  }, [assemblyModuleType]);

  const groupedTemplates = useMemo(() => {
    const next: Record<ModuleType, AdminSectionTemplateSummary[]> = { listening: [], reading: [], writing: [] };
    for (const template of templates) {
      const moduleType = template.section_type as ModuleType;
      if (moduleType in next) next[moduleType].push(template);
    }
    return next;
  }, [templates]);

  const partOptions = useMemo(
    () => partTemplates.filter((template) => template.module_type === assemblyModuleType),
    [assemblyModuleType, partTemplates],
  );

  const loadTemplate = async (templateVersionId: string) => {
    if (!accessToken) return;
    setError(null);
    setStatus(null);
    try {
      const payload = await adminBuilderTemplatePayload(accessToken, templateVersionId);
      const canonical = sectionTemplatePayloadToCanonical(payload);
      setJsonText(toJson(canonical));
      setEditorModuleType(canonical.module_type);
      setEditorTemplateName(canonical.name);
      setEditorTemplateKey(payload.template_key);
      setSelectedTemplateId(payload.template_id);
      setSelectedTemplateVersionId(payload.template_version_id);
      setStatus(`Loaded ${payload.template_name} (v${payload.version}).`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load section template.');
    }
  };

  const newDraft = (moduleType: ModuleType) => {
    const next = createSectionExample(moduleType);
    setJsonText(toJson(next));
    setEditorModuleType(moduleType);
    setEditorTemplateName(next.name);
    setEditorTemplateKey('');
    setSelectedTemplateId(null);
    setSelectedTemplateVersionId(null);
    setStatus(`${moduleLabel(moduleType)} section draft ready.`);
    setError(null);
  };

  const assembleFromParts = async () => {
    if (!accessToken) return;
    const selectedIds = assemblySelections.filter(Boolean);
    if (selectedIds.length !== expectedPartCount(assemblyModuleType)) {
      setError(`Select exactly ${expectedPartCount(assemblyModuleType)} saved ${assemblyModuleType} items first.`);
      return;
    }

    setError(null);
    setStatus(null);
    try {
      const payloads = await Promise.all(selectedIds.map((id) => adminBuilderPartTemplatePayload(accessToken, id)));
      const parts = payloads.map((payload, index) => {
        const canonicalPart = partTemplatePayloadToCanonical(payload);
        return {
          name: canonicalPart.name,
          display_order: index + 1,
          metadata: {
            ...(canonicalPart.metadata ?? {}),
            part_template_ref: {
              template_id: payload.template_id,
              template_key: payload.template_key,
              template_version_id: payload.template_version_id,
              template_version: payload.version,
            },
          },
          content_units: canonicalPart.content_units,
        };
      });

      const section = normalizeSectionTemplateInput(
        {
          entity_type: 'section',
          module_type: assemblyModuleType,
          template_key: '',
          name: moduleLabel(assemblyModuleType),
          metadata: {
            type: assemblyModuleType,
            duration_seconds: assemblyModuleType === 'listening' ? 2400 : 3600,
          },
          parts,
        },
        assemblyModuleType,
      );

      setJsonText(toJson(section));
      setEditorModuleType(section.module_type);
      setEditorTemplateName(section.name);
      setEditorTemplateKey('');
      setSelectedTemplateId(null);
      setSelectedTemplateVersionId(null);
      setStatus(`Assembled ${moduleLabel(assemblyModuleType)} section from ${parts.length} saved item(s).`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to assemble section.');
    }
  };

  const saveTemplate = async () => {
    if (!accessToken) return;
    setSaving(true);
    setError(null);
    setStatus(null);
    try {
      const parsed = JSON.parse(jsonText) as unknown;
      const canonical = normalizeSectionTemplateInput(parsed, editorModuleType);
      const templateName = canonical.name || editorTemplateName.trim() || moduleLabel(canonical.module_type);
      const templateKey = canonical.template_key?.trim() || editorTemplateKey.trim() || slugifyTemplateKey(templateName, 'section-template');

      const response = await adminBuilderTemplateUpsert(accessToken, {
        product_id: IELTS_PRODUCT_ID,
        template_id: selectedTemplateId,
        template_name: templateName,
        template_key: templateKey,
        section_type: canonical.module_type,
        section_payload: canonicalSectionToTemplatePayload(canonical),
        auto_split_parts: true,
      });

      setEditorTemplateName(response.template_name);
      setEditorTemplateKey(response.template_key);
      setSelectedTemplateId(response.template_id);
      setSelectedTemplateVersionId(response.template_version_id);
      setStatus(`Saved ${response.template_name} (v${response.version}).`);
      await loadData({ preserveSelection: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save section template.');
    } finally {
      setSaving(false);
    }
  };

  const exportCurrent = () => {
    try {
      const parsed = JSON.parse(jsonText) as unknown;
      const canonical = normalizeSectionTemplateInput(parsed, editorModuleType);
      const filename = `${canonical.template_key || slugifyTemplateKey(canonical.name, 'section-template')}.json`;
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
      const canonical = normalizeSectionTemplateInput(parsed, editorModuleType);
      setJsonText(toJson(canonical));
      setEditorModuleType(canonical.module_type);
      setEditorTemplateName(canonical.name);
      setEditorTemplateKey(canonical.template_key ?? '');
      setSelectedTemplateId(null);
      setSelectedTemplateVersionId(null);
      setStatus(`Imported ${file.name} into the ${moduleLabel(canonical.module_type)} section editor.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to import JSON file.');
    }
  };

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-xs font-semibold tracking-wider uppercase text-gray-500">Section Library</div>
                <div className="text-lg font-bold text-gray-900">Reusable Sections</div>
              </div>
              <button
                type="button"
                className="px-3 py-2 rounded-lg border border-gray-200 text-sm font-semibold hover:bg-gray-50"
                onClick={() => void loadData({ preserveSelection: true })}
                disabled={loading}
              >
                Refresh
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="px-3 py-2 rounded-lg border border-gray-200 text-xs font-semibold hover:bg-gray-50" onClick={() => newDraft('listening')}>
                New Listening Section
              </button>
              <button type="button" className="px-3 py-2 rounded-lg border border-gray-200 text-xs font-semibold hover:bg-gray-50" onClick={() => newDraft('reading')}>
                New Reading Section
              </button>
              <button type="button" className="px-3 py-2 rounded-lg border border-gray-200 text-xs font-semibold hover:bg-gray-50" onClick={() => newDraft('writing')}>
                New Writing Section
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
                <div className="text-xl font-bold text-gray-900">`ielts.content.v1` Section Editor</div>
                <div className="text-sm text-gray-500 mt-1">
                  Save full Listening, Reading, and Writing sections. Each save also syncs reusable child items into the part library.
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
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
                  {saving ? 'Saving...' : 'Save Section'}
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
                  value={selectedTemplateVersionId ? 'Existing section version loaded' : 'New draft'}
                  readOnly
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50"
                />
              </label>
            </div>

            <div className="rounded-2xl border border-gray-200 p-4 space-y-3 bg-gray-50">
              <div className="text-sm font-bold text-gray-900">Assemble From Content Library</div>
              <div className="grid grid-cols-1 md:grid-cols-[160px_1fr] gap-3">
                <label className="text-xs text-gray-600 space-y-1">
                  <span className="font-semibold">Section type</span>
                  <select
                    value={assemblyModuleType}
                    onChange={(event) => setAssemblyModuleType(event.target.value as ModuleType)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white"
                  >
                    <option value="listening">Listening</option>
                    <option value="reading">Reading</option>
                    <option value="writing">Writing</option>
                  </select>
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {assemblySelections.map((value, index) => (
                    <label key={`${assemblyModuleType}-${index}`} className="text-xs text-gray-600 space-y-1">
                      <span className="font-semibold">
                        {assemblyModuleType === 'reading' ? `Passage ${index + 1}` : assemblyModuleType === 'writing' ? `Task ${index + 1}` : `Part ${index + 1}`}
                      </span>
                      <select
                        value={value}
                        onChange={(event) =>
                          setAssemblySelections((prev) => prev.map((entry, entryIndex) => (entryIndex === index ? event.target.value : entry)))
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white"
                      >
                        <option value="">Select reusable item...</option>
                        {partOptions.map((template) => (
                          <option key={template.template_id} value={template.latest_version_id}>
                            {template.template_name} ({template.template_key})
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              </div>
              <button
                type="button"
                className="px-3 py-2 rounded-lg border border-gray-200 text-sm font-semibold hover:bg-white"
                onClick={() => void assembleFromParts()}
              >
                Assemble Section JSON
              </button>
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
          </div>
        </div>
      </div>
    </AdminLayout>
  );
};
