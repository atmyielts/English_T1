import { expect, test, type Page, type Route } from '@playwright/test';

// TOEFL iBT 2026 screens with a mocked backend at 375px: practice deep links,
// every task-type screen in the runner, adaptive module flow, and the band report.
// Audio playback and speech recognition are stubbed in the page.

const PRODUCT_ID = 'b262ffa8-9912-4eba-93d7-58af3164d1cc';
const EXP_ID = 'exp-2026-test';
const BANK_ID = 'exp-2026-bank';
const LEGACY_ID = 'exp-legacy';
const SESSION_ID = 'sess-2026';

const session = {
  access_token: 'toefl-route-token',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  refresh_token: 'toefl-route-refresh',
  user: { id: 'learner-1', aud: 'authenticated', role: 'authenticated', email: 'learner@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00.000Z' },
};
const me = {
  user: { id: 'learner-1', email: 'learner@example.test', role: 'student' },
  current_tenant: { id: 't1', name: 'Learner', slug: 'learner', type: 'personal' },
  memberships: [{ tenant_id: 't1', role: 'owner', status: 'active' }],
  entitlements: [{ id: 'e1', resource_type: 'product', resource_id: PRODUCT_ID, starts_at: null, ends_at: null, value: null }],
};

const TASKS = [
  'complete_the_words', 'read_daily_life', 'read_academic_passage', 'listen_choose_response', 'listen_conversation', 'listen_announcement',
  'listen_academic_talk', 'build_sentence', 'write_email', 'write_academic_discussion', 'listen_repeat', 'take_interview',
];
const SECTION_OF: Record<string, string> = {
  complete_the_words: 'reading', read_daily_life: 'reading', read_academic_passage: 'reading', listen_choose_response: 'listening',
  listen_conversation: 'listening', listen_announcement: 'listening', listen_academic_talk: 'listening', build_sentence: 'writing',
  write_email: 'writing', write_academic_discussion: 'writing', listen_repeat: 'speaking', take_interview: 'speaking',
};

const opts = (labels: string[]) => labels.map((label, i) => ({ id: 'ABCD'[i], label }));
const mc = (id: string, part: string, order: number, prompt: string, tier?: string) => ({
  id, part_id: part, part_name: 'Part', part_order: Number(part.replace(/\D/g, '')) || 1, type: 'question_single_choice', display_order: order,
  data: { prompt, options: opts(['First option', 'Second option', 'Third option', 'Fourth option']) },
  metadata: { toefl_task: 'x', ...(tier ? { difficulty_tier: tier } : {}) },
});

const SECTIONS = [
  { id: 'r1', name: 'Reading: Module 1', display_order: 1, metadata: { type: 'reading', format: 'toefl-2026', toefl_module: 'router', duration_seconds: 1260 } },
  { id: 'l1', name: 'Listening: Module 1', display_order: 2, metadata: { type: 'listening', format: 'toefl-2026', toefl_module: 'router', duration_seconds: 1080 } },
  { id: 'w', name: 'Writing', display_order: 3, metadata: { type: 'writing', format: 'toefl-2026', duration_seconds: 1380 } },
  { id: 's', name: 'Speaking', display_order: 4, metadata: { type: 'speaking', format: 'toefl-2026', duration_seconds: 480 } },
];

const UNITS: Record<string, unknown[]> = {
  r1: [
    { id: 'cw1', part_id: 'p1', part_name: 'Complete the Words', part_order: 1, type: 'question_complete_words', display_order: 1, metadata: { toefl_task: 'complete_the_words' },
      data: { prompt: 'Fill in the missing letters in the paragraph.', text: 'Bees live in colonies. Each {{1}} has a queen and many {{2}} that gather food for the {{3}} hive.', blanks: [{ id: '1', stem: 'col', length: 3 }, { id: '2', stem: 'wor', length: 4 }, { id: '3', stem: 'wh', length: 3 }] } },
    { id: 'rdl', part_id: 'p2', part_name: 'Read in Daily Life', part_order: 2, type: 'reading_passage', display_order: 1, metadata: {},
      data: { toefl_stimulus: 'daily_life', format: 'text_messages', title: 'Read the messages.', text: '', messages: [{ sender: 'Dana', time: '10:42', text: 'Library closes early today, want to study at the cafe instead?' }, { sender: 'Sam', time: '10:44', text: 'Sure, see you at four.' }] } },
    mc('rdl-q1', 'p2', 2, 'Why does Dana write to Sam?'),
    { id: 'ap', part_id: 'p3', part_name: 'Read an Academic Passage', part_order: 3, type: 'reading_passage', display_order: 1, metadata: {},
      data: { toefl_stimulus: 'academic_passage', title: 'Glaciers and sound', text: 'Glaciers creak and groan as they move.\n\nScientists record these sounds to learn how quickly the ice is changing over many seasons and years.' } },
    mc('ap-q1', 'p3', 2, 'What is the passage mainly about?'),
  ],
  l1: [
    { id: 'lcr-audio', part_id: 'p4', part_name: 'Listen and Choose a Response', part_order: 1, type: 'audio', display_order: 1, metadata: {}, data: { url: '/media/toefl-2026/lcr-router-1.mp3', duration_seconds: 3, play_once: true, auto_start: true, context: 'Listen and choose the best response.', speakers: ['m_us1'] } },
    mc('lcr-q', 'p4', 2, 'Choose the best response.'),
    { id: 'talk-audio', part_id: 'p5', part_name: 'Listen to an Academic Talk', part_order: 2, type: 'audio', display_order: 1, metadata: {}, data: { url: '/media/toefl-2026/talk-router-1.mp3', duration_seconds: 80, play_once: true, auto_start: true, context: 'Listen to a talk in a biology class.', speakers: ['f_uk'] } },
    mc('talk-q1', 'p5', 2, 'What is the talk mainly about?'),
  ],
  w: [
    { id: 'bs1', part_id: 'p6', part_name: 'Build a Sentence', part_order: 1, type: 'question_build_sentence', display_order: 1, metadata: { toefl_task: 'build_sentence' },
      data: { prompt: 'Make an appropriate sentence.', context: 'Where can I find a printer for students?', frame: ['There', '_', '_', '_', '_', '_', 'library.'], tiles: [{ id: 't1', label: 'of the' }, { id: 't2', label: 'one' }, { id: 't3', label: 'second floor' }, { id: 't4', label: 'is' }, { id: 't5', label: 'on the' }, { id: 't6', label: 'are' }] } },
    { id: 'email', part_id: 'p7', part_name: 'Write an Email', part_order: 2, type: 'question_text', display_order: 1, metadata: { toefl_task: 'write_email' },
      data: { task_type: 'toefl_email', prompt: 'Email', scenario: 'Your study group moved its meeting without telling you.', to: 'Leila Haddad', to_address: 'leila.haddad.study-group-coordinator@university.example', subject: 'Missed meeting', goals: ['Explain what happened.', 'Ask what you missed.', 'Suggest a way to share updates.'], task_seconds: 420 } },
    { id: 'disc', part_id: 'p8', part_name: 'Academic Discussion', part_order: 3, type: 'question_text', display_order: 1, metadata: { toefl_task: 'write_academic_discussion' },
      data: { task_type: 'toefl_academic_discussion', prompt: 'Discussion', course: 'urban planning', professor: { name: 'Dr. Chen', text: 'Should cities close central streets to cars on weekends? Why or why not?' }, students: [{ name: 'Mira', text: 'Yes, it makes the centre safer and calmer for families.' }, { name: 'Tomas', text: 'No, shop owners would lose customers who drive in.' }], task_seconds: 600 } },
  ],
  s: [
    { id: 'rep1', part_id: 'p9', part_name: 'Listen and Repeat', part_order: 1, type: 'question_speaking_repeat', display_order: 1, metadata: { toefl_task: 'listen_repeat' },
      data: { prompt: 'Listen and repeat only once.', scenario: 'You are training to guide visitors in a greenhouse.', index: 1, of: 1, audio: { url: '/media/toefl-2026/lr-test-1-s1.mp3', duration_seconds: 2 }, response_seconds: 3 } },
  ],
};

const STATE = (sectionId: string) => {
  const i = SECTIONS.findIndex((s) => s.id === sectionId);
  return {
    session: { id: SESSION_ID, status: 'active', metadata: {}, started_at: null, completed_at: null, created_at: '2026-10-28T09:00:00Z' },
    experience: { id: EXP_ID, name: 'TOEFL iBT Practice Test 1 (2026 format)', product_id: PRODUCT_ID, metadata: { format: 'toefl-2026', catalog: 'full_test' } },
    sections: SECTIONS,
    current_section: SECTIONS[i],
    next_section_id: SECTIONS[i + 1]?.id ?? null,
    deadline_iso: new Date(Date.now() + 20 * 60_000).toISOString(),
    units: UNITS[sectionId],
    answers: {},
    server_time_iso: new Date().toISOString(),
  };
};

const RESULT_2026 = {
  evaluation: null,
  session: { id: SESSION_ID, status: 'completed', metadata: {} },
  result: {
    session_id: SESSION_ID, computed_at: '2026-10-28T10:30:00Z', overall_band: 4.5, overall_score: 4.5, sections: {},
    toefl: {
      format: 'toefl-2026', score_version: 'toefl-2026-band-estimate-v1', is_estimated: true, mode: 'full_test', overall_band: 4.5, overall_cefr: 'B2', overall_legacy_total_min: 86, overall_pending_reason: null,
      sections: {
        reading: { section: 'reading', raw: 39, max: 50, band: 4.5, cefr: 'B2', legacy_equivalent: 23, legacy_range: { min: 22, max: 23 }, module_path: 'upper', router: { raw: 24, max: 30, threshold: 0.6 }, pending_reason: null },
        listening: { section: 'listening', raw: 25, max: 47, band: 3, cefr: 'B1', legacy_equivalent: 11, legacy_range: { min: 9, max: 12 }, module_path: 'lower', router: { raw: 12, max: 27, threshold: 0.6 }, pending_reason: null },
        writing: { section: 'writing', raw: 17, max: 20, band: 5, cefr: 'C1', legacy_equivalent: 26, legacy_range: { min: 24, max: 26 }, module_path: null, router: null, pending_reason: null },
        speaking: { section: 'speaking', raw: 44, max: 55, band: 4.5, cefr: 'B2', legacy_equivalent: 24, legacy_range: { min: 23, max: 24 }, module_path: null, router: null, pending_reason: null },
      },
      tasks: [
        { task: 'complete_the_words', section: 'reading', raw: 27, max: 30, items: 3, scale: 'points' },
        { task: 'listen_conversation', section: 'listening', raw: 3, max: 10, items: 5, scale: 'points' },
        { task: 'write_email', section: 'writing', raw: 4, max: 5, items: 1, scale: '0-5' },
      ],
      speaking_scope: 'transcript_estimate', method_notes: [],
    },
  },
};

type Calls = { responses: Array<Record<string, unknown>>; starts: Array<Record<string, unknown>>; completed: boolean };

const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

const mockBackend = async (page: Page): Promise<Calls> => {
  const calls: Calls = { responses: [], starts: [], completed: false };
  await page.context().addCookies([{ name: 'schood-auth', value: encodeURIComponent(JSON.stringify(session)), domain: '127.0.0.1', path: '/', httpOnly: false, sameSite: 'Lax' }]);
  await page.addInitScript(() => {
    // Audio: "plays" instantly and ends shortly after.
    HTMLMediaElement.prototype.play = function play(this: HTMLMediaElement) {
      window.setTimeout(() => this.dispatchEvent(new Event('ended')), 150);
      return Promise.resolve();
    };
    HTMLMediaElement.prototype.load = function load() {};
    // Speech recognition returns a fixed transcript.
    class FakeRecognition {
      lang = 'en-US'; continuous = true; interimResults = true;
      onresult: ((e: unknown) => void) | null = null; onerror: ((e: unknown) => void) | null = null; onend: (() => void) | null = null;
      start() {
        window.setTimeout(() => this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: 'the greenhouse opens at nine' }], { isFinal: true })] }), 100);
      }
      stop() { window.setTimeout(() => this.onend?.(), 10); }
    }
    (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition = FakeRecognition;
    Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: () => Promise.resolve(new MediaStream()) }, configurable: true });
  });
  await page.route('**/auth/v1/**', (route) => json(route, session.user));
  await page.route('**/functions/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const fn = url.pathname.replace('/functions/v1/', '');
    if (fn === 'me') return json(route, me);
    if (fn === 'access-effective') return json(route, { user: me.user, tenant_id: 't1', personal_product_ids: [PRODUCT_ID], sponsored_product_ids: [], effective_product_ids: [PRODUCT_ID], has_access: true });
    if (fn === 'exam-state') return json(route, STATE(url.searchParams.get('section_id') ?? 'r1'));
    if (fn === 'start-session') { calls.starts.push(route.request().postDataJSON()); return json(route, { session_id: SESSION_ID }); }
    if (fn === 'audio-playback') return json(route, { ok: true, locked: false, playback: null });
    if (fn === 'score-session') return json(route, RESULT_2026);
    if (fn === 'grade-writing' || fn === 'toefl-speaking') return json(route, { evaluation: { id: 'e', method: 'ai', status: 'completed', result: { tasks: [], items: [] }, evaluated_at: '2026-10-28T10:31:00Z' } });
    return json(route, {});
  });
  await page.route('**/rest/v1/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const table = url.pathname.replace('/rest/v1/', '');
    if (table === 'responses' && req.method() === 'POST') {
      const body = req.postDataJSON();
      for (const row of Array.isArray(body) ? body : [body]) calls.responses.push(row);
      return route.fulfill({ status: 201, body: '' });
    }
    if (table === 'sessions' && req.method() === 'PATCH') {
      calls.completed = true;
      return json(route, { id: SESSION_ID, status: 'completed' });
    }
    if (table === 'experiences') {
      return json(route, [
        { id: EXP_ID, name: 'TOEFL iBT Practice Test 1 (2026 format)', display_order: 0, is_active: true, metadata: { format: 'toefl-2026', catalog: 'full_test' } },
        { id: BANK_ID, name: 'TOEFL iBT 2026 Task Practice', display_order: 30, is_active: true, metadata: { format: 'toefl-2026', catalog: 'practice_bank_2026' } },
        { id: LEGACY_ID, name: 'TOEFL RLW Full Test 1', display_order: 1, is_active: true, metadata: { catalog: 'full_test' } },
      ]);
    }
    if (table === 'sections') {
      return json(route, [
        ...TASKS.map((task, i) => ({ id: `bank-${task}`, experience_id: BANK_ID, name: task, display_order: i + 1, metadata: { type: SECTION_OF[task], format: 'toefl-2026', practice_task: task, duration_seconds: 600, item_sets: 10 } })),
        { id: 'legacy-r', experience_id: LEGACY_ID, name: 'Reading', display_order: 1, metadata: { type: 'reading' } },
      ]);
    }
    return json(route, []);
  });
  return calls;
};

const expectNoHorizontalOverflow = async (page: Page) => {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
};

test('practice lists every 2026 task type and honours ?task deep links', async ({ page }) => {
  const calls = await mockBackend(page);
  await page.goto('/practice?source=playbook&task=academic_passage');
  await expect(page.getByTestId('practice-page')).toBeVisible();
  for (const task of TASKS) await expect(page.getByTestId(`practice-task-${task}`)).toBeVisible();
  await expect(page.getByTestId('practice-task-read_academic_passage')).toHaveAttribute('data-selected', 'true');
  await expect(page.getByTestId('legacy-archive')).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.setViewportSize({ width: 320, height: 700 });
  await expectNoHorizontalOverflow(page);

  await page.getByTestId('practice-task-build_sentence').getByRole('button').click();
  await expect.poll(() => calls.starts.length).toBe(1);
  expect(calls.starts[0]).toMatchObject({ experience_id: BANK_ID, metadata: { mode: 'practice', allowed_section_ids: ['bank-build_sentence'] } });
});

test('unknown ?task shows the full list without an error', async ({ page }) => {
  await mockBackend(page);
  await page.goto('/practice?task=not-a-task');
  await expect(page.getByTestId('practice-task-take_interview')).toBeVisible();
  await expect(page.locator('[data-selected="true"]')).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('reading: Complete the Words inputs stay inline and save letters; daily life and passage screens', async ({ page }) => {
  const calls = await mockBackend(page);
  await page.goto(`/session/${SESSION_ID}/r1`);
  await expect(page.getByTestId('toefl2026-runner')).toBeVisible();
  const cw = page.getByTestId('complete-words');
  await expect(cw).toBeVisible();
  const inputs = cw.locator('input');
  await expect(inputs).toHaveCount(3);
  await inputs.nth(0).fill('ony');
  await expect(inputs.nth(1)).toBeFocused();
  await inputs.nth(1).fill('kers');
  await expectNoHorizontalOverflow(page);
  await page.setViewportSize({ width: 320, height: 700 });
  await expectNoHorizontalOverflow(page);
  await expect.poll(() => calls.responses.filter((r) => r.content_unit_id === 'cw1').length).toBeGreaterThan(0);
  const last = calls.responses.filter((r) => r.content_unit_id === 'cw1').at(-1)!;
  expect(last.data).toEqual({ blanks: { '1': 'ony', '2': 'kers' } });

  await page.getByTestId('next').click();
  await expect(page.getByTestId('daily-text')).toBeVisible();
  await page.getByText('Second option').click();
  await expectNoHorizontalOverflow(page);
  await page.getByTestId('next').click();
  await expect(page.getByTestId('academic-passage')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Back' })).toBeVisible();
  await page.getByTestId('next').click();
  await expect(page.getByTestId('section-end')).toBeVisible();
});

test('listening: audio plays once, questions appear after it, no going back', async ({ page }) => {
  const calls = await mockBackend(page);
  await page.goto(`/session/${SESSION_ID}/l1`);
  await expect(page.getByTestId('listening-screen')).toBeVisible();
  await expect(page.getByTestId('play-once-audio')).toHaveAttribute('data-state', 'done', { timeout: 5000 });
  await page.getByText('Third option').click();
  await expect.poll(() => calls.responses.some((r) => r.content_unit_id === 'lcr-q')).toBe(true);
  await page.getByTestId('next').click();
  await expect(page.getByText('What is the talk mainly about?')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Back' })).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
});

test('writing: Build a Sentence tiles wrap and work with the keyboard; email and discussion', async ({ page }) => {
  const calls = await mockBackend(page);
  await page.goto(`/session/${SESSION_ID}/w`);
  const bs = page.getByTestId('build-sentence');
  await expect(bs).toBeVisible();
  await page.setViewportSize({ width: 320, height: 700 });
  await expectNoHorizontalOverflow(page);
  // Keyboard: focus a tile and press Enter/Space.
  await bs.getByRole('button', { name: 'Place "is"' }).focus();
  await page.keyboard.press('Enter');
  for (const word of ['one', 'on the', 'second floor', 'of the']) await bs.getByRole('button', { name: `Place "${word}"` }).click();
  await expect.poll(() => calls.responses.filter((r) => r.content_unit_id === 'bs1').at(-1)?.data).toEqual({ order: ['t4', 't2', 't5', 't3', 't1'] });
  // Removing a placed tile returns it to the bank.
  await bs.getByRole('button', { name: /Slot 5: of the/ }).click();
  await expect(bs.getByRole('button', { name: 'Place "of the"' })).toBeEnabled();

  await page.getByTestId('next').click();
  await expect(page.getByTestId('write-email')).toBeVisible();
  await page.getByRole('textbox').fill('Dear Leila, I missed the meeting because the time changed.');
  await expect(page.getByText('10 words')).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.getByTestId('next').click();
  await expect(page.getByTestId('write-discussion')).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test('speaking: listen, record with the browser transcript, save', async ({ page }) => {
  const calls = await mockBackend(page);
  await page.goto(`/session/${SESSION_ID}/s`);
  await expect(page.getByTestId('listen-repeat')).toBeVisible();
  await page.getByRole('button', { name: 'Start speaking task' }).click();
  await expect(page.getByTestId('listen-repeat')).toHaveAttribute('data-phase', 'record', { timeout: 5000 });
  await expectNoHorizontalOverflow(page);
  await page.getByRole('button', { name: 'I have finished' }).click();
  await expect.poll(() => calls.responses.find((r) => r.content_unit_id === 'rep1')?.data).toMatchObject({ transcript: 'the greenhouse opens at nine', stt: 'browser' });
  await expect(page.getByTestId('section-end')).toBeVisible({ timeout: 5000 });
  await page.getByTestId('submit-section').click();
  await expect.poll(() => calls.completed).toBe(true);
  await expect(page).toHaveURL(new RegExp(`/session/${SESSION_ID}/results`));
});

test('results: 1-6 bands with CEFR, legacy comparison and Playbook next steps', async ({ page }) => {
  await mockBackend(page);
  await page.goto(`/session/${SESSION_ID}/results`);
  await expect(page.getByTestId('toefl2026-results')).toBeVisible();
  await expect(page.getByTestId('overall-band')).toContainText('4.5');
  await expect(page.getByTestId('overall-band')).toContainText('CEFR B2');
  await expect(page.getByTestId('overall-band')).toContainText('86+');
  await expect(page.getByTestId('band-reading')).toContainText('22-23');
  await expect(page.getByTestId('band-listening')).toContainText('Lower Module 2');
  await expect(page.getByTestId('playbook-diagnostic')).toHaveAttribute('href', `https://playbook.toefl.schood.online/diagnostic?source=toefl-simulator&session_id=${SESSION_ID}`);
  await expect(page.getByTestId('playbook-module').first()).toHaveAttribute('href', 'https://playbook.toefl.schood.online/listening-strategy');
  await expectNoHorizontalOverflow(page);
  await page.setViewportSize({ width: 320, height: 700 });
  await expectNoHorizontalOverflow(page);
});

test('UI language switches to Uzbek and Russian', async ({ page }) => {
  await mockBackend(page);
  await page.goto('/practice?lang=uz');
  await expect(page.getByRole('heading', { name: 'Topshiriq turi bo‘yicha mashq' })).toBeVisible();
  await page.goto('/practice?lang=ru');
  await expect(page.getByRole('heading', { name: 'Практика по типам заданий' })).toBeVisible();
});
