import { useEffect, useState } from "react";
import {
  artifactPage,
  type ArtifactRow,
} from "../../../../packages/assessment-web/src/artifacts";
import type { Item } from "../../../../packages/assessment-core/src/mod.ts";
import { useAppT, useCodeText, useErrorText } from "../i18n/index.ts";
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
  const t = useAppT(), codeText = useCodeText(), problem = useErrorText();
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
          setError(problem(cause));
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
      <legend>{t("picker.media.legend")}</legend>
      <p className="hint">
        {t("picker.media.hint")}
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {busy && <p role="status">{t("picker.media.loading")}</p>}
      {value.map((media, index) => (
        <div className="author-row" key={`${media.artifact_id}:${index}`}>
          <label>
            {t("picker.media.alt", { kind: codeText("media.kind", media.kind), number: index + 1 })}
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
            aria-label={t("picker.media.removeLabel", { number: index + 1 })}
            onClick={() => onChange(value.filter((_, i) => i !== index))}
          >
            {t("picker.media.remove")}
          </button>
        </div>
      ))}
      <label>
        {t("picker.media.select")}
        <select
          value={selected}
          onChange={(event) => setSelected(event.target.value)}
          disabled={busy || value.length >= 20}
        >
          <option value="">{t("picker.media.choose")}</option>
          {ready.map((row) => (
            <option key={row.id} value={row.id}>
              {t("picker.media.option", { name: row.filename, kind: codeText("media.kind", row.kind) })}
            </option>
          ))}
        </select>
      </label>
      {!busy && !ready.length && (
        <p className="hint">
          {t("picker.media.none")}
        </p>
      )}
      <div className="author-actions">
        <button
          className="quiet"
          type="button"
          disabled={busy || !selected || value.length >= 20}
          onClick={add}
        >
          {t("picker.media.attach")}
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
          {t("picker.media.refresh")}
        </button>
        {cursor && (
          <button
            className="quiet"
            type="button"
            disabled={busy}
            onClick={() => setAfter(cursor)}
          >
            {t("picker.media.more")}
          </button>
        )}
      </div>
    </fieldset>
  );
}
