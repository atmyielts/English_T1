// teacher text in English. Keys start with `teacher.`; uz.ts and ru.ts must have the same keys.
export const en = {} satisfies Record<string, string>;
export type TeacherKey = keyof typeof en;
