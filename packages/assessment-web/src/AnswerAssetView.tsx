import React, { useEffect, useRef, useState } from "react";
import "./media-answer.css";
import type { AnswerAsset } from "./grading";
import { mediaAnswer } from "../../assessment-core/src/media-answer.ts";
import { artifactUrl } from "./artifacts";
import { observeAccount, supabase } from "./client";
import { QuestionMedia } from "./QuestionMedia";

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
      <p className="error" role="alert">
        The submitted media reference is invalid. Contact an assessment
        moderator; no mark should be recorded from this reference.
      </p>
    );
  }
  if (!asset || asset.id !== binding.artifact_id) {
    return (
      <p role="alert">
        The selected submission is unavailable. Ask an assessment moderator to
        investigate; it has not been converted into a zero score.
      </p>
    );
  }
  if (!enabled || authorized !== actor) {
    return <p role="status">Checking current access to the submitted media…</p>;
  }
  if (asset.state !== "ready") {
    return (
      <div role="status">
        <p>
          {asset.state === "uploading"
            ? "The selected answer is still uploading."
            : asset.state === "quarantined"
            ? "The selected answer is awaiting its safety and format checks."
            : "The selected answer did not become available for marking. An assessment moderator must investigate."}
        </p>
        <p className="hint">
          Marking is unavailable until the file is cleared. Refresh this
          response to check again. This state does not award a mark or
          invalidate the exam.
        </p>
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
        throw new Error(
          "The signed-in account or active task changed. Reopen this marking task.",
        );
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
        setError(
          cause instanceof Error
            ? cause.message
            : "The submission could not be downloaded.",
        );
      }
    } finally {
      if (alive.current) setChecking(false);
    }
  }
  return (
    <div className="answer-asset">
      <p className="hint">
        Safety checks passed · {asset.byte_length.toLocaleString()}{" "}
        bytes ({(asset.byte_length / 1048576).toLocaleString(undefined, {
          maximumFractionDigits: 3,
        })}{" "}
        MiB). The original filename and candidate profile are hidden; the answer
        content itself may still identify its author.
      </p>
      {asset.kind === "file"
        ? (
          <button
            type="button"
            className="quiet"
            disabled={checking}
            onClick={() => void download()}
          >
            {checking ? "Checking download access…" : "Download submitted PDF"}
          </button>
        )
        : (
          <QuestionMedia
            item={{
              media: [{
                artifact_id: asset.id,
                kind: asset.kind,
                alt: `Submitted ${asset.kind} answer`,
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
