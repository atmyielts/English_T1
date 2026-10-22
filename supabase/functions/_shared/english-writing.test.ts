import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildWritingAIRequest,
  buildWritingFeedback,
  checkChecklist,
  countWords,
  detectCommonMistakes,
  findInDraft,
  issuesFromFeedback,
  minimumWordsToSubmit,
  normalizeAIFeedback,
  parseChecklist,
  ruleBasedFeedback,
  validateCorrections,
  type WritingPromptSpec,
} from "./english-writing.ts";

const b1Prompt: WritingPromptSpec = {
  title: "Study Alone or With Friends?",
  prompt_text: "Write an opinion paragraph for the class blog: is it better to study alone or with friends?",
  guidance_text: [
    "- Give your opinion in the first sentence",
    "- Give two reasons, with an example for at least one",
    "- Mention one advantage of the other way",
    "- Finish by repeating your opinion in different words",
  ].join("\n"),
  level: "B1",
  genre: "opinion paragraph",
  target_vocabulary: ["concentrate", "motivation", "distract", "advantage", "prefer"],
  expected_length_min: 100,
  expected_length_max: 150,
  checklist_keywords: [
    ["think", "opinion", "believe", "prefer", "better"],
    ["because", "first", "second", "reason", "for example"],
    ["although", "however", "on the other hand", "advantage"],
    ["conclusion", "to sum up", "overall", "that is why"],
  ],
};

const a1Prompt: WritingPromptSpec = {
  title: "A Note for Your Flatmate",
  prompt_text: "Write a note to your flatmate.",
  guidance_text: "- Say where you are going\n- Say when you will be back\n- Ask your flatmate to do one thing\n- Sign the note with your name",
  level: "A1",
  target_vocabulary: ["back", "please", "buy"],
  expected_length_min: 25,
  expected_length_max: 50,
  checklist_keywords: [["going", "market", "shop"], ["back", "#number"], ["can you", "please"], []],
};

const goodB1 = `In my opinion, studying with friends is better than studying alone. First, friends can explain difficult ideas in a simple way. For example, last month my friend helped me understand a hard grammar rule in ten minutes. Second, studying in a group gives me more motivation, because I do not want to let my friends down. Although studying alone has one advantage, because it is quieter and easier to concentrate, I often get bored when I work on my own. My friends also remind me about deadlines and tests. To sum up, I prefer to study with friends because it helps me learn faster and stay motivated every week.`;

Deno.test("word count ignores stray punctuation", () => {
  assertEquals(countWords("  Hello ,  my name - is Aziz. "), 5);
  assertEquals(countWords(""), 0);
});

Deno.test("checklist bullets are parsed one per line", () => {
  assertEquals(parseChecklist("- One\n- Two\n\n* Three"), ["One", "Two", "Three"]);
  assertEquals(parseChecklist(null), []);
});

Deno.test("minimum words to submit is 30% of the target, at least 5", () => {
  assertEquals(minimumWordsToSubmit(25), 8);
  assertEquals(minimumWordsToSubmit(10), 5);
  assertEquals(minimumWordsToSubmit(280), 84);
});

Deno.test("findInDraft returns the exact draft text despite spacing, case and curly quotes", () => {
  const draft = "I don’t  like   it. She go to school.";
  assertEquals(findInDraft(draft, "she go to school"), "She go to school");
  assertEquals(findInDraft(draft, "I don't like it"), "I don’t  like   it");
  assertEquals(findInDraft(draft, "never written"), null);
});

Deno.test("common Uzbek/Russian-speaker mistakes are detected with real quotes", () => {
  const text = "i am agree with you. This is more better for me. I need some informations and advices. "
    + "He don't like it. We discussed about it since two years. I didn't went there. You can to come. People is happy.";
  const { corrections } = detectCommonMistakes(text);
  const byOriginal = new Map(corrections.map((entry) => [entry.original, entry]));
  for (const correction of corrections) assert(text.includes(correction.original), `quote not in text: ${correction.original}`);
  const pairs = corrections.map((entry) => `${entry.original} => ${entry.corrected}`);
  assert(pairs.includes("i am agree => i agree") || pairs.some((pair) => pair.endsWith("agree") && pair.startsWith("i am agree")), pairs.join("\n"));
  assertEquals(byOriginal.get("more better")?.corrected, "better");
  assertEquals(byOriginal.get("informations")?.corrected, "information");
  assertEquals(byOriginal.get("advices")?.corrected, "advice");
  assertEquals(byOriginal.get("He don't")?.corrected, "He doesn't");
  assertEquals(byOriginal.get("discussed about")?.corrected, "discussed");
  assertEquals(byOriginal.get("since two years")?.corrected, "for two years");
  assertEquals(byOriginal.get("didn't went")?.corrected, "didn't go");
  assertEquals(byOriginal.get("can to come")?.corrected, "can come");
  assertEquals(byOriginal.get("People is")?.corrected, "People are");
});

Deno.test("capital letters, spaces and doubled words are detected", () => {
  const text = "yesterday i went to the the park.  then we ate plov ,and it was good";
  const { corrections, counts } = detectCommonMistakes(text);
  for (const correction of corrections) assert(text.includes(correction.original));
  assert(corrections.some((entry) => entry.corrected.includes("Yesterday")), "sentence start");
  assert(corrections.some((entry) => entry.corrected.includes(" I ") || entry.corrected.startsWith("I ") || entry.corrected.endsWith(" I")), "lowercase i");
  assert(corrections.some((entry) => entry.explanation.includes("twice")), "doubled word");
  assert(corrections.some((entry) => entry.corrected.endsWith("good.")), "final full stop");
  assert(counts.punctuation >= 2);
});

Deno.test("correct text has no rule-based corrections", () => {
  const text = "I agree that an hour is enough. Everyone is ready, and we can go to the market at 6 p.m. tomorrow.";
  assertEquals(detectCommonMistakes(text).corrections, []);
  assertEquals(detectCommonMistakes(goodB1).corrections, []);
});

Deno.test("a/an rules skip 'one' and 'university'", () => {
  assertEquals(detectCommonMistakes("It was a one-day trip to a university.").corrections, []);
  const fix = detectCommonMistakes("I ate a apple and an banana.").corrections;
  assertEquals(fix.map((entry) => entry.corrected), ["an apple", "a banana"]);
});

Deno.test("checklist uses stored keyword hints and leaves keyword-less points unknown", () => {
  const items = checkChecklist("I'm going to the market. I will be back at 6. Please buy bread. Aziz", a1Prompt);
  assertEquals(items.map((item) => item.covered), [true, true, true, null]);
  const missing = checkChecklist("Hello. I am at home.", a1Prompt);
  assertEquals(missing.map((item) => item.covered), [false, false, false, null]);
});

Deno.test("basic feedback on a good B1 text scores well and is labelled basic", () => {
  const feedback = ruleBasedFeedback(goodB1, b1Prompt);
  assertEquals(feedback.source, "basic");
  assertEquals(feedback.word_count, countWords(goodB1));
  assert(feedback.word_count >= 100 && feedback.word_count <= 150, `wc ${feedback.word_count}`);
  assertEquals(feedback.checklist.every((item) => item.covered === true), true);
  assert(feedback.overall >= 75, `overall ${feedback.overall}`);
  assert(feedback.criteria.every((entry) => entry.score >= 0 && entry.score <= 100));
  assert(feedback.criteria.find((entry) => entry.key === "grammar")!.score <= 85, "grammar capped without AI");
  assert(feedback.used_words.includes("motivation"));
  assert(feedback.used_words.includes("concentrate"));
  assertEquals(feedback.corrections.length, 0);
  assert(feedback.strengths.length >= 1 && feedback.strengths.length <= 3);
});

Deno.test("basic feedback on a short, error-heavy text scores low and explains why", () => {
  const text = "i am agree study with friends is more better. i need informations";
  const feedback = ruleBasedFeedback(text, b1Prompt);
  assert(feedback.overall < 55, `overall ${feedback.overall}`);
  assert(feedback.criteria.find((entry) => entry.key === "task")!.score <= 50);
  assert(feedback.improvements[0]!.startsWith("Write about"), feedback.improvements[0]);
  assert(feedback.corrections.length >= 3 && feedback.corrections.length <= 6);
  for (const correction of feedback.corrections) assert(text.includes(correction.original));
  assert(feedback.model_sentences.length >= 1);
  assert(feedback.model_sentences[0]!.improved !== feedback.model_sentences[0]!.original);
  assert(feedback.next_step.length > 0);
});

Deno.test("basic feedback flags a text that is too long and repeated words", () => {
  const sentence = "My friends are good and my teacher is good and the library is good for study. ";
  const text = sentence.repeat(14);
  const feedback = ruleBasedFeedback(text, b1Prompt);
  assert(feedback.word_count > 150);
  assert(feedback.improvements.some((entry) => entry.startsWith("Cut about")), feedback.improvements.join(" | "));
  const vocabulary = feedback.criteria.find((entry) => entry.key === "vocabulary")!;
  assert(vocabulary.comment.includes("‘good’"), vocabulary.comment);
});

Deno.test("AI request carries the task, level, checklist and learner text", () => {
  const request = buildWritingAIRequest(goodB1, b1Prompt);
  const payload = JSON.parse(request.userPayload);
  assertEquals(payload.target_level, "B1");
  assertEquals(payload.task_points.length, 4);
  assertEquals(payload.target_length_words, { min: 100, max: 150 });
  assertEquals(payload.learner_text, goodB1);
  assert(request.systemPrompt.includes("copied exactly"));
});

const fakeAI = {
  overall: 72,
  criteria: {
    task: { score: 80, comment: "You answer the question and give two reasons." },
    organisation: { score: "70", comment: "Good order. Add a linking word in the middle." },
    vocabulary: { score: 68, comment: "Good words like 'motivation'." },
    grammar: { score: 140, comment: "A few verb mistakes." },
  },
  strengths: ["Clear opinion at the start.", "Good example from your life.", "Clear opinion at the start.", "Extra one", "Too many"],
  improvements: ["Check your verb forms after 'didn't'.", "Use 'although' to show the other side."],
  corrections: [
    { original: "I am agree", corrected: "I agree", explanation: "Agree is a verb.", category: "Grammar" },
    { original: "this sentence is not in the draft", corrected: "something", explanation: "x", category: "grammar" },
    { original: "informations", corrected: "information", explanation: "Uncountable.", category: "vocab" },
    { original: "studying", corrected: "studying", explanation: "No change", category: "grammar" },
    { original: "friends  helps", corrected: "friends help", explanation: "Plural subject.", category: "weird" },
    { not: "an object with fields" },
    "a string",
  ],
  next_step: "Rewrite your second reason with a clear example.",
  model_sentences: [
    { original: "My friends helps me a lot.", improved: "My friends help me a lot, especially before exams." },
    { original: "Invented sentence that is not there.", improved: "Something." },
  ],
  checklist_covered: [true, true, false, true],
};

// A shorter task so the sample draft is within range (the length guardrail is tested separately).
const aiPrompt: WritingPromptSpec = { ...b1Prompt, expected_length_min: 30, expected_length_max: 80 };

const aiDraft = "I am agree that studying with friends is better. My friends helps me a lot. I got many informations from them. "
  + "Because of this, I have more motivation. Studying alone is quiet. To sum up, I prefer friends.";

Deno.test("AI feedback is validated: scores clamped, fake quotes dropped, lists capped", () => {
  const feedback = normalizeAIFeedback(fakeAI, aiDraft, aiPrompt);
  assert(feedback);
  assertEquals(feedback.source, "ai");
  assertEquals(feedback.criteria.map((entry) => entry.key), ["task", "organisation", "vocabulary", "grammar"]);
  assertEquals(feedback.criteria.find((entry) => entry.key === "grammar")!.score, 100);
  assertEquals(feedback.criteria.find((entry) => entry.key === "organisation")!.score, 70);
  // overall 72 is within 15 of the criteria mean (79.5), so it is kept.
  assertEquals(feedback.overall, 72);
  assertEquals(feedback.strengths, ["Clear opinion at the start.", "Good example from your life.", "Extra one"]);
  const originals = feedback.corrections.map((entry) => entry.original);
  assert(originals.includes("I am agree"));
  assert(originals.includes("informations"));
  assert(originals.includes("friends helps"), originals.join(" | "));
  assert(!originals.includes("this sentence is not in the draft"));
  assert(!originals.includes("studying"));
  for (const correction of feedback.corrections) assert(aiDraft.includes(correction.original));
  assertEquals(feedback.corrections.find((entry) => entry.original === "informations")!.category, "vocabulary");
  assertEquals(feedback.corrections.find((entry) => entry.original === "friends helps")!.category, "grammar");
  assertEquals(feedback.model_sentences, [{ original: "My friends helps me a lot.", improved: "My friends help me a lot, especially before exams." }]);
  assertEquals(feedback.checklist.map((item) => item.covered), [true, true, false, true]);
  assertEquals(feedback.next_step, "Rewrite your second reason with a clear example.");
  assert(feedback.corrections.length <= 6);
});

Deno.test("AI overall far from the criteria is replaced by their mean; 0-10 scales are rescaled", () => {
  const far = normalizeAIFeedback({ ...fakeAI, overall: 20 }, aiDraft, aiPrompt)!;
  assertEquals(far.overall, 80); // mean of 80, 70, 68, 100 = 79.5 → 80
  const tenScale = normalizeAIFeedback({
    overall: 7,
    criteria: { task: { score: 8 }, organisation: { score: 7 }, vocabulary: { score: 6 }, grammar: { score: 7 } },
  }, aiDraft, aiPrompt)!;
  assertEquals(tenScale.criteria.map((entry) => entry.score), [80, 70, 60, 70]);
  assertEquals(tenScale.overall, 70);
});

Deno.test("AI feedback for a far-too-short text is capped", () => {
  const short = "I am agree. Friends are good for study.";
  const feedback = normalizeAIFeedback({ ...fakeAI, overall: 90, criteria: { task: { score: 95 }, organisation: { score: 90 }, vocabulary: { score: 90 }, grammar: { score: 90 } } }, short, b1Prompt)!;
  assert(feedback.criteria.find((entry) => entry.key === "task")!.score <= 50);
  assert(feedback.overall <= 60);
});

Deno.test("unusable AI payloads fall back to basic feedback", () => {
  assertEquals(normalizeAIFeedback(null, aiDraft, b1Prompt), null);
  assertEquals(normalizeAIFeedback({ criteria: { task: { score: 70 } } }, aiDraft, b1Prompt), null);
  assertEquals(buildWritingFeedback(aiDraft, b1Prompt, { status: "ok", data: "not json" }).source, "basic");
  assertEquals(buildWritingFeedback(aiDraft, b1Prompt, { status: "failed", data: fakeAI }).source, "basic");
  assertEquals(buildWritingFeedback(aiDraft, b1Prompt, { status: "unconfigured", data: null }).source, "basic");
  assertEquals(buildWritingFeedback(aiDraft, b1Prompt, { status: "ok", data: fakeAI }).source, "ai");
});

Deno.test("AI criteria arrays and aliases are accepted; missing criterion uses the mean", () => {
  const feedback = normalizeAIFeedback({
    criteria: [
      { key: "Task achievement", score: 60, comment: "ok" },
      { name: "coherence", score: 70 },
      { criterion: "lexical_resource", score: 80 },
    ],
  }, aiDraft, aiPrompt)!;
  assertEquals(feedback.criteria.map((entry) => entry.score), [60, 70, 80, 70]);
  assertEquals(feedback.overall, 70);
});

Deno.test("validateCorrections keeps at most the limit and only real quotes", () => {
  const corrections = validateCorrections([
    { original: "My friends helps", corrected: "My friends help", category: "grammar" },
    { original: "my friends helps", corrected: "My friends help", category: "grammar" },
  ], aiDraft);
  assertEquals(corrections.length, 1);
});

Deno.test("issues map correction categories to writing subskills", () => {
  const feedback = normalizeAIFeedback(fakeAI, aiDraft, aiPrompt)!;
  const issues = issuesFromFeedback(feedback, "study-alone-or-with-friends");
  assert(issues.length >= 3 && issues.length <= 8);
  const agree = issues.find((issue) => String(issue.explanation).startsWith("I am agree"));
  assertEquals(agree?.subskill_key, "writing.grammar");
  assertEquals(agree?.category, "grammar");
  const vocab = issues.find((issue) => String(issue.explanation).startsWith("informations"));
  assertEquals(vocab?.subskill_key, "writing.vocabulary");
});

Deno.test("'explain me X' is reordered naturally and missing apostrophes are fixed", () => {
  const text = "My friend can explain me difficult topics. I dont know why. Please explain me, because it is hard.";
  const pairs = detectCommonMistakes(text).corrections.map((entry) => `${entry.original} => ${entry.corrected}`);
  assert(pairs.includes("explain me difficult topics => explain difficult topics to me"), pairs.join(" | "));
  assert(pairs.includes("dont => don't"), pairs.join(" | "));
  assert(pairs.includes("explain me => explain to me"), pairs.join(" | "));
});

Deno.test("sign-offs do not need a final full stop", () => {
  assertEquals(detectCommonMistakes("I am going to the market. Can you buy bread? Thanks, Aziz").corrections, []);
  assertEquals(detectCommonMistakes("Dear Sir or Madam,\nI am writing to ask about the course.\nYours faithfully,\nAziz Karimov").corrections, []);
  assertEquals(detectCommonMistakes("I will be back at six").corrections.map((entry) => entry.corrected), ["at six."]);
});
