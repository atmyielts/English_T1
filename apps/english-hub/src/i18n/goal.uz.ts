/** Uzbek (Latin) strings for the goal date plan. Same keys as goal.en.ts. */
export const goalUz: Partial<Record<string, string>> = {
  // Status
  'goalPlan.status.no_level': 'Daraja hali aniqlanmagan',
  'goalPlan.status.reached': 'Maqsadga erishildi',
  'goalPlan.status.no_date': 'Sana tanlanmagan',
  'goalPlan.status.date_passed': 'Sana oʻtib ketdi',
  'goalPlan.status.not_enough_data': 'Maʼlumot hali kam',
  'goalPlan.status.on_track': 'Reja boʻyicha',
  'goalPlan.status.slightly_behind': 'Biroz ortda',
  'goalPlan.status.behind': 'Ortda',

  // Goal line
  'goalPlan.targetBy': '{date} gacha {level}',
  'goalPlan.targetNoDate': '{level} · sana tanlanmagan',
  'goalPlan.noTarget': 'Maqsad daraja hali tanlanmagan',

  // One-line advice
  'goalPlan.advice.no_level': 'Reja tuzishimiz uchun daraja testini topshiring.',
  'goalPlan.advice.noTarget': 'Rejani koʻrish uchun maqsad daraja va sanani tanlang.',
  'goalPlan.advice.no_date': '{level} uchun sana tanlang — haftasiga qancha shugʻullanish kerakligini koʻrsatamiz.',
  'goalPlan.advice.reached': 'Tekshirilgan koʻnikmalarda {level} darajasiga erishdingiz. Yangi maqsad tanlash vaqti keldi.',
  'goalPlan.advice.date_passed': 'Maqsad sanasi oʻtib ketdi. Rejani saqlash uchun yangi sana tanlang.',
  'goalPlan.advice.not_enough_data': 'Bir hafta shugʻullaning, sizning surʼatingizni koʻrsatamiz. Haftasiga taxminan {minutes} daqiqa moʻljal qiling.',
  'goalPlan.advice.not_enough_data_noDate': 'Bir hafta shugʻullaning, sizning surʼatingizni koʻrsatamiz.',
  'goalPlan.advice.on_track': 'Davom eting: shu surʼatda {level} darajasiga taxminan {date} da erishasiz.',
  'goalPlan.advice.on_track_soon': 'Davom eting: shu surʼatda {level} darajasiga muddatdan oldin erishasiz.',
  'goalPlan.advice.slightly_behind': '{date} gacha {level} darajasiga erishish uchun haftasiga {minutes} daqiqa shugʻullaning.',
  'goalPlan.advice.behind': 'Haftasiga taxminan {minutes} daqiqa kerak. Kuniga {daily} daqiqa qilib koʻring.',
  'goalPlan.advice.behind_noDaily': '{date} gacha {level} darajasiga erishish uchun haftasiga taxminan {minutes} daqiqa kerak.',
  'goalPlan.advice.check': 'Biz hisoblagan soatlarcha shugʻullandingiz. Darajangiz oshganini bilish uchun daraja tekshiruvini topshiring.',

  // Actions
  'goalPlan.cta.setDate': 'Sana tanlash',
  'goalPlan.cta.newDate': 'Yangi sana tanlash',
  'goalPlan.cta.newTarget': 'Yangi maqsad tanlash',
  'goalPlan.cta.raiseDaily': 'Kunlik vaqtni oshirish',
  'goalPlan.cta.change': 'Maqsadni oʻzgartirish',
  'goalPlan.cta.check': 'Daraja tekshiruvini topshirish',
  'goalPlan.cta.plan': 'Rejani koʻrish',

  // Today card
  'goalPlan.card.title': 'Maqsadingiz',
  'goalPlan.card.week': 'Bu hafta: {target} daqiqadan {minutes} daqiqa',
  'goalPlan.card.weekLabel': 'Bu haftadagi mashgʻulot vaqti',

  // Progress panel
  'goalPlan.panel.title': 'Maqsad rejasi',
  'goalPlan.panel.target': 'Maqsad',
  'goalPlan.panel.hours': 'Kerakli oʻqish vaqti',
  'goalPlan.panel.hoursValue': '{low}–{high} soat',
  'goalPlan.panel.hoursHint': 'taxminan {hours} soat qoldi',
  'goalPlan.panel.pace': 'Surʼatingiz',
  'goalPlan.panel.paceValue': '{minutes} daq/hafta',
  'goalPlan.panel.paceHint': 'oʻrtacha, soʻnggi 4 hafta',
  'goalPlan.panel.paceNew': 'birinchi haftangizdan beri',
  'goalPlan.panel.projected': 'Taxminan erishasiz',
  'goalPlan.panel.projectedNone': 'hali nomaʼlum',
  'goalPlan.panel.needed': '{date} gacha {level} uchun: haftasiga taxminan {minutes} daqiqa (kuniga {daily} daqiqa).',
  'goalPlan.panel.doneSince': 'Soʻnggi daraja tekshiruvidan beri {hours} soat shugʻullandingiz.',
  'goalPlan.panel.weeksTitle': 'Haftalik daqiqalar',
  'goalPlan.panel.weeksLabel': 'Soʻnggi 8 haftaning har biridagi mashgʻulot daqiqalari',
  'goalPlan.panel.weekBar': '{date} haftasi: {minutes} daqiqa',
  'goalPlan.panel.targetLine': 'Haftalik maqsad: {minutes} daqiqa',
  'goalPlan.panel.noPractice': 'Soʻnggi 8 haftada hali mashgʻulot yoʻq.',
  'goalPlan.estimateNote': 'Soatlar — Cambridge English tavsiya qilgan har bir CEFR darajasi uchun oʻqish soatlariga asoslangan taxmin, koʻnikmalaringiz boʻyicha oʻrtacha. Har kim oʻz surʼatida oʻrganadi; oylik daraja tekshiruvi rejani aniq saqlaydi.',

  // Settings
  'goalPlan.settings.title': 'Maqsad sanasi',
  'goalPlan.settings.lead': 'Qaysi darajani va qachongacha egallamoqchi ekaningizni tanlang. Biz buni haftalik mashgʻulot vaqtiga aylantiramiz.',
  'goalPlan.settings.level': 'Maqsad daraja',
  'goalPlan.settings.date': 'Qachongacha',
  'goalPlan.settings.clear': 'Sanasiz',
  'goalPlan.settings.in3': '3 oydan keyin',
  'goalPlan.settings.in6': '6 oydan keyin',
  'goalPlan.settings.in12': '1 yildan keyin',
  'goalPlan.settings.daily': 'Kunlik mashgʻulot vaqti',
  'goalPlan.settings.suggest': 'Rejangiz uchun kuniga taxminan {minutes} daqiqa kerak.',
  'goalPlan.settings.useSuggest': 'Kuniga {minutes} daqiqa qilish',
  'goalPlan.settings.save': 'Maqsadni saqlash',
  'goalPlan.settings.saved': 'Maqsad saqlandi.',
  'goalPlan.settings.error': 'Maqsadni saqlab boʻlmadi. Qaytadan urinib koʻring.',
  'goalPlan.settings.badDate': 'Bugundan keyingi va besh yil ichidagi sanani tanlang.',

  // Onboarding step
  'goalPlan.onboarding.title': '{level} darajasiga qachon erishmoqchisiz?',
  'goalPlan.onboarding.body': 'Ixtiyoriy. Sana tanlasangiz, haftasiga qancha shugʻullanish kerakligini va rejaga ulgurayotganingizni koʻrsatamiz.',
  'goalPlan.onboarding.save': 'Oʻqishni boshlash',
  'goalPlan.onboarding.skip': 'Hozircha oʻtkazib yuborish',
};
