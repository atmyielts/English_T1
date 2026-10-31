import type { Activity } from '../src/types.ts';

// Timed IELTS Academic Reading mini-sets: one original passage (330–480 words) and
// 6–7 questions in 12 minutes. Every answer is proved by `evidence`, a verbatim
// quote from the passage, and every explanation says why the tempting wrong
// answer is wrong. Passages are original Schood texts on general academic topics.

const TFNG: string[] = ['True', 'False', 'Not Given'];
const YNNG: string[] = ['Yes', 'No', 'Not Given'];
const PARAGRAPHS_5: string[] = ['A', 'B', 'C', 'D', 'E'];
const PARAGRAPHS_6: string[] = ['A', 'B', 'C', 'D', 'E', 'F'];

const COOL_CITY_HEADINGS: string[] = [
  'A natural method that takes years to mature',
  'How city surfaces store heat and release it at night',
  'Why no single measure will solve the problem',
  'The rising price of reflective roofing',
  'Risks to health and to the power supply',
  'Restoring rivers hidden under the streets',
];

const MANGROVE_HEADINGS: string[] = [
  'A store of carbon beneath the trees',
  'Protection for coastlines and food supplies',
  'The rising value of mangrove timber',
  'A loss that was hidden by its gradual pace',
  'Adaptations to a hostile environment',
  'Why planting seedlings is not always the best method',
];

const SEED_BANK_HEADINGS: string[] = [
  'Species that need special treatment',
  'Keeping stored seeds alive over time',
  'A backup that is rarely opened',
  'The basic technique of preservation',
  'Why seeds in the field still matter',
  'Higher yields from traditional varieties',
];

export const reading: Activity[] = [
  // --- 1. Urban planning: headings, TFNG, sentence completion ---------------------------------------
  {
    id: 'ielts.r.cooling-the-city',
    kind: 'quiz_set',
    mode: 'reading',
    node: 'reading',
    title: { en: 'Cooling the city', uz: 'Shaharni sovutish', ru: 'Как охладить город' },
    levels: [5, 7.5],
    minutes: 12,
    timeLimitSeconds: 720,
    tags: ['academic', 'urban-planning'],
    passage: {
      title: 'Cooling the City',
      text: [
        'A Cities are often several degrees warmer than the countryside around them, a pattern known as the urban heat island. The difference is usually greatest at night. During the day, asphalt, brick and concrete absorb sunlight, and after sunset they release that stored heat slowly, so the air in a dense street may stay warm long after the surrounding fields have cooled. Waste heat from engines, air conditioners and factories adds to the effect.',
        'B The consequences go well beyond discomfort. Hot nights prevent the body from recovering after a hot day, which is why heatwaves are especially dangerous for elderly people living alone in upper-floor flats. Demand for electricity also rises sharply as residents switch on cooling, and the extra power stations that run at peak times are frequently the least efficient and most polluting ones.',
        'C One of the cheapest responses is to change the colour of the city. Dark roofs can absorb most of the sunlight that falls on them, whereas a roof painted with a reflective white coating sends much of that energy back into the sky. Trials in several hot countries have shown that such “cool roofs” lower temperatures inside the top floor of a building, although their effect on the street below is smaller and depends on how many neighbouring buildings take part.',
        'D Vegetation works in a different way. Trees cool the air partly by shading surfaces and partly through transpiration: they draw water from the soil and release it through their leaves, and the evaporation of that water takes heat from the surrounding air. A single mature street tree can therefore do more than a large area of short grass. The difficulty is that trees take decades to reach full size, and in narrow streets their roots compete with pipes and cables for space underground.',
        'E Water itself can be used as a cooling tool. Some planners are reopening streams that were buried in concrete channels during the last century, creating linear parks where residents can walk beside running water. Fountains and shallow pools have a similar but more local effect, and they need regular maintenance to remain safe and clean.',
        'F None of these measures is enough on its own. Researchers who model city climates argue that the most effective plans combine reflective materials, planting and water with changes to the shape of new districts, such as leaving wider gaps between tall buildings so that evening breezes can carry heat away. The challenge for city governments is less technical than political, since the benefits are spread across many years and many neighbourhoods.',
      ].join('\n\n'),
    },
    questions: [
      {
        id: 'q1', type: 'matching_headings', prompt: 'Paragraph B', options: COOL_CITY_HEADINGS, answer: 4,
        evidence: 'The consequences go well beyond discomfort',
        explanation: {
          en: 'Paragraph B is about the effects of urban heat: hot nights endanger elderly people, and electricity demand rises and is met by polluting power stations. It does not explain how surfaces store heat; that is paragraph A, which B only refers back to.',
          uz: 'B paragraf shahar issiqligining oqibatlari haqida: issiq tunlar keksalar uchun xavfli, elektr energiyasiga talab oshadi va uni ifloslantiruvchi elektr stansiyalari qoplaydi. Unda sirtlar issiqlikni qanday saqlashi tushuntirilmaydi; bu A paragrafning mavzusi, B esa unga faqat ishora qiladi.',
          ru: 'Абзац B — о последствиях городской жары: жаркие ночи опасны для пожилых, спрос на электричество растёт и покрывается загрязняющими электростанциями. Как поверхности накапливают тепло, здесь не объясняется — это тема абзаца A, на который B лишь ссылается.',
        },
      },
      {
        id: 'q2', type: 'matching_headings', prompt: 'Paragraph D', options: COOL_CITY_HEADINGS, answer: 0,
        evidence: 'The difficulty is that trees take decades to reach full size',
        explanation: {
          en: 'Paragraph D explains how trees cool the air and then says they “take decades to reach full size”: a natural method that is slow to mature. “Restoring rivers” is tempting because transpiration involves water, but buried streams are the topic of paragraph E.',
          uz: 'D paragraf daraxtlar havoni qanday sovutishini tushuntiradi, so‘ng ular to‘liq o‘sishi uchun «o‘nlab yillar» kerakligini aytadi: sekin yetiladigan tabiiy usul. «Daryolarni tiklash» sarlavhasi jalb qilishi mumkin, chunki transpiratsiya suv bilan bog‘liq, lekin ko‘milgan soylar E paragrafning mavzusi.',
          ru: 'Абзац D объясняет, как деревья охлаждают воздух, а затем говорит, что им нужны «десятилетия», чтобы вырасти: природный метод, который долго созревает. Заголовок про реки соблазнителен, потому что транспирация связана с водой, но засыпанные ручьи — тема абзаца E.',
        },
      },
      {
        id: 'q3', type: 'matching_headings', prompt: 'Paragraph F', options: COOL_CITY_HEADINGS, answer: 2,
        evidence: 'None of these measures is enough on its own',
        explanation: {
          en: 'Paragraph F opens with “None of these measures is enough on its own” and argues for combining them. The rising price of reflective roofing is never mentioned; paragraph C actually calls changing the colour of the city one of the cheapest responses.',
          uz: 'F paragraf «bu choralarning hech biri yolg‘iz o‘zi yetarli emas» degan gap bilan boshlanadi va ularni birlashtirish kerakligini asoslaydi. Aks ettiruvchi tom narxining oshishi umuman tilga olinmagan; aksincha, C paragraf shahar rangini o‘zgartirishni eng arzon choralardan biri deydi.',
          ru: 'Абзац F начинается словами «ни одна из этих мер не достаточна сама по себе» и доказывает, что их нужно сочетать. О росте цен на отражающие крыши не сказано ничего; наоборот, в абзаце C смена цвета города названа одной из самых дешёвых мер.',
        },
      },
      {
        id: 'q4', type: 'true_false_not_given', prompt: 'After sunset, cities cool down faster than the surrounding countryside.', options: TFNG, answer: 1,
        evidence: 'the air in a dense street may stay warm long after the surrounding fields have cooled',
        explanation: {
          en: 'False. City surfaces release their heat slowly, so a street stays warm “long after the surrounding fields have cooled”: the countryside cools faster, not the city. The passage states the opposite of the statement, so the answer is False rather than Not Given.',
          uz: 'False. Shahar sirtlari issiqlikni sekin chiqaradi, shuning uchun ko‘cha «atrofdagi dalalar sovigandan keyin ham uzoq vaqt» issiq qoladi: shahar emas, qishloq tezroq soviydi. Matn bayonotning teskarisini aytadi, demak javob Not Given emas, False.',
          ru: 'False. Городские поверхности отдают тепло медленно, поэтому улица остаётся тёплой «ещё долго после того, как окрестные поля остыли»: быстрее остывает загородная местность, а не город. Текст утверждает обратное, поэтому ответ False, а не Not Given.',
        },
      },
      {
        id: 'q5', type: 'true_false_not_given', prompt: 'Cool roofs were first developed in hot countries.', options: TFNG, answer: 2,
        evidence: 'Trials in several hot countries have shown',
        explanation: {
          en: 'Not Given. The passage says cool roofs were tested in “several hot countries”, but it never says where they were first developed. Being tried somewhere is not the same as being invented there, so you cannot answer True.',
          uz: 'Not Given. Matnda «sovuq tomlar» «bir nechta issiq mamlakatda» sinovdan o‘tkazilgani aytiladi, lekin ular dastlab qayerda ishlab chiqilgani haqida hech narsa yo‘q. Biror joyda sinalgan bo‘lish u yerda ixtiro qilingan degani emas, shuning uchun True deb bo‘lmaydi.',
          ru: 'Not Given. В тексте сказано, что «холодные крыши» испытывали «в нескольких жарких странах», но не сказано, где их впервые разработали. Испытание в какой-то стране не означает изобретение там, поэтому ответить True нельзя.',
        },
      },
      {
        id: 'q6', type: 'sentence_completion', wordLimit: 1,
        prompt: 'Complete the sentence. Write ONE WORD ONLY from the passage.\nApart from giving shade, trees cool the air through a process called ____.',
        answer: ['transpiration'],
        evidence: 'partly by shading surfaces and partly through transpiration',
        explanation: {
          en: '“Transpiration” is the process in which trees draw water from the soil and release it through their leaves. “Evaporation” is tempting, but in the passage evaporation is one part of the process that is named transpiration.',
          uz: '«Transpiration» — daraxtlar suvni tuproqdan tortib, barglari orqali chiqaradigan jarayon. «Evaporation» so‘zi jalb qilishi mumkin, lekin matnda bug‘lanish transpiratsiya deb nomlangan jarayonning bir qismi xolos.',
          ru: '«Transpiration» — процесс, при котором деревья берут воду из почвы и выделяют её через листья. Слово «evaporation» соблазнительно, но в тексте испарение — лишь часть процесса, который называется транспирацией.',
        },
      },
      {
        id: 'q7', type: 'sentence_completion', wordLimit: 2,
        prompt: 'Complete the sentence. Write NO MORE THAN TWO WORDS from the passage.\nLeaving more space between tall buildings would allow ____ to remove heat from new districts.',
        answer: ['evening breezes', 'breezes'],
        evidence: 'so that evening breezes can carry heat away',
        explanation: {
          en: 'The passage suggests wider gaps between tall buildings “so that evening breezes can carry heat away”; “remove heat” paraphrases “carry heat away”. Do not write “wider gaps”: the gaps let the breezes through, but it is the breezes that remove the heat.',
          uz: 'Matnda baland binolar orasida kengroq oraliq qoldirish taklif qilinadi, «toki kechki shabadalar issiqlikni olib ketsin»; «remove heat» — «carry heat away»ning parafrazi. «Wider gaps» deb yozmang: oraliqlar shabadani o‘tkazadi, issiqlikni esa shabadaning o‘zi olib ketadi.',
          ru: 'В тексте предлагается оставлять более широкие промежутки между высотками, «чтобы вечерний ветер уносил тепло»; «remove heat» — перефраз «carry heat away». Не пишите «wider gaps»: промежутки пропускают ветер, а тепло уносит именно ветер.',
        },
      },
    ],
  },

  // --- 2. Linguistics: YNNG, MCQ, summary completion -----------------------------------------------
  {
    id: 'ielts.r.bringing-languages-back',
    kind: 'quiz_set',
    mode: 'reading',
    node: 'reading',
    title: { en: 'Bringing languages back', uz: 'Tillarni qayta tiklash', ru: 'Возрождение языков' },
    levels: [6, 8.5],
    minutes: 12,
    timeLimitSeconds: 720,
    tags: ['academic', 'linguistics'],
    passage: {
      title: 'Bringing Languages Back',
      text: [
        'Of the several thousand languages spoken in the world today, a large share have fewer than ten thousand speakers, and many are used only by elderly people. When children stop learning a language at home, its decline can be rapid: within two or three generations it may survive only in recordings and word lists. Linguists describe such languages as endangered, and they warn that many could disappear before the end of this century.',
        'It is tempting to treat this as an unavoidable side effect of modern life, in the same way that old crafts vanish when factories arrive. In my view, that comparison is misleading. A language is not a tool that a community abandons because a better one has been invented; it is usually given up under pressure, when parents believe, often correctly, that their children will be punished or disadvantaged for speaking it. What was lost through pressure can, at least in part, be recovered through deliberate effort.',
        'The most celebrated example is Hebrew, which for centuries was used mainly in prayer and scholarship before it became the everyday language of millions. Supporters of revival projects quote this case constantly, but it is a poor guide for most communities. Hebrew had a vast written literature, a large population willing to adopt it and strong political backing, advantages that a small village language rarely enjoys.',
        'More instructive are smaller programmes built around early childhood. In so-called language nests, pre-school children spend their days with fluent elders who speak only the heritage language, so that the children acquire it naturally rather than studying it as a school subject. Programmes of this kind have produced young speakers in communities where none had been born for decades. Their weakness is that they depend heavily on a shrinking number of elderly teachers, and the children may have nobody to speak with once they start ordinary school.',
        'Technology is frequently presented as the answer. Dictionaries on mobile phones, online courses and subtitled videos certainly make a language more visible, and they allow scattered speakers to stay in contact. Yet an app cannot replace a household in which the language is used for arguing, joking and comforting a crying child. Digital tools are best seen as support for spoken use, not a substitute for it.',
        'Ultimately, revival succeeds when a language becomes useful again: when it is heard in shops, at work and on local radio, and when speaking it brings respect rather than embarrassment. Linguists can document grammar and train teachers, but only the community itself can decide to make the language part of daily life.',
      ].join('\n\n'),
    },
    questions: [
      {
        id: 'q1', type: 'yes_no_not_given', prompt: 'The loss of a language is similar to the way traditional crafts disappear when factories arrive.', options: YNNG, answer: 1,
        evidence: 'In my view, that comparison is misleading',
        explanation: {
          en: 'No. The writer mentions this comparison only to reject it: “In my view, that comparison is misleading”, because languages are usually given up under pressure. Do not choose Yes just because the comparison appears in the passage; check what the writer thinks of it.',
          uz: 'No. Muallif bu taqqoslashni faqat rad etish uchun keltiradi: «Menimcha, bu taqqoslash chalg‘ituvchi», chunki tillardan odatda bosim ostida voz kechiladi. Taqqoslash matnda borligi uchungina Yes’ni tanlamang; muallif u haqda nima deb o‘ylashini tekshiring.',
          ru: 'No. Автор приводит это сравнение только для того, чтобы его отвергнуть: «На мой взгляд, это сравнение вводит в заблуждение», ведь от языка обычно отказываются под давлением. Не выбирайте Yes только потому, что сравнение есть в тексте, — проверьте, как к нему относится автор.',
        },
      },
      {
        id: 'q2', type: 'yes_no_not_given', prompt: 'Parents who stop passing on a heritage language often have good reason to fear for their children.', options: YNNG, answer: 0,
        evidence: 'when parents believe, often correctly, that their children will be punished or disadvantaged',
        explanation: {
          en: 'Yes. The writer says parents believe, “often correctly”, that their children will be punished or disadvantaged. The words “often correctly” are the writer’s own judgement that these fears are frequently justified.',
          uz: 'Yes. Muallif ota-onalar farzandlari jazolanishi yoki noqulay ahvolga tushishiga «ko‘pincha to‘g‘ri» ishonishini aytadi. «Often correctly» so‘zlari — bu qo‘rquvlar ko‘pincha asosli degan muallifning o‘z bahosi.',
          ru: 'Yes. Автор пишет, что родители считают, «часто справедливо», что детей накажут или поставят в невыгодное положение. Слова «often correctly» — собственная оценка автора: эти опасения часто обоснованы.',
        },
      },
      {
        id: 'q3', type: 'yes_no_not_given', prompt: 'Governments should spend more money on language revival than they do at present.', options: YNNG, answer: 2,
        evidence: 'strong political backing',
        explanation: {
          en: 'Not Given. The writer mentions the “strong political backing” that Hebrew had, but never says how much governments spend now or whether they should spend more. A related idea in the passage is not the same as an opinion on funding.',
          uz: 'Not Given. Muallif ibroniy tilining «kuchli siyosiy qo‘llab-quvvatlovi» bo‘lganini aytadi, lekin hukumatlar hozir qancha mablag‘ sarflashi yoki ko‘proq sarflashi kerakmi, bu haqda hech narsa demaydi. Matndagi o‘xshash g‘oya moliyalashtirish haqidagi fikr degani emas.',
          ru: 'Not Given. Автор упоминает «сильную политическую поддержку» иврита, но нигде не говорит, сколько правительства тратят сейчас и должны ли тратить больше. Близкая по теме мысль в тексте — ещё не мнение о финансировании.',
        },
      },
      {
        id: 'q4', type: 'multiple_choice', prompt: 'Why does the writer think Hebrew is a poor guide for most revival projects?',
        options: [
          'Hebrew was used mainly for prayer and scholarship for centuries.',
          'Most communities lack the literature, numbers and support that Hebrew had.',
          'Supporters of revival rarely mention Hebrew as an example.',
          'Hebrew took too long to become an everyday language.',
        ],
        answer: 1,
        evidence: 'advantages that a small village language rarely enjoys',
        explanation: {
          en: 'The writer lists Hebrew’s advantages (a vast literature, a large willing population, political backing) and says a small village language “rarely enjoys” them. Option A is true but is background, not the reason; option C contradicts the passage, which says supporters quote it “constantly”.',
          uz: 'Muallif ibroniy tilining afzalliklarini sanaydi (boy adabiyot, uni qabul qilishga tayyor katta aholi, siyosiy qo‘llab-quvvatlov) va kichik qishloq tilida bular «kamdan-kam» bo‘lishini aytadi. A variant to‘g‘ri fakt, lekin sabab emas, shunchaki fon; C esa matnga zid, chunki tarafdorlar bu misolni «doimo» keltiradi.',
          ru: 'Автор перечисляет преимущества иврита (огромная литература, большое население, готовое его принять, политическая поддержка) и говорит, что у маленького сельского языка они бывают «редко». Вариант A верен, но это фон, а не причина; C противоречит тексту: сторонники цитируют этот пример «постоянно».',
        },
      },
      {
        id: 'q5', type: 'multiple_choice', prompt: 'What does the writer see as the main weakness of language nests?',
        options: [
          'Children learn the language only as a school subject.',
          'They have not produced any new young speakers.',
          'They depend on a small and decreasing number of older teachers.',
          'They cost more than most communities can afford.',
        ],
        answer: 2,
        evidence: 'they depend heavily on a shrinking number of elderly teachers',
        explanation: {
          en: 'The weakness is that “they depend heavily on a shrinking number of elderly teachers”. Option A is the opposite of how nests work, B contradicts the statement that they have produced young speakers, and cost is never mentioned.',
          uz: 'Zaif tomoni shundaki, ular «soni kamayib borayotgan keksa o‘qituvchilarga qattiq bog‘liq». A variant «til uyalari»ning ishlash usuliga teskari, B ular tilda so‘zlashadigan yoshlarni yetishtirgani haqidagi gapga zid, xarajat esa umuman tilga olinmagan.',
          ru: 'Слабость в том, что «они сильно зависят от сокращающегося числа пожилых учителей». Вариант A противоположен тому, как работают «языковые гнёзда», B противоречит фразе о появлении юных носителей, а о стоимости не сказано вовсе.',
        },
      },
      {
        id: 'q6', type: 'summary_completion', wordLimit: 1,
        prompt: 'Complete the summary. Write ONE WORD ONLY from the passage.\nDigital tools such as phone dictionaries and online courses make a language more ____ and help speakers who live far apart to keep in touch.',
        answer: ['visible'],
        evidence: 'certainly make a language more visible',
        explanation: {
          en: 'These tools “make a language more visible”. The gap follows “more”, so it needs an adjective; “contact” is a noun, and it belongs to the second half of the sentence (“stay in contact” = “keep in touch”).',
          uz: 'Bu vositalar «tilni ko‘proq ko‘rinadigan qiladi» (make a language more visible). Bo‘sh joy «more»dan keyin keladi, demak sifat kerak; «contact» esa ot va u gapning ikkinchi qismiga tegishli («stay in contact» = «keep in touch»).',
          ru: 'Эти инструменты «делают язык более заметным» (more visible). Пропуск стоит после «more», значит нужно прилагательное; «contact» — существительное и относится ко второй половине предложения («stay in contact» = «keep in touch»).',
        },
      },
      {
        id: 'q7', type: 'summary_completion', wordLimit: 1,
        prompt: 'Complete the summary. Write ONE WORD ONLY from the passage.\nHowever, no app can take the place of a ____ where the language is used for everyday arguments, jokes and comfort.',
        answer: ['household'],
        evidence: 'an app cannot replace a household in which the language is used',
        explanation: {
          en: '“An app cannot replace a household in which the language is used for arguing, joking and comforting a crying child.” “Community” is tempting because it appears in the last paragraph, but the passage contrasts apps specifically with a household.',
          uz: '«Ilova tilda bahslashadigan, hazillashadigan va yig‘layotgan bolani ovutadigan oilani almashtira olmaydi.» «Community» so‘zi oxirgi paragrafda borligi uchun jalb qilishi mumkin, lekin matnda ilovalar aynan household (oila, xonadon) bilan qiyoslanadi.',
          ru: '«Приложение не заменит семью, в которой на языке спорят, шутят и утешают плачущего ребёнка». Слово «community» соблазнительно, ведь оно есть в последнем абзаце, но в тексте приложения противопоставлены именно household — дому, семье.',
        },
      },
    ],
  },

  // --- 3. Psychology: TFNG, short answer, MCQ -------------------------------------------------------
  {
    id: 'ielts.r.sleep-and-memory',
    kind: 'quiz_set',
    mode: 'reading',
    node: 'reading',
    title: { en: 'Why we sleep on it', uz: 'Uyqu va xotira', ru: 'Сон и память' },
    levels: [5, 7.5],
    minutes: 12,
    timeLimitSeconds: 720,
    tags: ['academic', 'psychology'],
    passage: {
      title: 'Why We Sleep on It',
      text: [
        'For most of the twentieth century, sleep was regarded as a passive state in which the brain simply rested. That view has changed considerably. Laboratory studies now suggest that sleep plays an active part in memory, helping the brain to strengthen some of the information gathered during the day and to discard much of the rest.',
        'In a typical experiment, volunteers learn a list of word pairs or a sequence of finger movements in the evening. Half of them then sleep normally, while the others stay awake under supervision. When both groups are tested the next morning, those who slept usually remember more, and the advantage is often largest for material that was only partly learned before bed. Critics once objected that the sleep-deprived group might simply be too tired to perform well. Researchers answered this by testing people after a day of normal waking activity instead of a sleepless night, and the benefit of sleep remained.',
        'Different stages of sleep appear to support different kinds of memory. Deep, slow-wave sleep, which dominates the early part of the night, seems especially important for facts and events. Recordings show that during this stage the hippocampus, a small structure deep in the brain, replays patterns of activity that were first produced while learning. Rapid eye movement sleep, which becomes longer towards morning, has been linked more often to skills and to emotional memories, although the evidence here is less consistent.',
        'Sleep may also help people to see connections they missed. In one well-known type of study, participants work through a mathematical task that contains a hidden shortcut. Those who sleep between two sessions are more likely to discover the shortcut than those who spend the same time awake, which suggests that sleep reorganises information rather than merely storing it.',
        'These findings have practical implications for students. Staying up all night before an examination may provide extra hours of revision, but it removes the very period in which the brain consolidates what has been studied. Spreading study over several days, with normal sleep in between, is likely to produce more durable learning. Short daytime naps have shown benefits in some studies, though it remains unclear whether they can fully replace a night of sleep.',
      ].join('\n\n'),
    },
    questions: [
      {
        id: 'q1', type: 'true_false_not_given', prompt: 'For most of the twentieth century, scientists believed the brain was active during sleep.', options: TFNG, answer: 1,
        evidence: 'sleep was regarded as a passive state in which the brain simply rested',
        explanation: {
          en: 'False. Sleep “was regarded as a passive state in which the brain simply rested”. The active view is the modern one described in the next sentences, not the twentieth-century belief, so the statement contradicts the passage.',
          uz: 'False. Uyqu «miya shunchaki dam oladigan passiv holat deb hisoblangan». Faol miya haqidagi qarash keyingi gaplarda tasvirlangan zamonaviy qarash, XX asrdagi tasavvur emas, shuning uchun bayonot matnga zid.',
          ru: 'False. Сон «считался пассивным состоянием, в котором мозг просто отдыхает». Представление об активном мозге — современное, оно описано в следующих предложениях; в XX веке считали иначе, так что утверждение противоречит тексту.',
        },
      },
      {
        id: 'q2', type: 'true_false_not_given', prompt: 'The benefit of sleep is often greatest for material that was not fully learned before bed.', options: TFNG, answer: 0,
        evidence: 'the advantage is often largest for material that was only partly learned before bed',
        explanation: {
          en: 'True. “The advantage is often largest for material that was only partly learned before bed.” “Not fully learned” paraphrases “only partly learned”, and “greatest” matches “largest”; the word “often” appears in both, so nothing is overstated.',
          uz: 'True. «Ustunlik ko‘pincha uyqudan oldin faqat qisman o‘rganilgan material uchun eng katta bo‘ladi.» «Not fully learned» — «only partly learned»ning parafrazi, «greatest» esa «largest»ga mos; «often» ikkalasida ham bor, demak hech narsa bo‘rttirilmagan.',
          ru: 'True. «Преимущество часто наибольшее для материала, который до сна был выучен лишь частично». «Not fully learned» перефразирует «only partly learned», «greatest» соответствует «largest», а слово «often» есть в обоих, так что преувеличения нет.',
        },
      },
      {
        id: 'q3', type: 'true_false_not_given', prompt: 'Most volunteers in these sleep experiments are university students.', options: TFNG, answer: 2,
        evidence: 'volunteers learn a list of word pairs or a sequence of finger movements in the evening',
        explanation: {
          en: 'Not Given. The passage describes what the volunteers do (learn word pairs or finger movements) but says nothing about who they are. Even if you know that many such studies use students, IELTS answers must come only from the passage.',
          uz: 'Not Given. Matnda ko‘ngillilar nima qilishi (so‘z juftlari yoki barmoq harakatlarini o‘rganishi) tasvirlangan, lekin ular kimligi haqida hech narsa aytilmagan. Bunday tadqiqotlarda ko‘pincha talabalar qatnashishini bilsangiz ham, IELTS javoblari faqat matndan olinadi.',
          ru: 'Not Given. В тексте описано, что делают добровольцы (учат пары слов или движения пальцев), но не сказано, кто они. Даже если вы знаете, что в таких исследованиях часто участвуют студенты, ответы IELTS берутся только из текста.',
        },
      },
      {
        id: 'q4', type: 'short_answer', wordLimit: 1,
        prompt: 'Answer the question. Write ONE WORD ONLY from the passage.\nWhich part of the brain replays learning activity during slow-wave sleep?',
        answer: ['hippocampus'],
        evidence: 'the hippocampus, a small structure deep in the brain, replays patterns of activity',
        explanation: {
          en: '“The hippocampus, a small structure deep in the brain, replays patterns of activity” from learning. The name is one word, so it fits the limit; do not write “structure”, which is only a description of it.',
          uz: '«Hippokamp — miyaning chuqur qismidagi kichik tuzilma — o‘rganish paytidagi faollik naqshlarini takrorlaydi.» Nomi bitta so‘z, demak chegaraga sig‘adi; «structure» deb yozmang, bu faqat uning tavsifi.',
          ru: '«Гиппокамп, небольшая структура в глубине мозга, воспроизводит паттерны активности», возникшие при обучении. Название — одно слово и укладывается в лимит; не пишите «structure» — это лишь описание.',
        },
      },
      {
        id: 'q5', type: 'short_answer', wordLimit: 3,
        prompt: 'Answer the question. Write NO MORE THAN THREE WORDS from the passage.\nWhat has helped memory in some studies, although it may not fully replace a night of sleep?',
        answer: ['short daytime naps', 'daytime naps', 'naps'],
        evidence: 'Short daytime naps have shown benefits in some studies',
        explanation: {
          en: '“Short daytime naps have shown benefits in some studies, though it remains unclear whether they can fully replace a night of sleep.” Avoid “extra hours of revision”: the passage presents these as what students gain by staying up, at the cost of sleep.',
          uz: '«Ba’zi tadqiqotlarda qisqa kunduzgi uyqu foyda bergan, ammo u tungi uyquni to‘liq almashtira oladimi, hali noaniq.» «Extra hours of revision» deb yozmang: matnda bu uyqu hisobiga, tun bo‘yi uxlamay olinadigan narsa sifatida berilgan.',
          ru: '«Короткий дневной сон в некоторых исследованиях принёс пользу, но неясно, может ли он полностью заменить ночной». Не пишите «extra hours of revision»: в тексте это то, что студенты получают, не ложась спать, ценой сна.',
        },
      },
      {
        id: 'q6', type: 'multiple_choice', prompt: 'How did researchers answer the criticism that sleep-deprived volunteers were simply too tired?',
        options: [
          'They let both groups sleep for a short time before the test.',
          'They compared sleep with a normal day awake instead of a sleepless night.',
          'They gave the tired group more time to answer.',
          'They replaced word pairs with finger movements.',
        ],
        answer: 1,
        evidence: 'Researchers answered this by testing people after a day of normal waking activity instead of a sleepless night',
        explanation: {
          en: 'Researchers tested people “after a day of normal waking activity instead of a sleepless night”, and sleep still helped. Option D uses words from the passage, but word pairs and finger movements are two kinds of material in the original design, not the answer to the criticism.',
          uz: 'Tadqiqotchilar odamlarni «uyqusiz tundan keyin emas, oddiy bedor kundan keyin» sinashdi va uyqu baribir foyda berdi. D variant matndagi so‘zlarni ishlatadi, lekin so‘z juftlari va barmoq harakatlari dastlabki tajribadagi ikki xil material, tanqidga javob emas.',
          ru: 'Исследователи проверяли людей «после обычного дня бодрствования, а не бессонной ночи», и сон всё равно помогал. Вариант D использует слова текста, но пары слов и движения пальцев — два вида материала в исходном эксперименте, а не ответ на критику.',
        },
      },
    ],
  },

  // --- 4. History: matching information, sentence completion, TFNG ---------------------------------
  {
    id: 'ielts.r.window-glass',
    kind: 'quiz_set',
    mode: 'reading',
    node: 'reading',
    title: { en: 'The story of window glass', uz: 'Deraza oynasi tarixi', ru: 'История оконного стекла' },
    levels: [5, 7.5],
    minutes: 12,
    timeLimitSeconds: 720,
    tags: ['academic', 'history'],
    passage: {
      title: 'A Clear View: The Story of Window Glass',
      text: [
        'A For most of history, windows were simply openings in a wall, closed with wooden shutters, animal skins or oiled cloth. Such coverings kept out some of the wind and rain, but they also kept out the light, and a room could be warm or bright but rarely both. Glass itself had been made for thousands of years, mainly for beads and small vessels, before anyone thought of using it to fill a window.',
        'B Roman builders were among the first to set glass into windows, mostly in bath houses and wealthy villas. Their panes were small, thick and greenish, and they let light through without offering a clear view. Even so, they made it possible to keep a room warm while still letting daylight in, which was a considerable luxury.',
        'C In medieval Europe, glass windows became closely associated with churches. Craftsmen produced coloured glass by adding metal compounds to the molten mixture and joined small pieces with strips of lead to form pictures. These windows were not intended to provide a view at all; their purpose was to fill the building with coloured light and to tell religious stories to people who could not read.',
        'D Ordinary homes had to wait much longer. Two methods dominated production for centuries. In the crown method, a glassblower spun a hot bubble of glass until it opened into a wide, flat disc, which was then cut into panes; the centre, where the rod had been attached, left a thick lump that was often sold cheaply. In the cylinder method, a long bubble was blown, cut along its length and flattened. Both techniques produced panes that were uneven and limited in size, so windows were divided into many small sections.',
        'E Taxation also shaped the appearance of buildings. In several countries, property owners once paid a tax that rose with the number of windows in a house, and some responded by bricking up openings. Visitors to old towns can still see houses with painted false windows on otherwise blank walls.',
        'F The decisive change came in the twentieth century with the float process, in which molten glass is poured onto a bath of liquid tin. The glass spreads out and settles into a perfectly flat sheet, which is cooled slowly as it moves along the line. Because the process is continuous and needs little polishing, it made large, distortion-free panes cheap enough for almost any building, and it remains the standard method today.',
      ].join('\n\n'),
    },
    questions: [
      {
        id: 'q1', type: 'matching_information', prompt: 'Which paragraph contains a reason why some owners reduced the number of windows in their houses?', options: PARAGRAPHS_6, answer: 4,
        evidence: 'some responded by bricking up openings',
        explanation: {
          en: 'Paragraph E: owners paid a tax that “rose with the number of windows”, so some bricked windows up. Paragraph A also describes openings being closed, but with shutters and skins against the weather, which is not a reason for having fewer windows.',
          uz: 'E paragraf: egalar derazalar soniga qarab oshadigan soliq to‘lagan, shuning uchun ba’zilari derazalarni g‘isht bilan bekitgan. A paragrafda ham teshiklar yopilishi tasvirlangan, lekin ob-havodan himoya uchun yog‘och qopqoq va terilar bilan; bu derazalar sonini kamaytirish sababi emas.',
          ru: 'Абзац E: владельцы платили налог, который «рос с числом окон», и некоторые закладывали окна кирпичом. В абзаце A тоже говорится о закрытых проёмах, но ставнями и шкурами от непогоды — это не причина уменьшать число окон.',
        },
      },
      {
        id: 'q2', type: 'matching_information', prompt: 'Which paragraph contains a reference to windows that communicated with people who could not read?', options: PARAGRAPHS_6, answer: 2,
        evidence: 'to tell religious stories to people who could not read',
        explanation: {
          en: 'Paragraph C says church windows were meant “to tell religious stories to people who could not read”. Paragraph B also describes glass that gave light without a view, but it says nothing about telling stories or about readers.',
          uz: 'C paragrafda cherkov derazalari «o‘qiy olmaydigan odamlarga diniy hikoyalarni aytib berish» uchun mo‘ljallangani aytiladi. B paragraf ham ko‘rinish bermay, faqat yorug‘lik o‘tkazadigan oynani tasvirlaydi, lekin unda hikoyalar yoki savod haqida gap yo‘q.',
          ru: 'В абзаце C сказано, что церковные окна должны были «рассказывать религиозные истории людям, не умевшим читать». В абзаце B тоже есть стекло, которое пропускает свет без вида, но о рассказах и грамотности там ничего нет.',
        },
      },
      {
        id: 'q3', type: 'matching_information', prompt: 'Which paragraph contains a mention of a part of the product that was often sold at a low price?', options: PARAGRAPHS_6, answer: 3,
        evidence: 'left a thick lump that was often sold cheaply',
        explanation: {
          en: 'In paragraph D, the centre of a crown-glass disc “left a thick lump that was often sold cheaply”. Paragraph F says glass became cheap for almost any building, but that is the whole product of a new process, not a cheap leftover part.',
          uz: 'D paragrafda «toj» usulidagi disk markazida «ko‘pincha arzonga sotiladigan qalin bo‘lak qolgan». F paragrafda oyna deyarli har bir bino uchun arzonlashgani aytiladi, lekin bu yangi jarayonning butun mahsuloti, arzon qoldiq bo‘lak emas.',
          ru: 'В абзаце D центр диска «коронного» стекла «оставлял толстый наплыв, который часто продавали дёшево». В абзаце F стекло становится дешёвым почти для любого здания, но это весь продукт нового процесса, а не дешёвый остаток.',
        },
      },
      {
        id: 'q4', type: 'sentence_completion', wordLimit: 1,
        prompt: 'Complete the sentence. Write ONE WORD ONLY from the passage.\nIn the float process, hot liquid glass spreads across the surface of molten ____.',
        answer: ['tin'],
        evidence: 'molten glass is poured onto a bath of liquid tin',
        explanation: {
          en: 'The float process pours molten glass “onto a bath of liquid tin”. The gap needs a material, and tin is the only one named here; “glass” cannot be right, because the glass is what is poured onto the tin.',
          uz: 'Float jarayonida eritilgan shisha «suyuq qalay vannasiga» quyiladi. Bo‘sh joyga material kerak va bu yerda faqat qalay (tin) nomlangan; «glass» bo‘lishi mumkin emas, chunki qalay ustiga aynan shishaning o‘zi quyiladi.',
          ru: 'В флоат-процессе расплавленное стекло выливают «на ванну с жидким оловом». В пропуск нужен материал, и назван только tin; «glass» не подходит, потому что именно стекло выливают на олово.',
        },
      },
      {
        id: 'q5', type: 'sentence_completion', wordLimit: 2,
        prompt: 'Complete the sentence. Write NO MORE THAN TWO WORDS from the passage.\nBefore glass was used, window openings were covered with wooden shutters, animal skins or ____.',
        answer: ['oiled cloth'],
        evidence: 'closed with wooden shutters, animal skins or oiled cloth',
        explanation: {
          en: 'Paragraph A lists “wooden shutters, animal skins or oiled cloth”. The two-word limit lets you write the full answer, so include “oiled”: “cloth” alone is incomplete. “Small vessels” is about early uses of glass, not window coverings.',
          uz: 'A paragrafda «yog‘och qopqoqlar, hayvon terilari yoki moylangan mato» sanab o‘tilgan. Ikki so‘z chegarasi to‘liq javobni yozishga imkon beradi, shuning uchun «oiled»ni ham yozing: «cloth»ning o‘zi to‘liq javob emas. «Small vessels» oynaning dastlabki qo‘llanilishi haqida, deraza yopqichlari haqida emas.',
          ru: 'В абзаце A перечислены «деревянные ставни, шкуры животных или промасленная ткань». Лимит в два слова позволяет дать полный ответ, поэтому пишите и «oiled»: одного «cloth» недостаточно. «Small vessels» относится к раннему использованию стекла, а не к тому, чем закрывали окна.',
        },
      },
      {
        id: 'q6', type: 'true_false_not_given', prompt: 'Roman window glass gave people a clear view of the outside.', options: TFNG, answer: 1,
        evidence: 'they let light through without offering a clear view',
        explanation: {
          en: 'False. Roman panes “let light through without offering a clear view”. The passage directly contradicts the statement, so the answer is False, not Not Given.',
          uz: 'False. Rim oynalari «yorug‘likni o‘tkazgan, lekin aniq ko‘rinish bermagan». Matn bayonotni to‘g‘ridan-to‘g‘ri inkor qiladi, shuning uchun javob Not Given emas, False.',
          ru: 'False. Римские стёкла «пропускали свет, но не давали ясного вида». Текст прямо противоречит утверждению, поэтому ответ False, а не Not Given.',
        },
      },
      {
        id: 'q7', type: 'true_false_not_given', prompt: 'The cylinder method produced larger panes than the crown method.', options: TFNG, answer: 2,
        evidence: 'Both techniques produced panes that were uneven and limited in size',
        explanation: {
          en: 'Not Given. The passage describes both methods and says both produced panes “limited in size”, but it never compares the size of their panes. Do not choose True just because the cylinder bubble was “long”.',
          uz: 'Not Given. Matnda ikkala usul tasvirlangan va ikkalasi ham «o‘lchami cheklangan» oynalar bergani aytilgan, lekin ularning o‘lchami bir-biri bilan solishtirilmagan. Silindr pufagi «uzun» bo‘lgani uchungina True’ni tanlamang.',
          ru: 'Not Given. В тексте описаны оба метода и сказано, что оба давали стёкла «ограниченного размера», но их размеры не сравниваются. Не выбирайте True только потому, что цилиндрический пузырь был «длинным».',
        },
      },
    ],
  },

  // --- 5. Environment: headings, summary completion, short answer ----------------------------------
  {
    id: 'ielts.r.mangrove-forests',
    kind: 'quiz_set',
    mode: 'reading',
    node: 'reading',
    title: { en: 'Forests between land and sea', uz: 'Quruqlik va dengiz orasidagi o‘rmonlar', ru: 'Леса между сушей и морем' },
    levels: [5.5, 8],
    minutes: 12,
    timeLimitSeconds: 720,
    tags: ['academic', 'environment'],
    passage: {
      title: 'Forests Between Land and Sea',
      text: [
        'A Mangroves are trees and shrubs that grow along tropical and subtropical coastlines, in the narrow zone where the land meets the sea. Few plants can survive there. The soil is waterlogged and low in oxygen, and twice a day the roots are covered by salt water. Mangroves cope with these conditions in remarkable ways: some species filter salt out at the roots, others push it out through their leaves, and many send up special breathing roots that stick out of the mud like pencils.',
        'B For a long time these forests were treated as wasteland. Their muddy, insect-filled margins seemed to offer little value, and large areas were cleared for shrimp ponds, rice fields, ports and tourist resorts. Because the clearance happened gradually, along thousands of separate stretches of coast, its total scale went largely unnoticed until satellite images began to reveal it.',
        'C Opinions have since shifted, mainly because of what mangroves do for people living nearby. Their dense tangle of roots slows down waves and traps sediment, so the shoreline behind a healthy forest erodes far less quickly. During storms, villages protected by a wide belt of mangroves have often suffered less damage than neighbouring villages where the trees had been removed. The forests also serve as nurseries for young fish, which shelter among the roots before moving out to open water, supporting local fisheries.',
        'D A further benefit has attracted attention more recently. Mangrove soils store unusually large amounts of carbon, because the waterlogged mud slows the decay of fallen leaves and roots. When a forest is cleared and the soil dries out, that carbon is released into the atmosphere, often over many years. Protecting existing mangroves is therefore increasingly discussed as part of climate policy.',
        'E Replanting has proved harder than expected. Early projects frequently planted seedlings in neat rows on mudflats where mangroves had never grown, simply because the land was available. Many of those seedlings were washed away or drowned. Experience has shown that it is usually better to restore the natural flow of water to former mangrove sites, for example by breaking down old pond walls, and to let seeds arrive with the tide.',
        'F The future of mangroves depends less on scientists than on local people. Where communities receive a share of the benefits, such as fishing rights or income from visitors, they have strong reasons to protect the forest. Where the gains go elsewhere, clearance tends to continue.',
      ].join('\n\n'),
    },
    questions: [
      {
        id: 'q1', type: 'matching_headings', prompt: 'Paragraph B', options: MANGROVE_HEADINGS, answer: 3,
        evidence: 'its total scale went largely unnoticed',
        explanation: {
          en: 'Paragraph B explains that mangroves were cleared for ponds, farms and resorts, and that because this happened gradually “its total scale went largely unnoticed”. The heading about timber is a trap: the paragraph lists uses of the cleared land, not the value of the wood.',
          uz: 'B paragrafda mangrlar hovuzlar, dalalar va kurortlar uchun kesilgani, bu asta-sekin sodir bo‘lgani sababli esa «uning umumiy ko‘lami deyarli sezilmay qolgani» tushuntiriladi. Yog‘och haqidagi sarlavha tuzoq: paragrafda kesilgan yerdan foydalanish sanaladi, yog‘ochning qiymati emas.',
          ru: 'Абзац B объясняет, что мангры вырубали под пруды, поля и курорты, а поскольку это шло постепенно, «общий масштаб остался почти незамеченным». Заголовок про древесину — ловушка: в абзаце перечислено, как использовали расчищенную землю, а не ценность древесины.',
        },
      },
      {
        id: 'q2', type: 'matching_headings', prompt: 'Paragraph C', options: MANGROVE_HEADINGS, answer: 1,
        evidence: 'The forests also serve as nurseries for young fish',
        explanation: {
          en: 'Paragraph C covers two services: the roots slow waves and reduce erosion (coastlines), and the forests are nurseries for young fish (food supplies). Storing carbon is also a benefit, but it is the topic of paragraph D, which begins “A further benefit”.',
          uz: 'C paragraf ikki foydani qamraydi: ildizlar to‘lqinlarni sekinlashtirib, eroziyani kamaytiradi (qirg‘oqlar) va o‘rmonlar yosh baliqlar uchun «bolalar bog‘chasi» vazifasini bajaradi (oziq-ovqat). Uglerod saqlash ham foyda, lekin bu «A further benefit» bilan boshlanadigan D paragrafning mavzusi.',
          ru: 'Абзац C охватывает две пользы: корни гасят волны и уменьшают эрозию (берега), а леса служат «яслями» для молоди рыб (продовольствие). Хранение углерода тоже польза, но это тема абзаца D, который начинается с «A further benefit».',
        },
      },
      {
        id: 'q3', type: 'matching_headings', prompt: 'Paragraph E', options: MANGROVE_HEADINGS, answer: 5,
        evidence: 'it is usually better to restore the natural flow of water',
        explanation: {
          en: 'Paragraph E says early projects planted seedlings where mangroves had never grown and that it is “usually better to restore the natural flow of water” and let seeds arrive with the tide. It is not about adaptations (paragraph A), even though it mentions water and tides.',
          uz: 'E paragrafda dastlabki loyihalar mangr hech qachon o‘smagan joylarga ko‘chat ekkani va «odatda tabiiy suv oqimini tiklash» hamda urug‘larning suv ko‘tarilishi bilan kelishiga imkon berish yaxshiroq ekani aytiladi. Bu moslashuvlar haqida emas (A paragraf), garchi unda suv va suv ko‘tarilishi tilga olinsa ham.',
          ru: 'В абзаце E сказано, что ранние проекты сажали саженцы там, где мангров никогда не было, и что «обычно лучше восстановить естественное течение воды» и дать семенам прийти с приливом. Это не про приспособления растений (абзац A), хотя вода и приливы упоминаются.',
        },
      },
      {
        id: 'q4', type: 'summary_completion', wordLimit: 1,
        prompt: 'Complete the summary. Write ONE WORD ONLY from the passage.\nMangroves grow in wet soil that is poor in ____, and their roots are flooded by salt water twice a day.',
        answer: ['oxygen'],
        evidence: 'The soil is waterlogged and low in oxygen',
        explanation: {
          en: '“The soil is waterlogged and low in oxygen”: “poor in” paraphrases “low in”. “Salt” is tempting, but salt water appears in the second half of the summary sentence; what the soil lacks is oxygen.',
          uz: '«Tuproq suvga to‘yingan va kislorodi kam»: «poor in» — «low in»ning parafrazi. «Salt» so‘zi jalb qilishi mumkin, lekin sho‘r suv xulosa gapining ikkinchi qismida keladi; tuproqda yetishmaydigan narsa — kislorod.',
          ru: '«Почва переувлажнена и бедна кислородом»: «poor in» — перефраз «low in». Слово «salt» соблазнительно, но солёная вода упомянута во второй половине предложения; почве не хватает именно кислорода.',
        },
      },
      {
        id: 'q5', type: 'summary_completion', wordLimit: 1,
        prompt: 'Complete the summary. Write ONE WORD ONLY from the passage.\nThe wet mud slows the ____ of dead leaves and roots, so mangrove soils hold a great deal of carbon.',
        answer: ['decay'],
        evidence: 'the waterlogged mud slows the decay of fallen leaves and roots',
        explanation: {
          en: '“The waterlogged mud slows the decay of fallen leaves and roots.” The gap comes between “the” and “of”, so it needs a noun; “carbon” is a noun too, but it is what the soil stores, not what the mud slows down.',
          uz: '«Suvga to‘yingan loy tushgan barglar va ildizlarning chirishini sekinlashtiradi.» Bo‘sh joy «the» va «of» orasida, demak ot kerak; «carbon» ham ot, lekin u tuproq saqlaydigan narsa, loy sekinlashtiradigan narsa emas.',
          ru: '«Переувлажнённый ил замедляет разложение опавших листьев и корней». Пропуск стоит между «the» и «of», значит нужно существительное; «carbon» тоже существительное, но это то, что почва хранит, а не то, что замедляет ил.',
        },
      },
      {
        id: 'q6', type: 'short_answer', wordLimit: 1,
        prompt: 'Answer the question. Write ONE WORD ONLY from the passage.\nWhat did early restoration projects often plant in straight lines?',
        answer: ['seedlings'],
        evidence: 'planted seedlings in neat rows on mudflats',
        explanation: {
          en: 'Early projects “planted seedlings in neat rows on mudflats”; “straight lines” paraphrases “neat rows”. “Seeds” is close but wrong: the passage contrasts planting seedlings with the better method of letting seeds arrive with the tide.',
          uz: 'Dastlabki loyihalar «loyqa sayozliklarga ko‘chatlarni tekis qatorlab ekkan»; «straight lines» — «neat rows»ning parafrazi. «Seeds» yaqin, lekin noto‘g‘ri: matnda ko‘chat ekish urug‘larni suv ko‘tarilishi bilan kelishiga qo‘yib berishdek yaxshiroq usulga qarama-qarshi qo‘yiladi.',
          ru: 'Ранние проекты «сажали саженцы ровными рядами на илистых отмелях»; «straight lines» — перефраз «neat rows». «Seeds» близко, но неверно: в тексте посадка саженцев противопоставлена лучшему методу, когда семена приносит прилив.',
        },
      },
      {
        id: 'q7', type: 'short_answer', wordLimit: 2,
        prompt: 'Answer the question. Write NO MORE THAN TWO WORDS from the passage.\nWhat finally showed how much mangrove forest had been cleared?',
        answer: ['satellite images'],
        evidence: 'until satellite images began to reveal it',
        explanation: {
          en: 'The clearance “went largely unnoticed until satellite images began to reveal it”. Answer with the words from the passage; “scientists” is wrong because the passage credits the images, not researchers, with revealing the scale.',
          uz: 'Kesish «sun’iy yo‘ldosh tasvirlari uni ko‘rsata boshlaguncha deyarli sezilmay qolgan». Matndagi so‘zlar bilan javob bering; «scientists» noto‘g‘ri, chunki matnda ko‘lamni olimlar emas, aynan tasvirlar ochib bergani aytilgan.',
          ru: 'Вырубка «оставалась почти незамеченной, пока её не показали спутниковые снимки». Отвечайте словами текста; «scientists» неверно: масштаб, по тексту, раскрыли снимки, а не учёные.',
        },
      },
    ],
  },

  // --- 6. Economics: YNNG, MCQ, matching information -----------------------------------------------
  {
    id: 'ielts.r.four-day-week',
    kind: 'quiz_set',
    mode: 'reading',
    node: 'reading',
    title: { en: 'Working less, producing more?', uz: 'Kamroq ishlab, ko‘proq natija?', ru: 'Работать меньше, производить больше?' },
    levels: [6, 8.5],
    minutes: 12,
    timeLimitSeconds: 720,
    tags: ['academic', 'economics'],
    passage: {
      title: 'Working Less, Producing More?',
      text: [
        'A Few ideas in economics have been predicted as confidently and as wrongly as the shrinking working week. In the early twentieth century, several prominent thinkers expected that rising productivity would allow people in wealthy countries to work fifteen or twenty hours a week within a few generations. Productivity did rise, enormously, yet in most countries the standard full-time week settled at around forty hours and has barely moved since.',
        'B Interest in shorter hours has returned, this time in the form of the four-day week. In a typical trial, employees keep their full salary while working around eighty per cent of their previous hours, on the condition that output does not fall. Companies that have taken part frequently report lower absence, easier recruitment and staff who say they feel less exhausted. Many choose to keep the arrangement after the trial ends.',
        'C I believe these results deserve to be taken seriously, but they are often presented with more certainty than they can support. Firms volunteer for trials, and a business that expects the change to fail is unlikely to sign up. The firms that participate also tend to be offices where work can be reorganised fairly easily, such as marketing agencies and software companies. Whether the same gains would appear in a hospital, a warehouse or a school is a different question.',
        'D The reason output can be maintained is not mysterious. Much office time is lost to unnecessary meetings, interruptions and tasks that exist mainly out of habit. A fixed deadline of four days forces managers to identify and remove this waste, something they could, in principle, have done anyway. In that sense, the four-day week may be less a gift of leisure than a disguised programme of efficiency.',
        'E For services that must be available every day, the picture is different. A care home cannot close on Fridays, so shorter weeks would require hiring additional staff, and the cost would have to be met by someone. Governments considering the idea should therefore avoid a single national rule and instead encourage each sector to find the arrangement that suits it. A shorter week is a worthwhile goal; it is not a free one.',
      ].join('\n\n'),
    },
    questions: [
      {
        id: 'q1', type: 'yes_no_not_given', prompt: 'Early twentieth-century predictions about working hours proved accurate.', options: YNNG, answer: 1,
        evidence: 'predicted as confidently and as wrongly as the shrinking working week',
        explanation: {
          en: 'No. The writer says few ideas have been predicted “as confidently and as wrongly” as the shrinking week: hours settled at about forty, not fifteen or twenty. Productivity did rise as expected, which may tempt you towards Yes, but the prediction about hours was wrong.',
          uz: 'No. Muallif ish haftasining qisqarishi kabi «shunchalik ishonch bilan va shunchalik noto‘g‘ri» bashorat qilingan g‘oyalar kam ekanini aytadi: soatlar o‘n besh-yigirma emas, qirq atrofida qolgan. Unumdorlik kutilganidek oshgani Yes’ga undashi mumkin, lekin soatlar haqidagi bashorat xato chiqdi.',
          ru: 'No. Автор пишет, что мало какие идеи предсказывали «так уверенно и так ошибочно», как сокращение рабочей недели: часы остались около сорока, а не пятнадцать-двадцать. Производительность действительно выросла, и это толкает к Yes, но прогноз о часах не сбылся.',
        },
      },
      {
        id: 'q2', type: 'yes_no_not_given', prompt: 'Trial results may look better than they really are because of the kind of firms that take part.', options: YNNG, answer: 0,
        evidence: 'a business that expects the change to fail is unlikely to sign up',
        explanation: {
          en: 'Yes. The writer thinks the results are “presented with more certainty than they can support”, because firms volunteer and those expecting failure do not sign up, and most are easily reorganised offices. The writer still takes the results seriously, but agrees they may be overstated.',
          uz: 'Yes. Muallifning fikricha, natijalar «asoslab bo‘ladiganidan ko‘ra ishonchliroq qilib ko‘rsatiladi», chunki firmalar ixtiyoriy qatnashadi, muvaffaqiyatsizlikni kutganlar yozilmaydi va ko‘pchiligi oson qayta tashkil qilinadigan ofislar. Muallif natijalarni jiddiy qabul qiladi, lekin ular bo‘rttirilgan bo‘lishi mumkinligiga rozi.',
          ru: 'Yes. По мнению автора, результаты «подаются с большей уверенностью, чем позволяют сами данные»: фирмы участвуют добровольно, те, кто ждёт провала, не записываются, и почти все — легко перестраиваемые офисы. Автор относится к результатам серьёзно, но признаёт, что они могут быть преувеличены.',
        },
      },
      {
        id: 'q3', type: 'yes_no_not_given', prompt: 'Most employees on a four-day week use the extra day for family activities.', options: YNNG, answer: 2,
        evidence: 'staff who say they feel less exhausted',
        explanation: {
          en: 'Not Given. The passage reports that staff “feel less exhausted”, but it never says how they spend the free day. Do not fill the gap with common sense: feeling rested tells you nothing about family activities.',
          uz: 'Not Given. Matnda xodimlar «kamroq charchashi» aytiladi, lekin ular bo‘sh kunni qanday o‘tkazishi haqida hech narsa yo‘q. Bo‘shliqni sog‘lom fikr bilan to‘ldirmang: dam olgandek his qilish oilaviy mashg‘ulotlar haqida hech narsa demaydi.',
          ru: 'Not Given. В тексте сказано, что сотрудники «меньше устают», но не сказано, как они проводят свободный день. Не заполняйте пробел здравым смыслом: чувство отдыха ничего не говорит о семейных делах.',
        },
      },
      {
        id: 'q4', type: 'multiple_choice', prompt: 'According to the writer, why can output stay the same when hours are cut?',
        options: [
          'Employees receive bonuses for working faster.',
          'A fixed deadline makes managers remove wasted time.',
          'Firms hire extra staff to cover the fifth day.',
          'Meetings are moved to the employees’ day off.',
        ],
        answer: 1,
        evidence: 'A fixed deadline of four days forces managers to identify and remove this waste',
        explanation: {
          en: '“A fixed deadline of four days forces managers to identify and remove this waste”: unnecessary meetings, interruptions and habitual tasks. Option C describes what care homes would need (paragraph E), not why offices keep their output, and option D twists the word “meetings”.',
          uz: '«To‘rt kunlik qat’iy muddat rahbarlarni bu isrofni aniqlab, yo‘q qilishga majbur qiladi»: keraksiz yig‘ilishlar, chalg‘ishlar va odatdan qolgan vazifalar. C variant qariyalar uylariga nima kerakligini tasvirlaydi (E paragraf), ofislar natijani qanday saqlashini emas; D esa «meetings» so‘zini buzib ishlatadi.',
          ru: '«Жёсткий срок в четыре дня заставляет руководителей найти и устранить эти потери»: лишние совещания, отвлечения и задачи по привычке. Вариант C описывает, что нужно домам престарелых (абзац E), а не почему офисы сохраняют выработку; D искажает слово «meetings».',
        },
      },
      {
        id: 'q5', type: 'multiple_choice', prompt: 'What does the writer say about shorter weeks in care homes?',
        options: [
          'Staff there would refuse shorter hours.',
          'The homes could close for one day a week.',
          'Extra staff would be needed, and someone would have to pay for them.',
          'Their output cannot be measured accurately.',
        ],
        answer: 2,
        evidence: 'shorter weeks would require hiring additional staff',
        explanation: {
          en: '“A care home cannot close on Fridays, so shorter weeks would require hiring additional staff, and the cost would have to be met by someone.” Option B is the opposite of what the passage says, and staff attitudes and measurement are never mentioned.',
          uz: '«Qariyalar uyi juma kunlari yopila olmaydi, shuning uchun qisqaroq hafta qo‘shimcha xodim yollashni talab qiladi va xarajatni kimdir qoplashi kerak bo‘ladi.» B variant matnda aytilganning teskarisi, xodimlarning munosabati va o‘lchash esa umuman tilga olinmagan.',
          ru: '«Дом престарелых не может закрываться по пятницам, поэтому короткая неделя потребует нанять дополнительный персонал, и кто-то должен будет за это платить». Вариант B противоположен тексту, а отношение сотрудников и измерение выработки не упоминаются.',
        },
      },
      {
        id: 'q6', type: 'matching_information', prompt: 'Which paragraph contains a list of benefits reported by companies that took part in trials?', options: PARAGRAPHS_5, answer: 1,
        evidence: 'lower absence, easier recruitment and staff who say they feel less exhausted',
        explanation: {
          en: 'Paragraph B: firms report “lower absence, easier recruitment and staff who say they feel less exhausted”. Paragraph D explains why output holds up, which is a reason, not a list of benefits that companies reported.',
          uz: 'B paragraf: firmalar «ishga kelmaslik kamayganini, xodim yollash osonlashganini va xodimlar kamroq charchashini» bildiradi. D paragraf natija nega saqlanishini tushuntiradi, bu sabab, kompaniyalar bildirgan foydalar ro‘yxati emas.',
          ru: 'Абзац B: фирмы сообщают о «меньшем числе пропусков работы, более лёгком найме и сотрудниках, которые меньше устают». Абзац D объясняет, почему выработка сохраняется, — это причина, а не список пользы, о которой сообщили компании.',
        },
      },
      {
        id: 'q7', type: 'matching_information', prompt: 'Which paragraph contains advice on how governments should approach the idea?', options: PARAGRAPHS_5, answer: 4,
        evidence: 'Governments considering the idea should therefore avoid a single national rule',
        explanation: {
          en: 'Paragraph E advises governments to “avoid a single national rule” and let each sector find its own arrangement. Paragraph C questions whether the results apply to hospitals or schools, but it gives no advice to governments.',
          uz: 'E paragraf hukumatlarga «yagona milliy qoidadan qochish» va har bir sohaga o‘ziga mos tartibni topishga imkon berishni maslahat beradi. C paragraf natijalar kasalxona yoki maktablarga ham taalluqlimi, degan savolni qo‘yadi, lekin hukumatlarga maslahat bermaydi.',
          ru: 'Абзац E советует правительствам «избегать единого национального правила» и дать каждой отрасли найти свой вариант. Абзац C сомневается, применимы ли результаты к больницам и школам, но советов правительствам не даёт.',
        },
      },
    ],
  },

  // --- 7. Science: headings, sentence completion, short answer -------------------------------------
  {
    id: 'ielts.r.seed-banks',
    kind: 'quiz_set',
    mode: 'reading',
    node: 'reading',
    title: { en: 'Seed banks: insurance for the harvest', uz: 'Urug‘ banklari: hosil sug‘urtasi', ru: 'Банки семян: страховка урожая' },
    levels: [5.5, 8],
    minutes: 12,
    timeLimitSeconds: 720,
    tags: ['academic', 'science'],
    passage: {
      title: 'Insurance for the Harvest',
      text: [
        'A Every major food crop depends on a surprisingly narrow base of varieties. Over the past century, farmers in many regions replaced the local types their families had grown for generations with a small number of high-yielding varieties. Harvests increased, but much of the genetic diversity carried by the older types began to disappear, and with it traits that might one day be needed, such as resistance to a particular disease or tolerance of drought.',
        'B Seed banks were created to slow this loss. Their basic method is simple. Seeds are cleaned, dried until only a small amount of moisture remains, sealed in airtight packets and stored at temperatures well below freezing. Under these conditions, the seeds of many crops stay alive for decades, and some for far longer.',
        'C Not every plant can be stored this way. The seeds of some species, including several tropical trees, die when they are dried, and they have to be kept alive by other means. Some are grown continuously in field collections, while others are preserved as tiny pieces of tissue frozen in liquid nitrogen, a method that is expensive and requires specialist staff.',
        'D Storage alone is not enough, because even well-kept seeds slowly lose their ability to germinate. Seed banks therefore test samples at regular intervals. When the proportion that sprouts falls below a certain level, the variety must be planted out, grown to maturity and harvested again, so that the collection is renewed with fresh seed. For a bank holding many thousands of varieties, this cycle is one of its largest and most costly tasks.',
        'E Many countries run national seed banks, and an international vault inside a mountain in the Arctic holds duplicate samples as a backup. The vault does not lend seeds in the ordinary way; it is designed to be used only when an original collection has been lost through war, natural disaster or simple mismanagement. The principle has been tested in practice: samples deposited by a collection affected by conflict were later withdrawn and used to rebuild it elsewhere.',
        'F Some scientists warn that frozen collections preserve diversity but also freeze it in time. A variety grown in a field continues to adapt to local conditions and to new pests, whereas a seed in a vault does not. For this reason, many experts now argue that seed banks should work alongside farmers who keep traditional varieties in use, rather than replacing them.',
      ].join('\n\n'),
    },
    questions: [
      {
        id: 'q1', type: 'matching_headings', prompt: 'Paragraph B', options: SEED_BANK_HEADINGS, answer: 3,
        evidence: 'Their basic method is simple',
        explanation: {
          en: 'Paragraph B describes the method step by step: cleaning, drying, sealing and freezing. “Species that need special treatment” is the topic of paragraph C, which begins by saying that not every plant can be stored “this way”.',
          uz: 'B paragraf usulni bosqichma-bosqich tasvirlaydi: tozalash, quritish, germetik qadoqlash va muzlatish. «Maxsus ishlov talab qiladigan turlar» — C paragrafning mavzusi, u har qanday o‘simlikni ham «shu tarzda» saqlab bo‘lmasligi bilan boshlanadi.',
          ru: 'Абзац B описывает метод по шагам: очистка, сушка, герметичная упаковка и заморозка. «Виды, требующие особого подхода» — тема абзаца C, который начинается с того, что не всякое растение можно хранить «таким способом».',
        },
      },
      {
        id: 'q2', type: 'matching_headings', prompt: 'Paragraph D', options: SEED_BANK_HEADINGS, answer: 1,
        evidence: 'even well-kept seeds slowly lose their ability to germinate',
        explanation: {
          en: 'Paragraph D explains that seeds “slowly lose their ability to germinate”, so banks test them and grow varieties again to renew the collection. It is about all stored seeds over time, not about the species that cannot be dried, so the heading for paragraph C does not fit.',
          uz: 'D paragrafda urug‘lar «unib chiqish qobiliyatini asta-sekin yo‘qotishi», shuning uchun banklar ularni sinab, to‘plamni yangilash uchun navlarni qayta o‘stirishi tushuntiriladi. Bu quritib bo‘lmaydigan turlar haqida emas, vaqt o‘tishi bilan barcha saqlanayotgan urug‘lar haqida, shuning uchun C paragraf sarlavhasi to‘g‘ri kelmaydi.',
          ru: 'В абзаце D объясняется, что семена «постепенно теряют всхожесть», поэтому банки проверяют их и заново выращивают сорта, обновляя коллекцию. Речь обо всех хранящихся семенах со временем, а не о видах, которые нельзя сушить, так что заголовок абзаца C не подходит.',
        },
      },
      {
        id: 'q3', type: 'matching_headings', prompt: 'Paragraph F', options: SEED_BANK_HEADINGS, answer: 4,
        evidence: 'seed banks should work alongside farmers who keep traditional varieties in use',
        explanation: {
          en: 'Paragraph F argues that frozen seeds stop adapting while field varieties keep adapting, so seed banks should work with farmers. “Higher yields from traditional varieties” reuses the idea of old types, but paragraph A says it is the modern varieties that are high-yielding.',
          uz: 'F paragrafda muzlatilgan urug‘lar moslashishdan to‘xtashi, daladagi navlar esa moslashishda davom etishi, shuning uchun urug‘ banklari fermerlar bilan hamkorlik qilishi kerakligi ta’kidlanadi. «An’anaviy navlardan yuqori hosil» eski navlar g‘oyasini takrorlaydi, lekin A paragrafga ko‘ra yuqori hosilli navlar zamonaviylaridir.',
          ru: 'Абзац F доказывает, что замороженные семена перестают приспосабливаться, а полевые сорта продолжают, поэтому банкам семян нужно работать с фермерами. «Высокие урожаи традиционных сортов» обыгрывает идею старых сортов, но по абзацу A высокоурожайны как раз современные сорта.',
        },
      },
      {
        id: 'q4', type: 'sentence_completion', wordLimit: 1,
        prompt: 'Complete the sentence. Write ONE WORD ONLY from the passage.\nAfter drying, seeds are sealed in ____ packets and kept well below freezing.',
        answer: ['airtight'],
        evidence: 'sealed in airtight packets',
        explanation: {
          en: 'Seeds are “sealed in airtight packets”. The gap sits between “in” and “packets”, so it needs an adjective describing the packets; “dried” describes the seeds, not the packets.',
          uz: 'Urug‘lar «havo o‘tkazmaydigan paketlarga germetik joylanadi». Bo‘sh joy «in» va «packets» orasida, demak paketni tavsiflovchi sifat kerak; «dried» paketni emas, urug‘ni tavsiflaydi.',
          ru: 'Семена «запечатывают в герметичные пакеты». Пропуск стоит между «in» и «packets», значит нужно прилагательное, описывающее пакеты; «dried» описывает семена, а не пакеты.',
        },
      },
      {
        id: 'q5', type: 'sentence_completion', wordLimit: 2,
        prompt: 'Complete the sentence. Write NO MORE THAN TWO WORDS from the passage.\nTissue from some species is frozen in ____, a method that is costly and needs trained staff.',
        answer: ['liquid nitrogen'],
        evidence: 'tiny pieces of tissue frozen in liquid nitrogen',
        explanation: {
          en: 'Paragraph C: “tiny pieces of tissue frozen in liquid nitrogen, a method that is expensive and requires specialist staff”. “Field collections” is the other method mentioned, but there the plants are grown, not frozen.',
          uz: 'C paragraf: «suyuq azotda muzlatilgan mayda to‘qima bo‘laklari — qimmat va mutaxassis xodim talab qiladigan usul». «Field collections» — tilga olingan boshqa usul, lekin unda o‘simliklar muzlatilmaydi, o‘stiriladi.',
          ru: 'Абзац C: «крошечные кусочки ткани, замороженные в жидком азоте, — дорогой метод, требующий специалистов». «Field collections» — другой упомянутый метод, но там растения выращивают, а не замораживают.',
        },
      },
      {
        id: 'q6', type: 'short_answer', wordLimit: 2,
        prompt: 'Answer the question. Write NO MORE THAN TWO WORDS from the passage.\nWhat do seed banks do at regular intervals to check whether stored seeds can still sprout?',
        answer: ['test samples'],
        evidence: 'Seed banks therefore test samples at regular intervals',
        explanation: {
          en: '“Seed banks therefore test samples at regular intervals.” Planting the variety out is what happens only after a test shows too few seeds sprout, so “planted out” is not the regular check.',
          uz: '«Shuning uchun urug‘ banklari namunalarni muntazam ravishda sinab turadi.» Navni dalaga ekish faqat sinov urug‘lar juda kam unib chiqayotganini ko‘rsatgandan keyin bo‘ladi, shuning uchun «planted out» muntazam tekshiruv emas.',
          ru: '«Поэтому банки семян регулярно проверяют образцы». Высаживают сорт только после того, как проверка покажет, что всходит слишком мало семян, так что «planted out» — не регулярная проверка.',
        },
      },
      {
        id: 'q7', type: 'short_answer', wordLimit: 2,
        prompt: 'Answer the question. Write NO MORE THAN TWO WORDS from the passage.\nName ONE way in which an original seed collection might be lost.',
        answer: ['war', 'natural disaster', 'mismanagement', 'simple mismanagement', 'conflict'],
        evidence: 'lost through war, natural disaster or simple mismanagement',
        explanation: {
          en: 'The vault is used when a collection has been lost “through war, natural disaster or simple mismanagement”; any one of these is correct. Do not write “drought” or “disease”: in paragraph A they are threats to crops, not ways of losing a collection.',
          uz: 'Ombor to‘plam «urush, tabiiy ofat yoki oddiy noto‘g‘ri boshqaruv tufayli» yo‘qolganda ishlatiladi; ulardan istalgan biri to‘g‘ri. «Drought» yoki «disease» deb yozmang: A paragrafda ular ekinlarga tahdid, to‘plamni yo‘qotish yo‘li emas.',
          ru: 'Хранилище используют, когда коллекция утрачена «из-за войны, стихийного бедствия или просто плохого управления»; подходит любой из вариантов. Не пишите «drought» или «disease»: в абзаце A это угрозы урожаю, а не способы потерять коллекцию.',
        },
      },
    ],
  },

  // --- 8. Technology: matching information, YNNG, summary completion -------------------------------
  {
    id: 'ielts.r.machine-translation',
    kind: 'quiz_set',
    mode: 'reading',
    node: 'reading',
    title: { en: 'The long road to machine translation', uz: 'Mashina tarjimasining uzoq yo‘li', ru: 'Долгий путь машинного перевода' },
    levels: [6, 8.5],
    minutes: 12,
    timeLimitSeconds: 720,
    tags: ['academic', 'technology'],
    passage: {
      title: 'The Long Road to Machine Translation',
      text: [
        'A The idea of a machine that could translate between languages is almost as old as the computer itself. The first public demonstrations in the 1950s used a small vocabulary and a handful of grammar rules, and they produced impressive results with carefully chosen sentences. Their designers confidently expected that general translation would be solved within a few years. It took more than half a century.',
        'B The early systems were built on rules written by hand. Linguists described the grammar of each language and listed equivalent words, and the program applied these instructions one by one. The approach failed on ambiguity. A single English word may have several meanings, and choosing the right one often depends on knowledge of the world that no set of rules could capture. Adding more rules made the systems larger and slower without making them reliably better.',
        'C From the 1990s, researchers took a different route. Instead of teaching the computer grammar, they gave it enormous collections of texts that had already been translated by humans, such as the proceedings of multilingual parliaments, and let it calculate which phrases most often corresponded to which. These statistical systems handled common expressions well but often produced sentences that were awkward or ungrammatical, because they worked on short fragments rather than whole sentences.',
        'D Current systems use neural networks, which process an entire sentence before producing its translation. Their output is usually fluent, and for widely used language pairs it can be remarkably accurate. This fluency has a hidden cost. When an older system made a mistake, the result was obviously broken; a neural system can produce a smooth, confident sentence that says something the original never said. In my opinion, this makes careful checking more necessary, not less.',
        'E Machine translation now serves vast numbers of people who would otherwise have no access to texts in foreign languages, and I regard this as a genuine achievement. It does not follow, however, that human translators are becoming unnecessary. Legal contracts, medical instructions and literature all demand a level of responsibility and cultural judgement that remains, for now, a human task. Quality also varies greatly: languages with little digital text available still receive far weaker translations than major ones.',
      ].join('\n\n'),
    },
    questions: [
      {
        id: 'q1', type: 'matching_information', prompt: 'Which paragraph contains a reason why adding instructions did not improve early systems?', options: PARAGRAPHS_5, answer: 1,
        evidence: 'Adding more rules made the systems larger and slower without making them reliably better',
        explanation: {
          en: 'Paragraph B: rules could not capture the knowledge of the world needed to resolve ambiguity, so more rules made systems “larger and slower without making them reliably better”. Paragraph A also describes early systems, but only their first demonstrations and over-confident designers.',
          uz: 'B paragraf: qoidalar ko‘p ma’nolilikni hal qilish uchun zarur bo‘lgan dunyo haqidagi bilimni qamrab ololmagan, shuning uchun qoidalar ko‘paygani tizimlarni «kattaroq va sekinroq qildi, lekin ishonchli darajada yaxshiroq qilmadi». A paragraf ham ilk tizimlarni tasvirlaydi, lekin faqat birinchi namoyishlar va o‘ziga ortiqcha ishongan yaratuvchilarni.',
          ru: 'Абзац B: правила не могли охватить знание о мире, нужное для снятия многозначности, поэтому новые правила делали системы «больше и медленнее, но не стабильно лучше». Абзац A тоже описывает ранние системы, но лишь первые демонстрации и самоуверенных разработчиков.',
        },
      },
      {
        id: 'q2', type: 'matching_information', prompt: 'Which paragraph contains a mention of work by human translators being used to train a system?', options: PARAGRAPHS_5, answer: 2,
        evidence: 'enormous collections of texts that had already been translated by humans',
        explanation: {
          en: 'Paragraph C: statistical systems were given “enormous collections of texts that had already been translated by humans” to learn from. Paragraph E also mentions human translators, but it is about tasks they still need to do, not training material.',
          uz: 'C paragraf: statistik tizimlarga o‘rganish uchun «odamlar allaqachon tarjima qilgan ulkan matnlar to‘plami» berilgan. E paragrafda ham tarjimonlar tilga olinadi, lekin u ular hali bajarishi kerak bo‘lgan ishlar haqida, o‘qitish materiali haqida emas.',
          ru: 'Абзац C: статистическим системам дали для обучения «огромные собрания текстов, уже переведённых людьми». В абзаце E тоже упоминаются переводчики, но речь о задачах, которые пока остаются за ними, а не об обучающих данных.',
        },
      },
      {
        id: 'q3', type: 'yes_no_not_given', prompt: 'Because neural translations are fluent, they need less checking than older ones.', options: YNNG, answer: 1,
        evidence: 'this makes careful checking more necessary, not less',
        explanation: {
          en: 'No. The writer argues that fluent mistakes are harder to notice, so “this makes careful checking more necessary, not less”. The statement reverses the writer’s conclusion.',
          uz: 'No. Muallifning fikricha, silliq xatolarni payqash qiyinroq, shuning uchun «bu sinchkov tekshiruvni kamroq emas, ko‘proq zarur qiladi». Bayonot muallifning xulosasini teskari qilib qo‘yadi.',
          ru: 'No. Автор считает, что гладкие ошибки труднее заметить, поэтому «это делает тщательную проверку более необходимой, а не менее». Утверждение переворачивает вывод автора.',
        },
      },
      {
        id: 'q4', type: 'yes_no_not_given', prompt: 'The spread of machine translation is a real accomplishment.', options: YNNG, answer: 0,
        evidence: 'I regard this as a genuine achievement',
        explanation: {
          en: 'Yes. The writer says “I regard this as a genuine achievement”. The reservations that follow, about human translators and weaker languages, are added to this positive judgement; they do not cancel it.',
          uz: 'Yes. Muallif «men buni haqiqiy yutuq deb hisoblayman» deydi. Keyin keladigan tarjimonlar va zaifroq tillar haqidagi e’tirozlar bu ijobiy bahoga qo‘shimcha, uni bekor qilmaydi.',
          ru: 'Yes. Автор пишет: «я считаю это настоящим достижением». Последующие оговорки о переводчиках и слабо представленных языках дополняют эту положительную оценку, а не отменяют её.',
        },
      },
      {
        id: 'q5', type: 'yes_no_not_given', prompt: 'Statistical systems were a step backwards compared with rule-based systems.', options: YNNG, answer: 2,
        evidence: 'These statistical systems handled common expressions well but often produced sentences that were awkward or ungrammatical',
        explanation: {
          en: 'Not Given. The writer describes the strengths and weaknesses of statistical systems but never compares their overall quality with rule-based ones. Their awkward sentences may tempt you to say Yes, but the writer makes no such judgement.',
          uz: 'Not Given. Muallif statistik tizimlarning kuchli va zaif tomonlarini tasvirlaydi, lekin ularning umumiy sifatini qoidaga asoslangan tizimlar bilan solishtirmaydi. Ularning g‘aliz gaplari Yes deyishga undashi mumkin, ammo muallif bunday baho bermaydi.',
          ru: 'Not Given. Автор описывает сильные и слабые стороны статистических систем, но не сравнивает их общее качество с системами на правилах. Неуклюжие предложения подталкивают к Yes, но такой оценки автор не даёт.',
        },
      },
      {
        id: 'q6', type: 'summary_completion', wordLimit: 1,
        prompt: 'Complete the summary. Write ONE WORD ONLY from the passage.\nStatistical systems learned from existing human translations, for example the records of multilingual ____.',
        answer: ['parliaments'],
        evidence: 'the proceedings of multilingual parliaments',
        explanation: {
          en: 'The example is “the proceedings of multilingual parliaments”: “records” paraphrases “proceedings”. Copy the plural as it is in the passage; “languages” fits the topic but is not the word the passage uses after “multilingual”.',
          uz: 'Misol — «ko‘p tilli parlamentlarning bayonnomalari»: «records» — «proceedings»ning parafrazi. Ko‘plik shaklini matndagidek ko‘chiring; «languages» mavzuga mos, lekin matnda «multilingual»dan keyin kelgan so‘z emas.',
          ru: 'Пример — «протоколы многоязычных парламентов»: «records» перефразирует «proceedings». Перепишите форму множественного числа, как в тексте; «languages» подходит по теме, но после «multilingual» в тексте стоит другое слово.',
        },
      },
      {
        id: 'q7', type: 'summary_completion', wordLimit: 1,
        prompt: 'Complete the summary. Write ONE WORD ONLY from the passage.\nTheir output was often awkward because they processed short ____ instead of whole sentences.',
        answer: ['fragments'],
        evidence: 'they worked on short fragments rather than whole sentences',
        explanation: {
          en: '“They worked on short fragments rather than whole sentences.” “Expressions” is tempting because statistical systems handled common expressions well, but that is their strength, not the cause of the awkward output.',
          uz: '«Ular butun gaplar bilan emas, qisqa bo‘laklar bilan ishlagan.» «Expressions» jalb qilishi mumkin, chunki statistik tizimlar keng tarqalgan iboralarni yaxshi tarjima qilgan, lekin bu ularning kuchli tomoni, g‘aliz natijaning sababi emas.',
          ru: '«Они работали с короткими фрагментами, а не с целыми предложениями». «Expressions» соблазнительно: распространённые выражения статистические системы переводили хорошо, но это их сильная сторона, а не причина неуклюжего результата.',
        },
      },
    ],
  },
];
