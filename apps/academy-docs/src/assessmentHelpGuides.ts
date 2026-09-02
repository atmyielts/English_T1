// Keep the same section IDs across languages so shared links survive a language switch.
export const assessmentHelpGuides = {
  en: [
    {
      id: 'assessment-learner',
      title: 'Your first assessment: sign in, submit, and read your report',
      intro: 'For learners and applicants. Your center must register you for a session using your own email. Taking a placement assessment does not require paid enrollment.',
      steps: [
        'Open Academy and sign in with the email your center recorded. Choose the correct academy, enter its learning workspace, and open My assessments. If you also manage the academy, choose Learn rather than Manage.',
        'Find your session and check its date, room, instructions and time allowance. Contact the exam desk about any agreed extra time before starting. Complete check-in if your center requires it.',
        'Choose Start assessment only when you are ready. Your timer starts then; it does not restart after a reload. The earlier of your personal deadline and the session closing time applies.',
        'Answer the questions and watch for Answers saved. Keep your connection available. If you need to reload, first check that saving has finished, then choose Continue assessment and confirm your answers are present.',
        'Choose Submit assessment and accept the confirmation. Wait for the message that your answers have been submitted. Awaiting teacher review means the center has your work; it is not a published result.',
        'When the center shares your result, refresh My assessments and choose View report. Read the skill results, evidence and next steps together. Not assessed means that skill was not tested—not that you scored zero.',
      ],
      tips: [
        'Your center can help with access and timing. Give them your candidate ID and session name, never your password or a copy of an identity document in a support message.',
        'If a mock-result certificate is issued, its verification link is private by default. Only enable sharing if you want anyone with that link to see your name, center and score. You can turn sharing off later.',
        'If something looks wrong, use the result review request in your report and explain what should be checked. This withdraws any certificate while the concern is investigated; it does not automatically change your score.',
      ],
    },
    {
      id: 'assessment-help',
      title: 'Assessment help: find the next safe step',
      intro: 'For the front desk, teachers and learners. Check the session and the person’s existing access before retrying. Do not create another student account or charge a package to solve a testing problem.',
      steps: [
        'No academy or no test? Confirm the signed-in email matches the student contact, the right academy is selected, and that contact is registered in this session. Use Contacts or Admissions for an applicant; do not enroll them in a paid group just to make the test appear.',
        'Start assessment is unavailable? Staff should check that the session is open, its start time has arrived, its closing time has not passed, and required check-in is complete. The learner then refreshes My assessments.',
        'A session will not open? Review the selected paper and save the content-review decision first. Check the session dates and capacity. A paper approved for supervised pilot use is still not a scientifically validated placement test.',
        'Answers are not saved? Keep the page open, restore the connection and use Save answers before the deadline. Wait for confirmation. Tell the exam desk if saving still fails; answers not received before the deadline cannot be promised as recovered.',
        'A learner left without submitting? After the personal deadline or session closure, authorized staff can choose Collect saved answers. This submits only what was already saved; it does not grant more answering time.',
        'The report is still missing? The reviewer must save marks and evidence with Approve report for sharing, then choose Share report with student. Complete a required second-teacher review and resolve blocking integrity concerns or appeals first. The learner refreshes to see the shared report.',
        'A certificate is private or withdrawn? Private means the learner has not allowed public viewing. Withdrawn means it is no longer valid; sharing consent cannot restore it. Staff must resolve the concern, correct and share the report, and issue a new version when appropriate.',
      ],
      tips: [
        'Before a real exam day, rehearse the complete journey with clearly labeled test records: registration, check-in, answering, review and report sharing. Keep test records separate from real placement decisions and academic progress comparisons.',
        'For an already shared report, use Reopen report with a reason instead of silently replacing the result. The earlier report remains in history and its certificate is withdrawn.',
        'Registration, report sharing and certificate verification do not collect payment. Only use packages and fees when a charge or subscription allowance has actually been agreed.',
      ],
    },
  ],
  uz: [
    {
      id: 'assessment-learner',
      title: 'Birinchi baholash: kirish, topshirish va xulosani o‘qish',
      intro: 'O‘quvchi va talabgorlar uchun. Markaz sizni shaxsiy emailingiz bilan seansga ro‘yxatga olishi kerak. Darajani aniqlash uchun pullik kursga yozilish shart emas.',
      steps: [
        'Academyga markaz qayd etgan email bilan kiring. Kerakli akademiyaning o‘quvchi ish joyini tanlab, baholashlar bo‘limini oching. Agar shu akademiyani ham boshqarsangiz, boshqaruv emas, o‘qish ish joyini tanlang.',
        'Seans sanasi, xona, yo‘riqnoma va vaqt chegarasini tekshiring. Qo‘shimcha vaqt kerak bo‘lsa, boshlashdan oldin mas’ul bilan kelishing. Markaz talab qilsa, kelganingizni tasdiqlating.',
        'Faqat tayyor bo‘lganda baholashni boshlang. Taymer shu paytdan yuradi va sahifa yangilanganda qayta boshlanmaydi. Shaxsiy muddat yoki seans yopilishidan oldin kelgani amal qiladi.',
        'Savollarga javob bering va javoblar saqlangani haqidagi xabarni kuzating. Internetni yoqilgan holda saqlang. Sahifani yangilash kerak bo‘lsa, avval saqlash tugaganini tekshiring, so‘ng baholashni davom ettirib, javoblaringiz qolganiga ishonch hosil qiling.',
        'Baholashni topshirish tugmasini bosing va tasdiqlash oynasida rozilik bildiring. Javoblar yuborilgani haqidagi xabarni kuting. Ustoz tekshiruvi kutilayotgani ish markazga yetganini bildiradi, ammo natija hali ulashilmagan.',
        'Markaz natijani ulashgach, baholashlar bo‘limini yangilang va xulosani oching. Ko‘nikma natijalari, dalillar va keyingi qadamlarni birga o‘qing. Baholanmagan ko‘nikma nol ball degani emas.',
      ],
      tips: [
        'Kirish yoki vaqt bo‘yicha markazga murojaat qiling. Ishtirokchi raqami va seans nomini ayting; parol yoki shaxsni tasdiqlovchi hujjat nusxasini yordam xabariga qo‘shmang.',
        'Sinov natijasi sertifikati berilsa, tekshirish havolasi dastlab shaxsiy bo‘ladi. Havolani olgan har kim ismingiz, markazingiz va ballingizni ko‘rishiga rozi bo‘lsangizgina ulashishga ruxsat bering. Keyin ruxsatni o‘chirishingiz mumkin.',
        'Xatolik ko‘rsangiz, xulosada natijani qayta ko‘rish so‘rovini yuborib, nimani tekshirish kerakligini tushuntiring. Masala tekshirilayotganda sertifikat bekor qilinadi; ball avtomatik o‘zgarmaydi.',
      ],
    },
    {
      id: 'assessment-help',
      title: 'Baholashda yordam: keyingi to‘g‘ri qadam',
      intro: 'Qabul xodimlari, ustoz va o‘quvchilar uchun. Qayta urinishdan oldin seans va mavjud kirish huquqlarini tekshiring. Test muammosini hal qilish uchun boshqa o‘quvchi hisobi yoki pullik paket yaratmang.',
      steps: [
        'Akademiya yoki test ko‘rinmayaptimi? Kirilgan email o‘quvchi yozuvidagiga mosligini, to‘g‘ri akademiya tanlanganini va shu o‘quvchi seansga yozilganini tekshiring. Talabgor uchun Kontaktlar yoki Qabuldan foydalaning; testni ko‘rsatish uchungina pullik guruhga yozmang.',
        'Boshlash tugmasi faol emasmi? Xodim seans ochiqligi, boshlanish vaqti kelgani, yakun vaqti o‘tmagani va zarur kelish tasdig‘ini tekshiradi. So‘ng o‘quvchi baholashlar sahifasini yangilaydi.',
        'Seans ochilmayaptimi? Tanlangan topshiriqlarni ko‘rib chiqib, mazmun tekshiruvi qarorini saqlang. Sana va o‘rinlarni tekshiring. Nazoratli sinovga ruxsat berilishi test ilmiy tasdiqlanganini anglatmaydi.',
        'Javoblar saqlanmayaptimi? Sahifani ochiq qoldiring, internetni tiklang va muddat tugashidan oldin javoblarni saqlash tugmasini bosing. Tasdiqni kuting. Muammo qolsa, imtihon mas’uliga ayting; muddatgacha yetib kelmagan javoblar tiklanishi kafolatlanmaydi.',
        'O‘quvchi topshirmay chiqib ketdimi? Shaxsiy muddat tugagach yoki seans yopilgach, vakolatli xodim saqlangan javoblarni yig‘ishi mumkin. Faqat oldin saqlanganlari topshiriladi; bu qo‘shimcha javob berish vaqtini bermaydi.',
        'Xulosa hali ko‘rinmayaptimi? Ustoz ball va dalillarni saqlab, xulosani ulashishga tasdiqlaydi, keyin o‘quvchiga ulashadi. Talab qilingan ikkinchi tekshiruvni yakunlang, ulashishni to‘xtatgan halollik masalasi yoki e’tirozni hal qiling. O‘quvchi sahifani yangilaydi.',
        'Sertifikat shaxsiymi yoki bekor qilinganmi? Shaxsiy holat — o‘quvchi ommaviy ko‘rishga ruxsat bermagan. Bekor qilingan sertifikatni ulashish ruxsati tiklamaydi. Xodim masalani hal qilib, xulosani tuzatib ulashadi va zarur bo‘lsa yangi nusxa beradi.',
      ],
      tips: [
        'Haqiqiy imtihondan oldin aniq belgilangan sinov yozuvlari bilan butun jarayonni tekshiring: ro‘yxat, kelish tasdig‘i, javob, tekshiruv va xulosani ulashish. Sinov yozuvlarini haqiqiy kurs tanlash qarorlari va o‘quv rivoji taqqoslashlariga qo‘shmang.',
        'Ulashilgan natijani yashirincha almashtirmang. Sababini yozib, xulosani qayta oching. Oldingi nusxa tarixda qoladi va uning sertifikati bekor qilinadi.',
        'Ro‘yxatga olish, xulosa ulashish va sertifikat tekshirish pul qabul qilmaydi. Paket va to‘lovlardan faqat narx yoki abonement doirasidagi foydalanish kelishilganda foydalaning.',
      ],
    },
  ],
  ru: [
    {
      id: 'assessment-learner',
      title: 'Первое тестирование: вход, отправка и просмотр отчёта',
      intro: 'Для учеников и поступающих. Центр должен зарегистрировать вас в сессии с вашей личной почтой. Для определения уровня оплачивать зачисление не нужно.',
      steps: [
        'Войдите в Academy с почтой, которую указал центр. Выберите нужную академию, откройте учебное пространство и раздел оценок. Если вы также управляете академией, выберите обучение, а не управление.',
        'Найдите сессию и проверьте дату, аудиторию, инструкции и лимит времени. Согласуйте дополнительное время с экзаменационным пунктом до начала. Подтвердите прибытие, если центр этого требует.',
        'Начинайте работу только когда готовы. Таймер запускается в этот момент и не начинается заново после обновления страницы. Действует более ранний срок: личный лимит или закрытие сессии.',
        'Отвечайте на вопросы и следите за подтверждением сохранения. Поддерживайте подключение. Перед обновлением страницы дождитесь сохранения, затем продолжите работу и убедитесь, что ответы остались.',
        'Нажмите отправку работы и подтвердите действие в открывшемся окне. Дождитесь сообщения, что ответы отправлены. Ожидание проверки означает, что работа у центра, но результат ещё не опубликован.',
        'После публикации обновите раздел оценок и откройте отчёт. Читайте результаты по навыкам вместе с обоснованием и следующими шагами. Непроверенный навык не означает нулевой балл.',
      ],
      tips: [
        'По вопросам доступа и времени обратитесь в центр. Сообщите номер участника и название сессии, но не передавайте пароль или копию удостоверения личности в обращении.',
        'Если выдан сертификат пробного результата, ссылка проверки по умолчанию закрыта. Разрешайте просмотр только если согласны, чтобы любой получивший ссылку видел ваше имя, центр и балл. Позже разрешение можно отключить.',
        'Если заметили ошибку, запросите пересмотр в отчёте и объясните, что проверить. Сертификат отзывается на время рассмотрения; балл автоматически не меняется.',
      ],
    },
    {
      id: 'assessment-help',
      title: 'Помощь с тестированием: следующий безопасный шаг',
      intro: 'Для администратора, преподавателя и ученика. Перед повторной попыткой проверьте сессию и существующий доступ. Не создавайте другой аккаунт ученика и не начисляйте платный пакет для решения технической проблемы.',
      steps: [
        'Нет академии или теста? Сверьте почту входа с карточкой ученика, выбранную академию и регистрацию именно этой карточки в сессии. Для поступающего используйте Контакты или Приём; не зачисляйте в платную группу только ради доступа к тесту.',
        'Кнопка начала недоступна? Сотрудник проверяет, что сессия открыта, время начала наступило, срок закрытия не прошёл и обязательное прибытие подтверждено. Затем ученик обновляет раздел оценок.',
        'Сессия не открывается? Проверьте выбранные задания и сохраните решение о содержании. Сверьте даты и места. Разрешение на пилот под наблюдением не означает научную валидацию теста.',
        'Ответы не сохраняются? Оставьте страницу открытой, восстановите связь и сохраните ответы до окончания срока. Дождитесь подтверждения. Если не помогло, сообщите экзаменатору; восстановление ответов, не полученных до срока, нельзя гарантировать.',
        'Ученик ушёл без отправки? После личного срока или закрытия сессии уполномоченный сотрудник может собрать сохранённые ответы. Отправляется только уже сохранённое; дополнительного времени на ответы это не даёт.',
        'Отчёта ещё нет? Проверяющий сохраняет баллы и обоснование, одобряет отчёт для отправки, затем отдельно делится им с учеником. Завершите обязательную проверку вторым преподавателем и разрешите блокирующие вопросы добросовестности или апелляции. Ученик обновляет страницу.',
        'Сертификат закрыт или отозван? Закрытый доступ означает отсутствие согласия ученика на публичный просмотр. Отозванный сертификат недействителен; согласие на просмотр его не восстанавливает. Сотрудник разрешает обращение, исправляет и публикует отчёт, затем при необходимости выдаёт новую версию.',
      ],
      tips: [
        'До настоящего экзамена пройдите весь путь на явно обозначенных тестовых записях: регистрация, прибытие, ответы, проверка и публикация отчёта. Не включайте тестовые записи в реальные решения о курсе и сравнения учебного прогресса.',
        'Для опубликованного результата откройте пересмотр с объяснением причины вместо незаметной замены. Предыдущий отчёт сохраняется в истории, а его сертификат отзывается.',
        'Регистрация, публикация отчёта и проверка сертификата не принимают оплату. Используйте пакеты и начисления только после согласования стоимости или включения в абонемент.',
      ],
    },
  ],
};
