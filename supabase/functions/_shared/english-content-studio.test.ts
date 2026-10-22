import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildRegistryRow,
  copySlug,
  mergeMetadata,
  normalizeStudioItem,
  slugify,
  type StudioResult,
} from "./english-content-studio.ts";
import { checkGrammarAnswer } from "./english-grammar.ts";
import { normalizeQuestions } from "./english-reading.ts";
import { parsePoints, parseQuestions as parseImmersionQuestions } from "./english-immersion.ts";
import { parseQuestions as parseListeningQuestions } from "./english-listening.ts";

const fields = (result: StudioResult): string[] => (result.ok ? [] : result.errors.map((error) => error.field));

const ok = (result: StudioResult) => {
  if (!result.ok) throw new Error(`expected ok, got ${JSON.stringify(result.errors)}`);
  return result;
};

const mcq = (prompt: string, answer = 1) => ({
  prompt,
  options: ["First option", "Second option", "Third option"],
  answer_index: answer,
  explanation: "Because the text says so.",
});

Deno.test("reading: a full article becomes a gradable row and a catalog entry", () => {
  const result = ok(normalizeStudioItem("reading", {
    slug: "a2-market-day",
    title: "Market Day",
    level: "a2",
    summary: "A short text about a market.",
    content_markdown: "Every Saturday I go to the market. ".repeat(40),
    category: "Daily life",
    theme: "shopping",
    questions: [mcq("Where does the writer go?", 0), { ...mcq("When?"), skill: "inference" }],
  }, [], { id: "0e0f869d-cd9f-4d1b-ad59-38d5ac12ce60" }));
  assertEquals(result.parent.level, "A2");
  assertEquals(result.parent.status, "draft");
  assertEquals(result.parent.tone, "mint");
  const questions = result.parent.questions as Array<Record<string, unknown>>;
  assertEquals(questions.map((q) => q.id), ["q1", "q2"]);
  assertEquals(questions[1]!.skill, "reading.inference");
  assertEquals(normalizeQuestions(questions).length, 2);
  assertEquals(result.registry.content_type, "reading.article");
  assertEquals(result.registry.source_ref, "a2-market-day");
  assertEquals(result.registry.difficulty, 0.3);
  assertEquals(result.registry.status, "draft");
  assertEquals(result.registry.payload_json.reading_article_id, "0e0f869d-cd9f-4d1b-ad59-38d5ac12ce60");
  assertEquals(result.registry.payload_json.question_count, 2);
  assertEquals(result.registry.estimated_minutes, Number(result.parent.read_time_minutes) + 3);
});

Deno.test("common fields: slug, level, status and title are checked", () => {
  const result = normalizeStudioItem("reading", {
    slug: "Bad Slug!",
    title: "",
    level: "D1",
    status: "live",
    summary: "s",
    content_markdown: "text",
    category: "c",
    theme: "t",
  }, []);
  const got = fields(result);
  for (const field of ["slug", "title", "level", "status"]) assert(got.includes(field), `missing ${field} in ${got}`);
});

Deno.test("reading: a question's answer must be one of its options", () => {
  const result = normalizeStudioItem("reading", {
    slug: "a1-x",
    title: "X",
    level: "A1",
    summary: "s",
    content_markdown: "text",
    category: "c",
    theme: "t",
    questions: [
      { prompt: "Q?", options: ["a", "b"], answer_index: 2 },
      { prompt: "Q2?", options: ["only one"], answer_index: 0 },
      { prompt: "Q3?", options: ["same", "Same"], answer_index: 0 },
      { prompt: "Q4?", options: ["a", "b"], answer_index: 0, skill: "spelling" },
    ],
  }, []);
  const got = fields(result);
  assert(got.includes("questions[0].answer_index"));
  assert(got.includes("questions[1].options"));
  assert(got.includes("questions[2].options"));
  assert(got.includes("questions[3].skill"));
});

Deno.test("listening: segments are ordered and focus phrases must be in the text", () => {
  const item = {
    slug: "b1-bus-change",
    title: "Bus change",
    level: "B1",
    status: "published",
    summary: "An announcement.",
    transcript_text: "The number 12 bus now leaves from stop C. Please check the screen.",
    category: "Travel",
    tags: "transport, buses",
    questions: [mcq("Which stop?")],
  };
  const result = ok(normalizeStudioItem("listening", item, [
    { segment_text: "The number 12 bus now leaves from stop C.", focus_phrase: "stop C" },
    { segment_text: "Please check the screen.", starts_at_seconds: 4, ends_at_seconds: 6 },
  ]));
  assertEquals(result.children.map((s) => s.segment_index), [0, 1]);
  assertEquals(result.parent.tags, ["transport", "buses"]);
  assertEquals(parseListeningQuestions(result.parent.questions).length, 1);
  assertEquals(result.registry.payload_json.question_count, 1);
  assertEquals(result.registry.subskill_keys[0], "listening.word_recognition");

  const bad = normalizeStudioItem("listening", { ...item, questions: [], audio_url: "ftp://x" }, [
    { segment_text: "Hello there.", focus_phrase: "goodbye" },
    { segment_text: "", starts_at_seconds: 5, ends_at_seconds: 2 },
  ]);
  const got = fields(bad);
  for (const field of ["questions", "audio_url", "children[0].focus_phrase", "children[1].segment_text", "children[1].ends_at_seconds"]) {
    assert(got.includes(field), `missing ${field} in ${got}`);
  }
});

Deno.test("writing: checklist points become guidance lines and keyword lists", () => {
  const result = ok(normalizeStudioItem("writing", {
    slug: "a2-invite-a-friend",
    title: "Invite a friend",
    level: "A2",
    prompt_text: "Write a message to invite a friend to your birthday.",
    genre: "message",
    audience: "A friend",
    checklist: [
      { point: "Say when the party is", keywords: ["saturday", "o'clock"] },
      { point: "Say where it is", keywords: [] },
    ],
    target_vocabulary: ["party", "invite"],
    expected_length_min: 30,
    expected_length_max: 60,
    metadata: { seeded_by: "x", audience: "old" },
  }, []));
  assertEquals(result.parent.guidance_text, "- Say when the party is\n- Say where it is");
  assertEquals(result.parent.metadata, { seeded_by: "x", audience: "A friend", checklist_keywords: [["saturday", "o'clock"], []] });
  assertEquals(result.metadataSource, "provided");
  assertEquals(result.registry.estimated_minutes, 8);
  assertEquals(result.registry.payload_json.expected_length_min, 30);

  const bad = normalizeStudioItem("writing", {
    slug: "a2-x",
    title: "X",
    level: "A2",
    status: "published",
    prompt_text: "Write.",
    genre: "message",
    expected_length_min: 80,
    expected_length_max: 40,
  }, []);
  const got = fields(bad);
  assert(got.includes("expected_length_max"));
  assert(got.includes("checklist"));
});

Deno.test("speaking: cue points keep their keywords in order; unknown types are rejected", () => {
  const result = ok(normalizeStudioItem("speaking", {
    slug: "a1-my-room",
    title: "My room",
    level: "A1",
    prompt_text: "Describe your room.",
    prompt_type: "guided_response",
    task_type: "describe",
    target_duration_seconds: 45,
    cues: [{ text: "what is in it", keywords: ["bed", "table"] }, { text: "what you like" }],
    model_answer: "My room is small. I have a bed and a table.",
  }, []));
  assertEquals(result.parent.cue_points, ["what is in it", "what you like"]);
  assertEquals(result.parent.metadata, {
    task_type: "describe",
    cue_keywords: [["bed", "table"], []],
    model_answer: "My room is small. I have a bed and a table.",
  });
  assertEquals(result.registry.estimated_minutes, 5);
  assertEquals(result.registry.tags, ["describe"]);

  const bad = normalizeStudioItem("speaking", {
    slug: "a1-x",
    title: "X",
    level: "A1",
    status: "published",
    prompt_text: "Talk.",
    prompt_type: "monologue",
    task_type: "sing",
    target_duration_seconds: 5,
    cues: [],
  }, []);
  const got = fields(bad);
  for (const field of ["prompt_type", "task_type", "target_duration_seconds", "cues"]) assert(got.includes(field), `missing ${field}`);
});

Deno.test("grammar: drills are graded by the learner checker", () => {
  const result = ok(normalizeStudioItem("grammar", {
    slug: "past-simple-regular",
    title: "Past simple: regular verbs",
    level: "A2",
    status: "published",
    focus_area: "past-simple",
    explanation_text: "Add -ed to talk about finished actions.",
    examples: [{ bad: "I walk yesterday.", good: "I walked yesterday." }],
    tags: ["past simple"],
  }, [
    { drill_type: "fill", prompt_text: "Yesterday I ___ (play) football.", accepted_answers: ["played football"] },
    { drill_type: "error_correction", prompt_text: "She watch TV last night.", accepted_answers: ["She watched TV last night."] },
  ]));
  assertEquals(result.children.map((d) => d.sort_order), [10, 20]);
  assertEquals(result.children[0]!.target_skill_key, "grammar.past-simple");
  assertEquals(result.children[0]!.title, "Fill the gap");
  const fill = result.children[0]!;
  const accepted = (fill.expected_answer_json as { accepted_answers: string[] }).accepted_answers;
  assert(checkGrammarAnswer({ prompt: String(fill.prompt_text), accepted, response: "played" }).correct);
  assertEquals(result.registry.subskill_keys, ["grammar.accuracy", "grammar.past-simple", "grammar.transfer"]);
  assertEquals(result.registry.payload_json.examples, [{ bad: "I walk yesterday.", good: "I walked yesterday." }]);
});

Deno.test("grammar: fill drills need a gap and an answer; corrections must change the sentence", () => {
  const result = normalizeStudioItem("grammar", {
    slug: "x-unit",
    title: "X",
    level: "B1",
    status: "published",
    focus_area: "Present Simple!",
    explanation_text: "e",
  }, [
    { drill_type: "fill", prompt_text: "No gap here.", accepted_answers: ["x"] },
    { drill_type: "fill", prompt_text: "I ___ here.", accepted_answers: [] },
    { drill_type: "error_correction", prompt_text: "He go home.", accepted_answers: ["he go home"] },
    { drill_type: "recognition", prompt_text: "Pick one.", accepted_answers: ["a"], status: "draft" },
  ]);
  const got = fields(result);
  for (const field of [
    "focus_area",
    "children[0].prompt_text",
    "children[1].accepted_answers",
    "children[2].accepted_answers",
    "children[3].drill_type",
  ]) assert(got.includes(field), `missing ${field} in ${got}`);
});

Deno.test("grammar: a published unit needs a published drill", () => {
  const result = normalizeStudioItem("grammar", {
    slug: "x-unit",
    title: "X",
    level: "B1",
    status: "published",
    focus_area: "tense",
    explanation_text: "e",
  }, []);
  assertEquals(fields(result), ["children"]);
  assert(normalizeStudioItem("grammar", { slug: "x-unit", title: "X", level: "B1", focus_area: "tense", explanation_text: "e" }, []).ok);
});

Deno.test("immersion: steps map to kinds, keys and the learner's answer shapes", () => {
  const result = ok(normalizeStudioItem("immersion", {
    slug: "hotel-late-check-in",
    title: "Hotel: a late check-in",
    level: "B1",
    status: "published",
    context_text: "Your train is late and you will reach the hotel after midnight.",
    objective_text: "Read the policy, then email the hotel.",
    mission_type: "travel",
    success_conditions: "Understand the policy\nWrite a clear email",
  }, [
    {
      kind: "read",
      title: "Read the policy",
      instructions: "Read and answer.",
      prompt_text: "Reception is open until 23:00.",
      questions: [{ prompt: "Until when?", options: ["22:00", "23:00"], answer_index: 1 }],
      estimated_minutes: 3,
    },
    {
      kind: "listen",
      title: "Listen",
      instructions: "Listen.",
      prompt_text: "Hello, this is reception.",
      accent: "gb",
      questions: [{ prompt: "Who calls?", options: ["Reception", "A friend"], answer: 0 }],
      estimated_minutes: 2,
    },
    {
      kind: "reply",
      title: "Email the hotel",
      instructions: "Write an email.",
      prompt_text: "Hotel: How can we help?",
      goal: "Explain you will be late and ask for a key.",
      points: [{ label: "say you will be late", any: ["late", "after midnight"] }],
      model_answer: "I will arrive after midnight. Could you leave a key?",
      estimated_minutes: 4,
    },
  ]));
  assertEquals(result.children.map((s) => [s.step_index, s.step_type, s.service_key]), [
    [0, "read", "reading"],
    [1, "listen", "listening"],
    [2, "reply", "writing"],
  ]);
  assertEquals(result.children[1]!.metadata, { accent: "gb" });
  assertEquals(parseImmersionQuestions(result.children[0]!.expected_answer_json)[0]!.answer, 1);
  assertEquals(parsePoints(result.children[2]!.expected_answer_json).length, 1);
  assertEquals(result.parent.skill_mix, ["reading", "listening", "writing"]);
  assertEquals(result.parent.success_conditions_json, ["Understand the policy", "Write a clear email"]);
  assertEquals(result.registry.estimated_minutes, 9);
  assertEquals(result.registry.payload_json.step_count, 3);
});

Deno.test("immersion: replies need a goal and checkable points; choice steps need questions", () => {
  const result = normalizeStudioItem("immersion", {
    slug: "x-mission",
    title: "X",
    level: "A2",
    context_text: "c",
    objective_text: "o",
    mission_type: "holiday",
  }, [
    { kind: "read", title: "R", instructions: "i", prompt_text: "p", questions: [] },
    { kind: "speak", title: "S", instructions: "i", prompt_text: "p", points: [{ label: "greet", any: [] }], min_words: 1 },
    { kind: "dance", title: "D", instructions: "i", prompt_text: "p" },
  ]);
  const got = fields(result);
  for (const field of [
    "mission_type",
    "children[0].questions",
    "children[1].goal",
    "children[1].points[0].any",
    "children[1].min_words",
    "children[2].kind",
  ]) assert(got.includes(field), `missing ${field} in ${got}`);
});

Deno.test("vocabulary: words are unique and a published set has at least four", () => {
  const words = ["cup", "plate", "fork", "spoon"].map((word) => ({ word, definition: `a ${word}`, part_of_speech: "noun" }));
  const result = ok(normalizeStudioItem("vocabulary", {
    slug: "a1-kitchen",
    title: "Kitchen",
    level: "A1",
    status: "published",
    topic: "Home",
    description: "Things in the kitchen.",
  }, words));
  assertEquals(result.children.map((w) => w.sort_order), [1, 2, 3, 4]);
  assertEquals(result.parent.topic, "home");
  assertEquals(result.registry.payload_json, { topic: "home", word_count: 4 });
  assertEquals(result.registry.tags, ["home"]);
  assertEquals("presentation_meta" in result.parent, false);

  const bad = normalizeStudioItem("vocabulary", {
    slug: "a1-kitchen",
    title: "Kitchen",
    level: "A1",
    status: "published",
    topic: "home",
    description: "d",
  }, [{ word: "Cup", definition: "x" }, { word: "cup ", definition: "" }, { id: "nope", word: "pan", definition: "p" }]);
  const got = fields(bad);
  for (const field of ["children[1].word", "children[1].definition", "children[2].id", "children"]) {
    assert(got.includes(field), `missing ${field} in ${got}`);
  }
});

Deno.test("child ids are kept when valid", () => {
  const id = "5b8e2a3c-1d4f-4a6b-9c8d-7e6f5a4b3c2d";
  const result = ok(normalizeStudioItem("vocabulary", {
    slug: "a1-k",
    title: "K",
    level: "A1",
    topic: "home",
    description: "d",
  }, [{ id, word: "cup", definition: "a cup" }]));
  assertEquals(result.children[0]!.id, id);
});

Deno.test("metadata: stored keys survive unless the editor sends the whole object", () => {
  const stored = { seeded_by: "seed", audience: "old", checklist_keywords: [["a"]] };
  assertEquals(mergeMetadata(stored, { audience: "new" }, ["audience", "checklist_keywords"], "default"), {
    seeded_by: "seed",
    audience: "new",
  });
  assertEquals(mergeMetadata(stored, { audience: "new" }, ["audience", "checklist_keywords"], "provided"), { audience: "new" });
});

Deno.test("slug helpers", () => {
  assertEquals(slugify("  Café: Late Check-in!  "), "cafe-late-check-in");
  assertEquals(copySlug("a1-family", []), "a1-family-copy");
  assertEquals(copySlug("a1-family", ["a1-family-copy", "a1-family-copy-2"]), "a1-family-copy-3");
});

Deno.test("registry rows mirror the seed conventions for every skill", () => {
  assertEquals(buildRegistryRow("writing", { slug: "c1-x", title: "X", level: "C1", status: "archived", prompt_text: "p" }, []).estimated_minutes, 25);
  const speaking = buildRegistryRow("speaking", { slug: "x", title: "X", level: "B2", status: "published", prompt_text: "p", target_duration_seconds: 90 }, []);
  assertEquals([speaking.difficulty, speaking.estimated_minutes, speaking.status], [0.6, 6, "published"]);
  assertEquals(buildRegistryRow("grammar", { slug: "x", title: "X", level: "A1", focus_area: "to-be", explanation_text: "e" }, []).estimated_minutes, 8);
});
