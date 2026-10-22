import type { Taxonomy, Topic } from '../topics.ts';

type Block = Topic['blocks'][number];
const C: Block[] = ['compulsory', 'specialised'];
const S: Block[] = ['specialised'];

const topic = (code: string, strand: string, blocks: Block[], weight: number, prerequisites: string[], uz: string, ru: string, en: string): Topic => ({
  code, strand, blocks, weight, prerequisites, names: { uz, ru, en },
});

// School mathematics for the admission test, grades 5–11.
// Draft: topics and weights follow the usual school programme, not yet the official
// test programme. Weights are equal shares until item statistics and the official
// programme say otherwise.
export const UZ_MATH_TOPICS: Taxonomy = {
  subject: 'math',
  version: '2026.1',
  verified: false,
  source_note: 'Drafted from the school programme; check every topic and weight against the agency’s published test programme.',
  topics: [
    topic('math.num.natural', 'numbers', C, 1, [], 'Natural sonlar, bo‘linuvchanlik, EKUB va EKUK', 'Натуральные числа, делимость, НОД и НОК', 'Natural numbers, divisibility, GCD and LCM'),
    topic('math.num.fractions', 'numbers', C, 1, ['math.num.natural'], 'Oddiy va o‘nli kasrlar', 'Обыкновенные и десятичные дроби', 'Fractions and decimals'),
    topic('math.num.percent', 'numbers', C, 1, ['math.num.fractions'], 'Foizlar va proporsiyalar', 'Проценты и пропорции', 'Percentages and proportions'),
    topic('math.num.real', 'numbers', C, 1, ['math.num.fractions'], 'Haqiqiy sonlar va kvadrat ildizlar', 'Действительные числа и квадратные корни', 'Real numbers and square roots'),
    topic('math.alg.expressions', 'algebra', C, 1, ['math.num.fractions'], 'Algebraik ifodalar va qisqa ko‘paytirish formulalari', 'Алгебраические выражения и формулы сокращённого умножения', 'Algebraic expressions and special products'),
    topic('math.alg.powers', 'algebra', C, 1, ['math.alg.expressions', 'math.num.real'], 'Darajalar va ildizlar xossalari', 'Степени и корни', 'Powers and roots'),
    topic('math.alg.linear', 'algebra', C, 1, ['math.alg.expressions'], 'Chiziqli tenglamalar va tenglamalar sistemalari', 'Линейные уравнения и системы уравнений', 'Linear equations and systems'),
    topic('math.alg.quadratic', 'algebra', C, 1, ['math.alg.linear'], 'Kvadrat tenglamalar, Viyet teoremasi', 'Квадратные уравнения, теорема Виета', 'Quadratic equations and Vieta’s theorem'),
    topic('math.alg.rational', 'algebra', S, 1, ['math.alg.quadratic'], 'Ratsional tenglamalar', 'Рациональные уравнения', 'Rational equations'),
    topic('math.alg.inequalities', 'algebra', C, 1, ['math.alg.quadratic'], 'Tengsizliklar va ularning sistemalari, oraliqlar usuli', 'Неравенства и системы неравенств, метод интервалов', 'Inequalities, systems and the interval method'),
    topic('math.alg.modulus', 'algebra', S, 1, ['math.alg.inequalities'], 'Modulli tenglama va tengsizliklar', 'Уравнения и неравенства с модулем', 'Equations and inequalities with absolute value'),
    topic('math.alg.irrational', 'algebra', S, 1, ['math.alg.powers', 'math.alg.quadratic'], 'Irratsional tenglama va tengsizliklar', 'Иррациональные уравнения и неравенства', 'Irrational equations and inequalities'),
    topic('math.fn.graphs', 'functions', C, 1, ['math.alg.linear'], 'Funksiyalar va ularning grafiklari', 'Функции и их графики', 'Functions and their graphs'),
    topic('math.seq.arithmetic', 'sequences', C, 1, ['math.alg.linear'], 'Arifmetik progressiya', 'Арифметическая прогрессия', 'Arithmetic progressions'),
    topic('math.seq.geometric', 'sequences', S, 1, ['math.alg.powers'], 'Geometrik progressiya', 'Геометрическая прогрессия', 'Geometric progressions'),
    topic('math.exp.equations', 'exponents', S, 1, ['math.alg.powers', 'math.fn.graphs'], 'Ko‘rsatkichli tenglama va tengsizliklar', 'Показательные уравнения и неравенства', 'Exponential equations and inequalities'),
    topic('math.log.equations', 'exponents', S, 1, ['math.exp.equations'], 'Logarifmlar, logarifmik tenglama va tengsizliklar', 'Логарифмы, логарифмические уравнения и неравенства', 'Logarithms and logarithmic equations'),
    topic('math.trig.identities', 'trigonometry', S, 1, ['math.geo.triangles', 'math.alg.expressions'], 'Trigonometrik ifodalar va ayniyatlar', 'Тригонометрические выражения и тождества', 'Trigonometric expressions and identities'),
    topic('math.trig.equations', 'trigonometry', S, 1, ['math.trig.identities', 'math.alg.quadratic'], 'Trigonometrik tenglama va tengsizliklar', 'Тригонометрические уравнения и неравенства', 'Trigonometric equations and inequalities'),
    topic('math.word.problems', 'word_problems', C, 1, ['math.num.percent', 'math.alg.linear'], 'Matnli masalalar: harakat, ish, aralashma', 'Текстовые задачи: движение, работа, смеси', 'Word problems: motion, work, mixtures'),
    topic('math.calc.derivative', 'calculus', S, 1, ['math.fn.graphs', 'math.alg.powers'], 'Hosila va uning tatbiqlari', 'Производная и её применение', 'Derivatives and their uses'),
    topic('math.calc.integral', 'calculus', S, 1, ['math.calc.derivative'], 'Boshlang‘ich funksiya va integral', 'Первообразная и интеграл', 'Antiderivatives and integrals'),
    topic('math.prob.combinatorics', 'probability', S, 1, ['math.num.natural'], 'Kombinatorika va ehtimollar nazariyasi', 'Комбинаторика и теория вероятностей', 'Combinatorics and probability'),
    topic('math.prob.statistics', 'probability', C, 1, ['math.num.percent'], 'Statistika elementlari', 'Элементы статистики', 'Basic statistics'),
    topic('math.logic.sets', 'logic', C, 1, [], 'To‘plamlar va mantiq elementlari', 'Множества и элементы логики', 'Sets and logic'),
    topic('math.geo.triangles', 'geometry', C, 1, ['math.num.real'], 'Uchburchaklar, o‘xshashlik, Pifagor teoremasi', 'Треугольники, подобие, теорема Пифагора', 'Triangles, similarity and Pythagoras'),
    topic('math.geo.quadrilaterals', 'geometry', C, 1, ['math.geo.triangles'], 'To‘rtburchaklar', 'Четырёхугольники', 'Quadrilaterals'),
    topic('math.geo.circles', 'geometry', C, 1, ['math.geo.triangles'], 'Aylana va doira, ichki va tashqi chizilgan shakllar', 'Окружность и круг, вписанные и описанные фигуры', 'Circles, inscribed and circumscribed figures'),
    topic('math.geo.areas', 'geometry', C, 1, ['math.geo.quadrilaterals', 'math.geo.circles'], 'Tekis shakllar yuzalari', 'Площади плоских фигур', 'Areas of plane figures'),
    topic('math.geo.vectors', 'geometry', S, 1, ['math.geo.triangles', 'math.fn.graphs'], 'Tekislikda koordinatalar va vektorlar', 'Координаты и векторы на плоскости', 'Coordinates and vectors in the plane'),
    topic('math.solid.polyhedra', 'solid_geometry', S, 1, ['math.geo.areas'], 'Ko‘pyoqlar: prizma va piramida', 'Многогранники: призма и пирамида', 'Polyhedra: prisms and pyramids'),
    topic('math.solid.revolution', 'solid_geometry', S, 1, ['math.geo.circles', 'math.geo.areas'], 'Aylanish jismlari: silindr, konus, shar', 'Тела вращения: цилиндр, конус, шар', 'Solids of revolution: cylinder, cone, sphere'),
    topic('math.solid.vectors', 'solid_geometry', S, 1, ['math.geo.vectors', 'math.solid.polyhedra'], 'Fazoda koordinatalar va vektorlar', 'Координаты и векторы в пространстве', 'Coordinates and vectors in space'),
  ],
};
