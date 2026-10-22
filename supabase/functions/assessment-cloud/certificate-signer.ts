import {
  ContractError,
  object,
} from "../../../packages/assessment-core/src/mod.ts";
import {
  base64url,
  CERTIFICATE_FORMAT,
  certificateClaims,
  type CertificateEnvelope,
  certificateEnvelope,
  certificateKey,
  certificateMessage,
  certificatePayloadHash,
  unbase64url,
} from "../../../packages/assessment-core/src/certificates.ts";
interface SigningKey {
  id: string;
  privateKey: CryptoKey | null;
  publicKey: CryptoKey;
  jwk: JsonWebKey;
  revoked: boolean;
}
export class CertificateSigner {
  private constructor(
    private keys: Map<string, SigningKey>,
    public active: string,
  ) {}
  static async create(active: string, input: unknown) {
    certificateKey(active);
    if (!Array.isArray(input) || !input.length || input.length > 16) {
      throw new ContractError(
        "certificate_signing_unconfigured",
        "Certificate signing is not configured.",
        503,
      );
    }
    const keys = new Map<string, SigningKey>();
    for (const raw of input) {
      const row = object(raw),
        id = certificateKey(row.id),
        privateJwk = object(row.jwk) as JsonWebKey;
      if (
        keys.has(id) || (row.revoked!==undefined&&typeof row.revoked!=='boolean') || privateJwk.kty !== "OKP" ||
        privateJwk.crv !== "Ed25519" ||
        unbase64url(privateJwk.x, 100).length !== 32 ||
        (privateJwk.d !== undefined &&
          unbase64url(privateJwk.d, 100).length !== 32)
      ) {
        throw new ContractError(
          "certificate_signing_unconfigured",
          "Invalid certificate key configuration.",
          503,
        );
      }
      const publicJwk: JsonWebKey = {
        kty: "OKP",
        crv: "Ed25519",
        x: privateJwk.x,
      };
      const privateKey = privateJwk.d === undefined
          ? null
          : await crypto.subtle.importKey(
            "jwk",
            privateJwk,
            { name: "Ed25519" },
            false,
            ["sign"],
          ),
        publicKey = await crypto.subtle.importKey(
          "jwk",
          publicJwk,
          { name: "Ed25519" },
          false,
          ["verify"],
        );
      if (privateKey) {
        const probe = new TextEncoder().encode(
            "schood.certificate.configuration.probe",
          ),
          signature = await crypto.subtle.sign("Ed25519", privateKey, probe);
        if (
          !await crypto.subtle.verify("Ed25519", publicKey, signature, probe)
        ) {
          throw new ContractError(
            "certificate_signing_unconfigured",
            "Certificate key pair does not match.",
            503,
          );
        }
      }
      keys.set(id, {
        id,
        privateKey,
        publicKey,
        jwk: publicJwk,
        revoked: row.revoked === true,
      });
    }
    if (
      !keys.has(active) || keys.get(active)!.revoked ||
      !keys.get(active)!.privateKey
    ) {
      throw new ContractError(
        "certificate_signing_unconfigured",
        "Active certificate key is unavailable.",
        503,
      );
    }
    return new CertificateSigner(keys, active);
  }
  publicKeys() {
    return [...this.keys.values()].map((key) => ({
      id: key.id,
      jwk: key.jwk,
      revoked: key.revoked,
    }));
  }
  async sign(
    payloadText: string,
    id = this.active,
  ): Promise<CertificateEnvelope> {
    const key = this.keys.get(id);
    if (!key || key.revoked || !key.privateKey) {
      throw new ContractError(
        "certificate_signing_key_unavailable",
        "The pinned signing key is unavailable.",
        503,
      );
    }
    const envelope: CertificateEnvelope = {
      format: CERTIFICATE_FORMAT,
      key_id: id,
      payload: base64url(new TextEncoder().encode(payloadText)),
      signature: "",
    };
    certificateClaims(envelope.payload);
    return {
      ...envelope,
      signature: base64url(
        new Uint8Array(
          await crypto.subtle.sign(
            "Ed25519",
            key.privateKey,
            certificateMessage(envelope),
          ),
        ),
      ),
    };
  }
  async verify(value: unknown) {
    const envelope = certificateEnvelope(value),
      key = this.keys.get(envelope.key_id);
    if (!key || key.revoked) {
      throw new ContractError(
        "certificate_key_untrusted",
        "The certificate signing key is unavailable or revoked.",
        422,
      );
    }
    if (
      !await crypto.subtle.verify(
        "Ed25519",
        key.publicKey,
        unbase64url(envelope.signature),
        certificateMessage(envelope),
      )
    ) {
      throw new ContractError(
        "certificate_signature_invalid",
        "The certificate signature does not match.",
        422,
      );
    }
    const claims = certificateClaims(envelope.payload),
      payloadText = new TextDecoder("utf-8", { fatal: true }).decode(
        unbase64url(envelope.payload),
      );
    return {
      envelope,
      claims,
      payloadHash: await certificatePayloadHash(payloadText),
    };
  }
}
