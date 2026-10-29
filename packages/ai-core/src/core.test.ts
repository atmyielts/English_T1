import {
  BETA_CREDITS, CREDIT_PRICES, FEATURES, MONTHLY_CREDITS, PLAN_CODES, PLAN_PRODUCT_ENV, SSEParser, candidateModels, cleanSwitches, costUsd,
  creditPrice, expandPlans, featureAccess, featureSwitch, formatSSE, keyMayReach, modelProblems, monthlyGrant, nextTashkentMidnight,
  pickRoute, priceTableProblems, providerProblems, quoteCredits, routeKeysFor, routeProblems, s, SchemaError, tashkentDay, tashkentMonth,
  type Registry, type RegistryModel, type RegistryProvider,
} from './mod.ts';

const equal = (actual: unknown, expected: unknown, label = '') => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label} expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};
const ok = (value: unknown, label: string) => { if (!value) throw new Error(label); };
const throws = (run: () => unknown, pattern: RegExp, label: string) => {
  try { run(); } catch (cause) { if (pattern.test(String((cause as Error).message))) return; throw new Error(`${label}: wrong error ${cause}`); }
  throw new Error(`${label}: did not throw`);
};

Deno.test('every doc credit row is priced exactly as the table says', () => {
  equal(priceTableProblems(), [], 'price table is consistent');
  const doc: Record<string, number> = {
    'tutor.reply': 1, 'student_assistant.reply': 1, 'teacher_assistant.reply': 1, 'parent.ask': 1, 'admissions.reply': 1, 'knowledge.answer': 1,
    'explain.mistake': 2, 'writing.feedback': 5, 'writing.ladder': 8, 'speaking.turn': 1, 'interview.turn': 1, 'speaking.mock_report': 10, 'interview.report': 10,
    'pronunciation.drill': 1, 'daily.brief': 2, 'study_plan.build': 3, 'gap.replan': 3, 'words.from_text': 2, 'reading.graded': 3, 'photo.explain': 3,
    'essay.review': 8, 'abroad.plan': 5, 'material.generate': 10, 'textbook.lesson': 10, 'material.exam_set': 15, 'placement.generate': 15, 'quiz.pack': 15,
    'material.differentiate': 10, 'marking.script': 4, 'speaking.marking': 4, 'writing.signal': 1, 'lesson.plan': 5, 'course.outline': 10, 'curriculum.unit': 20,
    'feedback.comment': 1, 'parent.message': 1, 'parent.brief': 1, 'marketing.post': 3, 'channel.post': 3, 'brand.post': 3, 'owner.brief': 10,
  };
  for (const [key, credits] of Object.entries(doc)) equal(creditPrice(key as keyof typeof CREDIT_PRICES).credits, credits, key);
  // Every priced AI feature in the catalogue has at least one key.
  const priced = new Set(Object.values(CREDIT_PRICES).map((entry) => entry.feature));
  for (const id of ['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L8', 'L9', 'L10', 'L11', 'L12', 'L13', 'L14', 'L15', 'L16', 'P1', 'P2', 'T1', 'T3', 'T4', 'T5', 'T7', 'T8', 'T9', 'T10', 'T11', 'T13', 'T14', 'T15', 'C2', 'C4', 'C5', 'C8', 'C10', 'C12', 'C13']) ok(priced.has(id), `${id} has a price`);
});

Deno.test('quotes add only allowed add-ons and never trust a cost', () => {
  equal(quoteCredits('material.generate', ['material.differentiate']).credits, 20);
  equal(quoteCredits('material.generate', ['material.differentiate', 'material.differentiate']).credits, 20, 'duplicates count once');
  equal(quoteCredits('photo.explain').requires, ['vision']);
  throws(() => quoteCredits('tutor.reply', ['material.differentiate']), /invalid_add_on/, 'add-on on the wrong key');
  throws(() => quoteCredits('tutor.free'), /unknown_credit_key/, 'unknown key');
});

Deno.test('no plan means no AI; plans unlock exactly their features', () => {
  const personal = (plans: string[], feature: string) => featureAccess(feature, { plans: plans as never, workspaceKind: 'personal', role: 'owner' });
  const centre = (plans: string[], role: string, feature: string) => featureAccess(feature, { plans: plans as never, workspaceKind: 'centre', role: role as never });
  equal(personal([], 'L1'), { allowed: false, reason: 'plan_required', plans: ['plus'] }, 'free user');
  equal(personal([], 'CORE').allowed, false, 'free user has no assistant either');
  equal(personal(['plus'], 'L3').allowed, true);
  equal(personal(['plus'], 'T1'), { allowed: false, reason: 'plan_required', plans: ['teacher'] }, 'cheapest offer only');
  equal(personal(['teacher_pro'], 'T1').allowed, true, 'Teacher Pro includes Teacher');
  equal(personal(['teacher'], 'T11'), { allowed: false, reason: 'plan_required', plans: ['teacher_pro'] });
  equal(personal(['family'], 'P2').allowed, true);
  equal(personal(['centre'], 'L1').allowed, false, 'a workspace plan does nothing in a personal workspace');
  equal(personal([], 'L18').allowed, true, 'gifts are not AI');
  equal(centre(['centre'], 'student', 'L1').allowed, true, 'centre students get the Student Assistant');
  equal(centre(['centre'], 'student', 'L3').allowed, false, 'but not the writing coach');
  equal(centre(['centre'], 'student', 'C10').allowed, false);
  equal(centre(['centre_pro'], 'owner', 'C10').allowed, true);
  equal(centre(['enterprise'], 'teacher', 'C12').allowed, true, 'Enterprise includes Centre Pro');
  equal(centre(['centre'], 'student', 'T1'), { allowed: false, reason: 'role_required', roles: ['owner', 'admin', 'teacher'] });
  equal(centre(['plus'], 'student', 'L1').allowed, false, 'a personal plan does nothing in a centre workspace');
  equal(centre(['centre'], 'parent', 'P1').allowed, true);
  equal(featureAccess('C10', { plans: [], workspaceKind: 'centre', role: 'owner', beta: true }).allowed, true, 'beta unlocks plans');
  equal(featureAccess('C10', { plans: [], workspaceKind: 'centre', role: 'student', beta: true }).allowed, false, 'beta keeps roles');
  equal(featureAccess('X9', { plans: ['plus'], workspaceKind: 'personal', role: 'owner' }), { allowed: false, reason: 'unknown_feature' });
});

Deno.test('plan grants, inclusion and product envs', () => {
  equal([...expandPlans(['enterprise'])].sort(), ['centre', 'centre_pro', 'enterprise']);
  equal(monthlyGrant(['plus']), 1500);
  equal(monthlyGrant(['plus', 'teacher']), 4500, 'separate plans add up');
  equal(monthlyGrant(['teacher_pro', 'teacher']), 8000, 'an included plan adds nothing');
  equal(monthlyGrant([]), 0);
  equal(MONTHLY_CREDITS.centre_pro, 40000);
  ok(BETA_CREDITS.personal > 0 && BETA_CREDITS.centre > 0, 'beta testers can test end to end');
  equal(PLAN_CODES.filter((plan) => !PLAN_PRODUCT_ENV[plan]), ['enterprise'], 'every sold plan has a product env');
  for (const feature of Object.values(FEATURES)) ok(feature.open || feature.plans.length > 0, `${feature.id} has a plan`);
});

const provider = (overrides: Partial<RegistryProvider> = {}): RegistryProvider => ({ key: 'openrouter', adapter: 'openai_compatible', displayName: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', apiKeyEnv: 'OPENROUTER_API_KEY', headers: { 'X-Title': 'Schood AI' }, enabled: true, ...overrides });
const model = (key: string, overrides: Partial<RegistryModel> = {}): RegistryModel => ({ key, providerKey: 'openrouter', modelId: key, displayName: key, capabilities: ['chat', 'stream', 'json'], contextWindow: null, maxOutput: 4096, inputUsdPerMTok: 0, outputUsdPerMTok: 0, noTraining: false, enabled: true, ...overrides });

Deno.test('provider keys can only reach their own provider', () => {
  equal(providerProblems(provider()), []);
  equal(providerProblems(provider({ apiKeyEnv: 'SUPABASE_SERVICE_ROLE_KEY' })), ['api_key_env'], 'Supabase secrets can never be named');
  equal(providerProblems(provider({ apiKeyEnv: 'CLICK_SECRET_KEY' })), ['api_key_env']);
  equal(providerProblems(provider({ baseUrl: 'https://evil.example/api/v1' })), ['base_url'], 'a well-known key stays on its host');
  equal(providerProblems(provider({ baseUrl: 'http://openrouter.ai/api/v1' })), ['base_url'], 'https only');
  equal(providerProblems(provider({ apiKeyEnv: 'SCHOOD_AI_KEY_AZURE', baseUrl: 'https://schood.openai.azure.com/openai' })), [], 'custom keys go to custom hosts');
  equal(providerProblems(provider({ headers: { Authorization: 'Bearer x' } })), ['headers'], 'the adapter owns authentication');
  equal(keyMayReach('OPENAI_API_KEY', 'https://user:pw@api.openai.com/v1'), false);
  equal(modelProblems(model('openrouter/auto', { modelId: 'openrouter/auto' })), ['model_id'], 'no silent paid router');
  equal(routeProblems({ key: 'default', modelKeys: ['a1', 'a1'], requiredCapabilities: [], requireNoTraining: false, maxOutputTokens: null, temperature: null, enabled: true }), ['model_keys']);
});

Deno.test('routes resolve most specific first and filter models by capability, policy and health', () => {
  equal(routeKeysFor('tutor.reply', 'standard'), ['tutor.reply', 'tutor', 'tier.standard', 'default']);
  const route = (key: string, modelKeys: string[], extra = {}) => ({ key, modelKeys, requiredCapabilities: [], requireNoTraining: false, maxOutputTokens: null, temperature: null, enabled: true, ...extra });
  const registry: Registry = {
    providers: [provider(), provider({ key: 'off', enabled: false })],
    models: [model('free-a'), model('vision-b', { capabilities: ['chat', 'vision', 'json_schema'] }), model('safe-c', { noTraining: true }), model('off-d', { providerKey: 'off' }), model('disabled-e', { enabled: false })],
    routes: [route('default', ['free-a']), route('tutor', ['safe-c', 'free-a'], { requireNoTraining: true }), route('tier.vision', ['free-a', 'vision-b']), route('photo.explain', ['vision-b'], { enabled: false })],
  };
  equal(pickRoute(registry.routes, 'tutor.reply', 'standard')?.key, 'tutor');
  equal(pickRoute(registry.routes, 'photo.explain', 'vision')?.key, 'tier.vision', 'a disabled route is skipped');
  equal(pickRoute(registry.routes, 'lesson.plan', 'standard')?.key, 'default');
  const tutor = candidateModels(registry, registry.routes[1], { capabilities: [], noTraining: false });
  equal(tutor.candidates.map((c) => c.model.key), ['safe-c']);
  equal(tutor.skipped, [{ key: 'free-a', reason: 'policy' }], 'children-safe route refuses training models');
  const vision = candidateModels(registry, registry.routes[2], { capabilities: ['vision', 'json'], noTraining: false });
  equal(vision.candidates.map((c) => c.model.key), ['vision-b'], 'json_schema covers json');
  equal(candidateModels(registry, route('x', ['off-d', 'disabled-e', 'gone', 'free-a']), { capabilities: [], noTraining: false }, (key) => key !== 'free-a').skipped.map((s) => s.reason), ['provider_disabled', 'disabled', 'unknown', 'unhealthy']);
  equal(costUsd({ inputUsdPerMTok: 0.5, outputUsdPerMTok: 1.5 }, 2000, 1000), 0.0025);
});

Deno.test('schemas parse model output and describe it', () => {
  const answer = s.object({ title: s.string({ min: 1, max: 20 }), score: s.number({ min: 0, max: 9 }), level: s.enumOf(['A1', 'B2'] as const), tags: s.array(s.string(), { max: 3 }), note: s.optional(s.string()) });
  equal(answer.parse({ title: ' Hi ', score: '7.5', level: 'B2', tags: ['a'], extra: 1 }), { title: 'Hi', score: 7.5, level: 'B2', tags: ['a'] }, 'unknown keys dropped, numbers coerced');
  try { answer.parse({ title: 'x', score: 10, level: 'B2', tags: [] }); throw new Error('accepted'); } catch (cause) { equal((cause as SchemaError).path, 'score'); }
  try { answer.parse({ title: 'x', score: 1, level: 'B2', tags: ['a', 'b', 'c', 'd'] }); throw new Error('accepted'); } catch (cause) { equal((cause as SchemaError).path, 'tags'); }
  equal((answer.json.required as string[]).sort(), ['level', 'score', 'tags', 'title']);
  equal(s.nullable(s.boolean()).parse(null), null);
});

Deno.test('SSE survives arbitrary chunking, CRLF and comments', () => {
  const wire = ': ping\r\nevent: delta\r\ndata: {"text":"Sal"}\r\n\r\nevent: delta\ndata: {"text":"om"}\n\ndata: line1\ndata: line2\n\n' + formatSSE('done', { ok: true });
  for (const size of [1, 2, 3, 7, 1000]) {
    const parser = new SSEParser(), events = [];
    for (let i = 0; i < wire.length; i += size) events.push(...parser.push(wire.slice(i, i + size)));
    events.push(...parser.flush());
    equal(events.map((e) => [e.event, e.data]), [['delta', '{"text":"Sal"}'], ['delta', '{"text":"om"}'], ['message', 'line1\nline2'], ['done', '{"ok":true}']], `chunk ${size}`);
  }
  const tail = new SSEParser();
  tail.push('data: [DONE]');
  equal(tail.flush().map((e) => e.data), ['[DONE]'], 'a last event without a blank line');
});

Deno.test('switches, Tashkent days and months', () => {
  equal(featureSwitch({ enabled: false, features: {} }, 'tutor.reply'), { on: false, scope: 'global' });
  equal(featureSwitch({ enabled: true, features: { tutor: false } }, 'tutor.reply'), { on: false, scope: 'feature' });
  equal(featureSwitch({ enabled: true, features: { tutor: false, 'tutor.reply': true } }, 'tutor.reply'), { on: true }, 'most specific wins');
  equal(featureSwitch({ enabled: true, features: {}, workspace: { marketing: false } }, 'marketing.post'), { on: false, scope: 'workspace' });
  equal(cleanSwitches({ tutor: false, 'Bad Key': true, x: 'yes' }), { tutor: false });
  equal(tashkentDay(new Date('2026-10-31T19:30:00Z')), '2026-11-01', 'after 19:00 UTC it is tomorrow in Tashkent');
  equal(tashkentMonth(new Date('2026-10-31T19:30:00Z')), '2026-11');
  equal(nextTashkentMidnight(new Date('2026-10-30T10:00:00Z')).toISOString(), '2026-10-30T19:00:00.000Z');
});
