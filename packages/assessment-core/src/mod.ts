/** Shared contracts. This module has no provider, DOM, credential or persistence dependency. */
import {imageInteraction,hotspotKey,imagePoint,regionContains,type ImageInteraction,type ImageRegion} from './image-response.ts';
import {mediaAnswerPolicy,MEDIA_RESPONSE_TYPES,type MediaAnswerPolicy,type MediaResponseType} from './media-answer.ts';
import {classification,blueprint,selectBlueprint,BlueprintError,type Classification,type Blueprint} from './blueprint.ts';
export const ITEM_TYPES = ["single_choice", "multi_choice", "true_false", "matching", "ordering", "gap_fill", "short_answer", "numeric", "table_completion", "diagram_labeling", "hotspot", "essay", "audio_response", "video_response", "file_response"] as const;
export type ItemType = typeof ITEM_TYPES[number];
export type Locale = "uz" | "ru" | "en";
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type Option = { id: string; text: string };
export interface Item {
  schema_version: "assessment.item.v1";
  type: ItemType;
  prompt: string;
  locale: Locale;
  options?: Option[];
  response_ids?: string[];
  media?: { artifact_id: string; kind: "image" | "audio" | "video"; alt: string }[];
  max_score: number;
  tags: string[];
  classification?:Classification;
  rubric_id?: string;
  image_response?:ImageInteraction;
  media_response?:MediaAnswerPolicy;
}
export interface AnswerKey {
  correct?: string | string[] | Record<string, string | string[]>;
  numeric?: { value: number; tolerance: number };
  case_sensitive?: boolean;
  partial_credit?: boolean;
  hotspot?:{regions:ImageRegion[]};
  /** Worked solution. Private like the rest of the key; shown to a learner only after they answer in practice. */
  solution?: string;
}
export interface Definition {
  schema_version: "assessment.definition.v1" | "assessment.definition.v2";
  title: string;
  locale: Locale;
  duration_seconds: number;
  shuffle_items: boolean;
  shuffle_options: boolean;
  sections: { id: string; title: string; duration_seconds?: number; item_version_ids: string[]; draw_count?: number;blueprint?:Blueprint }[];
}
export interface ApprovedItem { id: string; item: Item; key: AnswerKey; approved_by: string; created_by: string }
export interface FormItem { item_version_id: string; section_id: string; item: Item }
export interface Manifest {
  schema_version: "assessment.manifest.v1";
  assessment_version_id: string;
  duration_seconds: number;
  locale: Locale;
  title: string;
  sections: { id: string; title: string; duration_seconds?: number; items: FormItem[] }[];
}
export class ContractError extends Error {
  constructor(public code: string, message: string, public status = 422) { super(message); }
}
const fail = (message: string): never => { throw new ContractError("invalid_contract", message); };
export const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("Expected an object");
  return value as Record<string, unknown>;
};
export function text(value: unknown, label: string, max = 1000): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) fail(`${label} must contain 1–${max} characters`);
  return (value as string).trim();
}
export function uuid(value: unknown, label = "id"): string {
  const id = text(value, label, 36);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) fail(`${label} must be a UUID`);
  return id.toLowerCase();
}
function number(value: unknown, label: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) fail(`${label} must be between ${min} and ${max}`);
  return value as number;
}
function strings(value: unknown, label: string, min = 0, max = 500): string[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) fail(`${label} must contain ${min}–${max} entries`);
  const entries = (value as unknown[]).map(v => text(v, label, 200));
  if (new Set(entries).size !== entries.length) fail(`${label} contains duplicate entries`);
  return entries;
}
function locale(value: unknown): Locale {
  if (!(["uz", "ru", "en"] as unknown[]).includes(value)) fail("Locale must be uz, ru or en");
  return value as Locale;
}
const subjective = new Set<ItemType>(["essay", "audio_response", "video_response", "file_response"]);
export const isSubjective = (type: ItemType) => subjective.has(type);
export function validateItem(value: unknown): Item {
  const raw = object(value);
  if (raw.schema_version !== "assessment.item.v1") fail("Unsupported item schema");
  if (!(ITEM_TYPES as readonly unknown[]).includes(raw.type)) fail("Unsupported question type");
  const type = raw.type as ItemType;
  const item: Item = { schema_version: "assessment.item.v1", type, prompt: text(raw.prompt, "Prompt", 50000), locale: locale(raw.locale), max_score: number(raw.max_score, "Max score", 0.01, 1000), tags: strings(raw.tags ?? [], "Tags", 0, 50) };
  if(Math.round(item.max_score*1e6)/1e6!==item.max_score)fail("Max score supports at most six decimal places");
  if(raw.classification!==undefined){try{item.classification=classification(raw.classification);}catch(cause){throw new ContractError("invalid_blueprint",(cause as Error).message);}}
  if (raw.options !== undefined) {
    if (!Array.isArray(raw.options) || raw.options.length > 100) fail("Options must be an array of at most 100 entries");
    item.options = (raw.options as unknown[]).map(value => { const option = object(value); return { id: text(option.id, "Option ID", 80), text: text(option.text, "Option text", 5000) }; });
    if (new Set(item.options.map(o => o.id)).size !== item.options.length) fail("Option IDs must be unique");
  }
  if (["single_choice", "multi_choice", "true_false", "ordering", "matching"].includes(type) && (item.options?.length ?? 0) < 2) fail("This question type needs at least two options");
  if (raw.response_ids !== undefined) item.response_ids = strings(raw.response_ids, "Response IDs", 1, 100);
  if (["matching", "gap_fill", "table_completion", "diagram_labeling"].includes(type) && !item.response_ids?.length) fail("This question type requires response IDs");
  if (raw.rubric_id !== undefined) item.rubric_id = uuid(raw.rubric_id, "Rubric ID");
  if (isSubjective(type) && !item.rubric_id) fail("Subjective responses require a rubric");
  if (raw.media !== undefined) {
    if (!Array.isArray(raw.media) || raw.media.length > 20) fail("Media must contain at most 20 entries");
    item.media = (raw.media as unknown[]).map(value => { const media = object(value); if (!["image", "audio", "video"].includes(String(media.kind))) fail("Invalid media kind"); return { artifact_id: uuid(media.artifact_id, "Artifact ID"), kind: media.kind as "image" | "audio" | "video", alt: text(media.alt, "Media alternative", 1000) }; });
  }
  if (["hotspot", "diagram_labeling"].includes(type) && !item.media?.some(m => m.kind === "image")) fail("Image question requires an image artifact");
  if(['hotspot','diagram_labeling'].includes(type)){
    try{item.image_response=imageInteraction(raw.image_response,type as 'hotspot'|'diagram_labeling',item.media??[],item.response_ids);}catch(cause){fail((cause as Error).message);}
  }else if(raw.image_response!==undefined)fail('Image interaction is only supported for diagram and hotspot questions');
  if(raw.media_response!==undefined){
    if(!(MEDIA_RESPONSE_TYPES as readonly string[]).includes(type))fail('Media answer policies are only supported on recorded or file questions');
    item.media_response=mediaAnswerPolicy(raw.media_response,type as MediaResponseType);
  }
  // Reconstruct the payload: keys and arbitrary executable markup are never copied through.
  return item;
}
export function validateKey(item: Item, value: unknown): AnswerKey {
  const key = validateKeyFields(item, value), solution = object(value).solution;
  if (solution !== undefined && solution !== null && !(typeof solution === "string" && !solution.trim())) key.solution = text(solution, "Worked solution", 20000);
  return key;
}
function validateKeyFields(item: Item, value: unknown): AnswerKey {
  const raw = object(value);
  if(item.type==='hotspot'){
    try{return {hotspot:hotspotKey(raw.hotspot),case_sensitive:false,partial_credit:false};}catch(cause){return fail((cause as Error).message);}
  }
  if (isSubjective(item.type)) return {};
  const key: AnswerKey = { case_sensitive: raw.case_sensitive === true, partial_credit: raw.partial_credit === true };
  if (item.type === "numeric") {
    const numeric = object(raw.numeric);
    key.numeric = { value: number(numeric.value, "Numeric answer", -1e12, 1e12), tolerance: number(numeric.tolerance, "Tolerance", 0, 1e9) };
    return key;
  }
  if (["matching", "gap_fill", "table_completion", "diagram_labeling"].includes(item.type)) {
    const mapping = object(raw.correct);
    const ids = item.response_ids!;
    if (Object.keys(mapping).length !== ids.length || ids.some(id => !Object.hasOwn(mapping,id))) fail("Scoring keys must exactly match response IDs");
    const correct: Record<string, string | string[]> = Object.create(null);
    for (const id of ids) correct[id] = Array.isArray(mapping[id]) ? strings(mapping[id], "Accepted answers", 1, 50) : text(mapping[id], "Answer", 1000);
    if (item.type === "matching" && Object.values(correct).some(v => typeof v !== "string" || !item.options?.some(o => o.id === v))) fail("Matching keys must reference valid option IDs");
    key.correct = correct;
  } else if (["multi_choice", "ordering"].includes(item.type)) {
    key.correct = strings(raw.correct, "Correct options", 1, 100);
    if (key.correct.some(id => !item.options?.some(o => o.id === id))) fail("Scoring key references an unknown option");
    if (item.type === "ordering" && key.correct.length !== item.options?.length) fail("Ordering key must contain every option");
  } else {
    key.correct = item.type === "short_answer" && Array.isArray(raw.correct) ? strings(raw.correct, "Accepted answers", 1, 50) : text(raw.correct, "Correct answer", 1000);
    if (["single_choice", "true_false"].includes(item.type) && !item.options?.some(o => o.id === key.correct)) fail("Scoring key references an unknown option");
  }
  return key;
}
export function validateDefinition(value: unknown): Definition {
  const raw = object(value);
  if (raw.schema_version!=="assessment.definition.v1"&&raw.schema_version!=="assessment.definition.v2") fail("Unsupported assessment schema");
  if (!Array.isArray(raw.sections) || !raw.sections.length || raw.sections.length > 50) fail("Assessment requires 1–50 sections");
  const duration = number(raw.duration_seconds, "Duration", 60, 86400);
  if (!Number.isInteger(duration)) fail("Duration must be an integer");
  const sections = (raw.sections as unknown[]).map(value => {
    const section = object(value);
    const ids = strings(section.item_version_ids, "Item versions", 1, 500).map(id => uuid(id));
    const draw = section.draw_count === undefined ? ids.length : number(section.draw_count, "Draw count", 1, ids.length);
    if (!Number.isInteger(draw)) fail("Draw count must be an integer");
    const sectionDuration = section.duration_seconds === undefined ? undefined : number(section.duration_seconds, "Section duration", 1, duration);
    if (sectionDuration !== undefined && !Number.isInteger(sectionDuration)) fail("Section duration must be an integer");
    let constraints:Blueprint|undefined;if(section.blueprint!==undefined){try{constraints=blueprint(section.blueprint,draw,ITEM_TYPES,ids);}catch(cause){throw new ContractError("invalid_blueprint",(cause as Error).message);}}
    return { id: uuid(section.id), title: text(section.title, "Section title", 200), item_version_ids: ids, draw_count: draw, ...(sectionDuration === undefined ? {} : { duration_seconds: sectionDuration }),...(constraints?{blueprint:constraints}:{}) };
  });
  if (new Set(sections.map(s => s.id)).size !== sections.length) fail("Section IDs must be unique");
  const ids = sections.flatMap(s => s.item_version_ids);
  if (new Set(ids).size !== ids.length) fail("An item version cannot appear in multiple sections");
  if (sections.reduce((sum, s) => sum + (s.duration_seconds ?? 0), 0) > duration) fail("Section timers exceed total duration");
  if(sections.some(section=>section.blueprint)!==(raw.schema_version==='assessment.definition.v2'))fail("Constrained blueprints require assessment.definition.v2. Do not downgrade or discard their requirements.");
  return { schema_version: raw.schema_version as Definition['schema_version'], title: text(raw.title, "Title", 200), locale: locale(raw.locale), duration_seconds: duration, shuffle_items: raw.shuffle_items === true, shuffle_options: raw.shuffle_options === true, sections };
}
export function randomIndex(max: number): number {
  if (!Number.isInteger(max) || max < 1 || max > 0x100000000) throw new Error("Invalid random range");
  const limit = 0x100000000 - (0x100000000 % max);
  let value: number;
  do { value = crypto.getRandomValues(new Uint32Array(1))[0]; } while (value >= limit);
  return value % max;
}
function shuffle<T>(values: T[], next = randomIndex): T[] {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) { const j = next(i + 1); if (!Number.isInteger(j) || j < 0 || j > i) throw new Error("Invalid random index"); [result[i], result[j]] = [result[j], result[i]]; }
  return result;
}
export function buildManifest(versionId: string, definition: Definition, approved: ApprovedItem[], next = randomIndex, unavailable: ReadonlySet<string> = new Set()): Manifest {
  const pool = new Map(approved.map(item => [item.id, item]));
  const budget={remaining:100000};
  const sections = definition.sections.map(section => {
    const candidates = section.item_version_ids.map(id => {
      const candidate = pool.get(id);
      if (!candidate?.approved_by) fail("Every item must have human approval");
      return candidate!;
    });
    // Sampling and ordering are independent. A random subset keeps the author's
    // order unless question-order shuffling is explicitly enabled.
    const sampled = !section.blueprint && section.draw_count! < candidates.length ? new Set(shuffle(candidates, next).slice(0, section.draw_count).map(item => item.id)) : null;
    let selected = sampled ? candidates.filter(item => sampled.has(item.id)) : candidates;
    if(section.blueprint){try{selected=selectBlueprint(candidates,section.draw_count??candidates.length,section.blueprint,next,budget,unavailable);}catch(cause){if(cause instanceof BlueprintError)throw new ContractError(cause.code,cause.message);throw cause;}}
    const ordered = definition.shuffle_items ? shuffle(selected, next) : selected;
    const items = ordered.map(candidate => {
      const item = validateItem(candidate.item);
      delete item.classification; // private author-estimated metadata is not a candidate prompt
      if (definition.shuffle_options && item.options && item.type !== "ordering") item.options = shuffle(item.options, next);
      return { item_version_id: candidate.id, section_id: section.id, item };
    });
    return { id: section.id, title: section.title, ...(section.duration_seconds === undefined ? {} : { duration_seconds: section.duration_seconds }), items };
  });
  return { schema_version: "assessment.manifest.v1", assessment_version_id: uuid(versionId), duration_seconds: definition.duration_seconds, locale: definition.locale, title: definition.title, sections };
}
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b, "en")).map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(",")}}`;
}
export async function hash(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalJson(value)));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}
export interface Score { score: number | null; max_score: number; status: "scored" | "needs_human" }
export function scoreResponse(item: Item, key: AnswerKey, response: unknown): Score {
  if (isSubjective(item.type)) return { score: null, max_score: item.max_score, status: "needs_human" };
  const normalize = (value: unknown) => {
    if (typeof value !== "string") return "";
    const normalized = value.normalize("NFKC").trim().replace(/\s+/g, " ");
    return key.case_sensitive ? normalized : normalized.toLocaleLowerCase(item.locale);
  };
  const same = (a: unknown, b: unknown) => typeof a === "string" && typeof b === "string" && normalize(a) === normalize(b);
  const accepted = (expected: string | string[], actual: unknown) => Array.isArray(expected) ? expected.some(value => same(value, actual)) : same(expected, actual);
  let ratio = 0;
  if(item.type==='hotspot'){
    try{const point=imagePoint(response);ratio=key.hotspot!.regions.some(region=>regionContains(region,point))?1:0;}catch{ratio=0;}
  }else if (item.type === "numeric") {
    const value = typeof response === "number" ? response : typeof response === "string" && response.trim() ? Number(response) : NaN;
    ratio = Number.isFinite(value) && Math.abs(value - key.numeric!.value) <= key.numeric!.tolerance ? 1 : 0;
  } else if (["matching", "gap_fill", "table_completion", "diagram_labeling"].includes(item.type)) {
    const values = response && typeof response === "object" && !Array.isArray(response) ? response as Record<string, unknown> : {};
    const entries = Object.entries(key.correct as Record<string, string | string[]>);
    const matched = entries.filter(([id, expected]) => Object.hasOwn(values,id)&&accepted(expected, values[id])).length;
    ratio = key.partial_credit ? matched / entries.length : matched === entries.length ? 1 : 0;
  } else if (item.type === "multi_choice" || item.type === "ordering") {
    const actual = Array.isArray(response) && response.every(v => typeof v === "string") ? response as string[] : [];
    const correct = key.correct as string[];
    const unique = new Set(actual);
    if (unique.size !== actual.length || actual.some(id => !item.options!.some(o => o.id === id))) ratio = 0;
    else if (item.type === "ordering") ratio = actual.length === correct.length && actual.every((v, i) => v === correct[i]) ? 1 : 0;
    else if (key.partial_credit) ratio = Math.max(0, (actual.filter(v => correct.includes(v)).length - actual.filter(v => !correct.includes(v)).length) / correct.length);
    else ratio = actual.length === correct.length && actual.every(v => correct.includes(v)) ? 1 : 0;
  } else ratio = accepted(key.correct as string | string[], response) ? 1 : 0;
  return { score: Math.round(item.max_score * ratio * 1e6) / 1e6, max_score: item.max_score, status: "scored" };
}
export interface ProctorPolicy {
  schema_version: "proctor.policy.v1";
  mode: "browser" | "record_review" | "live" | "secure_desktop" | "center";
  identity_level: 0 | 1 | 2 | 3;
  camera: boolean;
  microphone: boolean;
  screen: boolean;
  second_camera: boolean;
  recording_retention_days: number;
  identity_retention_days: number;
  auto_pause: boolean;
  recovery_seconds: number;
  reviewer_quorum: 1 | 2;
  /** Proctor Lite webcam stills: 0 is off; otherwise one picture per interval plus an identity photo at the start. */
  snapshot_interval_seconds: number;
}
export function validatePolicy(value: unknown): ProctorPolicy {
  const raw = object(value);
  if (raw.schema_version !== "proctor.policy.v1") fail("Unsupported proctor policy");
  if (!["browser", "record_review", "live", "secure_desktop", "center"].includes(String(raw.mode))) fail("Invalid monitoring mode");
  const level = number(raw.identity_level, "Identity level", 0, 3);
  if (!Number.isInteger(level)) fail("Identity level must be an integer");
  const recording = number(raw.recording_retention_days ?? 90, "Recording retention", 1, 365);
  const identity = number(raw.identity_retention_days ?? 30, "Identity retention", 1, 365);
  const recovery = number(raw.recovery_seconds ?? 10, "Recovery window", 10, 300);
  const quorum = number(raw.reviewer_quorum ?? 2, "Reviewer quorum", 1, 2);
  const snapshots = raw.snapshot_interval_seconds === undefined || raw.snapshot_interval_seconds === 0 ? 0 : number(raw.snapshot_interval_seconds, "Snapshot interval", 30, 600);
  if (!Number.isInteger(snapshots)) fail("Snapshot interval must be an integer");
  if (![recording, identity, recovery, quorum].every(Number.isInteger)) fail("Policy intervals and quorum must be integers");
  return { schema_version: "proctor.policy.v1", mode: raw.mode as ProctorPolicy["mode"], identity_level: level as ProctorPolicy["identity_level"], camera: raw.camera === true, microphone: raw.microphone === true, screen: raw.screen === true, second_camera: raw.second_camera === true, recording_retention_days: recording, identity_retention_days: identity, auto_pause: raw.auto_pause === true, recovery_seconds: recovery, reviewer_quorum: quorum as 1 | 2, snapshot_interval_seconds: snapshots };
}
export type IntegrityAction = "observe" | "warn" | "pause" | "reverify";
export function integrityAction(policy: ProctorPolicy, input: { kind: "capture_lost" | "client_tampered" | "extra_display" | "ml_anomaly"; duration_seconds: number; observation_windows: number }): IntegrityAction {
  if (input.kind === "ml_anomaly") return input.observation_windows >= 3 ? (policy.auto_pause ? "reverify" : "warn") : "observe";
  return input.duration_seconds >= policy.recovery_seconds ? (policy.auto_pause ? "pause" : "warn") : "observe";
}
