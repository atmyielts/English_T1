import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type JsonRecord = Record<string, unknown>;

type LanguageRow = {
  id: string;
  code: string;
  name: string;
};

type LexiconRow = {
  id: string;
  normalized_word: string;
  display_word: string;
  definition: string | null;
  example: string | null;
};

type NotebookRow = {
  id: string;
  word: string;
  normalized_word: string;
  context_text: string | null;
  source_type: string;
  source_label: string | null;
  source_ref: string | null;
  notes: string | null;
  leitner_box: number;
  next_review_at: string;
  last_reviewed_at: string | null;
  review_count: number;
  correct_count: number;
  incorrect_count: number;
  metadata: JsonRecord | null;
  lexicon_entry_id: string | null;
  updated_at: string;
};

type CaptureItem = {
  word: string;
  lemma?: string | null;
  part_of_speech?: string | null;
  definition?: string | null;
  example?: string | null;
  context_text?: string | null;
  source_type?: string | null;
  source_product_id?: string | null;
  source_label?: string | null;
  source_ref?: string | null;
  notes?: string | null;
  metadata?: JsonRecord | null;
};

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const getEnv = (key: string): string => {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`Missing env var: ${key}`);
  return value;
};

const readJson = async (req: Request): Promise<JsonRecord> => {
  try {
    return (await req.json()) as JsonRecord;
  } catch {
    return {};
  }
};

const toText = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const normalizeWord = (raw: string): string => {
  const lowered = raw.trim().toLowerCase();
  const compact = lowered.replace(/\s+/g, " ");
  return compact.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "");
};

const intervalDaysForBox = (box: number): number => {
  if (box <= 1) return 1;
  if (box === 2) return 2;
  if (box === 3) return 4;
  if (box === 4) return 8;
  return 16;
};

const asJsonRecord = (value: unknown): JsonRecord => (value && typeof value === "object" && !Array.isArray(value))
  ? (value as JsonRecord)
  : {};

const resolveLanguage = async (
  serviceClient: any,
  languageCodeOrId: string,
): Promise<LanguageRow | null> => {
  const key = languageCodeOrId.trim().toLowerCase() || "en";
  const byId = /^[0-9a-f-]{36}$/.test(key);

  let query = serviceClient
    .from("languages")
    .select("id, code, name")
    .limit(1);

  query = byId ? query.eq("id", key) : query.eq("code", key);
  const { data } = await query.maybeSingle();
  if (!data) return null;

  return {
    id: String((data as any).id),
    code: String((data as any).code ?? "").toLowerCase(),
    name: String((data as any).name ?? ""),
  };
};

const loadLexiconMap = async (
  serviceClient: any,
  lexiconIds: string[],
): Promise<Map<string, LexiconRow>> => {
  if (lexiconIds.length === 0) return new Map();

  const { data } = await serviceClient
    .from("language_lexicon_entries")
    .select("id, normalized_word, display_word, definition, example")
    .in("id", lexiconIds);

  const rows = (data ?? []) as LexiconRow[];
  return new Map(rows.map((row) => [row.id, row]));
};

const enrichRows = async (
  serviceClient: any,
  rows: NotebookRow[],
) => {
  const lexiconIds = Array.from(
    new Set(
      rows
        .map((row) => row.lexicon_entry_id)
        .filter((value): value is string => Boolean(value)),
    ),
  );
  const lexiconMap = await loadLexiconMap(serviceClient, lexiconIds);

  return rows.map((row) => {
    const lexicon = row.lexicon_entry_id ? lexiconMap.get(row.lexicon_entry_id) : null;
    const meta = asJsonRecord(row.metadata ?? {});
    const localDefinition = toText(meta.definition);
    const localExample = toText(meta.example);

    return {
      id: row.id,
      word: row.word,
      normalized_word: row.normalized_word,
      definition: localDefinition || lexicon?.definition || null,
      example: localExample || lexicon?.example || null,
      context_text: row.context_text,
      source_type: row.source_type,
      source_label: row.source_label,
      source_ref: row.source_ref,
      notes: row.notes,
      leitner_box: row.leitner_box,
      next_review_at: row.next_review_at,
      last_reviewed_at: row.last_reviewed_at,
      review_count: row.review_count,
      correct_count: row.correct_count,
      incorrect_count: row.incorrect_count,
      updated_at: row.updated_at,
    };
  });
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (req.method !== "GET" && req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  try {
    const supabaseUrl = getEnv("SUPABASE_URL");
    const supabaseAnonKey = getEnv("SUPABASE_ANON_KEY");
    const supabaseServiceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false },
    });
    const serviceClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false },
    });

    const { data: userData, error: userError } = await anonClient.auth.getUser(token);
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
    const authedUserId = userData.user.id;

    const url = new URL(req.url);
    const body = req.method === "POST" ? await readJson(req) : {};
    const requestedLanguage = toText(url.searchParams.get("language_code") ?? body.language_code ?? "en") || "en";
    const language = await resolveLanguage(serviceClient, requestedLanguage);
    if (!language) {
      return new Response(JSON.stringify({ error: "Language not found", language: requestedLanguage }), {
        status: 404,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (req.method === "GET") {
      const mode = toText(url.searchParams.get("mode")).toLowerCase() || "daily";
      const requestedLimit = Number(url.searchParams.get("limit") ?? (mode === "recent" ? 12 : 10));
      const limit = clamp(Number.isFinite(requestedLimit) ? Math.floor(requestedLimit) : 10, 1, 50);
      const nowIso = new Date().toISOString();

      let query = serviceClient
        .from("user_vocabulary_notebook_entries")
        .select(
          "id, word, normalized_word, context_text, source_type, source_label, source_ref, notes, leitner_box, next_review_at, last_reviewed_at, review_count, correct_count, incorrect_count, metadata, lexicon_entry_id, updated_at",
        )
        .eq("user_id", authedUserId)
        .eq("language_id", language.id)
        .eq("is_archived", false)
        .limit(limit);

      if (mode === "recent") {
        query = query.order("updated_at", { ascending: false });
      } else {
        query = query.lte("next_review_at", nowIso).order("next_review_at", { ascending: true });
      }

      const { data: notebookRows, error: notebookError } = await query;
      if (notebookError) {
        return new Response(JSON.stringify({ error: "Failed to load notebook", details: notebookError.message }), {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const { count: dueCount } = await serviceClient
        .from("user_vocabulary_notebook_entries")
        .select("id", { head: true, count: "exact" })
        .eq("user_id", authedUserId)
        .eq("language_id", language.id)
        .eq("is_archived", false)
        .lte("next_review_at", nowIso);

      const { count: totalCount } = await serviceClient
        .from("user_vocabulary_notebook_entries")
        .select("id", { head: true, count: "exact" })
        .eq("user_id", authedUserId)
        .eq("language_id", language.id)
        .eq("is_archived", false);

      const cards = await enrichRows(serviceClient, (notebookRows ?? []) as NotebookRow[]);
      return new Response(
        JSON.stringify({
          scope: {
            user_id: authedUserId,
            language_id: language.id,
            language_code: language.code,
            mode,
          },
          summary: {
            due_count: dueCount ?? 0,
            total_count: totalCount ?? 0,
          },
          cards,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        },
      );
    }

    const action = toText(body.action).toLowerCase();
    if (action !== "capture" && action !== "review" && action !== "archive") {
      return new Response(JSON.stringify({ error: "Unsupported action", action }), {
        status: 422,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (action === "capture") {
      const rawItems = Array.isArray(body.items) ? body.items as unknown[] : [];
      const items = rawItems
        .map((value) => (value && typeof value === "object" ? value as CaptureItem : null))
        .filter((value): value is CaptureItem => Boolean(value));

      if (items.length === 0) {
        return new Response(JSON.stringify({ error: "No capture items provided" }), {
          status: 422,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      if (items.length > 50) {
        return new Response(JSON.stringify({ error: "Too many items", max: 50 }), {
          status: 422,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const cleaned = items
        .map((item) => {
          const word = toText(item.word);
          const normalizedWord = normalizeWord(word);
          if (!normalizedWord) return null;
          return {
            word,
            normalized_word: normalizedWord,
            lemma: toText(item.lemma) || null,
            part_of_speech: toText(item.part_of_speech) || null,
            definition: toText(item.definition) || null,
            example: toText(item.example) || null,
            context_text: toText(item.context_text) || null,
            source_type: toText(item.source_type) || "manual",
            source_product_id: toText(item.source_product_id) || null,
            source_label: toText(item.source_label) || null,
            source_ref: toText(item.source_ref) || null,
            notes: toText(item.notes) || null,
            metadata: asJsonRecord(item.metadata ?? {}),
          };
        })
        .filter((value): value is NonNullable<typeof value> => Boolean(value));

      if (cleaned.length === 0) {
        return new Response(JSON.stringify({ error: "No valid words after normalization" }), {
          status: 422,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const sourceProductIds = Array.from(
        new Set(
          cleaned
            .map((item) => item.source_product_id)
            .filter((value): value is string => Boolean(value)),
        ),
      );

      if (sourceProductIds.length > 0) {
        const { data: allowedProducts } = await serviceClient
          .from("product_languages")
          .select("product_id")
          .eq("language_id", language.id)
          .eq("included_in_shared_profile", true)
          .in("product_id", sourceProductIds);

        const allowedSet = new Set((allowedProducts ?? []).map((row: any) => String(row.product_id)));
        const disallowed = sourceProductIds.filter((id) => !allowedSet.has(id));
        if (disallowed.length > 0) {
          return new Response(
            JSON.stringify({
              error: "Source product is not mapped to requested language scope",
              language_code: language.code,
              disallowed_product_ids: disallowed,
            }),
            {
              status: 422,
              headers: { "Content-Type": "application/json", ...corsHeaders },
            },
          );
        }
      }

      const words = Array.from(new Set(cleaned.map((item) => item.normalized_word)));
      const { data: existingLexiconRows } = await serviceClient
        .from("language_lexicon_entries")
        .select("id, normalized_word")
        .eq("language_id", language.id)
        .in("normalized_word", words);

      const lexiconMap = new Map(
        ((existingLexiconRows ?? []) as { id: string; normalized_word: string }[]).map((row) => [row.normalized_word, row.id]),
      );

      const missingLexiconRows = words.filter((word) => !lexiconMap.has(word)).map((word) => {
        const seed = cleaned.find((item) => item.normalized_word === word)!;
        return {
          language_id: language.id,
          normalized_word: word,
          display_word: seed.word,
          lemma: seed.lemma,
          part_of_speech: seed.part_of_speech,
          definition: seed.definition,
          example: seed.example,
          metadata: {
            seeded_by: "vocabulary-notebook.capture",
          },
        };
      });

      if (missingLexiconRows.length > 0) {
        const { data: insertedLexiconRows, error: lexiconInsertError } = await serviceClient
          .from("language_lexicon_entries")
          .upsert(missingLexiconRows, { onConflict: "language_id,normalized_word" })
          .select("id, normalized_word");

        if (lexiconInsertError) {
          return new Response(JSON.stringify({ error: "Failed to upsert lexicon entries", details: lexiconInsertError.message }), {
            status: 500,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }

        for (const row of (insertedLexiconRows ?? []) as { id: string; normalized_word: string }[]) {
          lexiconMap.set(row.normalized_word, row.id);
        }
      }

      const notebookRows = cleaned.map((item) => ({
        user_id: authedUserId,
        language_id: language.id,
        lexicon_entry_id: lexiconMap.get(item.normalized_word) ?? null,
        word: item.word,
        normalized_word: item.normalized_word,
        context_text: item.context_text,
        source_type: item.source_type,
        source_product_id: item.source_product_id,
        source_label: item.source_label,
        source_ref: item.source_ref,
        notes: item.notes,
        is_archived: false,
        metadata: {
          ...item.metadata,
          definition: item.definition,
          example: item.example,
          captured_at: new Date().toISOString(),
        },
      }));

      const { data: upsertedRows, error: notebookUpsertError } = await serviceClient
        .from("user_vocabulary_notebook_entries")
        .upsert(notebookRows, { onConflict: "user_id,language_id,normalized_word" })
        .select(
          "id, word, normalized_word, context_text, source_type, source_label, source_ref, notes, leitner_box, next_review_at, last_reviewed_at, review_count, correct_count, incorrect_count, metadata, lexicon_entry_id, updated_at",
        );

      if (notebookUpsertError) {
        return new Response(JSON.stringify({ error: "Failed to save notebook words", details: notebookUpsertError.message }), {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const cards = await enrichRows(serviceClient, (upsertedRows ?? []) as NotebookRow[]);
      return new Response(
        JSON.stringify({
          saved: cards.length,
          cards,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        },
      );
    }

    if (action === "archive") {
      const entryId = toText(body.entry_id);
      if (!entryId) {
        return new Response(JSON.stringify({ error: "entry_id is required" }), {
          status: 422,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const { error: archiveError } = await serviceClient
        .from("user_vocabulary_notebook_entries")
        .update({ is_archived: true })
        .eq("id", entryId)
        .eq("user_id", authedUserId)
        .eq("language_id", language.id);

      if (archiveError) {
        return new Response(JSON.stringify({ error: "Failed to archive card", details: archiveError.message }), {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      return new Response(JSON.stringify({ archived: true, entry_id: entryId }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const entryId = toText(body.entry_id);
    const outcome = toText(body.outcome).toLowerCase();
    if (!entryId || (outcome !== "correct" && outcome !== "incorrect")) {
      return new Response(JSON.stringify({ error: "entry_id and outcome(correct|incorrect) are required" }), {
        status: 422,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const { data: currentRow, error: currentError } = await serviceClient
      .from("user_vocabulary_notebook_entries")
      .select(
        "id, leitner_box, review_count, correct_count, incorrect_count, word, normalized_word, context_text, source_type, source_label, source_ref, notes, next_review_at, last_reviewed_at, metadata, lexicon_entry_id, updated_at",
      )
      .eq("id", entryId)
      .eq("user_id", authedUserId)
      .eq("language_id", language.id)
      .eq("is_archived", false)
      .maybeSingle();

    if (currentError) {
      return new Response(JSON.stringify({ error: "Failed to load notebook card", details: currentError.message }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (!currentRow) {
      return new Response(JSON.stringify({ error: "Card not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const currentBox = Number((currentRow as any).leitner_box ?? 1);
    const nextBox = outcome === "correct" ? clamp(currentBox + 1, 1, 5) : 1;
    const intervalDays = intervalDaysForBox(nextBox);
    const now = new Date();
    const nextReviewAt = new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000).toISOString();

    const { data: updatedRow, error: updateError } = await serviceClient
      .from("user_vocabulary_notebook_entries")
      .update({
        leitner_box: nextBox,
        next_review_at: nextReviewAt,
        last_reviewed_at: now.toISOString(),
        review_count: Number((currentRow as any).review_count ?? 0) + 1,
        correct_count: Number((currentRow as any).correct_count ?? 0) + (outcome === "correct" ? 1 : 0),
        incorrect_count: Number((currentRow as any).incorrect_count ?? 0) + (outcome === "incorrect" ? 1 : 0),
      })
      .eq("id", entryId)
      .eq("user_id", authedUserId)
      .eq("language_id", language.id)
      .select(
        "id, word, normalized_word, context_text, source_type, source_label, source_ref, notes, leitner_box, next_review_at, last_reviewed_at, review_count, correct_count, incorrect_count, metadata, lexicon_entry_id, updated_at",
      )
      .maybeSingle();

    if (updateError || !updatedRow) {
      return new Response(JSON.stringify({ error: "Failed to update review card", details: updateError?.message ?? null }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const [card] = await enrichRows(serviceClient, [updatedRow as NotebookRow]);
    return new Response(
      JSON.stringify({
        updated: true,
        card,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
