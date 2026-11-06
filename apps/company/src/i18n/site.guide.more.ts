// Position guidance for the four newest tracks; suggestions, not regulated requirements.
interface RoleGuide {
  metaTitle: string; metaDescription: string; title: string; lead: string;
  positions: { name: string; level: string; why: string }[];
  tasks: string[]; test: string;
}
export const moreGuide: Record<'en' | 'ru' | 'uz', Record<'government' | 'restaurant' | 'procurement' | 'accounting_audit', RoleGuide>> = {
  en: {
    government: {
      metaTitle: 'English level for public service | Schood guide', metaDescription: 'Suggested English levels for visitor desks, international cooperation and public-sector projects.',
      title: 'What English do public-service roles need?', lead: 'Choose requirements from the duties involving foreign visitors or partners. Any statutory qualification requirements need a separate check by the employer.',
      positions: [{ name: 'Visitor desk officer', level: 'A2', why: 'Explains opening hours, documents and directions.' }, { name: 'International project coordinator', level: 'B2', why: 'Corresponds with partners and explains project progress.' }, { name: 'International cooperation lead', level: 'C1', why: 'Discusses sensitive issues and negotiates wording.' }],
      tasks: ['Explaining application steps to a visitor', 'Writing clear replies to partner organisations', 'Summarising project decisions'], test: 'Test listening and speaking for visitor desks, and reading and writing for international correspondence.',
    },
    restaurant: {
      metaTitle: 'English level for restaurant staff | Schood guide', metaDescription: 'Suggested English levels for servers, reservation staff and restaurant managers.',
      title: 'What English do restaurant staff need?', lead: 'A server in Samarkand and a reservations manager face different conversations. Match the test to the guests and the actual work.',
      positions: [{ name: 'Server taking routine orders', level: 'A2', why: 'Confirms dishes, quantities and the bill.' }, { name: 'Reservations or shift supervisor', level: 'B1', why: 'Explains changes, handles requests and checks understanding.' }, { name: 'Restaurant manager with international guests', level: 'B2', why: 'Resolves complaints and discusses group events.' }],
      tasks: ['Confirming an order and dietary requests', 'Explaining a delay or unavailable dish', 'Resolving a booking problem'], test: 'Prioritise listening, speaking and menu vocabulary. Check that staff can clarify an unfamiliar request rather than guess.',
    },
    procurement: {
      metaTitle: 'English level for procurement | Schood guide', metaDescription: 'Suggested English levels for purchasing assistants, buyers and procurement managers.',
      title: 'What English does procurement need?', lead: 'Supplier quotations, lead times and specifications need precise language. Separate routine order handling from negotiation.',
      positions: [{ name: 'Purchasing assistant', level: 'B1', why: 'Checks quotations and confirms standard order details.' }, { name: 'Buyer working with overseas suppliers', level: 'B2', why: 'Clarifies specifications and compares delivery terms.' }, { name: 'Procurement manager negotiating contracts', level: 'C1', why: 'Discusses risk, alternatives and contractual wording.' }],
      tasks: ['Requesting and comparing quotations', 'Clarifying delivery schedules and specifications', 'Writing a supplier escalation'], test: 'Use reading and writing for quotations and purchase orders, plus listening and speaking for supplier negotiations.',
    },
    accounting_audit: {
      metaTitle: 'English level for accounting and audit | Schood guide', metaDescription: 'Suggested English levels for accounting assistants, accountants and audit leads.',
      title: 'What English do accounting and audit roles need?', lead: 'Test communication about records and evidence. English proficiency is separate from accounting competence and professional qualifications.',
      positions: [{ name: 'Accounting assistant', level: 'B1', why: 'Checks invoices and requests missing documents.' }, { name: 'Accountant reporting to an international team', level: 'B2', why: 'Explains reconciliations and responds to audit questions.' }, { name: 'Audit or finance lead', level: 'C1', why: 'Discusses findings, judgement and sensitive discrepancies.' }],
      tasks: ['Requesting supporting documents', 'Explaining a reconciliation difference', 'Summarising a finding and agreed action'], test: 'Prioritise reading evidence and writing clear explanations; include speaking for audit interviews and management reporting.',
    },
  },
  ru: {
    government: {
      metaTitle: 'Английский для госслужбы: какой уровень нужен | Schood', metaDescription: 'Рекомендуемые уровни для приёма посетителей, международного сотрудничества и государственных проектов.',
      title: 'Какой английский нужен в государственных организациях?', lead: 'Исходите из задач с иностранными посетителями и партнёрами. Обязательные квалификационные требования работодатель проверяет отдельно.',
      positions: [{ name: 'Сотрудник приёмной', level: 'A2', why: 'Объясняет часы работы, документы и маршрут.' }, { name: 'Координатор международного проекта', level: 'B2', why: 'Переписывается с партнёрами и объясняет ход проекта.' }, { name: 'Руководитель международного сотрудничества', level: 'C1', why: 'Обсуждает чувствительные вопросы и согласовывает формулировки.' }],
      tasks: ['Объяснение порядка подачи заявления', 'Ответы партнёрским организациям', 'Краткое изложение решений проекта'], test: 'Для приёмной проверяйте аудирование и говорение, для международной переписки — чтение и письмо.',
    },
    restaurant: {
      metaTitle: 'Английский для сотрудников ресторана | Schood', metaDescription: 'Рекомендуемые уровни для официантов, бронирования и руководителей ресторанов.',
      title: 'Какой английский нужен сотрудникам ресторана?', lead: 'Официант в Самарканде и менеджер по бронированию ведут разные разговоры. Подбирайте тест под гостей и реальные задачи.',
      positions: [{ name: 'Официант с обычными заказами', level: 'A2', why: 'Уточняет блюда, количество и счёт.' }, { name: 'Сотрудник бронирования или старший смены', level: 'B1', why: 'Объясняет изменения, принимает просьбы и проверяет понимание.' }, { name: 'Менеджер ресторана с иностранными гостями', level: 'B2', why: 'Решает жалобы и обсуждает групповые мероприятия.' }],
      tasks: ['Уточнение заказа и пищевых ограничений', 'Объяснение задержки или отсутствия блюда', 'Решение проблемы с бронированием'], test: 'В первую очередь аудирование, говорение и лексика меню. Проверьте умение уточнить незнакомую просьбу, а не угадывать.',
    },
    procurement: {
      metaTitle: 'Английский для закупок: какой уровень нужен | Schood', metaDescription: 'Рекомендуемые уровни для помощников по закупкам, закупщиков и руководителей.',
      title: 'Какой английский нужен в закупках?', lead: 'В предложениях поставщиков, сроках и спецификациях важна точность. Отделяйте обычную обработку заказа от переговоров.',
      positions: [{ name: 'Помощник по закупкам', level: 'B1', why: 'Проверяет предложения и подтверждает обычные детали заказа.' }, { name: 'Закупщик у зарубежных поставщиков', level: 'B2', why: 'Уточняет спецификации и сравнивает условия поставки.' }, { name: 'Руководитель закупок с договорными переговорами', level: 'C1', why: 'Обсуждает риски, альтернативы и условия договора.' }],
      tasks: ['Запрос и сравнение предложений', 'Уточнение сроков и спецификаций', 'Письмо поставщику о серьёзной проблеме'], test: 'Проверяйте чтение и письмо на предложениях и заказах, аудирование и говорение — в переговорах с поставщиком.',
    },
    accounting_audit: {
      metaTitle: 'Английский для бухгалтерии и аудита | Schood', metaDescription: 'Рекомендуемые уровни для помощников бухгалтера, бухгалтеров и руководителей аудита.',
      title: 'Какой английский нужен в бухгалтерии и аудите?', lead: 'Проверяйте общение о документах и доказательствах. Владение английским оценивается отдельно от профессиональных знаний и квалификации.',
      positions: [{ name: 'Помощник бухгалтера', level: 'B1', why: 'Проверяет счета и запрашивает недостающие документы.' }, { name: 'Бухгалтер международной команды', level: 'B2', why: 'Объясняет сверки и отвечает аудиторам.' }, { name: 'Руководитель аудита или финансов', level: 'C1', why: 'Обсуждает выводы, суждения и чувствительные расхождения.' }],
      tasks: ['Запрос подтверждающих документов', 'Объяснение расхождения при сверке', 'Краткое описание вывода и согласованного действия'], test: 'Главное — чтение документов и ясные письменные объяснения. Добавьте говорение для аудиторских интервью и отчётов руководству.',
    },
  },
  uz: {
    government: {
      metaTitle: 'Davlat tashkilotlari uchun ingliz tili darajasi | Schood', metaDescription: 'Qabulxona, xalqaro hamkorlik va davlat loyihalari xodimlari uchun tavsiya etilgan darajalar.',
      title: 'Davlat tashkilotlarida qanday ingliz tili kerak?', lead: 'Xorijiy tashrifchilar yoki hamkorlar bilan bog‘liq vazifalardan kelib chiqing. Majburiy malaka talablarini ish beruvchi alohida tekshiradi.',
      positions: [{ name: 'Qabulxona xodimi', level: 'A2', why: 'Ish vaqti, hujjatlar va yo‘lni tushuntiradi.' }, { name: 'Xalqaro loyiha koordinatori', level: 'B2', why: 'Hamkorlar bilan yozishadi va loyiha holatini tushuntiradi.' }, { name: 'Xalqaro hamkorlik rahbari', level: 'C1', why: 'Nozik masalalarni muhokama qiladi va matnni kelishadi.' }],
      tasks: ['Ariza topshirish bosqichlarini tushuntirish', 'Hamkor tashkilotlarga aniq javob yozish', 'Loyiha qarorlarini qisqacha bayon qilish'], test: 'Qabulxona uchun tinglash va gapirishni, xalqaro yozishmalar uchun o‘qish va yozishni tekshiring.',
    },
    restaurant: {
      metaTitle: 'Restoran xodimlari uchun ingliz tili darajasi | Schood', metaDescription: 'Ofitsiantlar, band qilish xodimlari va restoran rahbarlari uchun tavsiya etilgan darajalar.',
      title: 'Restoran xodimlariga qanday ingliz tili kerak?', lead: 'Samarqanddagi ofitsiant va band qilish menejeri turli suhbatlar olib boradi. Testni mehmonlar va haqiqiy ishga moslang.',
      positions: [{ name: 'Oddiy buyurtmalarni qabul qiluvchi ofitsiant', level: 'A2', why: 'Taomlar, miqdor va hisobni tasdiqlaydi.' }, { name: 'Band qilish xodimi yoki smena boshlig‘i', level: 'B1', why: 'O‘zgarishlarni tushuntiradi, iltimoslarni qabul qiladi va aniqlik kiritadi.' }, { name: 'Xorijiy mehmonlar bilan ishlovchi restoran menejeri', level: 'B2', why: 'Shikoyatlarni hal qiladi va guruh tadbirlarini muhokama qiladi.' }],
      tasks: ['Buyurtma va ovqatlanish talablarini aniqlash', 'Kechikish yoki taom yo‘qligini tushuntirish', 'Band qilish muammosini hal qilish'], test: 'Avval tinglash, gapirish va menyu lug‘atini tekshiring. Xodim noma’lum iltimosni taxmin qilish o‘rniga aniqlashtira olishini baholang.',
    },
    procurement: {
      metaTitle: 'Xaridlar bo‘yicha ingliz tili darajasi | Schood', metaDescription: 'Xarid yordamchilari, mutaxassislar va xaridlar rahbarlari uchun tavsiya etilgan darajalar.',
      title: 'Xaridlar bo‘limiga qanday ingliz tili kerak?', lead: 'Yetkazib beruvchi takliflari, muddatlar va texnik talablarda aniqlik zarur. Oddiy buyurtma ishini muzokaradan ajrating.',
      positions: [{ name: 'Xaridlar yordamchisi', level: 'B1', why: 'Takliflarni tekshiradi va oddiy buyurtma tafsilotlarini tasdiqlaydi.' }, { name: 'Xorijiy yetkazib beruvchilar bilan ishlovchi mutaxassis', level: 'B2', why: 'Texnik talablarni aniqlaydi va yetkazish shartlarini solishtiradi.' }, { name: 'Shartnoma muzokaralarini olib boruvchi xaridlar rahbari', level: 'C1', why: 'Xatarlar, muqobillar va shartnoma matnini muhokama qiladi.' }],
      tasks: ['Narx takliflarini so‘rash va solishtirish', 'Yetkazish muddati va texnik talablarni aniqlash', 'Yetkazib beruvchiga muammo haqida yozish'], test: 'Takliflar va xarid buyurtmalarida o‘qish va yozishni, muzokaralar uchun tinglash va gapirishni tekshiring.',
    },
    accounting_audit: {
      metaTitle: 'Buxgalteriya va audit uchun ingliz tili darajasi | Schood', metaDescription: 'Buxgalter yordamchilari, buxgalterlar va audit rahbarlari uchun tavsiya etilgan darajalar.',
      title: 'Buxgalteriya va auditga qanday ingliz tili kerak?', lead: 'Hujjatlar va dalillar haqida muloqotni tekshiring. Ingliz tili darajasi kasbiy bilim va malakadan alohida baholanadi.',
      positions: [{ name: 'Buxgalter yordamchisi', level: 'B1', why: 'Hisoblarni tekshiradi va yetishmayotgan hujjatlarni so‘raydi.' }, { name: 'Xalqaro jamoaga hisobot beruvchi buxgalter', level: 'B2', why: 'Solishtirishlarni tushuntiradi va auditor savollariga javob beradi.' }, { name: 'Audit yoki moliya rahbari', level: 'C1', why: 'Xulosalar, mulohazalar va nozik tafovutlarni muhokama qiladi.' }],
      tasks: ['Tasdiqlovchi hujjatlarni so‘rash', 'Solishtirishdagi tafovutni tushuntirish', 'Xulosa va kelishilgan chorani qisqacha yozish'], test: 'Dalillarni o‘qish va aniq yozma tushuntirishga e’tibor bering. Audit suhbatlari va rahbariyatga hisobot uchun gapirishni ham qo‘shing.',
    },
  },
};
