export type SkillKey = 'reading' | 'listening' | 'writing' | 'speaking' | 'grammar' | 'vocabulary' | 'immersion';

export type CefrLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
export const CEFR_LEVELS: CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
export const isCefr = (value: unknown): value is CefrLevel =>
  typeof value === 'string' && (CEFR_LEVELS as string[]).includes(value.toUpperCase());

export type Skill = {
  key: SkillKey;
  path: `/${SkillKey}`;
  productSlug: `english-${SkillKey}`;
  productId: string;
};

/** The seven English practice areas, in the order learners see them. */
export const SKILLS: Skill[] = [
  { key: 'reading', path: '/reading', productSlug: 'english-reading', productId: '0e8ad198-6284-4406-9e07-11ba7da0f42d' },
  { key: 'listening', path: '/listening', productSlug: 'english-listening', productId: 'f9c4a14b-d5a2-4a66-9cd8-5b3a0d6e7bf1' },
  { key: 'writing', path: '/writing', productSlug: 'english-writing', productId: '2f7c2d09-08e4-4f9f-9e8d-4f5916ef8532' },
  { key: 'speaking', path: '/speaking', productSlug: 'english-speaking', productId: '94ac6f14-15f3-4f35-a8a2-01f5aaecf66d' },
  { key: 'grammar', path: '/grammar', productSlug: 'english-grammar', productId: '6c4f0566-6f50-4fb4-b176-c4397ecb8ec5' },
  { key: 'vocabulary', path: '/vocabulary', productSlug: 'english-vocabulary', productId: 'b1c98e87-84d3-4ddc-8f07-c72bcf7a716a' },
  { key: 'immersion', path: '/immersion', productSlug: 'english-immersion', productId: '7ce43052-2f35-42ca-b305-0d9c358f73f0' },
];

export const skillByKey = (key: string | null | undefined): Skill | null =>
  SKILLS.find((skill) => skill.key === key) ?? null;

export const skillByProductId = (productId: string | null | undefined): Skill | null =>
  SKILLS.find((skill) => skill.productId === productId || skill.productSlug === productId) ?? null;

/** The level one step up, used to suggest "stretch" content. */
export const nextLevel = (level: CefrLevel): CefrLevel => {
  const index = CEFR_LEVELS.indexOf(level);
  return CEFR_LEVELS[Math.min(CEFR_LEVELS.length - 1, index + 1)] ?? level;
};
