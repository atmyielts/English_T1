// Authorization belongs to the office entry point; pricing, replay and order
// creation belong to Click's database commands. Never price a retry here.
export function partnerCheckoutPayload(action: string, tenantId: string, body: Record<string, unknown>): Record<string, unknown> {
  const common = { tenant_id: tenantId, idempotency_key: body.idempotency_key,
    redirect_url: body.redirect_url ?? null };
  if (action === "create_wallet_topup") return {
    ...common, purchase_type: "center_wallet_topup", amount: body.amount,
    currency: String(body.currency ?? "UZS").toUpperCase(), description: "Education center wallet top-up",
    metadata: { center_office: true, center_tenant_id: tenantId, note: body.note ?? null },
  };
  if (action === "create_tier_upgrade_payment") return {
    ...common, purchase_type: "center_tier_upgrade", description: "Education center tier purchase",
    metadata: { center_office: true, center_tenant_id: tenantId,
      requested_tier: String(body.requested_tier ?? body.tier ?? "").trim().toLowerCase(),
      billing_period: String(body.billing_period ?? "monthly").trim().toLowerCase() },
  };
  if (!["create_ticket_purchase", "create_seat_purchase"].includes(action)) throw new Error("Unsupported checkout action");
  const tickets = action === "create_ticket_purchase";
  return { ...common, purchase_type: tickets ? "token_pack" : "seat_pack",
    ...(tickets ? { experience_id: body.experience_id, quantity: body.quantity,
      expires_in_days: body.expires_in_days ?? 30 } : { plan_id: body.plan_id, seat_count: body.seat_count ?? body.quantity }),
    description: tickets ? "Partner mock ticket pack" : "Partner seat pack",
    apply_credit: body.center_office === true ? false : body.apply_credit,
    credit_amount: body.center_office === true ? undefined : body.credit_amount,
    referral_code: body.referral_code ?? null,
    metadata: { center_office: body.center_office === true, center_tenant_id: tenantId },
  };
}
