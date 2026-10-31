import type { Shadowing } from '../../../../packages/coach-packs/src/mod.ts';
import { packFor } from '../../../../packages/coach-packs/src/registry.ts';
import { equal, ID, ok } from '../fixture.test.ts';
import { coachStack, flowOf, takePlacement } from './harness.ts';

// B6 Public Speaking Coach, end to end in Uzbek, then Russian: placement, a goal,
// an impromptu talk by voice with pace, long pauses and fillers ("ee", "anu", "типа")
// measured from word timestamps, structure scored with quotes and the voice itself
// never scored from a transcript; a typed answer (fillers per 100 words only); a
// presentation rehearsal on a cue card with its timer and audience questions; a Q&A
// role-play; shadowing for pace and pauses; the weekly progress report. Then the same
// coach with no speech provider: voice is declined kindly and text works.

const CHAT = '700100';
const UZ_TALK = 'Ee, bugun men kitob o‘qish haqida gapirmoqchiman. Birinchidan, kitob fikrlashni o‘rgatadi. Ikkinchidan, anu, so‘z boyligini oshiradi. Uchinchidan, kitob bizni tinchlantiradi. Xulosa qilib aytganda, kuniga yigirma daqiqa o‘qing.';
const RU_TALK = 'Я хочу рассказать, типа, почему важно планировать неделю. Во-первых, план снимает стресс. Во-вторых, короче, вы видите главное. И наконец, план даёт время на отдых. Попробуйте начать в это воскресенье.';

Deno.test('B6 Public Speaking: voice analysis of pace, pauses and fillers, structure with quotes, rehearsal with Q&A, shadowing and weekly progress', async () => {
  const s = await coachStack();
  const { user, fresh, texts, data, buttons } = s;
  const pack = s.runtime.packs.get('speech')!;
  let out = await takePlacement(s, 'speech', CHAT, 'uz', 'beginner');
  ok(texts(out).some((text) => text.includes('Daraja testi natijasi')), 'placement in Uzbek');
  await user.tap('speech', CHAT, 'g:t:3');
  await user.tap('speech', CHAT, 'g:d:none');
  await user.tap('speech', CHAT, 'g:m:15');
  await user.tap('speech', CHAT, 'g:r:1800');
  ok(texts(fresh()).some((text) => text.includes('Rejangiz tayyor')), 'plan ready');

  // An impromptu talk by voice: pace, pauses and fillers measured; the voice criterion is not scored.
  await user.tap('speech', CHAT, 'm:speaking');
  fresh();
  const options = (await s.coach.store.enrollment(ID.plus, 'speech'))!.state.options as string[];
  const impromptu = options.findIndex((option) => option.endsWith('|impromptu')), rehearsal = options.findIndex((option) => option.endsWith('|rehearsal'));
  ok(impromptu >= 0 && rehearsal >= 0, `the parts: ${options.join(', ')}`);
  await user.tap('speech', CHAT, `o:${impromptu}`);
  fresh();
  await user.voice('speech', CHAT, UZ_TALK, 20);
  out = fresh();
  const result = texts(out).join('\n');
  ok(result.includes('Javobingiz') && result.includes('Daqiqasiga'), `scored with the measured pace: ${result.slice(0, 500)}`);
  ok(result.includes('baholanmadi'), 'the voice itself is not scored from a transcript');
  const turn = (await s.coach.store.learnerTurns(ID.plus, 'speech', '2000-01-01T00:00:00Z')).at(-1)!;
  ok(Number(turn.metrics.wpm) > 0 && turn.metrics.timed === true, `words per minute from timestamps: ${JSON.stringify(turn.metrics)}`);
  ok(Number(turn.metrics.fillersPer100) > 0 && Number(turn.metrics.longPauses) >= 1, 'fillers and long pauses counted');
  const prompt = s.knobs.prompts.filter((entry) => entry.includes('Your task: assess')).at(-1)!;
  ok(prompt.includes('voice: NOT scored here'), 'the assessor is told not to score the voice');

  // A typed answer: fillers per 100 words only, no pace.
  await user.tap('speech', CHAT, 'sp:nx');
  fresh();
  await user.text('speech', CHAT, 'Xullas, menimcha eng muhimi — tinglovchini hurmat qilish. Avval asosiy fikrni ayting, keyin misol keltiring va oxirida qisqa xulosa qiling.');
  ok(texts(fresh()).some((text) => text.includes('Yozma javob')), 'a typed answer gets words and fillers only');
  await user.tap('speech', CHAT, 'sp:end');
  fresh();

  // A presentation rehearsal: the cue card with its timer, a talk within the time, then audience questions.
  await user.tap('speech', CHAT, 'm:speaking');
  fresh();
  await user.tap('speech', CHAT, `o:${rehearsal}`);
  out = fresh();
  ok(buttons(out).some((button) => button.web_app?.url.includes('/coach/speech/timer?prep=')), 'the prep and talk timer');
  await user.voice('speech', CHAT, `${UZ_TALK} Bugungi taqdimotimni shu bilan yakunlayman, savollaringizga javob beraman.`, 150);
  out = fresh();
  ok(texts(out).some((text) => text.includes('soniya')), `the talk is timed: ${texts(out).join(' | ').slice(0, 500)}`);
  await user.tap('speech', CHAT, 'sp:end');
  fresh();

  // A Q&A role-play after a talk, reviewed on the Q&A rubric.
  await user.tap('speech', CHAT, 'm:roleplay');
  out = fresh();
  await user.tap('speech', CHAT, data(out, /^o:0$/)!);
  fresh();
  await user.text('speech', CHAT, 'Yaxshi savol. Qisqasi: loyiha uch oyda o‘zini oqlaydi, chunki xarajatlar oyiga yigirma foizga kamayadi.');
  await user.text('speech', CHAT, 'Aniq raqamlarni hozir bilmayman, lekin ertaga ertalabgacha yozma ravishda yuboraman.');
  await user.tap('speech', CHAT, 'rp:end');
  out = fresh();
  ok(texts(out).some((text) => text.includes('tahlil')), 'the Q&A review');
  equal((await s.coach.store.sessions(ID.plus, 'speech', { limit: 1, kind: 'roleplay' }))[0].rubric, 'speech.qa', 'on the Q&A rubric');

  // Shadowing for pace and pauses, in Uzbek.
  await user.tap('speech', CHAT, 'm:shadowing');
  for (let i = 0; i < 12; i++) {
    out = fresh();
    const state = await flowOf(s, ID.plus, 'speech');
    if (state.flow !== 'shadow') break;
    const set = packFor(pack, 'uz').byId.get(state.activityId as string) as Shadowing;
    const sentence = set.sentences.find((entry) => entry.id === (state.sentences as string[])[state.index as number])!;
    await user.voice('speech', CHAT, sentence.text, 5);
  }
  out = [...out, ...fresh()];
  ok(texts(out).some((text) => text.includes('100%')), `the shadowing match: ${texts(out).join(' | ').slice(-300)}`);

  // Russian: an impromptu talk with Russian fillers.
  await user.tap('speech', CHAT, 's:lang');
  await user.tap('speech', CHAT, 'l:ru');
  fresh();
  await user.tap('speech', CHAT, 'm:speaking');
  fresh();
  await user.tap('speech', CHAT, `o:${impromptu}`);
  out = fresh();
  const question = ((await flowOf(s, ID.plus, 'speech')).queue as { question: string }[])[0].question;
  const russian = packFor(pack, 'ru').ofKind('speaking_exam')[0].parts.find((part) => part.id === 'impromptu')!.topics!.flatMap((topic) => topic.questions);
  ok(russian.includes(question), `the topic in Russian: ${question}`);
  await user.voice('speech', CHAT, RU_TALK, 18);
  out = fresh();
  ok(texts(out).some((text) => text.includes('типа') || text.includes('короче')), `the Russian fillers are named: ${texts(out).join(' | ').slice(0, 500)}`);
  await user.tap('speech', CHAT, 'sp:end');
  fresh();

  // Weekly progress: pace and fillers, minutes and active days.
  await user.tap('speech', CHAT, 'm:report');
  out = fresh();
  const report = texts(out).join('\n');
  ok(report.includes('Ваша неделя') && report.includes('Слов в минуту') && report.includes('Слов-паразитов'), `the weekly report: ${report.slice(0, 500)}`);
  ok(s.f.memory.learning.some((event) => event.feature === 'B6' && event.kind === 'turn_scored' && event.verified), 'verified practice');
});

Deno.test('B6 Public Speaking without a speech provider: voice is declined kindly and typed talks are scored', async () => {
  const s = await coachStack({ speech: false });
  await takePlacement(s, 'speech', CHAT, 'en', 'strong');
  await s.user.tap('speech', CHAT, 'g:t:4');
  await s.user.tap('speech', CHAT, 'g:d:none');
  await s.user.tap('speech', CHAT, 'g:m:15');
  await s.user.tap('speech', CHAT, 'g:r:off');
  await s.user.tap('speech', CHAT, 'm:speaking');
  s.fresh();
  const options = (await s.coach.store.enrollment(ID.plus, 'speech'))!.state.options as string[];
  await s.user.tap('speech', CHAT, `o:${options.findIndex((option) => option.endsWith('|impromptu'))}`);
  s.fresh();
  await s.user.voice('speech', CHAT, 'Today I want to talk about why every student should learn to cook one simple meal.', 12);
  ok(s.texts(s.fresh()).some((text) => text.includes('Voice answers are not switched on yet')), 'asked to type instead');
  equal(s.f.memory.ledger.filter((row) => row.kind === 'charge').length, 0, 'nothing charged for voice that could not be heard');
  await s.user.text('speech', CHAT, 'Um, today I want to talk about cooking. First, it saves money. Second, you know, it is healthier. Finally, it is a skill for life, so start with one simple meal this weekend.');
  const out = s.fresh();
  ok(s.texts(out).some((text) => text.includes('Your answer') && text.includes('Typed answer')), `the typed talk is scored: ${s.texts(out).join(' | ').slice(0, 300)}`);
});
