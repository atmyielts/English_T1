import type { Rubric } from '../src/types.ts';
import { conversationCalibration } from './calibration.ts';
import { CEFR_SCALE } from './manifest.ts';

// One rubric for every role-play: spoken interaction from A2 (2) to C1 (5) on the
// CEFR scale in half steps. Descriptors are Schood's own wording, aligned in meaning
// with the CEFR scales for spoken production and interaction.

export const rubrics: Rubric[] = [
  {
    id: 'speaking.conversation',
    name: { en: 'Conversation', uz: 'Suhbat', ru: 'Разговор' },
    scale: CEFR_SCALE,
    overall: { round: 'step' },
    evidence: { min: 1, max: 3 },
    criteria: [
      {
        id: 'range',
        name: { en: 'Vocabulary range', uz: 'Lug‘at boyligi', ru: 'Словарный запас' },
        short: 'Range',
        source: 'model',
        node: 'conversation.range',
        focus: 'How many and how well-chosen words and phrases the learner uses for this situation: everyday nouns and verbs, set phrases (Could I…, I’m afraid…), collocations, phrasal verbs, softeners and idioms. Notice repetition, gaps the learner stops at, words borrowed from another language, false friends, and how well gaps are covered by paraphrase. Range is about choice, not grammar.',
        descriptors: [
          { score: 2, text: 'Basic everyday words and a few memorised phrases for immediate needs (food, prices, directions, family). Often lacks the word and stops, repeats the same few words, or uses very general ones (good, problem, do). Messages are short because the vocabulary runs out.' },
          { score: 2.5, text: 'Enough words for routine exchanges on familiar topics. Uses some fixed phrases correctly (Could I have…, How much is…) and simple linkers (and, but, because). Still talks around missing words, with noticeable repetition and occasional borrowed or invented words.' },
          { score: 3, text: 'Enough vocabulary to talk about familiar topics such as work, travel, health and plans, and to explain a simple problem, using some circumlocution. Wrong word choices (make/do, say/tell) and false friends appear, but the meaning usually gets through.' },
          { score: 3.5, text: 'A wider everyday range that fits the situation (refund, appointment, deadline, connection), some phrasal verbs and polite set phrases used naturally. Paraphrases successfully when a word is missing. Repetition is still noticeable in longer turns.' },
          { score: 4, text: 'A good range for most everyday and work topics. Varies wording to avoid repetition, gives opinions, compares options and argues a point with suitable words and collocations. Occasional wrong word choices do not get in the way.' },
          { score: 4.5, text: 'Precise and varied. Uses idiomatic expressions and softening language (the thing is…, I’m not sure that would work) appropriately and adjusts register to the person (manager, client, friend). Gaps are rare and filled quickly by paraphrase.' },
          { score: 5, text: 'A broad repertoire used flexibly and precisely, including idioms and nuanced expressions to hedge, persuade and show tact. Word choice fits the person and the moment; gaps are so rare and so smoothly covered that the listener hardly notices.' },
        ],
      },
      {
        id: 'accuracy',
        name: { en: 'Grammar accuracy', uz: 'Grammatik aniqlik', ru: 'Грамматическая точность' },
        short: 'Accuracy',
        source: 'model',
        node: 'conversation.accuracy',
        focus: 'How correctly the learner builds sentences, and how much of the grammar is simple or complex. Count the typical errors of Uzbek and Russian speakers: missing “be” (I student), he/she mix-ups, missing or extra articles, tense choice (since/for with present perfect), question word order, prepositions, plurals of uncountable nouns, “I am agree”. Judge whether errors cause misunderstanding, and give credit for self-correction and for attempting complex structures.',
        descriptors: [
          { score: 2, text: 'Some simple structures are correct, but basic errors are systematic: missing “be”, wrong or missing verb endings, he/she mixed up, no articles, statement order in questions. The meaning is usually clear from the situation, but the listener has to work.' },
          { score: 2.5, text: 'Present and past simple of common verbs are mostly right in short sentences. Errors with articles, plurals, question forms and “be” appear in almost every longer sentence, and tense often has to be guessed from time words.' },
          { score: 3, text: 'Reasonably accurate with frequent patterns in predictable situations. Mistakes with the present perfect, articles and prepositions are common, but the listener rarely misunderstands. Most questions are formed correctly.' },
          { score: 3.5, text: 'Good control of common structures, including the present perfect, future forms, past continuous and modals for requests. Attempts complex sentences (because, if, when, which) with some errors; errors rarely cause confusion.' },
          { score: 4, text: 'Relatively high control. No errors that cause misunderstanding. Mixes simple and complex structures (conditionals, passives, reported speech) with occasional slips, which the learner often notices and corrects.' },
          { score: 4.5, text: 'Consistently good control of a wide range of structures. Slips are infrequent and minor (an article, a preposition, one verb form) and often self-corrected; complex sentences are normal rather than exceptional.' },
          { score: 5, text: 'Consistently high accuracy. Errors are rare, hard to spot and usually corrected straight away. Complex structures (mixed conditionals, cleft sentences, modal perfects, inversion) appear naturally where they fit.' },
        ],
      },
      {
        id: 'fluency',
        name: { en: 'Fluency', uz: 'Ravonlik', ru: 'Беглость' },
        short: 'Fluency',
        source: 'model',
        node: 'conversation.fluency',
        focus: 'How easily the learner keeps talking: the length of turns, how ideas are linked, and hesitation. When measured numbers are supplied (words per minute, long pauses, fillers, seconds), use them alongside the transcript and compare the pace with the band for the level. Hesitation while thinking about ideas is natural; hesitation searching for basic words and forms is not. Look at linkers and discourse markers (because, so, then, actually, anyway, the thing is).',
        descriptors: [
          { score: 2, text: 'Very short turns, often single words or phrases. Frequent long pauses to find words and plan; the other person has to keep the conversation going. Pace is usually well under about 80 words per minute.' },
          { score: 2.5, text: 'Short turns of one to three sentences on familiar topics. Pauses, false starts and restarts are very evident and fillers (ee, um, ну) are frequent, but the learner keeps going in routine exchanges.' },
          { score: 3, text: 'Keeps going comprehensibly, with pauses for planning and repair, especially in longer turns. Links ideas into a simple sequence with and, but, because, so and then.' },
          { score: 3.5, text: 'Speaks with relative ease in turns of several connected sentences. Some pauses to search for words, but they rarely stop the flow; uses a wider set of linkers (actually, after that, anyway, so that).' },
          { score: 4, text: 'Produces stretches of speech at a fairly even tempo with few noticeably long pauses. Explains, gives reasons and develops a point; hesitation comes mainly from looking for the best expression, not basic words.' },
          { score: 4.5, text: 'Fluent at a natural tempo. Develops longer turns with a clear structure and discourse markers; hesitation sounds natural, about ideas rather than language.' },
          { score: 5, text: 'Fluent and spontaneous, almost effortless. Only a conceptually difficult point slows the flow. Long turns are well organised with a range of cohesive devices and a natural rhythm.' },
        ],
      },
      {
        id: 'interaction',
        name: { en: 'Interaction', uz: 'Muloqot', ru: 'Взаимодействие' },
        short: 'Interaction',
        source: 'model',
        node: 'conversation.interaction',
        focus: 'How well the learner manages the conversation with this person to reach the goal: opening and closing, asking and answering questions, follow-up questions, reacting to what was said, asking for repetition or clarification, checking understanding, politeness and register (Could I… rather than Give me…), handling a refusal or an unexpected turn, negotiating and confirming the outcome.',
        descriptors: [
          { score: 2, text: 'Handles very short social exchanges and simple transactions. Answers but rarely asks; may give bare commands (Give me…, I want…) without softening; depends on the other person to move the conversation forward.' },
          { score: 2.5, text: 'Asks and answers simple questions, uses basic politeness (please, thank you, sorry) and a few fixed request forms, and can ask for repetition. Rarely takes the initiative or reacts to what the other person says.' },
          { score: 3, text: 'Starts, keeps going and closes a simple conversation on familiar topics. Asks follow-up questions, makes polite requests, asks for clarification and checks understanding; reaches the goal in routine situations.' },
          { score: 3.5, text: 'Copes with most everyday situations, including unexpected turns (an item not available, a refusal). Explains a problem, complains politely, negotiates a simple solution and reacts to what the other person says.' },
          { score: 4, text: 'Interacts with some spontaneity. Takes turns appropriately, invites the other person’s view, disagrees politely with reasons, negotiates and confirms agreements, and adapts politeness to the person and situation.' },
          { score: 4.5, text: 'Manages the conversation confidently: steers towards the goal, handles objections and tension tactfully, summarises and confirms next steps. Register is consistently appropriate.' },
          { score: 5, text: 'Uses language flexibly for social and professional purposes, including humour, empathy and tact in delicate moments. Builds skilfully on the other person’s contributions and keeps the relationship good while getting the result.' },
        ],
      },
      {
        id: 'pronunciation',
        name: { en: 'Pronunciation', uz: 'Talaffuz', ru: 'Произношение' },
        short: 'Pronunciation',
        source: 'audio',
        node: 'conversation.pronunciation',
        focus: 'Intelligibility first, then sounds, word stress, sentence stress, linking and intonation. Typical issues for Uzbek and Russian speakers: /w/ and /v/, /θ/ and /ð/, short and long vowels (ship/sheep), final consonants, flat intonation in questions and polite requests. Needs the sound itself, so it is not scored from a transcript.',
        descriptors: [
          { score: 2, text: 'A limited set of words and phrases is understandable with some effort. Strong first-language influence on sounds and stress; the listener sometimes needs repetition.' },
          { score: 2.5, text: 'Generally understandable in familiar phrases. Some sounds (/w/–/v/, /θ/, /ð/, final consonants) and word stress are often wrong; speech can sound flat or syllable by syllable.' },
          { score: 3, text: 'Clearly intelligible, though the accent is evident and some words are mispronounced. Uses some linking and contractions in common phrases.' },
          { score: 3.5, text: 'Easy to understand in most stretches. Stress on key words is mostly right; some weak forms and linking; intonation can be flat in longer turns.' },
          { score: 4, text: 'Clear and natural, with sentence stress and intonation that show meaning (questions, lists, contrast, politeness). The accent causes no strain.' },
          { score: 4.5, text: 'Connected speech (linking, weak forms, elision) is natural; intonation conveys attitude such as politeness, surprise or doubt. Mispronunciations are rare.' },
          { score: 5, text: 'Varies intonation and places stress precisely to express fine shades of meaning. Any accent never affects intelligibility.' },
        ],
      },
    ],
    assessorNotes: [
      'You are scoring one role-play on the CEFR scale in half steps: 2 = A2, 2.5 = A2+, 3 = B1, 3.5 = B1+, 4 = B2, 4.5 = B2+, 5 = C1 (1 and 6 exist but are rare).',
      '1. Score only the learner’s own turns. The persona’s words are context, never evidence: do not credit the learner for language the persona used, and do not count a phrase the learner merely repeated straight after the persona as range.',
      '2. Evidence: for every scored criterion give one to three quotes copied word for word from the learner’s turns, as short as possible but long enough to show the point. Never correct, shorten inside, translate or combine quotes from different turns. If you cannot find a quote, the score is not justified.',
      '3. Judge each criterion on its own. A learner with wide vocabulary and many grammar errors gets a high range score and a lower accuracy score.',
      '4. Fluency: when measured numbers are supplied (words per minute, long pauses over two seconds, fillers, seconds of speech), use them together with the transcript and compare the pace with the comfortable band for the level. Do not invent numbers that were not supplied. Without numbers, judge from turn length, linking, restarts and visible fillers.',
      '5. Short answers can still show a level. A transaction that only needs short turns is judged on what the turns show: a precise, natural short reply can be B2; do not drop a score only because the situation required little talk, and do not raise it because a learner talked a lot.',
      '6. Never inflate. When unsure between two scores, choose the lower one and say what would earn the higher one. Kindness belongs in the feedback, not in the score.',
      '7. Typical errors of Uzbek and Russian speakers (missing “be”, he/she, articles, “I am agree”, since/for, question word order, bare commands) are evidence for accuracy or interaction like any other error; do not over-punish one repeated error, and do not ignore a systematic pattern.',
      '8. Interaction is judged against this situation and this person: politeness, register, follow-up questions, reacting, clarifying, handling the persona’s refusal or surprise, and closing with a clear outcome. Achieving the goal through bare commands is not B1 interaction.',
      '9. Pronunciation is not scored from a transcript: report it as not scored.',
      '10. Ignore speech-to-text noise (a misheard word that does not fit the learner’s sentence, missing punctuation). Do not treat it as an error.',
    ].join('\n'),
    calibration: {
      thresholds: { exact: 0.6, adjacent: 0.95, maxMae: 0.35, maxSpread: 0.5, evidenceValid: 0.9 },
      samples: conversationCalibration.samples,
      runs: conversationCalibration.runs,
    },
  },
];
