import { useEffect, useState } from "react";
import {
  artifactPage,
  type ArtifactRow,
} from "../../../../packages/assessment-web/src/artifacts";
import type { Item } from "../../../../packages/assessment-core/src/mod.ts";
type Media = NonNullable<Item["media"]>;
export function MediaPicker({
  tenant,
  actor,
  value,
  onChange,
}: {
  tenant: string;
  actor: string;
  value: Media;
  onChange: (value: Media) => void;
}) {
  const [rows, setRows] = useState<ArtifactRow[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [busy, setBusy] = useState(true),
    [error, setError] = useState(""),
    [selected, setSelected] = useState("");
  const [refresh, setRefresh] = useState(0),
    [after, setAfter] = useState<string | undefined>();
  useEffect(() => {
    let active = true;
    setBusy(true);
    setError("");
    void artifactPage(tenant, actor, after)
      .then((page) => {
        if (active) {
          setRows((old) =>
            after
              ? [
                  ...old,
                  ...page.items.filter(
                    (row) => !old.some((prior) => prior.id === row.id),
                  ),
                ]
              : page.items,
          );
          setCursor(page.next_cursor);
        }
      })
      .catch((cause) => {
        if (active) {
          setRows([]);
          setCursor(null);
          setError(cause.message);
        }
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [tenant, actor, refresh, after]);
  const ready = rows.filter(
    (row) =>
      row.state === "ready" &&
      row.kind !== "file" &&
      !value.some((media) => media.artifact_id === row.id),
  );
  function add() {
    const row = ready.find((row) => row.id === selected);
    if (row && row.kind !== "file") {
      onChange([...value, { artifact_id: row.id, kind: row.kind, alt: "" }]);
      setSelected("");
    }
  }
  return (
    <fieldset>
      <legend>Prompt images, audio and video</legend>
      <p className="hint">
        Upload files in Media library first. Only ready, scanned assets can be
        attached; question approval remains independent. Give images useful
        alternative text, and audio/video an equivalent description or
        transcript.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {busy && <p role="status">Loading scanned media…</p>}
      {value.map((media, index) => (
        <div className="author-row" key={`${media.artifact_id}:${index}`}>
          <label>
            {media.kind} alternative or transcript {index + 1} (required)
            <textarea
              required
              maxLength={1000}
              rows={3}
              value={media.alt}
              onChange={(event) =>
                onChange(
                  value.map((row, i) =>
                    i === index ? { ...row, alt: event.target.value } : row,
                  ),
                )
              }
            />
          </label>
          <button
            className="quiet"
            type="button"
            aria-label={`Remove prompt media ${index + 1}`}
            onClick={() => onChange(value.filter((_, i) => i !== index))}
          >
            Remove
          </button>
        </div>
      ))}
      <label>
        Scanned institution media
        <select
          value={selected}
          onChange={(event) => setSelected(event.target.value)}
          disabled={busy || value.length >= 20}
        >
          <option value="">Choose a ready file</option>
          {ready.map((row) => (
            <option key={row.id} value={row.id}>
              {row.filename} · {row.kind}
            </option>
          ))}
        </select>
      </label>
      {!busy && !ready.length && (
        <p className="hint">
          No unused ready images, audio or video on the loaded pages. Scan
          pending, rejected, cancelled and PDF files are not selectable.
        </p>
      )}
      <div className="author-actions">
        <button
          className="quiet"
          type="button"
          disabled={busy || !selected || value.length >= 20}
          onClick={add}
        >
          Attach selected media
        </button>
        <button
          className="quiet"
          type="button"
          disabled={busy}
          onClick={() => {
            setAfter(undefined);
            setRefresh((old) => old + 1);
          }}
        >
          Refresh ready media
        </button>
        {cursor && (
          <button
            className="quiet"
            type="button"
            disabled={busy}
            onClick={() => setAfter(cursor)}
          >
            Load more ready media
          </button>
        )}
      </div>
    </fieldset>
  );
}
