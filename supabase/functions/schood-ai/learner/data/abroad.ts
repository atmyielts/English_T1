// Study-abroad requirements (L16): the only facts the copilot may state.
// Each entry names its official source and the date someone checked it there.
// `checked: null` means it was NOT verified: the app shows it as "check on the
// official site" with the source link, never as a fact. Update the date (and the
// text) only after reading the source again. Never add an entry from memory.

export type Country = 'uk' | 'us' | 'de' | 'kr' | 'tr';
export type StudyLevel = 'school' | 'foundation' | 'bachelor' | 'master' | 'phd';
export interface AbroadEntry {
  id: string;
  country: Country;
  topic: 'visa' | 'english' | 'documents' | 'money' | 'timeline' | 'scholarship';
  levels: readonly StudyLevel[];
  fact: { en: string; uz: string; ru: string };
  source: string;
  /** YYYY-MM-DD when verified on the source; null when not verified. */
  checked: string | null;
}

const DEGREE: StudyLevel[] = ['foundation', 'bachelor', 'master', 'phd'];
const ALL: StudyLevel[] = ['school', 'foundation', 'bachelor', 'master', 'phd'];

export const ABROAD_DATA_VERSION = '2026-10-30';
export const ABROAD: readonly AbroadEntry[] = [
  {
    id: 'uk.visa.who', country: 'uk', topic: 'visa', levels: DEGREE,
    fact: {
      en: 'You can apply for a UK Student visa if you are 16 or over, want to study a further or higher education course in the UK, and have been offered a place by a licensed student sponsor.',
      uz: 'Agar 16 yoshdan katta boʻlsangiz, Buyuk Britaniyada oliy yoki qoʻshimcha ta’lim kursida oʻqimoqchi boʻlsangiz va litsenziyali homiy-oʻquv yurti sizga joy taklif qilgan boʻlsa, Student vizasiga ariza berishingiz mumkin.',
      ru: 'Подать на студенческую визу Великобритании (Student visa) можно с 16 лет, если вы хотите учиться на курсе дальнейшего или высшего образования и получили предложение места от лицензированного учебного спонсора.',
    },
    source: 'https://www.gov.uk/student-visa', checked: '2026-10-30',
  },
  {
    id: 'uk.visa.when', country: 'uk', topic: 'timeline', levels: DEGREE,
    fact: {
      en: 'From outside the UK you can apply for the Student visa up to 6 months before your course starts.',
      uz: 'Buyuk Britaniyadan tashqarida Student vizasiga kurs boshlanishidan 6 oy oldin ariza berish mumkin.',
      ru: 'Находясь вне Великобритании, подать на Student visa можно не раньше чем за 6 месяцев до начала курса.',
    },
    source: 'https://www.gov.uk/student-visa', checked: '2026-10-30',
  },
  {
    id: 'uk.visa.fee', country: 'uk', topic: 'money', levels: DEGREE,
    fact: {
      en: 'The Student visa application fee from outside the UK was £558 when checked (fees change; check before you pay).',
      uz: 'Tekshirilgan paytda Buyuk Britaniyadan tashqaridan Student vizasi uchun ariza toʻlovi £558 edi (toʻlovlar oʻzgaradi, toʻlashdan oldin tekshiring).',
      ru: 'На момент проверки сбор за подачу на Student visa из-за пределов Великобритании составлял £558 (сборы меняются, проверьте перед оплатой).',
    },
    source: 'https://www.gov.uk/student-visa', checked: '2026-10-30',
  },
  {
    id: 'uk.english.level', country: 'uk', topic: 'english', levels: DEGREE,
    fact: {
      en: 'For the Student visa, English must be equivalent to CEFR B2 for degree level or above, and B1 below degree level. A university can assess your English itself, but it must still be equivalent to B2 for degree level; universities may ask for higher scores.',
      uz: 'Student vizasi uchun ingliz tili bakalavr va undan yuqori daraja uchun CEFR B2 ga, undan past daraja uchun B1 ga teng boʻlishi kerak. Universitet tilingizni oʻzi baholashi mumkin, lekin daraja baribir B2 ga teng boʻlishi shart; universitetlar yuqoriroq ball talab qilishi mumkin.',
      ru: 'Для Student visa английский должен соответствовать CEFR B2 для уровня бакалавриата и выше и B1 для более низкого уровня. Вуз может сам оценить ваш английский, но он всё равно должен соответствовать B2; вузы могут требовать более высокие баллы.',
    },
    source: 'https://www.gov.uk/student-visa/knowledge-of-english', checked: '2026-10-30',
  },
  {
    id: 'uk.money.living', country: 'uk', topic: 'money', levels: DEGREE,
    fact: { en: 'You usually need to show money for course fees and living costs.', uz: 'Odatda oʻqish toʻlovi va yashash xarajatlari uchun mablagʻingizni koʻrsatish kerak.', ru: 'Обычно нужно показать деньги на оплату обучения и проживание.' },
    source: 'https://www.gov.uk/student-visa/money', checked: null,
  },
  {
    id: 'us.i20', country: 'us', topic: 'documents', levels: ALL,
    fact: {
      en: 'All F and M students who study in the United States need a Form I-20 from an SEVP-certified school. You bring the original Form I-20 to your visa interview.',
      uz: 'AQShda oʻqiydigan barcha F va M talabalarga SEVP sertifikatiga ega maktabdan Form I-20 kerak. Viza suhbatiga Form I-20 ning asl nusxasini olib borasiz.',
      ru: 'Всем студентам F и M, обучающимся в США, нужна форма I-20 от школы с сертификатом SEVP. Оригинал I-20 нужно взять на визовое собеседование.',
    },
    source: 'https://studyinthestates.dhs.gov/students/prepare/students-and-the-form-i-20', checked: '2026-10-30',
  },
  {
    id: 'us.sevis', country: 'us', topic: 'money', levels: ALL,
    fact: {
      en: 'After you receive the Form I-20 you pay the I-901 SEVIS fee; it is mandatory and must be paid before you enter the United States.',
      uz: 'Form I-20 ni olgandan keyin I-901 SEVIS toʻlovini toʻlaysiz; u majburiy va AQShga kirishdan oldin toʻlanishi kerak.',
      ru: 'После получения I-20 оплачивается сбор I-901 SEVIS; он обязателен и должен быть оплачен до въезда в США.',
    },
    source: 'https://studyinthestates.dhs.gov/students/prepare/students-and-the-form-i-20', checked: '2026-10-30',
  },
  {
    id: 'us.entry', country: 'us', topic: 'timeline', levels: ALL,
    fact: {
      en: 'The Form I-20 lists your program start date; you may enter the United States up to 30 days before it.',
      uz: 'Form I-20 da dastur boshlanish sanasi koʻrsatiladi; AQShga undan 30 kungacha oldin kirish mumkin.',
      ru: 'В форме I-20 указана дата начала программы; въехать в США можно не ранее чем за 30 дней до неё.',
    },
    source: 'https://studyinthestates.dhs.gov/students/prepare/students-and-the-form-i-20', checked: '2026-10-30',
  },
  {
    id: 'us.english', country: 'us', topic: 'english', levels: DEGREE,
    fact: { en: 'Each US school sets its own English test and score requirements.', uz: 'Har bir AQSh oʻquv yurti ingliz tili testi va ballini oʻzi belgilaydi.', ru: 'Каждый вуз США сам устанавливает требования к тесту по английскому и баллам.' },
    source: 'https://studyinthestates.dhs.gov/', checked: null,
  },
  {
    id: 'us.ds160', country: 'us', topic: 'visa', levels: ALL,
    fact: { en: 'The student visa is applied for online (DS-160) followed by an interview at a US embassy or consulate.', uz: 'Talaba vizasiga onlayn (DS-160) ariza beriladi, soʻng AQSh elchixonasi yoki konsulligida suhbat boʻladi.', ru: 'Студенческая виза оформляется через онлайн-анкету DS-160 и собеседование в посольстве или консульстве США.' },
    source: 'https://travel.state.gov/content/travel/en/us-visas/study/student-visa.html', checked: null,
  },
  {
    id: 'de.visa', country: 'de', topic: 'visa', levels: DEGREE,
    fact: { en: 'Students from outside the EU usually need a national visa to study in Germany, applied for at the German mission in their country.', uz: 'Yevropa Ittifoqidan tashqaridagi talabalarga odatda Germaniyada oʻqish uchun milliy viza kerak; unga oʻz mamlakatidagi Germaniya vakolatxonasida ariza beriladi.', ru: 'Студентам из стран вне ЕС для учёбы в Германии обычно нужна национальная виза, которую оформляют в немецком представительстве своей страны.' },
    source: 'https://www.auswaertiges-amt.de/en/visa-service', checked: null,
  },
  {
    id: 'de.money', country: 'de', topic: 'money', levels: DEGREE,
    fact: { en: 'You need proof of money for living costs, often a blocked account; the required amount is set each year.', uz: 'Yashash xarajatlari uchun mablagʻ isboti kerak, koʻpincha bloklangan hisob; talab qilinadigan summa har yili belgilanadi.', ru: 'Нужно подтверждение средств на проживание, часто через блокированный счёт; требуемая сумма устанавливается ежегодно.' },
    source: 'https://www.study-in-germany.de/en/plan-your-studies/requirements/proof-of-financial-resources/', checked: null,
  },
  {
    id: 'kr.visa', country: 'kr', topic: 'visa', levels: DEGREE,
    fact: { en: 'Degree students in Korea usually hold a D-2 student visa; Korean language students a D-4 visa.', uz: 'Koreyada daraja uchun oʻqiydigan talabalar odatda D-2 vizasida, koreys tili kurslari talabalari D-4 vizasida boʻladi.', ru: 'Студенты программ с получением степени в Корее обычно получают визу D-2, студенты языковых курсов — D-4.' },
    source: 'https://www.studyinkorea.go.kr/', checked: null,
  },
  {
    id: 'kr.gks', country: 'kr', topic: 'scholarship', levels: ['bachelor', 'master', 'phd'],
    fact: { en: 'The Global Korea Scholarship (GKS) is announced each year with its own dates and rules.', uz: 'Global Korea Scholarship (GKS) har yili oʻz muddatlari va qoidalari bilan e’lon qilinadi.', ru: 'Стипендия Global Korea Scholarship (GKS) объявляется каждый год со своими сроками и правилами.' },
    source: 'https://www.studyinkorea.go.kr/', checked: null,
  },
  {
    id: 'tr.burslari', country: 'tr', topic: 'scholarship', levels: ['bachelor', 'master', 'phd'],
    fact: {
      en: 'Türkiye Scholarships (Türkiye Bursları) covers associate, bachelor\'s, master\'s, PhD and research degrees; its support includes a monthly stipend, accommodation, a Turkish language course, health insurance and flight tickets, and it places students at a university.',
      uz: 'Türkiye Bursları (Turkiya granti) assotsiat, bakalavr, magistr, PhD va tadqiqot darajalarini qamrab oladi; oylik stipendiya, yotoqxona, turk tili kursi, tibbiy sugʻurta va aviachiptalarni oʻz ichiga oladi hamda talabani universitetga joylashtiradi.',
      ru: 'Türkiye Bursları (стипендия Турции) охватывает программы ассоциированной степени, бакалавриата, магистратуры, PhD и исследований; поддержка включает ежемесячную стипендию, проживание, курс турецкого языка, медицинскую страховку и авиабилеты, а также распределение в университет.',
    },
    source: 'https://www.turkiyeburslari.gov.tr/en', checked: '2026-10-30',
  },
];

export const COUNTRIES: readonly Country[] = ['uk', 'us', 'de', 'kr', 'tr'];
export const entriesFor = (countries: readonly Country[], level: StudyLevel) => ABROAD.filter((entry) => countries.includes(entry.country) && entry.levels.includes(level));
