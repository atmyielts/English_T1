// Deterministic sessions for handler-level scorer tests (IELTS, SAT, iTEP,
// TOEFL pre-2026 and TOEFL 2026). Ids are stable so golden outputs stay
// byte-comparable across runs.

import type { FakeDb } from "./fake-supabase.ts";

type Row = Record<string, unknown>;
export type UnitSpec = {
  type: string;
  data?: Row;
  metadata?: Row;
  correct?: unknown;
  response?: unknown;
};
export type SectionSpec = { type: string; name?: string; metadata?: Row; parts: UnitSpec[][] };
export type SessionSpec = {
  key: string;
  productId: string;
  productSlug: string;
  experienceMetadata?: Row;
  sessionMetadata?: Row;
  sections: SectionSpec[];
  evaluations?: Array<{ method: string; result: Row }>;
};

export const USER_ID = "00000000-0000-4000-8000-000000000001";
export const TOKEN = "learner-token";

const pad = (n: number) => String(n).padStart(4, "0");
const uid = (key: string, kind: string, n: number) => `${key}-${kind}-${pad(n)}`;

export const buildDb = (spec: SessionSpec): Omit<FakeDb, "writes"> & { sessionId: string; unitIds: string[]; sectionIds: string[] } => {
  const sessionId = uid(spec.key, "session", 1);
  const experienceId = uid(spec.key, "exp", 1);
  const tables: Record<string, Row[]> = {
    users: [{ id: USER_ID, role: "student" }],
    products: [{ id: spec.productId, name: spec.productSlug, metadata: { slug: spec.productSlug } }],
    experiences: [{ id: experienceId, product_id: spec.productId, name: `${spec.key} test`, metadata: spec.experienceMetadata ?? {} }],
    sessions: [{
      id: sessionId, user_id: USER_ID, experience_id: experienceId, status: "completed", metadata: spec.sessionMetadata ?? {},
      token_id: null, started_at: "2026-10-01T09:00:00.000Z", completed_at: "2026-10-01T10:00:00.000Z", created_at: "2026-10-01T09:00:00.000Z",
    }],
    sections: [], parts: [], content_units: [], answer_keys: [], responses: [], evaluations: [],
    exam_outcomes: [], domain_event_outbox: [],
  };
  let s = 0, p = 0, u = 0, r = 0;
  const unitIds: string[] = [];
  const sectionIds: string[] = [];
  for (const section of spec.sections) {
    s += 1;
    const sectionId = uid(spec.key, "sec", s);
    sectionIds.push(sectionId);
    tables.sections.push({ id: sectionId, experience_id: experienceId, name: section.name ?? section.type, display_order: s, metadata: { type: section.type, ...(section.metadata ?? {}) } });
    section.parts.forEach((units, partIndex) => {
      p += 1;
      const partId = uid(spec.key, "part", p);
      tables.parts.push({ id: partId, section_id: sectionId, name: `Part ${partIndex + 1}`, display_order: partIndex + 1, metadata: {} });
      units.forEach((unit, unitIndex) => {
        u += 1;
        const unitId = uid(spec.key, "unit", u);
        unitIds.push(unitId);
        tables.content_units.push({ id: unitId, part_id: partId, type: unit.type, data: unit.data ?? { prompt: `Q${u}` }, display_order: unitIndex + 1, metadata: unit.metadata ?? {} });
        if (unit.correct !== undefined) tables.answer_keys.push({ content_unit_id: unitId, correct: unit.correct, metadata: {} });
        if (unit.response !== undefined) {
          r += 1;
          tables.responses.push({ id: uid(spec.key, "resp", r), session_id: sessionId, content_unit_id: unitId, type: unit.type, data: unit.response, submitted_at: `2026-10-01T09:${pad(r).slice(2)}:00.000Z` });
        }
      });
    });
  }
  for (const [i, e] of (spec.evaluations ?? []).entries()) {
    tables.evaluations.push({ id: uid(spec.key, "eval", i + 1), session_id: sessionId, method: e.method, status: "completed", result: e.result, evaluated_at: `2026-10-01T10:0${i}:00.000Z` });
  }
  return { tables, users: { [TOKEN]: USER_ID }, sessionId, unitIds, sectionIds };
};

const sc = (correct: string, answer: string | null): UnitSpec => ({
  type: "question_single_choice",
  data: { prompt: "Choose", options: ["A", "B", "C", "D"].map((id) => ({ id, label: id })) },
  correct: { option_id: correct },
  ...(answer == null ? {} : { response: { selected_option: answer } }),
});

export const IELTS: SessionSpec = {
  key: "ielts",
  productId: "11111111-1111-4111-8111-111111111111",
  productSlug: "ielts-simulator",
  sections: [
    {
      type: "listening",
      parts: [
        [{ type: "audio", data: { url: "https://x.test/a.mp3" } }, sc("A", "A"), sc("B", "C"), sc("C", "C")],
        [
          { type: "question_gap_fill", data: { text: "{{1}} {{2}} {{3}}" }, correct: { blanks: { "1": ["harbour", "harbor"], "2": ["9"], "3": ["Tuesday"] } }, response: { blanks: { "1": "Harbor", "2": "nine", "3": "tuesday " } } },
          { type: "question_multi_choice", correct: { option_ids: ["A", "C"] }, response: { selected_options: ["C", "A"] } },
          { type: "question_table_completion", correct: { cells: { a: ["red"], b: ["blue"] } }, response: { cells: { a: "Red", b: "green" } } },
        ],
      ],
    },
    {
      type: "reading",
      parts: [
        [
          { type: "reading_passage", data: { text: "Passage" } },
          { type: "question_true_false_not_given", correct: { matches: { "1": "T", "2": "NG", "3": "F" } }, response: { matches: { "1": "true", "2": "not given", "3": "T" } } },
          { type: "question_yes_no_not_given", correct: { matches: { "1": "Y", "2": "N" } }, response: { "1": "yes", "2": "N" } },
          { type: "question_matching_headings", correct: { matches: { "1": "iv", "2": "ii" } }, response: { matches: { "1": "IV", "2": "i" } } },
        ],
        [
          { type: "question_select_from_list", correct: { blanks: { "1": ["A"], "2": ["D"] } }, response: { blanks: { "1": "a", "2": "B" } } },
          { type: "question_diagram_labeling", correct: { labels: { "1": ["valve"] } }, response: { labels: { "1": "Valve" } } },
          { type: "question_drag_drop", correct: { targets: { "1": "B", "2": "A" } }, response: { targets: { "1": "B", "2": "B" } } },
          { type: "question_text", correct: { answers: ["photosynthesis"] }, response: { text: "Photosynthesis." } },
          sc("D", null),
        ],
      ],
    },
    { type: "writing", parts: [[{ type: "question_text", data: { prompt: "Essay", task_type: "task2" }, response: { text: "Some essay text here." } }]] },
  ],
};

export const SAT: SessionSpec = {
  key: "sat",
  productId: "22222222-2222-4222-8222-222222222222",
  productSlug: "sat-simulator",
  sections: [
    { type: "reading_writing", parts: [[sc("A", "A"), sc("B", "B"), sc("C", "D"), sc("D", "D"), sc("A", null)]] },
    { type: "math", parts: [[sc("B", "B"), sc("C", "C"), { type: "question_text", correct: { answers: ["3/4", "0.75", ".75"] }, response: { text: ".75" } }, sc("A", "B")]] },
  ],
};

export const ITEP: SessionSpec = {
  key: "itep",
  productId: "a6c7887c-633c-4d88-8b70-397ed04dbbb1",
  productSlug: "itep-simulator",
  experienceMetadata: { score_profile: { calibration: { reading: [{ score: 4.5, min_ratio: 0.6 }, { score: 5.5, min_ratio: 0.9 }] } } },
  sections: [
    { type: "grammar", parts: [[sc("A", "A"), sc("B", "B"), sc("C", "A")]] },
    { type: "listening", parts: [[sc("A", "A"), sc("B", "C")]] },
    { type: "reading", parts: [[sc("A", "A"), sc("B", "B"), sc("C", "C"), sc("D", "A"), sc("A", "A")]] },
    { type: "writing", parts: [[{ type: "question_text", data: { prompt: "Write" }, response: { text: "My answer" } }]] },
  ],
  evaluations: [{ method: "ai", result: { overall_score: 4.2, tasks: [{ score: 4.2 }] } }],
};

export const TOEFL_LEGACY: SessionSpec = {
  key: "toefl-legacy",
  productId: "b262ffa8-9912-4eba-93d7-58af3164d1cc",
  productSlug: "toefl-ibt-simulator",
  experienceMetadata: { catalog: "full_test", launch_pack: "toefl_rlw_v1" },
  sections: [
    { type: "reading", parts: [[sc("A", "A"), sc("B", "B"), sc("C", "C"), sc("D", "A")]] },
    { type: "listening", parts: [[{ type: "audio", data: { url: "https://x.test/l.mp3" } }, sc("A", "B"), sc("B", "B")]] },
    { type: "writing", parts: [[{ type: "question_text", data: { prompt: "Integrated", task_type: "integrated" }, response: { text: "Lecture summary." } }]] },
  ],
  evaluations: [{ method: "ai", result: { overall_band: 6.5, tasks: [{ band: 6.5 }] } }],
};

export const LEGACY_SPECS: SessionSpec[] = [IELTS, SAT, ITEP, TOEFL_LEGACY];
