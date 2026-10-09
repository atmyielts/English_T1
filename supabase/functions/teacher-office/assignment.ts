type Json = Record<string, unknown>;
const uuid = (value: unknown): value is string => typeof value === "string"
  && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
const object = (value: unknown): value is Json => Boolean(value && typeof value === "object" && !Array.isArray(value));

// The entry point derives actor from its verified bearer and resolves buyer scope.
// All admission, terms, inventory and access writes remain in the SQL command.
export async function assignPurchasedSeat(client: any, actor: string, buyer: string, body: Json):
  Promise<{ status: number; body: Json }> {
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const seatId = body.seat_id;
  if (!uuid(actor) || !uuid(buyer) || !uuid(seatId) || !email || email.length > 320) {
    return { status: 400, body: { error: "A valid seat and recipient email are required." } };
  }
  try {
    const { data, error } = await client.rpc("assign_purchased_seat", {
      p_actor: actor, p_buyer: buyer, p_seat: seatId, p_email: email,
    });
    if (error) {
      if (error.code === "42501") return { status: 403, body: { error: "Seat management or recipient access is unavailable." } };
      if (error.code === "P0002") return { status: 404, body: { error: "Seat not found in this workspace." } };
      if (["22023", "23505", "23514", "22P02"].includes(error.code)) return { status: 409, body: {
        error: "This seat or recipient requires review. Refresh its recorded assignment; do not assign another recipient to the same seat.",
        error_code: "seat_assignment_review",
      } };
      return { status: 503, body: { error: "Seat assignment checking is temporarily unavailable. Retry the same seat and recipient.",
        error_code: "seat_assignment_unavailable" } };
    }
    const seat = object(data) && object(data.seat) ? data.seat : null;
    if (!object(data) || data.ok !== true || data.state !== "assigned" || typeof data.deduped !== "boolean"
      || !seat || seat.id !== seatId || seat.tenant_id !== buyer || seat.status !== "active"
      || !uuid(seat.assigned_user_id) || !uuid(seat.assigned_tenant_id)) {
      return { status: 503, body: { error: "The recorded assignment response is unavailable. Retry the same seat and recipient.",
        error_code: "seat_assignment_response_unavailable" } };
    }
    return { status: 200, body: { seat: {
      id: seat.id, status: seat.status, expires_at: seat.expires_at,
      assigned_at: seat.assigned_at, starts_at: seat.starts_at, ends_at: seat.ends_at,
      plan_id: seat.plan_id, product_id: seat.product_id, assigned_user_id: seat.assigned_user_id,
      assigned_user: { email }, plans: null,
    }, deduped: data.deduped } };
  } catch {
    return { status: 503, body: { error: "Seat assignment checking is temporarily unavailable. Retry the same seat and recipient.",
      error_code: "seat_assignment_unavailable" } };
  }
}
