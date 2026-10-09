type Json = Record<string, unknown>;
const object = (value: unknown): value is Json => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);

export const hasProtectedCenterFinanceFields = (body: Json): boolean =>
  ['commercial_model', 'wholesale_pricing', 'wallet_settings', 'commission_rules', 'package_tier', 'status']
    .some(field => field in body);

// Actor and center scope come from the authenticated entry point. Catalogue,
// funding, capability admission and every write belong to the SQL transaction.
export async function issueVoucherBatch(client: any, actor: string, tenant: string, body: Json):
  Promise<{ status: number; body: Json }> {
  if (!uuid(actor) || !uuid(tenant) || !object(body) || typeof body.access_kind !== 'string' || !['mock_exam', 'subscription', 'seat'].includes(body.access_kind)
    || typeof body.quantity !== 'number' || !Number.isInteger(body.quantity) || body.quantity < 1 || body.quantity > 1000
    || (body.idempotency_key != null && !uuid(body.idempotency_key))) {
    return { status: 400, body: { error: 'A valid voucher purchase and quantity are required.', error_code: 'voucher_input_invalid' } };
  }
  const requestKey = typeof body.idempotency_key === 'string' ? body.idempotency_key.toLowerCase() : null;
  const request: Json = { access_kind: body.access_kind, quantity: body.quantity };
  for (const name of ['experience_id', 'plan_id', 'classroom_id'] as const) {
    const value = body[name];
    if (value != null && value !== '') {
      if (!uuid(value)) return { status: 400, body: { error: 'The selected voucher resource is invalid.', error_code: 'voucher_input_invalid' } };
      request[name] = value.toLowerCase();
    }
  }
  for (const name of ['prefix', 'source_model', 'expires_at'] as const) {
    if (body[name] != null && body[name] !== '') {
      if (typeof body[name] !== 'string') return { status: 400, body: { error: 'Voucher choices are invalid.', error_code: 'voucher_input_invalid' } };
      request[name] = name === 'prefix' ? body[name].trim().toUpperCase() : body[name];
    }
  }
  if (body.expires_in_days != null) {
    if (typeof body.expires_in_days !== 'number' || !Number.isInteger(body.expires_in_days) || body.expires_in_days < 1 || body.expires_in_days > 365)
      return { status: 400, body: { error: 'Voucher expiry is invalid.', error_code: 'voucher_input_invalid' } };
    request.expires_in_days = body.expires_in_days;
  }
  if (body.assigned_students != null) {
    if (!Array.isArray(body.assigned_students) || body.assigned_students.length > body.quantity)
      return { status: 400, body: { error: 'Voucher roster is invalid.', error_code: 'voucher_input_invalid' } };
    const roster: Json[] = [];
    for (const raw of body.assigned_students) {
      if (!object(raw)) return { status: 400, body: { error: 'Voucher roster is invalid.', error_code: 'voucher_input_invalid' } };
      const entry: Json = {};
      for (const [name, max] of [['name', 200], ['email', 320], ['phone', 80]] as const) {
        const value = raw[name];
        if (value == null) continue;
        if (typeof value !== 'string' || value.length > max) return { status: 400, body: { error: 'Voucher roster is invalid.', error_code: 'voucher_input_invalid' } };
        entry[name] = name === 'email' ? value.trim().toLowerCase() : value.trim();
      }
      roster.push(entry);
    }
    request.assigned_students = roster;
  }
  try {
    const { data, error } = await client.rpc('issue_purchased_vouchers', {
      p_actor: actor, p_tenant: tenant, p_key: requestKey, p_request: request,
    });
    if (error) {
      if (error.code === '42501') return { status: 403, body: { error: 'Voucher finance authority or the configured agreement is unavailable.' } };
      if (['22023', '23505', '23514', '22P02', '22003', '22007', '22008'].includes(error.code)) return { status: 409, body: {
        error: 'This voucher purchase requires review. Keep its original reference and choices while checking the recorded batch.',
        error_code: 'voucher_purchase_review',
      } };
      return { status: 503, body: { error: 'Voucher issuance is temporarily unavailable. Retry the original purchase.', error_code: 'voucher_purchase_unavailable' } };
    }
    const batch = object(data) && object(data.batch) ? data.batch : null;
    if (!object(data) || data.ok !== true || data.state !== 'issued' || typeof data.deduped !== 'boolean'
      || !uuid(data.request_key) || (requestKey != null && data.request_key !== requestKey)
      || !batch || !uuid(batch.id) || batch.tenant_id !== tenant || batch.created_by !== actor
      || batch.access_kind !== body.access_kind || batch.quantity !== body.quantity
      || !Array.isArray(data.vouchers) || data.vouchers.length !== body.quantity
      || new Set(data.vouchers.map((v: unknown) => object(v) ? v.id : null)).size !== body.quantity
      || data.vouchers.some((v: unknown) => !object(v) || !uuid(v.id) || v.tenant_id !== tenant || v.batch_id !== batch!.id
        || v.access_kind !== body.access_kind || typeof v.code !== 'string' || !v.code)) {
      return { status: 503, body: { error: 'The recorded batch response is unavailable. Retry the original purchase.', error_code: 'voucher_response_unavailable' } };
    }
    return { status: 200, body: { batch: data.batch, vouchers: data.vouchers, deduped: data.deduped, idempotency_key: data.request_key } };
  } catch {
    return { status: 503, body: { error: 'Voucher issuance is temporarily unavailable. Retry the original purchase.', error_code: 'voucher_purchase_unavailable' } };
  }
}
