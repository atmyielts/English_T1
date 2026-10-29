import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AskSchoodAI } from '../../../../packages/schood-ai-link/src/index.tsx';
import type { ContentUnit } from '../domain/models';
import { InputRenderer } from '../features/exam/InputRenderer';
import { toefl2026CorrectSummary } from '../features/toefl2026/preview';
import '../features/toefl2026/toefl2026.css';
import { TOEFL_IBT_PRODUCT_ID } from '../lib/constants';
import { getReviewSession, type ReviewSessionResponse } from '../lib/platformClient';
import { useAccess } from '../lib/useAccess';

type UnitRow = ReviewSessionResponse['units'][number];
type SectionRow = ReviewSessionResponse['sections'][number];

const sectionType = (s: SectionRow | null): string => String((s?.metadata as any)?.type ?? 'unknown');
const isQuestionUnit = (u: Pick<UnitRow, 'type'>): boolean => String(u.type).startsWith('question_');

type QuestionRange = { start: number; end: number };

const extractPlaceholders = (text: string): string[] => {
  const ids: string[] = [];
  const seen = new Set<string>();
  const re = /\{\{([a-zA-Z0-9_-]+)\}\}/g;
  let m: RegExpExecArray | null = null;
  while ((m = re.exec(text))) {
    const id = m[1];
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
};

const questionSubIds = (u: UnitRow): string[] => {
  const d: any = u.data ?? {};

  if (u.type === 'question_matching' || u.type === 'question_matching_headings' || u.type === 'question_sentence_endings') {
    return Array.isArray(d.items) ? d.items.map((x: any) => String(x?.id ?? '')).filter(Boolean) : [];
  }

  if (u.type === 'question_true_false_not_given' || u.type === 'question_yes_no_not_given') {
    if (Array.isArray(d.statements)) return d.statements.map((x: any) => String(x?.id ?? '')).filter(Boolean);
    return Array.isArray(d.items) ? d.items.map((x: any) => String(x?.id ?? '')).filter(Boolean) : [];
  }

  if (u.type === 'question_gap_fill' || u.type === 'question_select_from_list') {
    if (Array.isArray(d.blanks) && d.blanks.length > 0) return d.blanks.map((b: any) => String(b?.id ?? '')).filter(Boolean);
    return extractPlaceholders(String(d.text ?? ''));
  }

  if (u.type === 'question_table_completion') {
    const rows = Array.isArray(d.rows) ? d.rows : [];
    const ids: string[] = [];
    const seen = new Set<string>();
    for (const row of rows) {
      const cells = Array.isArray(row) ? row : [];
      for (const c of cells) {
        const id = typeof c?.blank_id === 'string' ? c.blank_id : null;
        if (id && !seen.has(id)) {
          seen.add(id);
          ids.push(id);
        }
      }
    }
    return ids;
  }

  if (u.type === 'question_diagram_labeling') {
    return Array.isArray(d.labels) ? d.labels.map((x: any) => String(x?.id ?? '')).filter(Boolean) : [];
  }

  if (u.type === 'question_drag_drop') {
    return Array.isArray(d.targets) ? d.targets.map((x: any) => String(x?.id ?? '')).filter(Boolean) : [];
  }

  return [];
};

const correctSummary = (u: UnitRow): string | null => {
  if (!u.correct) return null;

  const toefl2026 = toefl2026CorrectSummary(u.type, u.correct);
  if (toefl2026) return toefl2026;

  if (u.type === 'question_single_choice') {
    const correctId = String((u.correct as any).option_id ?? '');
    const options = Array.isArray((u.data as any).options) ? ((u.data as any).options as any[]) : [];
    const label = options.find((o) => String(o.id) === correctId)?.label;
    return label ? `${correctId} (${label})` : correctId || null;
  }

  if (u.type === 'question_multi_choice') {
    const ids = Array.isArray((u.correct as any).option_ids) ? (u.correct as any).option_ids.map(String) : [];
    if (ids.length === 0) return null;
    return ids.join(', ');
  }

  if (u.type === 'question_text') {
    const answers = Array.isArray((u.correct as any).answers) ? (u.correct as any).answers.map(String) : [];
    if (answers.length === 0) return null;
    return answers.join(' / ');
  }

  if (u.type === 'question_matching' || u.type === 'question_matching_headings' || u.type === 'question_sentence_endings') {
    const matches = (u.correct as any).matches;
    if (!matches || typeof matches !== 'object') return null;
    const pairs = Object.entries(matches as Record<string, unknown>).map(([k, v]) => `${k} -> ${String(v)}`);
    return pairs.length > 0 ? pairs.join(', ') : null;
  }

  if (u.type === 'question_true_false_not_given' || u.type === 'question_yes_no_not_given') {
    const matches = (u.correct as any).matches;
    if (!matches || typeof matches !== 'object') return null;

    const statements =
      Array.isArray((u.data as any).statements) && (u.data as any).statements.length > 0
        ? ((u.data as any).statements as any[]).map((s) => ({ id: String(s?.id ?? ''), text: String(s?.text ?? '') }))
        : Array.isArray((u.data as any).items)
          ? ((u.data as any).items as any[]).map((s) => ({ id: String(s?.id ?? ''), text: String(s?.label ?? '') }))
          : [];

    const statementText = new Map(statements.filter((s) => s.id && s.text).map((s) => [s.id, s.text]));

    const defaultOptions =
      u.type === 'question_true_false_not_given'
        ? [
            { id: 'T', label: 'True' },
            { id: 'F', label: 'False' },
            { id: 'NG', label: 'Not Given' },
          ]
        : [
            { id: 'Y', label: 'Yes' },
            { id: 'N', label: 'No' },
            { id: 'NG', label: 'Not Given' },
          ];

    const options = Array.isArray((u.data as any).options)
      ? ((u.data as any).options as any[]).map((o) => ({ id: String(o?.id ?? ''), label: String(o?.label ?? '') })).filter((o) => o.id && o.label)
      : defaultOptions;

    const optionLabel = new Map(options.map((o) => [o.id, o.label]));

    const pairs = Object.entries(matches as Record<string, unknown>).map(([k, v]) => {
      const left = statementText.get(k) ?? k;
      const right = optionLabel.get(String(v)) ?? String(v);
      return `${left}: ${right}`;
    });

    return pairs.length > 0 ? pairs.join(' | ') : null;
  }

  if (u.type === 'question_gap_fill') {
    const blanks = (u.correct as any).blanks;
    if (!blanks || typeof blanks !== 'object') return null;
    const pairs = Object.entries(blanks as Record<string, unknown>).map(([k, v]) => {
      const answers = Array.isArray(v) ? v.map(String).join(' / ') : String(v ?? '');
      return `${k}: ${answers}`;
    });
    return pairs.length > 0 ? pairs.join(', ') : null;
  }

  if (u.type === 'question_select_from_list') {
    const blanks = (u.correct as any).blanks;
    if (!blanks || typeof blanks !== 'object') return null;
    const options = Array.isArray((u.data as any).options) ? ((u.data as any).options as any[]) : [];
    const optionLabel = new Map(options.map((o) => [String(o?.id ?? ''), String(o?.label ?? '')]));

    const pairs = Object.entries(blanks as Record<string, unknown>).map(([k, v]) => {
      const ids = Array.isArray(v) ? v.map(String) : [String(v ?? '')].filter(Boolean);
      const labels = ids.map((id) => optionLabel.get(id) ?? id).filter(Boolean);
      return `${k}: ${labels.join(' / ')}`;
    });

    return pairs.length > 0 ? pairs.join(', ') : null;
  }

  if (u.type === 'question_table_completion') {
    const cells = (u.correct as any).cells;
    if (!cells || typeof cells !== 'object') return null;
    const pairs = Object.entries(cells as Record<string, unknown>).map(([k, v]) => {
      const answers = Array.isArray(v) ? v.map(String).join(' / ') : String(v ?? '');
      return `${k}: ${answers}`;
    });
    return pairs.length > 0 ? pairs.join(', ') : null;
  }

  if (u.type === 'question_diagram_labeling') {
    const labels = (u.correct as any).labels;
    if (!labels || typeof labels !== 'object') return null;
    const pairs = Object.entries(labels as Record<string, unknown>).map(([k, v]) => {
      const answers = Array.isArray(v) ? v.map(String).join(' / ') : String(v ?? '');
      return `${k}: ${answers}`;
    });
    return pairs.length > 0 ? pairs.join(', ') : null;
  }

  if (u.type === 'question_drag_drop') {
    const targets = (u.correct as any).targets;
    if (!targets || typeof targets !== 'object') return null;
    const pairs = Object.entries(targets as Record<string, unknown>).map(([k, v]) => `${k} -> ${String(v)}`);
    return pairs.length > 0 ? pairs.join(', ') : null;
  }

  return null;
};

export const ReviewSessionPage: React.FC = () => {
  const navigate = useNavigate();
  const { sessionId } = useParams<{ sessionId: string }>();
  const { accessToken } = useAccess();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ReviewSessionResponse | null>(null);
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [activePartId, setActivePartId] = useState<string | null>(null);
  const [mobileReadingPane, setMobileReadingPane] = useState<'questions' | 'passage'>('questions');

  useEffect(() => {
    setMobileReadingPane('questions');
  }, [activeSectionId]);

  useEffect(() => {
    const run = async () => {
      if (!sessionId) {
        setError('Missing session id');
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      if (!accessToken) return;

      try {
        const res = await getReviewSession(accessToken, sessionId, undefined, TOEFL_IBT_PRODUCT_ID);
        setData(res);
        setActiveSectionId((prev) => prev ?? res.sections?.[0]?.id ?? null);
        setActivePartId(null);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        setError(msg);
      } finally {
        setLoading(false);
      }
    };

    run();
  }, [accessToken, navigate, sessionId]);

  const section = useMemo(() => data?.sections.find((s) => s.id === activeSectionId) ?? null, [activeSectionId, data?.sections]);

  const units = useMemo(() => {
    const list = data?.units ?? [];
    if (!activeSectionId) return [];
    const filtered = list.filter((u) => u.section_id === activeSectionId);
    filtered.sort((a, b) => {
      const pa = a.part_order ?? 0;
      const pb = b.part_order ?? 0;
      if (pa !== pb) return pa - pb;
      return (a.display_order ?? 0) - (b.display_order ?? 0);
    });
    return filtered;
  }, [activeSectionId, data?.units]);

  const isReading = ['reading', 'reading_writing'].includes(sectionType(section));

  const parts = useMemo(() => {
    const map = new Map<string, { id: string; name: string; order: number }>();
    for (const u of units) {
      const id = String((u as any).part_id ?? '');
      if (!id) continue;
      if (map.has(id)) continue;
      map.set(id, { id, name: String((u as any).part_name ?? 'Part'), order: Number((u as any).part_order ?? 0) });
    }
    const list = Array.from(map.values());
    list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    return list;
  }, [units]);

  useEffect(() => {
    if (!isReading) return;
    const first = parts[0]?.id ?? null;
    setActivePartId((prev) => (prev && parts.some((p) => p.id === prev) ? prev : first));
  }, [isReading, parts]);

  const allPassages = isReading ? units.filter((u) => u.type === 'reading_passage') : [];
  const allMainUnits = isReading ? units.filter((u) => u.type !== 'reading_passage') : units;

  const visiblePassages = isReading && activePartId ? allPassages.filter((u) => u.part_id === activePartId) : allPassages;
  const visibleMainUnits = isReading && activePartId ? allMainUnits.filter((u) => u.part_id === activePartId) : allMainUnits;

  const questionRanges = useMemo(() => {
    const ranges: Record<string, QuestionRange> = {};
    let n = 0;
    for (const u of allMainUnits) {
      if (!isQuestionUnit(u)) continue;
      const subIds = questionSubIds(u).filter(Boolean);
      const start = n + 1;
      if (subIds.length === 0) {
        n += 1;
        ranges[u.id] = { start, end: n };
      } else {
        n += subIds.length;
        ranges[u.id] = { start, end: n };
      }
    }
    return ranges;
  }, [allMainUnits]);

  const questionLabel = (unitId: string): string => {
    const r = questionRanges[unitId];
    if (!r) return '';
    return r.start === r.end ? String(r.start) : `${r.start}-${r.end}`;
  };

  if (loading) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">Loading review...</div>;
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="w-full max-w-2xl bg-white border border-gray-200 rounded-2xl shadow-sm p-8">
          <h1 className="text-2xl font-bold text-gray-900">Review</h1>
          <div className="mt-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3">{error}</div>
          <div className="mt-6 flex gap-2">
            <button
              onClick={() => navigate('/review', { replace: true })}
              className="px-4 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 font-medium"
            >
              Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">No review data.</div>;
  }

  return (
    <div className="h-[100dvh] md:h-screen flex flex-col bg-white overflow-hidden">
      <div className="h-16 bg-gray-900 text-white flex items-center justify-between px-4 sm:px-6 shadow-md z-10 shrink-0">
        <div className="flex items-center space-x-4 min-w-0">
          <button
            onClick={() => navigate('/review')}
            className="text-sm font-semibold px-3 py-2 rounded bg-white/10 hover:bg-white/15 transition-colors"
            type="button"
          >
            Back
          </button>
          <h1 className="font-bold text-lg truncate">{data.experience.name}</h1>
          <span className="text-gray-500">|</span>
          <span className="text-gray-300 font-medium truncate">{section?.name ?? 'Section'}</span>
        </div>
        <div className="text-xs text-gray-300">
          Session <span className="font-mono">{data.session.id}</span>
        </div>
        <AskSchoodAI source="toefl" session={data.session.id}/>
      </div>

      <div className="border-b border-gray-200 bg-gray-50 px-4 sm:px-6 py-3 overflow-x-auto">
        <div className="flex gap-2">
          {data.sections
            .slice()
            .sort((a, b) => a.display_order - b.display_order)
            .map((s) => {
              const active = s.id === activeSectionId;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setActiveSectionId(s.id)}
                  className={`px-4 py-2 rounded-xl border text-sm font-semibold whitespace-nowrap transition-colors ${
                    active ? 'bg-gray-900 text-white border-gray-900' : 'bg-white border-gray-200 text-gray-800 hover:bg-gray-50'
                  }`}
                >
                  {s.name}
                </button>
              );
            })}
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex relative">
        {isReading ? (
          <div className="flex-1 overflow-hidden flex flex-col">
            <div className="shrink-0 border-b border-gray-200 bg-white px-4 sm:px-6 py-3 flex items-center gap-2 overflow-x-auto">
              {parts.map((p) => {
                const active = p.id === activePartId;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setActivePartId(p.id)}
                    className={`px-4 py-2 rounded-xl border text-sm font-semibold whitespace-nowrap transition-colors ${
                      active ? 'bg-gray-900 text-white border-gray-900' : 'bg-white border-gray-200 text-gray-800 hover:bg-gray-50'
                    }`}
                  >
                    {p.name}
                  </button>
                );
              })}
              {parts.length === 0 ? <div className="text-sm text-gray-600">No parts.</div> : null}
            </div>

            <div className="md:hidden shrink-0 border-b border-gray-200 bg-white px-4 sm:px-6 py-2">
              <div className="inline-flex rounded-xl border border-gray-200 overflow-hidden bg-gray-50">
                <button
                  type="button"
                  onClick={() => setMobileReadingPane('questions')}
                  className={`px-3 py-2 text-xs font-semibold ${mobileReadingPane === 'questions' ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-white'}`}
                >
                  Questions
                </button>
                <button
                  type="button"
                  onClick={() => setMobileReadingPane('passage')}
                  className={`px-3 py-2 text-xs font-semibold ${mobileReadingPane === 'passage' ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-white'}`}
                >
                  Passage
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-hidden flex">
              <aside
                className={[
                  mobileReadingPane === 'passage' ? 'flex-1' : 'hidden',
                  'md:block md:w-[45%] md:border-r border-gray-200 bg-gray-50 p-4 sm:p-6 overflow-y-auto',
                ].join(' ')}
              >
                <div className="space-y-6">
                  {visiblePassages.map((p) => (
                    <InputRenderer key={p.id} unit={toContentUnit(p)} readOnly />
                  ))}
                  {visiblePassages.length === 0 ? <div className="text-gray-600 text-sm">No passage found.</div> : null}
                </div>
              </aside>

              <main
                className={[
                  mobileReadingPane === 'questions' ? 'flex-1' : 'hidden',
                  'md:block md:flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8',
                ].join(' ')}
              >
                {visibleMainUnits.map((u) => (
                <div key={u.id} className="border border-gray-200 rounded-2xl p-5 mb-6">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                      <div className="text-xs font-semibold tracking-wider uppercase text-gray-500">
                      {isQuestionUnit(u) ? `Question ${questionLabel(u.id)}` : 'Content'}
                      </div>
                      {isQuestionUnit(u) ? (
                        <span
                        className={`text-xs font-semibold px-2 py-1 rounded-full ${
                          u.is_correct === true
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : u.is_correct === false
                              ? 'bg-red-50 text-red-800 border border-red-200'
                              : 'bg-gray-100 text-gray-700 border border-gray-200'
                        }`}
                      >
                        {u.is_correct === true ? 'Correct' : u.is_correct === false ? 'Incorrect' : 'Not graded'}
                        {u.score != null && u.max_score != null && u.max_score > 0 ? ` (${u.score}/${u.max_score})` : ''}
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-4">
                    <InputRenderer
                      unit={toContentUnit(u)}
                      value={u.answer ?? undefined}
                      readOnly
                      questionNumber={
                        questionRanges[u.id]
                          ? questionRanges[u.id].start === questionRanges[u.id].end
                            ? questionRanges[u.id].start
                            : questionRanges[u.id]
                          : undefined
                      }
                    />
                  </div>

                  {isQuestionUnit(u) ? (
                    <div className="mt-4 text-sm text-gray-700">
                      {correctSummary(u) ? (
                        <div>
                          <span className="font-semibold text-gray-900">Correct:</span> {correctSummary(u)}
                        </div>
                      ) : null}
                      {u.is_correct === false ? <div className="mt-2"><AskSchoodAI page="explain" source="toefl" session={data.session.id} item={u.id}/></div> : null}
                    </div>
                  ) : null}
                </div>
              ))}
                {visibleMainUnits.length === 0 ? <div className="text-gray-600 text-sm">No content found.</div> : null}
              </main>
            </div>
          </div>
        ) : (
          <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto w-full">
            {allMainUnits.map((u) => (
              <div key={u.id} className="border border-gray-200 rounded-2xl p-5 mb-6">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                  <div className="text-xs font-semibold tracking-wider uppercase text-gray-500">
                    {isQuestionUnit(u) ? `Question ${questionLabel(u.id)}` : 'Content'}
                  </div>
                  {isQuestionUnit(u) ? (
                    <span
                      className={`text-xs font-semibold px-2 py-1 rounded-full ${
                        u.is_correct === true
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                          : u.is_correct === false
                            ? 'bg-red-50 text-red-800 border border-red-200'
                            : 'bg-gray-100 text-gray-700 border border-gray-200'
                      }`}
                    >
                      {u.is_correct === true ? 'Correct' : u.is_correct === false ? 'Incorrect' : 'Not graded'}
                      {u.score != null && u.max_score != null && u.max_score > 0 ? ` (${u.score}/${u.max_score})` : ''}
                    </span>
                  ) : null}
                </div>

                <div className="mt-4">
                  <InputRenderer
                    unit={toContentUnit(u)}
                    value={u.answer ?? undefined}
                    readOnly
                    questionNumber={
                      questionRanges[u.id]
                        ? questionRanges[u.id].start === questionRanges[u.id].end
                          ? questionRanges[u.id].start
                          : questionRanges[u.id]
                        : undefined
                    }
                  />
                </div>

                {isQuestionUnit(u) ? (
                  <div className="mt-4 text-sm text-gray-700">
                    {correctSummary(u) ? (
                      <div>
                        <span className="font-semibold text-gray-900">Correct:</span> {correctSummary(u)}
                      </div>
                    ) : null}
                      {u.is_correct === false ? <div className="mt-2"><AskSchoodAI page="explain" source="toefl" session={data.session.id} item={u.id}/></div> : null}
                  </div>
                ) : null}
              </div>
            ))}
            {visibleMainUnits.length === 0 ? <div className="text-gray-600 text-sm">No content found.</div> : null}
          </main>
        )}
      </div>
    </div>
  );
};

function toContentUnit(u: UnitRow): ContentUnit {
  return {
    id: u.id,
    partId: u.part_id,
    type: u.type as any,
    data: u.data as any,
    displayOrder: u.display_order,
  };
}
