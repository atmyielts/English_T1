import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Json = Record<string, unknown>;

type CandidateEntryInput = {
  token_code: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
};

type SessionPayload = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
};

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...corsHeaders } });

const getEnv = (key: string): string => {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`Missing env var: ${key}`);
  return value;
};

const normalizeCode = (value: unknown): string =>
  String(value ?? "")
    .toUpperCase()
    .replace(/\s+/g, "")
    .trim();

const normalizeEmail = (value: unknown): string => String(value ?? "").trim().toLowerCase();

const normalizePhone = (value: unknown): string => String(value ?? "").trim();

const safeName = (value: unknown): string => String(value ?? "").trim();

const normalizeNameForCompare = (value: unknown): string =>
  safeName(value)
    .replace(/\s+/g, " ")
    .toLowerCase();

const normalizePhoneForCompare = (value: unknown): string =>
  normalizePhone(value)
    .replace(/\D+/g, "");

const isUuid = (value: unknown): boolean => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value ?? "").trim());

const nonEmpty = (value: unknown): string | null => {
  const s = String(value ?? "").trim();
  return s.length > 0 ? s : null;
};

const pickFirstNonEmpty = (...values: unknown[]): string | null => {
  for (const v of values) {
    const s = nonEmpty(v);
    if (s) return s;
  }
  return null;
};

const buildPassword = (): string => {
  const base = crypto.randomUUID().replace(/-/g, "");
  return `Tmp-${base}-A1!`;
};

const findUserIdByEmail = async (
  sbDb: any,
  sbAuth: any,
  email: string,
): Promise<string | null> => {
  const { data: userRow } = await sbDb.from("users").select("id, email").eq("email", email).maybeSingle();
  if (userRow?.id) return String(userRow.id);

  // Fallback: scan Auth users if the mirror table is out of sync.
  let page = 1;
  const perPage = 200;
  for (let i = 0; i < 10; i += 1) {
    const { data, error } = await sbAuth.auth.admin.listUsers({ page, perPage });
    if (error) break;
    const match = (data?.users ?? []).find((u: any) => String(u.email ?? "").toLowerCase() === email);
    if (match?.id) return String(match.id);
    if (data?.lastPage && page >= data.lastPage) break;
    page += 1;
  }
  return null;
};

const ensureUserSession = async (
  sbDb: any,
  sbAuth: any,
  sbAnon: any,
  email: string,
  firstName: string,
  lastName: string,
  phone: string,
  existingUserIdHint: string | null = null,
): Promise<{ userId: string; session: any }> => {
  const existingUserId = existingUserIdHint ?? (await findUserIdByEmail(sbDb, sbAuth, email));
  if (existingUserId) {
    const { data: linkData, error: linkErr } = await sbAuth.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo: "https://example.com" },
    });
    if (linkErr) throw new Error("Failed to generate login link");

    const tokenHash = (linkData as any)?.properties?.hashed_token ?? null;
    if (!tokenHash) throw new Error("Failed to generate login token");

    const { data: sessionData, error: verifyErr } = await sbAuth.auth.verifyOtp({
      token_hash: tokenHash,
      type: "magiclink",
    } as any);

    if (verifyErr || !sessionData?.session) throw new Error("Failed to create session");

    return { userId: existingUserId, session: sessionData.session };
  }

  const password = buildPassword();
  const { data: createData, error: createErr } = await sbAuth.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      first_name: firstName,
      last_name: lastName,
      phone,
    },
  });
  if (createErr || !createData?.user) {
    const fallbackId = await findUserIdByEmail(sbDb, sbAuth, email);
    if (!fallbackId) throw new Error("Failed to create user");

    const { data: linkData, error: linkErr } = await sbAuth.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo: "https://example.com" },
    });
    if (linkErr) throw new Error("Failed to generate login link");

    const tokenHash = (linkData as any)?.properties?.hashed_token ?? null;
    if (!tokenHash) throw new Error("Failed to generate login token");

    const { data: sessionData, error: verifyErr } = await sbAuth.auth.verifyOtp({
      token_hash: tokenHash,
      type: "magiclink",
    } as any);

    if (verifyErr || !sessionData?.session) throw new Error("Failed to create session");

    return { userId: fallbackId, session: sessionData.session };
  }

  const { data: signInData, error: signInErr } = await sbAnon.auth.signInWithPassword({ email, password });
  if (signInErr || !signInData?.session) {
    const { data: linkData, error: linkErr } = await sbAuth.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo: "https://example.com" },
    });
    if (linkErr) throw new Error("Failed to generate login link");

    const tokenHash = (linkData as any)?.properties?.hashed_token ?? null;
    if (!tokenHash) throw new Error("Failed to generate login token");

    const { data: sessionData, error: verifyErr } = await sbAuth.auth.verifyOtp({
      token_hash: tokenHash,
      type: "magiclink",
    } as any);

    if (verifyErr || !sessionData?.session) throw new Error("Failed to create session");

    return { userId: createData.user.id, session: sessionData.session };
  }

  return { userId: createData.user.id, session: signInData.session };
};

const validateExistingIdentity = async (
  sbDb: any,
  sbAuth: any,
  userId: string,
  submitted: { firstName: string; lastName: string; phone: string },
): Promise<{ ok: boolean }> => {
  const { data: profile } = await sbDb
    .from("user_profiles")
    .select("first_name, last_name, phone")
    .eq("user_id", userId)
    .maybeSingle();

  let meta: any = null;
  const { data: authUserData } = await sbAuth.auth.admin.getUserById(userId);
  meta = authUserData?.user?.user_metadata ?? null;

  const expectedFirst = pickFirstNonEmpty(profile?.first_name, meta?.first_name, meta?.given_name, meta?.name);
  const expectedLast = pickFirstNonEmpty(profile?.last_name, meta?.last_name, meta?.family_name);
  const expectedPhone = pickFirstNonEmpty(profile?.phone, meta?.phone);

  if (expectedFirst && normalizeNameForCompare(expectedFirst) !== normalizeNameForCompare(submitted.firstName)) {
    return { ok: false };
  }
  if (expectedLast && normalizeNameForCompare(expectedLast) !== normalizeNameForCompare(submitted.lastName)) {
    return { ok: false };
  }
  if (expectedPhone && normalizePhoneForCompare(expectedPhone) !== normalizePhoneForCompare(submitted.phone)) {
    return { ok: false };
  }

  return { ok: true };
};

const findReusableSession = async (
  sbAdmin: any,
  tokenId: string,
  userId: string,
): Promise<{ id: string; experience_id: string } | null> => {
  const { data: row } = await sbAdmin
    .from("sessions")
    .select("id, experience_id, status")
    .eq("token_id", tokenId)
    .eq("user_id", userId)
    .in("status", ["created", "active", "paused"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!row?.id) return null;
  return { id: String(row.id), experience_id: String(row.experience_id) };
};

const enrollVoucherUserInClassroom = async (
  sbAdmin: any,
  voucher: any,
  userId: string,
  details: { firstName: string; lastName: string; email: string; phone: string },
): Promise<void> => {
  const classroomId = String(voucher?.classroom_id ?? "").trim();
  if (!isUuid(classroomId)) return;

  const { data: classroom } = await sbAdmin
    .from("academy_classrooms")
    .select("id, academy_id, name, is_active")
    .eq("id", classroomId)
    .eq("is_active", true)
    .maybeSingle();
  if (!classroom?.id) return;

  const { data: academy } = await sbAdmin
    .from("tenants")
    .select("id")
    .eq("id", classroom.academy_id)
    .contains("metadata", { parent_center_id: voucher.tenant_id, service_family: "academy" })
    .maybeSingle();
  if (!academy?.id) return;

  const email = details.email.trim().toLowerCase();
  const phone = details.phone.trim();
  let existing: any | null = null;
  const { data: byUser } = await sbAdmin
    .from("academy_contacts")
    .select("id, metadata")
    .eq("academy_id", classroom.academy_id)
    .eq("user_id", userId)
    .maybeSingle();
  existing = byUser ?? null;

  if (!existing && email) {
    const { data } = await sbAdmin
      .from("academy_contacts")
      .select("id, metadata")
      .eq("academy_id", classroom.academy_id)
      .ilike("email", email)
      .maybeSingle();
    existing = data ?? null;
  }

  if (!existing && phone) {
    const { data } = await sbAdmin
      .from("academy_contacts")
      .select("id, metadata")
      .eq("academy_id", classroom.academy_id)
      .eq("phone", phone)
      .maybeSingle();
    existing = data ?? null;
  }

  const existingMeta = existing?.metadata && typeof existing.metadata === "object" && !Array.isArray(existing.metadata)
    ? existing.metadata
    : {};
  const contactPayload = {
    academy_id: classroom.academy_id,
    user_id: userId,
    first_name: details.firstName,
    last_name: details.lastName,
    email: email || null,
    phone: phone || null,
    status: "active",
    last_activity_at: new Date().toISOString(),
    metadata: {
      ...existingMeta,
      source: "partner_voucher_redeem",
      center_tenant_id: voucher.tenant_id,
      voucher_id: voucher.id,
      voucher_code: voucher.code,
      classroom_id: classroom.id,
      enrolled_at: new Date().toISOString(),
    },
  };

  const { data: contact, error: contactError } = existing?.id
    ? await sbAdmin.from("academy_contacts").update(contactPayload).eq("id", existing.id).select("id").maybeSingle()
    : await sbAdmin.from("academy_contacts").insert(contactPayload).select("id").maybeSingle();
  if (contactError || !contact?.id) return;

  await sbAdmin
    .from("academy_classroom_memberships")
    .upsert(
      {
        academy_id: classroom.academy_id,
        classroom_id: classroom.id,
        contact_id: contact.id,
        role: "student",
        metadata: {
          source: "partner_voucher_redeem",
          center_tenant_id: voucher.tenant_id,
          voucher_id: voucher.id,
          voucher_code: voucher.code,
        },
      },
      { onConflict: "classroom_id,contact_id" },
    );
};

const markPartnerVoucherForToken = async (
  sbAdmin: any,
  tokenId: string,
  userId: string,
  details: { firstName: string; lastName: string; email: string; phone: string },
): Promise<void> => {
  const { data: voucher } = await sbAdmin
    .from("partner_vouchers")
    .select("id, tenant_id, code, access_kind, status, redeemed_by, metadata, expires_at, classroom_id")
    .eq("exam_token_id", tokenId)
    .maybeSingle();
  if (!voucher?.id) return;
  if (voucher.status === "redeemed" && voucher.redeemed_by && voucher.redeemed_by !== userId) return;

  await sbAdmin
    .from("partner_vouchers")
    .update({
      status: "redeemed",
      redeemed_by: userId,
      redeemed_at: new Date().toISOString(),
      uses_count: 1,
      assigned_name: `${details.firstName} ${details.lastName}`.trim(),
      assigned_email: details.email,
      assigned_phone: details.phone,
      metadata: {
        ...((voucher.metadata && typeof voucher.metadata === "object" && !Array.isArray(voucher.metadata)) ? voucher.metadata : {}),
        redeemed_via: "candidate-entry",
      },
    })
    .eq("id", voucher.id)
    .in("status", ["unused", "redeemed"]);

  try {
    const email = details.email.trim().toLowerCase();
    const fullName = `${details.firstName} ${details.lastName}`.trim();
    const { data: existing } = await sbAdmin
      .from("partner_center_students")
      .select("id")
      .eq("tenant_id", voucher.tenant_id)
      .eq("user_id", userId)
      .maybeSingle();
    const payload = {
      tenant_id: voucher.tenant_id,
      user_id: userId,
      full_name: fullName || null,
      email,
      phone: details.phone,
      status: "active",
      source_voucher_id: voucher.id,
      last_activity_at: new Date().toISOString(),
      metadata: {
        voucher_code: voucher.code,
        access_kind: voucher.access_kind,
        expires_at: voucher.expires_at ?? null,
        redeemed_via: "candidate-entry",
      },
    };
    if (existing?.id) {
      await sbAdmin.from("partner_center_students").update(payload).eq("id", existing.id);
    } else {
      await sbAdmin.from("partner_center_students").insert(payload);
    }
  } catch (error) {
    console.warn("Failed to upsert partner center student", error);
  }

  await enrollVoucherUserInClassroom(sbAdmin, voucher, userId, details).catch((error) => {
    console.warn("Failed to enroll partner voucher user in academy classroom", error);
  });
};

const buildCandidateResponse = (
  session: SessionPayload,
  sessionId: string,
  experienceId: string,
  firstSectionId: string | null,
  product: { id: string; slug: string | null; appUrl: string | null } | null,
) =>
  json(200, {
    session: {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_in: session.expires_in,
      token_type: session.token_type,
    },
    session_id: sessionId,
    experience_id: experienceId,
    first_section_id: firstSectionId,
    product_id: product?.id ?? null,
    product_slug: product?.slug ?? null,
    app_url: product?.appUrl ?? null,
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const supabaseUrl = getEnv("SUPABASE_URL");
    const serviceKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = getEnv("SUPABASE_ANON_KEY");

    const sbDb = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const sbAuth = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const sbAnon = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });

    const body = (await req.json()) as CandidateEntryInput;

    const tokenCode = normalizeCode(body?.token_code);
    const firstName = safeName(body?.first_name);
    const lastName = safeName(body?.last_name);
    const email = normalizeEmail(body?.email);
    const phone = normalizePhone(body?.phone);

    if (!tokenCode) return json(400, { error: "Candidate ID is required" });
    if (!firstName || !lastName) return json(400, { error: "First and last name are required" });
    if (!email) return json(400, { error: "Email is required" });
    if (!phone) return json(400, { error: "Phone is required" });

    const existingUserId = await findUserIdByEmail(sbDb, sbAuth, email);
    if (existingUserId) {
      const identity = await validateExistingIdentity(sbDb, sbAuth, existingUserId, { firstName, lastName, phone });
      if (!identity.ok) {
        return json(400, { error: "Entered details do not match the existing account for this email" });
      }
    }

    const { data: tokenRow, error: tokenErr } = await sbDb
      .from("exam_tokens")
      .select("id, tenant_id, experience_id, status, expires_at, max_uses, uses_count, claimed_by")
      .eq("token_code", tokenCode)
      .maybeSingle();

    if (tokenErr) return json(500, { error: "Failed to validate candidate ID" });
    if (!tokenRow) return json(404, { error: "Candidate ID not found" });

    const nowIso = new Date().toISOString();
    const expiresAt = tokenRow.expires_at ? Date.parse(tokenRow.expires_at) : null;
    if (expiresAt && Date.now() > expiresAt) return json(400, { error: "Candidate ID has expired" });

    const { data: experienceRow, error: expErr } = await sbDb
      .from("experiences")
      .select("id, is_active, product_id")
      .eq("id", tokenRow.experience_id)
      .maybeSingle();

    if (expErr) return json(500, { error: "Failed to load test" });
    if (!experienceRow || !experienceRow.is_active) return json(400, { error: "Test is not active" });

    const { data: productRow, error: productErr } = await sbDb
      .from("products")
      .select("id, metadata")
      .eq("id", String((experienceRow as any)?.product_id ?? ""))
      .maybeSingle();

    if (productErr) return json(500, { error: "Failed to load product" });

    const product = productRow
      ? {
          id: String((productRow as any).id),
          slug: String((productRow as any)?.metadata?.slug ?? "").trim() || null,
          appUrl: String((productRow as any)?.metadata?.app_url ?? "").trim() || null,
        }
      : null;

    if (!product?.appUrl) {
      return json(400, { error: "Exam app URL is not configured" });
    }

    const { data: firstSection } = await sbDb
      .from("sections")
      .select("id")
      .eq("experience_id", tokenRow.experience_id)
      .order("display_order", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!firstSection?.id) return json(400, { error: "Test is not ready yet. Please contact your teacher." });

    const maxUses = Number(tokenRow.max_uses ?? 1);
    const usesCount = Number(tokenRow.uses_count ?? 0);
    const isAlreadyUsed = Boolean(tokenRow.claimed_by) || usesCount >= Math.max(1, maxUses);
    let tokenUsable = String(tokenRow.status) === "active" && !isAlreadyUsed;

    if (!tokenUsable && String(tokenRow.status) === "claimed") {
      // Recovery for stale lock: token is claimed but session was never created.
      const { data: anySession } = await sbDb
        .from("sessions")
        .select("id")
        .eq("token_id", tokenRow.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!anySession?.id) {
        const { data: reopened } = await sbDb
          .from("exam_tokens")
          .update({ status: "active", claimed_by: null, claimed_at: null, uses_count: 0 })
          .eq("id", tokenRow.id)
          .eq("status", "claimed")
          .select("id")
          .maybeSingle();

        if (reopened?.id) {
          tokenUsable = true;
        }
      }
    }

    if (!tokenUsable) {
      const { data: latestToken } = await sbDb
        .from("exam_tokens")
        .select("id, status, claimed_by")
        .eq("id", tokenRow.id)
        .maybeSingle();

      const latestStatus = String(latestToken?.status ?? tokenRow.status);
      const claimedBy = latestToken?.claimed_by ? String(latestToken.claimed_by) : (tokenRow.claimed_by ? String(tokenRow.claimed_by) : null);

      // Idempotent retry: if token is already claimed and there is an in-progress session,
      // recover that session for this token regardless of re-entered email typos.
      if (latestStatus === "claimed" && claimedBy) {
        const existingSession = await findReusableSession(sbDb, tokenRow.id, claimedBy);
        if (existingSession) {
          const { data: claimedUser } = await sbDb.from("users").select("email").eq("id", claimedBy).maybeSingle();
          const claimedEmail = normalizeEmail((claimedUser as any)?.email ?? "");
          if (!claimedEmail) return json(500, { error: "Failed to recover candidate session" });

          const { session } = await ensureUserSession(sbDb, sbAuth, sbAnon, claimedEmail, firstName, lastName, phone);
          await markPartnerVoucherForToken(sbDb, tokenRow.id, claimedBy, { firstName, lastName, email: claimedEmail, phone });
          return buildCandidateResponse(
            {
              access_token: session.access_token,
              refresh_token: session.refresh_token,
              expires_in: session.expires_in,
              token_type: session.token_type,
            },
            existingSession.id,
            existingSession.experience_id,
            String(firstSection.id),
            product,
          );
        }
      }

      if (latestStatus === "claimed") return json(400, { error: "Candidate ID has already been used" });
      if (latestStatus !== "active") return json(400, { error: "Candidate ID is no longer active" });
      return json(400, { error: "Candidate ID has already been used" });
    }

    const { userId, session } = await ensureUserSession(
      sbDb,
      sbAuth,
      sbAnon,
      email,
      firstName,
      lastName,
      phone,
      existingUserId,
    );

    await sbDb
      .from("user_profiles")
      .upsert({
        user_id: userId,
        first_name: firstName,
        last_name: lastName,
        phone,
      })
      .select("user_id")
      .maybeSingle();

    const { data: claimedRow, error: claimErr } = await sbDb
      .from("exam_tokens")
      .update({
        status: "claimed",
        claimed_by: userId,
        claimed_at: nowIso,
        uses_count: 1,
      })
      .eq("id", tokenRow.id)
      .eq("status", "active")
      .is("claimed_by", null)
      .select("id, token_code, status")
      .maybeSingle();

    if (claimErr) return json(500, { error: "Failed to claim candidate ID" });

    if (!claimedRow) {
      const { data: latestToken } = await sbDb
        .from("exam_tokens")
        .select("id, status, claimed_by")
        .eq("id", tokenRow.id)
        .maybeSingle();

      if (latestToken?.claimed_by === userId && String(latestToken?.status) === "claimed") {
        const existingSession = await findReusableSession(sbDb, tokenRow.id, userId);
        if (existingSession) {
          await markPartnerVoucherForToken(sbDb, tokenRow.id, userId, { firstName, lastName, email, phone });
          return buildCandidateResponse(
            {
              access_token: session.access_token,
              refresh_token: session.refresh_token,
              expires_in: session.expires_in,
              token_type: session.token_type,
            },
            existingSession.id,
            existingSession.experience_id,
            String(firstSection.id),
            product,
          );
        }
      }

      return json(400, { error: "Candidate ID has already been used" });
    }

    const sessionMetadata: Json = {
      exam_mode: "token",
      token_code: tokenCode,
      candidate_name: `${firstName} ${lastName}`.trim(),
      candidate_email: email,
    };

    const { data: sessionRow, error: sessionErr } = await sbDb
      .from("sessions")
      .insert({
        user_id: userId,
        experience_id: tokenRow.experience_id,
        status: "created",
        metadata: sessionMetadata,
        token_id: tokenRow.id,
      })
      .select("id")
      .maybeSingle();

    if (sessionErr || !sessionRow) {
      // Best-effort rollback
      await sbDb
        .from("exam_tokens")
        .update({ status: "active", claimed_by: null, claimed_at: null, uses_count: 0 })
        .eq("id", tokenRow.id);
      return json(500, { error: "Failed to create session" });
    }

    const legalName = `${firstName} ${lastName}`.trim();
    const { data: registrationRow } = await sbDb
      .from("exam_registrations")
      .insert({
        token_id: tokenRow.id,
        tenant_id: tokenRow.tenant_id,
        experience_id: tokenRow.experience_id,
        user_id: userId,
        session_id: sessionRow.id,
        status: "registered",
        first_name: firstName,
        last_name: lastName,
        legal_name: legalName,
        email,
        phone,
      })
      .select("id")
      .maybeSingle();

    if (registrationRow?.id) {
      await sbDb.from("sessions").update({ registration_id: registrationRow.id }).eq("id", sessionRow.id);
    }

    await markPartnerVoucherForToken(sbDb, tokenRow.id, userId, { firstName, lastName, email, phone });

    return buildCandidateResponse(
      {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_in: session.expires_in,
        token_type: session.token_type,
      },
      sessionRow.id,
      tokenRow.experience_id,
      String(firstSection.id),
      product,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return json(500, { error: message });
  }
});
