// Why a mistake happens for Russian and Uzbek speakers.
//
// A hand-written, static library of typical first-language interference
// patterns (no AI). Each note explains the cause in English, Russian and
// Uzbek, shows a short example and, where one fits, links to the grammar
// handbook rule (grammar_units slug, see 20261024123000_english_grammar_handbook.sql).
//
// `matchL1Notes` maps one learner mistake (what they said, the better
// version, the explanation and, when known, the grammar topic) to the notes
// that explain it. A note matches on its specific patterns first; the one
// note marked `generic` for a grammar topic is the fallback when only the
// topic is known. No match is better than a wrong explanation.
//
// Pure module with no imports, so the English app can bundle it too.

export type L1Lang = "en" | "ru" | "uz";
/** Whose first language causes the trap. */
export type L1Speakers = "ru" | "uz" | "both";

type Text3 = Record<L1Lang, string>;

type Match = {
  /** At least one must match the learner's version (lower case). */
  wrong?: RegExp[];
  /** At least one must match the corrected version (lower case). */
  right?: RegExp[];
  /** At least one of these words must have been added by the correction. */
  added?: string[];
  /** At least one of these words must have been removed by the correction. */
  removed?: string[];
  /** Matches the explanation on its own (lower case). */
  explain?: RegExp[];
  /** Grammar topics (english-mistakes.ts) this note belongs to. */
  topics?: string[];
};

export type L1Note = {
  id: string;
  speakers: L1Speakers;
  title: Text3;
  why: Text3;
  examples: Array<{ bad: string; good: string }>;
  /** Grammar handbook rule (grammar_units.slug), when one matches. */
  handbook: string | null;
  /** The fallback note for its first topic when nothing more specific matches. */
  generic?: boolean;
  match: Match;
};

const note = (n: L1Note): L1Note => n;

export const L1_NOTES: readonly L1Note[] = [
  // --- Articles ---------------------------------------------------------
  note({
    id: "articles-none",
    speakers: "both",
    title: { en: "Articles: a, an, the", ru: "Артикли a, an, the", uz: "Artikllar: a, an, the" },
    why: {
      en: "Russian and Uzbek have no articles, so a / an / the feel optional. In English almost every singular countable noun needs one: a for “one of many”, the for “the one we both know”.",
      ru: "В русском языке нет артиклей, поэтому a / an / the кажутся необязательными. В английском почти каждое исчисляемое существительное в единственном числе требует артикля: a — «один из многих», the — «тот самый, который мы оба знаем».",
      uz: "Oʻzbek tilida artikl yoʻq, shuning uchun a / an / the ortiqcha tuyuladi. Ingliz tilida birlikdagi sanaladigan otning deyarli har biri artikl talab qiladi: a — «koʻpdan bittasi», the — «ikkalamiz biladigan oʻsha narsa».",
    },
    examples: [{ bad: "I bought new phone.", good: "I bought a new phone." }],
    handbook: "articles-basic-control",
    generic: true,
    match: { topics: ["articles"], explain: [/\barticles?\b/] },
  }),
  note({
    id: "article-jobs",
    speakers: "both",
    title: { en: "a / an before a job", ru: "a / an перед профессией", uz: "Kasb oldidan a / an" },
    why: {
      en: "In Russian «Я учитель» and in Uzbek «Men oʻqituvchiman» need nothing before the job. English says I am a teacher: one person in a profession takes a or an.",
      ru: "По-русски говорят «Я учитель» без всякого слова перед профессией. По-английски нужно I am a teacher: о человеке и его профессии говорят с a или an.",
      uz: "Oʻzbekcha «Men oʻqituvchiman» deymiz, kasb oldidan hech narsa qoʻyilmaydi. Inglizcha I am a teacher deyiladi: kasb haqida gapirganda a yoki an kerak.",
    },
    examples: [{ bad: "She is doctor.", good: "She is a doctor." }],
    handbook: "articles-basic-control",
    match: {
      wrong: [/\b(?:i'?m|am|is|are|was|were|he's|she's|be)\s+(?:teacher|doctor|student|engineer|driver|nurse|manager|programmer|developer|lawyer|worker|businessman|pupil|accountant|designer|journalist|economist|builder|waiter|cook|chef)\b/],
      added: ["a", "an"],
    },
  }),
  note({
    id: "article-the-general",
    speakers: "both",
    title: { en: "No “the” for things in general", ru: "Без the, когда речь «вообще»", uz: "Umumiy maʼnoda the kerak emas" },
    why: {
      en: "After learning that English has the, many learners put it everywhere. For ideas and things in general (life, money, people, music) English uses no article: Life is short.",
      ru: "Узнав про the, многие начинают ставить его везде. Когда речь идёт о понятиях и вещах вообще (жизнь, деньги, люди, музыка), артикль не нужен: Life is short.",
      uz: "The borligini bilgach, koʻpchilik uni hamma joyda ishlata boshlaydi. Umumiy tushunchalar (hayot, pul, odamlar, musiqa) haqida gapirganda artikl qoʻyilmaydi: Life is short.",
    },
    examples: [{ bad: "The money is not everything.", good: "Money is not everything." }],
    handbook: "articles-basic-control",
    match: {
      wrong: [/\bthe\s+(?:life|love|money|nature|music|education|society|history|happiness|health|time|sport|technology|science|art|people)\b/],
      removed: ["the"],
    },
  }),
  note({
    id: "article-a-an",
    speakers: "both",
    title: { en: "a or an?", ru: "a или an?", uz: "a yoki an?" },
    why: {
      en: "The choice depends on the first sound of the next word, not the letter: an before a vowel sound (an apple, an hour), a before a consonant sound (a university).",
      ru: "Выбор зависит от первого звука следующего слова, а не от буквы: an перед гласным звуком (an apple, an hour), a перед согласным (a university).",
      uz: "Tanlov keyingi soʻzning birinchi harfiga emas, birinchi tovushiga bogʻliq: unli tovushdan oldin an (an apple, an hour), undosh tovushdan oldin a (a university).",
    },
    examples: [{ bad: "a interesting idea", good: "an interesting idea" }],
    handbook: "articles-basic-control",
    match: { wrong: [/\ba\s+[aeio]/, /\ban\s+(?:[bcdfgjklmnpqrstvwxyz]|uni|use)/], removed: ["a", "an"] },
  }),

  // --- Pronouns and subjects ------------------------------------------
  note({
    id: "he-she",
    speakers: "uz",
    title: { en: "he or she", ru: "he или she", uz: "he yoki she" },
    why: {
      en: "Uzbek has one word, «u», for he, she and it, so the choice is easy to miss in fast speech. English always shows it: he / his / him for a man, she / her for a woman.",
      ru: "В узбекском одно слово «u» означает и «он», и «она», поэтому в быстрой речи их легко перепутать. В английском это видно всегда: he / his / him — о мужчине, she / her — о женщине.",
      uz: "Oʻzbek tilida «u» soʻzi ham erkak, ham ayol uchun ishlatiladi, shuning uchun tez gapirganda adashish oson. Ingliz tilida bu doim koʻrsatiladi: erkak uchun he / his / him, ayol uchun she / her.",
    },
    examples: [{ bad: "My sister is a doctor. He works in a hospital.", good: "My sister is a doctor. She works in a hospital." }],
    handbook: null,
    match: { removed: ["he", "she", "his", "him", "her", "hers", "himself", "herself"], added: ["he", "she", "his", "him", "her", "hers", "himself", "herself"] },
  }),
  note({
    id: "subject-it-there",
    speakers: "both",
    title: { en: "Every sentence needs a subject", ru: "В предложении нужно подлежащее", uz: "Har bir gapda ega boʻlishi kerak" },
    why: {
      en: "Russian «Холодно» and Uzbek «Sovuq» are full sentences. English needs a subject, even an empty one: It is cold. It is raining. There is a problem.",
      ru: "«Холодно» — это полное предложение по-русски. В английском подлежащее нужно всегда, даже «пустое»: It is cold. It is raining. There is a problem.",
      uz: "«Sovuq» oʻzbekchada toʻliq gap. Ingliz tilida ega doim kerak, hatto «boʻsh» boʻlsa ham: It is cold. It is raining. There is a problem.",
    },
    examples: [{ bad: "Is very cold today.", good: "It is very cold today." }],
    handbook: null,
    match: { added: ["it", "it's"], wrong: [/^(?:is|was|will be|has been)\b/, /\b(?:because|but|and|so)\s+(?:is|was)\b/] },
  }),
  note({
    id: "there-is",
    speakers: "both",
    title: { en: "There is / there are", ru: "There is / there are", uz: "There is / there are" },
    why: {
      en: "Russian «В городе есть парк» and Uzbek «Shaharda park bor» start with the place. English starts with there is / there are and puts the place at the end: There is a park in my city.",
      ru: "По-русски говорят «В городе есть парк» — сначала место. По-английски начинают с there is / there are, а место ставят в конец: There is a park in my city.",
      uz: "Oʻzbekcha «Shaharda park bor» deymiz — avval joy. Inglizcha gap there is / there are bilan boshlanadi, joy esa oxirida keladi: There is a park in my city.",
    },
    examples: [{ bad: "In my city is a big park.", good: "There is a big park in my city." }],
    handbook: "there-is-there-are",
    generic: true,
    match: { topics: ["there-is"], added: ["there"] },
  }),
  note({
    id: "to-be-missing",
    speakers: "both",
    title: { en: "Don’t drop am / is / are", ru: "Не пропускайте am / is / are", uz: "am / is / are ni tushirib qoldirmang" },
    why: {
      en: "Russian drops «есть» (Она учитель) and Uzbek uses an ending (oʻqituvchiman). English needs a separate verb: I am tired. She is a teacher. They are at home.",
      ru: "В русском «есть» обычно пропускают («Она учитель»). В английском глагол нужен всегда: I am tired. She is a teacher. They are at home.",
      uz: "Oʻzbek tilida feʼl oʻrniga qoʻshimcha ishlatiladi (charchadim, oʻqituvchiman). Ingliz tilida alohida feʼl kerak: I am tired. She is a teacher. They are at home.",
    },
    examples: [{ bad: "My brother very busy.", good: "My brother is very busy." }],
    handbook: "to-be-am-is-are",
    generic: true,
    match: { topics: ["to-be"], added: ["am", "is", "are", "was", "were", "i'm", "it's", "he's", "she's", "they're", "we're", "you're"], explain: [/\b(?:missing|add|need)s?\b.*\b(?:am|is|are)\b/] },
  }),
  note({
    id: "be-plus-verb",
    speakers: "both",
    title: { en: "No am / is / are before an ordinary verb", ru: "Без am / is / are перед обычным глаголом", uz: "Oddiy feʼldan oldin am / is / are kerak emas" },
    why: {
      en: "Learners who know that English “needs a verb” sometimes add be to every sentence: I am agree, I am work. With an action verb in the present simple there is no be: I agree. I work.",
      ru: "Запомнив, что в английском «нужен глагол», многие добавляют be везде: I am agree, I am work. С обычным глаголом в present simple be не нужен: I agree. I work.",
      uz: "Ingliz tilida «feʼl kerak» ekanini bilgan koʻpchilik har bir gapga be qoʻshadi: I am agree, I am work. Present simpleda oddiy feʼl bilan be ishlatilmaydi: I agree. I work.",
    },
    examples: [{ bad: "I am agree with you.", good: "I agree with you." }],
    handbook: "present-simple-routines",
    match: {
      wrong: [/\b(?:i|you|we|they|he|she)\s+(?:am|is|are)\s+(?:agree|like|want|know|think|work|live|go|study|have|need|disagree|love|understand)\b/],
      removed: ["am", "is", "are"],
    },
  }),

  // --- Tenses ---------------------------------------------------------
  note({
    id: "perfect-finished-time",
    speakers: "both",
    title: { en: "Present perfect or past simple?", ru: "Present perfect или past simple?", uz: "Present perfect yoki past simple?" },
    why: {
      en: "Russian and Uzbek have one past tense for both ideas. English uses the past simple with a finished time (yesterday, last year, ago) and the present perfect for experience or results now, without a time.",
      ru: "В русском одно прошедшее время на оба случая. В английском с законченным временем (yesterday, last year, ago) нужен past simple, а present perfect — для опыта или результата сейчас, без указания времени.",
      uz: "Oʻzbek tilida ikkala holat uchun bitta oʻtgan zamon bor. Ingliz tilida tugagan vaqt bilan (yesterday, last year, ago) past simple, vaqt aytilmasa, tajriba yoki hozirgi natija uchun present perfect ishlatiladi.",
    },
    examples: [{ bad: "I have seen him yesterday.", good: "I saw him yesterday." }],
    handbook: "present-perfect-vs-past-simple",
    generic: true,
    match: {
      topics: ["present-perfect"],
      wrong: [/\b(?:have|has|'ve|'s)\s+\w+(?:ed|en|ne|wn|ght)\b.*\b(?:yesterday|ago|last|in (?:19|20)\d\d)\b/, /\b(?:yesterday|ago|last \w+)\b.*\b(?:have|has)\s+\w+/],
      removed: ["have", "has", "'ve"],
    },
  }),
  note({
    id: "perfect-since-for",
    speakers: "both",
    title: { en: "“I have lived here for…”", ru: "«I have lived here for…»", uz: "«I have lived here for…»" },
    why: {
      en: "Russian «Я живу здесь пять лет» and Uzbek «Bu yerda besh yildan beri yashayman» use the present. English uses the present perfect for something that started in the past and continues now: I have lived here for five years.",
      ru: "По-русски «Я живу здесь пять лет» — настоящее время. В английском для того, что началось в прошлом и продолжается сейчас, нужен present perfect: I have lived here for five years.",
      uz: "Oʻzbekcha «Bu yerda besh yildan beri yashayman» — hozirgi zamon. Ingliz tilida oʻtmishda boshlanib, hozir ham davom etayotgan ish uchun present perfect kerak: I have lived here for five years.",
    },
    examples: [{ bad: "I study English since 2020.", good: "I have studied English since 2020." }],
    handbook: "present-perfect-vs-past-simple",
    match: {
      wrong: [/\b(?:live|work|know|study|am|is|are|learn|teach|play)\b[^.]*\b(?:since|for)\b/],
      right: [/\b(?:have|has|'ve)\s+(?:been|lived|worked|known|studied|learned|learnt|taught|played)\b/],
    },
  }),
  note({
    id: "since-for",
    speakers: "both",
    title: { en: "since or for?", ru: "since или for?", uz: "since yoki for?" },
    why: {
      en: "Russian «уже три года» and Uzbek «uch yildan beri» feel like since. English uses for with a period (for three years) and since with a starting point (since 2021, since Monday).",
      ru: "«Уже три года» хочется перевести через since. В английском for — с периодом (for three years), since — с моментом начала (since 2021, since Monday).",
      uz: "«Uch yildan beri» ni since bilan tarjima qilgingiz keladi. Ingliz tilida davr bilan for (for three years), boshlanish nuqtasi bilan since (since 2021, since Monday) ishlatiladi.",
    },
    examples: [{ bad: "I have worked here since three years.", good: "I have worked here for three years." }],
    handbook: "present-perfect-vs-past-simple",
    match: { wrong: [/\bsince\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|many|a few|several)\s+(?:years?|months?|weeks?|days?|hours?)\b/] },
  }),
  note({
    id: "continuous-vs-simple",
    speakers: "both",
    title: { en: "Habits use the present simple", ru: "Привычки — present simple", uz: "Odatlar — present simple" },
    why: {
      en: "Russian and Uzbek have one present tense for “now” and “usually”. English separates them: I go to work every day (habit) but I am going to work now (at this moment).",
      ru: "В русском одно настоящее время и для «сейчас», и для «обычно». В английском это разные формы: I go to work every day (привычка), но I am going to work now (в этот момент).",
      uz: "Oʻzbek tilida «hozir» va «odatda» uchun bitta hozirgi zamon bor. Ingliz tilida ular farqlanadi: I go to work every day (odat), lekin I am going to work now (hozir).",
    },
    examples: [{ bad: "I am drinking coffee every morning.", good: "I drink coffee every morning." }],
    handbook: "present-continuous-vs-simple",
    generic: true,
    match: {
      topics: ["present-continuous"],
      wrong: [/\b(?:am|is|are|'m|'re)\s+\w+ing\b[^.]*\b(?:every|usually|always|often|sometimes|never|on mondays|at weekends)\b/, /\b(?:every|usually|always|often)\b[^.]*\b(?:am|is|are)\s+\w+ing\b/],
    },
  }),
  note({
    id: "stative-verbs",
    speakers: "both",
    title: { en: "No -ing with know, want, like", ru: "Без -ing у know, want, like", uz: "know, want, like bilan -ing kerak emas" },
    why: {
      en: "Verbs of thinking and feeling (know, want, like, understand, believe, need) describe states, not actions, so English keeps them in the simple form even right now: I know. I want it.",
      ru: "Глаголы мысли и чувства (know, want, like, understand, believe, need) описывают состояние, а не действие, поэтому даже «сейчас» они остаются в простой форме: I know. I want it.",
      uz: "Fikr va his-tuygʻu feʼllari (know, want, like, understand, believe, need) harakatni emas, holatni bildiradi, shuning uchun «hozir» boʻlsa ham oddiy shaklda qoladi: I know. I want it.",
    },
    examples: [{ bad: "I am knowing the answer.", good: "I know the answer." }],
    handbook: "present-continuous-vs-simple",
    match: { wrong: [/\b(?:am|is|are|'m|'re)\s+(?:knowing|wanting|liking|understanding|believing|needing|preferring|owning|meaning|remembering)\b/] },
  }),
  note({
    id: "will-after-when",
    speakers: "both",
    title: { en: "No will after when / if", ru: "Без will после when / if", uz: "when / if dan keyin will kerak emas" },
    why: {
      en: "Russian «Когда я закончу» and Uzbek «Tugatganimda» point to the future. English keeps the present after when, if, before, after, until, as soon as: When I finish, I will call you.",
      ru: "«Когда я закончу» — будущее время. В английском после when, if, before, after, until, as soon as ставят настоящее: When I finish, I will call you.",
      uz: "«Tugatganimda» kelasi zamonni bildiradi. Ingliz tilida when, if, before, after, until, as soon as dan keyin hozirgi zamon ishlatiladi: When I finish, I will call you.",
    },
    examples: [{ bad: "If it will rain, we will stay home.", good: "If it rains, we will stay home." }],
    handbook: "conditionals-first-second",
    match: { wrong: [/\b(?:when|if|as soon as|before|after|until|unless)\s+(?:\w+\s+){1,2}will\b/], removed: ["will", "'ll"] },
  }),
  note({
    id: "did-plus-base",
    speakers: "both",
    title: { en: "did + base verb", ru: "did + начальная форма", uz: "did + feʼlning asosiy shakli" },
    why: {
      en: "In Russian and Uzbek the past is marked on the verb every time. In English questions and negatives the past is carried by did, so the main verb goes back to its base form: I didn’t go. Did you see?",
      ru: "В русском прошедшее время всегда видно по глаголу. В английских вопросах и отрицаниях прошлое «несёт» did, а основной глагол возвращается в начальную форму: I didn’t go. Did you see?",
      uz: "Oʻzbek tilida oʻtgan zamon har safar feʼlning oʻzida koʻrinadi. Ingliz tilida soʻroq va inkorda oʻtgan zamonni did bildiradi, asosiy feʼl esa asosiy shaklga qaytadi: I didn’t go. Did you see?",
    },
    examples: [{ bad: "I didn't went to school.", good: "I didn't go to school." }],
    handbook: "past-simple-did-didnt",
    match: {
      topics: ["past-simple"],
      wrong: [/\bdid(?:n't| not)?\s+(?:\w+\s+)?(?:\w+ed|went|saw|came|took|made|bought|had|was|were|got|ate|wrote|told|said|found|gave|knew|thought)\b/],
    },
  }),
  note({
    id: "third-person-s",
    speakers: "both",
    title: { en: "he / she / it + -s", ru: "he / she / it + -s", uz: "he / she / it + -s" },
    why: {
      en: "Russian and Uzbek change the verb ending for every person, so one small English ending is easy to forget. In the present simple only he, she, it (and one person or thing) take -s: She works. It costs.",
      ru: "В русском окончание меняется для каждого лица, поэтому единственное английское окончание легко забыть. В present simple -s получают только he, she, it (и один человек или предмет): She works. It costs.",
      uz: "Oʻzbek tilida feʼl qoʻshimchasi har bir shaxs uchun oʻzgaradi, shuning uchun ingliz tilidagi bitta qoʻshimchani unutish oson. Present simpleda faqat he, she, it (bitta odam yoki narsa) -s oladi: She works. It costs.",
    },
    examples: [{ bad: "My father work in a bank.", good: "My father works in a bank." }],
    handbook: "subject-verb-agreement",
    generic: true,
    match: { topics: ["agreement"], explain: [/\bthird[- ]person\b|\bsubject[- ]verb agreement\b/] },
  }),

  // --- Questions and word order ---------------------------------------
  note({
    id: "question-do",
    speakers: "both",
    title: { en: "Questions need do / does / did", ru: "В вопросе нужен do / does / did", uz: "Soʻroqda do / does / did kerak" },
    why: {
      en: "Russian makes a question with intonation («Ты живёшь здесь?») and Uzbek with -mi («Shu yerda yashaysanmi?»). English needs a helper verb before the subject: Do you live here? Where does she work?",
      ru: "По-русски вопрос задают интонацией: «Ты живёшь здесь?». В английском перед подлежащим нужен вспомогательный глагол: Do you live here? Where does she work?",
      uz: "Oʻzbek tilida soʻroq -mi bilan yasaladi: «Shu yerda yashaysanmi?». Ingliz tilida egadan oldin yordamchi feʼl kerak: Do you live here? Where does she work?",
    },
    examples: [{ bad: "Where you live?", good: "Where do you live?" }],
    handbook: "present-simple-routines",
    match: {
      added: ["do", "does", "did"],
      right: [/^(?:\w+\s+){0,2}(?:do|does|did)\s+(?:you|he|she|it|we|they|i|your|my|the)\b/],
    },
  }),
  note({
    id: "question-order",
    speakers: "both",
    title: { en: "Question word order", ru: "Порядок слов в вопросе", uz: "Soʻroq gapda soʻz tartibi" },
    why: {
      en: "In Russian and Uzbek a statement and a question can have the same word order. In English the verb comes before the subject in a question: You are ready → Are you ready? She can come → Can she come?",
      ru: "В русском утверждение и вопрос могут звучать с одинаковым порядком слов. В английском в вопросе глагол встаёт перед подлежащим: You are ready → Are you ready? She can come → Can she come?",
      uz: "Oʻzbek tilida darak va soʻroq gapda soʻz tartibi bir xil boʻlishi mumkin. Ingliz tilida soʻroqda feʼl egadan oldin keladi: You are ready → Are you ready? She can come → Can she come?",
    },
    examples: [{ bad: "You are a student?", good: "Are you a student?" }],
    handbook: "to-be-am-is-are",
    match: {
      wrong: [/^(?:\w+\s+)?(?:you|he|she|it|they|we|this|that)\s+(?:are|is|can|will|was|were|have|has)\b/],
      right: [/^(?:\w+\s+)?(?:are|is|can|will|was|were|have|has)\s+(?:you|he|she|it|they|we|this|that)\b/],
    },
  }),
  note({
    id: "indirect-question",
    speakers: "both",
    title: { en: "“Can you tell me where it is?”", ru: "«Can you tell me where it is?»", uz: "«Can you tell me where it is?»" },
    why: {
      en: "After Can you tell me… / Do you know… / I wonder… the question becomes part of a statement, so the normal order comes back: Do you know where the station is? (not where is the station).",
      ru: "После Can you tell me… / Do you know… / I wonder… вопрос становится частью утверждения, и возвращается прямой порядок: Do you know where the station is? (а не where is the station).",
      uz: "Can you tell me… / Do you know… / I wonder… dan keyin savol darak gapning bir qismiga aylanadi va oddiy tartib qaytadi: Do you know where the station is? (where is the station emas).",
    },
    examples: [{ bad: "Can you tell me where is the bank?", good: "Can you tell me where the bank is?" }],
    handbook: "reported-speech",
    match: { wrong: [/\b(?:tell me|know|wonder|ask(?:ed)?|explain|understand|remember)\s+(?:where|what|when|why|how|who|which)\s+(?:is|are|do|does|did|was|were|can|will)\b/] },
  }),
  note({
    id: "negative-do",
    speakers: "both",
    title: { en: "Negatives need don’t / doesn’t", ru: "Отрицание через don’t / doesn’t", uz: "Inkor don’t / doesn’t bilan" },
    why: {
      en: "Russian puts «не» straight before the verb and Uzbek adds -ma. English needs a helper: I don’t like, she doesn’t know, we didn’t go — not I no like or I not like.",
      ru: "По-русски «не» ставится прямо перед глаголом. В английском нужен вспомогательный глагол: I don’t like, she doesn’t know, we didn’t go — а не I no like / I not like.",
      uz: "Oʻzbek tilida feʼlga -ma qoʻshiladi. Ingliz tilida yordamchi feʼl kerak: I don’t like, she doesn’t know, we didn’t go — I no like yoki I not like emas.",
    },
    examples: [{ bad: "I not understand.", good: "I don't understand." }],
    handbook: "present-simple-routines",
    match: { wrong: [/\b(?:i|you|we|they|he|she|it|my \w+)\s+(?:not|no)\s+(?!one\b|longer\b|more\b|only\b)\w+/], added: ["don't", "doesn't", "didn't", "do", "does", "did"] },
  }),
  note({
    id: "very-like",
    speakers: "both",
    title: { en: "“I really like” / “I like it very much”", ru: "«I really like» / «I like it very much»", uz: "«I really like» / «I like it very much»" },
    why: {
      en: "Russian «очень люблю» and Uzbek «juda yaxshi koʻraman» put very before the verb. English very goes with adjectives; with verbs say really like or like … very much at the end.",
      ru: "По-русски «очень люблю» — very хочется поставить перед глаголом. В английском very ставят перед прилагательными, а с глаголами говорят really like или like … very much в конце.",
      uz: "Oʻzbekcha «juda yaxshi koʻraman» deymiz va very ni feʼldan oldin qoʻygimiz keladi. Ingliz tilida very sifat bilan ishlatiladi, feʼl bilan esa really like yoki gap oxirida like … very much deyiladi.",
    },
    examples: [{ bad: "I very like football.", good: "I really like football." }],
    handbook: null,
    match: { wrong: [/\bvery\s+(?:like|love|want|enjoy|hate|need|miss|liked|loved|wanted|enjoyed)\b/] },
  }),
  note({
    id: "object-order",
    speakers: "both",
    title: { en: "Verb + object stay together", ru: "Глагол и дополнение — рядом", uz: "Feʼl va toʻldiruvchi yonma-yon" },
    why: {
      en: "Russian and Uzbek word order is free, so words can go between a verb and its object. English keeps them together and puts “how much / how well” after: I speak English well. I like football very much.",
      ru: "В русском порядок слов свободный, и между глаголом и дополнением можно вставить другие слова. В английском они стоят рядом, а «как» и «насколько» идут после: I speak English well. I like football very much.",
      uz: "Oʻzbek tilida soʻz tartibi erkin, feʼl va toʻldiruvchi orasiga boshqa soʻz qoʻyish mumkin. Ingliz tilida ular yonma-yon turadi, «qanday» va «qanchalik» esa keyin keladi: I speak English well. I like football very much.",
    },
    examples: [{ bad: "I speak very well English.", good: "I speak English very well." }],
    handbook: null,
    match: { wrong: [/\b(?:speak|speaks|like|likes|love|loves|play|plays|know|knows)\s+(?:very\s+)?(?:much|well|good|badly|fluently)\s+(?:english|russian|uzbek|football|music|it|him|her|them|\w+)\b/] },
  }),
  note({
    id: "double-negative",
    speakers: "both",
    title: { en: "One negative is enough", ru: "Достаточно одного отрицания", uz: "Bitta inkor yetarli" },
    why: {
      en: "Russian «Я ничего не знаю» and Uzbek «Hech narsa bilmayman» use two negatives. Standard English uses one: I don’t know anything, or I know nothing.",
      ru: "По-русски «Я ничего не знаю» — два отрицания. В английском достаточно одного: I don’t know anything или I know nothing.",
      uz: "Oʻzbekcha «Hech narsa bilmayman» — ikki inkor. Ingliz tilida bittasi yetarli: I don’t know anything yoki I know nothing.",
    },
    examples: [{ bad: "I didn't see nobody.", good: "I didn't see anybody." }],
    handbook: null,
    match: { wrong: [/\b(?:don't|doesn't|didn't|not|never|can't|won't|isn't|aren't|wasn't|haven't)\b[^.]*\b(?:nothing|nobody|no one|nowhere|never|none)\b/] },
  }),

  // --- Nouns, quantity -------------------------------------------------
  note({
    id: "uncountable-plurals",
    speakers: "both",
    title: { en: "information, advice, news: no -s", ru: "information, advice, news — без -s", uz: "information, advice, news — -s siz" },
    why: {
      en: "Russian «информации, советы, новости» and Uzbek «maʼlumotlar, maslahatlar» can be plural. In English these nouns are uncountable: no -s and no a: some information, a piece of advice, the news is good.",
      ru: "По-русски «советы», «новости», «знания» бывают во множественном числе. В английском это неисчисляемые слова: без -s и без a: some information, a piece of advice, the news is good.",
      uz: "Oʻzbekcha «maʼlumotlar», «maslahatlar», «bilimlar» deyish mumkin. Ingliz tilida bu soʻzlar sanalmaydi: -s ham, a ham qoʻyilmaydi: some information, a piece of advice, the news is good.",
    },
    examples: [{ bad: "She gave me many useful advices.", good: "She gave me a lot of useful advice." }],
    handbook: "countable-uncountable-quantifiers",
    generic: true,
    match: {
      topics: ["quantifiers"],
      wrong: [/\b(?:informations|advices|furnitures|homeworks|knowledges|equipments|luggages|baggages|feedbacks|researches|evidences|softwares|trafics|traffics)\b/, /\b(?:an?)\s+(?:advice|information|news|furniture|homework|luggage|knowledge|equipment|research)\b/, /\bnews\s+(?:are|were)\b/],
      explain: [/\buncountable\b/],
    },
  }),
  note({
    id: "many-much",
    speakers: "both",
    title: { en: "many or much?", ru: "many или much?", uz: "many yoki much?" },
    why: {
      en: "Russian «много» and Uzbek «koʻp» work with every noun. English chooses: many with things you count (many people, many books), much with things you don’t (much time, much money). A lot of fits both.",
      ru: "Русское «много» подходит ко всему. В английском выбирают: many — с тем, что можно посчитать (many people), much — с тем, что нельзя (much time, much money). A lot of подходит к обоим.",
      uz: "Oʻzbekcha «koʻp» har qanday ot bilan ishlatiladi. Ingliz tilida tanlanadi: sanaladigan narsalar bilan many (many people), sanalmaydiganlar bilan much (much time, much money). A lot of ikkalasiga ham mos.",
    },
    examples: [{ bad: "There were much people.", good: "There were many people." }],
    handbook: "countable-uncountable-quantifiers",
    match: { topics: ["quantifiers"], wrong: [/\bmuch\s+(?:people|friends|books|cars|things|students|times|problems|questions|cities|countries|children)\b/, /\bmuch\s+(?!less\b|as\b|this\b|was\b|is\b|has\b|does\b)\w{2,}s\b/, /\bmany\s+(?:money|time|information|water|work|advice|traffic|homework|food)\b/] },
  }),
  note({
    id: "plural-money-hair-people",
    speakers: "both",
    title: { en: "money is, people are", ru: "money is, people are", uz: "money is, people are" },
    why: {
      en: "Russian «деньги» and «волосы» are plural, Uzbek «odamlar» has a plural ending. In English money and hair are singular (Money is…, my hair is…), while people is already plural (People are…, not peoples).",
      ru: "«Деньги» и «волосы» по-русски во множественном числе. В английском money и hair — единственное число (Money is…, my hair is…), а people уже множественное (People are…, а не peoples).",
      uz: "Oʻzbekcha «odamlar» koʻplik qoʻshimchasini oladi. Ingliz tilida money va hair birlikda (Money is…, my hair is…), people esa allaqachon koʻplikda (People are…, peoples emas).",
    },
    examples: [{ bad: "The money are on the table.", good: "The money is on the table." }],
    handbook: "subject-verb-agreement",
    match: { wrong: [/\b(?:money|hair)\s+(?:are|were)\b/, /\bhairs\b/, /\bpeople\s+(?:is|was|has)\b/, /\bpeoples\b/, /\bmoneys\b/] },
  }),
  note({
    id: "possessive-s",
    speakers: "both",
    title: { en: "my father’s car", ru: "my father’s car", uz: "my father’s car" },
    why: {
      en: "Russian «машина моего отца» uses an «of» pattern and Uzbek «otamning mashinasi» uses endings. For people English usually uses ’s before the thing: my father’s car, Aziza’s phone.",
      ru: "По-русски «машина моего отца» — конструкция через «кого/чего». Для людей в английском обычно используют ’s перед предметом: my father’s car, Aziza’s phone.",
      uz: "Oʻzbekcha «otamning mashinasi» qoʻshimchalar bilan yasaladi. Odamlar haqida ingliz tilida odatda narsadan oldin ’s ishlatiladi: my father’s car, Aziza’s phone.",
    },
    examples: [{ bad: "the car of my father", good: "my father's car" }],
    handbook: "possessives-my-your-s",
    generic: true,
    match: { topics: ["possessives"], wrong: [/\bthe\s+\w+\s+of\s+(?:my|his|her|our|their|your)\s+(?:father|mother|brother|sister|friend|parents|teacher|boss|uncle|aunt|son|daughter|wife|husband)\b/] },
  }),
  note({
    id: "age-be",
    speakers: "both",
    title: { en: "“I am 20 years old”", ru: "«I am 20 years old»", uz: "«I am 20 years old»" },
    why: {
      en: "Russian «Мне 20 лет» and Uzbek «Men 20 yoshdaman» don’t translate word for word. English uses be: I am 20 (years old) — not I have 20 years.",
      ru: "«Мне 20 лет» нельзя переводить дословно. В английском возраст говорят через be: I am 20 (years old) — а не I have 20 years.",
      uz: "«Men 20 yoshdaman» ni soʻzma-soʻz tarjima qilib boʻlmaydi. Ingliz tilida yosh be bilan aytiladi: I am 20 (years old) — I have 20 years emas.",
    },
    examples: [{ bad: "My brother has 15 years.", good: "My brother is 15 years old." }],
    handbook: "to-be-am-is-are",
    match: { wrong: [/\b(?:i|he|she|we|they|you|my \w+)\s+(?:have|has|had)\s+(?:\d+|twenty|thirty|forty|fifteen|eighteen|nineteen|ten|five)\s+years?\b/] },
  }),
  note({
    id: "bored-boring",
    speakers: "both",
    title: { en: "bored or boring?", ru: "bored или boring?", uz: "bored yoki boring?" },
    why: {
      en: "Russian «Мне скучно» and Uzbek «Zerikdim» describe how you feel. English uses -ed for the feeling (I’m bored, I’m interested) and -ing for what causes it (The film is boring).",
      ru: "«Мне скучно» описывает ваше состояние. В английском -ed — о чувстве (I’m bored, I’m interested), -ing — о том, что его вызывает (The film is boring).",
      uz: "«Zerikdim» his-tuygʻuni bildiradi. Ingliz tilida his-tuygʻu uchun -ed (I’m bored, I’m interested), uni keltirib chiqaradigan narsa uchun -ing (The film is boring) ishlatiladi.",
    },
    examples: [{ bad: "I am very boring at home.", good: "I am very bored at home." }],
    handbook: null,
    match: { wrong: [/\b(?:i'?m|i am|i was|we are|we were|i feel|i felt|i get|i got)\s+(?:very\s+|so\s+|really\s+)?(?:boring|interesting|tiring|confusing|exciting|disappointing|embarrassing|frightening|surprising)\b/] },
  }),
  note({
    id: "more-better",
    speakers: "both",
    title: { en: "better, not more better", ru: "better, а не more better", uz: "more better emas, better" },
    why: {
      en: "Russian «более лучший» and Uzbek «yanada yaxshiroq» add an extra word. In English -er already means “more”: better, cheaper, bigger. Use more only with long adjectives: more expensive.",
      ru: "По-русски иногда говорят «более лучший». В английском -er уже значит «более»: better, cheaper, bigger. More ставят только с длинными прилагательными: more expensive.",
      uz: "Oʻzbekcha «yanada yaxshiroq» deymiz. Ingliz tilida -er ning oʻzi «koʻproq» degani: better, cheaper, bigger. More faqat uzun sifatlar bilan ishlatiladi: more expensive.",
    },
    examples: [{ bad: "This phone is more cheaper.", good: "This phone is cheaper." }],
    handbook: "comparatives-superlatives",
    generic: true,
    match: { topics: ["comparatives"], wrong: [/\b(?:more|most)\s+(?:\w+er|\w+est|better|worse|best|worst)\b/] },
  }),
  note({
    id: "modal-to",
    speakers: "both",
    title: { en: "can / must / should + verb (no to)", ru: "can / must / should + глагол без to", uz: "can / must / should + feʼl (to siz)" },
    why: {
      en: "Russian «могу плавать» and Uzbek «suza olaman» link two verbs directly, but learners who know want to / have to add to everywhere. After can, could, must, should, will, might the verb has no to: I can swim.",
      ru: "Зная want to и have to, многие добавляют to везде. После can, could, must, should, will, might глагол идёт без to: I can swim.",
      uz: "want to va have to ni bilgan koʻpchilik to ni hamma joyga qoʻshadi. can, could, must, should, will, might dan keyin feʼl to siz keladi: I can swim.",
    },
    examples: [{ bad: "You should to see a doctor.", good: "You should see a doctor." }],
    handbook: "modals-of-obligation",
    generic: true,
    match: { topics: ["modal-can", "modals-obligation"], wrong: [/\b(?:can|could|must|should|will|might|may|would)\s+to\s+\w+/] },
  }),
  note({
    id: "want-that",
    speakers: "both",
    title: { en: "“I want you to come”", ru: "«I want you to come»", uz: "«I want you to come»" },
    why: {
      en: "Russian «Я хочу, чтобы ты пришёл» uses a that-clause. English uses want + person + to: I want you to come. My parents want me to study medicine.",
      ru: "По-русски «Я хочу, чтобы ты пришёл» — придаточное с «чтобы». В английском: want + человек + to: I want you to come. My parents want me to study medicine.",
      uz: "Oʻzbekcha «Kelishingni xohlayman». Ingliz tilida want + odam + to ishlatiladi: I want you to come. My parents want me to study medicine.",
    },
    examples: [{ bad: "I want that you help me.", good: "I want you to help me." }],
    handbook: "gerund-or-infinitive",
    generic: true,
    match: { topics: ["verb-patterns"], wrong: [/\b(?:want|wants|wanted|would like)\s+that\s+/] },
  }),

  // --- Prepositions ----------------------------------------------------
  note({
    id: "prepositions-cases",
    speakers: "both",
    title: { en: "Prepositions don’t translate one to one", ru: "Предлоги не переводятся дословно", uz: "Predloglar soʻzma-soʻz tarjima qilinmaydi" },
    why: {
      en: "Uzbek shows place and direction with endings (-da, -ga, -dan) and Russian prepositions cover different ground. Learn English prepositions as fixed pairs with the word they go with: interested in, good at, afraid of.",
      ru: "Русские предлоги охватывают другие значения, чем английские. Учите английские предлоги вместе со словом, с которым они идут: interested in, good at, afraid of.",
      uz: "Oʻzbek tilida joy va yoʻnalish qoʻshimchalar (-da, -ga, -dan) bilan ifodalanadi. Ingliz tilidagi predloglarni yonidagi soʻz bilan birga yodlang: interested in, good at, afraid of.",
    },
    examples: [{ bad: "I am good in maths.", good: "I am good at maths." }],
    handbook: "prepositions-common-use",
    generic: true,
    match: { topics: ["prepositions"], explain: [/\bprepositions?\b/] },
  }),
  note({
    id: "time-in-on-at",
    speakers: "both",
    title: { en: "in, on, at with time", ru: "in, on, at со временем", uz: "Vaqt bilan in, on, at" },
    why: {
      en: "Russian «в понедельник, в 5 часов, в мае» uses one word and Uzbek uses -da. English uses three: at for clock times (at 5), on for days and dates (on Monday), in for months, years, seasons (in May).",
      ru: "По-русски «в понедельник, в 5 часов, в мае» — везде «в». В английском три предлога: at — со временем на часах (at 5), on — с днями и датами (on Monday), in — с месяцами, годами, сезонами (in May).",
      uz: "Oʻzbekcha «dushanbada, soat beshda, mayda» — hammasi -da. Ingliz tilida uchta predlog bor: soat bilan at (at 5), kun va sana bilan on (on Monday), oy, yil, fasl bilan in (in May).",
    },
    examples: [{ bad: "I was born in 5 May.", good: "I was born on 5 May." }],
    handbook: "a2-prepositions-of-time",
    match: {
      wrong: [
        /\bin\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|my birthday)\b/,
        /\bat\s+(?:the\s+)?(?:morning|evening|afternoon|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/,
        /\bin\s+\d{1,2}(?:\s*o'clock|:\d\d|\s*(?:am|pm))\b/,
        /\bon\s+(?:(?:19|20)\d\d|january|february|march|april|may|june|july|august|september|october|november|december|summer|winter|spring|autumn)\b/,
        /\bin\s+\d{1,2}(?:st|nd|rd|th)?\s+(?:of\s+)?(?:january|february|march|april|may|june|july|august|september|october|november|december)\b/,
      ],
    },
  }),
  note({
    id: "place-in-on-at",
    speakers: "both",
    title: { en: "in, on, at with places", ru: "in, on, at с местом", uz: "Joy bilan in, on, at" },
    why: {
      en: "Russian «в» / «на» and Uzbek -da don’t match English. Say in a city or country (in Tashkent), at an address or event (at home, at work, at the station), on a bus, train or plane, but in a car or taxi.",
      ru: "Русские «в» и «на» не совпадают с английскими. Говорят in с городом или страной (in Tashkent), at с адресом или событием (at home, at work, at the station), on the bus / train / plane, но in a car / taxi.",
      uz: "Oʻzbekcha -da qoʻshimchasi ingliz predloglariga toʻgʻri kelmaydi. Shahar va mamlakat bilan in (in Tashkent), manzil va tadbir bilan at (at home, at work, at the station), avtobus, poyezd, samolyot bilan on, lekin car / taxi bilan in.",
    },
    examples: [{ bad: "I live at Tashkent.", good: "I live in Tashkent." }],
    handbook: "a1-prepositions-of-place",
    match: {
      wrong: [
        /\bat\s+(?:uzbekistan|tashkent|russia|moscow|samarkand|bukhara|london|america|the usa|kazakhstan|turkey|korea|germany)\b/,
        /\bin\s+(?:the\s+)?(?:bus|train|plane|metro)\b/,
        /\bon\s+(?:the|a|my)?\s*(?:car|taxi)\b/,
        /\bin\s+home\b/,
        /\bin\s+(?:the\s+)?work\b/,
      ],
    },
  }),
  note({
    id: "go-home",
    speakers: "both",
    title: { en: "go home, come here (no to)", ru: "go home, come here — без to", uz: "go home, come here — to siz" },
    why: {
      en: "Russian «иду домой» and Uzbek «uyga ketyapman» show direction. In English home, here, there, abroad and downtown already include the direction, so there is no to: I’m going home. Come here.",
      ru: "«Иду домой» — направление. В английском слова home, here, there, abroad, downtown уже содержат направление, поэтому to не нужен: I’m going home. Come here.",
      uz: "«Uyga ketyapman» — yoʻnalish. Ingliz tilida home, here, there, abroad, downtown soʻzlarining oʻzida yoʻnalish bor, shuning uchun to kerak emas: I’m going home. Come here.",
    },
    examples: [{ bad: "After work I go to home.", good: "After work I go home." }],
    handbook: "prepositions-common-use",
    match: { wrong: [/\b(?:go|goes|going|went|come|comes|coming|came|get|got|return|returned|arrive|arrived)\s+to\s+(?:home|here|there|abroad|downtown)\b/] },
  }),
  note({
    id: "verb-preposition",
    speakers: "both",
    title: { en: "depend on, listen to, wait for", ru: "depend on, listen to, wait for", uz: "depend on, listen to, wait for" },
    why: {
      en: "Russian «зависит от», «слушать музыку», «ждать автобус» and Uzbek «…ga bogʻliq», «musiqa tinglamoq» use different words or none. English verbs keep their own preposition: depend on, listen to music, wait for the bus, explain to me, discuss it (no about).",
      ru: "«Зависит от», «слушать музыку», «ждать автобус» — в английском у этих глаголов свои предлоги: depend on, listen to music, wait for the bus, explain to me, discuss it (без about).",
      uz: "«…ga bogʻliq», «musiqa tinglamoq», «avtobusni kutmoq» — ingliz tilida bu feʼllarning oʻz predlogi bor: depend on, listen to music, wait for the bus, explain to me, discuss it (about siz).",
    },
    examples: [{ bad: "It depends from the weather.", good: "It depends on the weather." }],
    handbook: "prepositions-common-use",
    match: {
      wrong: [
        /\bdepend(?:s|ed|ing)?\s+(?:from|of)\b/,
        /\bmarried\s+(?:with|on)\b/,
        /\blisten(?:s|ed|ing)?\s+(?!to\b)(?:music|me|him|her|the|this|my|songs?|radio|podcasts?)\b/,
        /\barriv(?:e|ed|es|ing)\s+to\b/,
        /\bexplain(?:s|ed)?\s+(?:me|him|her|us|them)\b/,
        /\bdiscuss(?:ed|es|ing)?\s+about\b/,
        /\bwait(?:s|ed|ing)?\s+(?!for\b)(?:him|her|me|you|the bus|my|a)\b/,
        /\bcongratulat\w*\s+(?:\w+\s+)?with\b/,
        /\binterested\s+(?:about|on|for)\b/,
        /\bafraid\s+(?:from|about)\b/,
      ],
    },
  }),

  // --- Word choice ------------------------------------------------------
  note({
    id: "make-do",
    speakers: "both",
    title: { en: "make or do?", ru: "make или do?", uz: "make yoki do?" },
    why: {
      en: "Russian «делать» and Uzbek «qilmoq» cover both. English do is for tasks and activities (do homework, do sport, do the shopping); make is for creating something (make a mistake, make a decision, make a cake).",
      ru: "Русское «делать» покрывает оба слова. Do — про задания и занятия (do homework, do sport, do the shopping), make — когда что-то создаётся (make a mistake, make a decision, make a cake).",
      uz: "Oʻzbekcha «qilmoq» ikkalasini ham bildiradi. Do — vazifa va mashgʻulot uchun (do homework, do sport, do the shopping), make — biror narsa yaratilganda (make a mistake, make a decision, make a cake).",
    },
    examples: [{ bad: "I did a lot of mistakes.", good: "I made a lot of mistakes." }],
    handbook: null,
    match: {
      wrong: [
        /\b(?:make|makes|made|making)\s+(?:my\s+|the\s+|some\s+)?(?:homework|exercises?|sports?|a favour|business|shopping|the dishes|my best|research|yoga|housework)\b/,
        /\b(?:do|does|did|doing)\s+(?:a\s+|many\s+|a lot of\s+|some\s+)?(?:mistakes?|decisions?|photos?|a cake|money|friends|noise|progress|a plan|a choice|a phone call|an effort)\b/,
      ],
      explain: [/\bmake\b[^.]*\bdo\b|\bdo\b[^.]*\bmake\b/],
    },
  }),
  note({
    id: "say-tell",
    speakers: "both",
    title: { en: "say or tell?", ru: "say или tell?", uz: "say yoki tell?" },
    why: {
      en: "Russian «сказать» and Uzbek «aytmoq» work the same with or without a person. English tell needs the person (tell me, told her), say does not (say something, said that…).",
      ru: "«Сказать» по-русски работает одинаково с человеком и без. В английском после tell нужен человек (tell me, told her), а после say — нет (say something, said that…).",
      uz: "«Aytmoq» odam bilan ham, odamsiz ham bir xil ishlaydi. Ingliz tilida tell dan keyin odam keladi (tell me, told her), say dan keyin esa yoʻq (say something, said that…).",
    },
    examples: [{ bad: "She said me the truth.", good: "She told me the truth." }],
    handbook: null,
    match: { wrong: [/\b(?:say|says|said|saying)\s+(?:me|him|her|us|them)\b/, /\b(?:tell|tells|told)\s+(?:that|about it)\b/, /\bspeak(?:s)?\s+(?:me|him|her)\b/] },
  }),
  note({
    id: "learn-teach",
    speakers: "ru",
    title: { en: "learn or teach?", ru: "learn или teach?", uz: "learn yoki teach?" },
    why: {
      en: "Russian «учить» means both to learn and to teach. In English you learn something yourself and you teach someone else: My mother taught me to cook. I am learning English.",
      ru: "Русское «учить» значит и «изучать», и «обучать». В английском learn — учиться самому, teach — учить другого: My mother taught me to cook. I am learning English.",
      uz: "Rus tilidagi «учить» ham oʻrganish, ham oʻrgatishni bildiradi. Ingliz tilida learn — oʻzingiz oʻrganasiz, teach — boshqaga oʻrgatasiz: My mother taught me to cook. I am learning English.",
    },
    examples: [{ bad: "He learned me English.", good: "He taught me English." }],
    handbook: null,
    match: { wrong: [/\blearn(?:s|ed|t|ing)?\s+(?:me|him|her|us|them|my \w+)\b/] },
  }),
  note({
    id: "borrow-lend",
    speakers: "both",
    title: { en: "borrow or lend?", ru: "borrow или lend?", uz: "borrow yoki lend?" },
    why: {
      en: "Russian «занять» and Uzbek «qarz» are used for both directions. In English you borrow from someone and lend to someone: Can you lend me 10,000 sum? Can I borrow your pen?",
      ru: "«Занять» по-русски используют в обе стороны. В английском borrow — взять у кого-то, lend — дать кому-то: Can you lend me 10,000 sum? Can I borrow your pen?",
      uz: "«Qarz» ikkala tomon uchun ham ishlatiladi. Ingliz tilida borrow — kimdandir olish, lend — kimgadir berish: Can you lend me 10,000 sum? Can I borrow your pen?",
    },
    examples: [{ bad: "Can you borrow me your book?", good: "Can you lend me your book?" }],
    handbook: null,
    match: { wrong: [/\bborrow(?:s|ed|ing)?\s+(?:me|him|her|us|them)\b/] },
  }),
  note({
    id: "how-called",
    speakers: "both",
    title: { en: "“What is it called?”", ru: "«What is it called?»", uz: "«What is it called?»" },
    why: {
      en: "Russian «Как это называется?» and Uzbek «Bu qanday ataladi?» use how. English uses what: What is it called? What do you call this in English?",
      ru: "По-русски «Как это называется?» — с «как». В английском — what: What is it called? What do you call this in English?",
      uz: "Oʻzbekcha «Bu qanday ataladi?» — «qanday» bilan. Ingliz tilida what ishlatiladi: What is it called? What do you call this in English?",
    },
    examples: [{ bad: "How do you call this?", good: "What do you call this?" }],
    handbook: null,
    match: { wrong: [/\bhow\s+(?:is|was)\s+(?:it|this|that|he|she)\s+called\b/, /\bhow\s+do\s+(?:you|they|we)\s+call\b/, /\bhow\s+(?:is|are)\s+(?:your|his|her)\s+name\b/] },
  }),

  // --- False friends ----------------------------------------------------
  note({
    id: "ff-magazine",
    speakers: "both",
    title: { en: "magazine is not a shop", ru: "magazine — не магазин", uz: "magazine — magazin emas" },
    why: {
      en: "Russian «магазин» and Uzbek «magazin» mean a shop. English magazine is a journal you read. A shop is a shop or a store.",
      ru: "«Магазин» — это shop или store. Английское magazine — это журнал.",
      uz: "«Magazin» inglizcha shop yoki store. Inglizcha magazine esa jurnal degani.",
    },
    examples: [{ bad: "I bought bread in the magazine.", good: "I bought bread in the shop." }],
    handbook: null,
    match: { wrong: [/\bmagazines?\b/], right: [/\b(?:shops?|stores?|supermarkets?|market)\b/] },
  }),
  note({
    id: "ff-familiar",
    speakers: "both",
    title: { en: "surname, not familiar", ru: "surname, а не familiar", uz: "familiar emas, surname" },
    why: {
      en: "Russian «фамилия» and Uzbek «familiya» are your surname (last name). English familiar means “known to you”: Your face looks familiar.",
      ru: "«Фамилия» — это surname или last name. Английское familiar значит «знакомый»: Your face looks familiar.",
      uz: "«Familiya» inglizcha surname yoki last name. Inglizcha familiar «tanish» degani: Your face looks familiar.",
    },
    examples: [{ bad: "What is your familiar?", good: "What is your surname?" }],
    handbook: null,
    match: { wrong: [/\bfamili(?:ar|a|ya|y)\b/], right: [/\b(?:surname|last name|family name)\b/] },
  }),
  note({
    id: "ff-cabinet",
    speakers: "both",
    title: { en: "office, not cabinet", ru: "office, а не cabinet", uz: "cabinet emas, office" },
    why: {
      en: "Russian «кабинет» and Uzbek «kabinet» are an office or a study room. English cabinet is a cupboard (or a government’s ministers).",
      ru: "«Кабинет» — это office или study. Английское cabinet — это шкаф (или кабинет министров).",
      uz: "«Kabinet» inglizcha office yoki study. Inglizcha cabinet — shkaf (yoki vazirlar mahkamasi).",
    },
    examples: [{ bad: "The director is in his cabinet.", good: "The director is in his office." }],
    handbook: null,
    match: { wrong: [/\bcabinets?\b/], right: [/\b(?:office|study|room|classroom)\b/] },
  }),
  note({
    id: "ff-fabric",
    speakers: "both",
    title: { en: "factory, not fabric", ru: "factory, а не fabric", uz: "fabric emas, factory" },
    why: {
      en: "Russian «фабрика» and Uzbek «fabrika» are a factory. English fabric is cloth, the material clothes are made from.",
      ru: "«Фабрика» — это factory. Английское fabric — это ткань.",
      uz: "«Fabrika» inglizcha factory. Inglizcha fabric — mato.",
    },
    examples: [{ bad: "My father works at a fabric.", good: "My father works at a factory." }],
    handbook: null,
    match: { wrong: [/\bfabrics?\b/], right: [/\bfactor(?:y|ies)\b/] },
  }),
  note({
    id: "ff-actual",
    speakers: "both",
    title: { en: "relevant / current, not actual", ru: "relevant / current, а не actual", uz: "actual emas, relevant / current" },
    why: {
      en: "Russian «актуальный» and Uzbek «dolzarb / aktual» mean important right now. English actual means real (the actual price). Say relevant, current or topical instead.",
      ru: "«Актуальный» значит «важный сейчас» — по-английски relevant, current, topical. Английское actual значит «настоящий, фактический» (the actual price).",
      uz: "«Dolzarb», «aktual» — inglizcha relevant, current yoki topical. Inglizcha actual «haqiqiy» degani (the actual price).",
    },
    examples: [{ bad: "This problem is very actual today.", good: "This problem is very relevant today." }],
    handbook: null,
    match: { wrong: [/\bactual\b/], right: [/\b(?:relevant|current|topical|important|urgent|up to date)\b/] },
  }),
  note({
    id: "ff-artist",
    speakers: "both",
    title: { en: "actor / performer, not artist", ru: "actor / performer, а не artist", uz: "artist emas, actor / performer" },
    why: {
      en: "Russian «артист» and Uzbek «artist» usually mean an actor or a stage performer. English artist most often means a painter or someone who makes art.",
      ru: "«Артист» — это обычно actor или performer. Английское artist чаще всего означает художника.",
      uz: "«Artist» odatda inglizcha actor yoki performer. Inglizcha artist koʻpincha rassom degani.",
    },
    examples: [{ bad: "He is a famous theatre artist.", good: "He is a famous theatre actor." }],
    handbook: null,
    match: { wrong: [/\bartists?\b/], right: [/\b(?:actors?|actress(?:es)?|performers?|singers?|musicians?)\b/] },
  }),
  note({
    id: "ff-sympathetic",
    speakers: "ru",
    title: { en: "nice-looking, not sympathetic", ru: "nice-looking, а не sympathetic", uz: "sympathetic emas, nice-looking" },
    why: {
      en: "Russian «симпатичный» means attractive or pleasant. English sympathetic means showing understanding when someone has a problem. Say nice-looking, attractive or pleasant.",
      ru: "«Симпатичный» — это nice-looking, attractive или pleasant. Английское sympathetic значит «сочувствующий».",
      uz: "Rus tilidagi «симпатичный» — inglizcha nice-looking, attractive yoki pleasant. Inglizcha sympathetic «hamdard» degani.",
    },
    examples: [{ bad: "She is a very sympathetic girl.", good: "She is a very nice-looking girl." }],
    handbook: null,
    match: { wrong: [/\bsympathetic\b/], right: [/\b(?:nice|attractive|pleasant|good-looking|nice-looking|pretty|handsome|cute|friendly|kind)\b/] },
  }),
  note({
    id: "ff-accurate",
    speakers: "ru",
    title: { en: "tidy / careful, not accurate", ru: "tidy / careful, а не accurate", uz: "accurate emas, tidy / careful" },
    why: {
      en: "Russian «аккуратный» means tidy or careful. English accurate means correct and exact (accurate information). Say tidy, neat or careful about a person.",
      ru: "«Аккуратный» — это tidy, neat или careful. Английское accurate значит «точный» (accurate information).",
      uz: "Rus tilidagi «аккуратный» — inglizcha tidy, neat yoki careful. Inglizcha accurate «aniq, toʻgʻri» degani.",
    },
    examples: [{ bad: "My brother is very accurate, his room is always clean.", good: "My brother is very tidy, his room is always clean." }],
    handbook: null,
    match: { wrong: [/\baccurate(?:ly)?\b/], right: [/\b(?:tidy|neat|careful(?:ly)?|neatly|organi[sz]ed)\b/] },
  }),
  note({
    id: "ff-intelligent",
    speakers: "ru",
    title: { en: "well-mannered, not intelligent", ru: "well-mannered, а не intelligent", uz: "intelligent emas, well-mannered" },
    why: {
      en: "Russian «интеллигентный» means cultured and well-mannered. English intelligent simply means clever. Say educated, cultured or well-mannered.",
      ru: "«Интеллигентный» — это cultured, educated или well-mannered. Английское intelligent значит просто «умный».",
      uz: "Rus tilidagi «интеллигентный» — inglizcha cultured, educated yoki well-mannered. Inglizcha intelligent shunchaki «aqlli» degani.",
    },
    examples: [{ bad: "He never shouts, he is very intelligent.", good: "He never shouts, he is very well-mannered." }],
    handbook: null,
    match: { wrong: [/\bintelligent\b/], right: [/\b(?:well-mannered|polite|cultured|educated|well-educated|well mannered)\b/] },
  }),
  note({
    id: "ff-decade",
    speakers: "ru",
    title: { en: "decade = 10 years", ru: "decade — это 10 лет", uz: "decade — 10 yil" },
    why: {
      en: "Russian «декада» is ten days. English decade is ten years. For ten days just say ten days.",
      ru: "«Декада» по-русски — десять дней. Английское decade — это десять лет. Для десяти дней говорят ten days.",
      uz: "Rus tilida «декада» oʻn kun. Inglizcha decade esa oʻn yil. Oʻn kun uchun ten days deyiladi.",
    },
    examples: [{ bad: "The festival lasts a decade, from 1 to 10 May.", good: "The festival lasts ten days, from 1 to 10 May." }],
    handbook: null,
    match: { wrong: [/\bdecades?\b/], right: [/\b(?:ten|10)\s+days\b/] },
  }),
  note({
    id: "ff-prospect",
    speakers: "both",
    title: { en: "avenue, not prospect", ru: "avenue, а не prospect", uz: "prospect emas, avenue" },
    why: {
      en: "Russian «проспект» and Uzbek «prospekt» are a wide street. English prospect means a chance or possibility (job prospects). Say avenue or street.",
      ru: "«Проспект» — это avenue. Английское prospect значит «перспектива» (job prospects).",
      uz: "«Prospekt» inglizcha avenue. Inglizcha prospect «istiqbol, imkoniyat» degani (job prospects).",
    },
    examples: [{ bad: "I live on Amir Temur prospect.", good: "I live on Amir Temur Avenue." }],
    handbook: null,
    match: { wrong: [/\bprospects?\b/], right: [/\b(?:avenue|street|road)\b/] },
  }),
  note({
    id: "ff-control",
    speakers: "both",
    title: { en: "test, not control work", ru: "test, а не control work", uz: "control work emas, test" },
    why: {
      en: "Russian «контрольная» and Uzbek «nazorat ishi» are a test at school. English control means to manage or limit something. Say test, quiz or exam.",
      ru: "«Контрольная» — это test, quiz или exam. Английское control значит «управлять, контролировать».",
      uz: "«Nazorat ishi» inglizcha test, quiz yoki exam. Inglizcha control «boshqarmoq, nazorat qilmoq» degani.",
    },
    examples: [{ bad: "Tomorrow we have a control work in maths.", good: "Tomorrow we have a maths test." }],
    handbook: null,
    match: { wrong: [/\bcontrol\s+(?:work|test|paper)\b/], right: [/\b(?:test|quiz|exam)\b/] },
  }),
];

export const L1_NOTE_BY_ID: ReadonlyMap<string, L1Note> = new Map(L1_NOTES.map((entry) => [entry.id, entry]));

export const l1NoteById = (id: string): L1Note | null => L1_NOTE_BY_ID.get(id) ?? null;

export type L1MatchInput = {
  /** What the learner said or wrote. */
  original?: string | null;
  /** The corrected version. */
  corrected?: string | null;
  /** The feedback's explanation, if any. */
  explanation?: string | null;
  /** Grammar topic (english-mistakes.ts GRAMMAR_TOPICS), if known. */
  topic?: string | null;
};

const clean = (text: string | null | undefined): string =>
  String(text ?? "")
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/[“”«»"]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const words = (text: string): string[] => text.replace(/[^a-z0-9'\s-]+/g, " ").split(/\s+/).filter(Boolean);

const minus = (a: string[], b: string[]): string[] => {
  const rest = [...b];
  const out: string[] = [];
  for (const word of a) {
    const index = rest.indexOf(word);
    if (index >= 0) rest.splice(index, 1);
    else out.push(word);
  }
  return out;
};

/**
 * Reads a stored mistake such as `"I has" → "I have"` (learner_language_errors.error_type)
 * into its two sides. Text without an arrow is returned as the learner's version.
 */
export const splitMistake = (text: string | null | undefined): { original: string; corrected: string } => {
  const raw = String(text ?? "");
  const parts = raw.split(/\s*(?:→|->)\s*/);
  const unquote = (value: string) => value.trim().replace(/^["“«']+|["”»']+$/g, "").trim();
  if (parts.length >= 2) return { original: unquote(parts[0]!), corrected: unquote(parts.slice(1).join(" ")) };
  return { original: unquote(raw), corrected: "" };
};

/** How well one note explains the mistake (0 = not at all). */
const scoreNote = (n: L1Note, wrong: string, right: string, added: string[], removed: string[], explanation: string, topic: string): number => {
  const m = n.match;
  const groups: boolean[] = [];
  if (m.wrong) groups.push(wrong.length > 0 && m.wrong.some((re) => re.test(wrong)));
  if (m.right) groups.push(right.length > 0 && m.right.some((re) => re.test(right)));
  if (m.added) groups.push(m.added.some((word) => added.includes(word)));
  if (m.removed) groups.push(m.removed.some((word) => removed.includes(word)));
  const textMatch = groups.length > 0 && groups.every(Boolean);
  // A pattern on the learner's own words is the strongest signal.
  let score = textMatch ? (m.wrong ? 4 : 3) : 0;
  if (m.explain && explanation && m.explain.some((re) => re.test(explanation))) score += 2;
  const topicMatch = Boolean(topic && m.topics?.includes(topic));
  if (topicMatch && score > 0) score += 1;
  if (score === 0 && topicMatch && n.generic) score = 1;
  return score;
};

/**
 * Notes that explain one mistake, best first. A specific pattern beats a
 * topic's generic note; with `limit` 1 (default) the best one is returned.
 */
export const matchL1Notes = (input: L1MatchInput, limit = 1): L1Note[] => {
  const wrong = clean(input.original);
  const right = clean(input.corrected);
  const explanation = clean(input.explanation);
  const topic = clean(input.topic);
  if (!wrong && !right && !explanation && !topic) return [];
  const before = words(wrong);
  const after = words(right);
  const added = right ? minus(after, before) : [];
  const removed = right ? minus(before, after) : [];
  return L1_NOTES
    .map((n, index) => ({ n, index, score: scoreNote(n, wrong, right, added, removed, explanation, topic) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, Math.max(1, limit))
    .map((entry) => entry.n);
};

/** The best note id for a stored mistake row (topic from its subskill, text from error_type), or null. */
export const l1NoteIdForError = (row: { subskill_key?: unknown; error_type?: unknown }): string | null => {
  const subskill = String(row.subskill_key ?? "");
  const topic = subskill.startsWith("grammar.") ? subskill.slice("grammar.".length) : null;
  const { original, corrected } = splitMistake(String(row.error_type ?? ""));
  // Without an arrow the text is a description, not the learner's words.
  return matchL1Notes(corrected ? { original, corrected, topic } : { explanation: original, topic })[0]?.id ?? null;
};

export type L1Trap = { id: string; count: number; example: string | null };

/**
 * The learner's typical traps: notes matched by their recorded mistakes,
 * weighted by how often each mistake happened, most frequent first.
 */
export const topL1Traps = (
  rows: Array<{ subskill_key?: unknown; error_type?: unknown; error_frequency?: unknown }>,
  limit = 3,
): L1Trap[] => {
  const byId = new Map<string, L1Trap>();
  for (const row of rows) {
    const id = l1NoteIdForError(row);
    if (!id) continue;
    const times = Math.max(1, Math.min(1000, Math.floor(Number(row.error_frequency ?? 1)) || 1));
    const entry = byId.get(id) ?? { id, count: 0, example: null };
    entry.count += times;
    const text = String(row.error_type ?? "").trim();
    if (!entry.example && /→|->/.test(text)) entry.example = text.slice(0, 200);
    byId.set(id, entry);
  }
  return [...byId.values()].sort((a, b) => b.count - a.count || a.id.localeCompare(b.id)).slice(0, Math.max(1, limit));
};
