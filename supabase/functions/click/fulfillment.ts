export type FulfillmentResult = {
  ok: boolean;
  state: "fulfilled" | "legacy_completed" | "reconciliation" | "retry" | "unavailable";
  deduped?: boolean;
};

// The RPC owns the complete transaction. No side-effect fallback is safe if the
// database is unavailable or a response is lost after it committed.
export async function fulfillPayment(
  supabase: { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> },
  paymentId: string,
): Promise<FulfillmentResult> {
  try {
    const { data, error } = await supabase.rpc("fulfill_paid_payment", { p_payment_id: paymentId });
    if (error || !data || typeof data !== "object") return { ok: false, state: "unavailable" };
    const result = data as Record<string, unknown>;
    if (result.ok === true && (result.state === "fulfilled" || result.state === "legacy_completed")) {
      return { ok: true, state: result.state, deduped: result.deduped === true };
    }
    if (result.ok === false && (result.state === "reconciliation" || result.state === "retry")) {
      return { ok: false, state: result.state };
    }
    return { ok: false, state: "unavailable" };
  } catch {
    return { ok: false, state: "unavailable" };
  }
}
