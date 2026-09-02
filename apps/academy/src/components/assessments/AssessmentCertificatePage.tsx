import { useEffect, useState } from "react";
import { translate as t, useI18n } from "../../i18n";
import "./assessments.css";

type Verification = {
  status: "verified" | "private" | "withdrawn";
  issued_at: string;
  version: number;
  academy?: string;
  name?: string;
  title?: string;
  assessed_at?: string;
  score?: number | null;
};
export default function AssessmentCertificatePage() {
  useI18n();
  const token = new URLSearchParams(window.location.search).get("token") || "";
  const validToken = /^[0-9a-f-]{36}$/i.test(token);
  const [result, setResult] = useState<Verification | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    if (!validToken) return;
    const url = new URL(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/academy`,
    );
    url.searchParams.set("action", "assessment_verify_certificate");
    url.searchParams.set("token", token);
    fetch(url, {
      headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
      signal: controller.signal,
      cache: "no-store",
    }).then(async (response) => {
      if (!response.ok) {
        throw new Error(
          response.status === 404
            ? "Certificate not found"
            : "Verification is temporarily unavailable. Try again later.",
        );
      }
      setResult(await response.json() as Verification);
    }).catch((e: Error) => {
      if (e.name !== "AbortError") setError(e.message);
    });
    return () => controller.abort();
  }, [token, validToken]);
  return (
    <main className="assessment-services assessment-verification">
      <article className="assessment-report">
        <header>
          <span className="assessment-eyebrow">{"Schood Academy"}</span>
          <h1>{t("Mock-result verification")}</h1>
        </header>
        {!validToken
          ? <p role="alert">{t("Certificate not found")}</p>
          : error
          ? <p role="alert">{t(error)}</p>
          : !result
          ? <p aria-busy="true">{t("Checking certificate…")}</p>
          : (
            <>
              <h2>
                {t(
                  result.status === "verified"
                    ? "Verified Schood record"
                    : result.status === "withdrawn"
                    ? "Certificate withdrawn"
                    : "Private result",
                )}
              </h2>
              {result.status === "verified"
                ? (
                  <>
                    <h3>{result.name}</h3>
                    <p>{result.academy} · {result.title}</p>
                    <div className="assessment-report-result">
                      <div>
                        <span>{t("Assessment score")}</span>
                        <strong>
                          {result.score === null
                            ? t("Not assessed")
                            : `${result.score}%`}
                        </strong>
                      </div>
                      <div>
                        <span>{t("Assessment date")}</span>
                        <strong>{result.assessed_at?.slice(0, 10)}</strong>
                      </div>
                    </div>
                    <p>
                      {t("Issued")}: {result.issued_at.slice(0, 10)} ·{" "}
                      {t("Version")} {result.version}
                    </p>
                    <button
                      className="secondary-btn assessment-no-print"
                      onClick={() => window.print()}
                    >
                      {t("Print or save certificate")}
                    </button>
                  </>
                )
                : (
                  <p>
                    {t(
                      result.status === "private"
                        ? "The learner has not enabled public sharing. Ask them to share the result from My assessments."
                        : "This certificate is no longer valid. Ask the issuing center for the current report.",
                    )}
                  </p>
                )}
              <p className="assessment-caution">
                {t(
                  "This verifies a record issued by the named center through Schood. It does not certify CEFR proficiency, predict an IELTS band or replace an official examination result.",
                )}
              </p>
            </>
          )}
        <a className="assessment-no-print" href="/academies">
          {t("Open Academy")}
        </a>
      </article>
    </main>
  );
}
