import type { QtiScan } from "../../../../packages/assessment-web/src/qti";
export function QtiScanResult({ scan }: { scan?: QtiScan | null }) {
  if (!scan) {
    return (
      <p>
        No security scan result is available yet. Uploading alone does not clear
        a package for import.
      </p>
    );
  }
  const passed = scan.verdict === "clean" && scan.byte_verified === true;
  const message = scan.reason === "historical_metadata"
    ? "Only historical scan metadata is available. Exact-byte security clearance has not been verified."
    : scan.reason === "source_hash_mismatch"
    ? "The package bytes did not match the declared source. Upload a fresh package; this source cannot be imported."
    : scan.verdict === "rejected"
    ? "Security scanning rejected this package because of malware or a scan-policy limit. It cannot be imported."
    : passed
    ? "Security scan passed for these exact package bytes. Content compatibility still requires separate review."
    : "Exact-byte security clearance has not been verified. This package cannot be adopted.";
  return (
    <div>
      <h3>Security scan</h3>
      <p role={passed ? "status" : "alert"}>{message}</p>
      <details>
        <summary>Scan provenance</summary>
        <p>Engine: {scan.engine_version}</p>
        <p>Signature snapshot: {scan.signature_version}</p>
      </details>
    </div>
  );
}
