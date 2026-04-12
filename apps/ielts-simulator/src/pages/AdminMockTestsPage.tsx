import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AdminLayout } from '../components/admin/AdminLayout';
import { IELTS_PRODUCT_ID } from '../lib/constants';
import {
  adminBuilderLoad,
  adminBuilderSave,
  adminBuilderTemplatePayload,
  adminBuilderTemplateResolve,
  adminBuilderTemplates,
  adminBuilderTemplateUpsert,
  adminTestsClone,
  adminTestsDelete,
  adminTestsList,
  type AdminBuilderPayload,
  type AdminSectionTemplateSummary,
  type AdminTestRow,
} from '../lib/platformClient';
import {
  builderSectionToCanonicalSection,
  canonicalSectionToAdminSection,
  createMockTestExport,
  downloadJsonFile,
  moduleLabel,
  normalizeMockTestInput,
  sectionTemplatePayloadToCanonical,
  slugifyTemplateKey,
  type JsonObject,
  type ModuleType,
} from '../lib/ieltsContent';
import { useAccess } from '../lib/useAccess';

type SectionSelection = {
  template_id: string;
  template_key: string;
  template_name: string;
  template_version_id: string;
  template_version: number;
};

type MockEditor = {
  experience_id: string | null;
  version: number | null;
  name: string;
  display_order: string;
  is_active: boolean;
  price_amount: string;
  price_currency: string;
  metadata: JsonObject;
  sections: Record<ModuleType, SectionSelection | null>;
};

const MODULES: ModuleType[] = ['listening', 'reading', 'writing'];

const createSelections = (): Record<ModuleType, SectionSelection | null> => ({
  listening: null,
  reading: null,
  writing: null,
});

const isObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asObject = (value: unknown): JsonObject => (isObject(value) ? value : {});
const readString = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const readInteger = (value: string, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : fallback;
};

const readNullableNumber = (value: string): number | null => {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseActionError = (error: unknown, fallback: string): string => {
  if (!(error instanceof Error)) return fallback;
  const raw = error.message || fallback;
  const jsonStart = raw.indexOf('{');
  if (jsonStart < 0) return raw;
  try {
    const parsed = JSON.parse(raw.slice(jsonStart)) as { error?: string; details?: { sessions_count?: number } };
    if (parsed?.error) {
      if (
        parsed.error.includes('Cannot delete test with existing sessions') &&
        typeof parsed.details?.sessions_count === 'number'
      ) {
        return `${parsed.error} Existing sessions: ${parsed.details.sessions_count}.`;
      }
      return parsed.error;
    }
  } catch {
    return raw;
  }
  return raw;
};

const byDisplayOrder = (a: AdminTestRow, b: AdminTestRow) => (a.display_order ?? 0) - (b.display_order ?? 0);

const nextDisplayOrder = (rows: AdminTestRow[]): number =>
  rows.reduce((max, row) => Math.max(max, row.display_order ?? 0), 0) + 1;

const createEditor = (displayOrder: number): MockEditor => ({
  experience_id: null,
  version: null,
  name: 'New IELTS Mock Test',
  display_order: String(displayOrder),
  is_active: false,
  price_amount: '',
  price_currency: 'UZS',
  metadata: {},
  sections: createSelections(),
});

const collectDeletedIds = (payload: AdminBuilderPayload | null): NonNullable<AdminBuilderPayload['deleted']> => {
  const section_ids: string[] = [];
  const part_ids: string[] = [];
  const unit_ids: string[] = [];

  for (const section of payload?.sections ?? []) {
    if (section.id) section_ids.push(section.id);
    for (const part of section.parts ?? []) {
      if (part.id) part_ids.push(part.id);
      for (const unit of part.content_units ?? []) {
        if (unit.id) unit_ids.push(unit.id);
      }
    }
  }

  return { section_ids, part_ids, unit_ids };
};

const selectionFromSummary = (template: AdminSectionTemplateSummary): SectionSelection => ({
  template_id: template.template_id,
  template_key: template.template_key,
  template_name: template.template_name,
  template_version_id: template.latest_version_id,
  template_version: template.latest_version,
});

export const AdminMockTestsPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { accessToken } = useAccess();
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [tests, setTests] = useState<AdminTestRow[]>([]);
  const [templates, setTemplates] = useState<AdminSectionTemplateSummary[]>([]);
  const [selectedExperienceId, setSelectedExperienceId] = useState<string | null>(null);
  const [editor, setEditor] = useState<MockEditor | null>(null);
  const [loadedPayload, setLoadedPayload] = useState<AdminBuilderPayload | null>(null);
  const [queryHandled, setQueryHandled] = useState(false);

  const groupedTemplates = useMemo(
    () => ({
      listening: templates.filter((template) => template.section_type === 'listening'),
      reading: templates.filter((template) => template.section_type === 'reading'),
      writing: templates.filter((template) => template.section_type === 'writing'),
    }),
    [templates],
  );

  const selectedSections = editor?.sections ?? createSelections();
  const missingModules = MODULES.filter((moduleType) => !selectedSections[moduleType]);

  const refreshCatalogs = async () => {
    if (!accessToken) return { rows: [] as AdminTestRow[], sectionTemplates: [] as AdminSectionTemplateSummary[] };
    const [testsRes, templatesRes] = await Promise.all([
      adminTestsList(accessToken, IELTS_PRODUCT_ID),
      adminBuilderTemplates(accessToken, IELTS_PRODUCT_ID),
    ]);
    const rows = (testsRes.experiences ?? []).slice().sort(byDisplayOrder);
    const sectionTemplates = templatesRes.templates ?? [];
    setTests(rows);
    setTemplates(sectionTemplates);
    return { rows, sectionTemplates };
  };

  const updateEditor = (patch: Partial<MockEditor>) => {
    setEditor((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const refreshPage = async () => {
    setWorking(true);
    setError(null);
    try {
      await refreshCatalogs();
    } catch (e) {
      setError(parseActionError(e, 'Failed to refresh mock tests.'));
    } finally {
      setWorking(false);
    }
  };

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const { rows } = await refreshCatalogs();
        if (!cancelled && !editor) setEditor(createEditor(nextDisplayOrder(rows)));
      } catch (e) {
        if (!cancelled) {
          setError(parseActionError(e, 'Failed to load mock tests.'));
          setTests([]);
          setTemplates([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  const loadExperience = async (experienceId: string) => {
    if (!accessToken) return;
    setWorking(true);
    setError(null);
    setStatus(null);
    try {
      const response = await adminBuilderLoad(accessToken, experienceId);
      const nextSelections = createSelections();

      for (const section of response.payload.sections ?? []) {
        const canonical = builderSectionToCanonicalSection(section);
        const moduleType = canonical.module_type;
        const ref = asObject(asObject(section.metadata).template_ref);
        const templateKey = readString(ref.template_key);
        const templateVersion = Number(ref.template_version ?? 0);

        if (!templateKey) continue;

        try {
          const resolved = await adminBuilderTemplateResolve(
            accessToken,
            IELTS_PRODUCT_ID,
            templateKey,
            Number.isFinite(templateVersion) && templateVersion > 0 ? templateVersion : undefined,
          );
          nextSelections[moduleType] = {
            template_id: resolved.template_id,
            template_key: resolved.template_key,
            template_name: resolved.template_name,
            template_version_id: resolved.template_version_id,
            template_version: resolved.version,
          };
        } catch {
          nextSelections[moduleType] = {
            template_id: readString(ref.template_id),
            template_key: templateKey,
            template_name: section.name,
            template_version_id: readString(ref.template_version_id),
            template_version: Number.isFinite(templateVersion) ? Math.floor(templateVersion) : 0,
          };
        }
      }

      setSelectedExperienceId(experienceId);
      setLoadedPayload(response.payload);
      setEditor({
        experience_id: response.payload.experience.id ?? null,
        version: response.payload.experience.version ?? null,
        name: response.payload.experience.name || 'Untitled IELTS Mock Test',
        display_order: String(response.payload.experience.display_order ?? 0),
        is_active: response.payload.experience.is_active ?? false,
        price_amount:
          typeof response.payload.experience.price_amount === 'number' &&
          Number.isFinite(response.payload.experience.price_amount)
            ? String(response.payload.experience.price_amount)
            : '',
        price_currency: readString(response.payload.experience.price_currency) || 'UZS',
        metadata: asObject(response.payload.experience.metadata),
        sections: nextSelections,
      });

      const missingLinks = MODULES.filter((moduleType) => !nextSelections[moduleType]).length;
      setStatus(
        missingLinks > 0
          ? `Loaded legacy mock test. ${missingLinks} section(s) still need library links.`
          : `Loaded ${response.payload.experience.name}.`,
      );
    } catch (e) {
      setError(parseActionError(e, 'Failed to load mock test.'));
    } finally {
      setWorking(false);
    }
  };

  useEffect(() => {
    if (!accessToken || loading || queryHandled) return;
    setQueryHandled(true);
    const experienceId = readString(searchParams.get('experience_id'));
    if (experienceId) {
      void loadExperience(experienceId);
      return;
    }
    if (!editor) setEditor(createEditor(nextDisplayOrder(tests)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, loading, queryHandled, searchParams]);

  const openNewDraft = () => {
    setSelectedExperienceId(null);
    setLoadedPayload(null);
    setEditor(createEditor(nextDisplayOrder(tests)));
    setError(null);
    setStatus('New mock test draft ready.');
  };

  const setSectionSelection = (moduleType: ModuleType, templateVersionId: string) => {
    const template = groupedTemplates[moduleType].find((entry) => entry.latest_version_id === templateVersionId) ?? null;
    setEditor((prev) =>
      prev
        ? {
            ...prev,
            sections: {
              ...prev.sections,
              [moduleType]: template ? selectionFromSummary(template) : null,
            },
          }
        : prev,
    );
  };

  const saveMock = async () => {
    if (!accessToken || !editor) return;
    if (!editor.name.trim()) {
      setError('Mock test name is required.');
      return;
    }
    if (missingModules.length > 0) {
      setError(`Select one saved section for ${missingModules.map(moduleLabel).join(', ')} first.`);
      return;
    }

    setWorking(true);
    setError(null);
    setStatus(null);

    try {
      const templatePayloads = await Promise.all(
        MODULES.map((moduleType) => {
          const selection = editor.sections[moduleType];
          if (!selection) throw new Error(`Missing ${moduleType} section.`);
          return adminBuilderTemplatePayload(accessToken, selection.template_version_id);
        }),
      );

      const sections = templatePayloads.map((payload) => {
        const canonical = sectionTemplatePayloadToCanonical(payload);
        const section = canonicalSectionToAdminSection(canonical);
        return {
          ...section,
          metadata: {
            ...asObject(section.metadata),
            type: canonical.module_type,
            template_ref: {
              template_id: payload.template_id,
              template_key: payload.template_key,
              template_version_id: payload.template_version_id,
              template_version: payload.version,
            },
          },
        };
      });

      const result = await adminBuilderSave(accessToken, {
        product_id: IELTS_PRODUCT_ID,
        experience: {
          id: editor.experience_id ?? undefined,
          version: editor.version ?? undefined,
          name: editor.name.trim(),
          display_order: readInteger(editor.display_order, nextDisplayOrder(tests)),
          is_active: editor.is_active,
          price_amount: readNullableNumber(editor.price_amount),
          price_currency: editor.price_currency.trim().toUpperCase() || 'UZS',
          metadata: editor.metadata,
        },
        sections,
        deleted: collectDeletedIds(loadedPayload),
      });

      await refreshCatalogs();
      await loadExperience(result.experience_id);
      setStatus(
        result.section_instances_error
          ? `Saved mock test, but section-instance sync reported: ${result.section_instances_error}`
          : `Saved mock test successfully. Synced ${result.section_instances_count ?? 0} section instance(s).`,
      );
    } catch (e) {
      setError(parseActionError(e, 'Failed to save mock test.'));
    } finally {
      setWorking(false);
    }
  };

  const exportMock = () => {
    if (!editor) return;
    if (missingModules.length > 0) {
      setError(`Select one saved section for ${missingModules.map(moduleLabel).join(', ')} before exporting.`);
      return;
    }

    const output = createMockTestExport({
      name: editor.name.trim() || 'Untitled IELTS Mock Test',
      display_order: readInteger(editor.display_order, 0),
      is_active: editor.is_active,
      price_amount: readNullableNumber(editor.price_amount),
      price_currency: editor.price_currency.trim().toUpperCase() || 'UZS',
      metadata: editor.metadata,
      sections: MODULES.map((moduleType) => {
        const selection = editor.sections[moduleType];
        if (!selection) throw new Error(`Missing ${moduleType} section.`);
        return {
          module_type: moduleType,
          section_template_key: selection.template_key,
          section_template_version: selection.template_version,
        };
      }),
    });

    downloadJsonFile(`${slugifyTemplateKey(output.name, 'ielts-mock-test')}.json`, output);
    setError(null);
    setStatus('Exported mock test as canonical `ielts.content.v1` JSON.');
  };

  const promoteLegacySections = async () => {
    if (!accessToken || !editor || !loadedPayload) return;
    setWorking(true);
    setError(null);
    setStatus(null);
    try {
      const nextSelections = { ...editor.sections };
      let promotedCount = 0;

      for (const section of loadedPayload.sections ?? []) {
        const canonical = builderSectionToCanonicalSection(section);
        if (nextSelections[canonical.module_type]?.template_key) continue;

        const response = await adminBuilderTemplateUpsert(accessToken, {
          product_id: IELTS_PRODUCT_ID,
          template_name: canonical.name,
          template_key:
            canonical.template_key ||
            slugifyTemplateKey(`${editor.name}-${canonical.module_type}-${canonical.name}`, `${canonical.module_type}-section`),
          section_type: canonical.module_type,
          section_payload: {
            name: canonical.name,
            metadata: canonical.metadata ?? {},
            parts: canonical.parts,
          },
          auto_split_parts: true,
        });

        nextSelections[canonical.module_type] = {
          template_id: response.template_id,
          template_key: response.template_key,
          template_name: response.template_name,
          template_version_id: response.template_version_id,
          template_version: response.version,
        };
        promotedCount += 1;
      }

      setEditor((prev) => (prev ? { ...prev, sections: nextSelections } : prev));
      await refreshCatalogs();
      setStatus(`Promoted ${promotedCount} legacy section(s) into the Section Library.`);
    } catch (e) {
      setError(parseActionError(e, 'Failed to save legacy sections into the library.'));
    } finally {
      setWorking(false);
    }
  };

  const importMockJson = async (file: File | null) => {
    if (!file || !accessToken) return;
    setWorking(true);
    setError(null);
    setStatus(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      const normalized = normalizeMockTestInput(parsed, IELTS_PRODUCT_ID);
      const nextSelections = createSelections();

      if (normalized.sections.length > 0) {
        for (const section of normalized.sections) {
          const response = await adminBuilderTemplateUpsert(accessToken, {
            product_id: IELTS_PRODUCT_ID,
            template_name: section.name,
            template_key:
              section.template_key ||
              slugifyTemplateKey(`${normalized.mock.name}-${section.module_type}-${section.name}`, `${section.module_type}-section`),
            section_type: section.module_type,
            section_payload: {
              name: section.name,
              metadata: section.metadata ?? {},
              parts: section.parts,
            },
            auto_split_parts: true,
          });

          nextSelections[section.module_type] = {
            template_id: response.template_id,
            template_key: response.template_key,
            template_name: response.template_name,
            template_version_id: response.template_version_id,
            template_version: response.version,
          };
        }
      } else {
        for (const sectionRef of normalized.mock.sections) {
          const response = await adminBuilderTemplateResolve(
            accessToken,
            IELTS_PRODUCT_ID,
            sectionRef.section_template_key,
            sectionRef.section_template_version,
          );
          nextSelections[sectionRef.module_type] = {
            template_id: response.template_id,
            template_key: response.template_key,
            template_name: response.template_name,
            template_version_id: response.template_version_id,
            template_version: response.version,
          };
        }
      }

      setSelectedExperienceId(null);
      setLoadedPayload(null);
      setEditor({
        experience_id: null,
        version: null,
        name: normalized.mock.name,
        display_order: String(normalized.mock.display_order ?? nextDisplayOrder(tests)),
        is_active: normalized.mock.is_active ?? false,
        price_amount:
          typeof normalized.mock.price_amount === 'number' && Number.isFinite(normalized.mock.price_amount)
            ? String(normalized.mock.price_amount)
            : '',
        price_currency: readString(normalized.mock.price_currency) || 'UZS',
        metadata: asObject(normalized.mock.metadata),
        sections: nextSelections,
      });
      await refreshCatalogs();
      setStatus(
        normalized.sections.length > 0
          ? `Imported ${file.name}, normalized it, and saved ${normalized.sections.length} section template(s) into the library.`
          : `Imported ${file.name} and linked it to existing section library versions.`,
      );
    } catch (e) {
      setError(parseActionError(e, 'Failed to import mock JSON.'));
    } finally {
      setWorking(false);
    }
  };

  const cloneMock = async (experienceId: string) => {
    if (!accessToken) return;
    setWorking(true);
    setError(null);
    try {
      await adminTestsClone(accessToken, experienceId);
      await refreshCatalogs();
      setStatus('Mock test cloned successfully.');
    } catch (e) {
      setError(parseActionError(e, 'Failed to clone mock test.'));
    } finally {
      setWorking(false);
    }
  };

  const deleteMock = async (row: AdminTestRow) => {
    if (!accessToken) return;
    const ok = window.confirm(
      `Delete "${row.name}" permanently?\n\nThis cannot be undone.\nIf the test has existing sessions, delete will be blocked.`,
    );
    if (!ok) return;

    setWorking(true);
    setError(null);
    try {
      await adminTestsDelete(accessToken, row.id);
      if (selectedExperienceId === row.id) openNewDraft();
      await refreshCatalogs();
      setStatus(`Deleted ${row.name}.`);
    } catch (e) {
      setError(parseActionError(e, 'Failed to delete mock test.'));
    } finally {
      setWorking(false);
    }
  };

  const hasLegacySections =
    Boolean(loadedPayload?.sections?.length) && MODULES.some((moduleType) => !selectedSections[moduleType]);

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Mock Tests</h2>
            <p className="text-sm text-gray-500 mt-1">
              Bind one saved Listening, Reading, and Writing section into a full IELTS mock and save it into the existing runtime tables.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" className="px-4 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-sm font-semibold" onClick={openNewDraft} disabled={loading || working}>
              New Mock
            </button>
            <button
              type="button"
              className="px-4 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-sm font-semibold"
              onClick={() => importInputRef.current?.click()}
              disabled={loading || working}
            >
              Import JSON
            </button>
            <button
              type="button"
              className="px-4 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-sm font-semibold"
              onClick={() => void refreshPage()}
              disabled={loading || working}
            >
              Refresh
            </button>
            <button type="button" className="px-4 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-sm font-semibold" onClick={exportMock} disabled={loading || working || !editor}>
              Export JSON
            </button>
            <button
              type="button"
              className="px-4 py-2 rounded-lg bg-gray-900 text-white hover:bg-black text-sm font-semibold disabled:bg-gray-400"
              onClick={() => void saveMock()}
              disabled={loading || working || !editor}
            >
              {working ? 'Working...' : 'Save Mock'}
            </button>
            <input
              ref={importInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(event) => {
                void importMockJson(event.target.files?.[0] ?? null);
                event.currentTarget.value = '';
              }}
            />
          </div>
        </div>

        {searchParams.get('mode') === 'import' ? (
          <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">
            Legacy import route detected. Use <span className="font-semibold">Import JSON</span> here to normalize old full-test JSON or AI JSON into the new standard.
          </div>
        ) : null}
        {error ? <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">{error}</div> : null}
        {status ? <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl p-3">{status}</div> : null}

        <div className="grid grid-cols-1 xl:grid-cols-[320px_1fr] gap-6">
          <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3">
            <div className="text-xs font-semibold tracking-wider uppercase text-gray-500">Saved Mock Tests</div>
            {tests.length === 0 && !loading ? (
              <div className="text-sm text-gray-500">No mock tests yet. Start with a new draft or import a file.</div>
            ) : (
              <div className="space-y-3 max-h-[72vh] overflow-y-auto pr-1">
                {tests.map((row) => (
                  <div key={row.id} className={`rounded-2xl border p-4 space-y-3 ${selectedExperienceId === row.id ? 'border-gray-900 bg-gray-50' : 'border-gray-200'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-bold text-gray-900">{row.name}</div>
                        <div className="text-[11px] text-gray-500 mt-1">
                          Order {row.display_order} - {row.price_amount ?? 0} {row.price_currency ?? 'UZS'}
                        </div>
                      </div>
                      <span className={`px-2 py-1 rounded-full text-[11px] font-semibold ${row.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
                        {row.is_active ? 'Active' : 'Hidden'}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-xs text-gray-600">
                      <div className="rounded-xl bg-gray-50 px-3 py-2">
                        <div className="font-semibold text-gray-900">{row.counts?.sections ?? 0}</div>
                        <div>Sections</div>
                      </div>
                      <div className="rounded-xl bg-gray-50 px-3 py-2">
                        <div className="font-semibold text-gray-900">{row.counts?.parts ?? 0}</div>
                        <div>Parts</div>
                      </div>
                      <div className="rounded-xl bg-gray-50 px-3 py-2">
                        <div className="font-semibold text-gray-900">{row.counts?.units ?? 0}</div>
                        <div>Units</div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button type="button" className="px-3 py-2 rounded-lg border border-gray-200 hover:bg-white text-xs font-semibold" onClick={() => void loadExperience(row.id)} disabled={working}>
                        Load
                      </button>
                      <button type="button" className="px-3 py-2 rounded-lg border border-gray-200 hover:bg-white text-xs font-semibold" onClick={() => navigate(`/admin/test/${row.id}`)}>
                        Overview
                      </button>
                      <button type="button" className="px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold disabled:bg-gray-400" onClick={() => void cloneMock(row.id)} disabled={working}>
                        Clone
                      </button>
                      <button type="button" className="px-3 py-2 rounded-lg border border-red-200 text-red-700 hover:bg-red-50 text-xs font-semibold disabled:opacity-50" onClick={() => void deleteMock(row)} disabled={working}>
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
              <div>
                <div className="text-xs font-semibold tracking-wider uppercase text-gray-500">Mock Builder</div>
                <div className="text-xl font-bold text-gray-900">Bind Library Sections</div>
                <div className="text-sm text-gray-500 mt-1">Each mock must contain exactly one section per module, always in Listening - Reading - Writing order.</div>
              </div>
              {hasLegacySections ? (
                <button
                  type="button"
                  className="px-4 py-2 rounded-lg border border-amber-200 text-amber-800 hover:bg-amber-50 text-sm font-semibold"
                  onClick={() => void promoteLegacySections()}
                  disabled={working}
                >
                  Save Sections To Library
                </button>
              ) : null}
            </div>

            {editor ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                  <label className="text-xs text-gray-600 space-y-1">
                    <span className="font-semibold">Mock name</span>
                    <input value={editor.name} onChange={(event) => updateEditor({ name: event.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
                  </label>
                  <label className="text-xs text-gray-600 space-y-1">
                    <span className="font-semibold">Display order</span>
                    <input type="number" min={0} value={editor.display_order} onChange={(event) => updateEditor({ display_order: event.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
                  </label>
                  <label className="text-xs text-gray-600 space-y-1">
                    <span className="font-semibold">Price amount</span>
                    <input type="number" min={0} value={editor.price_amount} onChange={(event) => updateEditor({ price_amount: event.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" placeholder="Optional" />
                  </label>
                  <label className="text-xs text-gray-600 space-y-1">
                    <span className="font-semibold">Currency</span>
                    <input value={editor.price_currency} onChange={(event) => updateEditor({ price_currency: event.target.value.toUpperCase() })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
                  </label>
                </div>

                <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={editor.is_active} onChange={(event) => updateEditor({ is_active: event.target.checked })} />
                  Publish this mock after save
                </label>

                <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                  {MODULES.map((moduleType) => {
                    const selection = editor.sections[moduleType];
                    const legacyName = loadedPayload?.sections
                      ?.map((section) => builderSectionToCanonicalSection(section))
                      .find((section) => section.module_type === moduleType)?.name;

                    return (
                      <div key={moduleType} className="rounded-2xl border border-gray-200 p-4 bg-gray-50 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-semibold text-gray-900">{moduleLabel(moduleType)}</div>
                          <span className={`px-2 py-1 rounded-full text-[11px] font-semibold ${selection ? 'bg-emerald-100 text-emerald-700' : legacyName ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-600'}`}>
                            {selection ? 'Linked' : legacyName ? 'Legacy' : 'Missing'}
                          </span>
                        </div>

                        <select value={selection?.template_version_id ?? ''} onChange={(event) => setSectionSelection(moduleType, event.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white">
                          <option value="">Select {moduleLabel(moduleType)} section...</option>
                          {groupedTemplates[moduleType].map((template) => (
                            <option key={template.template_id} value={template.latest_version_id}>
                              {template.template_name} ({template.template_key})
                            </option>
                          ))}
                        </select>

                        {selection ? (
                          <div className="text-xs text-gray-600">
                            {selection.template_name} - {selection.template_key} - v{selection.template_version}
                          </div>
                        ) : legacyName ? (
                          <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">
                            Runtime section "{legacyName}" is not linked yet. Save it to the library or choose a replacement.
                          </div>
                        ) : (
                          <div className="text-xs text-gray-500">No section selected yet.</div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="text-sm text-gray-600">
                  {editor.experience_id
                    ? "Saving will replace this mock test's runtime sections with the selected library versions and keep the same experience record."
                    : 'Saving will create a new runtime mock test from the selected library versions.'}
                </div>
              </>
            ) : (
              <div className="text-sm text-gray-500">Preparing mock builder...</div>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
};
