import { requireCandidateAccount } from "./auth.ts";

type Json = Record<string, unknown>;
class CandidateAdmissionError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

type CandidateEntryInput = {
  token_code: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
};

type VoucherLaunchContext = {
  launch_kind: "center_voucher";
  strict_mode: true;
  voucher_id: string;
  voucher_code: string;
  center_tenant_id: string;
  access_kind: string;
  classroom_id: string | null;
};

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...corsHeaders } });

const normalizeCode = (value: unknown): string =>
  String(value ?? "")
    .toUpperCase()
    .replace(/\s+/g, "")
    .trim();

const normalizeEmail = (value: unknown): string => String(value ?? "").trim().toLowerCase();

const normalizePhone = (value: unknown): string => String(value ?? "").trim();

const safeName = (value: unknown): string => String(value ?? "").trim();

const isUuid = (value: unknown): boolean => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value ?? "").trim());

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

const readCandidateInput = async (req: Request): Promise<CandidateEntryInput | null> => {
  const reader = req.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8192) { await reader.cancel(); throw new CandidateAdmissionError(413, 'Candidate details are too large.'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { return null; }
};

const buildVoucherLaunchContext = (voucher: any): VoucherLaunchContext | null => {
  if (!voucher?.id) return null;
  const centerTenantId = String(voucher.tenant_id ?? "").trim();
  const code = String(voucher.code ?? "").trim();
  if (!centerTenantId || !code) return null;
  return {
    launch_kind: "center_voucher",
    strict_mode: true,
    voucher_id: String(voucher.id),
    voucher_code: code,
    center_tenant_id: centerTenantId,
    access_kind: String(voucher.access_kind ?? "mock_exam"),
    classroom_id: isUuid(voucher.classroom_id) ? String(voucher.classroom_id) : null,
  };
};

const buildSessionMetadata = (input: {
  tokenCode: string;
  firstName: string;
  lastName: string;
  email: string;
  launch: VoucherLaunchContext | null;
}): Json => {
  const candidateName = `${input.firstName} ${input.lastName}`.trim();
  const base: Json = {
    exam_mode: "token",
    strict_mode: true,
    launch_kind: input.launch?.launch_kind ?? "candidate_id",
    source: input.launch ? "partner_voucher_redeem" : "candidate_entry",
    token_code: input.tokenCode,
    candidate_name: candidateName,
    candidate_email: input.email,
  };

  if (!input.launch) return base;

  return {
    ...base,
    voucher_id: input.launch.voucher_id,
    voucher_code: input.launch.voucher_code,
    center_tenant_id: input.launch.center_tenant_id,
    classroom_id: input.launch.classroom_id,
    partner_voucher: {
      id: input.launch.voucher_id,
      code: input.launch.voucher_code,
      center_tenant_id: input.launch.center_tenant_id,
      access_kind: input.launch.access_kind,
      classroom_id: input.launch.classroom_id,
    },
  };
};

const mergeSessionMetadata = async (
  sbAdmin: any,
  sessionId: string,
  patch: Json,
): Promise<void> => {
  const { data: sessionRow } = await sbAdmin
    .from("sessions")
    .select("metadata")
    .eq("id", sessionId)
    .maybeSingle();

  const current = asRecord(sessionRow?.metadata);
  const next: Json = { ...current, ...patch };
  const currentVoucher = asRecord(current.partner_voucher);
  const patchVoucher = asRecord(patch.partner_voucher);
  if (Object.keys(currentVoucher).length > 0 || Object.keys(patchVoucher).length > 0) {
    next.partner_voucher = { ...currentVoucher, ...patchVoucher };
  }

  await sbAdmin.from("sessions").update({ metadata: next }).eq("id", sessionId);
};

const loadPartnerVoucherContext = async (
  sbAdmin: any,
  tokenId: string,
  actorId: string,
  verifiedEmail: string,
): Promise<VoucherLaunchContext | null> => {
  const { data: voucher, error } = await sbAdmin
    .from("partner_vouchers")
    .select("id, tenant_id, code, access_kind, classroom_id, status, redeemed_by, assigned_email, expires_at")
    .eq("exam_token_id", tokenId)
    .maybeSingle();
  if (error) throw new Error('Voucher admission is unavailable');
  if (!voucher) return null;
  if (voucher.access_kind !== 'mock_exam' || !['unused', 'redeemed'].includes(voucher.status)
    || (voucher.status === 'unused' && voucher.expires_at && (!Number.isFinite(Date.parse(voucher.expires_at)) || Date.parse(voucher.expires_at) <= Date.now())))
    throw new CandidateAdmissionError(409, 'This voucher is unavailable. Ask your center to review it.');
  if ((voucher.redeemed_by && voucher.redeemed_by !== actorId)
    || (normalizeEmail(voucher.assigned_email) && normalizeEmail(voucher.assigned_email) !== verifiedEmail))
    throw new CandidateAdmissionError(403, 'This voucher is assigned to another account.');
  return buildVoucherLaunchContext(voucher);
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
    .select("id, user_id, metadata")
    .eq("academy_id", classroom.academy_id)
    .eq("user_id", userId)
    .maybeSingle();
  existing = byUser ?? null;

  if (!existing && email) {
    const { data } = await sbAdmin
      .from("academy_contacts")
      .select("id, user_id, metadata")
      .eq("academy_id", classroom.academy_id)
      .ilike("email", email)
      .maybeSingle();
    existing = data ?? null;
  }

  if (existing?.user_id && existing.user_id !== userId) throw new Error("Academy identity requires review");
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
): Promise<VoucherLaunchContext | null> => {
  const { data: voucher } = await sbAdmin
    .from("partner_vouchers")
    .select("id, tenant_id, code, access_kind, status, redeemed_by, metadata, expires_at, classroom_id")
    .eq("exam_token_id", tokenId)
    .maybeSingle();
  if (!voucher?.id) return null;
  const launch = buildVoucherLaunchContext(voucher);
  if (voucher.status === "redeemed" && voucher.redeemed_by && voucher.redeemed_by !== userId) return null;

  await sbAdmin
    .from("partner_vouchers")
    .update({
      status: "redeemed",
      redeemed_by: userId,
      redeemed_at: new Date().toISOString(),
      uses_count: 1,
      metadata: {
        ...((voucher.metadata && typeof voucher.metadata === "object" && !Array.isArray(voucher.metadata)) ? voucher.metadata : {}),
        redeemed_via: "candidate-entry",
      },
    })
    .eq("id", voucher.id)
    .or(`redeemed_by.is.null,redeemed_by.eq.${userId}`)
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
    console.warn("candidate_entry_student_registration_unavailable");
  }

  await enrollVoucherUserInClassroom(sbAdmin, voucher, userId, details).catch((error) => {
    console.warn("candidate_entry_classroom_enrollment_unavailable");
  });

  return launch;
};

const buildCandidateResponse = (
  actorId: string,
  sessionId: string,
  experienceId: string,
  firstSectionId: string | null,
  product: { id: string; slug: string | null; appUrl: string | null } | null,
  launch: VoucherLaunchContext | null,
) =>
  json(200, {
    actor_id: actorId,
    session_id: sessionId,
    experience_id: experienceId,
    first_section_id: firstSectionId,
    product_id: product?.id ?? null,
    product_slug: product?.slug ?? null,
    app_url: product?.appUrl ?? null,
    strict_mode: true,
    launch_kind: launch?.launch_kind ?? "candidate_id",
    voucher_id: launch?.voucher_id ?? null,
    voucher_code: launch?.voucher_code ?? null,
    center_tenant_id: launch?.center_tenant_id ?? null,
    classroom_id: launch?.classroom_id ?? null,
  });

export async function handleCandidateEntry(req: Request, clients: { sbDb: any; sbAuth: any }): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const { sbDb, sbAuth } = clients;
    const identity = await requireCandidateAccount(req, sbAuth);
    if (!identity.ok) return json(identity.status, { error: identity.error });
    const userId = identity.userId;
    const body = await readCandidateInput(req);
    if (!body || typeof body !== 'object' || Array.isArray(body)
      || Object.entries({token_code:90,first_name:100,last_name:100,email:320,phone:80}).some(([field,max]) =>
        typeof body[field as keyof CandidateEntryInput] !== 'string' || body[field as keyof CandidateEntryInput].length > max))
      return json(400, {error:'Enter valid candidate details.'});

    const tokenCode = normalizeCode(body?.token_code);
    const firstName = safeName(body?.first_name);
    const lastName = safeName(body?.last_name);
    const email = normalizeEmail(body?.email);
    const phone = normalizePhone(body?.phone);

    if (!tokenCode) return json(400, { error: "Candidate ID is required" });
    if (!/^[A-Z0-9-]{6,90}$/.test(tokenCode)) return json(400, {error:'Enter a valid Candidate ID.'});
    if (!firstName || !lastName) return json(400, { error: "First and last name are required" });
    if (!email) return json(400, { error: "Email is required" });
    if (!phone) return json(400, { error: "Phone is required" });

    if (email !== identity.email) return json(403, { error: "Use the email of your signed-in account." });
    const { data: tokenRow, error: tokenErr } = await sbDb
      .from("exam_tokens")
      .select("id, tenant_id, experience_id, status, expires_at, max_uses, uses_count, claimed_by")
      .eq("token_code", tokenCode)
      .maybeSingle();

    if (tokenErr) return json(500, { error: "Failed to validate candidate ID" });
    if (!tokenRow) return json(404, { error: "Candidate ID not found" });

    const nowIso = new Date().toISOString();
    const expiresAt = tokenRow.expires_at ? Date.parse(tokenRow.expires_at) : null;
    if (expiresAt !== null && (!Number.isFinite(expiresAt) || Date.now() >= expiresAt)) return json(400, { error: "Candidate ID has expired" });

    const { data: experienceRow, error: expErr } = await sbDb
      .from("experiences")
      .select("id, is_active, product_id")
      .eq("id", tokenRow.experience_id)
      .maybeSingle();

    if (expErr) return json(500, { error: "Failed to load test" });
    if (!experienceRow || !experienceRow.is_active) return json(400, { error: "Test is not active" });

    const { data: productRow, error: productErr } = await sbDb
      .from("products")
      .select("id, user_id, metadata")
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
    let appUrl: URL;
    try { appUrl = new URL(product.appUrl); } catch { return json(400, {error:'Exam app URL is not configured correctly'}); }
    if (!['https://ielts.schood.online','https://sat.schood.online','https://toefl.schood.online','https://itep.schood.online'].includes(appUrl.origin)
      || appUrl.username || appUrl.password || appUrl.search || appUrl.hash || appUrl.pathname !== '/')
      return json(400, {error:'Exam app URL is not configured correctly'});

    const { data: firstSection } = await sbDb
      .from("sections")
      .select("id")
      .eq("experience_id", tokenRow.experience_id)
      .order("display_order", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!firstSection?.id) return json(400, { error: "Test is not ready yet. Please contact your teacher." });

    const pendingLaunch = await loadPartnerVoucherContext(sbDb, tokenRow.id, userId, identity.email);

    const maxUses = Number(tokenRow.max_uses ?? 1);
    const usesCount = Number(tokenRow.uses_count ?? 0);
    const isAlreadyUsed = Boolean(tokenRow.claimed_by) || usesCount >= Math.max(1, maxUses);
    const tokenUsable = String(tokenRow.status) === "active" && !isAlreadyUsed;

    if (!tokenUsable) {
      const { data: latestToken } = await sbDb
        .from("exam_tokens")
        .select("id, status, claimed_by")
        .eq("id", tokenRow.id)
        .maybeSingle();

      const latestStatus = String(latestToken?.status ?? tokenRow.status);
      const claimedBy = latestToken?.claimed_by ? String(latestToken.claimed_by) : (tokenRow.claimed_by ? String(tokenRow.claimed_by) : null);

      // Idempotent retry: if token is already claimed and there is an in-progress session,
      // recover only the verified account's session for this token.
      if (latestStatus === "claimed" && claimedBy === userId) {
        const existingSession = await findReusableSession(sbDb, tokenRow.id, claimedBy);
        if (existingSession) {
          const launch = await markPartnerVoucherForToken(sbDb, tokenRow.id, claimedBy, { firstName, lastName, email, phone });
          await mergeSessionMetadata(
            sbDb,
            existingSession.id,
            buildSessionMetadata({ tokenCode, firstName, lastName, email, launch: launch ?? pendingLaunch }),
          );
          return buildCandidateResponse(
            userId,
            existingSession.id,
            existingSession.experience_id,
            String(firstSection.id),
            product,
            launch ?? pendingLaunch,
          );
        }
      }

      if (latestStatus === "claimed") return json(400, { error: "Candidate ID has already been used" });
      if (latestStatus !== "active") return json(400, { error: "Candidate ID is no longer active" });
      return json(400, { error: "Candidate ID has already been used" });
    }

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
          const launch = await markPartnerVoucherForToken(sbDb, tokenRow.id, userId, { firstName, lastName, email, phone });
          await mergeSessionMetadata(
            sbDb,
            existingSession.id,
            buildSessionMetadata({ tokenCode, firstName, lastName, email, launch: launch ?? pendingLaunch }),
          );
          return buildCandidateResponse(
            userId,
            existingSession.id,
            existingSession.experience_id,
            String(firstSection.id),
            product,
            launch ?? pendingLaunch,
          );
        }
      }

      return json(400, { error: "Candidate ID has already been used" });
    }

    const sessionMetadata = buildSessionMetadata({ tokenCode, firstName, lastName, email, launch: pendingLaunch });

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
        .eq("id", tokenRow.id)
        .eq("status", "claimed")
        .eq("claimed_by", userId);
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

    const launch = await markPartnerVoucherForToken(sbDb, tokenRow.id, userId, { firstName, lastName, email, phone });
    if (launch) {
      await mergeSessionMetadata(
        sbDb,
        sessionRow.id,
        buildSessionMetadata({ tokenCode, firstName, lastName, email, launch }),
      );
    }

    return buildCandidateResponse(
      userId,
      sessionRow.id,
      tokenRow.experience_id,
      String(firstSection.id),
      product,
      launch ?? pendingLaunch,
    );
  } catch (error) {
    if (error instanceof CandidateAdmissionError) return json(error.status, {error:error.message});
    return json(503, { error: "Exam entry is temporarily unavailable. Retry the same candidate code." });
  }
}
