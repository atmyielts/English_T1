import React, { useEffect, useRef, useState } from "react";
import "./media-answer.css";
import type { AnswerAsset } from "./grading";
import { mediaAnswer } from "../../assessment-core/src/media-answer.ts";
import { artifactUrl } from "./artifacts";
import { observeAccount, supabase } from "./client";
import { QuestionMedia } from "./QuestionMedia";
import { useI18n } from "../../service-i18n/src/i18n.tsx";
import { LocalizedError, messageText } from "./i18n/translate.ts";
import { useWebT } from "./i18n/useWebT.ts";

export function AnswerAssetView(
  { response, asset, tenant, actor, task, enabled = true }: {
    response: unknown;
    asset?: AnswerAsset | null;
    tenant: string;
    actor: string;
    task: string;
    enabled?: boolean;
  },
) {
  const t = useWebT(), { number } = useI18n();
  const [authorized, setAuthorized] = useState(""),
    [error, setError] = useState(""),
    [checking, setChecking] = useState(false),
    alive = useRef(false);
  const current = useRef({ actor, task, tenant, enabled, authorized });
  current.current = { actor, task, tenant, enabled, authorized };
  useEffect(() => {
    alive.current = true;
    setAuthorized("");
    const stop = observeAccount((value) => {
      if (alive.current) setAuthorized(value);
    });
    return () => {
      alive.current = false;
      stop();
    };
  }, [actor, tenant, task]);
  let binding: ReturnType<typeof mediaAnswer>;
  try {
    binding = mediaAnswer(response);
  } catch {
    return (
      <p className="error" role="alert">{t("asset.invalidReference")}</p>
    );
  }
  if (!asset || asset.id !== binding.artifact_id) {
    return (
      <p role="alert">{t("asset.unavailable")}</p>
    );
  }
  if (!enabled || authorized !== actor) {
    return <p role="status">{t("asset.checking")}</p>;
  }
  if (asset.state !== "ready") {
    return (
      <div role="status">
        <p>
          {t(
            asset.state === "uploading"
              ? "asset.uploading"
              : asset.state === "quarantined"
              ? "asset.quarantined"
              : "asset.notAvailable",
          )}
        </p>
        <p className="hint">{t("asset.markingBlocked")}</p>
      </div>
    );
  }
  async function download() {
    if (checking || !enabled || !supabase || !asset) return;
    setChecking(true);
    setError("");
    try {
      const { data } = await supabase.auth.getSession();
      const latest = current.current;
      if (
        !alive.current || !latest.enabled || latest.actor !== actor ||
        latest.task !== task || latest.tenant !== tenant ||
        latest.authorized !== actor || data.session?.user.id !== actor
      ) {
        throw new LocalizedError("asset.accountChanged");
      }
      // Let the browser stream the attachment, not a multi-GiB JavaScript Blob.
      // No bearer token or original filename is embedded in the address.
      const link = document.createElement("a");
      link.href = artifactUrl(asset.id, tenant, undefined, task);
      link.download = "assessment-answer.pdf";
      link.rel = "noreferrer";
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (cause) {
      if (alive.current) {
        setError(messageText(cause, t, "asset.downloadFailed"));
      }
    } finally {
      if (alive.current) setChecking(false);
    }
  }
  return (
    <div className="answer-asset">
      <p className="hint">
        {t("asset.passed", {
          bytes: number(asset.byte_length),
          mib: number(asset.byte_length / 1048576, {
            maximumFractionDigits: 3,
          }),
        })}
      </p>
      {asset.kind === "file"
        ? (
          <button
            type="button"
            className="quiet"
            disabled={checking}
            onClick={() => void download()}
          >
            {t(checking ? "asset.checkingDownload" : "asset.download")}
          </button>
        )
        : (
          <QuestionMedia
            item={{
              media: [{
                artifact_id: asset.id,
                kind: asset.kind,
                alt: t(`asset.alt.${asset.kind}` as const),
              }],
            }}
            tenant={tenant}
            actor={actor}
            task={task}
          />
        )} {error && <p role="alert" className="error">{error}</p>}
    </div>
  );
}
