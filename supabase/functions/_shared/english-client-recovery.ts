export type EnglishClientRecoveryEvent = {
  kind: "chunk_load" | "render_error";
  path: string;
  release: string;
  errorName: string;
};

const boundedText = (value: unknown, max: number): string =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

export const parseEnglishClientRecoveryEvent = (
  input: unknown,
): EnglishClientRecoveryEvent | null => {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const body = input as Record<string, unknown>;
  const kind = boundedText(body.kind, 32);
  if (kind !== "chunk_load" && kind !== "render_error") return null;

  const rawPath = boundedText(body.path, 200).split(/[?#]/, 1)[0];
  const path = rawPath.startsWith("/") && !/[\u0000-\u001f\u007f]/.test(rawPath)
    ? rawPath
    : "/";

  const rawRelease = boundedText(body.release, 64);
  const release = /^(?:[a-f0-9]{7,64}|local|unknown)$/i.test(rawRelease)
    ? rawRelease.toLowerCase()
    : "unknown";

  const rawErrorName = boundedText(body.error_name, 64);
  const errorName = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(rawErrorName)
    ? rawErrorName
    : "Error";

  return { kind, path, release, errorName };
};
