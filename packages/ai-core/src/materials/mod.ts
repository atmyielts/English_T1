// Teaching materials (T1, T2): the material model and its schemas, every kind's
// rules and generation plan, the exam format adapters, reading model drafts,
// deterministic answer-key checks with the solve-without-key comparison, and the
// renderer and export shapes. Pure TypeScript for the app, the function and other
// areas (C5 placement tests, C12 curriculum). Owned by the teacher area.
export * from './catalog.ts';
export * from './model.ts';
export * from './formats.ts';
export * from './kinds.ts';
export * from './draft.ts';
export * from './keys.ts';
export * from './render.ts';
export * from './library.ts';
export { described, listOf, literal, looseText, orElse, tagged } from './kit.ts';
