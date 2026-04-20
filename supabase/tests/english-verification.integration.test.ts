import {
  assert,
  assertArrayIncludes,
  assertEquals,
  assertExists,
  assertGreater,
  assertLessOrEqual,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

type JsonRecord = Record<string, unknown>;

type Catalog = {
  languageId: string;
  products: Record<string, string>;
};

type TestUser = {
  userId: string;
  email: string;
  password: string;
  token: string;
  client: SupabaseClient;
};

const requireEnv = (key: string): string => {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`Missing env var: ${key}`);
  return value;
};

const API_URL = requireEnv("API_URL");
const FUNCTIONS_URL = requireEnv("FUNCTIONS_URL");
const ANON_KEY = requireEnv("ANON_KEY");
const SERVICE_ROLE_KEY = requireEnv("SERVICE_ROLE_KEY");

const service = createClient(API_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

let catalogPromise: Promise<Catalog> | null = null;

const uniqueLabel = (prefix: string): string => `${prefix}-${crypto.randomUUID().slice(0, 8)}`;

const toRecord = (value: unknown): JsonRecord =>
  value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const waitFor = async (
  label: string,
  probe: () => Promise<boolean>,
  timeoutMs = 10_000,
): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  let lastError: Error | null = null;
  while (Date.now() < deadline) {
    try {
      if (await probe()) return;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
    await sleep(250);
  }
  throw new Error(`Timed out waiting for ${label}${lastError ? `: ${lastError.message}` : ""}`);
};

const loadCatalog = async (): Promise<Catalog> => {
  if (catalogPromise) return await catalogPromise;
  catalogPromise = (async () => {
    const languageRes = await service
      .from("languages")
      .select("id, code")
      .eq("code", "en")
      .maybeSingle();
    if (languageRes.error || !languageRes.data?.id) {
      throw new Error(`Failed to resolve English language scope: ${languageRes.error?.message ?? "missing row"}`);
    }

    const productsRes = await service
      .from("products")
      .select("id, metadata");
    if (productsRes.error) throw new Error(`Failed to load products: ${productsRes.error.message}`);

    const products: Record<string, string> = {};
    for (const row of productsRes.data ?? []) {
      const metadata = toRecord((row as Record<string, unknown>).metadata);
      const slug = String(metadata.slug ?? "").trim();
      if (slug.startsWith("english-")) {
        products[slug.replace(/^english-/, "")] = String((row as Record<string, unknown>).id ?? "");
      }
    }

    return {
      languageId: String(languageRes.data.id),
      products,
    };
  })();
  return await catalogPromise;
};

const createUserClient = (): SupabaseClient =>
  createClient(API_URL, ANON_KEY, {
    auth: { persistSession: false },
  });

const createTestUser = async (
  label: string,
  options: { admin?: boolean } = {},
): Promise<TestUser> => {
  const email = `${uniqueLabel(label)}@example.com`;
  const password = "Passw0rd!";
  const created = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error || !created.data.user?.id) {
    throw new Error(`Failed to create test user ${email}: ${created.error?.message ?? "missing auth user"}`);
  }

  const userId = String(created.data.user.id);
  await waitFor(`users row for ${email}`, async () => {
    const row = await service.from("users").select("id").eq("id", userId).maybeSingle();
    return !!row.data?.id;
  });

  if (options.admin) {
    const updated = await service.from("users").update({ role: "admin" }).eq("id", userId);
    if (updated.error) throw new Error(`Failed to elevate admin user ${email}: ${updated.error.message}`);
  }

  const client = createUserClient();
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error || !signedIn.data.session?.access_token) {
    throw new Error(`Failed to sign in test user ${email}: ${signedIn.error?.message ?? "missing session"}`);
  }

  return {
    userId,
    email,
    password,
    token: signedIn.data.session.access_token,
    client,
  };
};

const authedFetch = async (
  token: string,
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; body: JsonRecord }> => {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("apikey", ANON_KEY);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  const response = await fetch(`${FUNCTIONS_URL}/${path.replace(/^\/+/, "")}`, {
    ...init,
    headers,
  });

  const text = await response.text();
  const body = text ? toRecord(JSON.parse(text)) : {};
  return {
    status: response.status,
    body,
  };
};

const ensureGoal = async (userId: string, languageId: string, minutes: number): Promise<void> => {
  const upserted = await service
    .from("learner_language_goals")
    .upsert({
      user_id: userId,
      language_id: languageId,
      target_cefr: "B2",
      goal_keys: ["fluency", "accuracy"],
      daily_time_minutes: minutes,
      metadata: { seeded_by: "english-verification" },
    }, {
      onConflict: "user_id,language_id",
    });
  if (upserted.error) throw new Error(`Failed to upsert learner goal: ${upserted.error.message}`);
};

const loadSignalsForAttempt = async (userId: string, attemptId: string) => {
  const rows = await service
    .from("language_signals")
    .select("id, idempotency_key, payload")
    .eq("user_id", userId);
  if (rows.error) throw new Error(`Failed to load language signals: ${rows.error.message}`);
  return (rows.data ?? []).filter((row) => toRecord((row as JsonRecord).payload).attempt_id === attemptId);
};

const loadRecommendations = async (userId: string, languageId: string) => {
  const rows = await service
    .from("learner_language_recommendations")
    .select("*")
    .eq("user_id", userId)
    .eq("language_id", languageId)
    .eq("status", "active")
    .order("priority", { ascending: false })
    .order("created_at", { ascending: false });
  if (rows.error) throw new Error(`Failed to load recommendations: ${rows.error.message}`);
  return rows.data ?? [];
};

const recommendationSignatures = (rows: Array<Record<string, unknown>>): string[] =>
  rows
    .map((row) => {
      const payload = toRecord(row.payload);
      return [
        String(row.recommended_service_key ?? ""),
        String(row.recommendation_type ?? ""),
        String(payload.rule_key ?? ""),
        String(row.title ?? ""),
      ].join("|");
    })
    .sort();

const createLearningAttempt = async (
  user: TestUser,
  serviceKey: string,
  productId: string,
  input: {
    sourceRef: string;
    title: string;
    skillKey: string;
    subskillKeys?: string[];
    contentType?: string;
    contentItemId?: string;
    correctnessRatio: number;
    correctionQualityRatio?: number;
    issues?: Array<Record<string, unknown>>;
  },
) => {
  const started = await authedFetch(
    user.token,
    "learning-attempts/start?language_code=en",
    {
      method: "POST",
      body: JSON.stringify({
        service_key: serviceKey,
        product_id: productId,
        content_item_id: input.contentItemId ?? null,
        content_type: input.contentType ?? `${serviceKey}.verification`,
        source_ref: input.sourceRef,
        title: input.title,
        skill_key: input.skillKey,
        subskill_keys: input.subskillKeys ?? [`${serviceKey}.verification`],
        estimated_minutes: 8,
      }),
    },
  );
  assertEquals(started.status, 200, `Failed to start ${serviceKey} attempt.`);
  const attemptId = String(toRecord(started.body.attempt).id ?? "");
  const contentItemId = String(toRecord(started.body.content_item).id ?? "");
  assert(attemptId.length > 0);
  assert(contentItemId.length > 0);

  const submitted = await authedFetch(
    user.token,
    "learning-attempts/submit?language_code=en",
    {
      method: "POST",
      body: JSON.stringify({
        attempt_id: attemptId,
        title: input.title,
        correctness_ratio: input.correctnessRatio,
        correction_quality_ratio: input.correctionQualityRatio ?? input.correctnessRatio,
        estimated_minutes: 8,
        time_spent_seconds: 600,
        issues: input.issues ?? [],
        response_json: {
          verification: true,
          service_key: serviceKey,
          source_ref: input.sourceRef,
        },
      }),
    },
  );
  assertEquals(submitted.status, 200, `Failed to submit ${serviceKey} attempt.`);

  return {
    attemptId,
    contentItemId,
    started: started.body,
    submitted: submitted.body,
  };
};

const captureWord = async (
  user: TestUser,
  input: {
    word: string;
    sourceProductId: string;
    sourceType: string;
    sourceRef: string;
  },
) => {
  const response = await authedFetch(user.token, "vocabulary-notebook?language_code=en", {
    method: "POST",
    body: JSON.stringify({
      action: "capture",
      items: [
        {
          word: input.word,
          context_text: `Context for ${input.word}`,
          source_type: input.sourceType,
          source_product_id: input.sourceProductId,
          source_label: "Verification source",
          source_ref: input.sourceRef,
        },
      ],
    }),
  });
  assertEquals(response.status, 200, "Failed to capture vocabulary.");
  return response.body;
};

Deno.test({
  name: "contracts, idempotency, and shared-core RLS work against the local English stack",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
  const { languageId, products } = await loadCatalog();
  const primary = await createTestUser("core-primary");
  const secondary = await createTestUser("core-secondary");

  await ensureGoal(primary.userId, languageId, 35);

  const feedback = await authedFetch(primary.token, "feedback-engine", {
    method: "POST",
    body: JSON.stringify({
      service_key: "writing",
      score: 0.41,
      title: "verification draft",
      issues: [
        {
          category: "grammar",
          subskill_key: "writing.grammar_accuracy",
          explanation: "Articles are missing before singular count nouns.",
          correction_hint: "Add an article before each singular count noun.",
        },
      ],
    }),
  });
  assertEquals(feedback.status, 200, "feedback-engine should return 200.");
  assertEquals(feedback.body.ok, true);
  assertExists(toRecord(feedback.body.feedback).summary);
  assert(Array.isArray(toRecord(feedback.body.feedback).issues));

  const issue = {
    category: "grammar",
    subskill_key: "reading.inference",
    explanation: "The learner confused article use inside the reading task.",
    correction_hint: "Review the article sentence and retry with article support.",
  };
  const flow = await createLearningAttempt(primary, "reading", products.reading, {
    sourceRef: uniqueLabel("reading-core"),
    title: "Reading verification task",
    skillKey: "reading",
    subskillKeys: ["reading.gist", "reading.inference"],
    correctnessRatio: 0.42,
    correctionQualityRatio: 0.45,
    issues: [issue],
  });

  const attemptId = flow.attemptId;
  const firstSignals = await loadSignalsForAttempt(primary.userId, attemptId);
  assertGreater(firstSignals.length, 0, "A submitted attempt should emit language signals.");

  const errorRowRes = await service
    .from("learner_language_errors")
    .select("*")
    .eq("user_id", primary.userId)
    .eq("language_id", languageId)
    .eq("service_key", "reading")
    .eq("error_type", issue.explanation)
    .maybeSingle();
  if (errorRowRes.error || !errorRowRes.data?.id) {
    throw new Error(`Failed to load learner error: ${errorRowRes.error?.message ?? "missing row"}`);
  }
  assertEquals(Number(errorRowRes.data.error_frequency ?? 0), 1);

  const replay = await authedFetch(primary.token, "learning-attempts/submit?language_code=en", {
    method: "POST",
    body: JSON.stringify({
      attempt_id: attemptId,
      title: "Reading verification task",
      correctness_ratio: 0.42,
      correction_quality_ratio: 0.45,
      estimated_minutes: 8,
      time_spent_seconds: 600,
      issues: [issue],
      response_json: {
        verification: true,
        replay: true,
      },
    }),
  });
  assertEquals(replay.status, 200);
  assertEquals(replay.body.idempotent_replay, true, "Repeated submit should replay the stored attempt result.");

  const secondSignals = await loadSignalsForAttempt(primary.userId, attemptId);
  assertEquals(secondSignals.length, firstSignals.length, "Repeated submit must not duplicate signal rows.");

  const errorRowAfterReplay = await service
    .from("learner_language_errors")
    .select("error_frequency")
    .eq("id", String(errorRowRes.data.id))
    .maybeSingle();
  if (errorRowAfterReplay.error) throw new Error(errorRowAfterReplay.error.message);
  assertEquals(Number(errorRowAfterReplay.data?.error_frequency ?? 0), 1, "Repeated submit must not increment the same learner error.");

  const fetchedAttempt = await authedFetch(primary.token, `learning-attempts/${attemptId}?language_code=en`);
  assertEquals(fetchedAttempt.status, 200);
  assertEquals(String(toRecord(fetchedAttempt.body.attempt).id ?? ""), attemptId);
  assertExists(toRecord(fetchedAttempt.body.feedback).summary);

  const ownAttempt = await primary.client.from("learning_attempts").select("id").eq("id", attemptId).maybeSingle();
  assertEquals(String(ownAttempt.data?.id ?? ""), attemptId);
  const otherAttempt = await secondary.client.from("learning_attempts").select("id").eq("id", attemptId).maybeSingle();
  assertEquals(otherAttempt.data, null, "A different learner must not see another learner's attempt.");

  const ownFeedback = await primary.client.from("learning_attempt_feedback").select("attempt_id").eq("attempt_id", attemptId).maybeSingle();
  assertEquals(String(ownFeedback.data?.attempt_id ?? ""), attemptId);
  const otherFeedback = await secondary.client.from("learning_attempt_feedback").select("attempt_id").eq("attempt_id", attemptId).maybeSingle();
  assertEquals(otherFeedback.data, null, "A different learner must not see another learner's feedback.");

  const ownMastery = await primary.client
    .from("learner_language_mastery")
    .select("service_key")
    .eq("language_id", languageId)
    .eq("service_key", "reading")
    .limit(1);
  if (ownMastery.error) throw new Error(ownMastery.error.message);
  assertGreater((ownMastery.data ?? []).length, 0, "The submitting learner should see their own mastery row.");
  const otherMastery = await secondary.client
    .from("learner_language_mastery")
    .select("service_key")
    .eq("language_id", languageId)
    .eq("service_key", "reading")
    .limit(1);
  if (otherMastery.error) throw new Error(otherMastery.error.message);
  assertEquals((otherMastery.data ?? []).length, 0, "A different learner must not see another learner's mastery row.");
  },
});

Deno.test({
  name: "content-registry admin flow works and reading-articles remains healthy",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
  const { products } = await loadCatalog();
  const admin = await createTestUser("registry-admin", { admin: true });
  const learner = await createTestUser("registry-learner");

  const readingList = await authedFetch(learner.token, "reading-articles?language_code=en&limit=5");
  assertEquals(readingList.status, 200, "reading-articles should stay available.");
  assertGreater((readingList.body.articles as unknown[]).length, 0, "reading-articles should keep serving seeded content.");

  const forbiddenWrite = await authedFetch(learner.token, "content-registry?language_code=en", {
    method: "POST",
    body: JSON.stringify({
      service_key: "speaking",
      product_id: products.speaking,
      content_type: "speaking.prompt",
      source_ref: uniqueLabel("registry-forbidden"),
      title: "Forbidden prompt",
      skill_key: "speaking",
      estimated_minutes: 6,
    }),
  });
  assertEquals(forbiddenWrite.status, 403, "content-registry mutation should stay admin-only.");

  const sourceRef = uniqueLabel("registry-speaking");
  const registered = await authedFetch(admin.token, "content-registry?language_code=en", {
    method: "POST",
    body: JSON.stringify({
      service_key: "speaking",
      product_id: products.speaking,
      content_type: "speaking.prompt",
      source_ref: sourceRef,
      title: "Verification speaking prompt",
      skill_key: "speaking",
      subskill_keys: ["speaking.fluency"],
      estimated_minutes: 7,
      learning_objective: "Verify that admin registration works end to end.",
    }),
  });
  assertEquals(registered.status, 200, "Admin content registration should succeed.");
  assertEquals(toRecord(registered.body.item).source_ref, sourceRef);

  const registryList = await authedFetch(learner.token, "content-registry?language_code=en&service_key=speaking&limit=100");
  assertEquals(registryList.status, 200);
  assert(
    ((registryList.body.items as Array<Record<string, unknown>>) ?? []).some((row) => String(row.source_ref ?? "") === sourceRef),
    "Registered content should be visible through content-registry GET.",
  );
  },
});

Deno.test({
  name: "vocabulary capture, recommendation rebuild, hub planning, and profile regressions all verify on the live stack",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
  const { languageId, products } = await loadCatalog();
  const learner = await createTestUser("planning-learner");
  const observer = await createTestUser("planning-observer");

  await ensureGoal(learner.userId, languageId, 20);

  const capturedOnce = await captureWord(learner, {
    word: "itinerary",
    sourceProductId: products.reading,
    sourceType: "reading",
    sourceRef: uniqueLabel("reading-article"),
  });
  const firstCard = ((capturedOnce.cards as Array<Record<string, unknown>>) ?? [])[0];
  assertExists(firstCard);

  await captureWord(learner, {
    word: "itinerary",
    sourceProductId: products.reading,
    sourceType: "reading",
    sourceRef: uniqueLabel("reading-article"),
  });

  const notebookRows = await service
    .from("user_vocabulary_notebook_entries")
    .select("id")
    .eq("user_id", learner.userId)
    .eq("language_id", languageId)
    .eq("normalized_word", "itinerary");
  if (notebookRows.error) throw new Error(notebookRows.error.message);
  assertEquals((notebookRows.data ?? []).length, 1, "Vocabulary capture should stay idempotent per learner/language/word.");

  const oldIso = new Date(Date.now() - (6 * 24 * 60 * 60 * 1000)).toISOString();
  const dueIso = new Date(Date.now() - (2 * 60 * 60 * 1000)).toISOString();
  const agedEntry = await service
    .from("user_vocabulary_notebook_entries")
    .update({
      created_at: oldIso,
      next_review_at: dueIso,
      correct_count: 0,
      review_count: 0,
      incorrect_count: 0,
    })
    .eq("id", String(firstCard.id));
  if (agedEntry.error) throw new Error(agedEntry.error.message);

  const masterySeed = await service
    .from("learner_language_mastery")
    .upsert({
      user_id: learner.userId,
      language_id: languageId,
      service_key: "grammar",
      skill_key: "grammar",
      unit_key: uniqueLabel("stable-grammar"),
      state: "stable",
      confidence: 0.84,
      success_count: 4,
      failure_count: 0,
      reopened_count: 0,
      last_practiced_at: new Date().toISOString(),
      metadata: { seeded_by: "english-verification" },
    });
  if (masterySeed.error) throw new Error(masterySeed.error.message);

  const rebuildOne = await authedFetch(learner.token, "recommendations/rebuild?language_code=en", {
    method: "POST",
  });
  assertEquals(rebuildOne.status, 200);
  const rebuildTwo = await authedFetch(learner.token, "recommendations/rebuild?language_code=en", {
    method: "POST",
  });
  assertEquals(rebuildTwo.status, 200);

  const queueAfterFirst = recommendationSignatures((rebuildOne.body.queue as Array<Record<string, unknown>>) ?? []);
  const queueAfterSecond = recommendationSignatures((rebuildTwo.body.queue as Array<Record<string, unknown>>) ?? []);
  assertEquals(queueAfterSecond, queueAfterFirst, "Recommendation rebuild should be stable across repeated calls.");

  const activeQueue = await loadRecommendations(learner.userId, languageId);
  assert(
    activeQueue.some((row) =>
      String(row.recommended_service_key ?? "") === "vocabulary" && String(row.recommendation_type ?? "") === "review"
    ),
    "A due vocabulary review recommendation should be active.",
  );
  assert(
    activeQueue.some((row) =>
      String(row.recommended_service_key ?? "") === "vocabulary" && String(row.recommendation_type ?? "") === "activation"
    ),
    "Idle vocabulary should produce an activation recommendation.",
  );
  assert(
    activeQueue.some((row) =>
      String(row.recommended_service_key ?? "") === "speaking"
        && String(toRecord(row.payload).rule_key ?? "") === "vocabulary_transfer"
    ),
    "Saved vocabulary should hand off into a speaking activation task.",
  );
  assert(
    activeQueue.some((row) => String(row.recommendation_type ?? "") === "application"),
    "The active queue should contain at least one application task.",
  );

  const hubPlan = await authedFetch(learner.token, "hub/plan?language_code=en&rebuild=true");
  assertEquals(hubPlan.status, 200);
  const todayPlan = toRecord(hubPlan.body.today_plan);
  const tasks = (todayPlan.tasks as Array<Record<string, unknown>>) ?? [];
  assertLessOrEqual(Number(todayPlan.total_estimated_minutes ?? 0), 20, "Hub plans should stay inside the learner time budget.");
  assert(
    tasks.some((task) => String(task.title ?? "") === "Review due vocabulary cards"),
    "Hub plans should always include due vocabulary review.",
  );
  assert(
    tasks.some((task) => String(task.title ?? "").includes("Apply progress") || String(task.title ?? "").includes("Validate progress")),
    "Hub plans should include an application task when weakness work is scheduled.",
  );

  const profileV3 = await authedFetch(learner.token, "learning-profile-v3?language_code=en");
  assertEquals(profileV3.status, 200);
  assertExists(profileV3.body.skill_scores);
  assertExists(profileV3.body.subskill_scores);
  assertExists(profileV3.body.recommendation_summary);
  assertEquals(Number(profileV3.body.daily_time_preference_minutes ?? 0), 20);

  const profileV2 = await authedFetch(learner.token, "learning-profile-v2?language_code=en");
  assertEquals(profileV2.status, 200, "learning-profile-v2 should remain available.");
  assertEquals(toRecord(profileV2.body.scope).language_code, "en");
  assert("language_profile" in profileV2.body, "learning-profile-v2 should keep exposing the legacy language_profile field.");

  const vocabularyDaily = await authedFetch(learner.token, "vocabulary-notebook?language_code=en&mode=daily");
  assertEquals(vocabularyDaily.status, 200, "vocabulary-notebook should remain available.");
  assertGreater(Number(toRecord(vocabularyDaily.body.summary).due_count ?? 0), 0, "The notebook should show the due review item.");

  const ownGoal = await learner.client.from("learner_language_goals").select("user_id").eq("language_id", languageId).maybeSingle();
  assertEquals(String(ownGoal.data?.user_id ?? ""), learner.userId);
  const otherGoal = await observer.client.from("learner_language_goals").select("user_id").eq("language_id", languageId).maybeSingle();
  assertEquals(otherGoal.data, null, "Another learner must not see someone else's language goals.");

  const ownPlan = await learner.client.from("learner_language_daily_plans").select("user_id").eq("language_id", languageId).limit(1);
  if (ownPlan.error) throw new Error(ownPlan.error.message);
  assertGreater((ownPlan.data ?? []).length, 0);
  const otherPlan = await observer.client.from("learner_language_daily_plans").select("user_id").eq("language_id", languageId).limit(1);
  if (otherPlan.error) throw new Error(otherPlan.error.message);
  assertEquals((otherPlan.data ?? []).length, 0, "Another learner must not see someone else's daily plans.");

  const ownNotebook = await learner.client.from("user_vocabulary_notebook_entries").select("id").eq("normalized_word", "itinerary");
  if (ownNotebook.error) throw new Error(ownNotebook.error.message);
  assertEquals((ownNotebook.data ?? []).length, 1);
  const otherNotebook = await observer.client.from("user_vocabulary_notebook_entries").select("id").eq("normalized_word", "itinerary");
  if (otherNotebook.error) throw new Error(otherNotebook.error.message);
  assertEquals((otherNotebook.data ?? []).length, 0, "Another learner must not see someone else's vocabulary notebook rows.");
  },
});

Deno.test({
  name: "repeated writing grammar issues trigger grammar remediation recommendations",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
  const { languageId, products } = await loadCatalog();
  const learner = await createTestUser("writing-remediation");
  await ensureGoal(learner.userId, languageId, 30);

  let contentItemId: string | undefined;
  const issue = {
    category: "grammar",
    subskill_key: "writing.grammar_accuracy",
    explanation: "Articles are missing before singular count nouns.",
    correction_hint: "Add an article before each singular count noun before the next draft.",
  };

  for (let index = 0; index < 3; index += 1) {
    const attempt = await createLearningAttempt(learner, "writing", products.writing, {
      sourceRef: uniqueLabel("writing-remediation"),
      title: `Writing remediation ${index + 1}`,
      skillKey: "writing",
      subskillKeys: ["writing.grammar", "writing.revision"],
      contentType: "writing.verification",
      contentItemId,
      correctnessRatio: 0.43,
      correctionQualityRatio: 0.4,
      issues: [issue],
    });
    contentItemId = attempt.contentItemId;
  }

  const grammarErrors = await service
    .from("learner_language_errors")
    .select("*")
    .eq("user_id", learner.userId)
    .eq("language_id", languageId)
    .eq("service_key", "writing")
    .eq("error_type", issue.explanation)
    .maybeSingle();
  if (grammarErrors.error || !grammarErrors.data?.id) {
    throw new Error(`Failed to load repeated writing grammar error: ${grammarErrors.error?.message ?? "missing row"}`);
  }
  assertGreater(Number(grammarErrors.data.error_frequency ?? 0), 2);

  const queue = await authedFetch(learner.token, "recommendations/queue?language_code=en");
  assertEquals(queue.status, 200);
  assert(
    ((queue.body.queue as Array<Record<string, unknown>>) ?? []).some((row) =>
      String(row.recommended_service_key ?? "") === "grammar"
        && String(row.recommendation_type ?? "") === "remediation"
    ),
    "Repeated writing grammar errors should route into grammar remediation.",
  );
  },
});

Deno.test({
  name: "repeated listening decoding failures stay in listening recovery instead of jumping to reading",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
  const { languageId, products } = await loadCatalog();
  const learner = await createTestUser("listening-recovery");
  await ensureGoal(learner.userId, languageId, 25);

  let contentItemId: string | undefined;
  for (let index = 0; index < 2; index += 1) {
    const attempt = await createLearningAttempt(learner, "listening", products.listening, {
      sourceRef: uniqueLabel("listening-pattern"),
      title: `Listening recovery ${index + 1}`,
      skillKey: "listening",
      subskillKeys: ["listening.word-recognition"],
      contentType: "listening.verification",
      contentItemId,
      correctnessRatio: 0.38,
      correctionQualityRatio: 0.42,
      issues: [
        {
          category: "listening",
          subskill_key: "listening.word-recognition",
          explanation: "Reduced speech and function words were missed in the clip.",
          correction_hint: "Replay the clip slowly and focus on the unstressed words.",
        },
      ],
    });
    contentItemId = attempt.contentItemId;
  }

  const queue = await authedFetch(learner.token, "recommendations/queue?language_code=en");
  assertEquals(queue.status, 200);
  const rows = (queue.body.queue as Array<Record<string, unknown>>) ?? [];
  assert(
    rows.some((row) =>
      String(row.recommended_service_key ?? "") === "listening"
        && String(row.recommendation_type ?? "") === "recovery"
    ),
    "Repeated low listening accuracy on the same pattern should trigger listening recovery.",
  );
  assert(
    !rows.some((row) =>
      String(row.recommended_service_key ?? "") === "reading"
        && String(row.recommendation_type ?? "") === "recovery"
    ),
    "Listening decoding weakness should not be misrouted into a reading recovery task.",
  );
  },
});

Deno.test({
  name: "failed immersion transfer reopens stable grammar mastery",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
  const { languageId } = await loadCatalog();
  const learner = await createTestUser("immersion-reopen");
  await ensureGoal(learner.userId, languageId, 25);

  const unitKey = uniqueLabel("grammar-stable");
  const seeded = await service
    .from("learner_language_mastery")
    .upsert({
      user_id: learner.userId,
      language_id: languageId,
      service_key: "grammar",
      skill_key: "grammar",
      unit_key: unitKey,
      state: "stable",
      confidence: 0.8,
      success_count: 5,
      failure_count: 0,
      reopened_count: 0,
      last_practiced_at: new Date().toISOString(),
      metadata: { seeded_by: "english-verification" },
    });
  if (seeded.error) throw new Error(seeded.error.message);

  const missionList = await authedFetch(learner.token, "immersion-missions/missions?language_code=en&limit=10");
  assertEquals(missionList.status, 200);
  const missions = (missionList.body.missions as Array<Record<string, unknown>>) ?? [];
  assertGreater(missions.length, 0, "At least one immersion mission should be available.");

  let chosenMission: Record<string, unknown> | null = null;
  let chosenSteps: Array<Record<string, unknown>> = [];
  for (const mission of missions) {
    const details = await authedFetch(
      learner.token,
      `immersion-missions/missions/${encodeURIComponent(String(mission.id ?? mission.slug ?? ""))}?language_code=en`,
    );
    if (details.status !== 200) continue;
    const steps = (details.body.steps as Array<Record<string, unknown>>) ?? [];
    if (steps.some((step) => ["writing", "speaking"].includes(String(step.service_key ?? "")))) {
      chosenMission = toRecord(details.body.mission);
      chosenSteps = steps;
      break;
    }
  }

  assertExists(chosenMission, "The seeded immersion catalog should contain a mission with writing or speaking transfer.");
  assertGreater(chosenSteps.length, 0);

  const stepResponses = chosenSteps.map((step) => {
    const serviceKey = String(step.service_key ?? "");
    return {
      step_id: String(step.id ?? ""),
      response_text: serviceKey === "writing" || serviceKey === "speaking"
        ? "i"
        : "",
    };
  });

  const submitted = await authedFetch(learner.token, "immersion-missions/missions/submit?language_code=en", {
    method: "POST",
    body: JSON.stringify({
      mission_id: String(chosenMission?.id ?? ""),
      step_responses: stepResponses,
      time_spent_seconds: 300,
    }),
  });
  assertEquals(submitted.status, 200, "Immersion mission submission should succeed.");
  assertGreater(Number(toRecord(submitted.body.attempt).transfer_reopen_count ?? 0), 0, "A weak immersion result should reopen stable mastery.");

  const masteryRow = await service
    .from("learner_language_mastery")
    .select("state, reopened_count, confidence")
    .eq("user_id", learner.userId)
    .eq("language_id", languageId)
    .eq("service_key", "grammar")
    .eq("skill_key", "grammar")
    .eq("unit_key", unitKey)
    .maybeSingle();
  if (masteryRow.error || !masteryRow.data) {
    throw new Error(`Failed to load reopened mastery row: ${masteryRow.error?.message ?? "missing row"}`);
  }
  assertEquals(String(masteryRow.data.state ?? ""), "unstable");
  assertGreater(Number(masteryRow.data.reopened_count ?? 0), 0);
  assertLessOrEqual(Number(masteryRow.data.confidence ?? 0), 0.8);
  },
});
