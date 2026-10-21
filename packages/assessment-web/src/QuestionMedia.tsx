import React, { useEffect, useId, useRef, useState } from "react";
import type { Item } from "../../assessment-core/src/mod.ts";
import { artifactUrl } from "./artifacts";
import { supabase } from "./client";
import "./media.css";
type Media = NonNullable<Item["media"]>[number];
function ProtectedMedia({
  media,
  tenant,
  actor,
  attempt,
  task,
  imageOverlay,
}: {
  media: Media;
  tenant: string;
  actor: string;
  attempt?: string;
  task?: string;
  imageOverlay?:(media:Media)=>React.ReactNode;
}) {
  const description = useId(),
    player = useRef<HTMLMediaElement | null>(null),
    [retry, setRetry] = useState(0),
    [state, setState] = useState<"loading" | "ready" | "error">("loading");
  let src = "",
    configurationError = "";
  try {
    src = artifactUrl(media.artifact_id, tenant, attempt, task);
  } catch (cause) {
    configurationError =
      cause instanceof Error ? cause.message : "Media is unavailable.";
  }
  // The parent keys this component by actor/tenant/attempt/artifact. Native
  // load/error events own readiness; a mount effect resetting it can overwrite
  // an already completed cached-image load and strand its interactive overlay.
  // Explicit retry sets loading before changing the native element's key.
  const failed = state === "error";
  useEffect(() => {
    const element = player.current;
    // Strict Mode replays effect cleanup while retaining the DOM node. Restore
    // its source on setup so the safety cleanup cannot strand a live player.
    if (element && element.getAttribute('src') !== src) {
      element.setAttribute('src',src);
      element.load();
    }
    return () => {
      // DOM removal alone is not a playback-stop guarantee. A paused/expired
      // attempt, section/account switch or error releases the native decoder.
      if (element) {
        element.pause();
        element.removeAttribute("src");
        element.load();
      }
    };
  }, [src, retry, failed]);
  return (
    <figure
      className="question-media"
      key={`${actor}:${attempt ?? "preview"}:${media.artifact_id}`}
    >
      {configurationError ? (
        <p className="error" role="alert">
          {configurationError}
        </p>
      ) : (
        <>
          {state === "loading" && <p role="status">Loading {media.kind}…</p>}
          {state === "error" ? (
            <div className="error" role="alert">
              <p>
                This {media.kind} could not be loaded. Access may have expired
                or playback may be unsupported.
              </p>
              <button
                type="button"
                className="quiet"
                onClick={() => {
                  setState("loading");
                  setRetry((value) => value + 1);
                }}
              >
                Retry {media.kind}
              </button>
            </div>
          ) : media.kind === "image" ? (
            <div className="question-image-stage"><img
              key={`${src}:${retry}`}
              src={src}
              crossOrigin="use-credentials"
              referrerPolicy="no-referrer"
              alt={media.alt}
              onLoad={() => setState("ready")}
              onError={() => setState("error")}
            />{state==='ready'&&imageOverlay?.(media)}</div>
          ) : media.kind === "audio" ? (
            <audio
              ref={element => {player.current = element;}}
              key={`${src}:${retry}`}
              src={src}
              crossOrigin="use-credentials"
              controls
              preload="metadata"
              aria-describedby={description}
              onLoadedMetadata={() => setState("ready")}
              onError={() => setState("error")}
            />
          ) : (
            <video
              ref={element => {player.current = element;}}
              key={`${src}:${retry}`}
              src={src}
              crossOrigin="use-credentials"
              controls
              playsInline
              preload="metadata"
              aria-describedby={description}
              onLoadedMetadata={() => setState("ready")}
              onError={() => setState("error")}
            />
          )}
        </>
      )}
      <figcaption id={description}>{media.alt}</figcaption>
    </figure>
  );
}
/** Account identity checked before native credentialed loads; canonical authority
 * checks current role, attempt, section and readiness on every range request. */
export function QuestionMedia({
  item,
  tenant,
  actor,
  attempt,
  task,
  enabled = true,
  imageOverlay,
}: {
  item: Pick<Item, "media"|"image_response">;
  tenant: string;
  actor: string;
  attempt?: string;
  task?: string;
  enabled?: boolean;
  imageOverlay?:(media:Media)=>React.ReactNode;
}) {
  const [authorized, setAuthorized] = useState("");
  useEffect(() => {
    setAuthorized("");
    if (!enabled || !supabase) return;
    let active = true,
      revision = 0;
    void supabase.auth.getSession().then(({ data }) => {
      if (active && !revision && data.session?.user.id === actor)
        setAuthorized(actor);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      revision++;
      if (active) setAuthorized(session?.user.id === actor ? actor : "");
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [actor, tenant, enabled]);
  if (!item.media?.length) return null;
  if (!enabled)
    return (
      <p className="hint">
        Question media is unavailable while this sitting is paused or
        disconnected from its active lease.
      </p>
    );
  if (authorized !== actor) return <p role="status">Checking media access…</p>;
  return (
    <div className="question-media-list">
      {item.media.filter(media=>media.artifact_id!==item.image_response?.artifact_id).map((media, index) => (
        <ProtectedMedia
          key={`${actor}:${tenant}:${attempt ?? task ?? "preview"}:${index}:${media.artifact_id}`}
          media={media}
          tenant={tenant}
          actor={actor}
          attempt={attempt}
          task={task}
          imageOverlay={imageOverlay}
        />
      ))}
    </div>
  );
}
