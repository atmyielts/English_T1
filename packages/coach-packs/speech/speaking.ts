import { T } from '../src/localize.ts';
import type { Activity, CueCard, SpeakingPart } from '../src/types.ts';

// The speaking practice: an elevator pitch, impromptu topics, a story, and a
// presentation rehearsal (a cue card with preparation and talk timers) followed by the
// audience's questions. Each part can be practised alone (every answer scored with
// quotes, the measured pace, pauses and fillers, and "say it better" lines, then
// re-recorded), and the whole showcase runs once a week as a mock with one review.
// Topics are original Schood material for teenagers and adults in Uzbekistan.

type Tri = [en: string, uz: string, ru: string];
const P = ([en, uz, ru]: Tri) => T({ en, uz, ru });
const topic = (id: string, title: Tri, questions: Tri[]) => ({ id, title: P(title), questions: questions.map(P) });
const card = (id: string, title: Tri, points: Tri[], roundOff: Tri[], discussion: Tri[]): CueCard => ({
  id, topic: P(title), points: points.map(P), prepSeconds: 90, talkSeconds: 180, minTalkSeconds: 90, roundOff: roundOff.map(P), discussion: discussion.map(P),
});

const pitch: SpeakingPart = {
  id: 'pitch',
  title: { en: 'Elevator pitch', uz: 'Elevator pitch', ru: 'Elevator pitch' },
  kind: 'questions',
  intro: P([
    'Elevator pitch: you have about one minute. Say who you are, what you offer, why it matters to this listener, and end with one clear request.',
    'Elevator pitch: sizda taxminan bir daqiqa bor. Kim ekaningizni, nima taklif qilishingizni, bu tinglovchi uchun nega muhimligini ayting va bitta aniq iltimos bilan yakunlang.',
    'Elevator pitch: у вас около минуты. Скажите, кто вы, что предлагаете, почему это важно слушателю, и закончите одной ясной просьбой.',
  ]),
  pickTopics: 1,
  askPerTopic: 2,
  answerSeconds: { min: 20, target: 50, max: 90 },
  topics: [
    topic('pitch.job-fair', ['Job fair', 'Ish yarmarkasi', 'Ярмарка вакансий'], [
      ['You meet a recruiter from a bank at a job fair. Introduce yourself in thirty seconds.', 'Ish yarmarkasida bank vakili bilan uchrashdingiz. O‘zingizni o‘ttiz soniyada tanishtiring.', 'На ярмарке вакансий вы встретили рекрутера банка. Представьтесь за тридцать секунд.'],
      ['The recruiter says: “Tell me more.” Give the one-minute version with one example of something you did well.', 'Rekruter: «Batafsilroq gapiring», dedi. Bir daqiqalik variantni ayting va yaxshi qilgan bitta ishingizni misol qilib keltiring.', 'Рекрутер говорит: «Расскажите подробнее». Дайте версию на минуту с одним примером того, что вы сделали хорошо.'],
    ]),
    topic('pitch.new-team', ['A new team', 'Yangi jamoa', 'Новая команда'], [
      ['It is your first day in a new team. Introduce yourself at the morning meeting.', 'Yangi jamoadagi birinchi kuningiz. Ertalabki yig‘ilishda o‘zingizni tanishtiring.', 'Первый день в новой команде. Представьтесь на утренней планёрке.'],
      ['Your manager asks: “In one minute, what will you bring to this team?” Answer with a specific promise.', 'Rahbaringiz so‘radi: «Bir daqiqada ayting: jamoaga nima olib kelasiz?» Aniq va’da bilan javob bering.', 'Руководитель спрашивает: «За минуту: что вы принесёте команде?» Ответьте конкретным обещанием.'],
    ]),
    topic('pitch.startup', ['A business idea', 'Biznes g‘oya', 'Бизнес-идея'], [
      ['Pitch a business idea to a jury of local entrepreneurs in one minute.', 'Mahalliy tadbirkorlardan iborat hakamlar hay’atiga biznes g‘oyangizni bir daqiqada taqdim eting.', 'Представьте бизнес-идею жюри из местных предпринимателей за одну минуту.'],
      ['The jury asks: “Why you, and why now?” Answer in under a minute.', 'Hakamlar so‘radi: «Nega aynan siz va nega aynan hozir?» Bir daqiqadan qisqa javob bering.', 'Жюри спрашивает: «Почему вы и почему сейчас?» Ответьте меньше чем за минуту.'],
    ]),
    topic('pitch.university', ['University admission', 'Universitetga qabul', 'Поступление в университет'], [
      ['An admissions officer asks: “Why should we choose you?” Answer in one minute.', 'Qabul komissiyasi a’zosi so‘radi: «Nega sizni tanlashimiz kerak?» Bir daqiqada javob bering.', 'Сотрудник приёмной комиссии спрашивает: «Почему мы должны выбрать вас?» Ответьте за минуту.'],
      ['Now say in thirty seconds which course you want and what you will do with it after you graduate.', 'Endi o‘ttiz soniyada qaysi yo‘nalishni xohlashingizni va bitirgach u bilan nima qilishingizni ayting.', 'Теперь за тридцать секунд скажите, какое направление хотите и что будете делать после выпуска.'],
    ]),
    topic('pitch.club', ['A new club', 'Yangi to‘garak', 'Новый клуб'], [
      ['Pitch a new club at your school or university to students in the corridor in thirty seconds.', 'Maktabingiz yoki universitetingizdagi yangi to‘garakni yo‘lakda talabalarga o‘ttiz soniyada taqdim eting.', 'За тридцать секунд в коридоре расскажите студентам о новом клубе в вашей школе или вузе.'],
      ['A teacher must approve the club. Pitch it to her in one minute and end with a clear request.', 'To‘garakni o‘qituvchi tasdiqlashi kerak. Unga bir daqiqada taqdim eting va aniq iltimos bilan yakunlang.', 'Клуб должен одобрить преподаватель. Представьте ей его за минуту и закончите ясной просьбой.'],
    ]),
    topic('pitch.volunteer', ['A volunteer project', 'Ko‘ngillilar loyihasi', 'Волонтёрский проект'], [
      ['At a mahalla gathering, ask neighbours to join a weekend volunteer project.', 'Mahalla yig‘inida qo‘shnilarni dam olish kunidagi ko‘ngillilar loyihasiga qo‘shilishga chaqiring.', 'На собрании махалли пригласите соседей присоединиться к волонтёрскому проекту в выходные.'],
      ['Pitch the same project to a local business owner and ask for a small sponsorship.', 'Xuddi shu loyihani mahalliy tadbirkorga taqdim eting va kichik homiylik so‘rang.', 'Представьте тот же проект местному предпринимателю и попросите небольшую поддержку.'],
    ]),
    topic('pitch.product', ['A product you know', 'Siz biladigan mahsulot', 'Знакомый вам товар'], [
      ['In a shop or at the market, pitch one product you know well to a customer in forty-five seconds.', 'Do‘kon yoki bozorda yaxshi biladigan bitta mahsulotni xaridorga qirq besh soniyada taqdim eting.', 'В магазине или на рынке за сорок пять секунд расскажите покупателю об одном хорошо знакомом вам товаре.'],
      ['Now pitch the same product to a shop owner who might sell it.', 'Endi xuddi shu mahsulotni uni sotishi mumkin bo‘lgan do‘kon egasiga taqdim eting.', 'Теперь представьте тот же товар владельцу магазина, который мог бы его продавать.'],
    ]),
    topic('pitch.freelance', ['Your own service', 'O‘z xizmatingiz', 'Ваша услуга'], [
      ['Introduce your service (design, tutoring, translation, video or another skill) to a possible client in a voice message.', 'Xizmatingizni (dizayn, repetitorlik, tarjima, video yoki boshqa ko‘nikma) ehtimoliy mijozga ovozli xabarda tanishtiring.', 'Представьте вашу услугу (дизайн, репетиторство, перевод, видео или другое) возможному клиенту в голосовом сообщении.'],
      ['The client replies: “I already have someone.” Give a thirty-second reason to try you once.', 'Mijoz javob berdi: «Menda allaqachon odam bor». Sizni bir marta sinab ko‘rish uchun o‘ttiz soniyalik sabab keltiring.', 'Клиент отвечает: «У меня уже есть исполнитель». За тридцать секунд дайте причину попробовать вас один раз.'],
    ]),
  ],
};

const impromptu: SpeakingPart = {
  id: 'impromptu',
  title: { en: 'Impromptu topic', uz: 'Tayyorgarliksiz nutq', ru: 'Импровизация' },
  kind: 'questions',
  intro: P([
    'Impromptu speaking: you will hear a topic and answer straight away, for about a minute. Take your position, give a reason and one example, and finish with a clear sentence.',
    'Tayyorgarliksiz nutq: mavzuni eshitasiz va darhol, taxminan bir daqiqa javob berasiz. Pozitsiyangizni ayting, sabab va bitta misol keltiring, aniq gap bilan yakunlang.',
    'Импровизация: вы услышите тему и сразу ответите, примерно минуту. Займите позицию, дайте причину и один пример и закончите ясной фразой.',
  ]),
  pickTopics: 1,
  askPerTopic: 2,
  answerSeconds: { min: 30, target: 75, max: 120 },
  topics: [
    topic('imp.study-abroad', ['Studying abroad', 'Chet elda o‘qish', 'Учёба за рубежом'], [
      ['Is it better to study abroad or in Uzbekistan?', 'Chet elda o‘qigan yaxshimi yoki O‘zbekistonda?', 'Где лучше учиться: за рубежом или в Узбекистане?'],
      ['What one piece of advice would you give to someone who is deciding?', 'Qaror qabul qilayotgan odamga qanday bitta maslahat bergan bo‘lardingiz?', 'Какой один совет вы бы дали тому, кто сейчас выбирает?'],
    ]),
    topic('imp.uniforms', ['School uniforms', 'Maktab formasi', 'Школьная форма'], [
      ['Should school uniforms be required?', 'Maktab formasi majburiy bo‘lishi kerakmi?', 'Должна ли школьная форма быть обязательной?'],
      ['Now argue the opposite side for one minute, as well as you can.', 'Endi bir daqiqa davomida qarama-qarshi tomonni iloji boricha yaxshi himoya qiling.', 'Теперь минуту как можно убедительнее защищайте противоположную сторону.'],
    ]),
    topic('imp.online', ['Online lessons', 'Onlayn darslar', 'Онлайн-уроки'], [
      ['Are online lessons as good as classroom lessons?', 'Onlayn darslar sinfdagi darslar kabi yaxshimi?', 'Онлайн-уроки так же хороши, как уроки в классе?'],
      ['Describe the best lesson you ever had and say why it worked.', 'Hayotingizdagi eng yaxshi darsni tasvirlab bering va u nega yaxshi o‘tganini ayting.', 'Опишите лучший урок в вашей жизни и скажите, почему он сработал.'],
    ]),
    topic('imp.skill-18', ['A skill before eighteen', 'O‘n sakkizgacha bir ko‘nikma', 'Навык до восемнадцати'], [
      ['What skill should every young person learn before the age of eighteen?', 'Har bir yosh o‘n sakkiz yoshgacha qanday ko‘nikmani o‘rganishi kerak?', 'Какой навык должен освоить каждый молодой человек до восемнадцати лет?'],
      ['How would you teach that skill to a younger cousin in one week?', 'Bu ko‘nikmani kichik ukangiz yoki singlingizga bir haftada qanday o‘rgatgan bo‘lardingiz?', 'Как бы вы научили этому навыку младшего брата или сестру за одну неделю?'],
    ]),
    topic('imp.part-time', ['A job while studying', 'O‘qish bilan birga ish', 'Работа во время учёбы'], [
      ['Is it a good idea to have a part-time job while you study?', 'O‘qish bilan birga yarim kunlik ishlash yaxshi fikrmi?', 'Хорошая ли идея — подрабатывать во время учёбы?'],
      ['What did you or a friend learn from a first job?', 'Siz yoki do‘stingiz birinchi ishdan nimani o‘rgangansiz?', 'Чему вы или ваш друг научились на первой работе?'],
    ]),
    topic('imp.phones', ['Phones in class', 'Darsda telefon', 'Телефоны на уроках'], [
      ['Should phones be banned in class?', 'Darsda telefon taqiqlanishi kerakmi?', 'Нужно ли запретить телефоны на уроках?'],
      ['Propose one rule about phones that both students and teachers would accept.', 'Telefon haqida o‘quvchilar ham, o‘qituvchilar ham qabul qiladigan bitta qoidani taklif qiling.', 'Предложите одно правило о телефонах, которое примут и ученики, и учителя.'],
    ]),
    topic('imp.talent', ['Talent or hard work', 'Iste’dod yoki mehnat', 'Талант или труд'], [
      ['Which matters more for success: talent or hard work?', 'Muvaffaqiyat uchun nima muhimroq: iste’dodmi yoki mehnat?', 'Что важнее для успеха: талант или труд?'],
      ['Give one example from sport, music or your own life that proves your point.', 'Fikringizni isbotlaydigan bitta misolni sport, musiqa yoki o‘z hayotingizdan keltiring.', 'Приведите один пример из спорта, музыки или своей жизни, который доказывает вашу мысль.'],
    ]),
    topic('imp.cycling', ['Cycling lanes', 'Velosiped yo‘laklari', 'Велодорожки'], [
      ['Should our cities have more cycling lanes?', 'Shaharlarimizda velosiped yo‘laklari ko‘proq bo‘lishi kerakmi?', 'Нужно ли больше велодорожек в наших городах?'],
      ['You meet the city khokim in a lift. Convince him in one minute.', 'Liftda shahar hokimi bilan uchrashib qoldingiz. Uni bir daqiqada ishontiring.', 'Вы встретили хокима города в лифте. Убедите его за минуту.'],
    ]),
    topic('imp.social-media', ['Social media', 'Ijtimoiy tarmoqlar', 'Соцсети'], [
      ['Is social media making people happier or lonelier?', 'Ijtimoiy tarmoqlar odamlarni baxtliroq qilyaptimi yoki yolg‘izroq?', 'Соцсети делают людей счастливее или одинокее?'],
      ['Give one practical tip for using social media in a healthier way.', 'Ijtimoiy tarmoqlardan sog‘lomroq foydalanish uchun bitta amaliy maslahat bering.', 'Дайте один практический совет, как пользоваться соцсетями здоровее.'],
    ]),
    topic('imp.director-day', ['Director for a day', 'Bir kunlik direktor', 'Директор на один день'], [
      ['If you were the director of your school or company for one day, what would you change first?', 'Bir kunga maktabingiz yoki kompaniyangiz direktori bo‘lsangiz, birinchi navbatda nimani o‘zgartirardingiz?', 'Если бы вы на один день стали директором своей школы или компании, что бы изменили первым?'],
      ['How would you know that your change had worked?', 'O‘zgarishingiz natija berganini qanday bilgan bo‘lardingiz?', 'Как бы вы поняли, что ваше изменение сработало?'],
    ]),
    topic('imp.third-language', ['A third language', 'Uchinchi til', 'Третий язык'], [
      ['Is learning a third language worth the time?', 'Uchinchi tilni o‘rganish vaqtga arziydimi?', 'Стоит ли тратить время на третий язык?'],
      ['Tell us which language you would choose and why, as if you were speaking to a younger cousin.', 'Qaysi tilni tanlashingiz va nega ekanini, xuddi ukangiz yoki singlingizga gapirayotgandek ayting.', 'Скажите, какой язык вы бы выбрали и почему, как будто говорите с младшим братом или сестрой.'],
    ]),
    topic('imp.helping-jobs', ['Pay for helping jobs', 'Yordam beruvchi kasblar maoshi', 'Оплата помогающих профессий'], [
      ['Should people in jobs that help others, such as nurses and teachers, be paid more?', 'Hamshira va o‘qituvchi kabi boshqalarga yordam beradigan kasb egalariga ko‘proq haq to‘lanishi kerakmi?', 'Нужно ли платить больше тем, кто помогает людям, например медсёстрам и учителям?'],
      ['Answer the strongest argument against your view.', 'Fikringizga qarshi eng kuchli dalilga javob bering.', 'Ответьте на самый сильный аргумент против вашей позиции.'],
    ]),
  ],
};

const story: SpeakingPart = {
  id: 'story',
  title: { en: 'Story', uz: 'Hikoya', ru: 'История' },
  kind: 'questions',
  intro: P([
    'Storytelling: tell a true story from your life in one to two minutes. Set the scene, bring us to the moment things changed, and end with what it means.',
    'Hikoya: hayotingizdan haqiqiy voqeani bir-ikki daqiqada so‘zlab bering. Manzarani chizing, voqea o‘zgargan lahzaga olib keling va uning ma’nosi bilan yakunlang.',
    'Сторителлинг: расскажите правдивую историю из своей жизни за одну-две минуты. Опишите обстановку, подведите к моменту перелома и закончите тем, что это значит.',
  ]),
  pickTopics: 1,
  askPerTopic: 2,
  answerSeconds: { min: 45, target: 100, max: 150 },
  topics: [
    topic('story.nervous', ['Nervous but brave', 'Hayajonli, lekin jasur', 'Страшно, но смело'], [
      ['Tell us about a time you were nervous and did it anyway.', 'Hayajonlangan bo‘lsangiz ham, baribir uddalagan paytingiz haqida gapirib bering.', 'Расскажите о случае, когда вам было страшно, но вы всё равно сделали это.'],
      ['What would you tell yourself just before that moment, if you could go back?', 'O‘sha lahzadan oldin o‘zingizga qaytib borib nima degan bo‘lardingiz?', 'Если бы вы могли вернуться, что сказали бы себе прямо перед тем моментом?'],
    ]),
    topic('story.person', ['A person who changed you', 'Sizni o‘zgartirgan inson', 'Человек, который изменил вас'], [
      ['Tell the story of a person who changed how you think.', 'Fikrlashingizni o‘zgartirgan inson haqidagi voqeani so‘zlab bering.', 'Расскажите историю о человеке, который изменил ваш образ мыслей.'],
      ['Now tell the same story in thirty seconds, keeping only the key moment.', 'Endi xuddi shu voqeani o‘ttiz soniyada, faqat asosiy lahzani qoldirib aytib bering.', 'Теперь расскажите ту же историю за тридцать секунд, оставив только главный момент.'],
    ]),
    topic('story.mistake', ['A useful mistake', 'Foydali xato', 'Полезная ошибка'], [
      ['Tell us about a mistake that taught you something.', 'Sizga nimadir o‘rgatgan xato haqida gapirib bering.', 'Расскажите об ошибке, которая вас чему-то научила.'],
      ['How did that lesson help you later? Give one moment when it did.', 'O‘sha saboq keyinroq sizga qanday yordam berdi? Shunday bir lahzani ayting.', 'Как этот урок помог вам позже? Назовите один такой момент.'],
    ]),
    topic('story.off-plan', ['A day off plan', 'Rejadan chiqqan kun', 'День не по плану'], [
      ['Tell us about a day when something did not go to plan.', 'Nimadir rejadagidek bo‘lmagan bir kun haqida gapirib bering.', 'Расскажите о дне, когда что-то пошло не по плану.'],
      ['Tell it again, but start with the ending and then explain how it happened.', 'Uni qaytadan, lekin yakunidan boshlab, keyin qanday bo‘lganini tushuntirib aytib bering.', 'Расскажите ещё раз, но начните с конца, а потом объясните, как всё произошло.'],
    ]),
    topic('story.gift', ['A gift', 'Sovg‘a', 'Подарок'], [
      ['Tell us about the best gift you ever gave or received.', 'Bergan yoki olgan eng yaxshi sovg‘angiz haqida gapirib bering.', 'Расскажите о лучшем подарке, который вы подарили или получили.'],
      ['What does that gift say about the person who gave it?', 'Bu sovg‘a uni bergan inson haqida nima deydi?', 'Что этот подарок говорит о человеке, который его подарил?'],
    ]),
    topic('story.proud', ['Proud of someone', 'Kimdandir faxrlanish', 'Гордость за другого'], [
      ['Tell us about a moment you were proud of someone else.', 'Boshqa birovdan faxrlangan lahzangiz haqida gapirib bering.', 'Расскажите о моменте, когда вы гордились кем-то другим.'],
      ['Tell the story again so the audience feels what you felt.', 'Voqeani qaytadan shunday aytingki, tinglovchilar siz his qilgan narsani his qilsin.', 'Расскажите историю ещё раз так, чтобы слушатели почувствовали то же, что и вы.'],
    ]),
    topic('story.stranger', ['A kind stranger', 'Mehribon notanish', 'Добрый незнакомец'], [
      ['Tell us about a small kindness from a stranger.', 'Notanish odamning kichik yaxshiligi haqida gapirib bering.', 'Расскажите о маленькой доброте незнакомого человека.'],
      ['Finish the story with one sentence the audience will remember.', 'Hikoyani tinglovchilar eslab qoladigan bitta gap bilan yakunlang.', 'Закончите историю одной фразой, которую слушатели запомнят.'],
    ]),
    topic('story.first-day', ['A first day', 'Birinchi kun', 'Первый день'], [
      ['Tell us about your first day somewhere new: a school, a city or a job.', 'Yangi joydagi birinchi kuningiz haqida gapirib bering: maktab, shahar yoki ish.', 'Расскажите о первом дне на новом месте: в школе, городе или на работе.'],
      ['What do you know now that you wish you had known on that day?', 'O‘sha kuni bilishni istagan, lekin hozir biladigan narsangiz nima?', 'Что вы знаете сейчас и хотели бы знать в тот день?'],
    ]),
  ],
};

const rehearsal: SpeakingPart = {
  id: 'rehearsal',
  title: { en: 'Presentation rehearsal', uz: 'Taqdimot repetitsiyasi', ru: 'Репетиция выступления' },
  kind: 'long_turn',
  intro: P([
    'Presentation rehearsal: here is your topic. You have ninety seconds to plan a hook, two or three points and a close, then speak for up to three minutes. The audience will ask questions afterwards.',
    'Taqdimot repetitsiyasi: mana mavzuingiz. Kirish, ikki-uchta fikr va yakunni rejalashtirish uchun to‘qson soniya, keyin uch daqiqagacha gapirasiz. So‘ng auditoriya savol beradi.',
    'Репетиция выступления: вот ваша тема. Девяносто секунд, чтобы продумать зацепку, два-три тезиса и финал, затем до трёх минут речи. Потом зал задаст вопросы.',
  ]),
  answerSeconds: { min: 60, target: 150, max: 180 },
  cards: [
    card('card.greener', ['Present a plan to make your school or workplace greener.', 'Maktabingiz yoki ish joyingizni yashilroq qilish rejasini taqdim eting.', 'Представьте план, как сделать вашу школу или работу экологичнее.'], [
      ['the problem, with one fact you know is true', 'muammo va siz aniq biladigan bitta fakt', 'проблема и один факт, в котором вы уверены'],
      ['your plan in three steps', 'uch qadamdan iborat rejangiz', 'ваш план в трёх шагах'],
      ['who will help and what it needs', 'kim yordam beradi va nima kerak', 'кто поможет и что для этого нужно'],
      ['what you ask the audience to do this week', 'auditoriyadan shu hafta nima qilishni so‘raysiz', 'что вы просите слушателей сделать на этой неделе'],
    ], [
      ['Which step would you start with tomorrow?', 'Ertaga qaysi qadamdan boshlagan bo‘lardingiz?', 'С какого шага вы бы начали завтра?'],
      ['Who could you ask for help first?', 'Birinchi navbatda kimdan yordam so‘ragan bo‘lardingiz?', 'К кому бы вы первым обратились за помощью?'],
    ], [
      ['Who is going to pay for this?', 'Buning uchun kim pul to‘laydi?', 'Кто за это заплатит?'],
      ['What if people do not follow the new rules?', 'Odamlar yangi qoidalarga amal qilmasa-chi?', 'А если люди не будут соблюдать новые правила?'],
      ['Why should this be a priority over other problems?', 'Nega bu boshqa muammolardan muhimroq bo‘lishi kerak?', 'Почему это важнее других проблем?'],
      ['How will we know in three months that it worked?', 'Uch oydan keyin natija berganini qanday bilamiz?', 'Как через три месяца мы поймём, что это сработало?'],
    ]),
    card('card.club', ['Present a new club or service for students.', 'O‘quvchilar uchun yangi to‘garak yoki xizmatni taqdim eting.', 'Представьте новый клуб или сервис для учащихся.'], [
      ['what the club is and who it is for', 'to‘garak nima va kim uchun', 'что это за клуб и для кого'],
      ['why students need it now', 'nega o‘quvchilarga u hozir kerak', 'почему он нужен учащимся сейчас'],
      ['how a first meeting would look', 'birinchi mashg‘ulot qanday o‘tadi', 'как пройдёт первая встреча'],
      ['how people can join', 'qanday qo‘shilish mumkin', 'как присоединиться'],
    ], [
      ['How many members do you need to start?', 'Boshlash uchun nechta a’zo kerak?', 'Сколько участников нужно для старта?'],
      ['Who would lead the first meeting?', 'Birinchi mashg‘ulotni kim olib boradi?', 'Кто проведёт первую встречу?'],
    ], [
      ['Will this take time away from our studies?', 'Bu o‘qishimizdan vaqt olmaydimi?', 'Не отнимет ли это время от учёбы?'],
      ['What happens if only three people come?', 'Faqat uch kishi kelsa nima bo‘ladi?', 'А если придут только три человека?'],
      ['Why not join an existing club instead?', 'Nega mavjud to‘garakka qo‘shilmaslik kerak?', 'Почему бы не вступить в уже существующий клуб?'],
      ['Who is responsible if something goes wrong?', 'Biror narsa noto‘g‘ri ketsa, kim javob beradi?', 'Кто отвечает, если что-то пойдёт не так?'],
    ]),
    card('card.book', ['Present a book or film everyone your age should know.', 'Tengdoshlaringiz bilishi kerak bo‘lgan kitob yoki filmni taqdim eting.', 'Представьте книгу или фильм, которые должен знать каждый ваш ровесник.'], [
      ['what it is about, without spoiling the end', 'u nima haqida (yakunini aytmasdan)', 'о чём это (не раскрывая концовки)'],
      ['the moment that stayed with you', 'yodingizda qolgan lahza', 'момент, который вам запомнился'],
      ['what it teaches people of your age', 'u tengdoshlaringizga nimani o‘rgatadi', 'чему это учит ваших ровесников'],
      ['why they should read or watch it this month', 'nega uni aynan shu oy o‘qish yoki ko‘rish kerak', 'почему стоит прочитать или посмотреть это в этом месяце'],
    ], [
      ['Who would you not recommend it to?', 'Uni kimga tavsiya qilmagan bo‘lardingiz?', 'Кому бы вы это не посоветовали?'],
      ['Have you read or watched it more than once?', 'Uni bir martadan ko‘p o‘qiganmisiz yoki ko‘rganmisiz?', 'Вы читали или смотрели это больше одного раза?'],
    ], [
      ['Is it not too old to matter to young people today?', 'U bugungi yoshlar uchun eskirib qolmaganmi?', 'Не слишком ли это устарело для сегодняшней молодёжи?'],
      ['Why this one and not something more popular?', 'Nega aynan shu, nega mashhurrog‘i emas?', 'Почему именно это, а не что-то популярнее?'],
      ['What did you disagree with in it?', 'Undagi nima bilan rozi emassiz?', 'С чем вы в нём не согласны?'],
      ['How would you get a friend who never reads to try it?', 'Hech kitob o‘qimaydigan do‘stingizni qanday qilib bunga ko‘ndirasiz?', 'Как бы вы уговорили друга, который совсем не читает?'],
    ]),
    card('card.project', ['Present a project you worked on and what you learned.', 'Ustida ishlagan loyihangizni va undan nima o‘rganganingizni taqdim eting.', 'Представьте проект, над которым вы работали, и чему вы научились.'], [
      ['the goal of the project', 'loyihaning maqsadi', 'цель проекта'],
      ['your part in it', 'undagi sizning hissangiz', 'ваша роль в нём'],
      ['one problem and how you solved it', 'bitta muammo va uni qanday hal qilganingiz', 'одна проблема и как вы её решили'],
      ['what you would do differently next time', 'keyingi safar nimani boshqacha qilardingiz', 'что бы вы сделали иначе в следующий раз'],
    ], [
      ['Who else worked on it with you?', 'Siz bilan yana kim ishladi?', 'Кто ещё работал с вами?'],
      ['Is the project still running?', 'Loyiha hali davom etyaptimi?', 'Проект всё ещё продолжается?'],
    ], [
      ['How do you know the project was a success?', 'Loyiha muvaffaqiyatli bo‘lganini qayerdan bilasiz?', 'Откуда вы знаете, что проект удался?'],
      ['What would have happened without you?', 'Siz bo‘lmaganingizda nima bo‘lardi?', 'Что было бы без вас?'],
      ['What was the hardest decision you made?', 'Qabul qilgan eng qiyin qaroringiz qaysi edi?', 'Какое решение было самым трудным?'],
      ['Could someone else repeat it with what you learned?', 'Siz o‘rgangan narsalar bilan boshqa birov uni takrorlay oladimi?', 'Сможет ли кто-то повторить его с вашим опытом?'],
    ]),
    card('card.city', ['Present a problem in your city and your solution to a youth council.', 'Shahringizdagi muammo va uning yechimini yoshlar kengashiga taqdim eting.', 'Представьте проблему вашего города и её решение молодёжному совету.'], [
      ['the problem as people live it every day', 'odamlar har kuni his qiladigan muammo', 'проблема такой, какой её видят люди каждый день'],
      ['your solution in one sentence', 'bitta gapda yechimingiz', 'ваше решение одной фразой'],
      ['a small first step to test it', 'uni sinab ko‘rish uchun kichik birinchi qadam', 'маленький первый шаг, чтобы его проверить'],
      ['what you ask the council to decide', 'kengashdan nimani hal qilishni so‘raysiz', 'что вы просите совет решить'],
    ], [
      ['How long have you noticed this problem?', 'Bu muammoni qancha vaqtdan beri sezib kelyapsiz?', 'Как давно вы замечаете эту проблему?'],
      ['Who suffers from it most?', 'Undan kim eng ko‘p aziyat chekadi?', 'Кто страдает от неё больше всех?'],
    ], [
      ['Has anyone tried this before, and why did it fail?', 'Buni avval kimdir sinab ko‘rganmi va nega muvaffaqiyatsiz bo‘lgan?', 'Пробовал ли кто-то это раньше и почему не получилось?'],
      ['Will this not just move the problem to the next street?', 'Bu muammoni shunchaki qo‘shni ko‘chaga ko‘chirib qo‘ymaydimi?', 'Не перенесёт ли это проблему на соседнюю улицу?'],
      ['How will you get people to support it?', 'Odamlarni buni qo‘llab-quvvatlashga qanday ko‘ndirasiz?', 'Как вы добьётесь поддержки людей?'],
      ['What is the cost of doing nothing?', 'Hech narsa qilmaslik nimaga tushadi?', 'Чего будет стоить бездействие?'],
    ]),
    card('card.business', ['Present a small business idea to people who could invest.', 'Kichik biznes g‘oyani sarmoya kiritishi mumkin bo‘lgan odamlarga taqdim eting.', 'Представьте идею небольшого бизнеса потенциальным инвесторам.'], [
      ['the customer and their problem', 'mijoz va uning muammosi', 'клиент и его проблема'],
      ['what you sell and why it is better', 'nima sotasiz va nega u yaxshiroq', 'что вы продаёте и почему это лучше'],
      ['what you have already tested', 'nimani allaqachon sinab ko‘rgansiz', 'что вы уже проверили'],
      ['what you need and what you will do with it', 'sizga nima kerak va u bilan nima qilasiz', 'что вам нужно и что вы с этим сделаете'],
    ], [
      ['When could you start?', 'Qachon boshlay olasiz?', 'Когда вы сможете начать?'],
      ['Who is on your team?', 'Jamoangizda kim bor?', 'Кто в вашей команде?'],
    ], [
      ['Why will customers pay for this and not do it themselves?', 'Nega mijozlar buni o‘zlari qilmay, pul to‘laydi?', 'Почему клиенты заплатят, а не сделают это сами?'],
      ['What if a bigger company copies you?', 'Kattaroq kompaniya sizdan nusxa olsa-chi?', 'А если вас скопирует крупная компания?'],
      ['How do you know there are enough customers?', 'Mijozlar yetarli ekanini qayerdan bilasiz?', 'Откуда вы знаете, что клиентов достаточно?'],
      ['What is the biggest risk, and what is your plan for it?', 'Eng katta xavf nima va unga qarshi rejangiz qanday?', 'Какой главный риск и что вы с ним сделаете?'],
    ]),
    card('card.survey', ['Present the results of a small survey you ran. Use example numbers and say they are examples.', 'O‘tkazgan kichik so‘rovnomangiz natijalarini taqdim eting. Misol uchun raqamlardan foydalaning va ular misol ekanini ayting.', 'Представьте результаты небольшого опроса, который вы провели. Используйте примерные цифры и скажите, что это примеры.'], [
      ['what you wanted to find out', 'nimani bilmoqchi bo‘lgansiz', 'что вы хотели узнать'],
      ['who you asked and how', 'kimdan va qanday so‘ragansiz', 'кого и как вы спрашивали'],
      ['the one result that surprised you', 'sizni hayratlantirgan bitta natija', 'один результат, который вас удивил'],
      ['what you recommend because of it', 'shu sababli nimani tavsiya qilasiz', 'что вы рекомендуете на основе этого'],
    ], [
      ['Would you run the survey again?', 'So‘rovnomani yana o‘tkazgan bo‘lardingizmi?', 'Провели бы вы опрос ещё раз?'],
      ['What question would you add?', 'Qaysi savolni qo‘shgan bo‘lardingiz?', 'Какой вопрос вы бы добавили?'],
    ], [
      ['Is your group big enough to trust the result?', 'Natijaga ishonish uchun guruhingiz yetarlicha kattami?', 'Достаточно ли велика группа, чтобы доверять результату?'],
      ['Could people have given the answers they thought you wanted?', 'Odamlar siz kutgan javoblarni bergan bo‘lishi mumkinmi?', 'Не могли ли люди отвечать так, как, по их мнению, вы хотели?'],
      ['What would change your recommendation?', 'Tavsiyangizni nima o‘zgartirishi mumkin?', 'Что могло бы изменить вашу рекомендацию?'],
      ['What should we do first with these results?', 'Bu natijalar bilan birinchi navbatda nima qilishimiz kerak?', 'Что нам первым делом сделать с этими результатами?'],
    ]),
    card('card.resources', ['Present why your team should get more time or money for a project.', 'Jamoangizga loyiha uchun ko‘proq vaqt yoki mablag‘ berilishi kerakligini asoslab bering.', 'Обоснуйте, почему вашей команде нужно больше времени или денег на проект.'], [
      ['what the project has achieved so far', 'loyiha hozirgacha nimaga erishgan', 'чего проект уже достиг'],
      ['what is blocking it now', 'hozir unga nima to‘sqinlik qilyapti', 'что мешает ему сейчас'],
      ['exactly what you ask for', 'aynan nima so‘rayapsiz', 'что именно вы просите'],
      ['what you will deliver and when', 'nimani va qachon taqdim etasiz', 'что и когда вы сдадите'],
    ], [
      ['Who on the team agrees with this request?', 'Jamoada kim bu iltimosga qo‘shiladi?', 'Кто в команде поддерживает эту просьбу?'],
      ['What did you try before asking?', 'So‘rashdan oldin nimani sinab ko‘rdingiz?', 'Что вы попробовали до того, как просить?'],
    ], [
      ['Why did you not plan for this at the start?', 'Nega buni boshidanoq rejalashtirmadingiz?', 'Почему вы не заложили это с самого начала?'],
      ['What will you cut if we say no?', 'Agar yo‘q desak, nimani qisqartirasiz?', 'Что вы урежете, если мы откажем?'],
      ['How do we know you will not ask again next month?', 'Keyingi oy yana so‘ramasligingizni qayerdan bilamiz?', 'Откуда нам знать, что вы не попросите снова через месяц?'],
      ['Which other team loses if we give this to you?', 'Buni sizga bersak, qaysi jamoa yutqazadi?', 'Какая команда проиграет, если мы отдадим это вам?'],
    ]),
    card('card.place', ['Present a place in Uzbekistan you love to visitors from another country.', 'Siz yaxshi ko‘radigan O‘zbekistondagi bir joyni chet ellik mehmonlarga taqdim eting.', 'Представьте любимое место в Узбекистане гостям из другой страны.'], [
      ['what you see and hear when you arrive', 'kelganingizda nimani ko‘rasiz va eshitasiz', 'что вы видите и слышите, когда приезжаете'],
      ['one story connected to the place', 'bu joy bilan bog‘liq bitta hikoya', 'одна история, связанная с этим местом'],
      ['what visitors should not miss', 'mehmonlar nimani o‘tkazib yubormasligi kerak', 'что гости не должны пропустить'],
      ['the best time and way to go', 'borish uchun eng yaxshi vaqt va yo‘l', 'когда и как лучше туда поехать'],
    ], [
      ['When did you first go there?', 'U yerga birinchi marta qachon borgansiz?', 'Когда вы впервые там побывали?'],
      ['Who would you take with you?', 'U yerga kimni olib borgan bo‘lardingiz?', 'Кого бы вы взяли с собой?'],
    ], [
      ['Is it not too crowded with tourists?', 'U yerda sayyohlar juda ko‘p emasmi?', 'Не слишком ли там много туристов?'],
      ['What would surprise a visitor there?', 'U yerda mehmonni nima hayratlantiradi?', 'Что там удивит гостя?'],
      ['What would you change about the place?', 'Bu joyda nimani o‘zgartirgan bo‘lardingiz?', 'Что бы вы изменили в этом месте?'],
      ['Why go there instead of a more famous city?', 'Nega mashhurroq shahar o‘rniga u yerga borish kerak?', 'Почему стоит поехать туда, а не в более известный город?'],
    ]),
    card('card.habit', ['Present a healthy habit you recommend to young people.', 'Yoshlarga tavsiya qiladigan sog‘lom odatni taqdim eting.', 'Представьте полезную привычку, которую вы советуете молодёжи.'], [
      ['the habit and how you discovered it', 'odat va uni qanday kashf qilganingiz', 'привычка и как вы её открыли'],
      ['what changed when you started', 'boshlaganingizda nima o‘zgardi', 'что изменилось, когда вы начали'],
      ['the easiest way to begin tomorrow', 'ertadan boshlashning eng oson yo‘li', 'самый простой способ начать завтра'],
      ['how to keep going when it gets boring', 'zerikarli bo‘lganda qanday davom etish', 'как не бросить, когда станет скучно'],
    ], [
      ['How long have you kept this habit?', 'Bu odatni qancha vaqtdan beri saqlab kelyapsiz?', 'Как долго вы держите эту привычку?'],
      ['Did anyone start it because of you?', 'Siz tufayli kimdir uni boshladimi?', 'Начал ли кто-то из-за вас?'],
    ], [
      ['What if someone has no time for it?', 'Kimningdir bunga vaqti bo‘lmasa-chi?', 'А если у человека нет на это времени?'],
      ['Is this really for everyone?', 'Bu haqiqatan ham hamma uchunmi?', 'Это правда подходит всем?'],
      ['What is the biggest mistake beginners make?', 'Yangi boshlovchilarning eng katta xatosi nima?', 'Какую главную ошибку делают новички?'],
      ['How do you know it is the habit and not something else that helped?', 'Aynan shu odat yordam berganini, boshqa narsa emasligini qayerdan bilasiz?', 'Откуда вы знаете, что помогла именно привычка, а не что-то другое?'],
    ]),
    card('card.career', ['Present your career plan for the next three years to a mentor.', 'Keyingi uch yillik kasbiy rejangizni ustozga taqdim eting.', 'Представьте наставнику свой карьерный план на три года.'], [
      ['where you are now', 'hozir qayerdasiz', 'где вы сейчас'],
      ['where you want to be and why', 'qayerda bo‘lishni xohlaysiz va nega', 'где хотите быть и почему'],
      ['the three steps that get you there', 'u yerga olib boradigan uchta qadam', 'три шага, которые вас туда приведут'],
      ['the help you are asking the mentor for', 'ustozdan so‘rayotgan yordamingiz', 'помощь, которую вы просите у наставника'],
    ], [
      ['What is the first step this month?', 'Shu oydagi birinchi qadam qaysi?', 'Какой первый шаг в этом месяце?'],
      ['Who inspired this plan?', 'Bu rejani kim ilhomlantirdi?', 'Кто вдохновил этот план?'],
    ], [
      ['What will you do if the first step fails?', 'Birinchi qadam muvaffaqiyatsiz bo‘lsa, nima qilasiz?', 'Что вы будете делать, если первый шаг не удастся?'],
      ['Why this path and not a safer one?', 'Nega xavfsizrog‘i emas, aynan shu yo‘l?', 'Почему этот путь, а не более надёжный?'],
      ['What are you prepared to give up for it?', 'Buning uchun nimadan voz kechishga tayyorsiz?', 'От чего вы готовы ради этого отказаться?'],
      ['How will you know you are on track after a year?', 'Bir yildan keyin to‘g‘ri yo‘lda ekaningizni qanday bilasiz?', 'Как через год вы поймёте, что идёте по плану?'],
    ]),
    card('card.charity', ['Present a charity event you are organising and ask for volunteers.', 'Tashkil qilayotgan xayriya tadbiringizni taqdim eting va ko‘ngillilarni taklif qiling.', 'Представьте благотворительное мероприятие, которое вы организуете, и позовите волонтёров.'], [
      ['who the event helps and why', 'tadbir kimga va nega yordam beradi', 'кому помогает мероприятие и почему'],
      ['what will happen on the day', 'o‘sha kuni nima bo‘ladi', 'что будет происходить в этот день'],
      ['what volunteers will do', 'ko‘ngillilar nima qiladi', 'что будут делать волонтёры'],
      ['how to sign up today', 'bugun qanday ro‘yxatdan o‘tish mumkin', 'как записаться уже сегодня'],
    ], [
      ['How many volunteers do you need?', 'Sizga nechta ko‘ngilli kerak?', 'Сколько волонтёров вам нужно?'],
      ['Have you organised an event like this before?', 'Avval shunday tadbir tashkil qilganmisiz?', 'Вы уже организовывали подобное?'],
    ], [
      ['How do we know the money really reaches the people?', 'Pul haqiqatan ham odamlarga yetib borishini qayerdan bilamiz?', 'Откуда мы знаем, что деньги правда дойдут до людей?'],
      ['What if it rains on the day?', 'O‘sha kuni yomg‘ir yog‘sa-chi?', 'А если в этот день пойдёт дождь?'],
      ['Can people help if they cannot come in person?', 'Kela olmaydiganlar ham yordam bera oladimi?', 'Могут ли помочь те, кто не сможет прийти?'],
      ['Why should people give their weekend to this?', 'Nega odamlar dam olish kunini bunga berishi kerak?', 'Почему люди должны отдать этому свои выходные?'],
    ]),
  ],
};

const qa: SpeakingPart = {
  id: 'qa',
  title: { en: 'Audience questions', uz: 'Auditoriya savollari', ru: 'Вопросы зала' },
  kind: 'questions',
  intro: P([
    'Thank you for your talk. Now the audience has some questions. Answer each one directly, give one reason or example, and keep it short.',
    'Nutqingiz uchun rahmat. Endi auditoriyada savollar bor. Har biriga to‘g‘ridan-to‘g‘ri javob bering, bitta sabab yoki misol keltiring va qisqa bo‘lsin.',
    'Спасибо за выступление. У зала есть вопросы. Отвечайте на каждый прямо, с одной причиной или примером, и коротко.',
  ]),
  fromCard: 'rehearsal',
  askPerTopic: 3,
  answerSeconds: { min: 15, target: 40, max: 75 },
};

export const speaking: Activity[] = [
  {
    id: 'speech.showcase',
    kind: 'speaking_exam',
    title: { en: 'Speaking practice and the showcase', uz: 'Nutq mashqi va ko‘rik nutqi', ru: 'Практика речи и показательное выступление' },
    node: 'formats',
    levels: [1, 5],
    minutes: 18,
    tags: ['speaking', 'pitch', 'impromptu', 'story', 'presentation', 'qa'],
    rubric: 'speech.talk',
    // One exam for both: each part can be practised alone (scored answer by answer),
    // and the whole sequence is the weekly showcase with one review.
    mock: true,
    parts: [pitch, impromptu, story, rehearsal, qa],
  },
];
