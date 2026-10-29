// coach text in English. Keys start with `coach.`; uz.ts and ru.ts must have the same keys.
export const en = {} satisfies Record<string, string>;
export type CoachKey = keyof typeof en;
