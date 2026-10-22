import {
  ContractError,
  uuid,
} from "../../../packages/assessment-core/src/mod.ts";
/** Purpose-separated reproducible bearer secret; only its digest enters SQL. */
export class InvitationSigner {
  private constructor(
    readonly active: string,
    private keys: Map<string, CryptoKey>,
  ) {}
  static async create(active: string, values: Record<string, unknown>) {
    if (
      !values || typeof values !== "object" || Array.isArray(values) ||
      !/^[-a-zA-Z0-9_]{1,80}$/.test(active)
    ) throw new Error("Invalid invitation key configuration");
    const keys = new Map<string, CryptoKey>();
    for (const [id, value] of Object.entries(values)) {
      if (
        !/^[-a-zA-Z0-9_]{1,80}$/.test(id) || typeof value !== "string" ||
        !/^[A-Za-z0-9_-]{43}$/.test(value)
      ) throw new Error("Invalid invitation key");
      const bytes = Uint8Array.from(
        atob(value.replaceAll("-", "+").replaceAll("_", "/") + "="),
        (c) => c.charCodeAt(0),
      );
      if (bytes.length !== 32) {
        throw new Error("Invitation keys must contain 32 bytes");
      }
      keys.set(
        id,
        await crypto.subtle.importKey(
          "raw",
          bytes,
          { name: "HMAC", hash: "SHA-256" },
          false,
          ["sign"],
        ),
      );
    }
    if (!keys.has(active)) throw new Error("Active invitation key is missing");
    return new InvitationSigner(active, keys);
  }
  async token(tenant: string, id: string, keyId = this.active) {
    const key = this.keys.get(keyId);
    if (!key) {
      throw new ContractError(
        "invitation_key_unavailable",
        "The original invitation key is unavailable. Ask an administrator to restore it or revoke and replace the invitation.",
        503,
      );
    }
    const bytes = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(
        `schood.assessment.invitation.v1|${uuid(tenant)}|${uuid(id)}`,
      ),
    );
    return btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll(
      "+",
      "-",
    ).replaceAll("/", "_").replaceAll("=", "");
  }
}
