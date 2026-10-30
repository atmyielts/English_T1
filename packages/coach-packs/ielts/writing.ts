import type { Activity, WritingTask } from '../src/types.ts';

// IELTS Writing tasks: 8 Task 2 essays, 6 Academic Task 1 reports with invented data
// and 3 General Training Task 1 letters. Every prompt and data set is original Schood
// material written to the public IELTS format; the figures are invented for practice.

const T2_END = 'Give reasons for your answer and include any relevant examples from your own knowledge or experience.\n\nWrite at least 250 words.';
const T1_END = 'Summarise the information by selecting and reporting the main features, and make comparisons where relevant.\n\nWrite at least 150 words.';
const GT_END = 'Write at least 150 words.\n\nYou do NOT need to write any addresses at the top of your letter.';
const NOTE = 'Figures are invented for practice.';

const task2 = (slug: string, title: WritingTask['title'], statement: string, instruction: string, tags: string[], assessorNotes: string): WritingTask => ({
  id: `ielts.w2.${slug}`,
  kind: 'writing',
  title,
  node: 'writing.task2',
  levels: [4, 9],
  minutes: 40,
  tags: ['task2', ...tags],
  rubric: 'ielts.writing_task2',
  prompt: `Write about the following topic:\n\n${statement}\n\n${instruction}\n\n${T2_END}`,
  minWords: 250,
  recommendedMinutes: 40,
  assessorNotes,
  ladder: [6, 7, 8],
});

const task1 = (slug: string, title: WritingTask['title'], intro: string, data: NonNullable<WritingTask['data']>, tags: string[], assessorNotes: string): WritingTask => ({
  id: `ielts.w1.${slug}`,
  kind: 'writing',
  title,
  node: 'writing.task1',
  levels: [4, 9],
  minutes: 20,
  tags: ['task1', 'academic', data.kind, ...tags],
  rubric: 'ielts.writing_task1',
  prompt: `${intro}\n\n${T1_END}`,
  data,
  minWords: 150,
  recommendedMinutes: 20,
  assessorNotes,
  ladder: [6, 7, 8],
});

const letter = (slug: string, title: WritingTask['title'], situation: string, recipient: string, bullets: string[], greeting: string, tags: string[], assessorNotes: string): WritingTask => ({
  id: `ielts.gt1.${slug}`,
  kind: 'writing',
  title,
  node: 'writing.task1',
  levels: [4, 9],
  minutes: 20,
  tags: ['task1', 'general_training', 'letter', ...tags],
  rubric: 'ielts.writing_task1',
  prompt: `${situation}\n\n${recipient} In your letter\n${bullets.map((bullet) => `- ${bullet}`).join('\n')}\n\n${GT_END}\n\nBegin your letter as follows:\n\n${greeting}`,
  minWords: 150,
  recommendedMinutes: 20,
  assessorNotes,
  ladder: [6, 7, 8],
});

// --- Task 2 --------------------------------------------------------------------------------------

const task2Prompts: WritingTask[] = [
  task2(
    'school-exams',
    { en: 'Task 2 · No exams before fourteen?', uz: 'Task 2 · O‘n to‘rt yoshgacha imtihonsizmi?', ru: 'Task 2 · Без экзаменов до 14 лет?' },
    'Some educators argue that schools should stop giving pupils formal written examinations before the age of fourteen and should judge their progress through projects and classwork instead.',
    'To what extent do you agree or disagree?',
    ['opinion', 'education'],
    'Opinion essay (agree/disagree). A strong answer states a clear position on removing formal written exams for under-fourteens in the introduction and keeps it to the end; a partly-agree position is fine if the limits are explicit (e.g. no exams before twelve, but short tests at thirteen). It must address the alternative too: whether projects and classwork can measure progress fairly (teacher bias, copying, parents doing the work) as well as what exams do (comparable results, revision habits, pressure and anxiety, teaching to the test). Ideas need specific support: an example from a school system, a classroom experience, a consequence. Essays that discuss exams in general (university entrance, adult tests) without the age limit only partly answer the task: Task Response 5 at most. Listing advantages of projects without ever taking a side means the position is unclear: Task Response 5 at most.',
  ),
  task2(
    'plastic-packaging',
    { en: 'Task 2 · A tax on plastic packaging', uz: 'Task 2 · Plastik qadoqqa soliq', ru: 'Task 2 · Налог на пластиковую упаковку' },
    'Some people believe that governments should make food companies pay a tax on every piece of plastic packaging they use, and spend the money on cleaning up the environment.',
    'To what extent do you agree or disagree?',
    ['opinion', 'environment'],
    'Opinion essay with two linked ideas: taxing food companies per piece of plastic packaging, and using the money for clean-up. A strong answer takes a clear position on the tax itself and comments on how the money should be spent (clean-up, recycling systems, or prevention instead). Good support: how the tax changes company behaviour (lighter or reusable packaging), who really pays (prices passed on to shoppers, low-income families), hygiene and food waste (some packaging keeps food fresh), enforcement and small producers. Essays about plastic pollution in general, or about individuals recycling, without discussing a tax on companies, are off the point: Task Response 5 at most. An essay that ignores how the money is spent is still answering the main question but is less complete (Task Response 6 at most if nothing else is missing).',
  ),
  task2(
    'ai-office-jobs',
    { en: 'Task 2 · Will AI replace office jobs?', uz: 'Task 2 · Sun’iy intellekt ofis ishlarini egallaydimi?', ru: 'Task 2 · Заменит ли ИИ офисную работу?' },
    'As computer programs become able to write reports, answer customers and analyse data, some people believe that most office jobs will disappear within a generation. Others think these programs will simply change the way office workers do their jobs.',
    'Discuss both views and give your own opinion.',
    ['discussion', 'technology', 'work'],
    'Discuss both views and give an opinion. A strong answer gives each view a developed paragraph: (1) why many office jobs could disappear (tasks that are routine and rule-based, cost savings, speed, examples such as call centres or data entry) and (2) why the jobs may change rather than vanish (people still check, decide and take responsibility; new roles appear; past technology changed jobs without ending them). The writer\'s own opinion must be stated clearly (introduction and conclusion at least) and may sit with either side or between them, with reasons. Writing only about one view, or about technology in general (phones, social media), limits Task Response to 5. Giving no opinion at all limits it to 5; an opinion only in the last line is a weakness (usually 6). Predictions should be supported, not just asserted.',
  ),
  task2(
    'young-offenders',
    { en: 'Task 2 · Punishing young offenders', uz: 'Task 2 · Voyaga yetmagan huquqbuzarlar', ru: 'Task 2 · Наказание несовершеннолетних' },
    'Some people believe that teenagers who commit minor offences, such as vandalism or shoplifting, should face the same punishments as adults. Others argue that young offenders should be dealt with differently, for example through education programmes or by meeting the victims of their crimes.',
    'Discuss both views and give your own opinion.',
    ['discussion', 'crime'],
    'Discuss both views and give an opinion, about minor offences by teenagers specifically. View 1 (same punishment as adults): deterrence, fairness to victims, responsibility for actions, a clear message. View 2 (a different approach): teenagers are still developing, a criminal record or prison can push them towards more crime, education and meeting victims build understanding and reduce reoffending. A strong answer develops both with examples (a case of graffiti repaid by cleaning, a programme in a school), keeps the focus on minor offences (not murder or organised crime) and states a clear opinion that may set conditions (e.g. a different approach for first offences, stricter for repeat offenders). Discussing crime and prisons in general without the age focus: Task Response 5 at most. No opinion: Task Response 5 at most.',
  ),
  task2(
    'global-products',
    { en: 'Task 2 · Products from around the world', uz: 'Task 2 · Dunyo bo‘ylab mahsulotlar', ru: 'Task 2 · Товары со всего мира' },
    'Today people in most countries can easily buy food, clothes and entertainment produced on the other side of the world.',
    'Do the advantages of this outweigh the disadvantages?',
    ['advantages_disadvantages', 'globalisation'],
    'Advantages versus disadvantages with a judgement. A strong answer explains real advantages (choice, lower prices, access to medicines and technology, cultural exchange, jobs in exporting countries) and real disadvantages (pressure on local producers and traditional crafts, similar shops and films everywhere, transport emissions, dependence on imports when supply chains break), and then clearly says whether the advantages outweigh the disadvantages, with the reason that tips the balance. The question is "outweigh", so a list of both sides without a verdict limits Task Response to 5; a verdict only in the conclusion that does not follow from the body is a weakness (usually 6). All three areas named (food, clothes, entertainment) do not need equal space, but the essay should not narrow to one of them only. Examples should be concrete (a local market, a type of film, a price).',
  ),
  task2(
    'city-centres',
    { en: 'Task 2 · Bringing families back to city centres', uz: 'Task 2 · Shahar markaziga oilalarni qaytarish', ru: 'Task 2 · Вернуть семьи в центр города' },
    'In many large cities, the centre has become crowded, noisy and expensive, and fewer families now choose to live there.',
    'What are the causes of this situation, and what measures could be taken to make city centres more attractive places to live?',
    ['causes_solutions', 'cities'],
    'Causes and solutions. A strong answer explains at least two developed causes of families leaving city centres (high rents and property prices, offices and short-term tourist rentals replacing homes, traffic noise and pollution, lack of schools, parks and safe play space, small flats) and proposes solutions that match those causes (affordable family housing quotas, limits on short-term rentals, car-free or low-traffic streets, new schools and green spaces, tax incentives). Solutions must be specific and say who acts (city council, developers, national government). Essays that only describe problems of big cities in general, or only give causes or only solutions, limit Task Response to 5. Strong essays link each solution to a cause rather than giving two unrelated lists.',
  ),
  task2(
    'teen-sleep',
    { en: 'Task 2 · Teenagers and sleep', uz: 'Task 2 · O‘smirlar va uyqu', ru: 'Task 2 · Подростки и сон' },
    'Doctors in many countries report that teenagers are sleeping much less than they need to.',
    'Why is this happening? Who should be responsible for solving this problem: parents, schools or teenagers themselves?',
    ['two_part', 'health'],
    'Two-part question: (1) reasons teenagers sleep too little and (2) who should be responsible for solving it. Part 1 needs developed reasons (phones and social media late at night, heavy homework and private tutoring, early school start times, caffeine and energy drinks, biological shift in teenage sleep patterns). Part 2 needs a clear answer about responsibility: one group, a shared responsibility with clear roles, or a ranking, with reasons; it should name what each party would actually do (phone-free bedrooms, later start times, less homework, self-discipline). Writing only about the health effects of poor sleep is off the point. Answering only one of the two questions limits Task Response to 5. Saying "everyone is responsible" without explaining how is a weak answer to part 2 (usually 6 at most).',
  ),
  task2(
    'short-video-news',
    { en: 'Task 2 · News from short videos', uz: 'Task 2 · Qisqa videolardan yangiliklar', ru: 'Task 2 · Новости из коротких видео' },
    'More and more young people now get their news from short videos posted online by individuals rather than from newspapers, television or news websites.',
    'Why is this happening? Is this a positive or a negative development?',
    ['two_part', 'media'],
    'Two-part question: (1) why young people prefer news from short videos by individuals and (2) whether this is a positive or negative development. Part 1 reasons: phones are always at hand, videos are short, free and entertaining, the presenter feels like a peer, algorithms push content, distrust of traditional media. Part 2 needs a clear judgement (positive, negative, or mainly one of them) with reasons: speed and access to voices traditional media ignore versus lack of fact-checking, misinformation, oversimplification, filter bubbles. A strong answer keeps "individuals rather than news organisations" central and gives a concrete example (a rumour that spread, a local event first reported by a resident). Essays about social media or screen time in general, or that answer only one question, limit Task Response to 5.',
  ),
];

// --- Academic Task 1 -----------------------------------------------------------------------------

const task1Reports: WritingTask[] = [
  task1(
    'bar-leisure-age',
    { en: 'Task 1 · Leisure time by age (bar chart)', uz: 'Task 1 · Yoshga ko‘ra bo‘sh vaqt (ustunli diagramma)', ru: 'Task 1 · Досуг по возрастам (столбчатая диаграмма)' },
    'The bar chart below shows the average number of hours per week that people in four age groups in one country spent on three leisure activities in 2024.',
    {
      kind: 'bar',
      title: 'Average hours per week spent on leisure activities, by age group, 2024',
      unit: 'hours per week',
      columns: ['Age group', 'Watching videos', 'Exercise', 'Reading'],
      rows: [
        ['16–24', 14.5, 4.2, 2.1],
        ['25–39', 10.8, 3.6, 2.8],
        ['40–59', 9.1, 2.9, 3.9],
        ['60+', 12.6, 2.4, 6.3],
      ],
      note: NOTE,
    },
    ['leisure'],
    'Overview must say that watching videos took the most time in every age group, and that reading rose with age while exercise fell. Key figures: videos peak at 14.5 hours (16–24), drop to a low of 9.1 (40–59) and rise again to 12.6 (60+); reading triples from 2.1 to 6.3 hours; exercise declines steadily from 4.2 to 2.4. A strong report groups by activity (or by age with comparisons) instead of listing all twelve numbers, notes the U-shape for videos, and that the over-60s read about three times as much as the youngest group and far more than they exercise. The data is from one year: change is across age groups, not over time, so "increased from 2010" style language is a misreading. No causes or opinions. Missing overview or misreported figures: Task Achievement 5 at most.',
  ),
  task1(
    'line-electric-cars',
    { en: 'Task 1 · Electric car sales (line graph)', uz: 'Task 1 · Elektromobil savdosi (chiziqli grafik)', ru: 'Task 1 · Продажи электромобилей (линейный график)' },
    'The line graph below shows the percentage of new cars sold that were electric in three countries between 2014 and 2024.',
    {
      kind: 'line',
      title: 'Electric cars as a percentage of new car sales, 2014–2024',
      unit: '% of new cars sold',
      columns: ['Year', 'Country A', 'Country B', 'Country C'],
      rows: [
        [2014, 1, 2, 0.5],
        [2016, 3, 2.5, 1],
        [2018, 8, 3, 2],
        [2020, 17, 5, 9],
        [2022, 31, 9, 21],
        [2024, 46, 15, 24],
      ],
      note: NOTE,
    },
    ['transport'],
    'Overview must say that the electric share rose in all three countries, most dramatically in Country A, which led from 2016 onwards, while Country B grew slowly and ended lowest. Key figures: A rises from 1% to 46% (overtaking B in 2016, 3% vs 2.5%); C stays very low until 2018 (2%), surges to 21% by 2022 and then almost levels off at 24%; B starts highest in 2014 (2%) but creeps up only to 15% by 2024, falling behind C from 2020 (5% vs 9%). A strong report describes the shape of each line (steady acceleration for A, late surge then plateau for C, slow climb for B) with selected figures and the crossing points, rather than every value. Percentages are shares of new car sales, not numbers of cars. Missing overview or misread values: Task Achievement 5 at most.',
  ),
  task1(
    'pie-household-budget',
    { en: 'Task 1 · Household budget, 2004 and 2024 (pie charts)', uz: 'Task 1 · Oila byudjeti, 2004 va 2024 (doiraviy diagrammalar)', ru: 'Task 1 · Семейный бюджет, 2004 и 2024 (круговые диаграммы)' },
    'The pie charts below show how the average household budget in one city was divided between different categories of spending in 2004 and 2024.',
    {
      kind: 'pie',
      title: 'Share of the average household budget by category, 2004 and 2024',
      unit: '% of total spending',
      columns: ['Category', '2004', '2024'],
      rows: [
        ['Housing', 24, 33],
        ['Food', 31, 22],
        ['Transport', 12, 14],
        ['Education', 6, 9],
        ['Leisure', 8, 11],
        ['Clothing', 11, 5],
        ['Other', 8, 6],
      ],
      note: NOTE,
    },
    ['spending'],
    'Overview must say that food was the largest share in 2004 but housing had replaced it by 2024, and that housing, leisure, education and transport grew while food and clothing shrank. Key figures: housing 24% to 33% (largest in 2024, about one third); food 31% to 22%; clothing more than halved, 11% to 5%; leisure 8% to 11%, education 6% to 9%, transport 12% to 14%; other 8% to 6%. A strong report groups the categories that rose and those that fell, notes the swap at the top, and uses fraction language accurately (almost a third, about a fifth). The charts show shares, not amounts of money, so "people spent more money on housing" is a misreading unless phrased as a share. Missing overview or misreported figures: Task Achievement 5 at most.',
  ),
  task1(
    'table-museum-visitors',
    { en: 'Task 1 · Museum visitors (table)', uz: 'Task 1 · Muzey tashrifchilari (jadval)', ru: 'Task 1 · Посетители музеев (таблица)' },
    'The table below shows the number of visitors to four museums in one city in 2014, 2019 and 2024, and the percentage of visitors who came from abroad in 2024.',
    {
      kind: 'table',
      title: 'Visitors to four city museums (thousands) and share of foreign visitors in 2024',
      unit: 'thousands of visitors; foreign share in %',
      columns: ['Museum', '2014', '2019', '2024', 'Foreign visitors in 2024 (%)'],
      rows: [
        ['Science Museum', 420, 510, 640, 18],
        ['History Museum', 610, 590, 560, 47],
        ['Art Gallery', 230, 350, 480, 39],
        ['Children’s Museum', 150, 210, 205, 6],
      ],
      note: NOTE,
    },
    ['culture'],
    'Overview must say that three museums gained visitors while the History Museum lost them and lost its top position to the Science Museum, and that the History Museum had by far the highest share of foreign visitors. Key figures: Science 420 to 640 thousand (most visited in 2024); History 610 (most visited in 2014) down to 560; Art Gallery more than doubled, 230 to 480 (the fastest growth); Children’s Museum 150 to 210, then stable at 205. Foreign share in 2024: History 47%, Art Gallery 39%, Science 18%, Children’s only 6%. A strong report links the two parts (the museum with falling numbers relies most on foreign visitors; the Children’s Museum is almost entirely local) and does not treat the percentage column as a fourth year. Numbers are thousands. Missing overview or misreported figures: Task Achievement 5 at most.',
  ),
  task1(
    'process-dried-apricots',
    { en: 'Task 1 · Producing dried apricots (process)', uz: 'Task 1 · Quritilgan o‘rik ishlab chiqarish (jarayon)', ru: 'Task 1 · Производство кураги (процесс)' },
    'The diagram below shows the stages in the commercial production of dried apricots.',
    {
      kind: 'process',
      title: 'Commercial production of dried apricots',
      columns: ['Step', 'Description'],
      rows: [
        [1, 'Harvesting: ripe apricots are picked by hand in June and July.'],
        [2, 'Washing and sorting: the fruit is washed in cold water and sorted by size; damaged fruit is removed.'],
        [3, 'Cutting: each apricot is cut in half and the stone is removed; the stones are sent away to make oil.'],
        [4, 'Treating: the halves are placed in a closed chamber with sulphur gas for 2 to 4 hours to keep their orange colour.'],
        [5, 'Drying: the halves are spread on wooden trays and dried in the sun for 5 to 7 days, or in a heated tunnel for about 24 hours.'],
        [6, 'Checking: moisture is measured; fruit above 20% moisture is returned for more drying.'],
        [7, 'Grading: the dried fruit is graded by colour and size.'],
        [8, 'Packing and delivery: the apricots are packed in 1 kg bags and boxes and delivered to shops or exported.'],
      ],
      note: NOTE,
    },
    ['process', 'food'],
    'Overview must say that the process has eight stages, from hand harvesting to packing, and point out its main features: a choice of two drying methods (sun or heated tunnel) and a quality-check loop where fruit that is too wet goes back for more drying. A strong report follows the sequence accurately with sequencing language (first, once, after that, finally), uses the passive throughout (are picked, is removed), and includes the details that matter: June–July harvest by hand, sorting by size and removal of damaged fruit, stones removed and sent for oil, 2–4 hours in sulphur gas to keep the colour, 5–7 days in the sun or about 24 hours in a tunnel, the 20% moisture limit, grading by colour and size, 1 kg packs for shops or export. Missing the loop or either drying option, steps out of order, or no overview: Task Achievement 5 at most. No opinions about the product.',
  ),
  task1(
    'bar-commuting',
    { en: 'Task 1 · How employees travel to work (bar chart)', uz: 'Task 1 · Xodimlar ishga qanday borishadi (ustunli diagramma)', ru: 'Task 1 · Как сотрудники добираются до работы (столбчатая диаграмма)' },
    'The bar chart below shows the main way that employees in one city travelled to work in 2010 and 2024.',
    {
      kind: 'bar',
      title: 'Main way of travelling to work, % of employees, 2010 and 2024',
      unit: '% of employees',
      columns: ['Way of travelling', '2010', '2024'],
      rows: [
        ['Car', 48, 37],
        ['Bus', 27, 21],
        ['Metro', 11, 19],
        ['Bicycle', 3, 9],
        ['Walking', 9, 8],
        ['Working from home', 2, 6],
      ],
      note: NOTE,
    },
    ['transport'],
    'Overview must say that the car remained the most common way to get to work in both years but lost ground, while the metro, cycling and working from home grew. Key figures: car 48% to 37%; bus 27% to 21%; metro 11% to 19% (almost doubling, and only two points behind the bus by 2024); bicycle tripled from 3% to 9%; working from home tripled from 2% to 6%; walking almost unchanged (9% to 8%). A strong report groups the falling modes (car, bus) against the rising ones (metro, bicycle, home) and mentions the stable one, rather than listing six pairs of numbers. "Working from home" is not a way of travelling and is best described as a separate group. Values are shares of employees. Missing overview or misreported figures: Task Achievement 5 at most.',
  ),
];

// --- General Training Task 1 -------------------------------------------------------------------------

const letters: WritingTask[] = [
  letter(
    'cancelled-course',
    { en: 'GT Task 1 · A cancelled course (formal letter)', uz: 'GT Task 1 · Bekor qilingan kurs (rasmiy xat)', ru: 'GT Task 1 · Отменённый курс (официальное письмо)' },
    'You recently paid for an eight-week evening course at a local college, but the college cancelled the course after only two lessons and has not contacted you since.',
    'Write a letter to the manager of the college.',
    ['say which course you booked and what happened', 'explain how the cancellation has affected you', 'say what you would like the college to do'],
    'Dear Sir or Madam,',
    ['formal', 'complaint'],
    'Formal complaint. The purpose (to complain and ask for action) must be clear from the first lines. All three points are needed: (1) the course name, dates, price or booking details and what happened (cancelled after two lessons, no contact); (2) concrete effects (money paid, plans changed, a missed goal such as a qualification or a job requirement, time off work or childcare arranged); (3) a specific request (a full or partial refund by a date, a place on the next course, an explanation) with a polite but firm tone. Register: formal throughout ("I am writing to…", "I would be grateful if…", "Yours faithfully" after "Dear Sir or Madam"); no contractions, slang or aggressive language. A missing bullet point limits Task Achievement to 5; an inconsistent or informal tone, or no clear request, usually limits it to 6. Under 150 words is penalised.',
  ),
  letter(
    'staff-day-out',
    { en: 'GT Task 1 · Ideas for a staff day out (semi-formal letter)', uz: 'GT Task 1 · Xodimlar sayohati uchun takliflar (yarim rasmiy xat)', ru: 'GT Task 1 · Идеи для корпоративной поездки (полуофициальное письмо)' },
    'Your company is planning a day out for all staff next month, and your manager has asked employees to suggest ideas.',
    'Write a letter to your manager.',
    ['suggest a place for the day out', 'explain why it would suit your colleagues', 'describe what activities people could do there'],
    'Dear Mr Harper,',
    ['semi_formal', 'suggestion'],
    'Semi-formal letter to a known manager. The purpose (responding to the request with a suggestion) must be clear early. All three points: (1) one specific place, named and located (a lake, a mountain resort, a farm, a city museum), with practical details such as travel time; (2) why it suits colleagues, tied to who they are (different ages and fitness levels, families, people who do not drink, budget, team-building); (3) specific activities (a guided walk, a cooking class, a team quiz, boating), ideally with options for different people. Register: polite and friendly but respectful ("I thought you might be interested in…", "I would be happy to help organise…", "Kind regards" or "Yours sincerely" with the manager’s name); too informal (slang, "Hi mate") or stiffly formal throughout is a weakness. A missing point limits Task Achievement to 5; vague suggestions without detail usually limit it to 6.',
  ),
  letter(
    'friend-visit',
    { en: 'GT Task 1 · Advice for a visiting friend (informal letter)', uz: 'GT Task 1 · Mehmon do‘stga maslahat (norasmiy xat)', ru: 'GT Task 1 · Советы другу перед приездом (неофициальное письмо)' },
    'A friend from another country is planning to visit your city for a week next summer and has asked you for advice.',
    'Write a letter to your friend.',
    ['tell your friend what the weather will be like and what to bring', 'suggest some places to visit', 'offer to help in some way during the visit'],
    'Dear …,',
    ['informal', 'advice'],
    'Informal letter to a friend. A friendly opening that responds to the friend’s news, then all three points: (1) realistic summer weather for the writer’s city (heat, temperatures, rain or not) and practical things to bring linked to it (light clothes, a hat, sunscreen, a jacket for cool evenings, comfortable shoes); (2) two or three specific places with a reason for each (a market, a historic area, a park, a day trip); (3) a concrete offer of help (meeting at the airport, a place to stay, being a guide on certain days, buying a local SIM card). Register: warm and natural, contractions and phrasal verbs welcome ("can’t wait", "pick you up"), a friendly close ("See you soon", "Best wishes"). Writing formally ("I am writing to inform you…", "Yours faithfully") is a tone error that usually limits Task Achievement to 6. A missing point limits it to 5.',
  ),
];

export const writing: Activity[] = [...task2Prompts, ...task1Reports, ...letters];
