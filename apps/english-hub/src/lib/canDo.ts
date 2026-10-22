import type { CefrLevel, SkillKey } from './skills';

/**
 * "I can…" statements, adapted from the CEFR descriptors for each level and
 * skill. A statement is achieved when the learner scored 70+ on an activity
 * in that skill at that level whose title or topic matches one of its
 * keywords (or on any activity there, when it has no keywords).
 */
export type CanDo = { id: string; skill: SkillKey; level: CefrLevel; keywords: string[] };

export const CAN_DO: CanDo[] = [
  // A1
  { id: 'a1-read-signs', skill: 'reading', level: 'A1', keywords: ['sign', 'notice', 'message', 'café', 'shop', 'bazaar'] },
  { id: 'a1-listen-simple', skill: 'listening', level: 'A1', keywords: [] },
  { id: 'a1-write-note', skill: 'writing', level: 'A1', keywords: ['note', 'message', 'day', 'routine', 'family'] },
  { id: 'a1-speak-self', skill: 'speaking', level: 'A1', keywords: ['yourself', 'family', 'routine', 'home'] },
  { id: 'a1-grammar-basics', skill: 'grammar', level: 'A1', keywords: [] },
  { id: 'a1-words-everyday', skill: 'vocabulary', level: 'A1', keywords: [] },
  // A2
  { id: 'a2-read-everyday', skill: 'reading', level: 'A2', keywords: ['label', 'email', 'message', 'weather', 'job', 'class'] },
  { id: 'a2-listen-announcements', skill: 'listening', level: 'A2', keywords: ['announcement', 'platform', 'station', 'voicemail', 'message'] },
  { id: 'a2-write-email', skill: 'writing', level: 'A2', keywords: ['email', 'message', 'invite', 'reschedule'] },
  { id: 'a2-speak-describe', skill: 'speaking', level: 'A2', keywords: [] },
  { id: 'a2-grammar-past', skill: 'grammar', level: 'A2', keywords: ['past', 'did'] },
  { id: 'a2-tasks-arrange', skill: 'immersion', level: 'A2', keywords: [] },
  // B1
  { id: 'b1-read-articles', skill: 'reading', level: 'B1', keywords: [] },
  { id: 'b1-listen-conversation', skill: 'listening', level: 'B1', keywords: ['dialogue', 'conversation', 'call', 'study', 'flat'] },
  { id: 'b1-write-complaint', skill: 'writing', level: 'B1', keywords: ['complaint', 'problem', 'order', 'opinion'] },
  { id: 'b1-speak-story', skill: 'speaking', level: 'B1', keywords: ['story', 'trip', 'remember', 'explain', 'problem'] },
  { id: 'b1-grammar-perfect', skill: 'grammar', level: 'B1', keywords: ['present perfect', 'conditional'] },
  { id: 'b1-tasks-travel', skill: 'immersion', level: 'B1', keywords: ['airport', 'hotel', 'travel', 'check-in', 'booking', 'doctor'] },
  // B2
  { id: 'b2-read-argument', skill: 'reading', level: 'B2', keywords: [] },
  { id: 'b2-listen-talks', skill: 'listening', level: 'B2', keywords: ['radio', 'talk', 'podcast', 'discussion', 'lecture'] },
  { id: 'b2-write-essay', skill: 'writing', level: 'B2', keywords: ['essay', 'opinion', 'review', 'report'] },
  { id: 'b2-speak-opinion', skill: 'speaking', level: 'B2', keywords: ['opinion', 'update', 'project', 'argue'] },
  { id: 'b2-grammar-passive', skill: 'grammar', level: 'B2', keywords: ['passive', 'reported', 'conditional'] },
  { id: 'b2-tasks-work', skill: 'immersion', level: 'B2', keywords: ['team', 'delay', 'workplace', 'colleague', 'negotiat'] },
  // C1
  { id: 'c1-read-complex', skill: 'reading', level: 'C1', keywords: [] },
  { id: 'c1-listen-lectures', skill: 'listening', level: 'C1', keywords: ['lecture', 'talk', 'radio', 'discussion'] },
  { id: 'c1-write-formal', skill: 'writing', level: 'C1', keywords: ['report', 'proposal', 'formal', 'essay', 'letter'] },
  { id: 'c1-speak-present', skill: 'speaking', level: 'C1', keywords: [] },
  { id: 'c1-tasks-professional', skill: 'immersion', level: 'C1', keywords: [] },
];

export type CanDoEvidence = { skill: SkillKey; level: CefrLevel | null; score: number | null; title: string | null };

/** For each statement at or below `level`, the activity that proves it (or null). */
export const canDoProgress = (level: CefrLevel | null, evidence: CanDoEvidence[], order: CefrLevel[]) => {
  const top = level ? order.indexOf(level) : 1;
  return CAN_DO
    .filter((entry) => order.indexOf(entry.level) <= top)
    .map((entry) => {
      const proof = evidence.find((attempt) =>
        attempt.skill === entry.skill
        && attempt.level === entry.level
        && (attempt.score ?? 0) >= 70
        && (!entry.keywords.length || entry.keywords.some((word) => (attempt.title ?? '').toLowerCase().includes(word))));
      return { ...entry, proof: proof?.title ?? null };
    });
};
