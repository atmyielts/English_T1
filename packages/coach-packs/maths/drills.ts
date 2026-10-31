import { T } from '../src/localize.ts';
import type { Drill, DrillItem } from '../src/types.ts';
import { arrange, type L } from './bank.ts';

// One drill per recurring error tag: six quick items that target exactly that slip.
// Fresh items may be generated and checked when these run out (aiVariants).

const item = (id: string, prompt: L | string, options: string[], answer: number, explanation: L): DrillItem =>
  ({ id, prompt: typeof prompt === 'string' ? prompt : T(prompt), options, answer, explanation });

function drill(tag: string, node: string, title: L & { en: string }, explain: L, items: DrillItem[]): Drill {
  return { id: `drill.${tag}`, kind: 'drill', node, levels: [0, 100], minutes: 6, errorTag: tag, title, explain, items: items.map((entry) => arrange(entry, `${tag}#${entry.id}`)), aiVariants: true };
}

export const drills: Drill[] = [
  drill('signs', 'numbers', { uz: 'Ishoralar', ru: 'Знаки', en: 'Signs' },
    { uz: 'Har bir misolda ishorani alohida aniqlang, keyin hisoblang.', ru: 'В каждом примере сначала определите знак, затем считайте.' }, [
      item('i1', '−3 − (−5) = ?', ['2', '−8', '−2', '8'], 0, { uz: 'Manfiy sonni ayirish — qo‘shish: −3 + 5 = 2.', ru: 'Вычесть отрицательное — значит прибавить: −3 + 5 = 2.' }),
      item('i2', '(−2) · (−3) · (−1) = ?', ['−6', '6', '−5', '5'], 0, { uz: 'Uchta manfiy ko‘paytuvchi — natija manfiy.', ru: 'Три отрицательных множителя — результат отрицательный.' }),
      item('i3', '−2² = ?', ['−4', '4', '−2', '2'], 0, { uz: 'Daraja faqat 2 ga tegishli: −(2²) = −4.', ru: 'Степень относится только к 2: −(2²) = −4.' }),
      item('i4', '5 − 8 + (−3) = ?', ['−6', '0', '−16', '6'], 0, { uz: '5 − 8 = −3, −3 − 3 = −6.', ru: '5 − 8 = −3, −3 − 3 = −6.' }),
      item('i5', { uz: '−(x − 3) ni oching.', ru: 'Раскройте −(x − 3).' }, ['−x + 3', '−x − 3', 'x − 3', 'x + 3'], 0, { uz: 'Minus qavs ichidagi har bir ishorani o‘zgartiradi.', ru: 'Минус меняет каждый знак в скобке.' }),
      item('i6', '7 − (2 − 9) = ?', ['14', '0', '−4', '4'], 0, { uz: '2 − 9 = −7, 7 − (−7) = 14.', ru: '2 − 9 = −7, 7 − (−7) = 14.' }),
    ]),
  drill('order_of_operations', 'numbers', { uz: 'Amallar tartibi', ru: 'Порядок действий', en: 'Order of operations' },
    { uz: 'Qavs → daraja → ko‘paytirish va bo‘lish (chapdan o‘ngga) → qo‘shish va ayirish.', ru: 'Скобки → степени → умножение и деление (слева направо) → сложение и вычитание.' }, [
      item('i1', '2 + 3 · 4 = ?', ['14', '20', '24', '9'], 0, { uz: 'Avval ko‘paytirish: 2 + 12 = 14.', ru: 'Сначала умножение: 2 + 12 = 14.' }),
      item('i2', '20 − 12 : 4 = ?', ['17', '2', '8', '4'], 0, { uz: '12 : 4 = 3, 20 − 3 = 17.', ru: '12 : 4 = 3, 20 − 3 = 17.' }),
      item('i3', '(2 + 3)² − 4 · 5 = ?', ['5', '105', '−7', '45'], 0, { uz: '25 − 20 = 5.', ru: '25 − 20 = 5.' }),
      item('i4', '18 : 3 · 2 = ?', ['12', '3', '9', '6'], 0, { uz: 'Chapdan o‘ngga: 6 · 2 = 12.', ru: 'Слева направо: 6 · 2 = 12.' }),
      item('i5', '2³ + 2 · 3 = ?', ['14', '30', '24', '12'], 0, { uz: '8 + 6 = 14.', ru: '8 + 6 = 14.' }),
      item('i6', '3 + 6 : 3 · 2 = ?', ['7', '4', '6', '9'], 0, { uz: '6 : 3 · 2 = 4, 3 + 4 = 7.', ru: '6 : 3 · 2 = 4, 3 + 4 = 7.' }),
    ]),
  drill('fractions', 'math.num.fractions', { uz: 'Kasrlar', ru: 'Дроби', en: 'Fractions' },
    { uz: 'Qo‘shish va ayirishda — umumiy maxraj, ko‘paytirishda — surat suratga, maxraj maxrajga, bo‘lishda — ikkinchi kasrni ag‘darib ko‘paytirish.', ru: 'При сложении и вычитании — общий знаменатель, при умножении — числитель на числитель, знаменатель на знаменатель, при делении — умножение на обратную дробь.' }, [
      item('i1', '1/2 + 1/3 = ?', ['5/6', '2/5', '1/5', '2/6'], 0, { uz: '3/6 + 2/6 = 5/6.', ru: '3/6 + 2/6 = 5/6.' }),
      item('i2', '2/3 · 3/4 = ?', ['1/2', '5/7', '6/7', '8/9'], 0, { uz: '6/12 = 1/2.', ru: '6/12 = 1/2.' }),
      item('i3', '3/4 : 3/8 = ?', ['2', '9/32', '1/2', '3/2'], 0, { uz: '3/4 · 8/3 = 2.', ru: '3/4 · 8/3 = 2.' }),
      item('i4', '1 − 2/7 = ?', ['5/7', '1/7', '−1/7', '3/7'], 0, { uz: '7/7 − 2/7 = 5/7.', ru: '7/7 − 2/7 = 5/7.' }),
      item('i5', '5/6 − 1/4 = ?', ['7/12', '4/2', '1/3', '2/3'], 0, { uz: '10/12 − 3/12 = 7/12.', ru: '10/12 − 3/12 = 7/12.' }),
      item('i6', '(2/5)² = ?', ['4/25', '4/5', '2/25', '4/10'], 0, { uz: 'Surat ham, maxraj ham kvadratga ko‘tariladi.', ru: 'В квадрат возводятся и числитель, и знаменатель.' }),
    ]),
  drill('percent_base', 'math.num.percent', { uz: 'Foiz asosi', ru: 'База процента', en: 'Percent of what' },
    { uz: 'Har safar foiz qaysi sondan olinayotganini aniqlang.', ru: 'Каждый раз уточняйте, от какого числа берётся процент.' }, [
      item('i1', { uz: '120 ning 25 foizi nechaga teng?', ru: 'Чему равны 25% от 120?' }, ['30', '25', '48', '95'], 0, { uz: '120 · 0,25 = 30.', ru: '120 · 0,25 = 30.' }),
      item('i2', { uz: '30 qaysi sonning 20 foizi?', ru: '30 — это 20% от какого числа?' }, ['150', '6', '60', '600'], 0, { uz: '30 : 0,2 = 150.', ru: '30 : 0,2 = 150.' }),
      item('i3', { uz: '40 dan 50 ga oshish necha foiz?', ru: 'Рост с 40 до 50 — это сколько процентов?' }, ['25', '20', '10', '80'], 0, { uz: '10 ni 40 ga bo‘lamiz: 25%.', ru: 'Делим 10 на 40: 25%.' }),
      item('i4', { uz: '50 dan 40 ga kamayish necha foiz?', ru: 'Снижение с 50 до 40 — это сколько процентов?' }, ['20', '25', '10', '80'], 0, { uz: '10 ni 50 ga bo‘lamiz: 20%.', ru: 'Делим 10 на 50: 20%.' }),
      item('i5', { uz: 'Narx 25% ga kamaytirilgach, 60 bo‘ldi. Dastlabki narxni toping.', ru: 'После снижения на 25% цена 60. Какова исходная цена?' }, ['80', '75', '85', '45'], 0, { uz: '60 — narxning 75 foizi: 60 : 0,75 = 80.', ru: '60 — это 75% цены: 60 : 0,75 = 80.' }),
      item('i6', { uz: '18 soni 72 ning necha foizi?', ru: 'Сколько процентов составляет 18 от 72?' }, ['25', '18', '40', '4'], 0, { uz: '18/72 = 1/4 = 25%.', ru: '18/72 = 1/4 = 25%.' }),
    ]),
  drill('lost_root', 'math.alg.quadratic', { uz: 'Hamma ildizlar', ru: 'Все корни', en: 'Every root' },
    { uz: 'Barcha hadlarni bir tomonga o‘tkazing, ko‘paytuvchilarga ajrating va har bir ko‘paytuvchini nolga tenglang.', ru: 'Перенесите всё в одну часть, разложите на множители и приравняйте к нулю каждый множитель.' }, [
      item('i1', { uz: 'x² = 16 ni yeching.', ru: 'Решите x² = 16.' }, ['−4; 4', '4', '8', '−4'], 0, { uz: 'x = ±4.', ru: 'x = ±4.' }),
      item('i2', { uz: 'x² = 5x ni yeching.', ru: 'Решите x² = 5x.' }, ['0; 5', '5', '0', '−5; 5'], 0, { uz: 'x(x − 5) = 0: x = 0 yoki 5.', ru: 'x(x − 5) = 0: x = 0 или 5.' }),
      item('i3', { uz: '(x − 2)² = 9 ni yeching.', ru: 'Решите (x − 2)² = 9.' }, ['−1; 5', '5', '1; 5', '−5; 1'], 0, { uz: 'x − 2 = ±3: x = 5 yoki −1.', ru: 'x − 2 = ±3: x = 5 или −1.' }),
      item('i4', { uz: 'x³ = 4x ni yeching.', ru: 'Решите x³ = 4x.' }, ['−2; 0; 2', '2', '−2; 2', '0; 2'], 0, { uz: 'x(x² − 4) = 0: x = 0, ±2.', ru: 'x(x² − 4) = 0: x = 0, ±2.' }),
      item('i5', { uz: '|x| = 7 ni yeching.', ru: 'Решите |x| = 7.' }, ['−7; 7', '7', '−7', '0; 7'], 0, { uz: 'x = ±7.', ru: 'x = ±7.' }),
      item('i6', { uz: 'x(x + 3) = 0 ni yeching.', ru: 'Решите x(x + 3) = 0.' }, ['−3; 0', '−3', '0; 3', '3'], 0, { uz: 'x = 0 yoki x = −3.', ru: 'x = 0 или x = −3.' }),
    ]),
  drill('domain', 'math.alg.irrational', { uz: 'Aniqlanish sohasi', ru: 'Область определения', en: 'Domain checks' },
    { uz: 'Har bir javobni maxraj, ildiz va logarifm shartlari bilan tekshiring.', ru: 'Проверяйте каждый ответ условиями на знаменатель, корень и логарифм.' }, [
      item('i1', { uz: 'y = √(x − 4) ning aniqlanish sohasi?', ru: 'Область определения y = √(x − 4)?' }, ['[4; +∞)', '(4; +∞)', '(−∞; 4]', '[−4; +∞)'], 0, { uz: 'x − 4 ≥ 0.', ru: 'x − 4 ≥ 0.' }),
      item('i2', { uz: 'y = 1/(x² − 9) ning aniqlanish sohasi?', ru: 'Область определения y = 1/(x² − 9)?' }, ['(−∞; −3) ∪ (−3; 3) ∪ (3; +∞)', '(−∞; 3) ∪ (3; +∞)', '(−3; 3)', '(−∞; +∞)'], 0, { uz: 'x² ≠ 9: x ≠ ±3.', ru: 'x² ≠ 9: x ≠ ±3.' }),
      item('i3', { uz: 'y = log₂ (5 − x) ning aniqlanish sohasi?', ru: 'Область определения y = log₂ (5 − x)?' }, ['(−∞; 5)', '(−∞; 5]', '(5; +∞)', '[5; +∞)'], 0, { uz: '5 − x > 0.', ru: '5 − x > 0.' }),
      item('i4', { uz: '√x = x − 2 ni yeching.', ru: 'Решите √x = x − 2.' }, ['4', '1; 4', '1', '∅'], 0, { uz: 'x = x² − 4x + 4 ⇒ x = 1 yoki 4; x − 2 ≥ 0 shartidan faqat 4.', ru: 'x = x² − 4x + 4 ⇒ x = 1 или 4; из условия x − 2 ≥ 0 только 4.' }),
      item('i5', { uz: '(x² − 1)/(x − 1) = 0 ni yeching.', ru: 'Решите (x² − 1)/(x − 1) = 0.' }, ['−1', '−1; 1', '1', '∅'], 0, { uz: 'x = ±1, lekin x ≠ 1.', ru: 'x = ±1, но x ≠ 1.' }),
      item('i6', { uz: 'log₃ x + log₃ (x − 8) = 2 ni yeching.', ru: 'Решите log₃ x + log₃ (x − 8) = 2.' }, ['9', '−1; 9', '−1', '3'], 0, { uz: 'x(x − 8) = 9 ⇒ x = 9 yoki −1; x > 8 shartidan 9.', ru: 'x(x − 8) = 9 ⇒ x = 9 или −1; из x > 8 остаётся 9.' }),
    ]),
  drill('inequality_flip', 'math.alg.inequalities', { uz: 'Tengsizlik belgisi', ru: 'Знак неравенства', en: 'Flipping the sign' },
    { uz: 'Manfiy songa ko‘paytirish yoki bo‘lishda belgini teskari qiling.', ru: 'При умножении или делении на отрицательное число меняйте знак.' }, [
      item('i1', { uz: '−3x < 12 ni yeching.', ru: 'Решите −3x < 12.' }, ['(−4; +∞)', '(−∞; −4)', '(4; +∞)', '(−∞; 4)'], 0, { uz: 'x > −4.', ru: 'x > −4.' }),
      item('i2', { uz: '−x/2 ≥ 3 ni yeching.', ru: 'Решите −x/2 ≥ 3.' }, ['(−∞; −6]', '[−6; +∞)', '[6; +∞)', '(−∞; 6]'], 0, { uz: '−x ≥ 6, x ≤ −6.', ru: '−x ≥ 6, x ≤ −6.' }),
      item('i3', { uz: '5 − 2x > 1 ni yeching.', ru: 'Решите 5 − 2x > 1.' }, ['(−∞; 2)', '(2; +∞)', '(−∞; −2)', '(−2; +∞)'], 0, { uz: '−2x > −4, x < 2.', ru: '−2x > −4, x < 2.' }),
      item('i4', { uz: '−4x + 1 ≤ 9 ni yeching.', ru: 'Решите −4x + 1 ≤ 9.' }, ['[−2; +∞)', '(−∞; −2]', '[2; +∞)', '(−∞; 2]'], 0, { uz: '−4x ≤ 8, x ≥ −2.', ru: '−4x ≤ 8, x ≥ −2.' }),
      item('i5', { uz: '(x − 3)/(−2) > 1 ni yeching.', ru: 'Решите (x − 3)/(−2) > 1.' }, ['(−∞; 1)', '(1; +∞)', '(5; +∞)', '(−∞; 5)'], 0, { uz: 'x − 3 < −2, x < 1.', ru: 'x − 3 < −2, x < 1.' }),
      item('i6', { uz: '2 − x ≥ 2x − 4 ni yeching.', ru: 'Решите 2 − x ≥ 2x − 4.' }, ['(−∞; 2]', '[2; +∞)', '(−∞; −2]', '[−2; +∞)'], 0, { uz: '6 ≥ 3x, x ≤ 2.', ru: '6 ≥ 3x, x ≤ 2.' }),
    ]),
  drill('powers', 'math.alg.powers', { uz: 'Darajalar', ru: 'Степени', en: 'Powers' },
    { uz: 'Ko‘paytirishda ko‘rsatkichlar qo‘shiladi, darajani darajaga ko‘tarishda ko‘paytiriladi.', ru: 'При умножении показатели складываются, при возведении степени в степень — перемножаются.' }, [
      item('i1', 'x³ · x⁵ = ?', ['x⁸', 'x¹⁵', 'x²', '2x⁸'], 0, { uz: '3 + 5 = 8.', ru: '3 + 5 = 8.' }),
      item('i2', '(x²)³ = ?', ['x⁶', 'x⁵', 'x⁸', '3x²'], 0, { uz: '2 · 3 = 6.', ru: '2 · 3 = 6.' }),
      item('i3', { uz: 'x ≠ 0 da x⁷ : x² = ?', ru: 'При x ≠ 0: x⁷ : x² = ?' }, ['x⁵', 'x⁹', 'x³', 'x¹⁴'], 0, { uz: '7 − 2 = 5.', ru: '7 − 2 = 5.' }),
      item('i4', '2⁰ + 2⁻¹ = ?', ['3/2', '1/2', '1', '0'], 0, { uz: '1 + 1/2 = 3/2.', ru: '1 + 1/2 = 3/2.' }),
      item('i5', '(3x)² = ?', ['9x²', '3x²', '6x²', '9x'], 0, { uz: 'Ikkala ko‘paytuvchi ham kvadratga ko‘tariladi.', ru: 'В квадрат возводятся оба множителя.' }),
      item('i6', '4^(1/2) = ?', ['2', '1/2', '8', '16'], 0, { uz: '4^(1/2) = √4 = 2.', ru: '4^(1/2) = √4 = 2.' }),
    ]),
  drill('formulas', 'geometry', { uz: 'Formulalar', ru: 'Формулы', en: 'Area, perimeter and volume' },
    { uz: 'Avval nima so‘ralayotganini aniqlang: uzunlik, yuza yoki hajm.', ru: 'Сначала определите, что спрашивают: длину, площадь или объём.' }, [
      item('i1', { uz: 'Tomoni 5 bo‘lgan kvadratning perimetri?', ru: 'Периметр квадрата со стороной 5?' }, ['20', '25', '10', '15'], 0, { uz: 'P = 4a = 20.', ru: 'P = 4a = 20.' }),
      item('i2', { uz: 'Tomoni 5 bo‘lgan kvadratning yuzi?', ru: 'Площадь квадрата со стороной 5?' }, ['25', '20', '10', '125'], 0, { uz: 'S = a² = 25.', ru: 'S = a² = 25.' }),
      item('i3', { uz: 'Radiusi 4 bo‘lgan aylana uzunligi?', ru: 'Длина окружности радиуса 4?' }, ['8π', '16π', '4π', '64π'], 0, { uz: 'C = 2πr = 8π.', ru: 'C = 2πr = 8π.' }),
      item('i4', { uz: 'Radiusi 4 bo‘lgan doira yuzi?', ru: 'Площадь круга радиуса 4?' }, ['16π', '8π', '4π', '64π'], 0, { uz: 'S = πr² = 16π.', ru: 'S = πr² = 16π.' }),
      item('i5', { uz: 'Qirrasi 2 bo‘lgan kubning to‘la sirti?', ru: 'Площадь полной поверхности куба с ребром 2?' }, ['24', '8', '12', '16'], 0, { uz: 'S = 6a² = 24 (hajm 8 bo‘lardi).', ru: 'S = 6a² = 24 (объём был бы 8).' }),
      item('i6', { uz: 'Tomonlari 3 va 7 bo‘lgan to‘g‘ri to‘rtburchak perimetri?', ru: 'Периметр прямоугольника со сторонами 3 и 7?' }, ['20', '21', '10', '42'], 0, { uz: 'P = 2(3 + 7) = 20.', ru: 'P = 2(3 + 7) = 20.' }),
    ]),
  drill('units', 'word_problems', { uz: 'Birliklar', ru: 'Единицы', en: 'Units' },
    { uz: 'Hamma kattaliklarni bir xil birliklarga keltiring; kvadrat va kub birliklarda o‘tish koeffitsiyentini ham kvadratga va kubga ko‘taring.', ru: 'Переводите всё в одни единицы; для квадратных и кубических единиц возводите коэффициент перевода в квадрат и в куб.' }, [
      item('i1', { uz: '1,5 m necha sm?', ru: 'Сколько сантиметров в 1,5 м?' }, ['150', '15', '1500', '0,15'], 0, { uz: '1 m = 100 sm.', ru: '1 м = 100 см.' }),
      item('i2', { uz: '2,5 soat necha minut?', ru: 'Сколько минут в 2,5 часа?' }, ['150', '250', '125', '90'], 0, { uz: '2,5 · 60 = 150.', ru: '2,5 · 60 = 150.' }),
      item('i3', { uz: '72 km/soat necha m/s?', ru: 'Сколько м/с в 72 км/ч?' }, ['20', '72', '7,2', '200'], 0, { uz: '72 000 m : 3600 s = 20 m/s.', ru: '72 000 м : 3600 с = 20 м/с.' }),
      item('i4', { uz: '3 dm³ necha litr?', ru: 'Сколько литров в 3 дм³?' }, ['3', '30', '300', '0,3'], 0, { uz: '1 dm³ = 1 litr.', ru: '1 дм³ = 1 литр.' }),
      item('i5', { uz: '1 m² necha sm²?', ru: 'Сколько см² в 1 м²?' }, ['10000', '100', '1000', '1000000'], 0, { uz: '100 · 100 = 10 000.', ru: '100 · 100 = 10 000.' }),
      item('i6', { uz: '90 sekund necha minut?', ru: 'Сколько минут в 90 секундах?' }, ['1,5', '1,3', '0,9', '9'], 0, { uz: '90 : 60 = 1,5.', ru: '90 : 60 = 1,5.' }),
    ]),
  drill('trig_values', 'math.trig.identities', { uz: 'Trigonometrik qiymatlar', ru: 'Значения тригонометрических функций', en: 'Trig values' },
    { uz: 'Jadval qiymatlarini va chorak bo‘yicha ishorani mashq qiling.', ru: 'Тренируйте табличные значения и знаки по четвертям.' }, [
      item('i1', 'sin 60° = ?', ['√3/2', '1/2', '√2/2', '√3'], 0, { uz: 'Jadval qiymati.', ru: 'Табличное значение.' }),
      item('i2', 'cos 90° = ?', ['0', '1', '−1', '1/2'], 0, { uz: 'Birlik aylanada 90° ga (0; 1) nuqta mos keladi; kosinus — uning abssissasi, ya’ni 0.', ru: 'На единичной окружности углу 90° соответствует точка (0; 1); косинус — её абсцисса, то есть 0.' }),
      item('i3', 'tg 60° = ?', ['√3', '√3/3', '1', '√3/2'], 0, { uz: 'sin 60° : cos 60° = √3.', ru: 'sin 60° : cos 60° = √3.' }),
      item('i4', 'sin 150° = ?', ['1/2', '−1/2', '√3/2', '−√3/2'], 0, { uz: 'sin (180° − 30°) = sin 30°.', ru: 'sin (180° − 30°) = sin 30°.' }),
      item('i5', 'cos 180° = ?', ['−1', '1', '0', '1/2'], 0, { uz: '180° ga (−1; 0) nuqta mos keladi: cos 180° = −1.', ru: 'Углу 180° соответствует точка (−1; 0): cos 180° = −1.' }),
      item('i6', 'sin (−30°) = ?', ['−1/2', '1/2', '−√3/2', '√3/2'], 0, { uz: 'Sinus toq funksiya: sin (−30°) = −sin 30° = −1/2.', ru: 'Синус — нечётная функция: sin (−30°) = −sin 30° = −1/2.' }),
    ]),
  drill('vieta', 'math.alg.quadratic', { uz: 'Viyet teoremasi', ru: 'Теорема Виета', en: 'Vieta' },
    { uz: 'x₁ + x₂ = −b/a, x₁ · x₂ = c/a. Ishorani va a ni unutmang.', ru: 'x₁ + x₂ = −b/a, x₁ · x₂ = c/a. Не забывайте знак и a.' }, [
      item('i1', { uz: 'x² − 7x + 12 = 0: ildizlar yig‘indisi?', ru: 'x² − 7x + 12 = 0: сумма корней?' }, ['7', '−7', '12', '−12'], 0, { uz: '−b/a = 7.', ru: '−b/a = 7.' }),
      item('i2', { uz: 'x² − 7x + 12 = 0: ildizlar ko‘paytmasi?', ru: 'x² − 7x + 12 = 0: произведение корней?' }, ['12', '−12', '7', '−7'], 0, { uz: 'c/a = 12.', ru: 'c/a = 12.' }),
      item('i3', { uz: 'x² + 3x − 10 = 0: ildizlar yig‘indisi?', ru: 'x² + 3x − 10 = 0: сумма корней?' }, ['−3', '3', '−10', '10'], 0, { uz: '−b/a = −3.', ru: '−b/a = −3.' }),
      item('i4', { uz: '2x² − 8x + 6 = 0: ildizlar yig‘indisi?', ru: '2x² − 8x + 6 = 0: сумма корней?' }, ['4', '8', '−4', '3'], 0, { uz: '−b/a = 8/2 = 4.', ru: '−b/a = 8/2 = 4.' }),
      item('i5', { uz: 'x² − 5x − 14 = 0: ildizlar ko‘paytmasi?', ru: 'x² − 5x − 14 = 0: произведение корней?' }, ['−14', '14', '5', '−5'], 0, { uz: 'c/a = −14.', ru: 'c/a = −14.' }),
      item('i6', { uz: 'Ildizlari 2 va 5 bo‘lgan keltirilgan kvadrat tenglamani tanlang.', ru: 'Выберите приведённое квадратное уравнение с корнями 2 и 5.' }, ['x² − 7x + 10 = 0', 'x² + 7x + 10 = 0', 'x² − 7x − 10 = 0', 'x² + 3x − 10 = 0'], 0, { uz: 'x² + px + q = 0 uchun p = −(2 + 5) = −7, q = 2·5 = 10.', ru: 'Для x² + px + q = 0: p = −(2 + 5) = −7, q = 2·5 = 10.' }),
    ]),
];
