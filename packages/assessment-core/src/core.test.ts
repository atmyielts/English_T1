import { buildManifest, canonicalJson, hash, integrityAction, scoreResponse, validateDefinition, validateItem, validateKey, validatePolicy, type Item } from "./mod.ts";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function equal(actual: unknown, expected: unknown) { if (canonicalJson(actual) !== canonicalJson(expected)) throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`); }
function rejects(fn: () => unknown, fragment: string) { try { fn(); } catch (cause) { if (String(cause).includes(fragment)) return; throw cause; } throw new Error(`Expected rejection: ${fragment}`); }
const item = (extra: Partial<Item> = {}): Item => ({ schema_version: "assessment.item.v1", type: "single_choice", prompt: "Choose the prime number.", locale: "en", max_score: 2, tags: ["math"], options: [{ id: "a", text: "4" }, { id: "b", text: "5" }], ...extra });
Deno.test('UUID references normalize case before duplicate and storage-scope comparisons',()=>{const section='abcdefab-0000-4000-8000-000000000001',version='abcdefab-0000-4000-8000-000000000002',definition={schema_version:'assessment.definition.v1',title:'Case normalization',locale:'en',duration_seconds:60,sections:[{id:section.toUpperCase(),title:'Part',item_version_ids:[version.toUpperCase()]}]};equal(validateDefinition(definition).sections[0].id,section);equal(validateDefinition(definition).sections[0].item_version_ids,[version]);rejects(()=>validateDefinition({...definition,sections:[definition.sections[0],{...definition.sections[0],id:section}]}),'Section IDs');});
Deno.test("item validation excludes keys, scripts and unknown fields from candidate data", () => {
  const payload = validateItem({ ...item(), key: { correct: "b" }, answer_key: "b", malicious: "data" });
  equal(Object.keys(payload).sort(), ["schema_version","type","prompt","locale","max_score","tags","options"].sort());
  rejects(() => validateItem({ ...item(), options: [{ id: "a", text: "One" }, { id: "a", text: "Two" }] }), "unique");
  rejects(() => validateItem(item({ type: "essay" })), "rubric");
  rejects(() => validateKey(item(), { correct: "foreign" }), "unknown option");
});
Deno.test("numeric, short answer, multi-select and mapping scoring handle invalid input and partial credit", () => {
  equal(scoreResponse(item({ type: "numeric" }), { numeric: { value: 5, tolerance: .01 } }, "5.005").score, 2);
  equal(scoreResponse(item({ type: "numeric" }), { numeric: { value: 0, tolerance: 0 } }, " ").score, 0);
  equal(scoreResponse(item({ type: "short_answer" }), { correct: ["NEW YORK"] }, " New   York ").score, 2);
  const multi = item({ type: "multi_choice", options: [{ id: "a", text: "A" }, { id: "b", text: "B" }, { id: "c", text: "C" }] });
  equal(scoreResponse(multi, { correct: ["a","b"], partial_credit: true }, ["a"]).score, 1);
  equal(scoreResponse(multi, { correct: ["a","b"], partial_credit: true }, ["a","c"]).score, 0);
  equal(scoreResponse(multi, { correct: ["a","b"], partial_credit: true }, ["a","a"]).score, 0);
  const mapping = item({ type: "gap_fill", response_ids: ["q1","q2"] });
  const key = validateKey(mapping, { correct: { q1: ["five","5"], q2: "six" }, partial_credit: true });
  equal(scoreResponse(mapping,key,{q1:"5",q2:"bad"}).score,1);
  rejects(() => validateKey(mapping, { correct: { q1: "5" } }), "exactly");
});
Deno.test("subjective answers always need a human score", () => {
  for (const type of ["essay","audio_response","video_response","file_response"] as const) equal(scoreResponse(item({type,rubric_id:id(9)}),{},"anything"),{score:null,max_score:2,status:"needs_human"});
});
Deno.test("forms persist selection and permutations without scoring keys", async () => {
  const definition = validateDefinition({ schema_version: "assessment.definition.v1", title: "Placement", locale: "uz", duration_seconds: 600, shuffle_items: true, shuffle_options: true, sections: [{ id: id(4), title: "Math", item_version_ids: [id(1),id(2),id(3)], draw_count: 2 }] });
  const pool = [1,2,3].map(n => ({ id: id(n), item: item(), key: { correct: "b" }, approved_by: id(5), created_by: id(6) }));
  const form = buildManifest(id(8),definition,pool,()=>0);
  equal(form.sections[0].items.length,2);
  equal(form.sections[0].items[0].item.options![0].id,"b");
  equal(JSON.stringify(form).includes('"correct"'),false);
  equal(await hash(form),await hash(JSON.parse(JSON.stringify(form))));
  rejects(() => buildManifest(id(8),definition,pool.slice(1)), "human approval");
  rejects(() => validateDefinition({...definition,sections:[definition.sections[0],definition.sections[0]]}),"Section IDs");
});
Deno.test("published-form draw count defaults and timing constraints are enforced", () => {
  const base = {schema_version:"assessment.definition.v1",title:"Test",locale:"en",duration_seconds:60,sections:[{id:id(1),title:"Part",item_version_ids:[id(2)]}]};
  equal(validateDefinition(base).sections[0].draw_count,1);
  rejects(() => validateDefinition({...base,sections:[{...base.sections[0],draw_count:2}]}),"Draw count");
  rejects(() => validateDefinition({...base,duration_seconds:60.5}),"integer");
});
Deno.test("AI integrity decisions require repeated windows and never invalidate", () => {
  const policy = validatePolicy({schema_version:"proctor.policy.v1",mode:"record_review",identity_level:2,camera:true,auto_pause:true});
  equal(policy.recording_retention_days,90); equal(policy.identity_retention_days,30);
  equal(integrityAction(policy,{kind:"ml_anomaly",duration_seconds:20,observation_windows:1}),"observe");
  equal(integrityAction(policy,{kind:"ml_anomaly",duration_seconds:20,observation_windows:3}),"reverify");
  equal(integrityAction(policy,{kind:"capture_lost",duration_seconds:9,observation_windows:0}),"observe");
  equal(integrityAction(policy,{kind:"capture_lost",duration_seconds:10,observation_windows:0}),"pause");
});
