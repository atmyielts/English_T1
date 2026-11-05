import { T } from '../src/localize.ts';
import type { Activity, CueCard, Localized } from '../src/types.ts';

// Spoken interview practice, scored on career.interview: a "present yourself" long
// turn (prep and talk timers, then follow-up questions), HR classics, behavioural
// (STAR) questions and role-specific sets for eight job families common in
// Uzbekistan. Practice: one part at a time, every answer scored with quotes, fluency
// numbers and "say it better" lines, then re-record. Mock: every part in order and one
// recruiter-style review at the end. The learner answers in Uzbek, Russian or English.

type Tri = { en: string; uz: string; ru: string };
const L = (en: string, uz: string, ru: string): Localized => ({ en, uz, ru });
const q = (en: string, uz: string, ru: string) => T({ en, uz, ru });
const topic = (id: string, title: Tri, questions: string[]) => ({ id, title: T(title), questions });

interface CardDef { id: string; topic: Tri; points: Tri[]; roundOff: Tri[]; discussion: Tri[] }
const card = (def: CardDef): CueCard => ({
  id: def.id, topic: T(def.topic), points: def.points.map((point) => T(point)), prepSeconds: 60, talkSeconds: 90, minTalkSeconds: 45,
  roundOff: def.roundOff.map((line) => T(line)), discussion: def.discussion.map((line) => T(line)),
});
const pt = (en: string, uz: string, ru: string): Tri => ({ en, uz, ru });

const PITCH_POINTS = [
  pt('what you do now', 'hozir nima bilan bandsiz', 'чем вы занимаетесь сейчас'),
  pt('one or two achievements that fit this role', 'shu lavozimga mos bir-ikki yutuq', 'одно-два достижения, подходящих к этой роли'),
  pt('why this job is your next step', 'nega bu ish keyingi qadamingiz', 'почему эта работа — ваш следующий шаг'),
];

const cards: CueCard[] = [
  card({
    id: 'pitch-bank', topic: pt('Present yourself for a customer service officer role at a commercial bank.', 'Tijorat bankida mijozlarga xizmat ko‘rsatish bo‘yicha mutaxassis lavozimi uchun o‘zingizni tanishtiring.', 'Представьтесь на позицию специалиста по обслуживанию клиентов в коммерческом банке.'),
    points: PITCH_POINTS,
    roundOff: [pt('What do you know about how banks earn customers\' trust?', 'Banklar mijozlar ishonchini qanday qozonishi haqida nima bilasiz?', 'Что вы знаете о том, как банки завоёвывают доверие клиентов?')],
    discussion: [
      pt('How would you explain a loan rejection to an upset customer?', 'Xafa bo‘lgan mijozga kredit rad etilganini qanday tushuntirasiz?', 'Как бы вы объяснили расстроенному клиенту отказ в кредите?'),
      pt('Which is more important at a branch: speed or accuracy? Why?', 'Filialda nima muhimroq: tezlikmi yoki aniqlik? Nega?', 'Что важнее в отделении: скорость или точность? Почему?'),
      pt('How do you keep learning new products and rules?', 'Yangi mahsulot va qoidalarni qanday o‘rganib borasiz?', 'Как вы продолжаете изучать новые продукты и правила?'),
    ],
  }),
  card({
    id: 'pitch-it', topic: pt('Present yourself for a junior software developer role at an outsourcing company.', 'Autsorsing kompaniyasida boshlovchi dasturchi lavozimi uchun o‘zingizni tanishtiring.', 'Представьтесь на позицию младшего разработчика в аутсорсинговой компании.'),
    points: PITCH_POINTS,
    roundOff: [pt('Which project are you most proud of, and what was your part?', 'Qaysi loyihangiz bilan ko‘proq faxrlanasiz va unda sizning hissangiz nima edi?', 'Каким проектом вы гордитесь больше всего и какой была ваша роль?')],
    discussion: [
      pt('How do you learn a new technology quickly?', 'Yangi texnologiyani qanday tez o‘rganasiz?', 'Как вы быстро осваиваете новую технологию?'),
      pt('What would you do if you could not finish a task by the deadline?', 'Vazifani muddatida tugata olmasangiz nima qilasiz?', 'Что вы сделаете, если не успеваете закончить задачу к сроку?'),
      pt('How do you react to criticism of your code?', 'Kodingiz tanqid qilinsa, qanday munosabatda bo‘lasiz?', 'Как вы реагируете на критику вашего кода?'),
    ],
  }),
  card({
    id: 'pitch-teacher', topic: pt('Present yourself for an English teacher role at a private learning centre.', 'Xususiy o‘quv markazida ingliz tili o‘qituvchisi lavozimi uchun o‘zingizni tanishtiring.', 'Представьтесь на позицию преподавателя английского в частном учебном центре.'),
    points: PITCH_POINTS,
    roundOff: [pt('What results have your students achieved?', 'O‘quvchilaringiz qanday natijalarga erishgan?', 'Каких результатов добились ваши ученики?')],
    discussion: [
      pt('How do you keep a mixed-level group motivated?', 'Turli darajadagi guruhni qanday rag‘batlantirib turasiz?', 'Как вы поддерживаете мотивацию разноуровневой группы?'),
      pt('How do you talk to parents who are unhappy with progress?', 'Natijadan norozi ota-onalar bilan qanday gaplashasiz?', 'Как вы говорите с родителями, недовольными прогрессом?'),
      pt('How do you use technology in your lessons?', 'Darslaringizda texnologiyadan qanday foydalanasiz?', 'Как вы используете технологии на уроках?'),
    ],
  }),
  card({
    id: 'pitch-hotel', topic: pt('Present yourself for a front office supervisor role at a hotel in Samarkand.', 'Samarqanddagi mehmonxonada qabulxona supervayzeri lavozimi uchun o‘zingizni tanishtiring.', 'Представьтесь на позицию супервайзера службы приёма в отеле Самарканда.'),
    points: PITCH_POINTS,
    roundOff: [pt('Which languages do you use with guests, and how well?', 'Mehmonlar bilan qaysi tillarda va qanchalik yaxshi gaplashasiz?', 'На каких языках вы говорите с гостями и насколько хорошо?')],
    discussion: [
      pt('How would you organise the desk during a busy tour season?', 'Gavjum turistik mavsumda qabulxona ishini qanday tashkil qilasiz?', 'Как бы вы организовали работу стойки в разгар туристического сезона?'),
      pt('What makes a guest come back to a hotel?', 'Mehmonni mehmonxonaga qayta keltiradigan narsa nima?', 'Что заставляет гостя вернуться в отель?'),
      pt('How do you train a new receptionist?', 'Yangi qabulxona xodimini qanday o‘qitasiz?', 'Как вы обучаете нового администратора?'),
    ],
  }),
  card({
    id: 'pitch-sales', topic: pt('Present yourself for a sales representative role at an FMCG distributor.', 'FMCG distributorida savdo vakili lavozimi uchun o‘zingizni tanishtiring.', 'Представьтесь на позицию торгового представителя в FMCG-дистрибуции.'),
    points: PITCH_POINTS,
    roundOff: [pt('How do you handle a shop owner who says no?', '«Yo‘q» degan do‘kon egasi bilan qanday ishlaysiz?', 'Как вы работаете с владельцем магазина, который говорит «нет»?')],
    discussion: [
      pt('How do you plan a day of shop visits?', 'Do‘konlarga tashriflar kunini qanday rejalashtirasiz?', 'Как вы планируете день визитов в магазины?'),
      pt('What would you do if you missed your monthly target?', 'Oylik rejani bajara olmasangiz nima qilasiz?', 'Что вы сделаете, если не выполнили месячный план?'),
      pt('How do you build trust with a new customer?', 'Yangi mijoz bilan qanday ishonch o‘rnatasiz?', 'Как вы выстраиваете доверие с новым клиентом?'),
    ],
  }),
  card({
    id: 'pitch-accountant', topic: pt('Present yourself for an accountant role at a construction company.', 'Qurilish kompaniyasida buxgalter lavozimi uchun o‘zingizni tanishtiring.', 'Представьтесь на позицию бухгалтера в строительной компании.'),
    points: PITCH_POINTS,
    roundOff: [pt('Which accounting software have you used most?', 'Qaysi buxgalteriya dasturida ko‘proq ishlagansiz?', 'В какой бухгалтерской программе вы работали больше всего?')],
    discussion: [
      pt('How do you make sure your figures are correct at month end?', 'Oy yakunida raqamlaringiz to‘g‘riligiga qanday ishonch hosil qilasiz?', 'Как вы убеждаетесь в точности цифр в конце месяца?'),
      pt('How do you explain a financial problem to a non-finance manager?', 'Moliyaviy muammoni moliyachi bo‘lmagan rahbarga qanday tushuntirasiz?', 'Как вы объясняете финансовую проблему руководителю-нефинансисту?'),
      pt('What would you do if a director asked you to record something incorrectly?', 'Direktor biror narsani noto‘g‘ri qayd etishni so‘rasa, nima qilasiz?', 'Что вы сделаете, если директор попросит отразить что-то неправильно?'),
    ],
  }),
  card({
    id: 'pitch-marketing', topic: pt('Present yourself for a digital marketing specialist role at an online shop.', 'Onlayn do‘konda raqamli marketing mutaxassisi lavozimi uchun o‘zingizni tanishtiring.', 'Представьтесь на позицию специалиста по digital-маркетингу в интернет-магазине.'),
    points: PITCH_POINTS,
    roundOff: [pt('Which result from your marketing work can you prove with numbers?', 'Marketing ishingizdagi qaysi natijani raqamlar bilan isbotlay olasiz?', 'Какой результат вашей маркетинговой работы вы можете подтвердить цифрами?')],
    discussion: [
      pt('How would you choose between Instagram and Telegram for a new product?', 'Yangi mahsulot uchun Instagram va Telegram orasida qanday tanlov qilasiz?', 'Как бы вы выбирали между Instagram и Telegram для нового продукта?'),
      pt('What do you do when a campaign is not working?', 'Kampaniya ishlamayotgan bo‘lsa nima qilasiz?', 'Что вы делаете, если кампания не работает?'),
      pt('How do you work with designers and sales people?', 'Dizaynerlar va sotuvchilar bilan qanday ishlaysiz?', 'Как вы работаете с дизайнерами и продавцами?'),
    ],
  }),
  card({
    id: 'pitch-logistics', topic: pt('Present yourself for a logistics coordinator role at a distribution company.', 'Distribyutorlik kompaniyasida logistika koordinatori lavozimi uchun o‘zingizni tanishtiring.', 'Представьтесь на позицию координатора логистики в дистрибьюторской компании.'),
    points: PITCH_POINTS,
    roundOff: [pt('What is the most difficult delivery problem you have solved?', 'Siz hal qilgan eng qiyin yetkazib berish muammosi qaysi?', 'Какую самую сложную проблему с доставкой вы решили?')],
    discussion: [
      pt('How do you decide which orders go first?', 'Qaysi buyurtma birinchi ketishini qanday hal qilasiz?', 'Как вы решаете, какие заказы отправлять первыми?'),
      pt('How do you work with drivers who are always late?', 'Doim kechikadigan haydovchilar bilan qanday ishlaysiz?', 'Как вы работаете с водителями, которые постоянно опаздывают?'),
      pt('Which tools do you use to track shipments?', 'Yuklarni kuzatish uchun qaysi vositalardan foydalanasiz?', 'Какими инструментами вы отслеживаете отправки?'),
    ],
  }),
  card({
    id: 'pitch-student', topic: pt('Present yourself as a final-year student for a graduate trainee programme at a telecom company.', 'Bitiruvchi kurs talabasi sifatida telekom kompaniyasining bitiruvchilar dasturiga o‘zingizni tanishtiring.', 'Представьтесь как студент выпускного курса на программу для выпускников в телеком-компании.'),
    points: [
      pt('what you study and what you are best at', 'nima o‘qiyapsiz va nimada eng kuchlisiz', 'что вы изучаете и в чём вы сильнее всего'),
      pt('a project, job or volunteering that shows a key skill', 'muhim ko‘nikmani ko‘rsatadigan loyiha, ish yoki ko‘ngillilik', 'проект, работа или волонтёрство, которые показывают ключевой навык'),
      pt('why this programme and this company', 'nega aynan shu dastur va shu kompaniya', 'почему именно эта программа и эта компания'),
    ],
    roundOff: [pt('Where would you like to be in three years?', 'Uch yildan keyin qayerda bo‘lishni xohlaysiz?', 'Где бы вы хотели быть через три года?')],
    discussion: [
      pt('What did you learn from a group project that went wrong?', 'Muvaffaqiyatsiz chiqqan guruh loyihasidan nimani o‘rgandingiz?', 'Чему вас научил неудачный групповой проект?'),
      pt('How do you balance study and other commitments?', 'O‘qish va boshqa majburiyatlarni qanday muvozanatlashtirasiz?', 'Как вы совмещаете учёбу и другие обязательства?'),
      pt('Which department would you like to rotate into first, and why?', 'Avval qaysi bo‘limda ishlab ko‘rishni xohlaysiz va nega?', 'В какой отдел вы хотели бы попасть первым и почему?'),
    ],
  }),
  card({
    id: 'pitch-ngo', topic: pt('Present yourself for a project assistant role at an international development organisation.', 'Xalqaro rivojlanish tashkilotida loyiha yordamchisi lavozimi uchun o‘zingizni tanishtiring.', 'Представьтесь на позицию ассистента проекта в международной организации развития.'),
    points: PITCH_POINTS,
    roundOff: [pt('Which community or social project have you been part of?', 'Qaysi jamoat yoki ijtimoiy loyihada qatnashgansiz?', 'В каком общественном или социальном проекте вы участвовали?')],
    discussion: [
      pt('How do you report progress to a donor or a manager?', 'Donor yoki rahbarga natijalar haqida qanday hisobot berasiz?', 'Как вы отчитываетесь о ходе проекта перед донором или руководителем?'),
      pt('How do you work with people from very different backgrounds?', 'Turli muhitdan kelgan odamlar bilan qanday ishlaysiz?', 'Как вы работаете с людьми совершенно разного происхождения?'),
      pt('What would you do if a training event had very few participants?', 'Treningga juda kam odam kelsa nima qilasiz?', 'Что вы сделаете, если на тренинг пришло очень мало участников?'),
    ],
  }),
];

const hrTopics = [
  topic('hr-about', pt('About you', 'O‘zingiz haqingizda', 'О себе'), [
    q('Tell me about yourself.', 'O‘zingiz haqingizda gapirib bering.', 'Расскажите о себе.'),
    q('Walk me through your CV in two minutes.', 'Rezyumengizni ikki daqiqada tushuntirib bering.', 'Пройдитесь по своему резюме за две минуты.'),
    q('How would your last manager describe you?', 'Oxirgi rahbaringiz sizni qanday ta’riflagan bo‘lardi?', 'Как бы вас описал ваш последний руководитель?'),
    q('What are you most proud of in your career so far?', 'Hozirgacha karyerangizda nimadan ko‘proq faxrlanasiz?', 'Чем вы больше всего гордитесь в своей карьере на сегодня?'),
    q('Why is there a gap in your CV?', 'Rezyumengizda nega uzilish bor?', 'Почему в вашем резюме есть перерыв?'),
  ]),
  topic('hr-motivation', pt('Motivation', 'Motivatsiya', 'Мотивация'), [
    q('Why do you want to work for us?', 'Nega aynan bizda ishlamoqchisiz?', 'Почему вы хотите работать у нас?'),
    q('Why are you leaving your current job?', 'Hozirgi ishingizdan nega ketyapsiz?', 'Почему вы уходите с текущей работы?'),
    q('What do you know about our company?', 'Kompaniyamiz haqida nima bilasiz?', 'Что вы знаете о нашей компании?'),
    q('What attracted you to this role?', 'Bu lavozimda sizni nima qiziqtirdi?', 'Что вас привлекло в этой позиции?'),
    q('What kind of work makes you lose track of time?', 'Qanday ish paytida vaqt qanday o‘tganini sezmay qolasiz?', 'За какой работой вы теряете счёт времени?'),
  ]),
  topic('hr-strengths', pt('Strengths and weaknesses', 'Kuchli va zaif tomonlar', 'Сильные и слабые стороны'), [
    q('What is your greatest strength?', 'Eng kuchli tomoningiz nima?', 'Какая ваша самая сильная сторона?'),
    q('What is a weakness you are working on?', 'Ustida ishlayotgan zaif tomoningiz nima?', 'Над какой слабой стороной вы работаете?'),
    q('Which skill would you like to improve this year?', 'Bu yil qaysi ko‘nikmangizni yaxshilamoqchisiz?', 'Какой навык вы хотите улучшить в этом году?'),
    q('What feedback have you received that changed how you work?', 'Ishlash usulingizni o‘zgartirgan qanday fikr-mulohaza olgansiz?', 'Какой отзыв изменил то, как вы работаете?'),
    q('Why should we hire you rather than another candidate?', 'Nega boshqa nomzod emas, aynan sizni ishga olishimiz kerak?', 'Почему мы должны взять вас, а не другого кандидата?'),
  ]),
  topic('hr-goals', pt('Goals and fit', 'Maqsadlar va moslik', 'Цели и соответствие'), [
    q('Where do you see yourself in five years?', 'Besh yildan keyin o‘zingizni qayerda ko‘rasiz?', 'Где вы видите себя через пять лет?'),
    q('What kind of team do you work best in?', 'Qanday jamoada eng yaxshi ishlaysiz?', 'В какой команде вы работаете лучше всего?'),
    q('How do you prefer to be managed?', 'Sizni qanday boshqarishlarini afzal ko‘rasiz?', 'Как вы предпочитаете, чтобы вами руководили?'),
    q('What are your salary expectations?', 'Maosh bo‘yicha kutilmalaringiz qanday?', 'Каковы ваши ожидания по зарплате?'),
    q('Do you have any questions for us?', 'Bizga savollaringiz bormi?', 'У вас есть вопросы к нам?'),
  ]),
];

const starTopics = [
  topic('star-team', pt('Teamwork', 'Jamoada ishlash', 'Командная работа'), [
    q('Tell me about a time you worked well in a team.', 'Jamoada yaxshi ishlagan bir holatingiz haqida gapirib bering.', 'Расскажите о случае, когда вы хорошо поработали в команде.'),
    q('Tell me about a time a teammate did not do their share.', 'Jamoadoshingiz o‘z ulushini bajarmagan holat haqida gapirib bering.', 'Расскажите о случае, когда коллега не выполнял свою часть работы.'),
    q('Describe a time you helped a colleague succeed.', 'Hamkasbingizga muvaffaqiyatga erishishda yordam bergan holatni tasvirlang.', 'Опишите случай, когда вы помогли коллеге добиться успеха.'),
    q('Tell me about working with someone very different from you.', 'O‘zingizdan juda farq qiladigan odam bilan ishlaganingiz haqida gapiring.', 'Расскажите о работе с человеком, очень непохожим на вас.'),
  ]),
  topic('star-conflict', pt('Conflict and difficult people', 'Nizo va qiyin odamlar', 'Конфликты и трудные люди'), [
    q('Tell me about a time you disagreed with your manager.', 'Rahbaringiz bilan kelisha olmagan holat haqida gapirib bering.', 'Расскажите о случае, когда вы не согласились с руководителем.'),
    q('Describe a time you dealt with an angry customer.', 'Jahli chiqqan mijoz bilan ishlagan holatingizni tasvirlang.', 'Опишите случай, когда вы имели дело с рассерженным клиентом.'),
    q('Tell me about a conflict in a team and how it ended.', 'Jamoadagi nizo va u qanday tugagani haqida gapiring.', 'Расскажите о конфликте в команде и чем он закончился.'),
    q('Describe a time you had to say no to someone important.', 'Muhim odamga «yo‘q» deyishga to‘g‘ri kelgan holatni tasvirlang.', 'Опишите случай, когда вам пришлось отказать важному человеку.'),
  ]),
  topic('star-failure', pt('Mistakes and learning', 'Xatolar va saboqlar', 'Ошибки и уроки'), [
    q('Tell me about a mistake you made at work and what you did next.', 'Ishdagi xatoingiz va undan keyin nima qilganingiz haqida gapirib bering.', 'Расскажите об ошибке на работе и о том, что вы сделали после.'),
    q('Describe a project that did not go as planned.', 'Rejadagidek bo‘lmagan loyihani tasvirlang.', 'Опишите проект, который пошёл не по плану.'),
    q('Tell me about a time you had to learn something very quickly.', 'Biror narsani juda tez o‘rganishga to‘g‘ri kelgan holat haqida gapiring.', 'Расскажите о случае, когда вам пришлось очень быстро чему-то научиться.'),
    q('Tell me about feedback that was hard to hear.', 'Eshitish qiyin bo‘lgan fikr-mulohaza haqida gapiring.', 'Расскажите об отзыве, который было трудно услышать.'),
  ]),
  topic('star-initiative', pt('Initiative and leadership', 'Tashabbus va yetakchilik', 'Инициатива и лидерство'), [
    q('Tell me about a time you improved a process.', 'Biror jarayonni yaxshilagan holatingiz haqida gapirib bering.', 'Расскажите о случае, когда вы улучшили процесс.'),
    q('Describe a time you took the lead without being asked.', 'So‘ralmasdan tashabbusni qo‘lga olgan holatni tasvirlang.', 'Опишите случай, когда вы взяли инициативу на себя без просьбы.'),
    q('Tell me about a time you persuaded someone to change their mind.', 'Kimnidir fikrini o‘zgartirishga ko‘ndirgan holat haqida gapiring.', 'Расскажите о случае, когда вы убедили кого-то изменить мнение.'),
    q('Describe a goal you set yourself and how you reached it.', 'O‘zingizga qo‘ygan maqsad va unga qanday erishganingizni tasvirlang.', 'Опишите цель, которую вы себе поставили, и как вы её достигли.'),
  ]),
  topic('star-pressure', pt('Pressure and priorities', 'Bosim va ustuvorliklar', 'Давление и приоритеты'), [
    q('Tell me about a time you worked to a very tight deadline.', 'Juda qisqa muddatda ishlagan holatingiz haqida gapirib bering.', 'Расскажите о работе в очень сжатые сроки.'),
    q('Describe a day when everything went wrong at once.', 'Hammasi bir vaqtda noto‘g‘ri ketgan kunni tasvirlang.', 'Опишите день, когда всё пошло не так одновременно.'),
    q('Tell me about a time you had too many tasks. How did you decide?', 'Vazifalar juda ko‘p bo‘lgan holat haqida gapiring. Qanday qaror qildingiz?', 'Расскажите о случае, когда задач было слишком много. Как вы решали?'),
    q('Describe a decision you had to make without enough information.', 'Yetarli ma’lumotsiz qabul qilishga majbur bo‘lgan qaroringizni tasvirlang.', 'Опишите решение, которое вам пришлось принять без достаточной информации.'),
  ]),
  topic('star-customer', pt('Customers and results', 'Mijozlar va natijalar', 'Клиенты и результаты'), [
    q('Tell me about a time you went beyond what a customer expected.', 'Mijoz kutganidan ham ko‘proq ish qilgan holatingiz haqida gapiring.', 'Расскажите о случае, когда вы превзошли ожидания клиента.'),
    q('Describe your best result in your last job.', 'Oxirgi ishingizdagi eng yaxshi natijangizni tasvirlang.', 'Опишите ваш лучший результат на последней работе.'),
    q('Tell me about a time you used data to make a decision.', 'Qaror qabul qilishda ma’lumotlardan foydalangan holat haqida gapiring.', 'Расскажите о случае, когда вы приняли решение на основе данных.'),
    q('Describe a time you saved your team time or money.', 'Jamoangizning vaqti yoki pulini tejagan holatni tasvirlang.', 'Опишите случай, когда вы сэкономили команде время или деньги.'),
  ]),
];

const roleTopics = [
  topic('role-sales', pt('Sales roles', 'Savdo lavozimlari', 'Продажи'), [
    q('Sell me this pen in one minute.', 'Bir daqiqada menga shu ruchkani soting.', 'Продайте мне эту ручку за минуту.'),
    q('How do you find new customers?', 'Yangi mijozlarni qanday topasiz?', 'Как вы находите новых клиентов?'),
    q('What do you do when a customer says the price is too high?', 'Mijoz narx qimmat desa nima qilasiz?', 'Что вы делаете, когда клиент говорит, что цена слишком высокая?'),
    q('Tell me about your best month in sales and why it went well.', 'Savdodagi eng yaxshi oyingiz va nega yaxshi o‘tgani haqida gapiring.', 'Расскажите о вашем лучшем месяце в продажах и почему он удался.'),
  ]),
  topic('role-it', pt('IT roles', 'IT lavozimlari', 'IT'), [
    q('Explain a technical project you worked on to someone who is not technical.', 'Ishlagan texnik loyihangizni texnik bo‘lmagan odamga tushuntiring.', 'Объясните ваш технический проект человеку без технического образования.'),
    q('How do you find the cause of a bug you cannot reproduce?', 'Takrorlab bo‘lmaydigan xatoning sababini qanday topasiz?', 'Как вы ищете причину бага, который не удаётся воспроизвести?'),
    q('How do you make sure your code is easy for others to maintain?', 'Kodingizni boshqalar oson qo‘llab-quvvatlashi uchun nima qilasiz?', 'Как вы делаете так, чтобы ваш код было легко поддерживать другим?'),
    q('Tell me about a time you had to change your solution after code review.', 'Kod tekshiruvidan keyin yechimingizni o‘zgartirishga to‘g‘ri kelgan holatni ayting.', 'Расскажите, как вам пришлось изменить решение после код-ревью.'),
  ]),
  topic('role-finance', pt('Finance and accounting roles', 'Moliya va buxgalteriya lavozimlari', 'Финансы и бухгалтерия'), [
    q('How do you close the month accurately and on time?', 'Oyni qanday aniq va o‘z vaqtida yopasiz?', 'Как вы закрываете месяц точно и вовремя?'),
    q('Tell me about a reconciliation that did not match. What did you do?', 'Mos kelmagan solishtirma dalolatnoma haqida gapiring. Nima qildingiz?', 'Расскажите о сверке, которая не сошлась. Что вы сделали?'),
    q('How would you reduce a company\'s costs without hurting quality?', 'Sifatga zarar yetkazmasdan kompaniya xarajatlarini qanday kamaytirasiz?', 'Как бы вы снизили расходы компании, не ухудшив качество?'),
    q('Which reports would you show a director every month, and why?', 'Direktorga har oy qaysi hisobotlarni ko‘rsatasiz va nega?', 'Какие отчёты вы показывали бы директору каждый месяц и почему?'),
  ]),
  topic('role-teaching', pt('Teaching roles', 'O‘qituvchilik lavozimlari', 'Преподавание'), [
    q('How do you plan a lesson for a group with different levels?', 'Turli darajadagi guruh uchun darsni qanday rejalashtirasiz?', 'Как вы планируете урок для группы с разным уровнем?'),
    q('How do you know your students are making progress?', 'O‘quvchilaringiz oldinga borayotganini qanday bilasiz?', 'Как вы понимаете, что ученики прогрессируют?'),
    q('What do you do with a student who never does homework?', 'Hech qachon uy vazifasini bajarmaydigan o‘quvchi bilan nima qilasiz?', 'Что вы делаете с учеником, который никогда не делает домашнее задание?'),
    q('Tell me about a lesson that did not work and what you changed.', 'Kutilganidek o‘tmagan dars va nimani o‘zgartirganingiz haqida gapiring.', 'Расскажите об уроке, который не удался, и о том, что вы изменили.'),
  ]),
  topic('role-hospitality', pt('Hospitality roles', 'Mehmondo‘stlik sohasi lavozimlari', 'Гостиничный бизнес'), [
    q('A guest arrives and their booking is lost. What do you do?', 'Mehmon keldi, lekin uning bandi yo‘qolgan. Nima qilasiz?', 'Гость приехал, а его бронь потерялась. Что вы делаете?'),
    q('How do you handle two urgent requests at the same time?', 'Bir vaqtda kelgan ikkita shoshilinch so‘rovni qanday hal qilasiz?', 'Как вы справляетесь с двумя срочными просьбами одновременно?'),
    q('What does excellent service mean to you?', 'Siz uchun a’lo darajadagi xizmat nima degani?', 'Что для вас значит отличный сервис?'),
    q('How would you upsell a room upgrade without being pushy?', 'Xona darajasini oshirishni majburlamasdan qanday taklif qilasiz?', 'Как бы вы предложили повышение категории номера, не навязываясь?'),
  ]),
  topic('role-marketing', pt('Marketing roles', 'Marketing lavozimlari', 'Маркетинг'), [
    q('How would you launch a new product with a small budget?', 'Kichik byudjet bilan yangi mahsulotni qanday bozorga chiqarasiz?', 'Как бы вы запустили новый продукт с небольшим бюджетом?'),
    q('Which numbers do you watch to know if a campaign works?', 'Kampaniya ishlayotganini bilish uchun qaysi ko‘rsatkichlarni kuzatasiz?', 'На какие цифры вы смотрите, чтобы понять, работает ли кампания?'),
    q('Tell me about content you made that performed badly. What did you learn?', 'Yomon natija bergan kontentingiz haqida gapiring. Nimani o‘rgandingiz?', 'Расскажите о контенте, который сработал плохо. Чему вы научились?'),
    q('How do you understand what our customers want?', 'Mijozlarimiz nimani xohlashini qanday tushunasiz?', 'Как вы понимаете, чего хотят наши клиенты?'),
  ]),
  topic('role-service', pt('Customer service roles', 'Mijozlarga xizmat ko‘rsatish lavozimlari', 'Клиентский сервис'), [
    q('A customer calls for the third time about the same problem. What do you do?', 'Mijoz bir muammo bo‘yicha uchinchi marta qo‘ng‘iroq qilyapti. Nima qilasiz?', 'Клиент звонит в третий раз по одной и той же проблеме. Что вы делаете?'),
    q('How do you stay calm when someone is rude to you?', 'Kimdir qo‘pollik qilsa, qanday xotirjam qolasiz?', 'Как вы сохраняете спокойствие, когда с вами грубят?'),
    q('How do you explain a rule the customer does not like?', 'Mijozga yoqmaydigan qoidani qanday tushuntirasiz?', 'Как вы объясняете правило, которое не нравится клиенту?'),
    q('Tell me about a time you turned a complaint into loyalty.', 'Shikoyatni sadoqatga aylantirgan holatingiz haqida gapiring.', 'Расскажите, как вы превратили жалобу в лояльность.'),
  ]),
  topic('role-logistics', pt('Logistics roles', 'Logistika lavozimlari', 'Логистика'), [
    q('A truck breaks down with urgent deliveries on board. What do you do first?', 'Shoshilinch yuk ortilgan mashina buzildi. Birinchi navbatda nima qilasiz?', 'Грузовик со срочными заказами сломался. Что вы делаете в первую очередь?'),
    q('How do you plan routes for several vehicles in one day?', 'Bir kunda bir nechta mashina uchun yo‘nalishlarni qanday rejalashtirasiz?', 'Как вы планируете маршруты для нескольких машин на один день?'),
    q('How do you keep stock records accurate?', 'Ombor hisobini qanday aniq yuritasiz?', 'Как вы поддерживаете точность складского учёта?'),
    q('Tell me about a time you cut delivery costs or time.', 'Yetkazib berish xarajati yoki vaqtini qisqartirgan holat haqida gapiring.', 'Расскажите, как вы сократили стоимость или время доставки.'),
  ]),
];

export const interview: Activity[] = [
  {
    id: 'career.mock', kind: 'speaking_exam', rubric: 'career.interview', node: 'interviews', levels: [1.5, 5], minutes: 25, mock: true,
    title: L('Interview practice', 'Suhbat mashqi', 'Тренировка собеседования'),
    parts: [
      {
        id: 'pitch', kind: 'long_turn', answerSeconds: { min: 30, target: 75, max: 150 },
        title: L('Present yourself (one-minute pitch)', 'O‘zingizni tanishtirish (bir daqiqalik pitch)', 'Самопрезентация (питч на минуту)'),
        intro: T({ en: 'Imagine the interview has just started. You have one minute to prepare, then talk for about a minute and a half. Then I will ask a follow-up question.', uz: 'Suhbat endigina boshlandi deb tasavvur qiling. Tayyorlanishga bir daqiqa, keyin bir yarim daqiqa chamasi gapirasiz. So‘ng qo‘shimcha savol beraman.', ru: 'Представьте, что собеседование только началось. Минута на подготовку, затем говорите около полутора минут. Потом я задам уточняющий вопрос.' }),
        cards,
      },
      {
        id: 'hr', kind: 'questions', pickTopics: 2, askPerTopic: 2, answerSeconds: { min: 20, target: 60, max: 120 }, topics: hrTopics,
        title: L('HR questions', 'HR savollari', 'Вопросы HR'),
        intro: T({ en: 'Now some questions an HR manager usually asks. Answer the question first, then support it.', uz: 'Endi HR menejer odatda beradigan savollar. Avval savolga javob bering, keyin uni asoslang.', ru: 'Теперь вопросы, которые обычно задаёт HR-менеджер. Сначала ответьте на вопрос, потом подкрепите ответ.' }),
      },
      {
        id: 'star', kind: 'questions', pickTopics: 2, askPerTopic: 2, answerSeconds: { min: 40, target: 90, max: 180 }, topics: starTopics,
        title: L('Behavioural questions (STAR)', 'Xulq-atvor savollari (STAR)', 'Поведенческие вопросы (STAR)'),
        intro: T({ en: 'Next, questions about real situations. Use one example: the situation, your task, what you did, and the result.', uz: 'Keyin real vaziyatlar haqida savollar. Bitta misol keltiring: vaziyat, vazifangiz, nima qildingiz va natija.', ru: 'Далее вопросы о реальных ситуациях. Приведите один пример: ситуация, ваша задача, ваши действия и результат.' }),
      },
      {
        id: 'role', kind: 'questions', pickTopics: 1, askPerTopic: 3, answerSeconds: { min: 30, target: 75, max: 150 }, topics: roleTopics,
        title: L('Role-specific questions', 'Lavozimga oid savollar', 'Профильные вопросы'),
        intro: T({ en: 'Finally, questions for the kind of role you are applying for. Show how you would actually do the work.', uz: 'Nihoyat, siz da’vogar bo‘lgan lavozim turi bo‘yicha savollar. Ishni amalda qanday bajarishingizni ko‘rsating.', ru: 'Наконец, вопросы по типу роли, на которую вы претендуете. Покажите, как вы будете делать эту работу на практике.' }),
      },
    ],
  },
];
