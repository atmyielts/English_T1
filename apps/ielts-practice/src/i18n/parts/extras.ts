// Dashboard extras: full mock entry, repair targets, coach widgets and helpers.
const en = {
  'mock.eyebrow': 'Full mock',
  'mock.title': 'Take a full mock in IELTS Simulator',
  'mock.lead': 'IELTS Simulator is a separate Schood service with complete computer-delivered mock tests under timed conditions. Its results feed back into your practice plan here.',
  'mock.included': 'Included in your access',
  'mock.notIncluded': 'Not included in IELTS Practice. It needs an IELTS Simulator plan or a bundle that includes it.',
  'mock.checking': 'Checking your access…',
  'mock.start': 'Open IELTS Simulator',
  'mock.plans': 'See IELTS Simulator plans',
  'impact.eyebrow': 'Biggest repair targets',
  'impact.title': 'Where your open mistakes cluster',
  'impact.lead': 'From your mistake notebook: the question types you miss most often, with your measured accuracy.',
  'impact.loading': 'Loading your repair targets…',
  'impact.empty': 'Complete a few labs and your most frequent mistake patterns will appear here.',
  'impact.misses': '{count|one:# recorded miss|other:# recorded misses}',
  'impact.accuracy': '{value} accuracy over {attempts} attempts',
  'impact.noAccuracy': 'Accuracy not measured yet',
};

type Keys = keyof typeof en;

const uz: Record<Keys, string> = {
  'mock.eyebrow': 'To‘liq mock',
  'mock.title': 'IELTS Simulator’da to‘liq mock topshiring',
  'mock.lead': 'IELTS Simulator — kompyuterda, vaqt cheklovi bilan to‘liq mock testlar topshiriladigan alohida Schood xizmati. Uning natijalari bu yerdagi mashq rejangizga ta’sir qiladi.',
  'mock.included': 'Sizning kirish huquqingizga kiradi',
  'mock.notIncluded': 'IELTS Practice’ga kirmaydi. Buning uchun IELTS Simulator tarifi yoki uni o‘z ichiga olgan to‘plam kerak.',
  'mock.checking': 'Kirish huquqingiz tekshirilmoqda…',
  'mock.start': 'IELTS Simulator’ni ochish',
  'mock.plans': 'IELTS Simulator tariflari',
  'impact.eyebrow': 'Asosiy tuzatish nuqtalari',
  'impact.title': 'Ochiq xatolaringiz qayerda to‘plangan',
  'impact.lead': 'Xatolar daftaringizdan: eng ko‘p xato qilayotgan savol turlaringiz va o‘lchangan aniqligingiz.',
  'impact.loading': 'Tuzatish nuqtalari yuklanmoqda…',
  'impact.empty': 'Bir nechta laboratoriyani bajaring, eng ko‘p uchraydigan xatolaringiz shu yerda chiqadi.',
  'impact.misses': '{count} ta qayd etilgan xato',
  'impact.accuracy': '{attempts} urinishda {value} aniqlik',
  'impact.noAccuracy': 'Aniqlik hali o‘lchanmagan',
};

const ru: Record<Keys, string> = {
  'mock.eyebrow': 'Полный пробный тест',
  'mock.title': 'Пройдите полный тест в IELTS Simulator',
  'mock.lead': 'IELTS Simulator — отдельный сервис Schood с полными компьютерными пробными тестами на время. Его результаты учитываются в вашем плане практики здесь.',
  'mock.included': 'Входит в ваш доступ',
  'mock.notIncluded': 'Не входит в IELTS Practice. Нужен тариф IELTS Simulator или пакет, который его включает.',
  'mock.checking': 'Проверяем доступ…',
  'mock.start': 'Открыть IELTS Simulator',
  'mock.plans': 'Тарифы IELTS Simulator',
  'impact.eyebrow': 'Главные точки роста',
  'impact.title': 'Где собираются ваши ошибки',
  'impact.lead': 'Из тетради ошибок: типы вопросов, в которых вы ошибаетесь чаще всего, и ваша измеренная точность.',
  'impact.loading': 'Загружаем точки роста…',
  'impact.empty': 'Пройдите несколько лабораторных, и здесь появятся ваши самые частые ошибки.',
  'impact.misses': '{count|one:# ошибка|few:# ошибки|many:# ошибок|other:# ошибки}',
  'impact.accuracy': 'Точность {value} (попыток: {attempts})',
  'impact.noAccuracy': 'Точность пока не измерена',
};

export const extras = { en, uz, ru };
