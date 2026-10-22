import type { QtiScan } from "../../../../packages/assessment-web/src/qti";
import { useAppT } from "../i18n/index.ts";
export function QtiScanResult({ scan }: { scan?: QtiScan | null }) {
  const t = useAppT();
  if (!scan) {
    return (
      <p>
        {t("scan.none")}
      </p>
    );
  }
  const passed = scan.verdict === "clean" && scan.byte_verified === true;
  const message = scan.reason === "historical_metadata"
    ? t("scan.historical")
    : scan.reason === "source_hash_mismatch"
    ? t("scan.mismatch")
    : scan.verdict === "rejected"
    ? t("scan.rejected")
    : passed
    ? t("scan.passed")
    : t("scan.unverified");
  return (
    <div>
      <h3>{t("scan.title")}</h3>
      <p role={passed ? "status" : "alert"}>{message}</p>
      <details>
        <summary>{t("scan.provenance")}</summary>
        <p>{t("scan.engine", { version: String(scan.engine_version ?? "") })}</p>
        <p>{t("scan.signature", { version: String(scan.signature_version ?? "") })}</p>
      </details>
    </div>
  );
}
