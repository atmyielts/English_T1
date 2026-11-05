import type { Rubric } from '../src/types.ts';
import { cvCalibration } from './calibration-cv.ts';
import { interviewCalibration } from './calibration-interview.ts';
import { letterCalibration } from './calibration-letter.ts';
import { CAREER_SCALE } from './manifest.ts';

// Three rubrics on the career scale (L1 to L5 in half steps): spoken interview answers
// and role-plays, CVs and profiles, and letters and emails. Descriptors are Schood's
// own wording. The learner may answer in Uzbek, Russian or English: every criterion is
// judged in the language used, and language accuracy is judged against that language.

const thresholds = { exact: 0.6, adjacent: 0.95, maxMae: 0.4, maxSpread: 0.5, evidenceValid: 0.9 };

export const rubrics: Rubric[] = [
  {
    id: 'career.interview',
    name: { en: 'Interview answers', uz: 'Suhbatdagi javoblar', ru: 'Ответы на собеседовании' },
    scale: CAREER_SCALE,
    overall: { round: 'step' },
    evidence: { min: 1, max: 3 },
    assessorNotes: 'Judge the answers as an experienced recruiter in Uzbekistan would, in the language the candidate used (Uzbek, Russian or English; switching words between them is normal and not an error). Reward specific, honest, relevant evidence from the candidate\'s own experience, and a clear structure; never reward length for its own sake. Students and first-job candidates may use study, volunteering, family business or part-time work as evidence. Do not judge the candidate\'s real qualifications, and never invent facts about the employer, the market or salaries. For salary negotiation, judge how the candidate negotiates (reasons, calm counter, the whole package, getting terms in writing), not whether the figure is right. For student-visa practice, judge clarity, honesty and consistency of the answers only; any rule or document must come from the supplied facts.',
    criteria: [
      {
        id: 'structure', name: { en: 'Structure (STAR and clear answers)', uz: 'Tuzilma (STAR va aniq javob)', ru: 'Структура (STAR и ясный ответ)' }, short: 'Structure', source: 'model', node: 'interviews.behavioural_star', weight: 1.2,
        focus: 'Whether each answer has a shape the listener can follow: the direct answer first, then support. For behavioural questions (tell me about a time…), look for Situation, Task, Action and Result, with the actions in the first person and a result at the end. For "tell me about yourself", look for present, past and future.',
        descriptors: [
          { score: 1, text: 'No visible structure: a few disconnected sentences, or a question answered with something else. Behavioural questions get a general opinion instead of an example.' },
          { score: 2, text: 'Some order but the point comes late or not at all. Examples are mentioned but without a clear situation or outcome; "we" hides what the candidate did.' },
          { score: 3, text: 'Answers usually start with the point and give one example. STAR is mostly there, but the result is thin or missing in some answers, or the situation takes too long.' },
          { score: 4, text: 'Clear and well ordered. Behavioural answers follow STAR with personal actions and a stated result; the candidate signposts (first…, as a result…) and finishes cleanly.' },
          { score: 5, text: 'Every answer is easy to follow and well proportioned: brief context, the candidate\'s own decisions, a measurable or concrete result and a lesson or link back to the role.' },
        ],
      },
      {
        id: 'relevance', name: { en: 'Relevance to the role', uz: 'Lavozimga mosligi', ru: 'Соответствие роли' }, short: 'Relevance', source: 'model', node: 'interviews.role_specific',
        focus: 'Whether the answers address the actual question and connect the candidate\'s experience to this job and this employer: the skills the role needs, the employer\'s customers or situation, the candidate\'s reasons for applying.',
        descriptors: [
          { score: 1, text: 'Answers miss the question or talk about something unrelated; nothing is connected to the job.' },
          { score: 2, text: 'On topic but generic: could be said for any job. Little or no link between the experience described and what the role needs.' },
          { score: 3, text: 'Answers the questions and makes some links to the role, but the strongest, most relevant examples are not chosen and the employer is barely mentioned.' },
          { score: 4, text: 'Consistently relevant: examples are chosen for this role, and the candidate explains why their experience fits and why this employer.' },
          { score: 5, text: 'Sharply targeted: every answer earns its place, anticipates what the interviewer is checking, and ties the candidate\'s strengths to the role\'s real challenges.' },
        ],
      },
      {
        id: 'evidence', name: { en: 'Evidence and results', uz: 'Dalil va natijalar', ru: 'Доказательства и результаты' }, short: 'Evidence', source: 'model', node: 'interviews.behavioural_star', weight: 1.2,
        focus: 'How specific and believable the evidence is: concrete details, numbers, before and after, time frames, feedback received. Claims such as "I am hard-working" without proof score low. Invented-sounding or inconsistent figures should not be rewarded.',
        descriptors: [
          { score: 1, text: 'Only adjectives about themselves (responsible, friendly) with no example or detail.' },
          { score: 2, text: 'An example is mentioned, but it stays vague: no numbers, no outcome, no detail that shows what really happened.' },
          { score: 3, text: 'Some concrete details or one figure, but results are often general (it went well, the client was happy).' },
          { score: 4, text: 'Specific, credible evidence in most answers: figures, time frames or clear outcomes, with the candidate\'s own contribution visible.' },
          { score: 5, text: 'Rich, precise and consistent evidence throughout: quantified results, honest limits (what did not work), and outcomes that clearly prove the claimed skills.' },
        ],
      },
      {
        id: 'clarity', name: { en: 'Clarity and concision', uz: 'Aniqlik va ixchamlik', ru: 'Ясность и лаконичность' }, short: 'Clarity', source: 'model', node: 'interviews.hr',
        focus: 'Whether the answers are easy to understand and the right length: no long detours, repetition or filler; measured numbers (words per minute, fillers, long pauses) when supplied are facts about delivery, compare them with a comfortable interview pace.',
        descriptors: [
          { score: 1, text: 'Hard to follow: very short fragments or long, circling answers; heavy hesitation or fillers get in the way.' },
          { score: 2, text: 'Understandable with effort; answers ramble or repeat, or are too short to show anything. Fillers and restarts are frequent.' },
          { score: 3, text: 'Generally clear, with some answers too long or with detours; hesitation is noticeable but does not block meaning.' },
          { score: 4, text: 'Clear and to the point; length suits each question; pace comfortable and fillers occasional.' },
          { score: 5, text: 'Crisp and confident: every sentence adds something, answers stop at the right moment, and delivery is fluent and calm.' },
        ],
      },
      {
        id: 'language', name: { en: 'Professional language', uz: 'Professional til', ru: 'Профессиональная речь' }, short: 'Language', source: 'model', node: 'interviews.hr', weight: 0.8,
        focus: 'Register and accuracy in the language used: polite, professional wording, correct use of role vocabulary, grammar that does not distract; no slang, no negative talk about past employers, positive framing of weaknesses and gaps.',
        descriptors: [
          { score: 1, text: 'Inappropriate register (slang, rude or overly casual), or errors so frequent the meaning is often unclear.' },
          { score: 2, text: 'Mostly polite but casual or awkward; frequent errors; negative or defensive phrases about past jobs or weaknesses.' },
          { score: 3, text: 'Appropriate and polite, with some errors and limited professional vocabulary; framing is neutral.' },
          { score: 4, text: 'Professional and accurate, with fitting role vocabulary; challenges and weaknesses are framed constructively.' },
          { score: 5, text: 'Polished and natural: precise professional vocabulary, tact under pressure, and wording that builds trust throughout.' },
        ],
      },
    ],
    calibration: { thresholds, samples: interviewCalibration.samples, runs: interviewCalibration.runs },
  },
  {
    id: 'career.cv',
    name: { en: 'CV and profile', uz: 'Rezyume va profil', ru: 'Резюме и профиль' },
    scale: CAREER_SCALE,
    overall: { round: 'step' },
    evidence: { min: 1, max: 3 },
    assessorNotes: 'Judge the CV, CV section or profile text (LinkedIn, hh.uz) as a recruiter screening it in under a minute, in the language it is written in. Reward achievements over duties, honest figures, tailoring to the stated target role and a scannable structure. Never invent the learner\'s experience: rewrites in upgrades keep their facts and only improve the wording; where a number would help but is missing, say to add a real one rather than inventing it. Personal data such as age, marital status or a photo is the learner\'s choice; mention it only if it crowds out content.',
    criteria: [
      {
        id: 'impact', name: { en: 'Impact (achievements, results)', uz: 'Ta’sir (yutuqlar, natijalar)', ru: 'Влияние (достижения, результаты)' }, short: 'Impact', source: 'model', node: 'materials.cv', weight: 1.3,
        focus: 'Whether lines show what the candidate achieved rather than what the job was: action verbs, outcomes, figures, scope (how many customers, how much, how fast), recognition.',
        descriptors: [
          { score: 1, text: 'Only job titles and duties copied from a job description; nothing the candidate achieved.' },
          { score: 2, text: 'Mostly duties ("responsible for…"); one or two vague achievements without a result.' },
          { score: 3, text: 'A mix: several achievement lines with action verbs, but results are often general and few figures appear.' },
          { score: 4, text: 'Most lines are achievements with clear outcomes and some figures or scope; the strongest results stand out.' },
          { score: 5, text: 'Every line earns its place: quantified, credible results with scope and context, ordered by importance.' },
        ],
      },
      {
        id: 'tailoring', name: { en: 'Tailoring to the target role', uz: 'Maqsadli lavozimga moslash', ru: 'Адаптация под целевую роль' }, short: 'Tailoring', source: 'model', node: 'materials.cv',
        focus: 'Whether the text is aimed at the stated role: a headline or summary for that role, the relevant skills and keywords from the posting, the most relevant experience first, irrelevant detail cut.',
        descriptors: [
          { score: 1, text: 'No target: a general list that could be for any job, or aimed at a different role.' },
          { score: 2, text: 'The target role is named but the content does not follow it; key skills from the posting are missing.' },
          { score: 3, text: 'Partly tailored: a fitting summary and some relevant skills, but relevant experience is buried or unrelated detail remains.' },
          { score: 4, text: 'Clearly tailored: summary, skills and order of content match the role and use its keywords naturally.' },
          { score: 5, text: 'Precisely aimed: a recruiter for this role sees the fit in seconds, and every section supports it.' },
        ],
      },
      {
        id: 'structure', name: { en: 'Structure and readability', uz: 'Tuzilma va o‘qilishi', ru: 'Структура и читаемость' }, short: 'Structure', source: 'model', node: 'materials.cv',
        focus: 'Whether the reader can scan it: clear sections in a sensible order, consistent dates and bullets, short lines, the most important information first, a reasonable length.',
        descriptors: [
          { score: 1, text: 'A block of text or a jumble of sections; dates and roles hard to find.' },
          { score: 2, text: 'Sections exist but in an odd order or with long paragraphs; inconsistent formatting makes scanning slow.' },
          { score: 3, text: 'Readable, standard sections and mostly consistent formatting, with some long lines or misplaced information.' },
          { score: 4, text: 'Clean and scannable: logical order, consistent dates and bullets, concise lines.' },
          { score: 5, text: 'Effortless to scan: tight, consistent, prioritised layout where the key facts jump out.' },
        ],
      },
      {
        id: 'accuracy', name: { en: 'Language accuracy and consistency', uz: 'Til to‘g‘riligi va izchillik', ru: 'Грамотность и единообразие' }, short: 'Accuracy', source: 'model', node: 'materials.cv', weight: 0.8,
        focus: 'Spelling, grammar and punctuation in the language used; consistent tense (past for past roles, present for the current one), one style for bullets and dates, no first-person "I" at the start of lines, correct names of tools and qualifications.',
        descriptors: [
          { score: 1, text: 'Many errors in almost every line; tenses and styles mixed throughout.' },
          { score: 2, text: 'Frequent errors and inconsistent tense or style that a recruiter will notice at once.' },
          { score: 3, text: 'A few errors or inconsistencies; generally careful.' },
          { score: 4, text: 'Accurate and consistent, with at most one or two minor slips.' },
          { score: 5, text: 'Error-free and fully consistent; professional terminology used precisely.' },
        ],
      },
    ],
    calibration: { thresholds, samples: cvCalibration.samples, runs: cvCalibration.runs },
  },
  {
    id: 'career.letter',
    name: { en: 'Letters and emails', uz: 'Xatlar va elektron maktublar', ru: 'Письма' },
    scale: CAREER_SCALE,
    overall: { round: 'step' },
    evidence: { min: 1, max: 3 },
    assessorNotes: 'Judge the cover letter, motivation letter or email (thank-you, follow-up, counter-offer) in the language it is written in, as the hiring manager reading it. Reward a clear purpose, evidence matched to the role, a respectful but confident tone and a concrete next step. Never invent the learner\'s experience or the employer\'s facts; for counter-offers, judge reasons and tone, not whether a figure is right.',
    criteria: [
      {
        id: 'fit', name: { en: 'Fit to the role and reader', uz: 'Lavozim va o‘quvchiga mosligi', ru: 'Соответствие роли и адресату' }, short: 'Fit', source: 'model', node: 'materials.cover_letter', weight: 1.2,
        focus: 'Whether the letter is written for this role, this organisation and this reader: names them, picks the requirements that matter, and explains why this candidate for this job.',
        descriptors: [
          { score: 1, text: 'Could be sent anywhere; the role or organisation is not named or is wrong.' },
          { score: 2, text: 'Names the role but the content is generic; little sense of why this organisation.' },
          { score: 3, text: 'Addresses the role and mentions the organisation, linking to one or two requirements in general terms.' },
          { score: 4, text: 'Clearly written for this role and reader; the key requirements are answered and the motivation is specific.' },
          { score: 5, text: 'Unmistakably personal and targeted: shows understanding of the organisation\'s needs and makes a compelling case for the fit.' },
        ],
      },
      {
        id: 'specifics', name: { en: 'Specific evidence', uz: 'Aniq dalillar', ru: 'Конкретные доказательства' }, short: 'Specifics', source: 'model', node: 'materials.cover_letter', weight: 1.2,
        focus: 'Whether claims are backed by concrete examples, results or details from the candidate\'s experience (or, in an email, the concrete points of the conversation) rather than adjectives.',
        descriptors: [
          { score: 1, text: 'Only adjectives and wishes (I am motivated, I want to grow); no example at all.' },
          { score: 2, text: 'One example, mentioned vaguely, with no result or detail.' },
          { score: 3, text: 'Some concrete examples, though results and details are thin.' },
          { score: 4, text: 'Well-chosen examples with clear results or details that prove the main claims.' },
          { score: 5, text: 'Every claim is proved with precise, relevant evidence; nothing is padding.' },
        ],
      },
      {
        id: 'structure', name: { en: 'Structure', uz: 'Tuzilma', ru: 'Структура' }, short: 'Structure', source: 'model', node: 'materials.cover_letter',
        focus: 'A clear opening that says why the writer is writing, a middle that groups evidence logically, and a close; paragraphs of sensible length; an email subject or first line that states the purpose where relevant.',
        descriptors: [
          { score: 1, text: 'No clear beginning or end; one block or a list of unrelated sentences.' },
          { score: 2, text: 'Some order, but the purpose comes late and paragraphs mix ideas.' },
          { score: 3, text: 'A recognisable opening, body and close; some paragraphs too long or out of order.' },
          { score: 4, text: 'Logical and well paragraphed; the purpose is clear from the start and each paragraph has one job.' },
          { score: 5, text: 'Tightly organised and easy to read; length and order are exactly right for the reader.' },
        ],
      },
      {
        id: 'tone', name: { en: 'Tone and language', uz: 'Ohang va til', ru: 'Тон и язык' }, short: 'Tone', source: 'model', node: 'materials.cover_letter', weight: 0.8,
        focus: 'Respectful, confident and professional in the language used, without begging, flattery, arrogance or clichés; accurate grammar and spelling; the right level of formality for the reader.',
        descriptors: [
          { score: 1, text: 'Inappropriate: demanding, begging, overly casual or full of errors.' },
          { score: 2, text: 'Polite but stiff or cliché-heavy, with frequent errors or swings in formality.' },
          { score: 3, text: 'Appropriate and polite with some clichés or errors.' },
          { score: 4, text: 'Confident, warm and professional; accurate with minor slips at most.' },
          { score: 5, text: 'A natural, persuasive professional voice; error-free and perfectly judged for the reader.' },
        ],
      },
      {
        id: 'action', name: { en: 'Call to action', uz: 'Keyingi qadamga chaqiriq', ru: 'Призыв к действию' }, short: 'Action', source: 'model', node: 'job_search.applications', weight: 0.8,
        focus: 'Whether the letter ends with a clear, polite next step: availability for an interview, a proposed time, what the writer will do next, or (in a negotiation email) the specific terms asked for and how to confirm them.',
        descriptors: [
          { score: 1, text: 'No ending or next step at all.' },
          { score: 2, text: 'A vague ending (hope to hear from you) with nothing the reader can act on.' },
          { score: 3, text: 'A polite next step, though general.' },
          { score: 4, text: 'A clear, specific next step that is easy for the reader to say yes to.' },
          { score: 5, text: 'A confident, concrete close that moves the process forward and leaves nothing unclear.' },
        ],
      },
    ],
    calibration: { thresholds, samples: letterCalibration.samples, runs: letterCalibration.runs },
  },
];
