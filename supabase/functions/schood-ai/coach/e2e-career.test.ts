import type { Roleplay, SpeakingExam } from '../../../../packages/coach-packs/src/mod.ts';
import { packFor } from '../../../../packages/coach-packs/src/registry.ts';
import { equal, ID, ok } from '../fixture.test.ts';
import { coachStack, flowOf, takePlacement } from './harness.ts';

// B5 Career and Interview Coach, end to end in Russian, then Uzbek: placement, a
// goal with an interview date, interview answers by voice scored with quotes and
// fluency numbers, a full mock interview with one review, a student-visa interview
// that relies only on the curated, dated facts (with the official source shown), a
// salary negotiation with the next-step scorecard, a CV rewrite and a cover letter
// with its ladder, the weekly report and the session page's facts.

const CHAT = '700100';
const esc = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const ANSWER = 'In my last job at a retail chain I was responsible for the evening shift of six people. When sales dropped in March, I reorganised the shelves and trained the team, and in two months our shift sales grew by around fifteen percent.';

Deno.test('B5 Career and Interview: interview practice, a mock interview, visa facts, salary negotiation, CV and letters in Russian and Uzbek', async () => {
  const s = await coachStack();
  const { user, fresh, texts, data } = s;
  const pack = s.runtime.packs.get('career')!;
  let out = await takePlacement(s, 'career', CHAT, 'ru', 'strong');
  ok(texts(out).some((text) => text.includes('Результат теста уровня')), 'placement in Russian');
  await user.tap('career', CHAT, 'g:t:4');
  await user.text('career', CHAT, '15.12.2026');
  await user.tap('career', CHAT, 'g:m:20');
  await user.tap('career', CHAT, 'g:r:1800');
  out = fresh();
  ok(texts(out).some((text) => text.includes('План готов') && text.includes('15.12.2026')), 'the job-search plan to the interview date');

  // One interview question by voice: scored with quotes and measured fluency, then re-recorded.
  await user.tap('career', CHAT, 'm:speaking');
  fresh();
  const options = (await s.coach.store.enrollment(ID.plus, 'career'))!.state.options as string[];
  const hr = options.findIndex((option) => option.endsWith('|hr'));
  ok(hr >= 0 && options.some((option) => option.endsWith('|mock')), `parts and the full mock: ${options.join(', ')}`);
  await user.tap('career', CHAT, `o:${hr}`);
  out = fresh();
  const asked = ((await flowOf(s, ID.plus, 'career')).queue as { question: string }[])[0].question;
  ok(texts(out).some((text) => text.includes(esc(asked).slice(0, 30))), 'the question in Russian');
  await user.voice('career', CHAT, ANSWER, 24);
  out = fresh();
  ok(texts(out).some((text) => text.includes('Ваш ответ') && text.includes('📏')), `scored with fluency numbers: ${texts(out).join(' | ').slice(0, 400)}`);
  ok(s.f.memory.calls.some((call) => call.feature === 'coach_b5.turn'), 'one turn charge');
  await user.tap('career', CHAT, 'sp:rr');
  await user.voice('career', CHAT, `${ANSWER} I would bring the same habit of measuring results to your team.`, 28);
  ok(texts(fresh()).some((text) => text.includes('→')), 'before and after');
  await user.tap('career', CHAT, 'sp:end');
  fresh();

  // The full mock interview: every part in order, no feedback until one review at the end.
  await user.tap('career', CHAT, 'm:mock');
  fresh();
  for (let guard = 0; guard < 40; guard++) {
    const state = await flowOf(s, ID.plus, 'career');
    if (state.flow !== 'speaking') break;
    const item = (state.queue as { kind: string }[])[state.index as number];
    if (item.kind === 'cue') await user.voice('career', CHAT, `${ANSWER} That is why I am applying for this role.`, 95);
    else await user.text('career', CHAT, ANSWER);
  }
  out = fresh();
  const mock = (await s.coach.store.sessions(ID.plus, 'career', { limit: 5, kind: 'speaking_exam' })).find((session) => session.mode === 'mock')!;
  equal([mock.status, mock.rubric], ['finished', 'career.interview'], 'the mock interview is reviewed once');
  ok(mock.overall !== null && s.f.memory.calls.some((call) => call.feature === 'coach_b5.review'), 'with an overall estimate and one review charge');

  // A student-visa interview: the officer works only from the dated facts; the learner sees the source.
  const visa = pack.ofKind('roleplay').find((activity) => activity.facts?.length)!;
  await user.tap('career', CHAT, `rp:again:${visa.id}`);
  out = fresh();
  const dataset = pack.facts!.find((entry) => entry.id === visa.facts![0])!;
  ok(texts(out).some((text) => text.includes(dataset.source.url)), `the official source is shown: ${texts(out).join(' | ').slice(0, 400)}`);
  await user.text('career', CHAT, 'Good morning. I have been admitted to a university for a bachelor’s degree in computer science, and my parents will pay for my studies.');
  const officer = s.knobs.prompts.filter((prompt) => prompt.includes('You play ')).at(-1)!;
  ok(officer.includes('kind="facts"') && officer.includes(dataset.checkedAt), 'the persona gets only the dated facts');
  await user.text('career', CHAT, 'After my degree I plan to come back to Tashkent and work for a software company that builds banking apps.');
  await user.tap('career', CHAT, 'rp:end');
  out = fresh();
  ok(texts(out).some((text) => text.includes('разбор')), 'the visa interview is reviewed');
  const visaSession = (await s.coach.store.sessions(ID.plus, 'career', { limit: 1, kind: 'roleplay' }))[0];
  const detail = await s.f.json('GET', 'coach/session', { token: 'tok-plus', query: { id: visaSession.id } });
  ok(detail.status === 200 && detail.body.facts?.[0]?.checked_at === dataset.checkedAt && detail.body.facts[0].source.url === dataset.source.url, 'the session page shows when the facts were checked and where');

  // A salary negotiation: the scorecard says whether the next step was secured.
  const salary = pack.ofKind('roleplay').find((activity) => (activity as Roleplay).goals.some((goal) => goal.kind === 'next_step'))!;
  await user.tap('career', CHAT, `rp:again:${salary.id}`);
  fresh();
  await user.text('career', CHAT, 'Thank you for the offer. I am very interested in the role. Based on my experience, could we discuss a slightly higher starting salary?');
  await user.text('career', CHAT, 'If the base salary is fixed, could we agree a review after three months and put it in the offer letter?');
  await user.tap('career', CHAT, 'rp:end');
  out = fresh();
  ok(texts(out).some((text) => text.includes('Следующий шаг закреплён')), `the next-step card: ${texts(out).join(' | ').slice(0, 500)}`);

  // Writing: a CV rewrite on the CV rubric, then a cover letter with its ladder.
  const writing = pack.ofKind('writing');
  const cv = writing.find((task) => task.rubric === 'career.cv')!, letter = writing.find((task) => task.rubric === 'career.letter')!;
  await user.tap('career', CHAT, 'm:writing');
  fresh();
  let choices = (await s.coach.store.enrollment(ID.plus, 'career'))!.state.options as string[];
  let index = choices.indexOf(`write:${cv.id}`);
  await user.tap('career', CHAT, `o:${index >= 0 ? index : choices.findIndex((choice) => (pack.byId.get(choice.slice(6)) as { rubric?: string })?.rubric === 'career.cv')}`);
  fresh();
  await user.text('career', CHAT, 'Dilnoza Karimova, sales assistant. Experience: 2023–2026, a clothing store in Tashkent. Served about forty customers a day, opened and closed the till, and trained two new colleagues. Raised the store’s accessory sales by 20% in one season by suggesting matching items. Skills: Uzbek, Russian, English (B1), 1C, Excel.');
  out = fresh();
  ok(texts(out).some((text) => text.includes('Общая оценка')), `the CV scored: ${texts(out).join(' | ').slice(0, 300)}`);
  const cvSession = (await s.coach.store.sessions(ID.plus, 'career', { limit: 1, kind: 'writing' }))[0];
  equal(cvSession.rubric, 'career.cv', 'on the CV rubric');
  await user.tap('career', CHAT, 'm:writing');
  fresh();
  choices = (await s.coach.store.enrollment(ID.plus, 'career'))!.state.options as string[];
  index = choices.findIndex((choice) => (pack.byId.get(choice.slice(6)) as { rubric?: string } | undefined)?.rubric === 'career.letter');
  ok(index >= 0, 'a letter task is offered');
  const offered = pack.byId.get(choices[index].slice(6)) as typeof letter;
  {
    await user.tap('career', CHAT, `o:${index}`);
    fresh();
    await user.text('career', CHAT, 'Dear hiring team, I am writing to apply for the customer service specialist role. For two years I have answered customers by phone and in Telegram at a retail chain, and I reduced our average reply time from ten minutes to four by preparing ready answers for common questions. I would welcome the chance to discuss how I can help your team. Kind regards, Dilnoza Karimova');
    out = fresh();
    if (offered.ladder?.length) ok(data(out, /^w:ld$/), `the ladder is offered: ${texts(out).join(' | ').slice(0, 300)}`);
    if (offered.ladder?.length) await user.tap('career', CHAT, 'w:ld');
    out = fresh();
    if (offered.ladder?.length) ok(texts(out).some((text) => text.includes('Лестница') || text.includes('🪜')), `the letter ladder: ${texts(out).join(' | ').slice(0, 300)}`);
  }

  // Uzbek: the interview questions in Uzbek.
  await user.tap('career', CHAT, 's:lang');
  await user.tap('career', CHAT, 'l:uz');
  fresh();
  await user.tap('career', CHAT, 'm:speaking');
  fresh();
  await user.tap('career', CHAT, `o:${hr}`);
  out = fresh();
  const exam = pack.ofKind('speaking_exam')[0] as SpeakingExam;
  const uzbek = (packFor(pack, 'uz').byId.get(exam.id) as SpeakingExam).parts.find((part) => part.id === 'hr')!.topics!.flatMap((topic) => topic.questions);
  const shown = ((await flowOf(s, ID.plus, 'career')).queue as { question: string }[])[0].question;
  ok(uzbek.includes(shown) && texts(out).some((text) => text.includes(esc(shown).slice(0, 25))), `the question in Uzbek: ${shown}`);
  await user.tap('career', CHAT, 'm:report');
  ok(texts(fresh()).some((text) => text.includes('Haftangiz')), 'the weekly report in Uzbek');
});
