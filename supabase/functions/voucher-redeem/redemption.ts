type Rpc = {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { code?: string } | null }>;
};
const uuid = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const object = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));
const timestamp = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value));
export async function redeemVoucherRequest(
  sb: Rpc,
  actor: string,
  voucher: { id: string; code: string; product_id: string },
) {
  const retry = () => ({
    status: 503,
    body: { error: 'Voucher confirmation is unavailable. Retry the same voucher in this account.' },
  });
  if (!uuid(actor) || !uuid(voucher.id) || !uuid(voucher.product_id) || !/^[A-Z0-9-]{6,90}$/.test(voucher.code)) {
    return { status: 400, body: { error: 'Valid voucher reference is required.' } };
  }
  let response: Awaited<ReturnType<Rpc['rpc']>>;
  try {
    response = await sb.rpc('redeem_purchased_voucher', { p_actor: actor, p_code: voucher.code });
  } catch {
    return retry();
  }
  if (response.error) {
    if (response.error.code === '42501') {
      return { status: 403, body: { error: 'This voucher is unavailable for the signed-in account.' } };
    }
    if (['22023', '23505', '23514', 'P0002'].includes(response.error.code ?? '')) {
      return {
        status: 409,
        body: { error: 'This voucher needs review. Check your account access before redeeming another voucher.' },
      };
    }
    return retry();
  }
  const data = response.data;
  if (
    !object(data) || data.ok !== true || data.state !== 'redeemed' || typeof data.deduped !== 'boolean' ||
    data.voucher_id !== voucher.id || data.beneficiary_id !== actor || !uuid(data.beneficiary_tenant_id) ||
    !timestamp(data.redeemed_at) ||
    !object(data.grant) || !Array.isArray(data.grant.product_ids) || !data.grant.product_ids.length ||
    data.grant.product_ids.length > 101 ||
    !data.grant.product_ids.every(uuid) || new Set(data.grant.product_ids).size !== data.grant.product_ids.length ||
    !data.grant.product_ids.includes(voucher.product_id) || !timestamp(data.grant.starts_at) ||
    !(data.grant.ends_at === null || timestamp(data.grant.ends_at))
  ) return retry();
  // Public callers receive only confirmation and their grant. Private receipt
  // identity, financial data and arbitrary database fields stay server-side.
  return {
    status: 200,
    body: {
      deduped: data.deduped,
      redeemed_at: data.redeemed_at,
      grant: { product_ids: data.grant.product_ids, starts_at: data.grant.starts_at, ends_at: data.grant.ends_at },
    },
  };
}
