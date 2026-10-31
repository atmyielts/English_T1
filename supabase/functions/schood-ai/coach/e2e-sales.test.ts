import type { Roleplay } from '../../../../packages/coach-packs/src/mod.ts';
import { packFor } from '../../../../packages/coach-packs/src/registry.ts';
import { equal, ID, ok } from '../fixture.test.ts';
import { coachStack, flowOf, takePlacement } from './harness.ts';

// B4 Sales Coach, end to end in English, Uzbek and Russian: placement, a goal, voice
// role-plays against a buyer whose hidden state (budget, pain, decision power, mood)
// reacts, the scorecard (talk ratio, questions, objections handled, next step) and the
// replay with better lines; the script builder for the learner's own product and the
// role-play with their own buyer; rapid-fire objection drills, a lesson, a DM scored
// with quotes, the weekly mock call, team mode with the manager's board, and the
// saved scripts in the Mini App.

const CHAT = '700100';
const LINES = [
  'Good afternoon, this is Aziz from a supply company. Is now a good moment for two minutes?',
  'How do you choose suppliers today, and what is the biggest problem with deliveries?',
  'I understand the price matters. Could we compare the cost of a missed delivery with our price?',
  'Shall we book a short meeting on Thursday at ten so I can show you the numbers?',
];

Deno.test('B4 Sales Coach: buyer role-plays with hidden state, the scorecard, the script builder and own-product buyer, drills and team mode', async () => {
  const s = await coachStack();
  const { user, fresh, texts, data, buttons } = s;
  const pack = s.runtime.packs.get('sales')!;
  let out = await takePlacement(s, 'sales', CHAT, 'en', 'strong');
  ok(texts(out).some((text) => text.includes('placement result')), 'placement in English');
  await user.tap('sales', CHAT, 'g:t:4');
  await user.tap('sales', CHAT, 'g:d:none');
  await user.tap('sales', CHAT, 'g:m:20');
  await user.tap('sales', CHAT, 'g:r:1800');
  out = fresh();
  ok(texts(out).some((text) => text.includes('Your plan is ready')), 'plan ready');

  // The chooser: five role-plays at the learner's level, plus the own-product buyer.
  await user.tap('sales', CHAT, 'm:roleplay');
  out = fresh();
  ok(data(out, /^sc:list$/), 'the own-product buyer is offered');
  const options = (await s.coach.store.enrollment(ID.plus, 'sales'))!.state.options as string[];
  equal(options.length, 5, 'five buyers to pick from');
  const index = options.findIndex((option) => (pack.byId.get(option.slice(3)) as Roleplay).goals.some((goal) => goal.kind === 'objection'));
  ok(index >= 0, 'a buyer who raises objections is among them');
  const activity = pack.byId.get(options[index].slice(3)) as Roleplay;
  await user.tap('sales', CHAT, `o:${index}`);
  out = fresh();
  ok(texts(out).some((text) => text.includes(activity.persona.opening.slice(0, 30).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'))), 'the persona opens in English');
  ok(out.some((call) => call.method === 'sendVoice'), 'and speaks');
  const before = (await flowOf(s, ID.plus, 'sales')).hidden as Record<string, unknown>;
  for (const field of ['budget', 'pain', 'decision_power', 'mood']) ok(field in before, `hidden ${field}`);
  for (const line of LINES.slice(0, 3)) await user.voice('sales', CHAT, line, 9);
  out = fresh();
  equal(texts(out).filter((text) => text.includes('Could you tell me a little more')).length, 3, 'the buyer answers each line');
  const after = (await flowOf(s, ID.plus, 'sales')).hidden as Record<string, number | string | boolean>;
  ok(JSON.stringify(after) !== JSON.stringify(before), 'the hidden state moved');
  for (const field of activity.hiddenState.fields) if (field.kind === 'number') ok((after[field.id] as number) >= field.min! && (after[field.id] as number) <= field.max!, `${field.id} stays in range`);
  const persona = s.knobs.prompts.filter((prompt) => prompt.includes('You play ')).at(-1)!;
  ok(persona.includes('in English') && persona.includes('budget'), 'the persona speaks English and knows its hidden state');
  await user.tap('sales', CHAT, 'rp:end');
  out = fresh();
  const review = texts(out).join('\n');
  ok(review.includes('review') && review.includes('You spoke'), `the review and talk ratio: ${review.slice(0, 400)}`);
  ok(review.includes('Objections handled') && review.includes('Next step secured'), 'objections handled and the next step');
  ok(review.includes('Replay with better lines'), 'the replay with better lines');
  ok(review.includes('was thinking'), 'the hidden state revealed');
  const session = (await s.coach.store.sessions(ID.plus, 'sales', { limit: 1, kind: 'roleplay' }))[0];
  const scorecard = session.summary.scorecard as { talkRatio: number; questionsAsked: number; objectionsHandled: number; objectionsTotal: number; nextStep: boolean };
  ok(scorecard.questionsAsked >= 1 && scorecard.objectionsTotal >= 1 && typeof scorecard.nextStep === 'boolean', `the scorecard is stored: ${JSON.stringify(scorecard)}`);
  equal(session.rubric, 'sales.call', 'scored on the call rubric');

  // The script builder: three answers about the learner's own product, one script charge.
  await user.tap('sales', CHAT, 'm:script');
  out = fresh();
  ok(texts(out).some((text) => text.includes('Script builder · 1/')), 'the first question');
  const answers = [
    'Solar power kits for greenhouse farms: panels, inverter and batteries sized to the pumps, installed in two days with a one-year service visit.',
    'Greenhouse owners near Tashkent with one to three hectares. I meet them at farm supply shops and through agronomists. They care about winter heating costs.',
    'They say it is too expensive, that diesel is cheaper this year, or that they will think about it after the harvest. Competitors sell cheaper panels without service.',
  ].slice(0, pack.scriptBuilder!.questions.length);
  for (const answer of answers) await user.text('sales', CHAT, answer);
  out = fresh();
  ok(texts(out).some((text) => text.includes('Solar kits for greenhouse farms') && text.includes('is saved')), `the script is saved: ${texts(out).join(' | ').slice(0, 300)}`);
  const [script] = await s.coach.store.scripts(ID.plus, 'sales');
  ok(script && script.input[pack.scriptBuilder!.questions[0].id].startsWith('Solar power kits'), 'saved with the learner\'s answers');
  ok(s.f.memory.calls.some((call) => call.feature === 'coach_b4.script'), 'charged as a script');
  const practise = data(out, /^rp:script:/)!;
  equal(practise, `rp:script:${script.id}`, 'practise with your buyer');

  // The own-product role-play: a buyer of the learner's product raising their objections.
  await user.tap('sales', CHAT, practise);
  out = fresh();
  ok(texts(out).some((text) => text.includes('Your own buyer')) && texts(out).some((text) => text.includes('Allo, eshitaman')), 'the own buyer answers the call');
  await user.text('sales', CHAT, LINES[0]);
  await user.text('sales', CHAT, LINES[1]);
  const own = s.knobs.prompts.filter((prompt) => prompt.includes('You play ')).at(-1)!;
  ok(own.includes('kind="script"') && own.includes('Greenhouse owners near Tashkent'), 'the persona gets the script as data');
  await user.tap('sales', CHAT, 'rp:end');
  out = fresh();
  ok(texts(out).some((text) => text.includes('Solar kits for greenhouse farms</b> — review')), 'reviewed under the script title');
  equal(data(out, /^rp:script:/), practise, 'try again with the same buyer');

  // Rapid-fire objection drills and a lesson.
  const tag = pack.manifest.errorTags.find((entry) => entry.drill)!;
  await user.tap('sales', CHAT, `dr:${tag.id}`);
  for (let i = 0; i < 12; i++) {
    out = fresh();
    if ((await flowOf(s, ID.plus, 'sales')).flow !== 'drill') break;
    const choice = data(out, /^a:\d+:\d$/);
    if (choice) await user.tap('sales', CHAT, choice); else await user.text('sales', CHAT, 'ok');
  }
  ok(s.f.memory.learning.some((event) => event.feature === 'B4' && event.kind === 'drill_finished'), 'the drill counts');
  await user.tap('sales', CHAT, 'm:lesson');
  out = fresh();
  await user.tap('sales', CHAT, data(out, /^ls:\d$/)!);
  ok(texts(fresh()).some((text) => text.startsWith('✅') || text.startsWith('❌')), 'the lesson check');

  // A Telegram DM reply scored with quotes on the message rubric.
  await user.tap('sales', CHAT, 'm:writing');
  out = fresh();
  await user.tap('sales', CHAT, data(out, /^o:0$/)!);
  fresh();
  await user.text('sales', CHAT, 'Assalomu alaykum, Madina! Thank you for asking about the dress. The price is 450,000 UZS and we have it in sizes S to L. Would you like me to keep one for you until Friday, or shall I send a video of the fabric first?');
  out = fresh();
  ok(texts(out).some((text) => text.includes('Overall estimate')), `the message scored: ${texts(out).join(' | ').slice(0, 300)}`);
  equal((await s.coach.store.sessions(ID.plus, 'sales', { limit: 1, kind: 'writing' }))[0].rubric, 'sales.message', 'on the message rubric');

  // Uzbek and Russian: the same buyers speak the learner's language.
  for (const locale of ['uz', 'ru'] as const) {
    await user.tap('sales', CHAT, 's:lang');
    await user.tap('sales', CHAT, `l:${locale}`);
    fresh();
    await user.tap('sales', CHAT, `rp:again:${activity.id}`);
    out = fresh();
    const opening = (packFor(pack, locale).byId.get(activity.id) as Roleplay).persona.opening;
    ok(opening !== activity.persona.opening && texts(out).some((text) => text.includes(opening.slice(0, 25).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'))), `the buyer opens in ${locale}: ${opening}`);
    await user.text('sales', CHAT, locale === 'uz' ? 'Assalomu alaykum, men Aziz, yetkazib beruvchi kompaniyadanman. Ikki daqiqa vaqtingiz bormi?' : 'Здравствуйте, это Азиз из компании-поставщика. Есть две минуты?');
    ok(s.knobs.prompts.filter((prompt) => prompt.includes('You play ')).at(-1)!.includes(locale === 'uz' ? 'in Uzbek' : 'in Russian'), `the persona speaks ${locale}`);
    await user.tap('sales', CHAT, 'm:menu');
    fresh();
  }

  // The weekly mock call.
  await user.tap('sales', CHAT, 'm:mock');
  equal((await flowOf(s, ID.plus, 'sales')).activityId, pack.plan.weeklyMock!.activity, 'the mock is the weekly mock call');
  await user.tap('sales', CHAT, 'm:menu');
  fresh();

  // Team mode: a manager sees the team's verified practice, never their messages.
  const team = await s.f.json('POST', 'coach/team-create', { token: 'tok-admin', body: { name: 'Tashkent sales team', manager_id: ID.plus, packs: ['sales'], seats: 5, days: 30 } });
  equal(team.status, 200, `a Coach Team for Sales: ${JSON.stringify(team.body).slice(0, 200)}`);
  const board = await s.f.json('GET', 'coach/team', { token: 'tok-plus', query: { id: team.body.team.id } });
  equal(board.status, 200, 'the manager board');
  const me = board.body.leaderboard.find((row: { user_id: string }) => row.user_id === ID.plus);
  ok(me && me.week.minutes > 0 && me.week.results >= 2, `verified minutes and results on the board: ${JSON.stringify(me)}`);
  ok(!JSON.stringify(board.body).includes('Solar power kits'), 'no learner text on the board');

  // The Mini App: saved scripts, building one on the web, deleting one.
  const list = await s.f.json('GET', 'coach/scripts', { token: 'tok-plus', query: { pack: 'sales' } });
  equal([list.status, list.body.scripts.length, list.body.cost], [200, 1, 5], 'the list with the cost of a new one');
  const detail = await s.f.json('GET', 'coach/scripts', { token: 'tok-plus', query: { pack: 'sales', id: script.id } });
  ok(detail.status === 200 && detail.body.script.script.objections.length >= 3 && Object.keys(detail.body.objection_types).length >= 3, 'the full script and its objection types');
  const answersById = Object.fromEntries(pack.scriptBuilder!.questions.map((question, i) => [question.id, answers[i]]));
  const built = await s.f.json('POST', 'coach/scripts', { token: 'tok-plus', body: { pack: 'sales', answers: answersById } });
  equal(built.status, 200, `built on the web: ${JSON.stringify(built.body).slice(0, 200)}`);
  const removed = await s.f.json('DELETE', 'coach/scripts', { token: 'tok-plus', body: { pack: 'sales', id: script.id } });
  equal([removed.status, (await s.coach.store.scripts(ID.plus, 'sales')).length], [200, 1], 'deleted');
  const someone = await s.f.json('GET', 'coach/scripts', { token: 'tok-free', query: { pack: 'sales', id: built.body.script.id } });
  equal(someone.status, 404, 'nobody else can open a script');
  const freeBuild = await s.f.json('POST', 'coach/scripts', { token: 'tok-free', body: { pack: 'sales', answers: answersById } });
  equal(freeBuild.status, 402, 'building needs a plan');

  // The weekly report.
  await user.tap('sales', CHAT, 'm:report');
  ok(texts(fresh()).some((text) => text.includes('Ваша неделя')), 'the weekly report (now in Russian)');
  ok(buttons(out).length >= 0, 'done');
});
