import { expect, type Page, test } from "@playwright/test";
import AxeBuilder from '@axe-core/playwright';
import { createGuideDraft } from "../../../supabase/functions/_shared/guide-seed.ts";
import {
  type Answers,
  type Catalog,
  changeAnswer,
  type GuideFlow,
  nextQuestion,
  publicFlow,
  recommend,
  scoreCheck,
  validateFlow,
} from "../../../supabase/functions/_shared/guide.ts";

// Browser contract fixtures only. Production pages never fall back to this catalog or these sessions.
const account = {
  access_token: "guide-browser-token",
  refresh_token: "guide-browser-refresh",
  token_type: "bearer",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: {
    id: "11111111-1111-4111-8111-111111111111",
    aud: "authenticated",
    role: "authenticated",
    email: "guide@example.test",
    app_metadata: {},
    user_metadata: {},
    created_at: "2026-01-01T00:00:00Z",
  },
};
const productId = "22222222-2222-4222-8222-222222222222";
const planId = "33333333-3333-4333-8333-333333333333";
const catalog: Catalog = {
  products: [{
    id: productId,
    name: "IELTS Practice",
    status: "active",
    description: "Practice",
    metadata: { slug: "ielts-practice", app_url: "https://practice.ielts.schood.online" },
  }],
  plans: [{
    id: planId,
    product_id: productId,
    name: "Practice month",
    amount: 99000,
    currency: "UZS",
    duration_days: 30,
    is_active: true,
    metadata: {},
  }],
};
async function fixture(page: Page, options: { admin?: boolean; enabled?: boolean; owned?: boolean } = {}) {
  const flow = createGuideDraft();
  flow.offers.push({
    ...flow.offers[0],
    id: "ielts_offer",
    title: { en: "IELTS practice", uz: "IELTS mashqi", ru: "Практика IELTS" },
    kind: "plan",
    productId,
    planId,
    priority: 100,
    enabled: true,
    when: { any: [{ all: [{ question: "exam", op: "is", value: "ielts" }] }] },
    action: { en: "Continue to this plan", uz: "Bu tarifga o‘tish", ru: "Перейти к тарифу" },
    reasons: [
      { en: 'You chose IELTS preparation.', uz: 'Siz IELTS tayyorgarligini tanladingiz.', ru: 'Вы выбрали подготовку к IELTS.' },
      { en: 'One focused practice workspace.', uz: 'Mashq uchun yagona ish maydoni.', ru: 'Единое пространство для практики.' },
      { en: 'The plan and its price are clear before checkout.', uz: 'Tarif va narx to‘lovdan oldin aniq.', ru: 'Тариф и цена понятны до оплаты.' },
    ],
    limitations: { en: 'Practice access, not an official exam or a guaranteed score.', uz: 'Mashq uchun kirish, rasmiy imtihon yoki kafolatlangan ball emas.', ru: 'Доступ к практике, не официальный экзамен или гарантия балла.' },
  });
  let activeFlow = structuredClone(flow);
  const versions = [{
    id: "44444444-4444-4444-8444-444444444444",
    number: 1,
    revision: 1,
    config: flow,
    published_at: null as string | null,
  }];
  const release = { version_id: versions[0].id, enabled: options.enabled !== false, revision: 1 };
  const session = {
    id: "55555555-5555-4555-8555-555555555555",
    version_id: versions[0].id,
    revision: 1,
    locale: "en",
    user_id: null as string | null,
    answers: {} as Answers,
    check_answers: {} as Record<string, string | null>,
    check_status: "undecided",
    expires_at: new Date(Date.now() + 86400000).toISOString(),
  };
  const credentials = { id: session.id, token: "browser-guest-token", expiresAt: session.expires_at };
  const events: string[] = [];
  const goalChanges = [{ field: 'target_overall_band', label: { en: 'Target IELTS band', uz: 'Maqsadli IELTS bali', ru: 'Целевой балл IELTS' }, previous: 6, next: 7 }];
  if (options.admin) {
    await page.context().addCookies([{
      name: "schood-auth",
      value: encodeURIComponent(JSON.stringify(account)),
      domain: "127.0.0.1",
      path: "/",
      sameSite: "Lax",
    }]);
  }
  await page.route("**/auth/v1/**", (route) => route.fulfill({ status: 200, json: account.user }));
  await page.route("**/rest/v1/**", (route) => route.fulfill({ status: 200, json: [] }));
  await page.route("**/functions/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace("/functions/v1/guide", "");
    const method = request.method();
    const data = method === "GET" ? {} : request.postDataJSON() ?? {};
    const send = (json: unknown, status = 200) => route.fulfill({ status, json });
    if (method === "OPTIONS") {
      return route.fulfill({
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "*",
          "Access-Control-Allow-Methods": "*",
        },
      });
    }
    if (url.pathname === "/functions/v1/me") {
      return send({
        user: { ...account.user, role: "admin" },
        entitlements: [],
        memberships: [],
        admin: { is_admin: true, permissions: ["admin.*"], session_aal: "aal1", security_policy: null },
      });
    }
    if (!url.pathname.includes("/guide/")) return send({});
    if (path === "/admin/list") return send({ versions, release, catalog });
    if (path === "/admin/draft" && method === "POST") {
      const v = {
        ...versions[0],
        config: structuredClone(versions.find((v) => v.id === data.cloneId)?.config ?? createGuideDraft()),
        id: crypto.randomUUID(),
        number: versions.length + 1,
        published_at: null,
        revision: 1,
      };
      versions.unshift(v);
      return send({ version: v });
    }
    if (path === "/admin/draft" && method === "PATCH") {
      const v = versions.find((v) => v.id === data.id)!;
      v.config = data.config;
      v.revision++;
      return send({ version: v });
    }
    if (path === "/admin/validate") return send({ validation: validateFlow(data.config, catalog) });
    if (path === "/admin/preview") {
      return send({
        validation: validateFlow(data.config, catalog),
        result: recommend(data.config, data.answers, catalog, data.effectiveIds ?? []),
        signals: scoreCheck(data.config, data.answers, data.checkAnswers ?? {}),
      });
    }
    if (path === "/admin/publish") {
      const v = versions.find((v) => v.id === data.id)!;
      v.published_at = new Date().toISOString();
      activeFlow = structuredClone(v.config);
      release.version_id = v.id;
      release.enabled = true;
      release.revision++;
      return send({ release });
    }
    if (path === "/admin/analytics") return send({ groups: [], funnel: [], truncated: false });
    if (path === '/view') return send({ recorded: true });
    if (path === '/arrival') { events.push('destination_opened'); return send({ recorded: true }); }
    if (path === '/goals/preview') { events.push('goals_preview'); return send({ fingerprint: 'review-v1', changes: goalChanges }); }
    if (path === '/goals/apply') { expect(data.confirm).toBe(true); expect(data.fingerprint).toBe('review-v1'); events.push('goals_applied'); return send({ applied: true, changes: goalChanges }); }
    if (path === "/status") return send({ enabled: release.enabled });
    if (path === "/sessions") {
      if (!release.enabled) return send({ error: "guide_unavailable" }, 503);
      session.answers = {};
      session.check_answers = {};
      session.check_status = "undecided";
      return send({ session, flow: publicFlow(activeFlow), token: credentials.token }, 201);
    }
    if (path === "/session" && method === "GET") return send({ session, flow: publicFlow(activeFlow) });
    if (path === "/session" && method === "DELETE") {
      session.answers = {};
      return send({ discarded: true });
    }
    if (path === "/session" && method === "PATCH") {
      if (data.questionId) {
        session.answers = changeAnswer(activeFlow, session.answers, data.questionId, data.answer);
      }
      if (data.locale) session.locale = data.locale;
      session.revision++;
      events.push("answer");
      return send({ session });
    }
    if (path === "/check") {
      session.check_status = data.status;
      session.check_answers = data.answers;
      session.revision++;
      return send({ session, signals: scoreCheck(activeFlow, session.answers, session.check_answers) });
    }
    if (path === "/result") {
      const { trace: _trace, ...result } = recommend(
        activeFlow,
        session.answers,
        catalog,
        options.owned ? [productId] : [],
      );
      return send({
        ...result,
        fallback: activeFlow.fallback,
        signals: session.check_status === "completed"
          ? scoreCheck(activeFlow, session.answers, session.check_answers)
          : [],
      });
    }
    if (path === "/claim") {
      session.user_id = account.user.id;
      return send({ session });
    }
    if (path === "/open") {
      const result = recommend(activeFlow, session.answers, catalog, options.owned ? [productId] : []);
      return send({ href: result.primary?.href, offerId: result.primary?.rule.id });
    }
    return send({ error: "unimplemented_fixture_route", path }, 404);
  });
  return { flow, session, credentials, versions, events, getActive: () => activeFlow };
}
async function interview(
  page: Page,
  flow: GuideFlow,
  state: { answers: Answers },
  choices: Answers = {},
  locale: "en" | "uz" | "ru" = "en",
) {
  for (let step = 0; step < 13; step++) {
    const q = nextQuestion(flow, state.answers);
    if (!q) return;
    await expect(page.getByRole("heading", { name: q.title[locale], exact: true })).toBeVisible();
    const value = Object.hasOwn(choices, q.id)
      ? choices[q.id]
      : !q.required
      ? null
      : q.kind === "multi"
      ? [q.options[0].id]
      : q.options[0].id;
    if (value === null) {
      await page.getByRole("button", { name: /Not sure — skip|Aniq emas — o‘tkazish|Не знаю — пропустить/ })
        .click();
    } else {
      if (q.kind === "number" || q.kind === "date") {
        await page.locator(`input[type=${q.kind}]`).fill(String(value));
      } else {for (const id of Array.isArray(value) ? value : [value]) {
          await page.getByText(q.options.find((o) => o.id === id)!.label[locale], { exact: true }).click();
        }}
      await page.getByRole("button", { name: /^(Continue|Davom etish|Продолжить)$/ }).click();
    }
    await expect.poll(() => Object.hasOwn(state.answers, q.id)).toBe(true);
  }
  expect(nextQuestion(flow, state.answers)).toBeUndefined();
}

test("guest completes a learner interview and sees actual price before signup", async ({ page }) => {
  const { flow, session } = await fixture(page);
  await page.goto("/start");
  await interview(page, flow, session, {
    audience: "learner",
    access: "new",
    exam: "ielts",
    difficulty: ["writing"],
    budget: "paid",
  });
  await page.getByRole("button", { name: "See my next step instead" }).click();
  await expect(page.getByRole("heading", { name: "IELTS Practice", exact: true })).toBeVisible();
  await expect(page.locator(".guide-price")).toContainText("99,000 UZS");
  await expect(page).toHaveURL(/\/start\/result$/);
  await page.getByRole("button", { name: "Continue to this plan" }).click();
  await expect(page).toHaveURL(/\/auth\?returnTo=%2Fstart%2Fresult/);
});
test("free-only learner receives honest fallback instead of paid recommendation", async ({ page }) => {
  const { flow, session } = await fixture(page);
  await page.goto("/start");
  await interview(page, flow, session, { budget: "free" });
  await page.getByRole("button", { name: "See my next step instead" }).click();
  await expect(page.getByRole("heading", { name: flow.fallback.title.en })).toBeVisible();
  await expect(page.locator(".guide-price")).toHaveCount(0);
});
for (const audience of ["parent", "teacher", "center"]) {
  test(`${audience} follows its own branch without answering unrelated learner questions`, async ({ page }) => {
    const { flow, session } = await fixture(page);
    await page.goto("/start");
    await interview(page, flow, session, {
      audience,
      parent_intent: "progress",
      teacher_setup: "invite",
      center_context: "new",
    });
    await expect(page).toHaveURL(/\/start\/result$/);
    expect(session.answers.exam).toBeUndefined();
    await expect(page.locator(".guide-match")).toHaveCount(1);
  });
}
test("parent preparation keeps payment disabled until learner-account confirmation", async ({ page }) => {
  const { flow, session } = await fixture(page);
  await page.goto("/start");
  await interview(page, flow, session, { audience: "parent", parent_intent: "prepare", budget: "paid" });
  await page.getByRole("button", { name: "See my next step instead" }).click();
  const action = page.getByRole("button", { name: "Continue to this plan" });
  await expect(action).toBeDisabled();
  await page.getByRole("checkbox", { name: /I confirm this is the learner/ }).check();
  await expect(action).toBeEnabled();
});
test("reload resumes anonymous answers and a changed ancestor clears stale children", async ({ page }) => {
  const { flow, session } = await fixture(page);
  await page.goto("/start");
  await interview(page, flow, session, { budget: "paid" });
  await page.getByRole("button", { name: "See my next step instead" }).click();
  await page.reload();
  await expect(page.getByRole("heading", { name: "IELTS Practice", exact: true })).toBeVisible();
  await page.locator(".guide-summary summary").click();
  await page.locator(".guide-summary button").filter({ hasText: "What are you working toward?" }).click();
  await page.getByText("SAT", { exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("heading", { name: "What SAT result are you aiming for?" })).toBeVisible();
  expect(session.answers.level).toBeUndefined();
});
test("skill check supports skipped audio and does not present an exam prediction", async ({ page }) => {
  const { flow, session } = await fixture(page);
  await page.goto("/start");
  await interview(page, flow, session, { budget: "paid" });
  await page.getByRole("button", { name: "Try the short check" }).click();
  for (const q of flow.checks.filter((q) => q.bank === "english")) {
    await expect(page.getByRole("heading", { name: q.prompt.en, exact: true })).toBeVisible();
    if (q.skill === "listening") {
      await page.locator('audio').evaluate((audio: HTMLAudioElement) => audio.load());
      await expect.poll(() => page.locator('audio').evaluate((audio: HTMLAudioElement) => audio.duration)).toBeGreaterThan(1);
      await page.getByRole("button", { name: "I can’t use audio — skip" }).click();
    }
    else {
      await page.getByText(q.options.find((o) => o.id === q.correctOption)!.label.en, { exact: true })
        .click();
      await page.getByRole("button", { name: "Continue", exact: true }).click();
    }
  }
  await expect(page.getByRole("heading", { name: "A small sample, not a score prediction" })).toBeVisible();
  await expect(page.locator(".guide-signals")).toContainText("2 skipped");
});
test("keyboard selection does not auto-advance and reduced motion disables transitions", async ({ page }) => {
  await fixture(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/start");
  await expect(page.getByRole("heading", { name: "Who are we helping today?" })).toBeVisible();
  await page.getByRole("radio").first().focus();
  await page.keyboard.press("Space");
  await expect(page.getByRole("radio").first()).toBeChecked();
  await expect(page.getByRole("heading", { name: "Who are we helping today?" })).toBeVisible();
  expect(await page.locator(".guide-enter").evaluate((el) => getComputedStyle(el).animationName)).toBe(
    "none",
  );
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Are you starting fresh?" })).toBeVisible();
});
for (const locale of ["en", "uz", "ru"] as const) {
  for (const width of [320, 390, 768, 1280]) {
    test(`guide fits ${width}px in ${locale}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      const { flow } = await fixture(page);
      await page.addInitScript((locale) => localStorage.setItem("schood.locale", locale), locale);
      await page.goto("/start");
      await expect(page.getByRole("heading", { name: flow.questions[0].title[locale], exact: true }))
        .toBeVisible();
      expect(
        await page.evaluate(() =>
          document.documentElement.scrollWidth - document.documentElement.clientWidth
        ),
      ).toBeLessThanOrEqual(1);
      for (const option of await page.locator(".guide-option").all()) {
        expect((await option.boundingBox())!.height).toBeGreaterThanOrEqual(48);
      }
      await page.screenshot({ path: testInfo.outputPath(`guide-${locale}-${width}.png`), fullPage: true });
    });
  }
}
test("unavailable guide preserves browsing and never falls back to a fake interview", async ({ page }) => {
  await fixture(page, { enabled: false });
  await page.goto("/start");
  await expect(page.getByRole("heading", { name: "The guide is not available right now." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Browse Schood" })).toBeVisible();
  await expect(page.locator(".guide-option")).toHaveCount(0);
});
test("admin edits all translations, previews, saves, publishes, and a fresh guest gets the new copy", async ({ page }) => {
  const { versions } = await fixture(page, { admin: true });
  await page.goto("/admin/onboarding");
  await expect(page.getByRole("heading", { name: "Onboarding control center" })).toBeVisible();
  const question = page.locator(".onboarding-translations").filter({
    has: page.locator("legend", { hasText: /^Question$/ }),
  });
  await question.locator("textarea").nth(0).fill("Who is this learning route for?");
  await question.locator("textarea").nth(1).fill("Bu o‘qish yo‘li kim uchun?");
  await question.locator("textarea").nth(2).fill("Для кого этот учебный путь?");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByText("Draft saved. Publish when the checks pass.")).toBeVisible();
  await page.getByRole("button", { name: "Validate", exact: true }).click();
  await expect(page.getByText(/Valid · .*maximum 12 questions/)).toBeVisible();
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Who is this learning route for?" })).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByText("Published. Existing sessions keep their original version.")).toBeVisible();
  expect(versions[0].published_at).toBeTruthy();
  await page.goto("/start");
  await expect(page.getByRole("heading", { name: "Who is this learning route for?" })).toBeVisible();
});

test('admin adds a translated question, branch and catalog mapping without code, then publishes a fresh journey', async ({ page }) => {
  test.setTimeout(60000);
  const fixtureState = await fixture(page, { admin: true });
  await page.goto('/admin/onboarding');
  await page.getByRole('button', { name: 'Add question', exact: true }).click();
  const translate = async (label: string, values: string[]) => {
    const group = page.locator('.onboarding-translations').filter({ has: page.locator('legend', { hasText: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }) });
    for (let i = 0; i < 3; i++) await group.locator('textarea').nth(i).fill(values[i]);
  };
  await translate('Question', ['Would weekly planning help?', 'Haftalik reja yordam beradimi?', 'Поможет ли недельный план?']);
  await translate('Why we ask', ['Choose what helps your teaching.', 'Darslaringiz uchun tanlang.', 'Выберите для своих занятий.']);
  await page.getByRole('button', { name: 'Branches', exact: true }).click();
  await page.getByRole('button', { name: '+ Condition', exact: true }).click();
  await page.getByLabel('Question to compare').selectOption('audience');
  await page.getByLabel('Answer to compare').selectOption('teacher');
  await page.getByRole('button', { name: 'Recommendations', exact: true }).click();
  await page.getByRole('button', { name: 'Add offer rule', exact: true }).click();
  await page.getByLabel('Approved for onboarding').check();
  await page.getByLabel('Priority', { exact: true }).fill('150');
  await page.getByRole('combobox', { name: 'Catalog product', exact: true }).selectOption(productId);
  await page.getByRole('combobox', { name: 'Catalog plan', exact: true }).selectOption(planId);
  await page.getByRole('button', { name: '+ Condition', exact: true }).click();
  await page.getByLabel('Question to compare').selectOption('exam');
  await page.getByLabel('Answer to compare').selectOption('ielts');
  await translate('Rule label / workflow title (catalog names stay authoritative)', ['A focused IELTS route', 'IELTS uchun yo‘l', 'Путь к IELTS']);
  for (let i = 1; i <= 3; i++) await translate(`Why it fits · reason ${i}`, [`Practice reason ${i}`, `Mashq sababi ${i}`, `Причина ${i}`]);
  await translate('Limits and important exclusions', ['No score guarantee.', 'Ball kafolati yo‘q.', 'Без гарантии балла.']);
  await translate('Action label', ['Choose this practice', 'Mashqni tanlash', 'Выбрать практику']);
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByText('Draft saved. Publish when the checks pass.')).toBeVisible();
  await page.getByRole('button', { name: 'Validate', exact: true }).click();
  await expect(page.getByText(/Valid · .*maximum 12 questions/)).toBeVisible();
  const saved = fixtureState.versions[0].config;
  const added = saved.questions.at(-1)!;
  expect(added.when.any[0].all[0].value).toBe('teacher');
  expect(saved.offers.at(-1)!.planId).toBe(planId);
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  let answers: Answers = {};
  for (let i = 0; i < 13; i++) {
    const q = nextQuestion(saved, answers);
    if (!q) break;
    await expect(page.getByRole('heading', { name: q.title.en, exact: true })).toBeVisible();
    const answer = q.id === 'budget' ? 'paid' : !q.required ? null : q.kind === 'multi' ? [q.options[0].id] : q.options[0].id;
    if (answer === null) await page.getByRole('button', { name: 'Not sure — skip', exact: true }).click();
    else {
      for (const id of Array.isArray(answer) ? answer : [answer]) await page.getByText(q.options.find(o => o.id === id)!.label.en, { exact: true }).click();
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
    }
    answers = changeAnswer(saved, answers, q.id, answer);
  }
  await page.getByText('Simulate check answers and existing access', { exact: true }).click();
  await page.getByRole('checkbox', { name: 'IELTS Practice', exact: true }).check();
  await page.getByRole('button', { name: 'Evaluate recommendation', exact: true }).click();
  await expect(page.locator('.guide-owned').first()).toBeVisible();
  await expect(page.locator('.guide-match').first()).toContainText('Practice reason 1');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await expect(page.getByText('Published. Existing sessions keep their original version.')).toBeVisible();
  await page.goto('/start');
  await interview(page, fixtureState.getActive(), fixtureState.session, { audience: 'teacher', [added.id]: 'yes' });
  expect(fixtureState.session.answers[added.id]).toBe('yes');
  await expect(page).toHaveURL(/\/start\/result$/);
});

test('owned learner reviews exact goal changes before explicit application', async ({ page }) => {
  const { flow, session, events } = await fixture(page, { admin: true, owned: true });
  await page.goto('/start');
  await interview(page, flow, session, { budget: 'paid' });
  await page.getByRole('button', { name: 'See my next step instead' }).click();
  await page.getByRole('button', { name: 'Review goals for this product' }).click();
  await expect(page.getByText('Target IELTS band:', { exact: true })).toBeVisible();
  expect(events).not.toContain('goals_applied');
  await page.getByRole('button', { name: 'Use these goals', exact: true }).click();
  await expect.poll(() => events.includes('goals_applied')).toBe(true);
});

test('destination receipt is removed from the URL and recorded only at the destination render', async ({ page }) => {
  const { events } = await fixture(page);
  await page.goto(`/?schood_guide=${'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'.repeat(2)}`);
  await expect.poll(() => events.includes('destination_opened')).toBe(true);
  await expect(page).not.toHaveURL(/schood_guide/);
  expect(events.filter(e => e === 'destination_opened')).toHaveLength(1);
});

test('interview, result and admin controls pass scoped accessibility checks and mobile visual contracts', async ({ page }, testInfo) => {
  test.setTimeout(60000);
  const { flow, session } = await fixture(page, { admin: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/start');
  await expect(page.getByRole('heading', { name: flow.questions[0].title.en, exact: true })).toBeVisible();
  const audit = async (selector: string) => expect((await new AxeBuilder({ page }).include(selector).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  await audit('.guide-shell');
  await interview(page, flow, session, { budget: 'paid' });
  await page.getByRole('button', { name: 'See my next step instead' }).click();
  await expect(page.locator('.guide-price')).toBeVisible();
  await audit('.guide-shell');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath('guide-result-mobile.png'), fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/admin/onboarding');
  await expect(page.getByRole('heading', { name: 'Onboarding control center' })).toBeVisible();
  await audit('.onboarding-admin');
  for (const button of await page.locator('.onboarding-step-list button').all()) {
    expect(await button.evaluate(element => element.scrollHeight - element.clientHeight)).toBeLessThanOrEqual(1);
  }
  await page.screenshot({ path: testInfo.outputPath('guide-admin-desktop.png'), fullPage: true });
});
