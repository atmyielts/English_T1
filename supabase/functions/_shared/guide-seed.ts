import {
  type Condition,
  type Copy,
  copy as t,
  emptyCondition,
  type GuideFlow,
  type OfferRule,
  type Option,
  type Predicate,
  type Question,
} from "./guide.ts";
import { guideChecks } from "./guide-checks.ts";

const is = (question: string, value: string): Predicate => ({ question, op: "is", value });
const when = (...groups: Predicate[][]): Condition => ({ any: groups.map((all) => ({ all })) });
const option = (id: string, en: string, uz: string, ru: string): Option => ({ id, label: t(en, uz, ru) });
const prep = [[is("audience", "learner"), is("access", "new")], [
  is("audience", "parent"),
  is("parent_intent", "prepare"),
]];
const learning = when(...prep);
const forExam = (...exams: string[]) =>
  when(...prep.flatMap((g) => exams.map((exam) => [...g, is("exam", exam)])));
const role = (audience: string) => when([is("audience", audience)]);
const later: Predicate[][] = prep.map((g) => [...g, { question: "exam", op: "not", value: "unsure" }]);
const ready = when(...later);
const question = (
  id: string,
  title: Copy,
  options: Option[],
  condition: Condition = emptyCondition(),
  extra: Partial<Question> = {},
): Question => ({
  id,
  title,
  options,
  when: condition,
  kind: "single",
  required: true,
  chapter: "goal",
  help: t(
    "Choose what fits best. You can go back and change it.",
    "Sizga eng mos javobni tanlang. Keyin uni o‘zgartirishingiz mumkin.",
    "Выберите самый подходящий ответ. Его можно изменить позже.",
  ),
  ...extra,
});
const unsure = option("unsure", "Not sure yet", "Hali aniq emas", "Пока не знаю");
const subjects = [
  option("ielts", "IELTS", "IELTS", "IELTS"),
  option("sat", "SAT", "SAT", "SAT"),
  option("toefl", "TOEFL", "TOEFL", "TOEFL"),
  option("itep", "iTEP", "iTEP", "iTEP"),
  option("english", "General English", "Umumiy ingliz tili", "Общий английский"),
];
const budget = [
  option("free", "Only free options for now", "Hozircha faqat bepul variantlar", "Пока только бесплатные варианты"),
  option(
    "paid",
    "I can pay for the right fit",
    "Mos variant uchun to‘lashim mumkin",
    "Готовы платить за подходящий вариант",
  ),
  unsure,
];
const support = [
  option("self", "Independent practice", "Mustaqil mashq", "Самостоятельная практика"),
  option(
    "feedback",
    "Feedback and guidance",
    "Fikr-mulohaza va yo‘l-yo‘riq",
    "Обратная связь и рекомендации",
  ),
  option("teacher", "Help from a teacher", "O‘qituvchi yordami", "Помощь преподавателя"),
  unsure,
];
const timing = [
  option("soon", "Within a month", "Bir oy ichida", "В течение месяца"),
  option("quarter", "In 1–3 months", "1–3 oy ichida", "Через 1–3 месяца"),
  option("later", "Later", "Keyinroq", "Позже"),
  unsure,
];
const fallback = {
  title: t(
    "Let’s find a suitable next step together",
    "Mos keyingi qadamni birga topamiz",
    "Найдём подходящий следующий шаг вместе",
  ),
  body: t(
    "There isn’t an approved offer that clearly fits these answers yet. Share your needs with our team, or edit your answers. You do not need to buy an unsuitable product.",
    "Bu javoblarga aniq mos tasdiqlangan taklif hozircha yo‘q. Ehtiyojlaringizni jamoamizga ayting yoki javoblarni o‘zgartiring. Mos kelmaydigan mahsulotni sotib olishingiz shart emas.",
    "Пока нет одобренного предложения, которое точно подходит вашим ответам. Обсудите потребности с нашей командой или измените ответы. Покупать неподходящий продукт не нужно.",
  ),
  action: t("Talk to Schood", "Schood bilan bog‘lanish", "Связаться со Schood"),
  destination: "/contact" as const,
};
const workflow = (
  id: string,
  title: Copy,
  condition: Condition,
  destination: OfferRule["destination"],
  reasons: Copy[],
  action: Copy,
): OfferRule => ({
  id,
  title,
  when: condition,
  destination,
  reasons,
  action,
  kind: "route",
  enabled: true,
  priority: 1000,
  productId: "",
  planId: "",
  limitations: t(
    "Existing sign-in, invitation, and approval requirements still apply. These answers do not grant access.",
    "Mavjud kirish, taklifnoma va tasdiqlash talablari saqlanadi. Bu javoblar kirish huquqini bermaydi.",
    "Требования входа, приглашения и одобрения сохраняются. Ответы не предоставляют права доступа.",
  ),
});

/** Seed is a DRAFT, never an automatically published sales funnel. */
export function createGuideDraft(): GuideFlow {
  const flow: GuideFlow = {
    schemaVersion: 1,
    name: "Schood Guide",
    intro: t(
      "A few thoughtful questions. One clear next step.",
      "Bir nechta muhim savol. Bitta aniq keyingi qadam.",
      "Несколько важных вопросов. Один понятный следующий шаг.",
    ),
    appearance: { accent: "teal", illustration: "route", motion: "gentle" },
    fallback,
    questions: [
      question(
        "audience",
        t("Who are we helping today?", "Bugun kimga yordam beramiz?", "Кому помогаем сегодня?"),
        [
          {
            ...option("learner", "Myself", "O‘zimga", "Себе"),
            detail: t(
              "Find my way to a learning goal",
              "Maqsadimga mos o‘qish yo‘lini topish",
              "Найти путь к учебной цели",
            ),
          },
          {
            ...option("parent", "My child", "Farzandimga", "Моему ребёнку"),
            detail: t(
              "Choose preparation or follow progress",
              "Tayyorgarlik tanlash yoki natijalarni kuzatish",
              "Подобрать подготовку или следить за успехами",
            ),
          },
          {
            ...option("teacher", "My students", "O‘quvchilarimga", "Моим ученикам"),
            detail: t(
              "Teach, assess, and support a class",
              "O‘qitish, baholash va sinfga yordam",
              "Обучать, оценивать и поддерживать класс",
            ),
          },
          {
            ...option("center", "My education center", "O‘quv markazimga", "Моему учебному центру"),
            detail: t(
              "Connect people, lessons, and results",
              "Jamoa, darslar va natijalarni birlashtirish",
              "Объединить команду, уроки и результаты",
            ),
          },
        ],
      ),
      question(
        "parent_intent",
        t(
          "What would help your child?",
          "Farzandingizga qanday yordam kerak?",
          "Какая помощь нужна ребёнку?",
        ),
        [
          option("prepare", "Find preparation", "Tayyorgarlik topish", "Подобрать подготовку"),
          option(
            "progress",
            "See existing learning progress",
            "Mavjud o‘qish natijalarini ko‘rish",
            "Посмотреть текущие результаты",
          ),
          option("code", "Use an access code", "Kirish kodidan foydalanish", "Использовать код доступа"),
        ],
        role("parent"),
      ),
      question(
        "age",
        t(
          "Which age group is your child in?",
          "Farzandingiz qaysi yosh guruhida?",
          "К какой возрастной группе относится ребёнок?",
        ),
        [
          option("under13", "Under 13", "13 yoshdan kichik", "Младше 13"),
          option("13_17", "13–17", "13–17", "13–17"),
          option("adult", "18 or older", "18 yoki undan katta", "18 или старше"),
          option("private", "Prefer not to say", "Aytishni xohlamayman", "Не хочу указывать"),
        ].map((o) => o.id === "13_17" ? { ...o, id: "teen" } : o),
        when([is("audience", "parent"), is("parent_intent", "prepare")]),
        {
          help: t(
            "An age band is enough. Please do not enter a name or date of birth.",
            "Yosh guruhi yetarli. Ism yoki tug‘ilgan sanani kiritmang.",
            "Достаточно возрастной группы. Имя и дата рождения не нужны.",
          ),
        },
      ),
      question("access", t("Are you starting fresh?", "Yangidan boshlayapsizmi?", "Начинаете с нуля?"), [
        option("new", "Help me choose", "Tanlashga yordam bering", "Помогите выбрать"),
        option("code", "I have an access code", "Menda kirish kodi bor", "У меня есть код доступа"),
        option(
          "enrolled",
          "I already learn with Schood",
          "Schood bilan allaqachon o‘qiyapman",
          "Я уже учусь со Schood",
        ),
      ], role("learner")),
      question("exam", t("What are you working toward?", "Nimaga tayyorlanyapsiz?", "К чему готовитесь?"), [
        ...subjects,
        unsure,
      ], learning),
      question(
        "purpose",
        t(
          "Where do you want to use English?",
          "Ingliz tilidan qayerda foydalanmoqchisiz?",
          "Для чего нужен английский?",
        ),
        [
          option(
            "study",
            "Study or an admission requirement",
            "O‘qish yoki qabul talabi",
            "Учёба или поступление",
          ),
          option("work", "Work", "Ish", "Работа"),
          option(
            "life",
            "Everyday life and travel",
            "Kundalik hayot va sayohat",
            "Повседневная жизнь и путешествия",
          ),
          unsure,
        ],
        forExam("english", "unsure"),
      ),
      question(
        "target_ielts",
        t(
          "What IELTS result is required?",
          "Qanday IELTS natijasi talab qilinadi?",
          "Какой результат IELTS требуется?",
        ),
        [],
        forExam("ielts"),
        {
          kind: "number",
          required: false,
          min: 0,
          max: 9,
          goalField: "target_score",
          help: t(
            "Use your actual requirement, if known. Otherwise skip this question.",
            "Talabni bilsangiz kiriting. Aks holda savolni o‘tkazib yuboring.",
            "Укажите известное требование. Если не знаете — пропустите вопрос.",
          ),
        },
      ),
      question(
        "target_sat",
        t(
          "What SAT result are you aiming for?",
          "Qanday SAT natijasini maqsad qilgansiz?",
          "К какому результату SAT стремитесь?",
        ),
        [],
        forExam("sat"),
        { kind: "number", required: false, min: 400, max: 1600, goalField: "target_score" },
      ),
      question(
        "target_other",
        t(
          "Do you know your required result?",
          "Talab qilinadigan natijani bilasizmi?",
          "Вы знаете требуемый результат?",
        ),
        [
          option(
            "known",
            "Yes — I can confirm it in the preparation product",
            "Ha — uni tayyorgarlik mahsulotida tasdiqlayman",
            "Да — уточню его в продукте для подготовки",
          ),
          unsure,
        ],
        forExam("toefl", "itep"),
      ),
      question(
        "level",
        t(
          "How would you describe the starting point?",
          "Boshlang‘ich holatni qanday tasvirlaysiz?",
          "Как бы вы описали начальный уровень?",
        ),
        [
          option("beginner", "Building foundations", "Asoslarni o‘rganish", "Осваиваю основы"),
          option(
            "practice",
            "Some experience, need practice",
            "Tajribam bor, mashq kerak",
            "Есть опыт, нужна практика",
          ),
          option("test", "Already taken a test", "Avval test topshirganman", "Уже сдавал(а) тест"),
          unsure,
        ],
        ready,
        {
          chapter: "starting",
          help: t(
            "This is your own description, not a measured level. The optional check comes later.",
            "Bu sizning tavsifingiz, o‘lchangan daraja emas. Ixtiyoriy tekshiruv keyinroq bo‘ladi.",
            "Это ваша оценка, а не измеренный уровень. Короткая проверка будет позже.",
          ),
        },
      ),
      question(
        "deadline",
        t("Is there a target date?", "Maqsadli sana bormi?", "Есть ли целевая дата?"),
        [],
        ready,
        {
          kind: "date",
          required: false,
          chapter: "starting",
          goalField: "target_date",
          help: t(
            "An exam date or personal deadline helps set a realistic pace. Skip if undecided.",
            "Imtihon sanasi yoki shaxsiy muddat mos sur’atni tanlashga yordam beradi. Aniq bo‘lmasa o‘tkazib yuboring.",
            "Дата экзамена или личный срок помогает выбрать подходящий темп. Если не решили — пропустите.",
          ),
        },
      ),
      question(
        "difficulty",
        t("What gets in the way most?", "Eng katta qiyinchilik nima?", "Что мешает больше всего?"),
        [
          option("reading", "Reading", "O‘qish", "Чтение"),
          option("listening", "Listening", "Tinglash", "Аудирование"),
          option("writing", "Writing", "Yozish", "Письмо"),
          option("speaking", "Speaking", "Gapirish", "Говорение"),
          option("math", "Math", "Matematika", "Математика"),
          option("timing", "Time pressure", "Vaqt yetishmasligi", "Нехватка времени"),
          unsure,
        ],
        ready,
        { kind: "multi", maxSelections: 2, chapter: "starting" },
      ),
      question(
        "writing_obstacle",
        t("What makes writing difficult?", "Yozishda nima qiyin?", "Что затрудняет письмо?"),
        [
          option("ideas", "Finding ideas", "G‘oya topish", "Поиск идей"),
          option("structure", "Organizing an answer", "Javobni tuzish", "Структура ответа"),
          option("accuracy", "Language accuracy", "Til aniqligi", "Языковая точность"),
          option(
            "feedback",
            "Knowing what to improve",
            "Nimani yaxshilashni bilish",
            "Понимание, что улучшить",
          ),
          unsure,
        ],
        when(
          ...later.map(
            (g) => [...g, is("exam", "ielts"), {
              question: "difficulty",
              op: "has" as const,
              value: "writing",
            }],
          ),
        ),
        { chapter: "starting" },
      ),
      question(
        "math_obstacle",
        t(
          "Where does math become difficult?",
          "Matematikada qayerda qiynalasiz?",
          "Где возникают трудности с математикой?",
        ),
        [
          option("foundations", "The foundations", "Asoslarda", "В основах"),
          option(
            "questions",
            "Unfamiliar question types",
            "Notanish savol turlarida",
            "В незнакомых типах заданий",
          ),
          option("timing", "Working quickly enough", "Tez ishlashda", "В скорости решения"),
          unsure,
        ],
        when(
          ...later.map(
            (g) => [...g, is("exam", "sat"), { question: "difficulty", op: "has" as const, value: "math" }],
          ),
        ),
        { chapter: "starting" },
      ),
      question(
        "minutes",
        t(
          "How many minutes fit into a normal day?",
          "Oddiy kunda necha daqiqa ajrata olasiz?",
          "Сколько минут найдётся в обычный день?",
        ),
        [],
        ready,
        {
          chapter: "routine",
          kind: "number",
          required: false,
          min: 5,
          max: 240,
          goalField: "daily_minutes",
          help: t(
            "A sustainable routine is more useful than an ambitious promise.",
            "Doimiy bajariladigan tartib katta va’dadan foydaliroq.",
            "Посильный режим полезнее амбициозного обещания.",
          ),
        },
      ),
      question(
        "support",
        t("What kind of support would help?", "Qanday yordam foydali bo‘ladi?", "Какая поддержка поможет?"),
        support,
        ready,
        { chapter: "routine" },
      ),
      question(
        "budget",
        t("How should we consider the budget?", "Byudjetni qanday hisobga olaylik?", "Как учитывать бюджет?"),
        budget,
        when(...later, [is("audience", "teacher")], [is("audience", "center")]),
        {
          chapter: "routine",
          help: t(
            "Choosing free options is welcome. We will show costs clearly and will not invent a free offer.",
            "Bepul variantlarni tanlashingiz mumkin. Narxlarni aniq ko‘rsatamiz va mavjud bo‘lmagan bepul taklifni va’da qilmaymiz.",
            "Можно выбрать бесплатные варианты. Мы покажем стоимость открыто и не будем обещать несуществующие предложения.",
          ),
        },
      ),
      question("teacher_context", t("How do you teach?", "Qanday dars berasiz?", "Как вы преподаёте?"), [
        option("independent", "Independently", "Mustaqil", "Самостоятельно"),
        option("center", "As part of a center", "Markaz jamoasida", "В учебном центре"),
      ], role("teacher")),
      question(
        "teacher_subject",
        t("What do you teach most?", "Asosan nimadan dars berasiz?", "Что вы в основном преподаёте?"),
        subjects,
        role("teacher"),
      ),
      question(
        "class_size",
        t(
          "How many learners do you support?",
          "Nechta o‘quvchi bilan ishlaysiz?",
          "Со сколькими учениками работаете?",
        ),
        [
          option("small", "1–10", "1–10", "1–10"),
          option("medium", "11–30", "11–30", "11–30"),
          option("large", "31 or more", "31 yoki undan ko‘p", "31 и больше"),
        ],
        role("teacher"),
        { chapter: "starting" },
      ),
      question(
        "teacher_need",
        t(
          "What would make teaching easier?",
          "Dars berishni nima osonlashtiradi?",
          "Что упростило бы преподавание?",
        ),
        [
          option("mocks", "Delivering mock tests", "Sinov testlarini o‘tkazish", "Проведение пробных тестов"),
          option(
            "assignments",
            "Assignments and feedback",
            "Vazifalar va fikr-mulohaza",
            "Задания и обратная связь",
          ),
          option("progress", "Tracking progress", "Natijalarni kuzatish", "Отслеживание прогресса"),
          option("classroom", "Managing classes", "Sinflarni boshqarish", "Управление классами"),
          option(
            "referrals",
            "Referrals and access codes",
            "Tavsiyalar va kirish kodlari",
            "Рекомендации и коды доступа",
          ),
        ],
        role("teacher"),
        { chapter: "starting" },
      ),
      question(
        "teacher_setup",
        t("What is already in place?", "Hozir nimalar tayyor?", "Что уже настроено?"),
        [
          option(
            "existing",
            "An existing Schood classroom",
            "Mavjud Schood sinfi",
            "Существующий класс Schood",
          ),
          option("invite", "An invitation from my center", "Markazimdan taklifnoma", "Приглашение от центра"),
          option("new", "Starting with Schood", "Schood bilan boshlayapman", "Только начинаю со Schood"),
        ],
        role("teacher"),
        { chapter: "starting" },
      ),
      question(
        "teacher_timing",
        t("When do you want to start?", "Qachon boshlamoqchisiz?", "Когда хотите начать?"),
        timing,
        role("teacher"),
        { chapter: "routine" },
      ),
      question(
        "teacher_support",
        t("How would you like to get started?", "Qanday boshlashni xohlaysiz?", "Как хотите начать?"),
        [
          option("self", "Explore independently", "Mustaqil ko‘rib chiqish", "Разобраться самостоятельно"),
          option("guided", "A guided introduction", "Yo‘l-yo‘riqli tanishuv", "Вводная консультация"),
        ],
        role("teacher"),
        { chapter: "routine" },
      ),
      question(
        "center_context",
        t(
          "Is your center already on Schood?",
          "Markazingiz Schood’da bormi?",
          "Ваш центр уже использует Schood?",
        ),
        [option("existing", "Yes", "Ha", "Да"), option("new", "Not yet", "Hali yo‘q", "Пока нет")],
        role("center"),
      ),
      question(
        "center_role",
        t("What is your responsibility?", "Sizning vazifangiz qanday?", "За что вы отвечаете?"),
        [
          option("owner", "Owner or director", "Egasi yoki direktori", "Владелец или директор"),
          option(
            "manager",
            "Operations or academic manager",
            "Operatsion yoki akademik menejer",
            "Операционный или академический менеджер",
          ),
          option(
            "research",
            "Researching for the team",
            "Jamoa uchun o‘rganyapman",
            "Изучаю варианты для команды",
          ),
        ],
        role("center"),
      ),
      question(
        "center_size",
        t("How many active learners are there?", "Nechta faol o‘quvchi bor?", "Сколько активных учеников?"),
        [
          option("small", "Up to 50", "50 tagacha", "До 50"),
          option("medium", "51–200", "51–200", "51–200"),
          option("large", "201 or more", "201 yoki undan ko‘p", "201 и больше"),
        ],
        role("center"),
        { chapter: "starting" },
      ),
      question(
        "center_team",
        t(
          "How large is the teaching team?",
          "O‘qituvchilar jamoasi qanchalik katta?",
          "Сколько преподавателей в команде?",
        ),
        [
          option("small", "1–5 teachers", "1–5 o‘qituvchi", "1–5 преподавателей"),
          option("medium", "6–20 teachers", "6–20 o‘qituvchi", "6–20 преподавателей"),
          option("large", "More than 20", "20 dan ko‘p", "Более 20"),
        ],
        role("center"),
        { chapter: "starting" },
      ),
      question(
        "center_locations",
        t("How many locations do you run?", "Nechta filialni boshqarasiz?", "Сколько у вас филиалов?"),
        [
          option("one", "One", "Bitta", "Один"),
          option("several", "Several", "Bir nechta", "Несколько"),
          option("online", "Online only", "Faqat onlayn", "Только онлайн"),
        ],
        role("center"),
        { chapter: "starting" },
      ),
      question(
        "center_need",
        t(
          "What needs attention first?",
          "Birinchi navbatda nimani hal qilish kerak?",
          "Что нужно решить в первую очередь?",
        ),
        [
          option(
            "classroom",
            "Classes and teaching operations",
            "Sinflar va o‘qitish jarayoni",
            "Классы и учебный процесс",
          ),
          option(
            "mocks",
            "Mock tests and access distribution",
            "Sinov testlari va kirish huquqlarini tarqatish",
            "Пробные тесты и выдача доступа",
          ),
          option(
            "reporting",
            "Progress and parent communication",
            "Natijalar va ota-onalar bilan aloqa",
            "Прогресс и связь с родителями",
          ),
          option(
            "payments",
            "Payments and administration",
            "To‘lovlar va boshqaruv",
            "Платежи и администрирование",
          ),
        ],
        role("center"),
        { chapter: "starting" },
      ),
      question(
        "center_setup",
        t("How is this managed today?", "Buni hozir qanday boshqarasiz?", "Как вы управляете этим сейчас?"),
        [
          option("manual", "Spreadsheets and messages", "Jadvallar va xabarlar", "Таблицы и сообщения"),
          option("software", "Another learning system", "Boshqa o‘quv tizimi", "Другая учебная система"),
          option("schood", "Already inside Schood", "Allaqachon Schood ichida", "Уже в Schood"),
        ],
        role("center"),
        { chapter: "starting" },
      ),
      question(
        "center_timing",
        t("When would you like to begin?", "Qachon boshlashni xohlaysiz?", "Когда хотели бы начать?"),
        timing,
        role("center"),
        { chapter: "routine" },
      ),
      question(
        "center_support",
        t(
          "What launch support do you need?",
          "Boshlash uchun qanday yordam kerak?",
          "Какая помощь нужна при запуске?",
        ),
        [
          option("self", "Self-serve setup", "Mustaqil sozlash", "Самостоятельная настройка"),
          option("demo", "A demonstration for the team", "Jamoa uchun namoyish", "Демонстрация для команды"),
          option(
            "migration",
            "Help planning a transition",
            "O‘tishni rejalashtirishda yordam",
            "Помощь с планированием перехода",
          ),
        ],
        role("center"),
        { chapter: "routine" },
      ),
    ],
    checks: structuredClone(guideChecks),
    offers: [
      workflow(
        "redeem",
        t(
          "Use your existing access code",
          "Mavjud kirish kodingizdan foydalaning",
          "Используйте имеющийся код доступа",
        ),
        when([is("access", "code")], [is("parent_intent", "code")]),
        "/redeem",
        [
          t("You already have a code.", "Sizda kod allaqachon bor.", "У вас уже есть код."),
          t(
            "Check what it unlocks before buying anything.",
            "Xarid qilishdan oldin kod nimani ochishini tekshiring.",
            "Проверьте доступ по коду до покупки.",
          ),
          t(
            "Learning access stays with the learner’s account.",
            "O‘qish huquqi o‘quvchining hisobida qoladi.",
            "Учебный доступ принадлежит аккаунту ученика.",
          ),
        ],
        t("Use my code", "Kodimdan foydalanish", "Использовать код"),
      ),
      workflow(
        "existing_learning",
        t("Continue your learning", "O‘qishni davom ettiring", "Продолжайте обучение"),
        when([is("access", "enrolled")]),
        "/student-center",
        [
          t("You already use Schood.", "Siz Schood’dan foydalanasiz.", "Вы уже пользуетесь Schood."),
          t(
            "Your existing services come first.",
            "Mavjud xizmatlaringiz birinchi o‘rinda.",
            "Сначала ваши доступные сервисы.",
          ),
          t(
            "There is no need to buy the same access again.",
            "Bir xil kirish huquqini qayta sotib olish shart emas.",
            "Не нужно покупать тот же доступ повторно.",
          ),
        ],
        t("Open my learning", "O‘qishimni ochish", "Открыть обучение"),
      ),
      workflow(
        "parent_progress",
        t(
          "Find your child’s progress report",
          "Farzandingizning natijalar hisobotini toping",
          "Найдите отчёт об успехах ребёнка",
        ),
        when([is("parent_intent", "progress")]),
        "/contact",
        [
          t(
            "You want progress, not a new preparation purchase.",
            "Sizga yangi xarid emas, natijalar kerak.",
            "Вам нужен прогресс, а не новая покупка.",
          ),
          t(
            "Ask the learner’s center for a verified report link or parent invitation.",
            "O‘quv markazidan tasdiqlangan hisobot havolasi yoki ota-ona taklifnomasini so‘rang.",
            "Запросите у центра проверенную ссылку на отчёт или приглашение родителя.",
          ),
          t(
            "Our team can help you find the correct route without exposing another learner’s data.",
            "Jamoamiz boshqa o‘quvchi ma’lumotlarini oshkor qilmasdan to‘g‘ri yo‘lni topishga yordam beradi.",
            "Команда поможет найти нужный путь, не раскрывая данные другого ученика.",
          ),
        ],
        t("Get help finding my report", "Hisobotni topishda yordam olish", "Помощь с поиском отчёта"),
      ),
      workflow(
        "teacher_workspace",
        t("Your teaching workspace", "O‘qituvchi ish joyingiz", "Ваше рабочее место преподавателя"),
        when([is("audience", "teacher"), is("teacher_setup", "existing")], [
          is("audience", "teacher"),
          is("teacher_setup", "invite"),
        ]),
        "/academy/teacher",
        [
          t(
            "You have a classroom or invitation.",
            "Sizda sinf yoki taklifnoma bor.",
            "У вас есть класс или приглашение.",
          ),
          t(
            "Continue inside your existing center.",
            "Mavjud markazingiz ichida davom eting.",
            "Продолжайте работу в своём центре.",
          ),
          t(
            "Your center controls teaching permissions.",
            "O‘qitish ruxsatlarini markazingiz boshqaradi.",
            "Права преподавателя определяет центр.",
          ),
        ],
        t("Open teaching workspace", "O‘qituvchi ish joyini ochish", "Открыть рабочее место"),
      ),
      workflow(
        "teacher_partner",
        t("Explore partner tools", "Hamkor vositalarini ko‘rib chiqing", "Изучите инструменты партнёра"),
        when([is("audience", "teacher"), is("teacher_need", "referrals"), is("teacher_setup", "new")]),
        "/partner",
        [
          t(
            "Referrals and codes are your priority.",
            "Tavsiyalar va kodlar siz uchun muhim.",
            "Ваш приоритет — рекомендации и коды.",
          ),
          t(
            "Use the existing partner process.",
            "Mavjud hamkorlik jarayonidan foydalaning.",
            "Используйте существующий процесс партнёрства.",
          ),
          t(
            "Review availability and terms before committing.",
            "Qaror qilishdan oldin mavjudlik va shartlarni ko‘rib chiqing.",
            "Ознакомьтесь с доступностью и условиями до решения.",
          ),
        ],
        t("Explore partner access", "Hamkor kirishini ko‘rish", "Изучить партнёрский доступ"),
      ),
      workflow(
        "center_existing",
        t(
          "Continue in your center office",
          "Markaz kabinetingizda davom eting",
          "Продолжайте в кабинете центра",
        ),
        when([is("audience", "center"), is("center_context", "existing")]),
        "/center-office",
        [
          t(
            "Your center already uses Schood.",
            "Markazingiz Schood’dan foydalanadi.",
            "Ваш центр уже использует Schood.",
          ),
          t(
            "Keep your existing setup and membership.",
            "Mavjud sozlamalar va a’zolikni saqlang.",
            "Сохраните текущие настройки и членство.",
          ),
          t(
            "Your account permissions determine the tools you can open.",
            "Hisob ruxsatlari qaysi vositalarni ochishingizni belgilaydi.",
            "Права аккаунта определяют доступные инструменты.",
          ),
        ],
        t("Open center office", "Markaz kabinetini ochish", "Открыть кабинет центра"),
      ),
      workflow(
        "center_new",
        t(
          "Plan your center’s introduction",
          "Markazingiz uchun tanishuvni rejalashtiring",
          "Спланируйте знакомство центра со Schood",
        ),
        when([is("audience", "center"), is("center_context", "new")]),
        "/education-centers",
        [
          t(
            "Your center is new to Schood.",
            "Markazingiz Schood bilan yangi tanishmoqda.",
            "Ваш центр только знакомится со Schood.",
          ),
          t(
            "Review the application and approval process.",
            "Ariza va tasdiqlash jarayonini ko‘rib chiqing.",
            "Изучите процесс заявки и одобрения.",
          ),
          t(
            "Confirm the fit for your team before purchasing access.",
            "Kirishni xarid qilishdan oldin jamoangizga mosligini tasdiqlang.",
            "Убедитесь, что решение подходит команде, прежде чем покупать доступ.",
          ),
        ],
        t("Explore center setup", "Markazni sozlashni ko‘rish", "Изучить подключение центра"),
      ),
    ],
  };
  // Keep chapters in order even though the authoring groups above are organized by audience.
  const difficulty = flow.questions.find((q) => q.id === "difficulty")!;
  const satDifficulty = {
    ...structuredClone(difficulty),
    id: "sat_difficulty",
    when: forExam("sat"),
    options: difficulty.options.filter((o) => !["speaking", "listening"].includes(o.id)),
  };
  difficulty.when = forExam("ielts", "toefl", "itep", "english");
  difficulty.options = difficulty.options.filter((o) => o.id !== "math");
  flow.questions.splice(flow.questions.findIndex((q) => q.id === "difficulty") + 1, 0, satDifficulty);
  const mathObstacle = flow.questions.find((q) => q.id === "math_obstacle")!;
  mathObstacle.when.any.forEach((group) =>
    group.all.forEach((p) => {
      if (p.question === "difficulty") p.question = "sat_difficulty";
    })
  );
  const order = { goal: 0, starting: 1, routine: 2 };
  flow.questions.sort((a, b) => order[a.chapter] - order[b.chapter]);
  return flow;
}
