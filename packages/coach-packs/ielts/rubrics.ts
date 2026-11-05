import type { Descriptor, LevelScale, Rubric, RubricCriterion } from '../src/types.ts';
import { speakingCalibration } from './calibration/speaking.ts';
import { writingTask1Calibration } from './calibration/writing_task1.ts';
import { writingTask2Calibration } from './calibration/writing_task2.ts';

// IELTS rubrics for the B1 coach. Criterion ids match packages/ielts-core rubrics.ts
// (what score-session and grade-writing store). Descriptors are Schood's own wording of
// what each band means; they follow the public band meanings without copying them.
// Criteria are whole bands; the overall is the mean rounded half-up to 0.5, as in IELTS.

const scale: LevelScale = { id: 'ielts_band', min: 1, max: 9, step: 1, decimals: 0 };
const thresholds = { exact: 0.6, adjacent: 0.95, maxMae: 0.5, maxSpread: 1, evidenceValid: 0.9 };

/** Descriptors listed from band 9 down to band 3. */
const bands = (texts: [string, string, string, string, string, string, string]): Descriptor[] =>
  texts.map((text, index) => ({ score: 9 - index, text }));

// --- Speaking --------------------------------------------------------------------------------------

const speakingFluency: RubricCriterion = {
  id: 'fluency_coherence',
  name: { en: 'Fluency and Coherence', uz: 'Ravonlik va izchillik', ru: 'Беглость и связность' },
  short: 'FC',
  source: 'model',
  node: 'speaking.fluency_coherence',
  focus:
    'How long and how easily the learner keeps talking (use the measured words per minute, long pauses and fillers), whether answers are extended with reasons, examples and contrasts, whether ideas come in a clear order, and how flexibly they are linked: from and/but/so up to markers such as that said, on the other hand, which is why. Restarts, repeated words, self-corrections and "what else" searches count against fluency; a short thinking pause before a hard Part 3 question is normal and does not.',
  descriptors: bands([
    'Talk flows like confident conversation in every part of the test. Pauses happen only while the speaker decides what to say next, never while hunting for words. Every answer is fully built out, each idea leads into the next, and signposting is varied and exact (that said, which brings me back to, the flip side is).',
    'Long answers come readily and almost without interruption: a word search or a self-correction appears once or twice, not as a habit. Answers stay on the question, are developed in full and move in a logical order, with well-chosen signposts. Above 7 because language hesitation is the exception rather than a pattern.',
    'Keeps talking at length with no visible strain, even on abstract Part 3 questions, and does not lose the thread. Some hesitation, repetition or self-correction shows up, sometimes because a word is missing, but the line of thought survives it. Markers are varied and used flexibly (on the other hand, I would say, that is why). Above 6 because the flow holds when the ideas get harder.',
    'Ready to give long answers, but the line of thought wobbles now and then through restarts, repeated words or pauses. Several linkers appear, some used by formula (first reason, second) or slightly misused. Ideas are relevant and extended, though not always in the clearest order. Below 7 because the listener notices effort or a lost thread from time to time.',
    'Usually keeps going, but only with the help of repetition, self-correction, slow delivery or a filler every few words. The same few linkers do most of the work (and, but, so, also). Simple ideas come out smoothly; complex ones cause stops. A Part 2 talk may reach the end, but with gaps and "what else" searches.',
    'Answers come with clear pauses and often slowly, with frequent repeats and self-corrections. Sentences are strung together with the same one or two linkers, ideas stay basic and the thread is sometimes lost. Answers are often short: a single sentence in Part 1, or a Part 2 talk that stalls well before two minutes or is padded with silence.',
    'Long silences before and inside most answers. Speech comes as short phrases rather than linked sentences, and ideas rarely get beyond a few words before the speaker stops.',
  ]),
};

const speakingLexis: RubricCriterion = {
  id: 'lexical_resource',
  name: { en: 'Lexical Resource', uz: 'Lug‘at boyligi', ru: 'Лексический запас' },
  short: 'LR',
  source: 'model',
  node: 'speaking.lexical_resource',
  focus:
    'Range and precision of words for the topic; natural collocations and idiomatic phrases used correctly (pace of life, holding me back); wrong word choices and word forms (clever choose); calques from Uzbek or Russian (third course, one time in a week); repetition of the same basic words (good, nice, very very); and whether the learner can paraphrase smoothly when a word is missing.',
  descriptors: bands([
    'Finds the exact word on any topic, personal or abstract, and uses idiom as naturally as a highly skilled user of the language. There is never a visible search for vocabulary.',
    'Vocabulary is broad and nimble: the speaker picks words that carry fine distinctions, and less common or idiomatic items (spend a fortune, the perfect antidote) land correctly almost every time. When a word is missing, the rephrasing is so smooth it goes unnoticed. Above 7 because the ambitious choices are reliably right.',
    'Enough vocabulary to handle unfamiliar and abstract topics, with some less common words and natural word partners (stuck in traffic, barely know) and a sense of which words suit a casual or a serious tone. A few choices are slightly off. Rephrases successfully when a word is missing. Above 6 because words are chosen for precision, not just because they are available.',
    'Has the words to talk at length and be clearly understood, though some are imprecise or wrongly formed. Mostly everyday words plus some topic words (device, battery, guide); rephrasing usually works. Below 7 because less common and idiomatic items are rare or unreliable.',
    'Copes with familiar topics and gets the basic message across on less familiar ones, but the same words keep coming back, translations from the first language appear (one time in a week), and rephrasing works only some of the time. Gaps are visible ("I don\'t know how to say").',
    'Enough words for personal, familiar topics, but anything less familiar comes out as basic meaning only. Wrong word choices are frequent, rephrasing is rarely tried, and a few basic adjectives and intensifiers do all the work (good, kind, very very).',
    'Very simple words, mostly for personal information. On less familiar topics the meaning is often lost or replaced by memorised phrases.',
  ]),
};

const speakingGrammar: RubricCriterion = {
  id: 'grammatical_range_accuracy',
  name: { en: 'Grammatical Range and Accuracy', uz: 'Grammatik xilma-xillik va aniqlik', ru: 'Грамматическое разнообразие и точность' },
  short: 'GRA',
  source: 'model',
  node: 'speaking.grammar',
  focus:
    'The mix of structures (relative clauses, conditionals, passives, perfect and continuous forms, modals, cleft sentences) and the share of sentences that are completely error-free; recurring error patterns (articles, agreement, tense, he/she, verb patterns such as "explain me", "wanted that I"); whether errors cluster inside the complex sentences; whether any error causes misunderstanding. Speech is judged as speech: a natural spoken fragment or a mid-sentence change of plan is not an error.',
  descriptors: bands([
    'Every kind of structure is available and chosen naturally for the purpose. Accuracy is consistent; the only slips are the kind confident speakers make and move past.',
    'Structures of many kinds are combined freely, and nearly every sentence is correct. The odd mistake (one agreement slip in a long answer, a misplaced article) is random, not a habit. Above 7 because errors are too rare to form a pattern.',
    'Complex structures of several kinds (relative clauses, conditionals, passives, perfect forms) come naturally, and many sentences are entirely correct. A few mistakes persist (an article, a preposition, a tense slip, a double comparative), scattered rather than systematic. Above 6 because the complex sentences are mostly right.',
    'Both short and complex sentences appear, but the speaker cannot yet bend them to the purpose. Mistakes are frequent, especially inside longer sentences ("wanted that I study it", "which it improved"), yet the meaning almost always stays clear. Below 7 because accuracy drops as soon as a sentence gets complex.',
    'Short basic sentences are usually right. A few complex structures are attempted, but most of them contain an error, and some errors cause a moment of confusion. Tense, article and agreement mistakes recur (more better, informations is).',
    'Mostly basic sentences, some of them correct; subordinate clauses are rare. Errors are frequent, including in simple verb forms (she go, I am agree, people is, I am remember), and some make the meaning unclear.',
    'Tries basic sentence patterns with little success. Memorised phrases are correct; almost everything outside them contains errors.',
  ]),
};

const speakingPronunciation: RubricCriterion = {
  id: 'pronunciation',
  name: { en: 'Pronunciation', uz: 'Talaffuz', ru: 'Произношение' },
  short: 'P',
  source: 'audio',
  node: 'speaking.pronunciation',
  focus:
    'Rated from the audio only, never from a transcript: how easy the speaker is to understand; individual sounds (w/v, th, final consonants, short and long vowels); word stress; sentence stress, rhythm and chunking into thought groups; intonation that signals meaning; and connected speech. When no audio analysis is available the coach reports pronunciation as not scored.',
  descriptors: bands([
    'Effortless to understand from start to finish. Sounds, stress, rhythm and intonation are controlled precisely and used for fine effects such as emphasis and contrast; the accent never gets in the way.',
    'Easy to understand throughout. Stress, rhythm and intonation are flexible and almost always well controlled; the first-language accent shows at most in a few sounds and never blurs the meaning. Above 7 because lapses are rare and brief.',
    'Generally easy to understand. Stress, intonation and chunking into thought groups are used flexibly most of the time; a few sounds or word stresses are still off, but the listener rarely has to work. Above 6 because the control lasts through long answers.',
    'Usually understood, with several features of pronunciation under partial control. Some sounds and word stresses are wrong (w/v, dropped final consonants, stress on the wrong syllable), which blurs the meaning at times. Below 7 because the listener sometimes has to work to follow.',
    'Stress and intonation sometimes help the meaning, but frequent mispronunciation and flat or evenly stressed delivery make listening tiring. Most of the speech is understood with effort.',
    'Few features of pronunciation are controlled. Frequent mispronunciation and misplaced stress make listening hard work; some words cannot be understood without context.',
    'Much of the speech is hard to understand: sounds, stress and rhythm are controlled only in short, familiar phrases.',
  ]),
};

// --- Writing (shared criteria) -----------------------------------------------------------------------

const writingCoherence: RubricCriterion = {
  id: 'coherence_cohesion',
  name: { en: 'Coherence and Cohesion', uz: 'Izchillik va bog‘lanish', ru: 'Связность и логичность' },
  short: 'CC',
  source: 'model',
  node: 'writing.coherence',
  focus:
    'Overall organisation and paragraphing (one clear central idea per paragraph; in Task 1 a clearly placed overview and grouped data; in letters an opening that states the purpose and a fitting close); logical progression from start to finish; range and accuracy of linking words; referencing and substitution (this, these changes, such, which, the former) instead of repeating the same nouns; and linking that is mechanical or over-used (Firstly, Secondly, Moreover at the start of every sentence).',
  descriptors: bands([
    'The text reads as one effortless line of thought; linking and referencing are so well judged that the reader never notices them. Paragraphs are shaped with real skill.',
    'Ideas follow a logical path from the first sentence to the last. Linkers, pronouns and substitutions are varied and always clear without being showy, and each paragraph does one clear job. Above 7 because there is no noticeable overuse of linkers and no gaps in the linking.',
    'The organisation is logical and the reader always knows where the text is going. Linkers are varied and mostly well used, with a little overuse or underuse; every paragraph has a clear main point, and words such as this, these changes and the latter mostly point clearly back. Above 6 because it reads as one argument or report, not a string of separate points.',
    'The text has a clear overall direction, but the links between and inside sentences are sometimes faulty or formulaic (a linker in every sentence, a "however" with no contrast). Some pronouns are unclear, and paragraphs exist but do not always divide the ideas logically.',
    'Some organisation is visible, but the overall direction is unclear or the paragraphs lack a clear purpose. Linkers are few, wrong or overused, and the same nouns are repeated because pronouns and substitutes are missing. Paragraphs may be absent or not fit their content.',
    'Ideas and information do not follow a coherent order and the text does not move forward. Basic linkers appear but are wrong or repeated; paragraphs are missing or confusing.',
    'No logical order is visible, and the few linking words used rarely show how one idea relates to another.',
  ]),
};

const writingLexis: RubricCriterion = {
  id: 'lexical_resource',
  name: { en: 'Lexical Resource', uz: 'Lug‘at boyligi', ru: 'Лексический запас' },
  short: 'LR',
  source: 'model',
  node: 'writing.lexical_resource',
  focus:
    'Range and precision of vocabulary for this task (trend and comparison language in reports, topic words in essays, functional phrases in letters); collocation (a sharp rise, make a decision, pose a threat); less common items used correctly; style and register (no contractions or slang in academic writing; tone that fits the reader of a letter); spelling and word formation; and repetition of the same words.',
  descriptors: bands([
    'Vocabulary is broad, natural and handled with sophistication; every word is the right one, and any mistake is a rare slip.',
    'Broad vocabulary used with ease to express exact meaning. Less common words and word partners are handled with skill, and mistakes in word choice, spelling or word form are infrequent and minor. Above 7 because the ambitious choices are reliably right.',
    'Vocabulary is varied enough to be precise as well as clear. Some less common words and word partners appear (a marked decline, a deterrent effect) with a feel for style, though a few choices, spellings or word forms go wrong. Above 6 because words are chosen for precision, not just to fill the slot.',
    'Enough vocabulary to do the task. Some less common words are tried, not always accurately, and there are spelling or word-form mistakes that do not stop the reader understanding. Below 7 because precise or less common items are few or unreliable.',
    'Vocabulary only just covers the task. Repetition is noticeable, and mistakes in spelling, word form or word choice may make the reader pause.',
    'Only basic words, used repetitively or in the wrong places. Word forms and spelling are poorly controlled, and the mistakes may tire the reader.',
    'Very few words and expressions, with very little control; mistakes may badly distort the message.',
  ]),
};

const writingGrammar: RubricCriterion = {
  id: 'grammatical_range_accuracy',
  name: { en: 'Grammatical Range and Accuracy', uz: 'Grammatik xilma-xillik va aniqlik', ru: 'Грамматическое разнообразие и точность' },
  short: 'GRA',
  source: 'model',
  node: 'writing.grammar',
  focus:
    'Variety of sentence structures (subordinate and relative clauses, conditionals, passives, participle phrases, comparatives) and the share of sentences that are completely error-free; control of articles, agreement (the number of… is), countable and uncountable nouns, and tenses (past for past data, future forms for projections, the passive for processes); punctuation and sentence boundaries (comma splices, fragments starting with because or which).',
  descriptors: bands([
    'Any structure the writer needs is there and used accurately; a rare slip is the only kind of mistake.',
    'Structures are varied and well controlled, and nearly all sentences are free of error. The few mistakes are occasional and random. Above 7 because errors are too rare to form a pattern.',
    'Complex structures of several kinds are used, and well over half of the sentences are completely correct. Grammar and punctuation are under control, with a few remaining mistakes (an article, a preposition, a comma splice). Above 6 because the complex sentences are mostly right.',
    'Both short and complex sentences appear. Mistakes in grammar and punctuation are noticeable, mostly inside the longer sentences, yet the meaning rarely suffers. Below 7 because roughly half of the sentences or fewer are completely correct.',
    'A narrow set of structures. Complex sentences are attempted but go wrong much more often than simple ones; mistakes are frequent, punctuation may be faulty, and some errors make the reader stop.',
    'Very few structures, with subordinate clauses rare. Some sentences are correct, but mistakes are in the majority and punctuation is often wrong.',
    'Sentence patterns are attempted, but mistakes in grammar and punctuation dominate everything except memorised phrases and often distort the meaning.',
  ]),
};

// --- Writing (task-specific first criterion) ---------------------------------------------------------

const taskAchievement: RubricCriterion = {
  id: 'task_achievement',
  name: { en: 'Task Achievement', uz: 'Topshiriqni bajarish', ru: 'Выполнение задания' },
  short: 'TA',
  source: 'model',
  node: 'writing.task_fulfilment',
  focus:
    'Academic report: is there a clear overview of the main trends, differences or stages; are the key features (highest and lowest values, main changes, crossings, exceptions, the loop or choice in a process) selected and compared; are the figures accurate; is it written as an objective report with no opinions or causes. General Training letter: is the purpose clear from the start, are all three bullet points covered and developed, is the tone consistent and right for the reader. Both: at least 150 words of the learner\'s own text.',
  descriptors: bands([
    'Everything the task asks for is done in full. Report: an insightful overview, and every key feature is chosen, compared and illustrated with accurate figures. Letter: the purpose is unmistakable, each bullet point is developed fully and naturally, and the tone is exactly right throughout.',
    'All parts of the task are handled well. Report: a clear overview, with key features chosen with skill, highlighted and compared using accurate data; anything left out is minor. Letter: every bullet point is fully developed, the purpose is clear and the tone is consistently right. Above 7 because selection and comparison are purposeful all the way through.',
    'Does what the task asks. Report: a clear overview of the main trends, differences or stages, and the key features are picked out and backed with accurate figures, though some could be extended or grouped better. Letter: a clear purpose, a consistent tone and every bullet point covered and highlighted, one perhaps lighter. Above 6 because the key features are identified, not just listed.',
    'Responds to what the task asks, but unevenly. Report: an overview is there and the information chosen is relevant, but key features are reported mechanically, or some details are irrelevant or inaccurate. Letter: every bullet point gets a mention, some thinly; the purpose is generally clear but the tone may slip. Below 7 because the reader has to work out what matters most.',
    'Deals with the task in general, but the format may not suit it. Report: no clear overview, or figures listed one by one without selection; key features are not properly covered and detail may take over; some data is wrong. Letter: the purpose may be unclear, a bullet point is missing or barely touched, or the tone is inconsistent.',
    'An attempt at the task that misses key features or confuses them with details, perhaps in the wrong format. Parts may be unclear, irrelevant, repetitive or inaccurate (misread figures, a wrong trend). Letter: bullet points are left out, the purpose is unclear and the tone may be wrong. A text far under 150 words usually sits here or below.',
    'The task is not really answered: very few relevant points, content that is mostly irrelevant or misread, or so little text that there is hardly an attempt.',
  ]),
};

const taskResponse: RubricCriterion = {
  id: 'task_response',
  name: { en: 'Task Response', uz: 'Topshiriqqa javob', ru: 'Ответ на задание' },
  short: 'TR',
  source: 'model',
  node: 'writing.task_fulfilment',
  focus:
    'Are all parts of the prompt answered (both views and an opinion, both questions of a two-part prompt, a clear verdict on "outweigh", causes and solutions); is there a clear position from the introduction to the conclusion; are the main ideas extended and supported with specific reasons, examples or consequences rather than general claims; does the essay stay on this prompt rather than the general topic; at least 250 words of the learner\'s own text.',
  descriptors: bands([
    'Every part of the prompt is answered in depth and the position is fully worked out. Ideas are relevant, extended and supported throughout; nothing is generic.',
    'Every part of the prompt is answered thoroughly, with a clear and well-developed position. Ideas are relevant, extended and backed up; at most one point is over-generalised or more lightly supported. Above 7 because the development is specific all the way through.',
    'Every part of the prompt is answered, and the writer\'s view is clear from the introduction to the conclusion. Main ideas are extended and supported, though some may generalise too much or drift. Above 6 because each part gets real development and the view never wavers.',
    'Each part of the prompt gets an answer, but the coverage is lopsided: one part is developed and another only touched. The view is relevant, but the conclusion may be vague, repetitive or not quite match the body. Main ideas are relevant, though some lack development or clarity (claims without examples, examples without explanation). Below 7 because development is uneven.',
    'Only part of the prompt is answered: one part is missing or thin, or the essay drifts to the general topic. A view appears but is not always clear or consistent; main ideas are few, underdeveloped or padded with irrelevant detail; there may be no real conclusion.',
    'Responds to the task only minimally or from the side. The view is unclear, and main ideas are hard to find, repeated, irrelevant or unsupported. Essays far under 250 words usually sit here or below.',
    'No part of the prompt is answered adequately. There is no clear view, and the few ideas are largely undeveloped or irrelevant.',
  ]),
};

// --- Assessor rules -----------------------------------------------------------------------------------

/** An intro line, then the numbered rules. */
const rules = (intro: string, lines: string[]): string => [intro, ...lines.map((line, index) => `${index + 1}. ${line}`)].join('\n');

const speakingNotes = rules('You rate an IELTS Speaking answer from a speech-to-text transcript plus measured fluency numbers. Rules:', [
  'Score only what is in the learner\'s own words. Do not reward ideas they did not say or fill gaps with what they probably meant.',
  'Give fluency_coherence, lexical_resource and grammatical_range_accuracy a whole band from 1 to 9: the band whose description fits best overall. When an answer sits between two bands, give the lower one unless the features of the higher band are clearly present. Never inflate to encourage; an accurate band with a clear next step helps more than a generous one.',
  'Evidence: for each criterion give 1 to 3 short quotes copied word for word from the transcript (same words in the same order, fillers and errors included). Never correct, paraphrase or invent a quote. Pick quotes that justify the band: an error pattern, a precise collocation, a linking device, a hesitation.',
  'Pronunciation cannot be judged from a transcript. Do not score it and do not comment on accent. A word that looks like a speech-to-text mistake (a homophone, a misheard name) is not a learner error; ignore it for vocabulary and grammar.',
  'Fluency: use the measured numbers (words per minute, long pauses, fillers, seconds) together with the transcript. A rough guide for connected answers: under about 85 wpm with many long pauses fits band 4 or below; about 90 to 110 wpm with frequent fillers fits 5; about 110 to 130 with some hesitation fits 6; about 125 to 145 with little hesitation fits 7; about 140 or more with almost none fits 8 or 9. Speed never raises a band by itself: fast speech that is repetitive, disorganised or off the point is rated by its coherence. More than about 8 fillers per minute usually rules out band 7.',
  'Length: a Part 1 answer should be two or three sentences; a one-sentence answer cannot show fluency above band 5. A Part 2 talk should last one to two minutes; a talk under 60 seconds rarely shows fluency above 5. Part 3 answers should be developed with reasons, examples and comparisons.',
  'Off-topic or memorised answers: rate only the parts that answer the question asked. If an answer sounds recited (written-style phrasing, a chain of idioms unrelated to the question, a sudden jump in level between the script and the natural parts), rate the learner\'s natural language and say that the answer sounded memorised. A script does not show real range.',
  'Too short to rate: if a Part 1 answer has fewer than about 8 meaningful words, a Part 2 talk fewer than about 40, or the transcript is mostly noise or another language, do not guess a band. Say it is too short to rate and ask the learner to answer again.',
  'Uzbek- and Russian-speaking learners often drop articles, mix he and she, overuse the present continuous and translate word for word. Rate these as the errors they are, with no extra penalty for being typical.',
  'In feedback name the one or two features that decided each band and the single change that would move it up one band.',
]);

const writingCommonRules = [
  'Evidence: for each criterion give 1 to 3 short quotes copied word for word from the learner\'s text (same words in the same order, errors included). Never correct, paraphrase or invent a quote. Pick quotes that justify the band.',
  'Score only what the learner wrote. Do not reward ideas that are implied but not written, and do not judge ideas by whether you agree with them.',
  'Text read from a photo may contain recognition errors; ignore obvious ones (rn read as m, a missing space), but a spelling mistake the learner clearly made counts.',
  'Text copied from the prompt does not count towards the word total or show the learner\'s own vocabulary and grammar. Memorised template sentences that would fit any task show no real range.',
  'Never inflate. When a text sits between two bands, give the lower one unless the features of the higher band are clearly present.',
  'In feedback name the one or two features that decided each band and the single change that would move it up one band.',
];

const task1Notes = rules('You rate an IELTS Writing Task 1 response: an Academic report on a chart, table, map or process, or a General Training letter. Give task_achievement, coherence_cohesion, lexical_resource and grammatical_range_accuracy a whole band from 1 to 9 each. Rules:', [
  'Academic reports: check every figure against the task data. Misreported numbers, wrong trends and invented data count against task_achievement. A clear overview of the main trends, differences or stages is essential: with no overview, task_achievement is 5 at most. A number-by-number listing without selection or comparison is 5 at most. Opinions, causes or predictions that are not in the data are irrelevant. Shares (%) must not be described as amounts, and a single-year chart must not be described as change over time.',
  'General Training letters: the purpose must be clear early; each of the three bullet points must be covered; the tone must fit the reader (formal for "Dear Sir or Madam" with "Yours faithfully"; polite semi-formal for a named person known through work; warm and informal for a friend). A missing bullet point limits task_achievement to 5; an unsuitable or inconsistent tone usually limits it to 6.',
  'Length: count only the learner\'s own words. Under 150 words lowers task_achievement, usually by one band, more when far below (under about 100 words: 4 at most). Length above 150 is not rewarded by itself. Under about 50 words, or a text that does not refer to the task\'s data or situation at all: do not score; say it is too short or off the task and ask for a new attempt.',
  ...writingCommonRules,
]);

const task2Notes = rules('You rate an IELTS Writing Task 2 essay. Give task_response, coherence_cohesion, lexical_resource and grammatical_range_accuracy a whole band from 1 to 9 each. Rules:', [
  'Read the prompt type and check that every part is answered: discuss both views and give an opinion; agree or disagree with a clear extent; say whether advantages outweigh disadvantages; give causes and solutions; answer both questions of a two-part prompt. A missing part limits task_response to 5. No identifiable position where one is required limits it to 5. An essay about the general topic instead of this prompt is 5 at most, and one that answers a different question (a memorised essay) is 4 at most.',
  'Development: main ideas must be extended with reasons and specific examples. Claims without support, or lists of reasons with no explanation, hold task_response at 6 or below. A position that changes between introduction, body and conclusion is a weakness (6 at most).',
  'Length: count only the learner\'s own words. Under 250 words lowers task_response, usually by one band, more when far below (under about 180 words: 4 at most). Length above 250 is not rewarded by itself. Under about 80 words, or a text unrelated to the prompt: do not score; say it is too short or off the task and ask for a new attempt.',
  'Organisation: no paragraphing at all limits coherence_cohesion to 5. A linker at the start of almost every sentence is mechanical cohesion, not range.',
  ...writingCommonRules,
]);

// --- Rubrics ------------------------------------------------------------------------------------------

export const rubrics: Rubric[] = [
  {
    id: 'ielts.speaking',
    name: { en: 'IELTS Speaking (Parts 1–3)', uz: 'IELTS Speaking (1–3-qismlar)', ru: 'IELTS Speaking (части 1–3)' },
    scale,
    criteria: [speakingFluency, speakingLexis, speakingGrammar, speakingPronunciation],
    overall: { round: 'half_up', step: 0.5 },
    evidence: { min: 1, max: 3 },
    assessorNotes: speakingNotes,
    calibration: { thresholds, samples: speakingCalibration.samples, runs: speakingCalibration.runs },
  },
  {
    id: 'ielts.writing_task1',
    name: { en: 'IELTS Writing Task 1', uz: 'IELTS Writing Task 1', ru: 'IELTS Writing Task 1' },
    scale,
    criteria: [taskAchievement, writingCoherence, writingLexis, writingGrammar],
    overall: { round: 'half_up', step: 0.5 },
    evidence: { min: 1, max: 3 },
    assessorNotes: task1Notes,
    calibration: { thresholds, samples: writingTask1Calibration.samples, runs: writingTask1Calibration.runs },
  },
  {
    id: 'ielts.writing_task2',
    name: { en: 'IELTS Writing Task 2', uz: 'IELTS Writing Task 2', ru: 'IELTS Writing Task 2' },
    scale,
    criteria: [taskResponse, writingCoherence, writingLexis, writingGrammar],
    overall: { round: 'half_up', step: 0.5 },
    evidence: { min: 1, max: 3 },
    assessorNotes: task2Notes,
    calibration: { thresholds, samples: writingTask2Calibration.samples, runs: writingTask2Calibration.runs },
  },
];
