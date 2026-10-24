// Progress dashboard.
const en = {
  'dash.quick.title': 'Quick actions',
  'dash.quick.regenerate': 'Regenerate plan',
  'dash.quick.generating': 'Generating…',
  'dash.quick.planBuilder': 'Open plan builder',
  'dash.anchor.labs': 'Practice Labs',
  'dash.anchor.notebook': 'Notebook',
  'dash.anchor.roadmap': 'Roadmap',
  'dash.guided.eyebrow': 'Guided session',
  'dash.guided.title': 'Today’s focused session',
  'dash.guided.lead': 'Spaced reviews, then one focused lab, then a mastery check, in order, with a skip button at every step.',
  'dash.guided.open': 'Open today’s session',
};

type Keys = keyof typeof en;

const uz: Record<Keys, string> = {
  'dash.quick.title': 'Tezkor amallar',
  'dash.quick.regenerate': 'Rejani qayta tuzish',
  'dash.quick.generating': 'Tuzilmoqda…',
  'dash.quick.planBuilder': 'Reja sozlamalari',
  'dash.anchor.labs': 'Practice Labs',
  'dash.anchor.notebook': 'Xatolar daftari',
  'dash.anchor.roadmap': 'Yo‘l xaritasi',
  'dash.guided.eyebrow': 'Yo‘naltirilgan mashg‘ulot',
  'dash.guided.title': 'Bugungi asosiy mashg‘ulot',
  'dash.guided.lead': 'Avval takrorlash, keyin bitta asosiy laboratoriya, so‘ng o‘zlashtirish tekshiruvi — ketma-ket, har bir bosqichda o‘tkazib yuborish mumkin.',
  'dash.guided.open': 'Bugungi mashg‘ulotni ochish',
};

const ru: Record<Keys, string> = {
  'dash.quick.title': 'Быстрые действия',
  'dash.quick.regenerate': 'Пересоставить план',
  'dash.quick.generating': 'Составляем…',
  'dash.quick.planBuilder': 'Настроить план',
  'dash.anchor.labs': 'Practice Labs',
  'dash.anchor.notebook': 'Тетрадь ошибок',
  'dash.anchor.roadmap': 'Дорожная карта',
  'dash.guided.eyebrow': 'Занятие с гидом',
  'dash.guided.title': 'Главное занятие на сегодня',
  'dash.guided.lead': 'Повторение, затем одна основная лабораторная и проверка освоения — по порядку, каждый шаг можно пропустить.',
  'dash.guided.open': 'Открыть занятие на сегодня',
};

export const dashboard = { en, uz, ru };
