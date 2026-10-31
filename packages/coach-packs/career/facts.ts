import type { FactDataset } from '../src/types.ts';

// Curated, dated facts for student-visa interview practice. Each dataset holds only
// statements confirmed on its official page on the check date, with that page as the
// source; the coach (persona and assessor) may state no other rule, document, fee or
// date, and the learner always sees the check date and the official link. Check every
// statement again on its source page before the check date is 90 days old, and update
// `checkedAt`.
//
// Left out because they could not be confirmed on an official page on 2026-10-30
// (travel.state.gov answers automated fetches with 403 Forbidden; still 403 on 2026-10-31):
//   [VERIFY] US: the documents to bring to the visa interview (passport validity, DS-160
//            confirmation page, visa fee receipt, photo) — travel.state.gov student visa page.
//   [VERIFY] US: documents a consular officer may request (transcripts, test scores,
//            evidence of intent to depart, how you will pay) — travel.state.gov; the
//            Study in the States post of 2018-08-08 says the same but warns it may be outdated.
//   [VERIFY] US: how many days before the programme start date an F-1 visa can be issued.
//   [VERIFY] US: the visa application (MRV) fee amount.
//   [VERIFY] UK: whether and when a credibility interview is held (no gov.uk page fetched says).
//   [VERIFY] UK: the documents needed in English or translated (the documents page fetched does not say).

const CHECKED = '2026-10-30';
const MAX_AGE = 90;

export const facts: FactDataset[] = [
  {
    id: 'us-student-i20', topic: 'US student visa: the Form I-20', checkedAt: CHECKED, maxAgeDays: MAX_AGE,
    title: { en: 'US student visa: the Form I-20', uz: 'AQSh talabalik vizasi: I-20 shakli', ru: 'Студенческая виза США: форма I-20' },
    source: { name: 'Study in the States (U.S. Department of Homeland Security)', url: 'https://studyinthestates.dhs.gov/students/prepare/students-and-the-form-i-20' },
    entries: [
      {
        id: 'i20_needed',
        statement: {
          en: 'All F and M students who study in the United States need a Form I-20, "Certificate of Eligibility for Nonimmigrant Student Status".',
          uz: 'AQShda o‘qiydigan barcha F va M toifali talabalarga I-20 shakli — «Nonimmigrant talaba maqomiga muvofiqlik sertifikati» kerak.',
          ru: 'Всем студентам категорий F и M, которые учатся в США, нужна форма I-20 — «Certificate of Eligibility for Nonimmigrant Student Status».',
        },
      },
      {
        id: 'i20_issued_by',
        statement: {
          en: 'Students receive the Form I-20 from their designated school official (DSO) after acceptance at an SEVP-certified school; the DSO and the student both sign it.',
          uz: 'Talaba I-20 shaklini SEVP sertifikatiga ega maktabga qabul qilingach, maktabning mas’ul xodimi (DSO)dan oladi; uni DSO va talaba imzolaydi.',
          ru: 'Форму I-20 студент получает от уполномоченного сотрудника школы (DSO) после зачисления в школу с сертификацией SEVP; её подписывают и DSO, и студент.',
        },
      },
      {
        id: 'i20_at_interview',
        statement: {
          en: 'The student visa type must match the Form I-20, and students are expected to have the original Form I-20 at the visa interview.',
          uz: 'Talabalik vizasi turi I-20 shakliga mos bo‘lishi kerak; viza suhbatiga I-20 shaklining asl nusxasini olib borishingiz kutiladi.',
          ru: 'Тип студенческой визы должен соответствовать форме I-20; на визовом собеседовании ожидается оригинал формы I-20.',
        },
      },
      {
        id: 'i20_fee_info',
        statement: {
          en: 'Information from the Form I-20 is needed to pay the I-901 SEVIS fee, so the form comes first.',
          uz: 'I-901 SEVIS to‘lovini amalga oshirish uchun I-20 shaklidagi ma’lumotlar kerak, shuning uchun avval shaklni olish lozim.',
          ru: 'Для оплаты сбора I-901 SEVIS нужны данные из формы I-20, поэтому сначала нужна сама форма.',
        },
      },
      {
        id: 'i20_at_entry',
        statement: {
          en: 'Students are expected to have the signed Form I-20 on hand (not packed in luggage) when entering the United States; a Customs and Border Protection officer asks for it at the port of entry.',
          uz: 'AQShga kirishda imzolangan I-20 shakli qo‘l ostida (yukda emas) bo‘lishi kutiladi; kirish punktida AQSh Bojxona va chegara himoyasi xizmati (CBP) xodimi uni so‘raydi.',
          ru: 'При въезде в США подписанная форма I-20 должна быть при себе (не в багаже); на пункте въезда её запрашивает сотрудник Службы таможни и охраны границ США (CBP).',
        },
      },
    ],
  },
  {
    id: 'us-sevis-fee', topic: 'US student visa: the I-901 SEVIS fee', checkedAt: CHECKED, maxAgeDays: MAX_AGE,
    title: { en: 'US student visa: the I-901 SEVIS fee', uz: 'AQSh talabalik vizasi: I-901 SEVIS to‘lovi', ru: 'Студенческая виза США: сбор I-901 SEVIS' },
    source: { name: 'U.S. Immigration and Customs Enforcement', url: 'https://www.ice.gov/sevis/i901' },
    entries: [
      {
        id: 'fee_amount',
        statement: {
          en: 'The I-901 SEVIS fee for F or M visa applicants (full payment) is $350.',
          uz: 'F yoki M vizasiga ariza beruvchilar uchun I-901 SEVIS to‘lovi (to‘liq to‘lov) 350 AQSh dollari.',
          ru: 'Сбор I-901 SEVIS для заявителей на визы F или M (полная оплата) — 350 долларов США.',
        },
      },
      {
        id: 'fee_separate',
        statement: {
          en: 'The I-901 SEVIS fee is separate from visa fees and from school SEVIS administration fees.',
          uz: 'I-901 SEVIS to‘lovi viza to‘lovlaridan ham, maktabning SEVIS ma’muriy to‘lovlaridan ham alohida.',
          ru: 'Сбор I-901 SEVIS оплачивается отдельно от визовых сборов и от административных сборов школы за SEVIS.',
        },
      },
      {
        id: 'fee_payment',
        statement: {
          en: 'The fee can be paid in U.S. dollars by credit card on fmjfee.com, or by check, money order or Western Union.',
          uz: 'To‘lovni fmjfee.com saytida AQSh dollarida kredit karta orqali, yoki chek, pul o‘tkazmasi (money order) yoxud Western Union orqali amalga oshirish mumkin.',
          ru: 'Сбор можно оплатить в долларах США кредитной картой на fmjfee.com, а также чеком, денежным переводом (money order) или через Western Union.',
        },
      },
    ],
  },
  {
    id: 'us-student-arrival', topic: 'US student visa: first arrival', checkedAt: CHECKED, maxAgeDays: MAX_AGE,
    title: { en: 'US student visa: first arrival', uz: 'AQSh talabalik vizasi: birinchi marta kirish', ru: 'Студенческая виза США: первый въезд' },
    source: { name: 'Study in the States (U.S. Department of Homeland Security), 27 July 2026', url: 'https://studyinthestates.dhs.gov/2026/07/first-time-arrival-key-information-for-new-students-traveling-to-the-us' },
    entries: [
      {
        id: 'arrive_30_days',
        statement: {
          en: 'A new student may enter the United States up to 30 days before the Program Start Date listed on their signed Form I-20.',
          uz: 'Yangi talaba AQShga imzolangan I-20 shaklida ko‘rsatilgan dastur boshlanish sanasidan (Program Start Date) ko‘pi bilan 30 kun oldin kirishi mumkin.',
          ru: 'Новый студент может въехать в США не ранее чем за 30 дней до даты начала программы (Program Start Date), указанной в подписанной форме I-20.',
        },
      },
      {
        id: 'arrive_documents',
        statement: {
          en: 'At primary inspection a new student shows a valid passport, a valid visa and a signed Form I-20, and should have proof of payment of the I-901 SEVIS fee on hand; these belong in carry-on luggage.',
          uz: 'Birlamchi tekshiruvda yangi talaba amaldagi pasport, amaldagi viza va imzolangan I-20 shaklini ko‘rsatadi, I-901 SEVIS to‘lovi tasdig‘i ham yonida bo‘lishi kerak; bular qo‘l yukida bo‘lishi lozim.',
          ru: 'На первичном досмотре новый студент предъявляет действующий паспорт, действующую визу и подписанную форму I-20, а подтверждение оплаты I-901 SEVIS должно быть под рукой; всё это нужно держать в ручной клади.',
        },
      },
    ],
  },
  {
    id: 'uk-student-visa', topic: 'UK Student visa: who can apply, when, fees', checkedAt: CHECKED, maxAgeDays: MAX_AGE,
    title: { en: 'UK Student visa: the basics', uz: 'Buyuk Britaniya talabalik vizasi: asosiy qoidalar', ru: 'Студенческая виза Великобритании: основное' },
    source: { name: 'GOV.UK', url: 'https://www.gov.uk/student-visa' },
    entries: [
      {
        id: 'who',
        statement: {
          en: 'You can apply for a Student visa if you are 16 or over, have been offered a place on a course by a licensed student sponsor, have enough money to support yourself and pay for your course, and can speak, read, write and understand English. Applicants aged 16 or 17 also need parental consent.',
          uz: 'Talabalik vizasiga 16 yosh va undan katta bo‘lsangiz, litsenziyaga ega talaba homiysi (o‘quv muassasasi) kursga joy taklif qilgan bo‘lsa, o‘zingizni ta’minlash va kurs uchun to‘lash uchun yetarli pulingiz bo‘lsa hamda ingliz tilida gapira, o‘qiy, yoza va tushuna olsangiz, ariza berishingiz mumkin. 16–17 yoshdagilarga ota-ona roziligi ham kerak.',
          ru: 'Подать на Student visa можно, если вам 16 лет или больше, лицензированный спонсор (учебное заведение) предложил вам место на курсе, у вас достаточно денег на жизнь и оплату курса и вы говорите, читаете, пишете и понимаете по-английски. Заявителям 16–17 лет нужно также согласие родителей.',
        },
      },
      {
        id: 'when',
        statement: {
          en: 'From outside the UK, the earliest you can apply is 6 months before your course starts, and you will usually get a decision within 3 weeks.',
          uz: 'Buyuk Britaniyadan tashqarida bo‘lsangiz, ariza berishning eng erta muddati — kurs boshlanishidan 6 oy oldin; qaror odatda 3 hafta ichida chiqadi.',
          ru: 'Из-за пределов Великобритании подать заявление можно не раньше чем за 6 месяцев до начала курса; решение обычно приходит в течение 3 недель.',
        },
      },
      {
        id: 'fee',
        statement: {
          en: 'It costs £558 to apply for a Student visa from outside the UK, and you also pay the healthcare surcharge as part of the application.',
          uz: 'Buyuk Britaniyadan tashqaridan talabalik vizasiga ariza berish 558 funt sterling turadi; arizaning bir qismi sifatida tibbiy xizmat yig‘imi (healthcare surcharge) ham to‘lanadi.',
          ru: 'Подача заявления на Student visa из-за пределов Великобритании стоит £558; кроме того, в рамках заявления оплачивается медицинский сбор (healthcare surcharge).',
        },
      },
      {
        id: 'arrival',
        statement: {
          en: 'You can arrive up to 1 week before your course if it lasts 6 months or less, or up to 1 month before if it lasts more than 6 months, but never before the start date on your visa.',
          uz: 'Kurs 6 oy yoki undan qisqa bo‘lsa, boshlanishidan ko‘pi bilan 1 hafta oldin, 6 oydan uzun bo‘lsa, ko‘pi bilan 1 oy oldin kelishingiz mumkin, lekin vizangizda ko‘rsatilgan boshlanish sanasidan oldin kelish mumkin emas.',
          ru: 'Приехать можно не раньше чем за 1 неделю до курса, если он длится 6 месяцев или меньше, и не раньше чем за 1 месяц, если дольше 6 месяцев, но в любом случае не раньше даты начала, указанной в визе.',
        },
      },
    ],
  },
  {
    id: 'uk-student-money', topic: 'UK Student visa: money for living costs', checkedAt: CHECKED, maxAgeDays: MAX_AGE,
    title: { en: 'UK Student visa: money you need', uz: 'Buyuk Britaniya talabalik vizasi: kerakli mablag‘', ru: 'Студенческая виза Великобритании: нужные средства' },
    source: { name: 'GOV.UK', url: 'https://www.gov.uk/student-visa/money' },
    entries: [
      {
        id: 'living_costs',
        statement: {
          en: 'For living costs you need £1,529 a month (for up to 9 months) for courses in London, or £1,171 a month (for up to 9 months) for courses outside London.',
          uz: 'Yashash xarajatlari uchun Londondagi kurslarda oyiga 1 529 funt (ko‘pi bilan 9 oy uchun), Londondan tashqaridagi kurslarda oyiga 1 171 funt (ko‘pi bilan 9 oy uchun) kerak.',
          ru: 'На проживание нужно £1 529 в месяц (максимум за 9 месяцев) для курсов в Лондоне или £1 171 в месяц (максимум за 9 месяцев) для курсов вне Лондона.',
        },
      },
      {
        id: 'held_28_days',
        statement: {
          en: 'You must have this money for at least 28 days in a row, and the end of that 28-day period must be within 31 days of the date you apply.',
          uz: 'Bu pul kamida ketma-ket 28 kun hisobingizda turishi kerak va o‘sha 28 kunlik davrning oxiri ariza bergan kuningizdan 31 kun ichida bo‘lishi lozim.',
          ru: 'Эти деньги должны быть у вас не меньше 28 дней подряд, а конец этого 28-дневного периода должен быть в пределах 31 дня до даты подачи заявления.',
        },
      },
      {
        id: 'uk_12_months',
        statement: {
          en: 'You do not need to prove the money if you have been living in the UK with a visa for at least 12 months before the date of your Student visa application.',
          uz: 'Talabalik vizasiga ariza berish sanasigacha kamida 12 oy Buyuk Britaniyada viza bilan yashagan bo‘lsangiz, mablag‘ni isbotlash shart emas.',
          ru: 'Подтверждать средства не нужно, если до даты подачи заявления на Student visa вы прожили в Великобритании по визе не меньше 12 месяцев.',
        },
      },
    ],
  },
  {
    id: 'uk-student-english', topic: 'UK Student visa: English level', checkedAt: CHECKED, maxAgeDays: MAX_AGE,
    title: { en: 'UK Student visa: English you need', uz: 'Buyuk Britaniya talabalik vizasi: ingliz tili darajasi', ru: 'Студенческая виза Великобритании: уровень английского' },
    source: { name: 'GOV.UK', url: 'https://www.gov.uk/student-visa/knowledge-of-english' },
    entries: [
      {
        id: 'level',
        statement: {
          en: 'The English needed is equivalent to CEFR level B2 for study at degree level or above, and CEFR level B1 below degree level.',
          uz: 'Bakalavr va undan yuqori darajadagi o‘qish uchun ingliz tili CEFR B2 ga, bakalavrdan past darajada esa CEFR B1 ga teng bo‘lishi kerak.',
          ru: 'Нужен английский уровня CEFR B2 для обучения на уровне бакалавриата и выше и CEFR B1 — ниже уровня бакалавриата.',
        },
      },
      {
        id: 'how',
        statement: {
          en: 'At degree level or above, your Higher Education Provider can assess your English itself (it must still meet B2); without qualifications that prove your English, you must pass a Secure English Language Test (SELT) from an approved provider.',
          uz: 'Bakalavr va undan yuqori darajada oliy ta’lim muassasangiz ingliz tilingizni o‘zi baholashi mumkin (baribir B2 talab qilinadi); ingliz tilingizni tasdiqlovchi malakangiz bo‘lmasa, tasdiqlangan provayderning Secure English Language Test (SELT) imtihonidan o‘tishingiz kerak.',
          ru: 'На уровне бакалавриата и выше ваш вуз может сам оценить ваш английский (но всё равно нужен B2); если квалификаций, подтверждающих английский, нет, нужно сдать Secure English Language Test (SELT) у одобренного провайдера.',
        },
      },
    ],
  },
  {
    id: 'uk-student-documents', topic: 'UK Student visa: documents', checkedAt: CHECKED, maxAgeDays: MAX_AGE,
    title: { en: 'UK Student visa: documents', uz: 'Buyuk Britaniya talabalik vizasi: hujjatlar', ru: 'Студенческая виза Великобритании: документы' },
    source: { name: 'GOV.UK', url: 'https://www.gov.uk/student-visa/documents-you-must-provide' },
    entries: [
      {
        id: 'must',
        statement: {
          en: 'You must provide a current passport or other valid travel document, and a Confirmation of Acceptance for Studies (CAS) from your course provider.',
          uz: 'Amaldagi pasport yoki boshqa haqiqiy yo‘l hujjati hamda kurs provayderingizdan Confirmation of Acceptance for Studies (CAS) taqdim etishingiz shart.',
          ru: 'Обязательно нужны действующий паспорт или другой действительный проездной документ и Confirmation of Acceptance for Studies (CAS) от учебного заведения.',
        },
      },
      {
        id: 'may',
        statement: {
          en: 'Depending on your circumstances you may also need: proof of enough money, a valid ATAS certificate if your course and nationality require it, your tuberculosis test results, proof of parental or legal guardian consent if you are under 18, and written consent from a financial sponsor who paid your fees and living costs in the last 12 months.',
          uz: 'Vaziyatingizga qarab yana kerak bo‘lishi mumkin: yetarli mablag‘ dalili, kurs va fuqaroligingiz talab qilsa amaldagi ATAS sertifikati, sil (tuberkulyoz) testi natijalari, 18 yoshga to‘lmagan bo‘lsangiz ota-ona yoki vasiy roziligi, so‘nggi 12 oyda to‘lovlaringiz va yashash xarajatlaringizni qoplagan moliyaviy homiyning yozma roziligi.',
          ru: 'В зависимости от обстоятельств могут понадобиться: подтверждение достаточных средств, действующий сертификат ATAS, если его требуют курс и гражданство, результаты теста на туберкулёз, согласие родителей или опекуна, если вам меньше 18, и письменное согласие финансового спонсора, оплачивавшего обучение и проживание в последние 12 месяцев.',
        },
      },
    ],
  },
  {
    id: 'uk-tb-test', topic: 'UK visa: tuberculosis test', checkedAt: CHECKED, maxAgeDays: MAX_AGE,
    title: { en: 'UK visa: the TB test', uz: 'Buyuk Britaniya vizasi: sil testi', ru: 'Виза Великобритании: тест на туберкулёз' },
    source: { name: 'GOV.UK', url: 'https://www.gov.uk/tb-test-visa' },
    entries: [
      {
        id: 'who',
        statement: {
          en: 'You need a tuberculosis (TB) test if you are coming to the UK for 6 months or more, you have lived in one of the listed countries for 6 months or more, and you were living there (or in another listed country) within the last 6 months.',
          uz: 'Buyuk Britaniyaga 6 oy yoki undan uzoqroq muddatga kelayotgan bo‘lsangiz, ro‘yxatdagi mamlakatlardan birida 6 oy yoki undan ko‘p yashagan bo‘lsangiz va so‘nggi 6 oy ichida o‘sha yerda (yoki ro‘yxatdagi boshqa mamlakatda) yashagan bo‘lsangiz, sil (TB) testidan o‘tishingiz kerak.',
          ru: 'Тест на туберкулёз нужен, если вы едете в Великобританию на 6 месяцев или дольше, прожили в одной из стран списка 6 месяцев или больше и жили там (или в другой стране списка) в последние 6 месяцев.',
        },
      },
      {
        id: 'certificate',
        statement: {
          en: 'The TB certificate is valid for 6 months from the date of your x-ray, and you include it with your UK visa application.',
          uz: 'Sil testi sertifikati rentgen kunidan boshlab 6 oy amal qiladi va uni Buyuk Britaniya vizasi arizasiga ilova qilasiz.',
          ru: 'Сертификат о тесте на туберкулёз действует 6 месяцев с даты рентгена; его прикладывают к заявлению на визу Великобритании.',
        },
      },
    ],
  },
  {
    id: 'uk-tb-countries', topic: 'UK visa: TB test countries', checkedAt: CHECKED, maxAgeDays: MAX_AGE,
    title: { en: 'UK visa: TB test for Uzbekistan', uz: 'Buyuk Britaniya vizasi: O‘zbekiston uchun sil testi', ru: 'Виза Великобритании: тест на туберкулёз для Узбекистана' },
    source: { name: 'GOV.UK', url: 'https://www.gov.uk/tb-test-visa/countries-where-you-need-a-tb-test-to-enter-the-uk' },
    entries: [
      {
        id: 'uzbekistan',
        statement: {
          en: 'Uzbekistan is on the list of countries where you need a TB test, and the test must be done at a clinic approved by the Home Office.',
          uz: 'O‘zbekiston sil testi talab qilinadigan mamlakatlar ro‘yxatida; test Buyuk Britaniya Ichki ishlar vazirligi (Home Office) tasdiqlagan klinikada topshirilishi kerak.',
          ru: 'Узбекистан входит в список стран, где нужен тест на туберкулёз; тест проходят в клинике, одобренной Home Office (МВД Великобритании).',
        },
      },
    ],
  },
  {
    id: 'uk-health-surcharge', topic: 'UK visa: immigration health surcharge', checkedAt: CHECKED, maxAgeDays: MAX_AGE,
    title: { en: 'UK visa: the health surcharge', uz: 'Buyuk Britaniya vizasi: tibbiy yig‘im', ru: 'Виза Великобритании: медицинский сбор' },
    source: { name: 'GOV.UK', url: 'https://www.gov.uk/healthcare-immigration-application/how-much-pay' },
    entries: [
      {
        id: 'student_rate',
        statement: {
          en: 'The immigration health surcharge is £776 per year for students, their dependants and Youth Mobility Scheme visa holders (£1,035 per year for other applications).',
          uz: 'Immigratsiya tibbiy yig‘imi talabalar, ularning qaramog‘idagilar va Youth Mobility Scheme vizasi egalari uchun yiliga 776 funt (boshqa arizalar uchun yiliga 1 035 funt).',
          ru: 'Иммиграционный медицинский сбор — £776 в год для студентов, их иждивенцев и обладателей визы Youth Mobility Scheme (£1 035 в год для остальных заявлений).',
        },
      },
    ],
  },
];

export const US_VISA_FACTS = ['us-student-i20', 'us-sevis-fee', 'us-student-arrival'];
export const UK_VISA_FACTS = ['uk-student-visa', 'uk-student-money', 'uk-student-english', 'uk-student-documents'];
export const UK_DOCUMENT_FACTS = ['uk-student-documents', 'uk-student-money', 'uk-tb-test', 'uk-tb-countries', 'uk-health-surcharge'];
