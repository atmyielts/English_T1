import { answerMatches, countWords, onScale, quoteFound } from './text.ts';
import {
  ACTIVITY_KINDS, COACH_FEATURES, LOCALES, MENU_ACTIONS, PLAN_SLOTS,
  type Activity, type CoachPack, type Deck, type DeckCard, type LevelScale, type Localized, type MenuAction, type PackSource, type PlanSlot, type Rubric,
} from './types.ts';

// The pack validator. The engine refuses a pack with any problem, when it loads
// and in CI. Besides shape and references it enforces the depth standard (enough
// content per offered feature) so a new coach cannot ship thin.

/** Minimum content per offered menu action. A pack that offers less is refused. */
export const DEPTH = {
  diagnosticItems: 15,
  calibrationSamples: 8,
  calibrationLevels: 3,
  calibrationRuns: 2,
  part1Questions: 30,
  cueCards: 8,
  roleplays: 8,
  writingTasks: 6,
  readingSets: 4,
  listeningSets: 4,
  practiceSets: 4,
  deckCards: 60,
  drills: 6,
  drillItems: 5,
  shadowingSentences: 30,
  lessons: 4,
  dailyReminders: 5,
  milestones: 3,
  samples: 2,
} as const;

const ID = /^[a-z0-9][a-z0-9_.-]{1,80}$/;
const PACK_ID = /^[a-z][a-z0-9-]{1,15}$/;
const COMMAND = /^[a-z][a-z0-9_]{0,31}$/;
const PLACEHOLDERS = new Set(['name', 'task', 'minutes', 'streak', 'delta', 'days', 'coach', 'level', 'target']);

export class PackError extends Error {
  constructor(public pack: string, public problems: string[]) {
    super(`Coach pack ${pack} is invalid:\n  - ${problems.slice(0, 40).join('\n  - ')}${problems.length > 40 ? `\n  …and ${problems.length - 40} more` : ''}`);
  }
}

export function validatePack(source: PackSource): string[] {
  const problems: string[] = [];
  const bad = (path: string, problem: string) => problems.push(`${path}: ${problem}`);
  const m = source.manifest;
  const languages = Array.isArray(m?.uiLanguages) ? m.uiLanguages : [];

  const localized = (path: string, value: Localized | undefined, max = 4000) => {
    if (!value || typeof value !== 'object') return bad(path, 'needs text in every interface language');
    for (const locale of languages) {
      const text = value[locale];
      if (typeof text !== 'string' || !text.trim()) bad(path, `missing ${locale}`);
      else if (text.length > max) bad(path, `${locale} is longer than ${max} characters`);
      for (const [, key] of (text ?? '').matchAll(/\{([a-z_]+)\}/g)) if (!PLACEHOLDERS.has(key)) bad(path, `unknown placeholder {${key}}`);
    }
  };
  const textOk = (path: string, value: unknown, max = 6000) => {
    if (typeof value !== 'string' || !value.trim()) bad(path, 'needs text');
    else if (value.length > max) bad(path, `longer than ${max} characters`);
  };
  const scaleOk = (path: string, scale: LevelScale | undefined) => {
    if (!scale || !Number.isFinite(scale.min) || !Number.isFinite(scale.max) || !(scale.step > 0) || scale.min >= scale.max) return bad(path, 'needs min < max and a positive step');
    for (const label of scale.labels ?? []) if (!onScale(scale, label.value) || !label.label) bad(`${path}.labels`, `${label.value} is not on the scale`);
  };
  const level = (path: string, value: number, scale = m.scale) => { if (!onScale(scale, value)) bad(path, `${value} is not on the ${scale.id} scale`); };

  // --- manifest ---------------------------------------------------------------------------------
  if (!m) return ['manifest: missing'];
  if (!PACK_ID.test(m.id ?? '')) bad('manifest.id', 'must match ^[a-z][a-z0-9-]{1,30}$');
  if (!(COACH_FEATURES as readonly string[]).includes(m.feature)) bad('manifest.feature', `must be one of ${COACH_FEATURES.join(', ')}`);
  if (!/^\d+\.\d+\.\d+$/.test(m.version ?? '')) bad('manifest.version', 'must look like 1.0.0');
  if (!languages.length || languages.some((locale) => !(LOCALES as readonly string[]).includes(locale)) || new Set(languages).size !== languages.length) bad('manifest.uiLanguages', 'needs distinct languages from uz, ru, en');
  if (![...LOCALES, 'mixed'].includes(m.practiceLanguage)) bad('manifest.practiceLanguage', 'must be en, uz, ru or mixed');
  localized('manifest.name', m.name, 60);
  localized('manifest.tagline', m.tagline, 140);
  localized('manifest.description', m.description, 1200);
  localized('manifest.audience.description', m.audience?.description, 600);
  scaleOk('manifest.scale', m.scale);
  if (m.scale) for (const value of m.audience?.levels ?? []) level('manifest.audience.levels', value);
  if (m.accent && !/^#[0-9a-f]{6}$/i.test(m.accent)) bad('manifest.accent', 'must be a hex colour');
  if (m.explainInUiLanguageBelow !== undefined && m.scale) level('manifest.explainInUiLanguageBelow', m.explainInUiLanguageBelow);

  const skills = new Map<string, { parent?: string }>();
  for (const [index, node] of (m.skills ?? []).entries()) {
    if (!ID.test(node.id ?? '')) bad(`manifest.skills[${index}].id`, 'bad id');
    if (skills.has(node.id)) bad(`manifest.skills[${index}].id`, `duplicate ${node.id}`);
    skills.set(node.id, { parent: node.parent });
    localized(`manifest.skills.${node.id}.name`, node.name, 80);
    if (node.weight !== undefined && !(node.weight > 0 && node.weight <= 10)) bad(`manifest.skills.${node.id}.weight`, 'must be 0 to 10');
  }
  if (!skills.size) bad('manifest.skills', 'needs a skill tree');
  for (const [id, node] of skills) {
    if (node.parent && !skills.has(node.parent)) bad(`manifest.skills.${id}.parent`, `unknown ${node.parent}`);
    const seen = new Set<string>();
    for (let at: string | undefined = id; at; at = skills.get(at)?.parent) {
      if (seen.has(at)) { bad(`manifest.skills.${id}`, 'parent cycle'); break; }
      seen.add(at);
    }
  }
  const skill = (path: string, id: string) => { if (!skills.has(id)) bad(path, `unknown skill ${id}`); };

  const activities = new Map<string, Activity>();
  for (const [index, activity] of (source.activities ?? []).entries()) {
    if (!ID.test(activity?.id ?? '')) bad(`activities[${index}].id`, 'bad id');
    else if (activities.has(activity.id)) bad(`activities[${index}].id`, `duplicate ${activity.id}`);
    else activities.set(activity.id, activity);
  }
  const ofKind = <K extends Activity['kind']>(kind: K) => [...activities.values()].filter((activity): activity is Extract<Activity, { kind: K }> => activity.kind === kind);

  const errorTags = new Set<string>();
  for (const [index, tag] of (m.errorTags ?? []).entries()) {
    if (!ID.test(tag.id ?? '') || errorTags.has(tag.id)) bad(`manifest.errorTags[${index}].id`, 'bad or duplicate id');
    errorTags.add(tag.id);
    localized(`manifest.errorTags.${tag.id}.name`, tag.name, 80);
    localized(`manifest.errorTags.${tag.id}.explain`, tag.explain, 600);
    skill(`manifest.errorTags.${tag.id}.node`, tag.node);
    if (tag.drill && activities.get(tag.drill)?.kind !== 'drill') bad(`manifest.errorTags.${tag.id}.drill`, `${tag.drill} is not a drill`);
  }

  const menuNeeds: Record<MenuAction, () => boolean> = {
    today: () => true, progress: () => true, report: () => true, plan: () => true, settings: () => true, help: () => true,
    speaking: () => ofKind('speaking_exam').length > 0,
    mock: () => ofKind('speaking_exam').some((exam) => exam.mock) || ofKind('roleplay').length > 0,
    roleplay: () => ofKind('roleplay').length > 0,
    writing: () => ofKind('writing').length > 0,
    reading: () => ofKind('quiz_set').some((set) => set.mode === 'reading'),
    listening: () => ofKind('quiz_set').some((set) => set.mode === 'listening'),
    practice: () => ofKind('quiz_set').some((set) => set.mode === 'practice'),
    vocab: () => ofKind('deck').some((deck) => deck.cardType === 'word'),
    phrases: () => ofKind('deck').some((deck) => deck.cardType === 'phrase'),
    drill: () => ofKind('drill').length > 0,
    shadowing: () => ofKind('shadowing').length > 0,
    photo: () => ofKind('photo_help').length > 0,
    lesson: () => ofKind('lesson').length > 0,
  };
  const menu = new Set<string>();
  for (const [index, item] of (m.menu ?? []).entries()) {
    if (!(MENU_ACTIONS as readonly string[]).includes(item.action)) { bad(`manifest.menu[${index}]`, `unknown action ${item.action}`); continue; }
    if (menu.has(item.action)) bad(`manifest.menu[${index}]`, `duplicate ${item.action}`);
    menu.add(item.action);
    localized(`manifest.menu.${item.action}.label`, item.label, 40);
    if (!menuNeeds[item.action]()) bad(`manifest.menu.${item.action}`, 'the pack has no content for it');
  }
  for (const required of ['today', 'progress', 'settings'] as const) if (!menu.has(required)) bad('manifest.menu', `needs ${required}`);
  for (const [index, command] of (m.commands ?? []).entries()) {
    if (!COMMAND.test(command.command ?? '')) bad(`manifest.commands[${index}]`, 'bad command');
    localized(`manifest.commands.${command.command}.description`, command.description, 120);
  }

  // --- question types, rubrics -----------------------------------------------------------------------
  const types = new Set<string>();
  for (const [index, type] of (source.questionTypes ?? []).entries()) {
    if (!ID.test(type.id ?? '') || types.has(type.id)) bad(`questionTypes[${index}].id`, 'bad or duplicate id');
    types.add(type.id);
    localized(`questionTypes.${type.id}.name`, type.name, 80);
    localized(`questionTypes.${type.id}.strategy`, type.strategy, 1200);
    skill(`questionTypes.${type.id}.node`, type.node);
  }

  const rubrics = new Map<string, Rubric>();
  for (const [index, rubric] of (source.rubrics ?? []).entries()) {
    const path = `rubrics.${rubric.id ?? index}`;
    if (!ID.test(rubric.id ?? '') || rubrics.has(rubric.id)) { bad(path, 'bad or duplicate id'); continue; }
    rubrics.set(rubric.id, rubric);
    localized(`${path}.name`, rubric.name, 80);
    scaleOk(`${path}.scale`, rubric.scale);
    textOk(`${path}.assessorNotes`, rubric.assessorNotes, 4000);
    if (!['step', 'half_up', 'down'].includes(rubric.overall?.round)) bad(`${path}.overall.round`, 'must be step, half_up or down');
    if (rubric.overall?.step !== undefined && rubric.scale && !(rubric.overall.step > 0 && rubric.overall.step <= rubric.scale.step)) bad(`${path}.overall.step`, 'must be positive and at most the criterion step');
    if (!(rubric.evidence?.min >= 1 && rubric.evidence.max >= rubric.evidence.min && rubric.evidence.max <= 5)) bad(`${path}.evidence`, 'needs 1 ≤ min ≤ max ≤ 5');
    const criteria = new Set<string>(), scored = new Set<string>();
    for (const criterion of rubric.criteria ?? []) {
      const cpath = `${path}.criteria.${criterion.id}`;
      if (!/^[a-z][a-z0-9_]{1,40}$/.test(criterion.id ?? '') || criteria.has(criterion.id)) bad(cpath, 'bad or duplicate id');
      criteria.add(criterion.id);
      if (criterion.source === 'model') scored.add(criterion.id); else if (criterion.source !== 'audio') bad(`${cpath}.source`, 'must be model or audio');
      skill(`${cpath}.node`, criterion.node);
      if (criterion.weight !== undefined && !(criterion.weight > 0 && criterion.weight <= 5)) bad(`${cpath}.weight`, 'must be 0 to 5');
      localized(`${cpath}.name`, criterion.name, 80);
      textOk(`${cpath}.focus`, criterion.focus, 1200);
      if ((criterion.descriptors ?? []).length < 3) bad(`${cpath}.descriptors`, 'needs at least three levels described');
      for (const descriptor of criterion.descriptors ?? []) {
        if (rubric.scale && !onScale(rubric.scale, descriptor.score)) bad(`${cpath}.descriptors`, `${descriptor.score} is not on the scale`);
        textOk(`${cpath}.descriptors.${descriptor.score}`, descriptor.text, 800);
      }
    }
    if (!scored.size) bad(`${path}.criteria`, 'needs at least one model-scored criterion');
    const cal = rubric.calibration;
    const t = cal?.thresholds;
    if (!t || [t.exact, t.adjacent, t.evidenceValid].some((value) => !(value >= 0 && value <= 1)) || !(t.maxMae >= 0) || !(t.maxSpread >= 0)) bad(`${path}.calibration.thresholds`, 'exact, adjacent and evidenceValid in 0..1; maxMae and maxSpread ≥ 0');
    const samples = cal?.samples ?? [];
    if (samples.length < DEPTH.calibrationSamples) bad(`${path}.calibration.samples`, `needs at least ${DEPTH.calibrationSamples}`);
    const sampleIds = new Set<string>(), overallLevels = new Set<number>();
    for (const sample of samples) {
      const spath = `${path}.calibration.${sample.id}`;
      if (!ID.test(sample.id ?? '') || sampleIds.has(sample.id)) bad(spath, 'bad or duplicate id');
      sampleIds.add(sample.id);
      textOk(`${spath}.task`, sample.task, 2000);
      textOk(`${spath}.response`, sample.response, 8000);
      textOk(`${spath}.rationale`, sample.rationale, 2000);
      const keys = Object.keys(sample.reference ?? {}).sort();
      if (keys.join() !== [...scored].sort().join()) bad(`${spath}.reference`, `needs exactly ${[...scored].join(', ')}`);
      const values = Object.values(sample.reference ?? {});
      for (const value of values) if (rubric.scale && !onScale(rubric.scale, value)) bad(`${spath}.reference`, `${value} is not on the scale`);
      if (values.length) overallLevels.add(Math.round(values.reduce((a, b) => a + b, 0) / values.length));
      const runs = cal.runs?.[sample.id] ?? [];
      if (runs.length < DEPTH.calibrationRuns) bad(`${spath}.runs`, `needs at least ${DEPTH.calibrationRuns} recorded runs`);
      for (const [r, run] of runs.entries()) {
        for (const id of scored) {
          const entry = run.criteria?.[id];
          if (!entry || !rubric.scale || !onScale(rubric.scale, entry.score)) bad(`${spath}.runs[${r}].${id}`, 'needs a score on the scale');
          if (!Array.isArray(entry?.evidence)) bad(`${spath}.runs[${r}].${id}`, 'needs an evidence list');
        }
      }
    }
    for (const id of Object.keys(cal?.runs ?? {})) if (!sampleIds.has(id)) bad(`${path}.calibration.runs`, `runs for unknown sample ${id}`);
    if (overallLevels.size < DEPTH.calibrationLevels) bad(`${path}.calibration.samples`, `must span at least ${DEPTH.calibrationLevels} levels`);
  }
  const rubric = (path: string, id: string) => { if (!rubrics.has(id)) bad(path, `unknown rubric ${id}`); };

  // --- cards (needed for phrase references) --------------------------------------------------
  const cards = new Map<string, DeckCard>();
  for (const deck of ofKind('deck')) for (const card of deck.cards ?? []) {
    if (!ID.test(card.id ?? '') || cards.has(card.id)) bad(`activities.${deck.id}.cards`, `bad or duplicate card id ${card.id}`);
    cards.set(card.id, card);
  }

  const options = (path: string, opts: string[] | undefined, answer: unknown) => {
    if (typeof answer === 'number') {
      if (!Array.isArray(opts) || opts.length < 2 || opts.length > 6) return bad(path, 'a choice needs 2 to 6 options');
      if (new Set(opts.map((o) => o.trim().toLowerCase())).size !== opts.length) bad(path, 'options repeat');
      if (!Number.isInteger(answer) || answer < 0 || answer >= opts.length) bad(path, 'the answer is not one of the options');
      opts.forEach((opt, i) => textOk(`${path}.options[${i}]`, opt, 300));
    } else if (Array.isArray(answer)) {
      if (!answer.length || answer.some((value) => typeof value !== 'string' || !value.trim())) bad(path, 'needs accepted answers');
    } else if (answer && typeof answer === 'object' && 'numeric' in (answer as object)) {
      const numeric = answer as { numeric: number; tolerance?: number };
      if (!Number.isFinite(numeric.numeric) || (numeric.tolerance !== undefined && !(numeric.tolerance >= 0))) bad(path, 'bad numeric answer');
    } else bad(path, 'needs an answer');
  };

  // --- activities ---------------------------------------------------------------------------------
  for (const activity of activities.values()) {
    const path = `activities.${activity.id}`;
    if (!(ACTIVITY_KINDS as readonly string[]).includes(activity.kind)) { bad(path, `unknown kind ${activity.kind}`); continue; }
    localized(`${path}.title`, activity.title, 120);
    skill(`${path}.node`, activity.node);
    if (!Array.isArray(activity.levels) || activity.levels.length !== 2 || activity.levels[0] > activity.levels[1]) bad(`${path}.levels`, 'needs [min, max]');
    else activity.levels.forEach((value) => level(`${path}.levels`, value));
    if (!(activity.minutes >= 1 && activity.minutes <= 120)) bad(`${path}.minutes`, 'must be 1 to 120');

    switch (activity.kind) {
      case 'speaking_exam': {
        rubric(`${path}.rubric`, activity.rubric);
        const parts = new Map(activity.parts.map((part) => [part.id, part]));
        if (!activity.parts.length || parts.size !== activity.parts.length) bad(`${path}.parts`, 'needs parts with distinct ids');
        for (const part of activity.parts) {
          const ppath = `${path}.parts.${part.id}`;
          localized(`${ppath}.title`, part.title, 80);
          textOk(`${ppath}.intro`, part.intro, 600);
          const s = part.answerSeconds;
          if (!s || !(s.min > 0 && s.min <= s.target && s.target <= s.max && s.max <= 300)) bad(`${ppath}.answerSeconds`, 'needs 0 < min ≤ target ≤ max ≤ 300');
          if (part.kind === 'questions') {
            if (part.fromCard) { if (parts.get(part.fromCard)?.kind !== 'long_turn') bad(`${ppath}.fromCard`, 'must name a long_turn part'); }
            else {
              const topics = part.topics ?? [];
              if (!topics.length) bad(`${ppath}.topics`, 'needs topics or fromCard');
              if (!(part.pickTopics! >= 1 && part.pickTopics! <= topics.length && part.askPerTopic! >= 1)) bad(ppath, 'pickTopics and askPerTopic must fit the topics');
              for (const topic of topics) {
                if ((topic.questions ?? []).length < (part.askPerTopic ?? 1)) bad(`${ppath}.topics.${topic.id}`, 'has fewer questions than askPerTopic');
                topic.questions.forEach((question, i) => textOk(`${ppath}.topics.${topic.id}[${i}]`, question, 300));
              }
            }
          } else if (part.kind === 'long_turn') {
            if (!(part.cards ?? []).length) bad(`${ppath}.cards`, 'needs cue cards');
            const ids = new Set<string>();
            for (const card of part.cards ?? []) {
              const cpath = `${ppath}.cards.${card.id}`;
              if (!ID.test(card.id ?? '') || ids.has(card.id)) bad(cpath, 'bad or duplicate id');
              ids.add(card.id);
              textOk(`${cpath}.topic`, card.topic, 300);
              if ((card.points ?? []).length < 3) bad(`${cpath}.points`, 'needs at least three points');
              if (!(card.prepSeconds > 0 && card.talkSeconds > 0 && card.minTalkSeconds > 0 && card.minTalkSeconds <= card.talkSeconds)) bad(cpath, 'needs prep, talk and a minimum talk time ≤ talk');
              if ((card.discussion ?? []).length < 3) bad(`${cpath}.discussion`, 'needs at least three discussion questions');
            }
          } else bad(`${ppath}.kind`, 'must be questions or long_turn');
        }
        break;
      }
      case 'roleplay': {
        rubric(`${path}.rubric`, activity.rubric);
        localized(`${path}.setting`, activity.setting, 600);
        localized(`${path}.learnerRole`, activity.learnerRole, 300);
        localized(`${path}.goal`, activity.goal, 400);
        for (const key of ['name', 'role', 'style', 'opening'] as const) textOk(`${path}.persona.${key}`, activity.persona?.[key], 1200);
        const fields = new Map<string, Roleplay['hiddenState']['fields'][number]>();
        for (const field of activity.hiddenState?.fields ?? []) {
          if (!/^[a-z][a-z0-9_]{1,40}$/.test(field.id) || fields.has(field.id)) bad(`${path}.hiddenState`, `bad or duplicate field ${field.id}`);
          fields.set(field.id, field);
          textOk(`${path}.hiddenState.${field.id}.description`, field.description, 400);
          if (field.kind === 'enum' && !(field.values ?? []).length) bad(`${path}.hiddenState.${field.id}`, 'an enum needs values');
          if (field.kind === 'number' && !(Number.isFinite(field.min) && Number.isFinite(field.max) && field.min! < field.max!)) bad(`${path}.hiddenState.${field.id}`, 'a number needs min < max');
          const value = activity.hiddenState.initial?.[field.id];
          const fits = field.kind === 'number' ? typeof value === 'number' && value >= field.min! && value <= field.max!
            : field.kind === 'boolean' ? typeof value === 'boolean' : typeof value === 'string' && (field.values ?? []).includes(value);
          if (!fits) bad(`${path}.hiddenState.initial.${field.id}`, 'missing or out of range');
        }
        for (const key of Object.keys(activity.hiddenState?.initial ?? {})) if (!fields.has(key)) bad(`${path}.hiddenState.initial`, `unknown field ${key}`);
        textOk(`${path}.hiddenState.rules`, activity.hiddenState?.rules, 3000);
        const goals = new Set<string>();
        if (!(activity.goals ?? []).length) bad(`${path}.goals`, 'needs goals');
        for (const goal of activity.goals ?? []) {
          if (!/^[a-z][a-z0-9_]{1,40}$/.test(goal.id) || goals.has(goal.id)) bad(`${path}.goals`, `bad or duplicate goal ${goal.id}`);
          goals.add(goal.id);
          localized(`${path}.goals.${goal.id}`, goal.text, 200);
          textOk(`${path}.goals.${goal.id}.check`, goal.check, 400);
        }
        for (const metric of activity.scorecard ?? []) if (!['talk_ratio', 'questions_asked', 'average_turn_words', 'pace'].includes(metric)) bad(`${path}.scorecard`, `unknown metric ${metric}`);
        if (!(activity.minTurns >= 2 && activity.minTurns <= activity.maxTurns && activity.maxTurns <= 20)) bad(path, 'needs 2 ≤ minTurns ≤ maxTurns ≤ 20');
        let last = -Infinity;
        for (const [max, note] of activity.levelNotes ?? []) { level(`${path}.levelNotes`, max); if (max <= last) bad(`${path}.levelNotes`, 'must go up by level'); last = max; textOk(`${path}.levelNotes.${max}`, note, 600); }
        if (!(activity.levelNotes ?? []).length) bad(`${path}.levelNotes`, 'needs at least one level note');
        for (const id of activity.phrases ?? []) if (!cards.has(id)) bad(`${path}.phrases`, `unknown card ${id}`);
        break;
      }
      case 'writing': {
        rubric(`${path}.rubric`, activity.rubric);
        textOk(`${path}.prompt`, activity.prompt, 2000);
        textOk(`${path}.assessorNotes`, activity.assessorNotes, 2000);
        if (!(activity.minWords >= 20 && activity.minWords <= 1000)) bad(`${path}.minWords`, 'must be 20 to 1000');
        if (!(activity.recommendedMinutes >= 5 && activity.recommendedMinutes <= 90)) bad(`${path}.recommendedMinutes`, 'must be 5 to 90');
        if (activity.data) {
          const data = activity.data;
          if (!data.columns?.length || !data.rows?.length || data.rows.some((row) => row.length !== data.columns.length)) bad(`${path}.data`, 'rows must match the columns');
          textOk(`${path}.data.note`, data.note, 200);
        }
        const scale = rubrics.get(activity.rubric)?.scale;
        for (const value of activity.ladder ?? []) if (scale && !onScale(scale, value)) bad(`${path}.ladder`, `${value} is not on the rubric scale`);
        break;
      }
      case 'quiz_set': {
        if (activity.mode === 'reading' && !activity.passage?.text) bad(`${path}.passage`, 'a reading set needs a passage');
        if (activity.mode === 'listening' && !activity.audio?.script) bad(`${path}.audio`, 'a listening set needs a script');
        if (!(activity.timeLimitSeconds >= 30 && activity.timeLimitSeconds <= 3600)) bad(`${path}.timeLimitSeconds`, 'must be 30 to 3600');
        const source = activity.passage?.text ?? activity.audio?.script ?? '';
        if (source) textOk(`${path}.source`, source, 12000);
        const ids = new Set<string>();
        if ((activity.questions ?? []).length < 3) bad(`${path}.questions`, 'needs at least three questions');
        for (const question of activity.questions ?? []) {
          const qpath = `${path}.${question.id}`;
          if (!ID.test(question.id ?? '') || ids.has(question.id)) bad(qpath, 'bad or duplicate id');
          ids.add(question.id);
          if (!types.has(question.type)) bad(`${qpath}.type`, `unknown question type ${question.type}`);
          textOk(`${qpath}.prompt`, question.prompt, 1200);
          options(qpath, question.options, question.answer);
          localized(`${qpath}.explanation`, question.explanation, 1200);
          if (question.evidence && source && !quoteFound(question.evidence, source)) bad(`${qpath}.evidence`, 'is not in the passage or script');
          if (question.wordLimit && Array.isArray(question.answer) && question.answer.some((value) => countWords(value) > question.wordLimit!)) bad(`${qpath}.answer`, 'an accepted answer is over the word limit');
          if (Array.isArray(question.answer) && activity.mode !== 'practice' && source && !question.answer.some((value) => quoteFound(value, source))) bad(`${qpath}.answer`, 'no accepted answer appears in the passage or script');
          for (const [i, hint] of (question.hints ?? []).entries()) localized(`${qpath}.hints[${i}]`, hint, 600);
        }
        break;
      }
      case 'deck': {
        if (!['word', 'phrase'].includes(activity.cardType)) bad(`${path}.cardType`, 'must be word or phrase');
        for (const card of activity.cards ?? []) {
          const cpath = `${path}.${card.id}`;
          textOk(`${cpath}.front`, card.front, 120);
          textOk(`${cpath}.meaning`, card.meaning, 300);
          textOk(`${cpath}.example`, card.example, 400);
          for (const locale of languages) if (locale !== m.practiceLanguage && !card.translations?.[locale]?.trim()) bad(`${cpath}.translations`, `missing ${locale}`);
          const wrong = (card.distractors ?? []).map((value) => value.trim().toLowerCase());
          if (wrong.length < 3 || new Set(wrong).size !== wrong.length) bad(`${cpath}.distractors`, 'needs three distinct wrong options');
          // Cards are reviewed as Telegram quiz polls: options are at most 100 characters.
          for (const option of [activity.cardType === 'word' ? card.meaning : card.front, ...(card.distractors ?? [])]) if ((option ?? '').length > 100) bad(`${cpath}`, 'a quiz option is longer than 100 characters');
          const right = (activity.cardType === 'word' ? card.meaning : card.front).trim().toLowerCase();
          if (wrong.includes(right)) bad(`${cpath}.distractors`, 'a wrong option equals the right one');
          if (activity.cardType === 'phrase') textOk(`${cpath}.situation`, card.situation, 300);
        }
        break;
      }
      case 'drill': {
        if (!errorTags.has(activity.errorTag)) bad(`${path}.errorTag`, `unknown error tag ${activity.errorTag}`);
        localized(`${path}.explain`, activity.explain, 800);
        if ((activity.items ?? []).length < DEPTH.drillItems) bad(`${path}.items`, `needs at least ${DEPTH.drillItems}`);
        const ids = new Set<string>();
        for (const item of activity.items ?? []) {
          if (!ID.test(item.id ?? '') || ids.has(item.id)) bad(`${path}.items`, `bad or duplicate id ${item.id}`);
          ids.add(item.id);
          textOk(`${path}.${item.id}.prompt`, item.prompt, 600);
          options(`${path}.${item.id}`, item.options, item.answer);
          localized(`${path}.${item.id}.explanation`, item.explanation, 800);
        }
        break;
      }
      case 'shadowing': {
        for (const sentence of activity.sentences ?? []) {
          const words = countWords(sentence.text ?? '');
          if (words < 3 || words > 25) bad(`${path}.${sentence.id}`, 'a shadowing sentence needs 3 to 25 words');
          localized(`${path}.${sentence.id}.focus`, sentence.focus, 200);
        }
        break;
      }
      case 'lesson': {
        localized(`${path}.body`, activity.body, 3000);
        textOk(`${path}.example`, activity.example, 600);
        options(`${path}.check`, activity.check?.options, activity.check?.answer);
        localized(`${path}.check.explanation`, activity.check?.explanation, 800);
        break;
      }
      case 'photo_help': {
        textOk(`${path}.subject`, activity.subject, 80);
        textOk(`${path}.instructions`, activity.instructions, 3000);
        if (!(activity.hintLevels >= 1 && activity.hintLevels <= 5)) bad(`${path}.hintLevels`, 'must be 1 to 5');
        break;
      }
    }
  }
  for (const drill of ofKind('drill')) if (!m.errorTags?.some((tag) => tag.id === drill.errorTag)) bad(`activities.${drill.id}`, 'its error tag is not in the manifest');

  // --- depth standard ---------------------------------------------------------------------------
  const depth = (offered: boolean, actual: number, needed: number, what: string) => { if (offered && actual < needed) bad('depth', `${what}: ${actual} of at least ${needed}`); };
  const exams = ofKind('speaking_exam');
  const part1 = new Set(exams.flatMap((exam) => exam.parts.filter((part) => part.kind === 'questions' && !part.fromCard).flatMap((part) => (part.topics ?? []).flatMap((topic) => topic.questions))));
  const cues = new Set(exams.flatMap((exam) => exam.parts.flatMap((part) => (part.cards ?? []).map((card) => card.id))));
  const sets = (mode: string) => ofKind('quiz_set').filter((set) => set.mode === mode).length;
  const deckCards = (type: Deck['cardType']) => ofKind('deck').filter((deck) => deck.cardType === type).reduce((sum, deck) => sum + deck.cards.length, 0);
  depth(true, source.diagnostic?.items?.length ?? 0, DEPTH.diagnosticItems, 'diagnostic items');
  depth(menu.has('speaking'), part1.size, DEPTH.part1Questions, 'short speaking questions');
  depth(menu.has('speaking') && exams.some((exam) => exam.parts.some((part) => part.kind === 'long_turn')), cues.size, DEPTH.cueCards, 'cue cards');
  depth(menu.has('roleplay'), ofKind('roleplay').length, DEPTH.roleplays, 'role-plays');
  depth(menu.has('writing'), ofKind('writing').length, DEPTH.writingTasks, 'writing tasks');
  depth(menu.has('reading'), sets('reading'), DEPTH.readingSets, 'reading sets');
  depth(menu.has('listening'), sets('listening'), DEPTH.listeningSets, 'listening sets');
  depth(menu.has('practice'), sets('practice'), DEPTH.practiceSets, 'practice sets');
  depth(menu.has('vocab'), deckCards('word'), DEPTH.deckCards, 'vocabulary cards');
  depth(menu.has('phrases'), deckCards('phrase'), DEPTH.deckCards, 'phrase cards');
  depth(menu.has('drill'), ofKind('drill').length, DEPTH.drills, 'drills');
  depth(menu.has('shadowing'), ofKind('shadowing').reduce((sum, set) => sum + set.sentences.length, 0), DEPTH.shadowingSentences, 'shadowing sentences');
  depth(menu.has('lesson'), ofKind('lesson').length, DEPTH.lessons, 'lessons');

  // --- diagnostic -------------------------------------------------------------------------------
  const d = source.diagnostic;
  if (!d) bad('diagnostic', 'missing');
  else {
    localized('diagnostic.intro', d.intro, 1200);
    if (!(d.minutes >= 2 && d.minutes <= 30)) bad('diagnostic.minutes', 'must be 2 to 30');
    if (!(d.passRatio > 0 && d.passRatio <= 1)) bad('diagnostic.passRatio', 'must be in (0, 1]');
    if ((d.items ?? []).length > 30) bad('diagnostic.items', 'at most 30 (they must fit in button data)');
    const ids = new Set<string>();
    for (const item of d.items ?? []) {
      const ipath = `diagnostic.${item.id}`;
      if (!/^[a-z0-9][a-z0-9_-]{0,30}$/.test(item.id ?? '') || ids.has(item.id)) bad(ipath, 'bad or duplicate id');
      ids.add(item.id);
      skill(`${ipath}.skill`, item.skill);
      level(`${ipath}.level`, item.level);
      if (item.kind === 'question') {
        textOk(`${ipath}.prompt`, item.prompt, 600);
        if (!Array.isArray(item.options) || item.options.length < 2 || item.options.length > 4) bad(ipath, 'a question needs 2 to 4 options');
        else options(ipath, item.options, item.answer);
        if (item.passage) textOk(`${ipath}.passage`, item.passage, 1500);
      } else if (item.kind === 'can_do') {
        localized(`${ipath}.prompt`, typeof item.prompt === 'string' ? undefined : item.prompt, 300);
        if (item.options || item.answer !== undefined) bad(ipath, 'a can-do statement has no options or answer');
      } else bad(`${ipath}.kind`, 'must be question or can_do');
    }
  }

  // --- fluency, plan, reminders, milestones, samples, facts ------------------------------------------
  const f = source.fluency;
  if (!f) bad('fluency', 'missing');
  else {
    const practice = m.practiceLanguage === 'mixed' ? languages : [m.practiceLanguage];
    for (const locale of practice) if (!(f.fillers?.[locale] ?? []).length) bad('fluency.fillers', `needs fillers for ${locale}`);
    if (!(f.longPauseSeconds >= 0.5 && f.longPauseSeconds <= 10)) bad('fluency.longPauseSeconds', 'must be 0.5 to 10');
    let last = -Infinity;
    for (const [minLevel, low, high] of f.pace ?? []) {
      level('fluency.pace', minLevel);
      if (minLevel <= last || !(low > 0 && low < high && high < 300)) bad('fluency.pace', 'entries go up by level with 0 < min < max < 300 wpm');
      last = minLevel;
    }
    if (!(f.pace ?? []).length) bad('fluency.pace', 'needs a pace band');
  }

  const p = source.plan;
  if (!p) bad('plan', 'missing');
  else {
    for (const value of p.goal?.options ?? []) level('plan.goal.options', value);
    if (!(p.goal?.options ?? []).includes(p.goal?.default)) bad('plan.goal.default', 'must be one of the options');
    if (!['required', 'optional', 'none'].includes(p.goal?.examDate)) bad('plan.goal.examDate', 'must be required, optional or none');
    if (!(p.goal?.defaultWeeks >= 1 && p.goal.defaultWeeks <= 104)) bad('plan.goal.defaultWeeks', 'must be 1 to 104');
    if (!(p.dailyMinutes?.options ?? []).includes(p.dailyMinutes?.default) || p.dailyMinutes.options.some((value) => !(value >= 5 && value <= 180))) bad('plan.dailyMinutes', 'options 5 to 180 with the default among them');
    let previous = Infinity;
    const slotHas: Record<PlanSlot, boolean> = {
      speaking: exams.length > 0, roleplay: ofKind('roleplay').length > 0, writing: ofKind('writing').length > 0,
      reading: sets('reading') > 0, listening: sets('listening') > 0, practice: sets('practice') > 0,
      vocab: ofKind('deck').length > 0, drill: ofKind('drill').length > 0, shadowing: ofKind('shadowing').length > 0,
      lesson: ofKind('lesson').length > 0, photo: ofKind('photo_help').length > 0,
    };
    for (const phase of p.phases ?? []) {
      if (!(phase.minWeeksLeft < previous)) bad(`plan.phases.${phase.id}`, 'phases go from most weeks left to fewest');
      previous = phase.minWeeksLeft;
      localized(`plan.phases.${phase.id}.title`, phase.title, 80);
      const entries = Object.entries(phase.mix ?? {});
      if (!entries.length) bad(`plan.phases.${phase.id}.mix`, 'needs slots');
      for (const [slot, weight] of entries) {
        if (!(PLAN_SLOTS as readonly string[]).includes(slot)) bad(`plan.phases.${phase.id}.mix`, `unknown slot ${slot}`);
        else if (!slotHas[slot as PlanSlot]) bad(`plan.phases.${phase.id}.mix`, `the pack has no content for ${slot}`);
        if (!(weight! > 0)) bad(`plan.phases.${phase.id}.mix.${slot}`, 'weight must be positive');
      }
    }
    if (!(p.phases ?? []).length || p.phases.at(-1)!.minWeeksLeft !== 0) bad('plan.phases', 'the last phase must have minWeeksLeft 0');
    if (p.weeklyMock) {
      if (!activities.has(p.weeklyMock.activity)) bad('plan.weeklyMock.activity', `unknown ${p.weeklyMock.activity}`);
      if (!(Number.isInteger(p.weeklyMock.weekday) && p.weeklyMock.weekday >= 0 && p.weeklyMock.weekday <= 6)) bad('plan.weeklyMock.weekday', 'must be 0 to 6');
      localized('plan.weeklyMock.title', p.weeklyMock.title, 80);
    }
    for (const [mode, table] of Object.entries(p.estimates ?? {})) {
      let last = -1;
      for (const [accuracy, value] of table ?? []) {
        if (!(accuracy >= 0 && accuracy <= 1) || accuracy <= last) bad(`plan.estimates.${mode}`, 'accuracies rise from 0 to 1');
        last = accuracy;
        level(`plan.estimates.${mode}`, value);
      }
      if (!sets(mode)) bad(`plan.estimates.${mode}`, `the pack has no ${mode} sets`);
    }
    for (const link of p.links ?? []) {
      localized(`plan.links.${link.id}`, link.label, 80);
      let host = '';
      try { const url = new URL(link.url); host = url.protocol === 'https:' ? url.hostname : ''; } catch { /* reported below */ }
      if (!(host === 'schood.online' || host.endsWith('.schood.online'))) bad(`plan.links.${link.id}`, 'links go to https://*.schood.online only');
    }
  }

  const r = source.reminders;
  if (!r) bad('reminders', 'missing');
  else {
    if ((r.daily ?? []).length < DEPTH.dailyReminders) bad('reminders.daily', `needs at least ${DEPTH.dailyReminders} variants`);
    (r.daily ?? []).forEach((text, i) => localized(`reminders.daily[${i}]`, text, 400));
    if ((r.comeback ?? []).length < 2) bad('reminders.comeback', 'needs at least two');
    (r.comeback ?? []).forEach((text, i) => localized(`reminders.comeback[${i}]`, text, 400));
    localized('reminders.weekly', r.weekly, 400);
    if ((r.countdown ?? []).length < 2) bad('reminders.countdown', 'needs at least two');
    (r.countdown ?? []).forEach((text, i) => localized(`reminders.countdown[${i}]`, text, 400));
  }

  const milestones = new Set<string>();
  if ((source.milestones ?? []).length < DEPTH.milestones) bad('milestones', `needs at least ${DEPTH.milestones}`);
  for (const milestone of source.milestones ?? []) {
    const mpath = `milestones.${milestone.id}`;
    if (!ID.test(milestone.id ?? '') || milestones.has(milestone.id)) bad(mpath, 'bad or duplicate id');
    milestones.add(milestone.id);
    localized(`${mpath}.name`, milestone.name, 80);
    level(`${mpath}.level`, milestone.level);
    const target = rubrics.get(milestone.rule?.rubric);
    if (!target) bad(`${mpath}.rule.rubric`, `unknown rubric ${milestone.rule?.rubric}`);
    else {
      if (milestone.rule.metric !== 'overall' && !target.criteria.some((criterion) => criterion.id === milestone.rule.metric && criterion.source === 'model')) bad(`${mpath}.rule.metric`, 'must be overall or a scored criterion');
      // Overall results move in the overall step (IELTS: whole-band criteria, half-band overall).
      const scale = milestone.rule.metric === 'overall' ? { ...target.scale, step: target.overall?.step ?? target.scale.step } : target.scale;
      if (!onScale(scale, milestone.rule.min)) bad(`${mpath}.rule.min`, 'is not on the rubric scale');
    }
    if (!(milestone.rule?.count >= 1 && milestone.rule.count <= 20 && milestone.rule.withinDays >= 1 && milestone.rule.withinDays <= 180)) bad(`${mpath}.rule`, 'count 1–20 within 1–180 days');
  }

  if ((source.samples ?? []).length < DEPTH.samples) bad('samples', `needs at least ${DEPTH.samples}`);
  for (const sample of source.samples ?? []) {
    if (!['speaking_report', 'writing_report', 'weekly_report', 'roleplay_review', 'plan'].includes(sample.kind)) bad(`samples.${sample.id}`, `unknown kind ${sample.kind}`);
    localized(`samples.${sample.id}.title`, sample.title, 120);
    localized(`samples.${sample.id}.preview`, sample.preview, 1500);
    if (!sample.body || typeof sample.body !== 'object') bad(`samples.${sample.id}.body`, 'needs the example');
  }

  for (const dataset of source.facts ?? []) {
    const fpath = `facts.${dataset.id}`;
    localized(`${fpath}.title`, dataset.title, 120);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dataset.checkedAt ?? '') || Number.isNaN(Date.parse(dataset.checkedAt))) bad(`${fpath}.checkedAt`, 'needs YYYY-MM-DD');
    if (!(dataset.maxAgeDays >= 1 && dataset.maxAgeDays <= 730)) bad(`${fpath}.maxAgeDays`, 'must be 1 to 730');
    if (!/^https:\/\//.test(dataset.source?.url ?? '') || !dataset.source?.name) bad(`${fpath}.source`, 'needs a name and an https URL');
    for (const entry of dataset.entries ?? []) localized(`${fpath}.${entry.id}`, entry.statement, 800);
    if (!(dataset.entries ?? []).length) bad(`${fpath}.entries`, 'needs entries');
  }
  return problems;
}

type Roleplay = Extract<Activity, { kind: 'roleplay' }>;

/** Validates and indexes a pack; throws PackError with every problem. */
export function buildPack(source: PackSource): CoachPack {
  const problems = validatePack(source);
  if (problems.length) throw new PackError(source.manifest?.id ?? 'unknown', problems);
  const byId = new Map(source.activities.map((activity) => [activity.id, activity]));
  const cardById = new Map<string, { deck: Deck; card: DeckCard }>();
  for (const activity of source.activities) if (activity.kind === 'deck') for (const card of activity.cards) cardById.set(card.id, { deck: activity, card });
  return {
    ...source,
    byId,
    rubricById: new Map(source.rubrics.map((rubric) => [rubric.id, rubric])),
    skillById: new Map(source.manifest.skills.map((node) => [node.id, node])),
    errorById: new Map(source.manifest.errorTags.map((tag) => [tag.id, tag])),
    cardById,
    ofKind: <K extends Activity['kind']>(kind: K) => source.activities.filter((activity): activity is Extract<Activity, { kind: K }> => activity.kind === kind),
  };
}

/** Types a pack's source in its own file; validation happens in buildPack. */
export const definePack = (source: PackSource): PackSource => source;
// Re-exported so pack files can check answers the same way the engine does.
export { answerMatches };
